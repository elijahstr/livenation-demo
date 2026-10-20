import { createHash } from "node:crypto";
import type { SqlParameter, StatementResult } from "./databricks-statements";
import { HarnessToolInputError } from "./harness-tool-cycle";
import { RegionalStatements } from "./regional-statements";
import { RegionalSourceState, defaultMetadataRequest, type MetadataRequest } from "./regional-source-state";
import { requireAccount, scopeHash, validateScope } from "./regional-scope";
import type { DatasetRef, EvidenceEnvelope, EvidenceSection, ReadContext, RegionalDataPort, RegionalScope, ScopedExecute, SourceCheckProgressTrace, SourceFingerprint } from "./regional-types";

const AS_OF = "2026-10-16T12:00:00Z";
const silver = "workspace.ln_premium_silver";
const gold = "workspace.ln_premium_gold";
const fixedSections = ["activity", "contract", "purchases", "benefits"] as const;
type FixedSection = typeof fixedSections[number];

export type RegionalDataOptions = { scope: RegionalScope; profile: string; warehouseId: string; execute?: ScopedExecute; metadataRequest?: MetadataRequest };
type AnalyticsInput = { account_id?: unknown; question?: unknown; dataset?: unknown; metric?: unknown; aggregation?: unknown; group_by?: unknown; filters?: unknown };

