import { runDatabricksJsonRequest, type DatabricksJsonRequest } from "./databricks-statements";

const MCP_PATH = "/ai-gateway/mcp-services/system.ai.genie_one_mcp";
const REQUIRED_TOOLS = ["genie_ask", "genie_poll_response", "genie_get_query_result", "genie_cancel_response"];
const GOLD_OBJECTS = new Set([
  "workspace.ln_premium_gold.regional_sales",
  "workspace.ln_premium_gold.account_attention",
  "workspace.ln_premium_gold.account_artist_evidence",
  "workspace.ln_premium_gold.upcoming_options",
  "workspace.ln_premium_gold.account_event_benefits",
  "workspace.ln_premium_gold.sales_metrics",
]);
const MAX_ITEMS = 5;
const MAX_ROWS = 50;
const MAX_BYTES = 64 * 1024;
const AS_OF = "2026-10-16T12:00:00Z";
const FIXED_QUESTION_PREFIX = `Use the curated Live Nation Premium Gold context and only these synthetic Premium Gold sources: ${[...GOLD_OBJECTS].join(", ")}. AS OF means the frozen ${AS_OF} snapshot context, not a sale_date filter. Apply a sale_date filter only when the question asks for one. Do not claim a live artist match, inventory hold, or seller action.`;

export { type DatabricksJsonRequest };

export type AnalyticsQueryItem = {
  itemId: string;
  sql?: string;
  ready?: boolean;
  statementState?: string;
  columns?: string[];
  rows?: (string | null)[][];
  totalRowCount?: number;
  sourceIds?: string[];
};

export type AnalyticsEvidence = {
  origin: "synthetic";
  data_as_of: typeof AS_OF;
  elapsedMs: number;
  conversationId: string;
  responseId: string;
  deepLink?: string;
  sourceIds: string[];
  queryItems: AnalyticsQueryItem[];
};

export type GenieMcpClientOptions = {
  profile: string;
  warehouseId: string;
  signal?: AbortSignal;
  request?: DatabricksJsonRequest;
  clock?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  deadlineAt: number;
  pollIntervalMs?: number;
  reconciliationDeadlineMs?: number;
};

type JsonObject = Record<string, unknown>;

