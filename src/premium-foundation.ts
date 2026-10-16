import { createHash } from "node:crypto";

export const BATCH_ID = "harbor-works-foundation-v1";
export const AS_OF = "2026-10-16T12:00:00Z";
export const MARKER = "livenation-premium foundation-v1";
export const BRONZE_NAMES = ["salesforce_raw", "ticketmaster_raw", "artist_catalog_raw", "inventory_raw", "finance_raw"] as const;
export type BronzeName = typeof BRONZE_NAMES[number];
export type Column = { name: string; type: string; nullable?: boolean; references?: { table: string; column: string } };
export type Table = { name: string; bronze: BronzeName; columns: Column[]; key: string[] };

const c = (name: string, type: string, nullable = false, references?: Column["references"]): Column => ({ name, type, ...(nullable ? { nullable: true } : {}), ...(references ? { references } : {}) });
export const TABLES: Table[] = [
  { name: "accounts", bronze: "salesforce_raw", key: ["account_id"], columns: [c("account_id", "STRING"), c("account_name", "STRING"), c("region", "STRING"), c("primary_venue_id", "STRING", true, { table: "venues", column: "venue_id" })] },
  { name: "contacts", bronze: "salesforce_raw", key: ["contact_id"], columns: [c("contact_id", "STRING"), c("account_id", "STRING", false, { table: "accounts", column: "account_id" }), c("email", "STRING")] },
  { name: "identity_links", bronze: "salesforce_raw", key: ["identity_link_id"], columns: [c("identity_link_id", "STRING"), c("contact_id", "STRING", false, { table: "contacts", column: "contact_id" }), c("external_identity", "STRING")] },
  { name: "contracts", bronze: "salesforce_raw", key: ["contract_id"], columns: [c("contract_id", "STRING"), c("account_id", "STRING", false, { table: "accounts", column: "account_id" }), c("venue_id", "STRING", false, { table: "venues", column: "venue_id" }), c("status", "STRING"), c("start_date", "DATE"), c("end_date", "DATE")] },
  { name: "activities", bronze: "salesforce_raw", key: ["activity_id"], columns: [c("activity_id", "STRING"), c("account_id", "STRING", false, { table: "accounts", column: "account_id" }), c("contact_id", "STRING", true, { table: "contacts", column: "contact_id" }), c("contract_id", "STRING", true, { table: "contracts", column: "contract_id" }), c("activity_at", "TIMESTAMP"), c("activity_type", "STRING")] },
  { name: "entitlements", bronze: "salesforce_raw", key: ["entitlement_id"], columns: [c("entitlement_id", "STRING"), c("account_id", "STRING", false, { table: "accounts", column: "account_id" }), c("contract_id", "STRING", true, { table: "contracts", column: "contract_id" }), c("event_id", "STRING", false, { table: "events", column: "event_id" }), c("product_id", "STRING"), c("status", "STRING"), c("included_quantity", "INT")] },
  { name: "orders", bronze: "ticketmaster_raw", key: ["order_id"], columns: [c("order_id", "STRING"), c("identity_link_id", "STRING", true, { table: "identity_links", column: "identity_link_id" }), c("contract_id", "STRING", true, { table: "contracts", column: "contract_id" }), c("order_timestamp", "TIMESTAMP"), c("order_status", "STRING")] },
  { name: "order_items", bronze: "ticketmaster_raw", key: ["order_item_id"], columns: [c("order_item_id", "STRING"), c("order_id", "STRING", false, { table: "orders", column: "order_id" }), c("event_id", "STRING", false, { table: "events", column: "event_id" }), c("product_id", "STRING"), c("product_family", "STRING"), c("line_status", "STRING"), c("line_amount", "DECIMAL(18,2)"), c("refunded_amount", "DECIMAL(18,2)")] },
  { name: "tickets", bronze: "ticketmaster_raw", key: ["ticket_id"], columns: [c("ticket_id", "STRING"), c("order_item_id", "STRING", false, { table: "order_items", column: "order_item_id" }), c("ticket_status", "STRING")] },
  { name: "scans", bronze: "ticketmaster_raw", key: ["scan_id"], columns: [c("scan_id", "STRING"), c("ticket_id", "STRING", false, { table: "tickets", column: "ticket_id" }), c("scan_timestamp", "TIMESTAMP"), c("scan_result", "STRING")] },
  { name: "venues", bronze: "artist_catalog_raw", key: ["venue_id"], columns: [c("venue_id", "STRING"), c("venue_name", "STRING"), c("state", "STRING"), c("iana_timezone", "STRING")] },
  { name: "events", bronze: "artist_catalog_raw", key: ["event_id"], columns: [c("event_id", "STRING"), c("venue_id", "STRING", false, { table: "venues", column: "venue_id" }), c("artist_id", "STRING", false, { table: "artists", column: "artist_id" }), c("event_date", "DATE"), c("event_status", "STRING")] },
  { name: "artists", bronze: "artist_catalog_raw", key: ["artist_id"], columns: [c("artist_id", "STRING"), c("artist_name", "STRING")] },
  { name: "artist_relations", bronze: "artist_catalog_raw", key: ["seed_artist_id", "related_artist_id", "relation_source"], columns: [c("seed_artist_id", "STRING", false, { table: "artists", column: "artist_id" }), c("related_artist_id", "STRING", false, { table: "artists", column: "artist_id" }), c("relation_source", "STRING")] },
  { name: "inventory_snapshots", bronze: "inventory_raw", key: ["snapshot_id"], columns: [c("snapshot_id", "STRING"), c("event_id", "STRING", false, { table: "events", column: "event_id" }), c("product_id", "STRING"), c("source", "STRING"), c("available_quantity", "INT"), c("unit_price", "DECIMAL(18,2)"), c("snapshot_at", "TIMESTAMP")] },
  { name: "event_financials", bronze: "finance_raw", key: ["event_id"], columns: [c("event_id", "STRING", false, { table: "events", column: "event_id" }), c("production_cost", "DECIMAL(18,2)"), c("net_margin", "DECIMAL(18,2)")] },
  { name: "artist_deal_terms", bronze: "finance_raw", key: ["deal_id"], columns: [c("deal_id", "STRING"), c("event_id", "STRING", false, { table: "events", column: "event_id" }), c("artist_id", "STRING", false, { table: "artists", column: "artist_id" }), c("guaranteed_fee", "DECIMAL(18,2)"), c("revenue_share", "DECIMAL(18,2)")] }
];

