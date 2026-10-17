import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const TERMINAL_STATES = new Set(["SUCCEEDED", "FAILED", "CANCELED", "CLOSED"]);

export type SqlParameter = { name: string; value: string; type?: string };
export type StatementResult = { statementId: string; columns: string[]; rows: (string | null)[][] };

type StatementResponse = {
  statement_id?: string;
  status?: { state?: string; error?: { message?: string } };
  manifest?: { truncated?: boolean; total_chunk_count?: number; total_row_count?: number; schema?: { column_count?: number; columns?: Array<{ name?: string }> } };
  result?: { data_array?: unknown[][]; next_chunk_index?: number; next_chunk_internal_link?: string; external_links?: unknown[] };
};

export type StatementTransport = (args: string[], body: unknown | undefined, timeoutMs: number) => Promise<StatementResponse>;
export type DatabricksJsonRequest = (args: string[], body: unknown | undefined, options: { timeoutMs: number; maxBytes: number; signal?: AbortSignal }) => Promise<unknown>;
type Event = { kind: string; statementId?: string; state?: string; [key: string]: unknown };
type Options = {
  profile: string;
  warehouseId: string;
  onEvent?: (event: Event) => Promise<void>;
  transport?: StatementTransport;
  clock?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  executionDeadlineMs?: number;
  reconciliationDeadlineMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
};

function genericFailure(action: string): Error {
  return new Error(`Databricks ${action} failed. Check the local CLI profile and statement journal.`);
}

async function readBounded(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Databricks command output exceeded the configured limit");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function runCli(args: string[], body: unknown | undefined, timeoutMs: number, maxBytes = MAX_OUTPUT_BYTES, signal?: AbortSignal): Promise<StatementResponse> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Databricks command timeout must be a positive finite number");
  let directory: string | undefined;
  let payloadPath: string | undefined;
  const commandArgs = [...args];
  try {
    if (body !== undefined) {
      directory = await mkdtemp(join(tmpdir(), "livenation-databricks-"));
      await chmod(directory, 0o700);
      payloadPath = join(directory, "request.json");
      await writeFile(payloadPath, JSON.stringify(body), { mode: 0o600 });
      await chmod(payloadPath, 0o600);
      commandArgs.push("--json", `@${payloadPath}`);
    }
    if (signal?.aborted) throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
    const process = Bun.spawn(["databricks", ...commandArgs], { stdout: "pipe", stderr: "pipe" });
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const terminate = () => {
      process.kill("SIGTERM");
      killTimer ??= setTimeout(() => process.kill("SIGKILL"), 2_000);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);
    const abort = () => terminate();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const stdout = readBounded(process.stdout, maxBytes);
    const stderr = readBounded(process.stderr, maxBytes);
    try {
      const [code, output] = await Promise.all([process.exited, stdout, stderr]);
      if (signal?.aborted) throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
      if (timedOut) throw genericFailure("command deadline");
      if (code !== 0) throw genericFailure("command");
      try { return JSON.parse(output) as StatementResponse; } catch { throw genericFailure("JSON response parsing"); }
    } catch (error) {
      process.kill("SIGKILL");
      await process.exited.catch(() => undefined);
      if (error instanceof Error && error.message.includes("configured limit")) throw error;
      if (signal?.aborted) throw error;
      throw error instanceof Error && error.message.startsWith("Databricks ") ? error : genericFailure("command");
    } finally {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener("abort", abort);
    }
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}

/** Runs a GET-only Databricks REST metadata command with a wall-clock deadline and bounded output. */
export async function runDatabricksJson(args: string[], options: { timeoutMs?: number; maxBytes?: number } = {}): Promise<any> {
  if (args[0] !== "api" || args[1] !== "get" || args.includes("--json")) throw new Error("runDatabricksJson accepts only body-free Databricks API GET commands");
  return runCli(args, undefined, options.timeoutMs ?? 30_000, Math.min(options.maxBytes ?? MAX_OUTPUT_BYTES, MAX_OUTPUT_BYTES));
}

