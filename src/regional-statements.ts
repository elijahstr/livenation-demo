import { runDatabricksJsonRequest, type DatabricksJsonRequest, type SqlParameter, type StatementResult } from "./databricks-statements";
import type { QueryTrace, ReadContext } from "./regional-types";

export type RegionalStatementResponse = {
  statement_id?: string;
  status?: { state?: string; error?: { message?: string } };
  manifest?: { truncated?: boolean; total_chunk_count?: number; total_row_count?: number; schema?: { columns?: Array<{ name?: string }> } };
  result?: { chunk_index?: number; row_offset?: number; row_count?: number; data_array?: unknown[][]; next_chunk_index?: number; next_chunk_internal_link?: string; external_links?: unknown[] };
};

type RegionalStatementsOptions = { profile: string; warehouseId: string; request?: DatabricksJsonRequest };
const terminal = new Set(["SUCCEEDED", "FAILED", "CANCELED", "CLOSED"]);
const maxRows = 1000;
const maxBytes = 1024 * 1024;
const statementIdPattern = /^[A-Za-z0-9_-]{1,256}$/;

function deadline(context: ReadContext): number {
  const remaining = context.deadlineAt - Date.now();
  if (remaining <= 5_000) throw new Error("Regional statement deadline reserve reached");
  return Math.min(15_000, remaining - 5_000);
}
async function trace(context: ReadContext, value: QueryTrace): Promise<void> { await context.onTrace?.(value); }
function failure(response: RegionalStatementResponse, id: string): never {
  const state = response.status?.state ?? "UNKNOWN";
  throw new Error(`Regional statement ${id} ended with ${state}`);
}

function resultOf(value: RegionalStatementResponse): NonNullable<RegionalStatementResponse["result"]> {
  return (value.result ?? value) as NonNullable<RegionalStatementResponse["result"]>;
}

/** Validates ordered inline chunks. The caller owns only the documented chunk endpoint. */
export function collectRegionalChunks(initial: RegionalStatementResponse, chunks: RegionalStatementResponse[]): (string | null)[][] {
  const manifest = initial.manifest;
  const count = manifest?.total_chunk_count ?? 1;
  const total = manifest?.total_row_count;
  if (!Number.isInteger(count) || count < 1 || count !== chunks.length + 1 || !Number.isInteger(total) || total < 0) throw new Error("Regional statement chunk manifest is incomplete");
  const combined: (string | null)[][] = [];
  let expectedOffset = 0;
  for (const [index, response] of [initial, ...chunks].entries()) {
    const result = resultOf(response);
    if (result.external_links?.length) throw new Error("Regional statement returned an external result URL");
    if (result.chunk_index !== undefined && result.chunk_index !== index) throw new Error("Regional statement chunk index is invalid");
    if (result.row_offset !== undefined && result.row_offset !== expectedOffset) throw new Error("Regional statement chunk offset is invalid");
    if (!Array.isArray(result.data_array) || (result.row_count !== undefined && result.row_count !== result.data_array.length)) throw new Error("Regional statement chunk is missing data");
    if (index < count - 1 && result.next_chunk_index !== index + 1) throw new Error("Regional statement chunk sequence is incomplete");
    if (index === count - 1 && result.next_chunk_index !== undefined) throw new Error("Regional statement returned an unexpected next chunk");
    combined.push(...result.data_array as (string | null)[][]);
    expectedOffset = combined.length;
  }
  if (combined.length !== total || combined.length > maxRows) throw new Error("Regional statement chunk row count is invalid");
  return combined;
}

/** A bounded, no-retry statement client for new regional read paths. */
export class RegionalStatements {
  constructor(private readonly options: RegionalStatementsOptions) {}

