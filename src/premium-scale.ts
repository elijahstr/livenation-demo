import { AS_OF, TABLES, canonicalJson, hash, oracleMetrics, type Envelope } from "./premium-foundation";

export const FOUNDATION_RAW = 28;
export const FOUNDATION_ACCEPTED = 27;
export const TARGET_BRONZE = 10_000;
export const TARGET_SILVER = 9_999;
export const TOTAL_BUNDLES = 277;
export const RECORDS_PER_BUNDLE = 36;
export const FIRST_APPLY_BUNDLES = 1;
export const MAX_LATER_BUNDLES = 7;

const sourceSystems = {
  salesforce_raw: "salesforce",
  ticketmaster_raw: "ticketmaster",
  artist_catalog_raw: "artist_catalog",
  inventory_raw: "inventory",
  finance_raw: "finance",
} as const;

const tableByName = new Map(TABLES.map((table) => [table.name, table]));
type RecordType = Envelope["record_type"];
type ScaleEnvelope = Omit<Envelope, "record_type"> & { record_type: RecordType };
const bundleComposition: Record<string, number> = {
  accounts: 1, contacts: 1, identity_links: 1, contracts: 1, activities: 2, entitlements: 2,
  venues: 1, artists: 2, artist_relations: 1, events: 2,
  orders: 2, order_items: 4, tickets: 8, scans: 6, inventory_snapshots: 2,
};

function fail(message: string): never { throw new Error(`Premium scale invalid: ${message}`); }
function ordinalText(ordinal: number): string { return String(ordinal).padStart(4, "0"); }
function batchId(ordinal: number): string { return `premium-scale-v1-${ordinalText(ordinal)}`; }
function prefix(ordinal: number): string { return `SC${ordinalText(ordinal)}`; }
function timestamp(hour: number): string { return `2026-10-16T${String(hour).padStart(2, "0")}:00:00Z`; }

function row(ordinal: number, suffix: string, record_type: RecordType, payload: Record<string, unknown>): ScaleEnvelope {
  const table = tableByName.get(record_type);
  if (!table) fail(`unknown record type ${record_type}`);
  return {
    batch_id: batchId(ordinal),
    source_id: `${prefix(ordinal)}-${suffix}`,
    record_type,
    source_system: sourceSystems[table.bronze],
    ingested_at: AS_OF,
    synthetic: true,
    payload,
    payload_sha256: hash(payload),
  };
}