/** Runs one bounded Databricks REST GET or POST command without exposing CLI credentials. */
export const runDatabricksJsonRequest: DatabricksJsonRequest = async (args, body, options) => {
  if (args[0] !== "api" || !["get", "post"].includes(args[1] ?? "")) throw new Error("runDatabricksJsonRequest accepts only Databricks API GET or POST commands");
  if (args[1] === "get" && body !== undefined) throw new Error("Databricks API GET commands cannot have a body");
  if (args.includes("--json")) throw new Error("runDatabricksJsonRequest owns the JSON request body");
  const maxBytes = Math.min(options.maxBytes, MAX_OUTPUT_BYTES);
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new Error("Databricks JSON response limit is invalid");
  return runCli(args, body, options.timeoutMs, maxBytes, options.signal);
};

function apiArgs(method: "get" | "post", path: string, profile: string): string[] {
  return ["api", method, path, "--profile", profile, "--output", "json"];
}

function decode(response: StatementResponse, statementId: string, sql: string): StatementResult {
  if (response.manifest?.truncated) throw new Error(`Databricks statement ${statementId} returned a truncated result`);
  if ((response.manifest?.total_chunk_count ?? 1) > 1 || response.result?.next_chunk_index !== undefined || response.result?.next_chunk_internal_link || response.result?.external_links?.length) {
    throw new Error(`Databricks statement ${statementId} returned multiple result chunks`);
  }
  const columns = response.manifest?.schema?.columns?.map((column) => column.name);
  const data = response.result?.data_array;
  const total = response.manifest?.total_row_count;
  const columnCount = response.manifest?.schema?.column_count;
  if (total !== undefined && (!Number.isInteger(total) || total < 0)) throw new Error(`Databricks statement ${statementId} returned an invalid row count`);
  if (columnCount !== undefined && (!Number.isInteger(columnCount) || columnCount < 0)) throw new Error(`Databricks statement ${statementId} returned an invalid column count`);
  if (!columns && !data && total === 0 && columnCount === 0) return { statementId, columns: [], rows: [] };
  if (!columns && !data && total === undefined && /^(?:CREATE|MERGE)\b/i.test(sql.trim())) return { statementId, columns: [], rows: [] };
  if (!columns || columns.some((column) => typeof column !== "string")) throw new Error(`Databricks statement ${statementId} returned an incomplete result`);
  if (!data && total === 0) return { statementId, columns, rows: [] };
  if (!data) throw new Error(`Databricks statement ${statementId} returned an incomplete result`);
  if (total !== undefined && data.length !== total) throw new Error(`Databricks statement ${statementId} returned an incomplete result`);
  const rows = data.map((row) => {
    if (!Array.isArray(row) || row.length !== columns.length || row.some((value) => typeof value !== "string" && value !== null)) throw new Error(`Databricks statement ${statementId} returned an invalid result row`);
    return row as (string | null)[];
  });
  return { statementId, columns, rows };
}

function failedDiagnostic(message: unknown): string | undefined {
  if (typeof message !== "string" || !message.trim()) return undefined;
  return message
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/\b(token|secret|password|api[_-]?key|authorization)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, 600);
}

export class DatabricksStatements {
  private readonly clock: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly transport: StatementTransport;
  constructor(private readonly options: Options) {
    this.clock = options.clock ?? Date.now;
    this.sleep = options.sleep ?? Bun.sleep;
    this.transport = options.transport ?? runCli;
  }

