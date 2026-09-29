import { validateWestSalesRows, type WestSalesEvidence } from "./west-sales";

export const SALES_EVIDENCE_COLUMNS = ["event_id", "region", "venue_name", "city", "state", "public_capacity", "event_name", "show_date", "tickets_sold_cumulative", "tickets_target_cumulative", "data_as_of", "market_signals", "origin"] as const;
export const SALES_EVIDENCE_SQL = `SELECT ${SALES_EVIDENCE_COLUMNS.join(", ")}
FROM workspace.livenation_demo.current_sales_evidence
WHERE region = :region AND origin = 'synthetic' AND data_as_of >= :fresh_after
ORDER BY event_id`;

export type StatementResponse = {
  statement_id?: string;
  status?: { state?: string };
  result?: { data_array?: unknown[][] };
  manifest?: { truncated?: boolean; schema?: { columns?: Array<{ name?: string }> } };
};
export type DatabricksCommand = (args: string[], body: unknown | undefined, timeoutMs: number, signal?: AbortSignal) => Promise<StatementResponse>;

function waitForPoll(delayMs: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (!signal) return Bun.sleep(delayMs);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, delayMs);
    function done(): void {
      signal?.removeEventListener("abort", abort);
      resolve();
    }
    function abort(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason ?? new DOMException("The operation was aborted.", "AbortError"));
    }
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

async function runDatabricks(args: string[], body: unknown | undefined, timeoutMs: number, signal?: AbortSignal): Promise<StatementResponse> {
  signal?.throwIfAborted();
  const command = Bun.spawn(["databricks", ...args], { stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => command.kill(), timeoutMs);
  const abort = () => command.kill();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  try {
    const exitCode = await command.exited;
    signal?.throwIfAborted();
    const stdout = await new Response(command.stdout).text();
    const stderr = await new Response(command.stderr).text();
    if (exitCode !== 0) throw new Error(`Databricks command failed: ${stderr.trim()}`);
    return JSON.parse(stdout) as StatementResponse;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

function commandArgs(method: "get" | "post", path: string, profile: string, body?: unknown): string[] {
  const args = ["api", method, path, "--profile", profile, "--output", "json"];
  if (body !== undefined) args.push("--json", JSON.stringify(body));
  return args;
}

function decode(response: StatementResponse, now: Date): WestSalesEvidence[] {
  if (response.manifest?.truncated) throw new Error("Databricks result was truncated");
  const columns = response.manifest?.schema?.columns?.map((column) => column.name);
  if (!columns || JSON.stringify(columns) !== JSON.stringify(SALES_EVIDENCE_COLUMNS)) throw new Error("Databricks result schema does not match evidence contract");
  const sourceRows = response.result?.data_array;
  if (!sourceRows) throw new Error("Databricks result omitted data rows");
  if (sourceRows.length === 0) return [];
  const objects = sourceRows.map((values) => {
    if (!Array.isArray(values) || values.length !== SALES_EVIDENCE_COLUMNS.length) throw new Error("Databricks row has an invalid column count");
    const row = Object.fromEntries(SALES_EVIDENCE_COLUMNS.map((column, index) => [column, values[index]]));
    for (const key of ["public_capacity", "tickets_sold_cumulative", "tickets_target_cumulative"] as const) {
      if (typeof row[key] !== "string" || !/^-?\d+(?:\.\d+)?$/.test(row[key])) throw new Error(`${key} must be a numeric string`);
      row[key] = Number(row[key]);
    }
    if (typeof row.market_signals !== "string") throw new Error("market_signals must be JSON text");
    try { row.market_signals = JSON.parse(row.market_signals); } catch { throw new Error("market_signals must be valid JSON"); }
    if (!Array.isArray(row.market_signals) || row.market_signals.some((item) => typeof item !== "string")) throw new Error("market_signals must be a string array");
    if (typeof row.data_as_of !== "string") throw new Error("data_as_of must be text");
    if (/^\d{4}-\d{2}-\d{2} /.test(row.data_as_of)) row.data_as_of = `${row.data_as_of.replace(" ", "T")}Z`;
    return row;
  });
  return validateWestSalesRows(objects, now, 6);
}

export class DatabricksSalesAdapter {
  constructor(private readonly options: { command?: DatabricksCommand; profile: string; warehouseId: string; timeoutMs?: number }) {}
  private get command() { return this.options.command ?? runDatabricks; }
  async read(now = new Date(), signal?: AbortSignal): Promise<WestSalesEvidence[]> {
    const started = Date.now(); const deadline = started + (this.options.timeoutMs ?? 55_000);
    const remaining = () => Math.max(1, deadline - Date.now());
    const body = { warehouse_id: this.options.warehouseId, statement: SALES_EVIDENCE_SQL, disposition: "INLINE", format: "JSON_ARRAY", row_limit: 25, byte_limit: 65536, wait_timeout: "50s", on_wait_timeout: "CONTINUE", session_timezone: "UTC", parameters: [{ name: "region", value: "west", type: "STRING" }, { name: "fresh_after", value: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), type: "TIMESTAMP" }] };
    signal?.throwIfAborted();
    let response = await this.command(commandArgs("post", "/api/2.0/sql/statements", this.options.profile, body), body, remaining(), signal);
    try {
      signal?.throwIfAborted();
      while (response.status?.state === "PENDING" || response.status?.state === "RUNNING") {
        signal?.throwIfAborted();
        if (!response.statement_id || Date.now() >= deadline) {
          if (response.statement_id) await this.command(commandArgs("post", `/api/2.0/sql/statements/${response.statement_id}/cancel`, this.options.profile, {}), {}, 5_000);
          throw new Error("Databricks statement timed out");
        }
        await waitForPoll(Math.min(100, remaining()), signal);
        response = await this.command(commandArgs("get", `/api/2.0/sql/statements/${response.statement_id}`, this.options.profile), undefined, remaining(), signal);
        signal?.throwIfAborted();
      }
    } catch (error) {
      if (signal?.aborted && response.statement_id) {
        try { await this.command(commandArgs("post", `/api/2.0/sql/statements/${response.statement_id}/cancel`, this.options.profile, {}), {}, 5_000); } catch {}
      }
      throw error;
    }
    if (response.status?.state !== "SUCCEEDED") throw new Error(`Databricks statement failed with ${response.status?.state ?? "unknown state"}`);
    return decode(response, now);
  }
}