function now(): string { return new Date().toISOString(); }
function bytes(value: unknown): number { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
function sourceRefs(fingerprint?: SourceFingerprint): DatasetRef[] { return fingerprint?.dataset_refs ?? []; }
function scopeParameter(scope: RegionalScope): SqlParameter { return { name: "scope", value: JSON.stringify(scope.accounts.map(({ account_id, venue_id }) => ({ account_id, venue_id }))), type: "STRING" }; }
function unavailableSection(reason: string): EvidenceSection { return { state: "unavailable", rows: [], reason }; }
function parseSection(value: string | null, reason: string): EvidenceSection {
  if (!value) return unavailableSection(reason);
  try {
    const rows = JSON.parse(value);
    if (!Array.isArray(rows) || rows.some(row => row !== null && (!row || typeof row !== "object" || Array.isArray(row)))) throw new Error();
    const present = rows.filter((row): row is Record<string, unknown> => row !== null && Object.values(row as Record<string, unknown>).some(item => item !== null));
    return { state: "evidence", rows: present as Record<string, unknown>[], reason: present.length ? null : "No matching records exist in the dated source." };
  } catch { return { state: "error", rows: [], reason: "The source returned invalid evidence." }; }
}
function envelope(accountId: string, scope: RegionalScope, context: ReadContext, statementId: string, sections: Record<string, EvidenceSection>, status: EvidenceEnvelope["status"]): EvidenceEnvelope {
  let truncated = false;
  sections = Object.fromEntries(Object.entries(sections).sort(([a], [b]) => a === "identity" ? -1 : b === "identity" ? 1 : 0));
  const sectionCount = Object.keys(sections).filter(name => name !== "identity").length;
  const sectionCap = Math.floor((50 - (sections.identity ? 1 : 0)) / Math.max(1, sectionCount));
  for (const [name, section] of Object.entries(sections)) {
    const cap = name === "identity" ? 1 : sectionCap;
    if (section.rows.length > cap) {
      section.rows = section.rows.slice(0, cap);
      section.reason = "This section omits records to keep the response within its 50-record limit.";
      section.truncated = true;
    }
    truncated ||= section.truncated === true;
  }
  const retrieved = now();
  const fingerprint = context.fingerprint;
  const source = (name: string) => ({ identity: `${silver}.accounts and ${silver}.venues`, contacts: `${silver}.contacts`, activity: `${silver}.activities`, contract: `${silver}.contracts`, purchases: `${silver}.order_items`, benefits: `${gold}.account_event_benefits`, options: `${gold}.upcoming_options`, analytics: `${gold}.account_attention` }[name] ?? name);
  const unit = (name: string) => ({ activity: "activity_records", contract: "contract_records", purchases: "USD_and_issued_tickets", benefits: "included_units_and_order_lines", options: "inventory_snapshot", analytics: "aggregate_rows" }[name] ?? "records");
  const evidence = Object.entries(sections).filter(([, section]) => section.state === "evidence" && !section.truncated).map(([name]) => ({ evidence_id: `${statementId}:${accountId}:${name}`, source_ref: source(name), query_id: statementId, unit: unit(name), observed_at: AS_OF }));
  const value: EvidenceEnvelope = {
    scan_id: context.scanId, account_id: accountId, scope_hash: scopeHash(scope), source_fingerprint: fingerprint?.hash ?? "unknown", dataset_refs: sourceRefs(fingerprint), origin: "synthetic", data_as_of: AS_OF,
    observed_at: AS_OF, retrieved_at: retrieved, served_at: retrieved, status: truncated ? "partial" : status, consistency: fingerprint ? "stable" : "unknown", truncated, sections, evidence, error: status === "unavailable" ? "Required source evidence is unavailable." : null,
  };
  if (Object.values(sections).some(section => section.state === "error")) value.status = "partial";
  if (bytes(value) > 64 * 1024) {
    value.sections = {}; value.evidence = []; value.truncated = true; value.status = "partial";
    value.error = "The evidence exceeds the 64 KiB limit. No complete account fact is available from this response.";
  }
  return value;
}
function ensureRows(result: StatementResult, max = 50): void { if (result.rows.length > max || bytes({ columns: result.columns, rows: result.rows }) > 64 * 1024) throw new Error("Regional evidence exceeded its configured limit"); }
function fixedInput(sections: string[]): FixedSection[] {
  if (!Array.isArray(sections) || !sections.length || sections.length > 4 || new Set(sections).size !== sections.length || sections.some(section => !fixedSections.includes(section as FixedSection))) throw new HarnessToolInputError("Use one to four approved evidence sections");
  return sections as FixedSection[];
}

const summarySql = `WITH scope AS (
  SELECT x.account_id,x.venue_id FROM explode(from_json(:scope,'ARRAY<STRUCT<account_id:STRING,venue_id:STRING>>')) AS scoped_rows(x)
), accounts AS (
  SELECT s.account_id,a.account_name,s.venue_id,v.venue_name,v.state FROM scope s
  LEFT JOIN ${silver}.accounts a ON a.account_id=s.account_id AND a.primary_venue_id=s.venue_id
  LEFT JOIN ${silver}.venues v ON v.venue_id=s.venue_id
), activity AS (
  SELECT a.account_id,to_json(collect_list(CASE WHEN x.activity_id IS NOT NULL THEN named_struct(
    'activity_at',x.activity_at,'activity_type',x.activity_type) END)) activity
  FROM accounts a LEFT JOIN ${silver}.activities x ON x.account_id=a.account_id
  GROUP BY a.account_id
), contract AS (
  SELECT a.account_id,to_json(collect_list(CASE WHEN x.contract_id IS NOT NULL THEN named_struct(
    'contract_id',x.contract_id,'status',x.status,'start_date',x.start_date,'end_date',x.end_date) END)) contract
  FROM accounts a LEFT JOIN ${silver}.contracts x ON x.account_id=a.account_id AND x.venue_id=a.venue_id
  GROUP BY a.account_id
), contacts AS (
  SELECT a.account_id,to_json(collect_list(CASE WHEN c.contact_id IS NOT NULL THEN named_struct(
    'contact_id',c.contact_id,'email',c.email) END)) contacts
  FROM accounts a LEFT JOIN ${silver}.contacts c ON c.account_id=a.account_id GROUP BY a.account_id
), purchases AS (
  SELECT a.account_id,to_json(collect_list(CASE WHEN e.event_id IS NOT NULL AND i.order_item_id IS NOT NULL THEN named_struct(
    'event_id',i.event_id,'event_name',artist.artist_name,'product_id',i.product_id,'net_amount',i.line_amount-i.refunded_amount,
    'issued_ticket_count',CASE WHEN i.refunded_amount<i.line_amount THEN coalesce(t.issued_ticket_count,0) ELSE 0 END,
    'accepted_ticket_uses',coalesce(u.accepted_ticket_uses,0)) END)) purchases
  FROM accounts a LEFT JOIN ${silver}.contacts c ON c.account_id=a.account_id
  LEFT JOIN ${silver}.identity_links l ON l.contact_id=c.contact_id
  LEFT JOIN ${silver}.orders o ON o.identity_link_id=l.identity_link_id AND o.order_status NOT IN ('cancelled','void')
  LEFT JOIN ${silver}.order_items i ON i.order_id=o.order_id AND i.line_status NOT IN ('cancelled','void')
  LEFT JOIN ${silver}.events e ON e.event_id=i.event_id AND e.venue_id=a.venue_id
  LEFT JOIN ${silver}.artists artist ON artist.artist_id=e.artist_id
  LEFT JOIN (SELECT order_item_id,count(DISTINCT ticket_id) issued_ticket_count FROM ${silver}.tickets WHERE ticket_status='issued' GROUP BY order_item_id) t ON t.order_item_id=i.order_item_id
  LEFT JOIN (SELECT t.order_item_id,count(DISTINCT s.ticket_id) accepted_ticket_uses FROM ${silver}.tickets t JOIN ${silver}.scans s ON s.ticket_id=t.ticket_id WHERE s.scan_result='accepted' GROUP BY t.order_item_id) u ON u.order_item_id=i.order_item_id
  GROUP BY a.account_id
), benefits AS (
  SELECT a.account_id,to_json(collect_list(CASE WHEN e.event_id IS NOT NULL THEN named_struct(
    'event_id',b.event_id,'event_name',artist.artist_name,'product_id',b.product_id,'included_quantity',b.included_quantity,'purchased_line_count',b.purchased_quantity) END)) benefits
  FROM accounts a LEFT JOIN ${gold}.account_event_benefits b ON b.account_id=a.account_id
  LEFT JOIN ${silver}.events e ON e.event_id=b.event_id AND e.venue_id=a.venue_id
  LEFT JOIN ${silver}.artists artist ON artist.artist_id=e.artist_id GROUP BY a.account_id
)
SELECT a.account_id,a.account_name,a.venue_id,a.venue_name,a.state,activity.activity,contract.contract,purchases.purchases,benefits.benefits,contacts.contacts
FROM accounts a LEFT JOIN activity ON activity.account_id=a.account_id
LEFT JOIN contract ON contract.account_id=a.account_id LEFT JOIN purchases ON purchases.account_id=a.account_id
LEFT JOIN benefits ON benefits.account_id=a.account_id LEFT JOIN contacts ON contacts.account_id=a.account_id`;

export class RegionalData implements RegionalDataPort {
  private readonly scope: RegionalScope;
  private readonly execute: ScopedExecute;
  private readonly sourceState: RegionalSourceState;
  private cache?: { hash: string; scanId: string; promoted: boolean; summaries: EvidenceEnvelope[] };
  constructor(options: RegionalDataOptions) {
    this.scope = validateScope(options.scope);
    const client = new RegionalStatements({ profile: options.profile, warehouseId: options.warehouseId });
    this.execute = options.execute ?? ((sql, parameters, context) => client.execute(sql, parameters, context));
    this.sourceState = new RegionalSourceState({
      metadataRequest: options.metadataRequest ?? defaultMetadataRequest(options.profile),
      execute: async (sql, context) => this.execute(sql, [], context),
    });
  }

  async summaries(context: ReadContext): Promise<EvidenceEnvelope[]> {
    context.signal?.throwIfAborted();
    if (Date.now() >= context.deadlineAt) throw new Error("Regional summary deadline expired");
    if (this.cache?.promoted && this.cache.hash === context.fingerprint?.hash) {
      await context.onTrace?.({ kind: "source_cache", cache: "hit" });
      const servedAt = now();
      return structuredClone(this.cache.summaries).map(summary => ({ ...summary, scan_id: context.scanId, served_at: servedAt, cache: "hit" }));
    }
    await context.onTrace?.({ kind: "source_cache", cache: "miss" });
    const summaries = await this.readSummaries(context, this.scope.accounts);
    if (context.fingerprint && summaries.length && summaries.every(summary => summary.status === "complete" && !summary.truncated)) {
      const bytesValue = bytes(summaries);
      if (bytesValue <= 2 * 1024 * 1024) this.cache = { hash: context.fingerprint.hash, scanId: context.scanId, promoted: false, summaries: structuredClone(summaries) };
    }
    return summaries.map(summary => ({ ...summary, cache: "miss" }));
  }

  private async readSummaries(context: ReadContext, approved: RegionalScope["accounts"]): Promise<EvidenceEnvelope[]> {
    const result = await this.execute(summarySql, [scopeParameter({ ...this.scope, accounts: approved })], context);
    if (result.rows.length > 1000 || bytes({ columns: result.columns, rows: result.rows }) > 1024 * 1024) throw new Error("Regional summary exceeded its configured limit");
    const index = (name: string) => result.columns.indexOf(name);
    const required = ["account_id", "account_name", "venue_id", "venue_name", "state", ...fixedSections];
    if (required.some(name => index(name) < 0)) throw new Error("Regional summary schema is invalid");
    const rows = new Map<string, EvidenceEnvelope>();
    for (const row of result.rows) {
      const accountId = row[index("account_id")];
      if (typeof accountId !== "string") throw new Error("Regional summary has an invalid account ID");
      const account = requireAccount(this.scope, accountId);
      if (!approved.some(item => item.account_id === accountId)) throw new Error("Regional summary returned an unauthorized account");
      if (row[index("venue_id")] !== account.venue_id) throw new Error("Regional summary returned an unauthorized venue");
      const sections = Object.fromEntries(fixedSections.map(section => [section, parseSection(row[index(section)] as string | null, `No ${section} evidence is available.`)]));
      const sourceName = row[index("account_name")]; const venueName = row[index("venue_name")];
      if (!sourceName || !venueName || row[index("state")] !== account.state) {
        rows.set(accountId, envelope(accountId, this.scope, context, result.statementId, { identity: unavailableSection("The current source does not match the approved account and venue pair.") }, "unavailable"));
        continue;
      }
      sections.identity = { state: "evidence", rows: [{ account_id: accountId, account_name: sourceName, venue_id: account.venue_id, venue_name: venueName, state: account.state }], reason: null };
      if (index("contacts") >= 0) sections.contacts = parseSection(row[index("contacts")]!, "Contact records are unavailable.");
      if (sections.activity.state === "evidence") sections.activity.reason = "The source supplies no activity body or contact direction.";
      if (rows.has(accountId)) throw new Error("Regional summary returned a duplicate account");
      rows.set(accountId, envelope(accountId, this.scope, context, result.statementId, sections, "complete"));
    }
    return approved.map(account => rows.get(account.account_id) ?? envelope(account.account_id, this.scope, context, result.statementId, Object.fromEntries(fixedSections.map(section => [section, unavailableSection("The approved source did not return this account.")])), "unavailable"));
  }

  async evidence(accountId: string, sections: string[], context: ReadContext): Promise<EvidenceEnvelope> {
    requireAccount(this.scope, accountId); fixedInput(sections);
    const summaries = await this.readSummaries(context, [requireAccount(this.scope, accountId)]);
    const summary = summaries.find(value => value.account_id === accountId)!;
    const requested = [...sections, "identity", ...(sections.includes("contract") ? ["contacts"] : [])];
    const selected = Object.fromEntries(requested.filter(section => summary.sections[section]).map(section => [section, summary.sections[section]!]));
    return { ...summary, sections: selected, evidence: summary.evidence.filter(item => requested.includes(item.evidence_id.split(":").at(-1)!)) };
  }

  async options(accountId: string, input: Record<string, unknown>, context: ReadContext): Promise<EvidenceEnvelope> {
    const account = requireAccount(this.scope, accountId);
    if (Object.keys(input).some(key => !["account_id", "event_id", "product_id", "page_size", "constraints"].includes(key))) throw new HarnessToolInputError("Option input has an unknown field");
    if (input.account_id !== undefined && input.account_id !== accountId) throw new HarnessToolInputError("Option account does not match the bound account");
    const eventId = input.event_id; const productId = input.product_id;
    if (eventId !== undefined && (typeof eventId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(eventId))) throw new HarnessToolInputError("Invalid event filter");
    if (productId !== undefined && (typeof productId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(productId))) throw new HarnessToolInputError("Invalid product filter");
    const pageSize = input.page_size === undefined ? 50 : input.page_size;
    if (!Number.isInteger(pageSize) || (pageSize as number) < 1 || (pageSize as number) > 50) throw new HarnessToolInputError("Option page size is invalid");
    const constraints = input.constraints === undefined ? {} : input.constraints;
    if (!constraints || typeof constraints !== "object" || Array.isArray(constraints) || Object.keys(constraints).some(key => !["quantity", "max_unit_price"].includes(key))) throw new HarnessToolInputError("Option constraints are invalid");
    const constraint = constraints as Record<string, unknown>;
    if (constraint.quantity !== undefined && (!Number.isInteger(constraint.quantity) || (constraint.quantity as number) < 1 || (constraint.quantity as number) > 100)) throw new HarnessToolInputError("Option quantity is invalid");
    if (constraint.max_unit_price !== undefined && (typeof constraint.max_unit_price !== "number" || !Number.isFinite(constraint.max_unit_price) || constraint.max_unit_price < 0)) throw new HarnessToolInputError("Option price is invalid");
    const filters: string[] = []; const parameters: SqlParameter[] = [scopeParameter(this.scope), { name: "account_id", value: account.account_id, type: "STRING" }];
    if (typeof eventId === "string") { filters.push("o.event_id=:event_id"); parameters.push({ name: "event_id", value: eventId, type: "STRING" }); }
    if (typeof productId === "string") { filters.push("o.product_id=:product_id"); parameters.push({ name: "product_id", value: productId, type: "STRING" }); }
    if (constraint.quantity !== undefined) { filters.push("o.available_quantity>=:quantity"); parameters.push({ name: "quantity", value: String(constraint.quantity), type: "INT" }); }
    if (constraint.max_unit_price !== undefined) { filters.push("o.unit_price<=:max_unit_price"); parameters.push({ name: "max_unit_price", value: String(constraint.max_unit_price), type: "DECIMAL(18,2)" }); }
    const sql = `WITH scope AS (SELECT x.account_id,x.venue_id FROM explode(from_json(:scope,'ARRAY<STRUCT<account_id:STRING,venue_id:STRING>>')) AS scoped_rows(x)), owned AS (SELECT event_id,product_id FROM ${gold}.account_event_benefits WHERE account_id=:account_id AND included_quantity+purchased_quantity>0) SELECT o.event_id,artist.artist_name AS event_name,o.product_id,o.source,o.available_quantity,o.unit_price,o.snapshot_at FROM ${gold}.upcoming_options o JOIN ${silver}.events e ON e.event_id=o.event_id LEFT JOIN ${silver}.artists artist ON artist.artist_id=e.artist_id JOIN scope s ON s.venue_id=e.venue_id AND s.account_id=:account_id LEFT ANTI JOIN owned b ON b.event_id=o.event_id AND b.product_id=o.product_id${filters.length ? ` WHERE ${filters.join(" AND ")}` : ""} LIMIT ${pageSize + 1}`;
    const result = await this.execute(sql, parameters, context); ensureRows(result);
    const truncated = result.rows.length > pageSize; const rows = result.rows.slice(0, pageSize).map(row => ({ ...Object.fromEntries(result.columns.map((column, i) => [column, row[i]])), eligibility: "unknown" }));
    const value = envelope(accountId, this.scope, context, result.statementId, { options: { state: "evidence", rows, truncated, reason: rows.length ? null : "No matching option snapshot exists in this dated result." } }, truncated ? "partial" : "complete");
    return { ...value, truncated };
  }

  async analytics(accountId: string, input: Record<string, unknown>, context: ReadContext): Promise<EvidenceEnvelope> {
    const account = requireAccount(this.scope, accountId); const value = input as AnalyticsInput;
    if (value.account_id !== undefined && value.account_id !== accountId) throw new HarnessToolInputError("Analytics account does not match the bound account");
    if (typeof value.question !== "string" || !value.question.trim() || value.question.length > 2000) throw new HarnessToolInputError("Analytics needs a question of at most 2000 characters");
    const templates: Record<string, Record<string, { aggregate: string; groups: readonly string[]; from: string; source: string }>> = {
      activity: { activity_count: { aggregate: "count(*)", groups: ["none", "activity_type"], from: `${silver}.activities x`, source: `${silver}.activities` }, latest_activity_at: { aggregate: "max(x.activity_at)", groups: ["none", "activity_type"], from: `${silver}.activities x`, source: `${silver}.activities` } },
      purchases: { net_amount: { aggregate: "sum(i.line_amount-i.refunded_amount)", groups: ["none", "event_id", "product_id"], from: `${silver}.contacts c JOIN ${silver}.identity_links l ON l.contact_id=c.contact_id JOIN ${silver}.orders o ON o.identity_link_id=l.identity_link_id AND o.order_status NOT IN ('cancelled','void') JOIN ${silver}.order_items i ON i.order_id=o.order_id AND i.line_status NOT IN ('cancelled','void')`, source: `${silver}.order_items` }, issued_ticket_count: { aggregate: "count(DISTINCT CASE WHEN t.ticket_status='issued' AND i.refunded_amount<i.line_amount THEN t.ticket_id END)", groups: ["none", "event_id", "product_id"], from: `${silver}.contacts c JOIN ${silver}.identity_links l ON l.contact_id=c.contact_id JOIN ${silver}.orders o ON o.identity_link_id=l.identity_link_id AND o.order_status NOT IN ('cancelled','void') JOIN ${silver}.order_items i ON i.order_id=o.order_id AND i.line_status NOT IN ('cancelled','void') LEFT JOIN ${silver}.tickets t ON t.order_item_id=i.order_item_id`, source: `${silver}.tickets` } },
      benefits: { included_quantity: { aggregate: "sum(b.included_quantity)", groups: ["none", "event_id", "product_id"], from: `${gold}.account_event_benefits b`, source: `${gold}.account_event_benefits` }, purchased_line_count: { aggregate: "sum(b.purchased_quantity)", groups: ["none", "event_id", "product_id"], from: `${gold}.account_event_benefits b`, source: `${gold}.account_event_benefits` } },
      attendance: { accepted_ticket_uses: { aggregate: "count(DISTINCT CASE WHEN s.scan_result='accepted' THEN t.ticket_id END)", groups: ["none", "event_id", "artist_id"], from: `${silver}.contacts c JOIN ${silver}.identity_links l ON l.contact_id=c.contact_id JOIN ${silver}.orders o ON o.identity_link_id=l.identity_link_id JOIN ${silver}.order_items i ON i.order_id=o.order_id JOIN ${silver}.tickets t ON t.order_item_id=i.order_item_id LEFT JOIN ${silver}.scans s ON s.ticket_id=t.ticket_id LEFT JOIN ${silver}.events e ON e.event_id=i.event_id`, source: `${silver}.scans` } },
    };
    if (typeof value.dataset !== "string" || typeof value.metric !== "string" || typeof value.aggregation !== "string" || typeof value.group_by !== "string") throw new HarnessToolInputError("Analytics selection is invalid");
    const template = templates[value.dataset]?.[value.metric];
    const requiredAggregation: Record<string, string> = { activity_count: "count", latest_activity_at: "latest", net_amount: "sum", issued_ticket_count: "sum", included_quantity: "sum", purchased_line_count: "sum", accepted_ticket_uses: "sum" };
    if (!template || !template.groups.includes(value.group_by) || requiredAggregation[value.metric] !== value.aggregation) throw new HarnessToolInputError("Analytics selection is not approved");
    const filters = value.filters ?? {};
    if (!filters || typeof filters !== "object" || Array.isArray(filters) || Object.keys(filters).some(key => !["date_from", "date_to", "event_id", "product_id"].includes(key))) throw new HarnessToolInputError("Analytics filters are invalid");
    const filter = filters as Record<string, unknown>;
    for (const key of ["event_id", "product_id"]) if (filter[key] !== undefined && (typeof filter[key] !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(filter[key] as string))) throw new HarnessToolInputError("Analytics filter value is invalid");
    for (const key of ["date_from", "date_to"]) if (filter[key] !== undefined && (typeof filter[key] !== "string" || !/^\d{4}-\d\d-\d\d$/.test(filter[key] as string) || Number.isNaN(Date.parse(`${filter[key]}T00:00:00Z`)) || new Date(`${filter[key]}T00:00:00Z`).toISOString().slice(0, 10) !== filter[key])) throw new HarnessToolInputError("Analytics date filter is invalid");
    if (typeof filter.date_from === "string" && typeof filter.date_to === "string" && filter.date_from > filter.date_to) throw new HarnessToolInputError("Analytics date range is invalid");
    const eventColumn = value.dataset === "benefits" ? "b.event_id" : value.dataset === "activity" ? undefined : "i.event_id";
    const productColumn = value.dataset === "benefits" ? "b.product_id" : value.dataset === "activity" || value.dataset === "attendance" ? undefined : "i.product_id";
    const dateColumn = value.dataset === "activity" ? "x.activity_at" : value.dataset === "purchases" ? "o.order_timestamp" : value.dataset === "attendance" ? "e.event_date" : undefined;
    if ((filter.event_id !== undefined && !eventColumn) || (filter.product_id !== undefined && !productColumn) || ((filter.date_from !== undefined || filter.date_to !== undefined) && !dateColumn)) throw new HarnessToolInputError("Analytics filter is not supported for this dataset");
    const field = value.group_by === "none" ? undefined : value.group_by === "activity_type" ? "x.activity_type" : value.group_by === "artist_id" ? "e.artist_id" : value.dataset === "benefits" ? `b.${value.group_by}` : `i.${value.group_by}`;
    const accountColumn = value.dataset === "activity" ? "x.account_id" : value.dataset === "benefits" ? "b.account_id" : "c.account_id";
    const column = field ? `, ${field}` : "";
    const group = value.group_by === "none" ? "" : ` GROUP BY ${column.slice(2)}`;
    const eventScope = value.dataset === "activity" ? "" : ` JOIN ${silver}.events scoped_event ON scoped_event.event_id=${eventColumn ?? "i.event_id"} JOIN scope event_scope ON event_scope.account_id=:account_id AND event_scope.venue_id=scoped_event.venue_id`;
    const conditions = ["a.account_id=:account_id"];
    const parameters: SqlParameter[] = [scopeParameter(this.scope), { name: "account_id", value: account.account_id, type: "STRING" }];
    if (filter.event_id !== undefined) { conditions.push(`${eventColumn}=:event_id`); parameters.push({ name: "event_id", value: filter.event_id as string, type: "STRING" }); }
    if (filter.product_id !== undefined) { conditions.push(`${productColumn}=:product_id`); parameters.push({ name: "product_id", value: filter.product_id as string, type: "STRING" }); }
    if (filter.date_from !== undefined) { conditions.push(`${dateColumn}>=:date_from`); parameters.push({ name: "date_from", value: filter.date_from as string, type: "DATE" }); }
    if (filter.date_to !== undefined) { conditions.push(`${dateColumn}<date_add(:date_to,1)`); parameters.push({ name: "date_to", value: filter.date_to as string, type: "DATE" }); }
    const sql = `WITH scope AS (SELECT x.account_id,x.venue_id FROM explode(from_json(:scope,'ARRAY<STRUCT<account_id:STRING,venue_id:STRING>>')) AS scoped_rows(x)) SELECT ${template.aggregate} AS value${column} FROM ${template.from} JOIN ${silver}.accounts a ON a.account_id=${accountColumn} JOIN scope scoped ON scoped.account_id=a.account_id AND scoped.venue_id=a.primary_venue_id${eventScope} WHERE ${conditions.join(" AND ")}${group} LIMIT 51`;
    const result = await this.execute(sql, parameters, context); ensureRows(result, 51);
    const truncated = result.rows.length > 50;
    const rows = result.rows.slice(0, 50).map(row => Object.fromEntries(result.columns.map((columnName, index) => [columnName, row[index]])));
    const output = envelope(accountId, this.scope, context, result.statementId, { analytics: { state: "evidence", rows, truncated, reason: rows.length ? `Question: ${value.question}. Metric: ${value.metric}. Scope: account ${accountId}, assigned venue only.` : "No matching records exist in this dated analytics result." } }, truncated ? "partial" : "complete");
    output.truncated ||= truncated;
    output.evidence = output.evidence.map(item => ({ ...item, source_ref: template.source, unit: String(value.metric) }));
    output.query_proof = { statement_id: result.statementId, sql, question: value.question, dataset: value.dataset, metric: value.metric };
    if (bytes(output) > 64 * 1024) throw new Error("Regional analytics exceeded its configured limit");
    return output;
  }

  async fingerprint(context: ReadContext): Promise<SourceFingerprint> {
    const started = Date.now(); const refs: DatasetRef[] = [];
    try {
    for (const name of ["regional-sales-review", "sales-evidence-judgment"]) {
      const text = await Bun.file(new URL(`../docs/design/regional-scan/skills/${name}/SKILL.md`, import.meta.url)).text();
      refs.push({ source_id: `skill:${name}`, version: createHash("sha256").update(text).digest("hex") });
    }
    for (const name of ["regional-app.ts", "regional-data.ts", "regional-tools.ts", "regional-source-state.ts"]) {
      const text = await Bun.file(new URL(name, import.meta.url)).text();
      refs.push({ source_id: `implementation:${name}`, version: createHash("sha256").update(text).digest("hex") });
    }
    const state = await this.sourceState.read({ scopeHash: scopeHash(this.scope), localRefs: refs, context });
    await context.onTrace?.({ kind: "source_check_progress", completed: 17, total: 17 } satisfies SourceCheckProgressTrace);
    if (context.fingerprint && context.fingerprint.hash !== state.hash) {
      this.cache = undefined;
      await context.onTrace?.({ kind: "source_changed", prior_hash: context.fingerprint.hash, hash: state.hash });
    } else if (this.cache && this.cache.hash !== state.hash) {
      this.cache = undefined;
      await context.onTrace?.({ kind: "source_cache_invalidated", hash: state.hash });
    } else if (this.cache && this.cache.hash === state.hash && this.cache.scanId === context.scanId) this.cache.promoted = true;
    return { hash: state.hash, dataset_refs: state.refs, checked_at: now(), elapsed_ms: Date.now() - started };
    } catch (error) { this.cache = undefined; throw error; }
  }
}
