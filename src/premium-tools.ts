import { DatabricksStatements, type SqlParameter, type StatementResult } from "./databricks-statements";
import { HarnessToolInputError } from "./harness-tool-cycle";
import { AS_OF } from "./premium-foundation";

const GOLD = "workspace.ln_premium_gold";
const ACCOUNT_ID = "A100";
const MAX_ROWS = 50;

type InlineTool = {
  type: "inline_function";
  name: PremiumToolName;
  config: { inlineFunction: { description: string; inputSchema: Record<string, unknown> } };
};

export const PREMIUM_TOOL_NAMES = ["get_account_brief", "find_options", "ask_analytics"] as const;
export type PremiumToolName = typeof PREMIUM_TOOL_NAMES[number];

const accountSchema = {
  type: "object",
  additionalProperties: false,
  required: ["account_id"],
  properties: { account_id: { type: "string", enum: [ACCOUNT_ID] } },
};

export const PREMIUM_TOOL_DEFINITIONS: readonly InlineTool[] = [
  { type: "inline_function", name: "get_account_brief", config: { inlineFunction: { description: "Read bounded Gold account evidence for the approved synthetic account.", inputSchema: accountSchema } } },
  { type: "inline_function", name: "find_options", config: { inlineFunction: { description: "Read bounded future Gold options that the approved synthetic account does not own.", inputSchema: accountSchema } } },
  { type: "inline_function", name: "ask_analytics", config: { inlineFunction: { description: "Ask a business question over synthetic Gold analytics. Instructions do not restrict administrator permissions.", inputSchema: { type: "object", additionalProperties: false, required: ["question"], properties: { question: { type: "string", minLength: 1, maxLength: 2000 } } } } } },
];

export type PremiumToolsOptions = {
  profile: string;
  warehouseId: string;
  signal?: AbortSignal;
  deadlineAt?: number;
  now?: () => number;
  execute?: (sql: string, parameters?: SqlParameter[]) => Promise<StatementResult>;
  askAnalytics: (question: string, signal?: AbortSignal) => Promise<unknown>;
};

type Provenance = {
  statement_id: string;
  source_ids: string[];
  elapsed_ms: number;
  returned_row_count: number;
};

type FixedToolResult = {
  origin: "synthetic";
  data_as_of: typeof AS_OF;
  rows: Record<string, Array<Record<string, unknown>>>;
  provenance: Provenance;
};

const ACCOUNT_PARAMETER: SqlParameter[] = [{ name: "account_id", value: ACCOUNT_ID, type: "STRING" }];

const ACCOUNT_BRIEF_SQL = `WITH attention AS (
  SELECT account_id,contract_id,contract_end,latest_activity_at,latest_order_id
  FROM ${GOLD}.account_attention WHERE account_id=:account_id LIMIT 51
), artist_evidence AS (
  SELECT account_id,artist_id,purchased_admission_tickets,accepted_ticket_uses,related_artists
  FROM ${GOLD}.account_artist_evidence WHERE account_id=:account_id LIMIT 51
), benefits AS (
  SELECT account_id,event_id,product_id,included_quantity,purchased_quantity
  FROM ${GOLD}.account_event_benefits WHERE account_id=:account_id LIMIT 51
)
SELECT 'attention' AS section,to_json(collect_list(named_struct('account_id',account_id,'contract_id',contract_id,'contract_end',contract_end,'latest_activity_at',latest_activity_at,'latest_order_id',latest_order_id))) AS evidence FROM attention
UNION ALL
SELECT 'artist_evidence' AS section,to_json(collect_list(named_struct('account_id',account_id,'artist_id',artist_id,'purchased_admission_tickets',purchased_admission_tickets,'accepted_ticket_uses',accepted_ticket_uses,'related_artists',related_artists))) AS evidence FROM artist_evidence
UNION ALL
SELECT 'benefits' AS section,to_json(collect_list(named_struct('account_id',account_id,'event_id',event_id,'product_id',product_id,'included_quantity',included_quantity,'purchased_quantity',purchased_quantity))) AS evidence FROM benefits`;