const sourceTable: Record<string, BronzeName> = { accounts: "salesforce_raw", contacts: "salesforce_raw", identity_links: "salesforce_raw", contracts: "salesforce_raw", activities: "salesforce_raw", entitlements: "salesforce_raw", orders: "ticketmaster_raw", order_items: "ticketmaster_raw", tickets: "ticketmaster_raw", scans: "ticketmaster_raw", venues: "artist_catalog_raw", events: "artist_catalog_raw", artists: "artist_catalog_raw", artist_relations: "artist_catalog_raw", inventory_snapshots: "inventory_raw", event_financials: "finance_raw", artist_deal_terms: "finance_raw" };
const sourceSystem: Record<BronzeName, string> = { salesforce_raw: "salesforce", ticketmaster_raw: "ticketmaster", artist_catalog_raw: "artist_catalog", inventory_raw: "inventory", finance_raw: "finance" };
export type Envelope = { batch_id: string; source_id: string; record_type: keyof typeof sourceTable; source_system: string; ingested_at: string; synthetic: boolean; payload: Record<string, unknown>; payload_sha256: string };
type RawEnvelope = Omit<Envelope, "batch_id" | "payload_sha256"> & { batch_id?: string };
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function sha256(value: unknown): string { return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex"); }
export const hash = sha256;

function decimalCents(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^-?\d+(?:\.\d{1,2})?$/.test(value)) return undefined;
  const negative = value.startsWith("-"); const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const cents = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2)); const signed = negative ? -cents : cents;
  return signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < -BigInt(Number.MAX_SAFE_INTEGER) ? undefined : Number(signed);
}
function sourceError(message: string): never { throw new Error(`Premium fixture invalid: ${message}`); }
export function validateFixture(input: unknown): { records: Envelope[]; accepted: Envelope[]; rejected: { source_id: string; reason: string }[]; fixtureHash: string; metrics: { net_admission_revenue: string; net_parking_revenue: string; valid_admission_tickets: number; admission_buying_accounts: number } } {
  if (!input || typeof input !== "object") sourceError("fixture is not an object");
  const fixture = input as { batch_id?: unknown; as_of?: unknown; records?: unknown; expected?: { raw_records?: number; accepted_records?: number; rejected_records?: number } };
  if (fixture.batch_id !== BATCH_ID || fixture.as_of !== AS_OF || !Array.isArray(fixture.records)) sourceError("frozen metadata is incorrect");
  const seen = new Set<string>(); const raw = fixture.records as RawEnvelope[];
  const records = raw.map((row) => {
    if (!row || typeof row !== "object" || typeof row.source_id !== "string" || typeof row.record_type !== "string" || !(row.record_type in sourceTable) || typeof row.source_system !== "string" || typeof row.payload !== "object" || !row.payload || row.synthetic !== true || typeof row.ingested_at !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(row.ingested_at) || Date.parse(row.ingested_at) > Date.parse(AS_OF)) sourceError("envelope shape is invalid");
    if (row.batch_id !== undefined && row.batch_id !== BATCH_ID) sourceError(`wrong batch for ${row.source_id}`);
    if (row.ingested_at !== AS_OF) sourceError(`wrong ingestion cutoff for ${row.source_id}`);
    if (row.source_system !== sourceSystem[sourceTable[row.record_type]]) sourceError(`wrong source system for ${row.source_id}`);
    if (seen.has(row.source_id)) sourceError(`duplicate source key ${row.source_id}`); seen.add(row.source_id);
    const payload_sha256 = sha256(row.payload); if ("payload_sha256" in row && (row as Envelope).payload_sha256 !== payload_sha256) sourceError(`changed payload hash for ${row.source_id}`);
    return { ...row, batch_id: BATCH_ID, record_type: row.record_type as keyof typeof sourceTable, payload_sha256 };
  });
  const venueIds = new Set(records.filter((r) => r.record_type === "venues").map((r) => String(r.payload.venue_id)));
  const rejected: { source_id: string; reason: string }[] = [];
  const accepted = records.filter((row) => {
    if (row.record_type === "events" && !venueIds.has(String(row.payload.venue_id))) {
      if (row.source_id !== "AC-E-BAD") sourceError(`unknown venue for ${row.source_id}`);
      rejected.push({ source_id: row.source_id, reason: "unknown venue" }); return false;
    }
    return true;
  });
  if (records.length !== 28 || accepted.length !== 27 || rejected.length !== 1 || new Set(accepted.map((r) => r.record_type)).size !== 17 || fixture.expected?.raw_records !== 28 || fixture.expected?.accepted_records !== 27 || fixture.expected?.rejected_records !== 1) sourceError("fixture counts are incorrect");
  const values = new Map<string, Set<string>>();
  for (const row of accepted) {
    const table = TABLES.find((item) => item.name === row.record_type)!;
    if (table.key.some((name) => row.payload[name] === undefined || row.payload[name] === null || row.payload[name] === "")) sourceError(`missing natural key for ${row.source_id}`);
    const key = table.key.map((name) => String(row.payload[name])).join("|");
    const set = values.get(table.name) ?? new Set<string>(); if (set.has(key)) sourceError(`duplicate natural business key ${table.name}:${key}`); set.add(key); values.set(table.name, set);
    for (const column of table.columns) {
      const value = row.payload[column.name]; if (!column.nullable && (value === undefined || value === null || value === "")) sourceError(`missing ${column.name} for ${row.source_id}`);
      if (column.type.startsWith("DECIMAL") && decimalCents(value) === undefined) sourceError(`invalid money precision for ${row.source_id}`);
      if (column.type === "INT" && (!Number.isInteger(value) || (value as number) < 0)) sourceError(`invalid integer for ${row.source_id}`);
      if (column.type === "DATE" && (typeof value !== "string" || !/^\d{4}-\d\d-\d\d$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) !== value)) sourceError(`invalid date for ${row.source_id}`);
      if (column.type === "TIMESTAMP" && (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().replace(".000Z", "Z") !== value || Date.parse(value) > Date.parse(AS_OF))) sourceError(`invalid timestamp or cutoff for ${row.source_id}`);
      if ((column.type === "STRING" || column.type === "TIMESTAMP" || column.type === "DATE") && value != null && typeof value !== "string") sourceError(`invalid string type for ${row.source_id}`);
    }
    if (row.record_type === "order_items") { const family = row.payload.product_family; const line = decimalCents(row.payload.line_amount)!; const refund = decimalCents(row.payload.refunded_amount)!; if (family !== "admission" && family !== "parking") sourceError(`invalid product family for ${row.source_id}`); if (refund < 0 || refund > line) sourceError(`invalid refund for ${row.source_id}`); }
    if (row.record_type === "orders" && !["completed", "cancelled", "void"].includes(String(row.payload.order_status))) sourceError(`invalid order status for ${row.source_id}`);
    if (row.record_type === "order_items" && !["completed", "cancelled", "void"].includes(String(row.payload.line_status))) sourceError(`invalid line status for ${row.source_id}`);
    if (row.record_type === "tickets" && !["issued", "cancelled", "void", "refunded"].includes(String(row.payload.ticket_status))) sourceError(`invalid ticket status for ${row.source_id}`);
    if (row.record_type === "contacts" && !String(row.payload.email).endsWith("@example.test")) sourceError(`contact must use example.test: ${row.source_id}`);
  }
  for (const row of accepted) { const table = TABLES.find((item) => item.name === row.record_type)!; for (const col of table.columns) if (col.references && row.payload[col.name] != null) { const target = values.get(col.references.table); if (!target?.has(String(row.payload[col.name]))) sourceError(`missing ${col.references.table} relationship for ${row.source_id}`); } }
  for (const venue of accepted.filter((row) => row.record_type === "venues")) try { Intl.DateTimeFormat("en-US", { timeZone: String(venue.payload.iana_timezone) }); } catch { sourceError(`invalid timezone for ${venue.source_id}`); }
  return { records, accepted, rejected, fixtureHash: sha256({ batch_id: fixture.batch_id, as_of: fixture.as_of, records }), metrics: oracleMetrics(accepted) };
}