function fail(message: string): never { throw new Error(`Genie MCP ${message}`); }
function asObject(value: unknown, label: string): JsonObject { if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} is invalid`); return value as JsonObject; }
function asString(value: unknown, label: string): string { if (typeof value !== "string" || !value) fail(`${label} is invalid`); return value; }
function remaining(clock: () => number, deadlineAt: number, ceilingMs: number): number {
  return Math.max(1, Math.min(ceilingMs, deadlineAt - clock()));
}
function stripSqlLiterals(sql: string): string { return sql.replace(/'(?:''|[^'])*'/g, "''"); }
function startsClause(sql: string, index: number): boolean { return /^(?:where|group|order|having|qualify|limit|union|join)\b/.test(sql.slice(index)); }
function hasUnsupportedCommaJoin(sql: string): boolean {
  for (const match of sql.matchAll(/\bfrom\b/g)) {
    let depth = 0;
    for (let index = (match.index ?? 0) + match[0].length; index < sql.length; index++) {
      const character = sql[index];
      if (character === "(") { depth++; continue; }
      if (character === ")") { if (depth === 0) break; depth--; continue; }
      if (depth === 0 && character === ",") return true;
      if (depth === 0 && startsClause(sql, index)) break;
    }
  }
  return false;
}
function sourceIsGold(sql: string): boolean {
  const normalized = sql.replace(/`/g, "").trim().toLowerCase();
  const statement = normalized.endsWith(";") ? normalized.slice(0, -1).trim() : normalized;
  if (!/^(?:select|with)\b/.test(statement) || /;|--|\/\*/.test(statement) || /\b(?:insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|call)\b/.test(statement)) return false;
  const analysis = stripSqlLiterals(statement);
  if (hasUnsupportedCommaJoin(analysis)) return false;
  const ctes = new Set([...analysis.matchAll(/(?:\bwith|,)\s*([a-z_][\w]*)\s+as\s*\(/g)].map(match => match[1]));
  const sources = [...analysis.matchAll(/\b(?:from|join)\s+([a-z_][\w.]*|\()/g)].map(match => match[1]);
  return sources.length > 0 && sources.some(source => GOLD_OBJECTS.has(source)) && sources.every(source => source === "(" || GOLD_OBJECTS.has(source) || ctes.has(source));
}
function sourceIds(sql: string): string[] { return [...new Set(sql.replace(/`/g, "").toLowerCase().match(/\b[a-z_][\w]*\.[a-z_][\w]*\.[a-z_][\w]*\b/g) ?? [])].filter(name => GOLD_OBJECTS.has(name)); }
function outputBytes(value: unknown): number { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }

export class GenieMcpClient {
  private readonly request: DatabricksJsonRequest;
  private readonly clock: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private initialized = false;
  private id = 0;
  private turnDeadlineAt?: number;

  constructor(private readonly options: GenieMcpClientOptions) {
    if (!options.profile || !options.warehouseId || !Number.isFinite(options.deadlineAt)) throw new Error("Genie MCP client options are invalid");
    this.request = options.request ?? runDatabricksJsonRequest;
    this.clock = options.clock ?? Date.now;
    this.sleep = options.sleep ?? Bun.sleep;
  }

  private deadline(): number { return this.turnDeadlineAt ?? this.options.deadlineAt; }

  private async call(method: string, params: JsonObject, deadlineAt = this.deadline(), signal: AbortSignal | null = this.options.signal): Promise<JsonObject> {
    if (signal?.aborted) throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
    if (this.clock() >= deadlineAt) fail("deadline expired");
    const id = ++this.id;
    const payload = { jsonrpc: "2.0", id, method, params };
    const raw = asObject(await this.request(["api", "post", MCP_PATH, "--profile", this.options.profile, "--output", "json"], payload, {
      timeoutMs: remaining(this.clock, deadlineAt, 15_000), maxBytes: MAX_BYTES, signal: signal ?? undefined,
    }), "JSON-RPC response");
    if (raw.jsonrpc !== "2.0" || raw.id !== id) fail("JSON-RPC response ID is invalid");
    if (raw.error !== undefined || raw.isError === true) fail("JSON-RPC error");
    const result = asObject(raw.result, "JSON-RPC result");
    if (result.isError === true) fail("MCP tool error");
    return result;
  }

  private async notifyInitialized(): Promise<void> {
    const raw = await this.request(["api", "post", MCP_PATH, "--profile", this.options.profile, "--output", "json"], { jsonrpc: "2.0", method: "notifications/initialized", params: {} }, {
      timeoutMs: remaining(this.clock, this.deadline(), 15_000), maxBytes: MAX_BYTES, signal: this.options.signal,
    });
    if (raw !== null && raw !== undefined) fail("initialized notification returned an unexpected response");
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    const initial = await this.call("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "livenation-demo", version: "1.0.0" } });
    const info = asObject(initial.serverInfo, "server information");
    if (initial.protocolVersion !== "2025-03-26" || info.name !== "genie_chat") fail("server protocol is unsupported");
    await this.notifyInitialized();
    const list = await this.call("tools/list", {});
    const tools = asObject(list, "tool list").tools;
    if (!Array.isArray(tools) || !REQUIRED_TOOLS.every(name => tools.some(tool => {
      try { return asObject(tool, "tool").name === name; } catch { return false; }
    }))) fail("tool catalog is incomplete");
    this.initialized = true;
  }

  private async cancelAndFail(conversationId: string, responseId: string, reason: string): Promise<never> {
    const reconcileAt = this.clock() + (this.options.reconciliationDeadlineMs ?? 5_000);
    try { await this.call("tools/call", { name: "genie_cancel_response", arguments: { conversation_id: conversationId } }, reconcileAt, null); } catch {}
    let observedState: string | undefined;
    while (this.clock() < reconcileAt) {
      try {
        const pollContent = asObject((await this.call("tools/call", { name: "genie_poll_response", arguments: { conversation_id: conversationId, response_id: responseId } }, reconcileAt, null)).structuredContent, "poll response");
        if (asString(pollContent.conversation_id, "poll conversation ID") !== conversationId || asString(pollContent.response_id, "poll response ID") !== responseId) fail("reconciliation response IDs changed");
        if (["completed", "incomplete", "failed"].includes(String(pollContent.status))) observedState = String(pollContent.status);
      } catch {}
      if (observedState) throw new Error(`Genie MCP ${reason}; observed terminal state is ${observedState}; conversation=${conversationId}; response=${responseId}`);
      if (this.clock() >= reconcileAt) break;
      await this.sleep(Math.min(this.options.pollIntervalMs ?? 2_000, reconcileAt - this.clock()));
    }
    throw new Error(`Genie MCP ${reason}; unknown outcome${observedState ? `; observed state is ${observedState}` : ""}; conversation=${conversationId}; response=${responseId}`);
  }

  async ask(question: string): Promise<AnalyticsEvidence> {
    if (typeof question !== "string" || question.length < 1 || question.length > 2_000) fail("question is invalid");
    const startedAt = this.clock();
    this.turnDeadlineAt = Math.min(this.options.deadlineAt, startedAt + 90_000);
    let conversationId: string | undefined;
    let responseId: string | undefined;
    let terminal = false;
    let cancellationStarted = false;
    try {
      await this.initialize();
      let ask: JsonObject;
      try {
        ask = await this.call("tools/call", { name: "genie_ask", arguments: { question: `${FIXED_QUESTION_PREFIX}\n\nQuestion: ${question}` }, _meta: { warehouse_id: this.options.warehouseId } });
      } catch {
        throw new Error("Genie MCP submission outcome is unknown; do not retry until reconciliation");
      }
      let content = asObject(ask.structuredContent, "ask response");
      conversationId = asString(content.conversation_id, "conversation ID");
      responseId = asString(content.response_id, "response ID");
      while (content.status === "in_progress") {
        if (this.options.signal?.aborted || this.clock() >= this.deadline()) {
          cancellationStarted = true;
          return await this.cancelAndFail(conversationId, responseId, this.options.signal?.aborted ? "was aborted" : "timed out");
        }
        await this.sleep(Math.min(this.options.pollIntervalMs ?? 2_000, remaining(this.clock, this.deadline(), this.options.pollIntervalMs ?? 2_000)));
        if (this.options.signal?.aborted || this.clock() >= this.deadline()) {
          cancellationStarted = true;
          return await this.cancelAndFail(conversationId, responseId, this.options.signal?.aborted ? "was aborted" : "timed out");
        }
        const polled = await this.call("tools/call", { name: "genie_poll_response", arguments: { conversation_id: conversationId, response_id: responseId } });
        content = asObject(polled.structuredContent, "poll response");
        if (asString(content.conversation_id, "poll conversation ID") !== conversationId || asString(content.response_id, "poll response ID") !== responseId) fail("poll response IDs changed");
      }
      if (content.status !== "completed") {
        terminal = ["incomplete", "failed"].includes(String(content.status));
        fail(`ended with ${typeof content.status === "string" ? content.status : "unknown"}`);
      }
      terminal = true;
      const items = content.query_items;
      if (!Array.isArray(items) || items.length === 0) fail("completed with no verified Gold query result");
      if (items.length > MAX_ITEMS) fail("returned too many query items");
      const queryItems: AnalyticsQueryItem[] = [];
      let totalRows = 0;
      for (const value of items) {
        const item = asObject(value, "query item");
        const itemId = asString(item.item_id, "query item ID");
        const sql = typeof item.sql === "string" ? item.sql : undefined;
        const result = await this.call("tools/call", { name: "genie_get_query_result", arguments: { conversation_id: conversationId, response_id: responseId, item_id: itemId } });
        const resultContent = asObject(result.structuredContent, "query result");
        if (asString(resultContent.conversation_id, "query conversation ID") !== conversationId || asString(resultContent.response_id, "query response ID") !== responseId || asString(resultContent.item_id, "query item ID") !== itemId) fail("query result IDs changed");
        const statementState = typeof resultContent.statement_state === "string" ? resultContent.statement_state : undefined;
        const ready = resultContent.ready === true;
        const entry: AnalyticsQueryItem = { itemId, sql, ready, statementState };
        if (ready && statementState === "SUCCEEDED" && sql && sourceIsGold(sql)) {
          const columns = resultContent.columns;
          const rows = resultContent.rows;
          const totalRowCount = resultContent.total_row_count;
          if (resultContent.truncated !== false || !Array.isArray(columns) || !Array.isArray(rows) || !Number.isInteger(totalRowCount) || totalRowCount !== rows.length) fail("query result is incomplete");
          const names = columns.map(column => asString(asObject(column, "query column").name, "query column name"));
          if (new Set(names).size !== names.length || columns.some(column => typeof asObject(column, "query column").type_text !== "string") || rows.some(row => !Array.isArray(row) || row.length !== names.length || row.some(cell => typeof cell !== "string" && cell !== null))) fail("query result is invalid");
          totalRows += rows.length;
          if (totalRows > MAX_ROWS) fail("returned too many rows");
          entry.columns = names;
          entry.rows = rows as (string | null)[][];
          entry.totalRowCount = totalRowCount;
          entry.sourceIds = sourceIds(sql);
        }
        queryItems.push(entry);
      }
      if (!queryItems.some(item => item.rows !== undefined)) fail("completed with no verified Gold query result");
      const evidence: AnalyticsEvidence = { origin: "synthetic", data_as_of: AS_OF, elapsedMs: this.clock() - startedAt, conversationId, responseId, ...(typeof content.deep_link === "string" ? { deepLink: content.deep_link } : {}), sourceIds: [...new Set(queryItems.flatMap(item => item.sourceIds ?? []))], queryItems };
      if (outputBytes(evidence) > MAX_BYTES) fail("evidence exceeded the configured limit");
      return evidence;
    } catch (error) {
      if (conversationId && responseId && !terminal && !cancellationStarted) {
        cancellationStarted = true;
        return await this.cancelAndFail(conversationId, responseId, this.options.signal?.aborted ? "was aborted" : "failed before completion");
      }
      throw error;
    } finally {
      this.turnDeadlineAt = undefined;
    }
  }
}