const OPTIONS_SQL = `WITH relevant_events AS (
  SELECT DISTINCT event_id FROM ${GOLD}.account_event_benefits WHERE account_id=:account_id
), owned AS (
  SELECT event_id,product_id FROM ${GOLD}.account_event_benefits
  WHERE account_id=:account_id AND included_quantity+purchased_quantity>0
), options AS (
  SELECT o.event_id,o.product_id,o.source,o.available_quantity,o.unit_price,o.snapshot_at
  FROM ${GOLD}.upcoming_options o
  JOIN relevant_events r ON r.event_id=o.event_id
  LEFT ANTI JOIN owned b ON o.event_id=b.event_id AND o.product_id = b.product_id
  LIMIT 51
)
SELECT 'options' AS section,to_json(collect_list(named_struct('account_id','${ACCOUNT_ID}','event_id',event_id,'product_id',product_id,'source',source,'available_quantity',available_quantity,'unit_price',unit_price,'snapshot_at',snapshot_at))) AS evidence FROM options`;

const ATTENTION_SUMMARY_SQL = `SELECT 'attention' AS section,to_json(array(named_struct('account_count',count(*),'latest_activity_at',max(latest_activity_at)))) AS evidence
FROM ${GOLD}.account_attention`;

const SALES_METRICS_SQL = `WITH metrics AS (
  SELECT sum(admission_net_amount) net_admission_revenue,sum(parking_net_amount) net_parking_revenue,
    sum(valid_admission_quantity) valid_admission_tickets,count(DISTINCT admission_account_id) admission_buying_accounts
  FROM ${GOLD}.regional_sales
)
SELECT 'sales_metrics' AS section,to_json(array(named_struct('net_admission_revenue',net_admission_revenue,'net_parking_revenue',net_parking_revenue,'valid_admission_tickets',valid_admission_tickets,'admission_buying_accounts',admission_buying_accounts))) AS evidence FROM metrics`;

function inputError(message: string): never { throw new HarnessToolInputError(message); }

function accountInput(input: unknown): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) inputError("Only account A100 is available; use the tool schema.");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== 1 || value.account_id !== ACCOUNT_ID) inputError("Only account A100 is available; use the tool schema.");
}

function questionInput(input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) inputError("Use a question up to 2000 characters.");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== 1 || typeof value.question !== "string") inputError("Use a question up to 2000 characters.");
  const question = value.question.trim();
  if (!question || question.length > 2_000) inputError("Use a question up to 2000 characters.");
  return question;
}

function decodeRows(result: StatementResult, sections: readonly string[]): Record<string, Array<Record<string, unknown>>> {
  if (result.columns.length !== 2 || result.columns[0] !== "section" || result.columns[1] !== "evidence") throw new Error("Premium Gold result schema is invalid");
  if (result.rows.length > MAX_ROWS) throw new Error("Premium Gold result exceeded 50 rows");
  const decoded: Record<string, Array<Record<string, unknown>>> = {};
  for (const [section, evidence] of result.rows) {
    if (typeof section !== "string" || !sections.includes(section) || typeof evidence !== "string" || section in decoded) throw new Error("Premium Gold result sections are invalid");
    let rows: unknown;
    try { rows = JSON.parse(evidence); } catch { throw new Error("Premium Gold result evidence is invalid JSON"); }
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) throw new Error("Premium Gold result evidence has invalid rows");
    decoded[section] = rows as Array<Record<string, unknown>>;
  }
  if (sections.some((section) => !(section in decoded))) throw new Error("Premium Gold result omitted evidence");
  const total = Object.values(decoded).reduce((count, rows) => count + rows.length, 0);
  if (total > MAX_ROWS) throw new Error("Premium Gold result exceeded 50 rows");
  return decoded;
}

function sourceIds(rows: Record<string, Array<Record<string, unknown>>>, sources: string[]): string[] {
  const ids = new Set(sources);
  for (const values of Object.values(rows)) for (const row of values) {
    for (const [key, value] of Object.entries(row)) {
      if ((key === "product_id" || key.endsWith("_id")) && typeof value === "string") ids.add(value);
    }
  }
  return [...ids].sort();
}