export function oracleMetrics(records: Envelope[]): { net_admission_revenue: string; net_parking_revenue: string; valid_admission_tickets: number; admission_buying_accounts: number } {
  const itemById = new Map(records.filter((r) => r.record_type === "order_items").map((r) => [String(r.payload.order_item_id), r]));
  const orderById = new Map(records.filter((r) => r.record_type === "orders").map((r) => [String(r.payload.order_id), r]));
  const events = new Map(records.filter((r) => r.record_type === "events").map((r) => [String(r.payload.event_id), r]));
  const venues = new Map(records.filter((r) => r.record_type === "venues").map((r) => [String(r.payload.venue_id), r]));
  const linkAccount = new Map<string, string>(); const contactAccounts = new Map(records.filter((r) => r.record_type === "contacts").map((r) => [String(r.payload.contact_id), String(r.payload.account_id)]));
  for (const link of records.filter((r) => r.record_type === "identity_links")) { const account = contactAccounts.get(String(link.payload.contact_id)); if (account) linkAccount.set(String(link.payload.identity_link_id), account); }
  const validTickets = new Map<string, number>();
  for (const ticket of records.filter((r) => r.record_type === "tickets")) { const item = itemById.get(String(ticket.payload.order_item_id)); const order = item && orderById.get(String(item.payload.order_id)); if (item && order && item.payload.product_family === "admission" && ticket.payload.ticket_status === "issued" && decimalCents(item.payload.refunded_amount) !== decimalCents(item.payload.line_amount) && !["cancelled", "void"].includes(String(item.payload.line_status)) && !["cancelled", "void"].includes(String(order.payload.order_status))) validTickets.set(String(item.payload.order_item_id), (validTickets.get(String(item.payload.order_item_id)) ?? 0) + 1); }
  let admission = 0, parking = 0, tickets = 0; const buyers = new Set<string>();
  for (const item of itemById.values()) { const order = orderById.get(String(item.payload.order_id)); const event = events.get(String(item.payload.event_id)); const venue = event && venues.get(String(event.payload.venue_id)); if (!order || !venue || !["CA", "OR", "WA"].includes(String(venue.payload.state)) || ["cancelled", "void"].includes(String(item.payload.line_status)) || ["cancelled", "void"].includes(String(order.payload.order_status))) continue; const family = item.payload.product_family; const net = decimalCents(item.payload.line_amount)! - decimalCents(item.payload.refunded_amount)!; if (family === "admission") { admission += net; const quantity = validTickets.get(String(item.payload.order_item_id)) ?? 0; tickets += quantity; if (net > 0 && quantity > 0) { const account = linkAccount.get(String(order.payload.identity_link_id)); if (account) buyers.add(account); } } else if (family === "parking") parking += net; }
  return { net_admission_revenue: (admission / 100).toFixed(2), net_parking_revenue: (parking / 100).toFixed(2), valid_admission_tickets: tickets, admission_buying_accounts: buyers.size };
}