export function generateBundle(ordinal: number): Envelope[] {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > TOTAL_BUNDLES) fail("bundle ordinal is outside the approved range");
  const id = prefix(ordinal);
  const state = ["CA", "OR", "WA"][(ordinal - 1) % 3]!;
  const zone = state === "CA" ? "America/Los_Angeles" : state === "OR" ? "America/Los_Angeles" : "America/Los_Angeles";
  const account = `${id}-A`; const contact = `${id}-C`; const link = `${id}-IL`; const contract = `${id}-CT`; const venue = `${id}-V`;
  const artistA = `${id}-AR1`; const artistB = `${id}-AR2`; const pastEvent = `${id}-E1`; const futureEvent = `${id}-E2`;
  const orderA = `${id}-O1`; const orderB = `${id}-O2`; const itemA = `${id}-L1`; const itemB = `${id}-L2`; const itemC = `${id}-L3`; const itemD = `${id}-L4`;
  const cancelled = ordinal % 11 === 0;
  const refunded = ordinal % 5 === 0;
  const orderBStatus = cancelled ? "cancelled" : "completed";
  const itemCStatus = cancelled ? "cancelled" : "completed";
  const itemDStatus = cancelled ? "cancelled" : "completed";
  return [
    row(ordinal, "A", "accounts", { account_id: account, account_name: `Scale Account ${ordinalText(ordinal)}`, region: "west", primary_venue_id: venue }),
    row(ordinal, "C", "contacts", { contact_id: contact, account_id: account, email: `scale-${ordinal}@example.test` }),
    row(ordinal, "IL", "identity_links", { identity_link_id: link, contact_id: contact, external_identity: `tm-scale-${ordinalText(ordinal)}` }),
    row(ordinal, "CT", "contracts", { contract_id: contract, account_id: account, venue_id: venue, status: "active", start_date: "2026-01-01", end_date: "2026-12-31" }),
    row(ordinal, "ACT1", "activities", { activity_id: `${id}-ACT1`, account_id: account, contact_id: contact, contract_id: contract, activity_at: timestamp(8), activity_type: "email" }),
    row(ordinal, "ACT2", "activities", { activity_id: `${id}-ACT2`, account_id: account, contact_id: contact, contract_id: contract, activity_at: timestamp(9), activity_type: "call" }),
    row(ordinal, "EN1", "entitlements", { entitlement_id: `${id}-EN1`, account_id: account, contract_id: contract, event_id: futureEvent, product_id: "general-parking", status: "included", included_quantity: 1 }),
    row(ordinal, "EN2", "entitlements", { entitlement_id: `${id}-EN2`, account_id: account, contract_id: contract, event_id: futureEvent, product_id: "premier-parking", status: "available", included_quantity: 0 }),
    row(ordinal, "V", "venues", { venue_id: venue, venue_name: `Scale Venue ${ordinalText(ordinal)}`, state, iana_timezone: zone }),
    row(ordinal, "AR1", "artists", { artist_id: artistA, artist_name: `Scale Artist ${ordinalText(ordinal)} A` }),
    row(ordinal, "AR2", "artists", { artist_id: artistB, artist_name: `Scale Artist ${ordinalText(ordinal)} B` }),
    row(ordinal, "REL", "artist_relations", { seed_artist_id: artistA, related_artist_id: artistB, relation_source: "synthetic" }),
    row(ordinal, "E1", "events", { event_id: pastEvent, venue_id: venue, artist_id: artistA, event_date: "2026-09-12", event_status: "completed" }),
    row(ordinal, "E2", "events", { event_id: futureEvent, venue_id: venue, artist_id: artistB, event_date: "2026-11-12", event_status: "scheduled" }),
    row(ordinal, "O1", "orders", { order_id: orderA, identity_link_id: link, contract_id: contract, order_timestamp: "2026-09-01T12:00:00Z", order_status: "completed" }),
    row(ordinal, "O2", "orders", { order_id: orderB, identity_link_id: link, contract_id: contract, order_timestamp: "2026-09-02T12:00:00Z", order_status: orderBStatus }),
    row(ordinal, "L1", "order_items", { order_item_id: itemA, order_id: orderA, event_id: pastEvent, product_id: "scale-admission", product_family: "admission", line_status: "completed", line_amount: "100.00", refunded_amount: refunded ? "100.00" : "0.00" }),
    row(ordinal, "L2", "order_items", { order_item_id: itemB, order_id: orderA, event_id: pastEvent, product_id: "scale-parking", product_family: "parking", line_status: "completed", line_amount: "20.00", refunded_amount: "0.00" }),
    row(ordinal, "L3", "order_items", { order_item_id: itemC, order_id: orderB, event_id: futureEvent, product_id: "scale-future-admission", product_family: "admission", line_status: itemCStatus, line_amount: "90.00", refunded_amount: "0.00" }),
    row(ordinal, "L4", "order_items", { order_item_id: itemD, order_id: orderB, event_id: futureEvent, product_id: "scale-future-parking", product_family: "parking", line_status: itemDStatus, line_amount: "15.00", refunded_amount: "0.00" }),
    row(ordinal, "T1", "tickets", { ticket_id: `${id}-T1`, order_item_id: itemA, ticket_status: "issued" }),
    row(ordinal, "T2", "tickets", { ticket_id: `${id}-T2`, order_item_id: itemA, ticket_status: "issued" }),
    row(ordinal, "T3", "tickets", { ticket_id: `${id}-T3`, order_item_id: itemA, ticket_status: "issued" }),
    row(ordinal, "T4", "tickets", { ticket_id: `${id}-T4`, order_item_id: itemA, ticket_status: "issued" }),
    row(ordinal, "T5", "tickets", { ticket_id: `${id}-T5`, order_item_id: itemC, ticket_status: cancelled ? "cancelled" : "issued" }),
    row(ordinal, "T6", "tickets", { ticket_id: `${id}-T6`, order_item_id: itemC, ticket_status: cancelled ? "cancelled" : "issued" }),
    row(ordinal, "T7", "tickets", { ticket_id: `${id}-T7`, order_item_id: itemC, ticket_status: cancelled ? "cancelled" : "issued" }),
    row(ordinal, "T8", "tickets", { ticket_id: `${id}-T8`, order_item_id: itemC, ticket_status: cancelled ? "cancelled" : "issued" }),
    row(ordinal, "S1", "scans", { scan_id: `${id}-S1`, ticket_id: `${id}-T1`, scan_timestamp: timestamp(10), scan_result: "accepted" }),
    row(ordinal, "S2", "scans", { scan_id: `${id}-S2`, ticket_id: `${id}-T1`, scan_timestamp: timestamp(10), scan_result: "rejected" }),
    row(ordinal, "S3", "scans", { scan_id: `${id}-S3`, ticket_id: `${id}-T2`, scan_timestamp: timestamp(11), scan_result: "accepted" }),
    row(ordinal, "S4", "scans", { scan_id: `${id}-S4`, ticket_id: `${id}-T3`, scan_timestamp: timestamp(11), scan_result: "accepted" }),
    row(ordinal, "S5", "scans", { scan_id: `${id}-S5`, ticket_id: `${id}-T3`, scan_timestamp: timestamp(11), scan_result: "rejected" }),
    row(ordinal, "S6", "scans", { scan_id: `${id}-S6`, ticket_id: `${id}-T4`, scan_timestamp: timestamp(11), scan_result: "accepted" }),
    row(ordinal, "I1", "inventory_snapshots", { snapshot_id: `${id}-I1`, event_id: futureEvent, product_id: "general-parking", source: "synthetic", available_quantity: 10, unit_price: "20.00", snapshot_at: timestamp(12) }),
    row(ordinal, "I2", "inventory_snapshots", { snapshot_id: `${id}-I2`, event_id: futureEvent, product_id: "premier-parking", source: "synthetic", available_quantity: 5, unit_price: "40.00", snapshot_at: timestamp(12) }),
  ];
}