  async execute(sql: string, parameters: SqlParameter[], context: ReadContext): Promise<StatementResult> {
    context.signal?.throwIfAborted();
    const start = Date.now();
    context = { ...context, deadlineAt: Math.min(context.deadlineAt, start + 45_000) };
    deadline(context);
    let cleanupUntil = 0;
    const request = async (method: "get" | "post", path: string, body?: unknown, cleanup = false): Promise<RegionalStatementResponse> => {
      const timeoutMs = cleanup ? Math.min(5000, cleanupUntil - Date.now()) : deadline(context);
      if (timeoutMs <= 0) throw new Error("Regional statement cleanup deadline expired");
      await trace(context, { kind: "regional_statement_request", method, operation: path.endsWith("/cancel") ? "cancel" : method === "post" ? "submit" : path.includes("/chunks/") ? "chunk" : "poll" });
      const submit = method === "post" && path === "/api/2.0/sql/statements";
      // Finish a bounded submission even if its browser leaves, so its ID can be canceled.
      const response = await (this.options.request ?? runDatabricksJsonRequest)(["api", method, path, "--profile", this.options.profile, "--output", "json"], body, { timeoutMs, maxBytes, ...(cleanup || submit ? {} : { signal: context.signal }) });
      return response as RegionalStatementResponse;
    };
    await trace(context, { kind: "regional_statement_submission_intent" });
    let response: RegionalStatementResponse;
    try {
      response = await request("post", "/api/2.0/sql/statements", {
        warehouse_id: this.options.warehouseId, statement: sql,
        parameters: parameters.map(({ name, value, type }) => type ? { name, value, type } : { name, value }),
        disposition: "INLINE", format: "JSON_ARRAY", row_limit: maxRows, byte_limit: maxBytes, wait_timeout: "0s", on_wait_timeout: "CONTINUE",
      });
    } catch { throw new Error("Regional statement submission outcome is unknown; do not retry"); }
    const statementId = response.statement_id;
    if (!statementId || !statementIdPattern.test(statementId)) throw new Error("Regional statement submission outcome is unknown; do not retry");
    await trace(context, { kind: "regional_statement_id", statementId });
    try {
      while (!terminal.has(response.status?.state ?? "")) {
        context.signal?.throwIfAborted();
        if (Date.now() >= context.deadlineAt) throw new Error("Regional statement deadline expired");
        await Bun.sleep(Math.min(1_000, deadline(context)));
        response = await request("get", `/api/2.0/sql/statements/${statementId}`);
      }
    } catch (error) {
      cleanupUntil = Math.min(context.deadlineAt, Date.now() + 5000);
      try { await request("post", `/api/2.0/sql/statements/${statementId}/cancel`, {}, true); } catch {}
      let reconciled = false;
      while (Date.now() < cleanupUntil) {
        try {
          const state = await request("get", `/api/2.0/sql/statements/${statementId}`, undefined, true);
          if (terminal.has(state.status?.state ?? "")) {
            await trace(context, { kind: "regional_statement_terminal", statementId, state: state.status?.state, elapsed_ms: Date.now() - start });
            reconciled = true; break;
          }
        } catch { break; }
        await Bun.sleep(Math.min(200, Math.max(0, cleanupUntil - Date.now())));
      }
      if (!reconciled) throw new Error(`Regional statement ${statementId} has an unknown outcome; do not retry`);
      throw context.signal?.aborted ? context.signal.reason ?? error : error;
    }
    await trace(context, { kind: "regional_statement_terminal", statementId, state: response.status?.state, elapsed_ms: Date.now() - start });
    if (response.status?.state !== "SUCCEEDED") failure(response, statementId);
    if (response.manifest?.truncated) throw new Error(`Regional statement ${statementId} returned a truncated result`);
    const chunks = response.manifest?.total_chunk_count ?? 1;
    const result = response.result;
    const columns = response.manifest?.schema?.columns?.map(column => column.name);
    if (response.manifest?.total_row_count === 0 && !result?.data_array?.length && (chunks === 0 || chunks === 1) &&
      !result?.external_links?.length && result?.next_chunk_index === undefined && columns?.every((column): column is string => typeof column === "string")) {
      return { statementId, columns, rows: [] };
    }
    if (!Number.isInteger(chunks) || chunks < 1 || chunks > maxRows || result?.external_links?.length) throw new Error(`Regional statement ${statementId} returned invalid result chunks`);
    if (!columns?.every((column): column is string => typeof column === "string")) {
      if ((response.manifest?.total_row_count ?? -1) === 0) return { statementId, columns: [], rows: [] };
      throw new Error(`Regional statement ${statementId} returned an incomplete result`);
    }
    const chunkResponses: RegionalStatementResponse[] = [];
    let combinedBytes = Buffer.byteLength(JSON.stringify(result?.data_array ?? []));
    for (let index = 1; index < chunks; index++) {
      if (Date.now() >= context.deadlineAt) throw new Error("Regional statement deadline expired before chunk retrieval");
      const chunk = await request("get", `/api/2.0/sql/statements/${statementId}/result/chunks/${index}`);
      combinedBytes += Buffer.byteLength(JSON.stringify(resultOf(chunk).data_array ?? []));
      if (combinedBytes > maxBytes) throw new Error(`Regional statement ${statementId} exceeded the configured byte limit`);
      chunkResponses.push(chunk);
      await trace(context, { kind: "regional_statement_chunk", statementId, chunk_index: index });
    }
    const rows = collectRegionalChunks(response, chunkResponses);
    if (new TextEncoder().encode(JSON.stringify(rows)).byteLength > maxBytes) throw new Error(`Regional statement ${statementId} exceeded the configured byte limit`);
    const validated = rows.map(row => {
      if (!Array.isArray(row) || row.length !== columns.length || row.some(value => typeof value !== "string" && value !== null)) throw new Error(`Regional statement ${statementId} returned an invalid row`);
      return row as (string | null)[];
    });
    return { statementId, columns, rows: validated };
  }
}