const bronzeType = "array<struct<source_id:string,record_type:string,source_system:string,ingested_at:string,synthetic:boolean,payload:string,payload_sha256:string>>";
export function buildBronzeSource(name: BronzeName, validated: ReturnType<typeof validateFixture>): { sql: string; parameters: [{ name: string; value: string; type: string }] } {
  if (!BRONZE_NAMES.includes(name)) throw new Error("Bronze table is not allowlisted");
  const rows = validated.records.filter((row) => sourceTable[row.record_type] === name).map(({ batch_id: _batch, payload, ...row }) => ({ ...row, payload: canonicalJson(payload) }));
  return { sql: `SELECT '${BATCH_ID}' AS batch_id, x.source_id, x.record_type, x.source_system, CAST(x.ingested_at AS TIMESTAMP) AS ingested_at, x.synthetic, x.payload AS payload_json, x.payload_sha256 FROM inline(from_json(:records, '${bronzeType}')) x`, parameters: [{ name: "records", value: canonicalJson(rows), type: "STRING" }] };
}
export function silverCandidateSql(tableName: string, includeRejected = false): string {
  const table = TABLES.find((item) => item.name === tableName); if (!table) throw new Error("Silver table is not allowlisted");
  const fields = table.columns.map((column) => `try_cast(get_json_object(payload_json, '$.${column.name}') AS ${column.type}) AS ${column.name}`).join(", ");
  const bad = includeRejected ? "" : " AND source_id <> 'AC-E-BAD'";
  return `SELECT batch_id, source_id, ${fields} FROM workspace.ln_premium_bronze.${table.bronze} WHERE record_type = '${table.name}'${bad}`;
}
export function candidateValidationSql(): string {
  const candidates = TABLES.map((t) => `${t.name} AS (${silverCandidateSql(t.name, true)})`).join(",\n");
  const checks = TABLES.flatMap((table) => table.columns.filter((column) => !column.nullable).map((column) => `SELECT source_id, '${table.name}.${column.name} is required' AS reason FROM ${table.name} WHERE ${column.name} IS NULL`).concat(table.columns.filter((column) => column.references).map((column) => {
    const reason = table.name === "events" && column.name === "venue_id" ? "unknown venue" : `missing ${column.references!.table} relationship`;
    return `SELECT x.source_id, '${reason}' AS reason FROM ${table.name} x LEFT ANTI JOIN ${column.references!.table} r ON x.${column.name} = r.${column.references!.column} WHERE x.${column.name} IS NOT NULL`;
  }))).concat(TABLES.map((table) => `SELECT source_id, 'duplicate natural business key' AS reason FROM ${table.name} QUALIFY count(*) OVER (PARTITION BY ${table.key.join(", ")}) > 1`));
  return `WITH ${candidates}\n${checks.join("\nUNION ALL\n")}`;
}