function isDate(value: unknown): boolean { return typeof value === "string" && /^\d{4}-\d\d-\d\d$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value; }
function isTimestamp(value: unknown): boolean { return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace(".000Z", "Z") === value && Date.parse(value) <= Date.parse(AS_OF); }
function isDecimal(value: unknown): boolean { return typeof value === "string" && /^-?\d+(?:\.\d{1,2})?$/.test(value); }
function cents(value: string): number { const [whole, fraction = ""] = value.split("."); return Number(whole) * 100 + Number((fraction + "00").slice(0, 2)); }

export function validateScaleSelection(records: Envelope[], existing: Envelope[] = []): void {
  if (!records.length || records.length % RECORDS_PER_BUNDLE !== 0) fail("selection does not contain complete bundles");
  const sourceIds = new Set(existing.map((row) => row.source_id));
  const keys = new Map<string, Set<string>>();
  const compositions = new Map<string, Map<string, number>>();
  for (const row of existing) {
    const table = tableByName.get(row.record_type); if (!table) continue;
    const values = keys.get(table.name) ?? new Set<string>(); values.add(table.key.map((key) => String(row.payload[key])).join("|")); keys.set(table.name, values);
  }
  for (const row of records) {
    const table = tableByName.get(row.record_type); if (!table || table.bronze === "finance_raw") fail("record type is not approved");
    const ordinal = Number(row.batch_id.slice(-4));
    if (!Number.isInteger(ordinal) || row.batch_id !== batchId(ordinal) || !row.source_id.startsWith(`${prefix(ordinal)}-`)) fail("source ID or batch ID is invalid");
    if (sourceIds.has(row.source_id)) fail("duplicate source ID"); sourceIds.add(row.source_id);
    if (row.source_system !== sourceSystems[table.bronze] || row.synthetic !== true || row.ingested_at !== AS_OF || row.payload_sha256 !== hash(row.payload)) fail("source metadata or hash is invalid");
    const names = Object.keys(row.payload).sort(); const expected = table.columns.map((column) => column.name).sort();
    if (canonicalJson(names) !== canonicalJson(expected)) fail("payload fields are invalid");
    for (const column of table.columns) {
      const value = row.payload[column.name];
      if (!column.nullable && (value === undefined || value === null || value === "")) fail("required field is missing");
      if (column.type === "STRING" && typeof value !== "string") fail("string field is invalid");
      if (column.type === "INT" && (!Number.isInteger(value) || Number(value) < 0)) fail("integer field is invalid");
      if (column.type === "DATE" && !isDate(value)) fail("date field is invalid");
      if (column.type === "TIMESTAMP" && !isTimestamp(value)) fail("timestamp field is invalid");
      if (column.type.startsWith("DECIMAL") && !isDecimal(value)) fail("decimal field is invalid");
    }
    if (row.record_type === "contacts" && !String(row.payload.email).endsWith("@example.test")) fail("contact email is invalid");
    if (row.record_type === "orders" && !["completed", "cancelled", "void"].includes(String(row.payload.order_status))) fail("order status is invalid");
    if (row.record_type === "order_items") {
      if (!["completed", "cancelled", "void"].includes(String(row.payload.line_status))) fail("line status is invalid");
      if (cents(String(row.payload.refunded_amount)) < 0 || cents(String(row.payload.refunded_amount)) > cents(String(row.payload.line_amount))) fail("refund is invalid");
    }
    if (row.record_type === "tickets" && !["issued", "cancelled", "void", "refunded"].includes(String(row.payload.ticket_status))) fail("ticket status is invalid");
    if (row.record_type === "venues") {
      if (!["CA", "OR", "WA"].includes(String(row.payload.state))) fail("venue state is invalid");
      try { Intl.DateTimeFormat("en-US", { timeZone: String(row.payload.iana_timezone) }); } catch { fail("venue timezone is invalid"); }
    }
    const key = table.key.map((name) => String(row.payload[name])).join("|"); const values = keys.get(table.name) ?? new Set<string>();
    if (values.has(key)) fail("duplicate natural key"); values.add(key); keys.set(table.name, values);
    const composition = compositions.get(row.batch_id) ?? new Map<string, number>();
    composition.set(row.record_type, (composition.get(row.record_type) ?? 0) + 1); compositions.set(row.batch_id, composition);
  }
  for (const composition of compositions.values()) if (canonicalJson(Object.fromEntries(composition)) !== canonicalJson(bundleComposition)) fail("bundle composition is invalid");
  for (const row of records) {
    const table = tableByName.get(row.record_type)!;
    for (const column of table.columns) if (column.references && row.payload[column.name] != null) {
      const targets = keys.get(column.references.table);
      if (!targets?.has(String(row.payload[column.name]))) fail("local reference is invalid");
    }
  }
}