function fixedResult(result: StatementResult, started: number, now: () => number, sections: readonly string[], sources: string[], expectedAccountId: string | undefined): FixedToolResult {
  if (!result.statementId.trim()) throw new Error("Premium Gold result omitted a statement ID");
  const rows = decodeRows(result, sections);
  if (expectedAccountId !== undefined) for (const values of Object.values(rows)) for (const row of values) if (row.account_id !== expectedAccountId) throw new Error("Premium Gold result has an unapproved account");
  const value: FixedToolResult = {
    origin: "synthetic",
    data_as_of: AS_OF,
    rows,
    provenance: {
      statement_id: result.statementId,
      source_ids: sourceIds(rows, sources),
      elapsed_ms: Math.max(0, now() - started),
      returned_row_count: Object.values(rows).reduce((count, value) => count + value.length, 0),
    },
  };
  assertPayload(value);
  return value;
}

function assertPayload(value: unknown): void {
  let size: number;
  try { size = new TextEncoder().encode(JSON.stringify(value)).byteLength; }
  catch { throw new Error("Premium tool result is not serializable"); }
  if (size > 64 * 1024) throw new Error("Premium tool result exceeded 64 KiB");
}

function assertActive(options: PremiumToolsOptions, now: () => number): void {
  options.signal?.throwIfAborted();
  if (options.deadlineAt !== undefined && now() >= options.deadlineAt) throw new Error("Premium tool deadline expired");
}

function defaultExecute(options: PremiumToolsOptions, now: () => number) {
  return async (sql: string, parameters: SqlParameter[] = []): Promise<StatementResult> => {
    assertActive(options, now);
    const remaining = options.deadlineAt === undefined ? 45_000 : options.deadlineAt - now();
    if (remaining <= 0) throw new Error("Premium tool deadline expired");
    const statements = new DatabricksStatements({
      profile: options.profile,
      warehouseId: options.warehouseId,
      signal: options.signal,
      executionDeadlineMs: Math.min(45_000, remaining),
      reconciliationDeadlineMs: 5_000,
    });
    return statements.execute(sql, parameters);
  };
}

export function createPremiumTools(options: PremiumToolsOptions): Readonly<Record<PremiumToolName, (input: unknown) => Promise<unknown>>> {
  const now = options.now ?? Date.now;
  const execute = options.execute ?? defaultExecute(options, now);
  const cache = new Map<"brief" | "options", Promise<FixedToolResult>>();
  const fixed = (key: "brief" | "options", sql: string, sections: readonly string[], sources: string[]) => async (input: unknown) => {
    accountInput(input);
    assertActive(options, now);
    let pending = cache.get(key);
    if (!pending) {
      const started = now();
      pending = execute(sql, ACCOUNT_PARAMETER).then((result) => fixedResult(result, started, now, sections, sources, ACCOUNT_ID));
      cache.set(key, pending);
    }
    const value = await pending;
    assertActive(options, now);
    return value;
  };
  return {
    get_account_brief: fixed("brief", ACCOUNT_BRIEF_SQL, ["attention", "artist_evidence", "benefits"], [`${GOLD}.account_attention`, `${GOLD}.account_artist_evidence`, `${GOLD}.account_event_benefits`]),
    find_options: fixed("options", OPTIONS_SQL, ["options"], [`${GOLD}.upcoming_options`, `${GOLD}.account_event_benefits`]),
    ask_analytics: async (input: unknown) => {
      const question = questionInput(input);
      assertActive(options, now);
      const result = await options.askAnalytics(question, options.signal);
      assertActive(options, now);
      assertPayload(result);
      return result;
    },
  };
}

async function readServerSummary(options: Omit<PremiumToolsOptions, "askAnalytics">, sql: string, section: string, sources: string[]): Promise<FixedToolResult> {
  const now = options.now ?? Date.now;
  const toolOptions: PremiumToolsOptions = { ...options, askAnalytics: async () => undefined };
  const execute = options.execute ?? defaultExecute(toolOptions, now);
  assertActive(toolOptions, now);
  const started = now();
  const result = await execute(sql);
  assertActive(toolOptions, now);
  return fixedResult(result, started, now, [section], sources, undefined);
}

export function readAccountAttentionSummary(options: Omit<PremiumToolsOptions, "askAnalytics">): Promise<FixedToolResult> {
  return readServerSummary(options, ATTENTION_SUMMARY_SQL, "attention", [`${GOLD}.account_attention`]);
}

export function readCurrentSalesMetrics(options: Omit<PremiumToolsOptions, "askAnalytics">): Promise<FixedToolResult> {
  return readServerSummary(options, SALES_METRICS_SQL, "sales_metrics", [`${GOLD}.regional_sales`]);
}