const gold = "workspace.ln_premium_gold"; const silver = "workspace.ln_premium_silver";
const definitions: Record<string, string> = {
  regional_sales: `WITH ticket_counts AS (SELECT order_item_id,count(DISTINCT ticket_id) valid_admission_quantity
FROM ${silver}.tickets
WHERE ticket_status='issued'
GROUP BY order_item_id), verified_identity AS (SELECT i.identity_link_id,c.account_id
FROM ${silver}.identity_links i
JOIN ${silver}.contacts c ON c.contact_id=i.contact_id
JOIN ${silver}.accounts a ON a.account_id=c.account_id) SELECT oi.order_item_id,oi.event_id,v.state venue_state,CAST(from_utc_timestamp(o.order_timestamp,v.iana_timezone) AS DATE) sale_date,e.event_date,CASE WHEN oi.product_family='admission' THEN oi.line_amount-oi.refunded_amount ELSE CAST(0 AS DECIMAL(18,2)) END admission_net_amount,CASE WHEN oi.product_family='parking' THEN oi.line_amount-oi.refunded_amount ELSE CAST(0 AS DECIMAL(18,2)) END parking_net_amount,CASE WHEN oi.product_family='admission' AND oi.refunded_amount<oi.line_amount THEN coalesce(tc.valid_admission_quantity,0) ELSE 0 END valid_admission_quantity,CASE WHEN oi.product_family='admission' AND oi.refunded_amount<oi.line_amount AND coalesce(tc.valid_admission_quantity,0)>0 THEN vi.account_id END admission_account_id
FROM ${silver}.order_items oi
JOIN ${silver}.orders o ON o.order_id=oi.order_id
JOIN ${silver}.events e ON e.event_id=oi.event_id
JOIN ${silver}.venues v ON v.venue_id=e.venue_id
LEFT JOIN ticket_counts tc ON tc.order_item_id=oi.order_item_id
LEFT JOIN verified_identity vi ON vi.identity_link_id=o.identity_link_id
WHERE v.state IN ('CA','OR','WA') AND oi.line_status NOT IN ('cancelled','void') AND o.order_status NOT IN ('cancelled','void')`,
  account_attention: `WITH scoped_accounts AS (SELECT a.account_id
FROM ${silver}.accounts a JOIN ${silver}.venues v ON v.venue_id=a.primary_venue_id
WHERE v.state IN ('CA','OR','WA')),current_contract AS (SELECT *,row_number() OVER(PARTITION BY account_id ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,end_date DESC,contract_id DESC) n
FROM ${silver}.contracts
WHERE start_date<=DATE '${AS_OF.slice(0,10)}' AND end_date>=DATE '${AS_OF.slice(0,10)}'),latest_activity AS (SELECT *,row_number() OVER(PARTITION BY account_id ORDER BY activity_at DESC,activity_id DESC) n
FROM ${silver}.activities),latest_order AS (SELECT c.account_id,o.*,row_number() OVER(PARTITION BY c.account_id ORDER BY o.order_timestamp DESC,o.order_id DESC) n
FROM ${silver}.orders o
JOIN ${silver}.identity_links i ON i.identity_link_id=o.identity_link_id
JOIN ${silver}.contacts c ON c.contact_id=i.contact_id) SELECT a.account_id,cc.contract_id,cc.end_date contract_end,la.activity_at latest_activity_at,lo.order_id latest_order_id
FROM scoped_accounts a
LEFT JOIN current_contract cc ON cc.account_id=a.account_id AND cc.n=1
LEFT JOIN latest_activity la ON la.account_id=a.account_id AND la.n=1
LEFT JOIN latest_order lo ON lo.account_id=a.account_id AND lo.n=1`,
  account_artist_evidence: `WITH purchases AS (SELECT c.account_id,e.artist_id,count(DISTINCT t.ticket_id) purchased_admission_tickets
FROM ${silver}.orders o
JOIN ${silver}.identity_links i ON i.identity_link_id=o.identity_link_id
JOIN ${silver}.contacts c ON c.contact_id=i.contact_id
JOIN ${silver}.order_items oi ON oi.order_id=o.order_id
JOIN ${silver}.events e ON e.event_id=oi.event_id
JOIN ${silver}.venues v ON v.venue_id=e.venue_id
JOIN ${silver}.tickets t ON t.order_item_id=oi.order_item_id
WHERE v.state IN ('CA','OR','WA') AND oi.product_family='admission' AND oi.line_status NOT IN ('cancelled','void') AND o.order_status NOT IN ('cancelled','void') AND t.ticket_status='issued'
GROUP BY c.account_id,e.artist_id), accepted_scans AS (SELECT c.account_id,e.artist_id,count(DISTINCT s.ticket_id) accepted_ticket_uses
FROM ${silver}.orders o
JOIN ${silver}.identity_links i ON i.identity_link_id=o.identity_link_id
JOIN ${silver}.contacts c ON c.contact_id=i.contact_id
JOIN ${silver}.order_items oi ON oi.order_id=o.order_id
JOIN ${silver}.events e ON e.event_id=oi.event_id
JOIN ${silver}.venues v ON v.venue_id=e.venue_id
JOIN ${silver}.tickets t ON t.order_item_id=oi.order_item_id
JOIN ${silver}.scans s ON s.ticket_id=t.ticket_id
WHERE v.state IN ('CA','OR','WA') AND s.scan_result='accepted'
GROUP BY c.account_id,e.artist_id), public_related_artists AS (SELECT seed_artist_id,collect_set(named_struct('artist_id',related_artist_id,'relation_source',relation_source)) related_artists
FROM ${silver}.artist_relations
GROUP BY seed_artist_id) SELECT p.account_id,p.artist_id,p.purchased_admission_tickets,coalesce(s.accepted_ticket_uses,0) accepted_ticket_uses,r.related_artists
FROM purchases p
LEFT JOIN accepted_scans s ON s.account_id=p.account_id AND s.artist_id=p.artist_id
LEFT JOIN public_related_artists r ON r.seed_artist_id=p.artist_id`,
  upcoming_options: `WITH latest AS (SELECT *,row_number() OVER(PARTITION BY event_id,product_id,source ORDER BY snapshot_at DESC,snapshot_id DESC) n
FROM ${silver}.inventory_snapshots) SELECT l.event_id,l.product_id,l.source,l.available_quantity,l.unit_price,l.snapshot_at
FROM latest l
JOIN ${silver}.events e ON e.event_id=l.event_id
JOIN ${silver}.venues v ON v.venue_id=e.venue_id
WHERE l.n=1 AND l.available_quantity>0 AND l.snapshot_at<=TIMESTAMP '${AS_OF.replace("T"," ").replace("Z","")}' AND e.event_status='scheduled' AND v.state IN ('CA','OR','WA') AND e.event_date>CAST(from_utc_timestamp(TIMESTAMP '${AS_OF.replace("T"," ").replace("Z","")}',v.iana_timezone) AS DATE)`,
  account_event_benefits: `WITH included AS (SELECT account_id,event_id,product_id,sum(included_quantity) included_quantity
FROM ${silver}.entitlements
WHERE status IN ('included','available')
GROUP BY account_id,event_id,product_id),purchased AS (SELECT c.account_id,oi.event_id,oi.product_id,count(*) purchased_quantity
FROM ${silver}.orders o
JOIN ${silver}.identity_links i ON i.identity_link_id=o.identity_link_id
JOIN ${silver}.contacts c ON c.contact_id=i.contact_id
JOIN ${silver}.order_items oi ON oi.order_id=o.order_id
WHERE oi.line_status NOT IN ('cancelled','void') AND o.order_status NOT IN ('cancelled','void') AND oi.refunded_amount<oi.line_amount
GROUP BY c.account_id,oi.event_id,oi.product_id), benefits AS (SELECT coalesce(i.account_id,p.account_id) account_id,coalesce(i.event_id,p.event_id) event_id,coalesce(i.product_id,p.product_id) product_id,coalesce(i.included_quantity,0) included_quantity,coalesce(p.purchased_quantity,0) purchased_quantity
FROM included i
FULL OUTER JOIN purchased p ON p.account_id=i.account_id AND p.event_id=i.event_id AND p.product_id=i.product_id) SELECT b.*
FROM benefits b
JOIN ${silver}.events e ON e.event_id=b.event_id
JOIN ${silver}.venues v ON v.venue_id=e.venue_id
WHERE v.state IN ('CA','OR','WA')`
};
const ordinaryGold = Object.entries(definitions).map(([name, definition]) => ({ name, definition, sql: `CREATE VIEW ${gold}.${name} COMMENT '${MARKER}; definition_sha256=${sha256(definition)}' AS ${definition}` }));
export const metricYaml = `comment: "${MARKER}"\nversion: 1.1\nsource: ${gold}.regional_sales\ndimensions:\n  - name: sale_date\n    expr: sale_date\n  - name: event_date\n    expr: event_date\n  - name: venue_state\n    expr: venue_state\nmeasures:\n  - name: net_admission_revenue\n    expr: SUM(admission_net_amount)\n  - name: net_parking_revenue\n    expr: SUM(parking_net_amount)\n  - name: valid_admission_tickets\n    expr: SUM(valid_admission_quantity)\n  - name: admission_buying_accounts\n    expr: COUNT(DISTINCT admission_account_id)`;
export const METRIC_VIEW = { name: "sales_metrics", metric: true, definition: metricYaml, sql: `CREATE VIEW ${gold}.sales_metrics WITH METRICS LANGUAGE YAML AS $$${metricYaml}$$` };
export const GOLD_VIEWS = [...ordinaryGold, METRIC_VIEW];
export const metricQuery = `SELECT venue_state, MEASURE(net_admission_revenue) AS net_admission_revenue, MEASURE(net_parking_revenue) AS net_parking_revenue, MEASURE(valid_admission_tickets) AS valid_admission_tickets, MEASURE(admission_buying_accounts) AS admission_buying_accounts FROM ${gold}.sales_metrics GROUP BY venue_state`;
export const oracleQuery = `SELECT SUM(admission_net_amount) AS net_admission_revenue, SUM(parking_net_amount) AS net_parking_revenue, SUM(valid_admission_quantity) AS valid_admission_tickets, COUNT(DISTINCT admission_account_id) AS admission_buying_accounts FROM ${gold}.regional_sales`;