function normalizedReady(ready: readonly number[]): number[] {
  const values = [...new Set(ready)].sort((a, b) => a - b);
  if (values.some((value, index) => !Number.isInteger(value) || value !== index + 1 || value > TOTAL_BUNDLES)) fail("ready bundle IDs must be contiguous");
  return values;
}

export function selectNextBundles(ready: readonly number[], savedSelection?: readonly number[]): number[] {
  const completed = normalizedReady(ready);
  const next = completed.length + 1;
  if (next > TOTAL_BUNDLES) return [];
  const count = next === 1 ? FIRST_APPLY_BUNDLES : Math.min(MAX_LATER_BUNDLES, TOTAL_BUNDLES - completed.length);
  const expected = Array.from({ length: count }, (_, index) => next + index);
  if (savedSelection?.length) {
    const saved = [...savedSelection];
    if (canonicalJson(saved) !== canonicalJson(expected)) fail("saved selection is invalid");
    return saved;
  }
  return expected;
}

export function expectedCounts(readyBundleCount: number) {
  if (!Number.isInteger(readyBundleCount) || readyBundleCount < 0 || readyBundleCount > TOTAL_BUNDLES) fail("ready bundle count is invalid");
  return { bronze: FOUNDATION_RAW + readyBundleCount * RECORDS_PER_BUNDLE, silver: FOUNDATION_ACCEPTED + readyBundleCount * RECORDS_PER_BUNDLE };
}

export function cumulativeAccepted(foundationAccepted: Envelope[], ready: readonly number[]): Envelope[] {
  const normalized = normalizedReady(ready);
  const generated = normalized.flatMap(generateBundle);
  validateScaleSelection(generated, foundationAccepted);
  return [...foundationAccepted, ...generated];
}

export function cumulativeOracle(foundationAccepted: Envelope[], ready: readonly number[]) {
  return oracleMetrics(cumulativeAccepted(foundationAccepted, ready));
}