  async execute(sql: string, parameters: SqlParameter[] = []): Promise<StatementResult> {
    const executionDeadline = this.clock() + (this.options.executionDeadlineMs ?? 120_000);
    const reconciliationMs = this.options.reconciliationDeadlineMs ?? 30_000;
    const event = async (value: Event) => this.options.onEvent?.(value);
    let statementId: string | undefined;
    let response: StatementResponse | undefined;
    let timedOut = false;
    let interrupted = false;
    let recordedPollRetry = false;
    let skipStateEvent = false;
    const remaining = (deadline: number) => Math.max(1, deadline - this.clock());
    const requestTimeout = (deadline: number) => Math.min(15_000, remaining(deadline));
    const abortReason = () => this.options.signal?.reason ?? new DOMException("The operation was aborted.", "AbortError");
    const body = {
      warehouse_id: this.options.warehouseId,
      statement: sql,
      parameters: parameters.map(({ name, value, type }) => type ? { name, value, type } : { name, value }),
      disposition: "INLINE",
      format: "JSON_ARRAY",
      row_limit: 1000,
      byte_limit: 1024 * 1024,
      wait_timeout: "0s",
      on_wait_timeout: "CONTINUE",
    };
    try {
      if (this.options.signal?.aborted) throw abortReason();
      await event({ kind: "submission_intent" });
      response = await this.transport(apiArgs("post", "/api/2.0/sql/statements", this.options.profile), body, requestTimeout(executionDeadline));
      statementId = response.statement_id;
      if (!statementId) throw new Error("Databricks statement submission outcome is unknown; do not retry until reconciliation");
      await event({ kind: "statement_id", statementId });
      while (!TERMINAL_STATES.has(response.status?.state ?? "")) {
        if (this.options.signal?.aborted) { interrupted = true; break; }
        if (this.clock() >= executionDeadline) { timedOut = true; break; }
        if (!skipStateEvent) await event({ kind: "state", statementId, state: response.status?.state ?? "UNKNOWN" });
        skipStateEvent = false;
        await this.sleep(Math.min(this.options.pollIntervalMs ?? 1_000, remaining(executionDeadline)));
        if (this.options.signal?.aborted) { interrupted = true; break; }
        if (this.clock() >= executionDeadline) { timedOut = true; break; }
        try {
          response = await this.transport(apiArgs("get", `/api/2.0/sql/statements/${statementId}`, this.options.profile), undefined, requestTimeout(executionDeadline));
          skipStateEvent = false;
        } catch (error) {
          if (error instanceof Error && error.message.includes("configured limit")) throw error;
          if (this.options.signal?.aborted) { interrupted = true; break; }
          if (this.clock() >= executionDeadline) { timedOut = true; break; }
          skipStateEvent = true;
          if (!recordedPollRetry) {
            recordedPollRetry = true;
            await event({ kind: "poll_retry", statementId, failure_class: "poll_transport" });
          }
        }
      }
    } catch (error) {
      if (this.options.signal?.aborted && !statementId) throw abortReason();
      if (!statementId) throw error instanceof Error && error.message.includes("unknown") ? error : new Error("Databricks statement submission outcome is unknown; do not retry until reconciliation");
      timedOut = true;
    }
    if (!statementId) throw new Error("Databricks statement submission outcome is unknown; do not retry until reconciliation");
    if (timedOut || interrupted || !TERMINAL_STATES.has(response?.status?.state ?? "")) {
      const reconcileDeadline = this.clock() + reconciliationMs;
      try { await this.transport(apiArgs("post", `/api/2.0/sql/statements/${statementId}/cancel`, this.options.profile), {}, Math.min(5_000, requestTimeout(reconcileDeadline))); } catch {}
      while (this.clock() < reconcileDeadline) {
        try {
          response = await this.transport(apiArgs("get", `/api/2.0/sql/statements/${statementId}`, this.options.profile), undefined, requestTimeout(reconcileDeadline));
          await event({ kind: "state", statementId, state: response.status?.state ?? "UNKNOWN" });
          if (TERMINAL_STATES.has(response.status?.state ?? "")) break;
        } catch {}
        await this.sleep(Math.min(this.options.pollIntervalMs ?? 1_000, remaining(reconcileDeadline)));
      }
      const state = response?.status?.state;
      if (!TERMINAL_STATES.has(state ?? "")) throw new Error(`Databricks statement ${statementId} has an unknown outcome; do not retry until reconciliation`);
      if (interrupted) throw new Error(`Databricks statement ${statementId} was interrupted after cancellation; terminal state is ${state}`);
      throw new Error(`Databricks statement ${statementId} timed out after cancellation; terminal state is ${state}`);
    }
    const state = response.status?.state;
    await event({ kind: "state", statementId, state });
    if (state !== "SUCCEEDED") {
      const diagnostic = failedDiagnostic(response.status?.error?.message);
      throw new Error(`Databricks statement ${statementId} ended with ${state ?? "UNKNOWN"}${diagnostic ? `: ${diagnostic}` : ""}`);
    }
    return decode(response, statementId, sql);
  }
}
