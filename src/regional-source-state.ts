import { createHash } from "node:crypto";

import type { DatabricksJsonRequest, StatementResult } from "./databricks-statements";
import { runDatabricksJsonRequest } from "./databricks-statements";
import type { DatasetRef, ReadContext } from "./regional-types";

const SILVER = ["accounts", "contacts", "identity_links", "contracts", "activities", "orders", "order_items", "tickets", "scans", "venues", "events", "artists", "entitlements", "inventory_snapshots"] as const;
const GOLD = ["account_attention", "account_event_benefits", "upcoming_options"] as const;
const MAX_PAGES = 10;
const MAX_BYTES = 1024 * 1024;

export type MetadataRequest = (path: string, context: ReadContext) => Promise<unknown>;
export type SourceStateOptions = { metadataRequest: MetadataRequest; execute: (sql: string, context: ReadContext) => Promise<StatementResult> };
type ObjectRow = { name?: unknown; full_name?: unknown; table_id?: unknown; id?: unknown; table_type?: unknown; data_source_format?: unknown; view_definition?: unknown };

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function size(value: unknown): void { if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_BYTES) throw new Error("Source metadata exceeds its limit"); }
function historySql(): string { return SILVER.map(name => `SELECT '${name}' source_name,CAST(max(version) AS STRING) version FROM (DESCRIBE HISTORY workspace.ln_premium_silver.${name})`).join(" UNION ALL "); }

export function defaultMetadataRequest(profile: string, options: {
  beforeRequest?: () => Promise<void>;
  request?: DatabricksJsonRequest;
} = {}): MetadataRequest {
  return async (path, context) => {
    await options.beforeRequest?.();
    context.signal?.throwIfAborted();
    const url = new URL(path, "https://regional.invalid");
    const schema = url.searchParams.get("schema_name");
    if (url.pathname !== "/api/2.1/unity-catalog/tables" || url.searchParams.get("catalog_name") !== "workspace" ||
      !["ln_premium_silver", "ln_premium_gold"].includes(schema ?? "") || url.searchParams.get("max_results") !== "0" ||
      ["omit_columns", "omit_properties", "omit_username"].some(name => url.searchParams.get(name) !== "true")) {
      throw new Error("Regional metadata request is not approved");
    }
    const timeoutMs = Math.min(15_000, context.deadlineAt - Date.now() - 5_000);
    if (timeoutMs <= 0) throw new Error("Source metadata deadline reserve reached");
    return (options.request ?? runDatabricksJsonRequest)(["api", "get", `${url.pathname}?${url.searchParams}`, "--profile", profile, "--output", "json"], undefined, { timeoutMs, maxBytes: MAX_BYTES, signal: context.signal });
  };
}

export class RegionalSourceState {
  constructor(private readonly options: SourceStateOptions) {}

  private async list(schema: "ln_premium_silver" | "ln_premium_gold", context: ReadContext): Promise<ObjectRow[]> {
    const result: ObjectRow[] = []; const tokens = new Set<string>(); let token: string | undefined; let totalBytes = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const query = new URLSearchParams({ catalog_name: "workspace", schema_name: schema, max_results: "0", omit_columns: "true", omit_properties: "true", omit_username: "true" });
      if (token) query.set("page_token", token);
      context.signal?.throwIfAborted();
      if (Date.now() >= context.deadlineAt) throw new Error("Source metadata deadline expired");
      const started = Date.now();
      let value: { tables?: unknown; next_page_token?: unknown };
      try {
        value = await this.options.metadataRequest(`/api/2.1/unity-catalog/tables?${query}`, context) as typeof value;
      } catch (error) {
        await context.onTrace?.({ kind: "source_metadata_request", schema, page: page + 1, elapsed_ms: Date.now() - started, status: "failed" });
        throw error;
      }
      await context.onTrace?.({ kind: "source_metadata_request", schema, page: page + 1, elapsed_ms: Date.now() - started, status: "received" });
      size(value); totalBytes += new TextEncoder().encode(JSON.stringify(value)).byteLength; if (totalBytes > MAX_BYTES) throw new Error("Source metadata traversal exceeds its limit");
      if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.tables ?? []) || (value.next_page_token !== undefined && typeof value.next_page_token !== "string")) throw new Error("Source metadata is malformed");
      result.push(...(value.tables ?? []) as ObjectRow[]);
      token = value.next_page_token || undefined;
      if (!token) return result;
      if (tokens.has(token)) throw new Error("Source metadata repeated a page token");
      tokens.add(token);
    }
    throw new Error("Source metadata pagination is incomplete");
  }

  async read(input: { scopeHash: string; localRefs: DatasetRef[]; context: ReadContext }): Promise<{ hash: string; refs: DatasetRef[] }> {
    const silver = await this.list("ln_premium_silver", input.context);
    const gold = await this.list("ln_premium_gold", input.context);
    const silverRows = new Map<string, ObjectRow>();
    for (const row of silver) {
      if (typeof row?.name !== "string" || !SILVER.includes(row.name as typeof SILVER[number])) continue;
      if (silverRows.has(row.name)) throw new Error("Source metadata repeats a required object");
      const id = row.table_id ?? row.id;
      if (row.full_name !== `workspace.ln_premium_silver.${row.name}` || row.table_type !== "MANAGED" || row.data_source_format !== "DELTA" || typeof id !== "string" || !id) throw new Error("Source metadata has an invalid required object");
      silverRows.set(row.name, row);
    }
    const goldRows = new Map<string, ObjectRow>();
    for (const row of gold) {
      if (typeof row?.name !== "string" || !GOLD.includes(row.name as typeof GOLD[number])) continue;
      if (goldRows.has(row.name)) throw new Error("Source metadata repeats a required object");
      if (row.full_name !== `workspace.ln_premium_gold.${row.name}` || row.table_type !== "VIEW" || typeof row.view_definition !== "string" || !row.view_definition) throw new Error("Source metadata has an invalid required object");
      goldRows.set(row.name, row);
    }
    if (silverRows.size !== SILVER.length || goldRows.size !== GOLD.length) throw new Error("Source metadata is missing a required object");
    const history = await this.options.execute(historySql(), input.context);
    const versions = new Map<string, string>();
    const source = history.columns.indexOf("source_name"), version = history.columns.indexOf("version");
    if (source < 0 || version < 0 || history.rows.length !== SILVER.length) throw new Error("Source history is incomplete");
    for (const row of history.rows) {
      const name = row[source]; const value = row[version];
      if (typeof name !== "string" || !SILVER.includes(name as typeof SILVER[number]) || typeof value !== "string" || !/^\d+$/.test(value) || versions.has(name)) throw new Error("Source history is invalid");
      versions.set(name, value);
    }
    const refs: DatasetRef[] = [
      ...SILVER.map(name => ({ source_id: `workspace.ln_premium_silver.${name}:${String(silverRows.get(name)?.table_id ?? silverRows.get(name)?.id)}`, version: versions.get(name)! })),
      ...GOLD.map(name => ({ source_id: `workspace.ln_premium_gold.${name}`, version: "definition", definition_hash: hash(goldRows.get(name)?.view_definition as string) })),
      ...input.localRefs,
    ].sort((a, b) => a.source_id.localeCompare(b.source_id));
    return { refs, hash: hash(JSON.stringify({ scope: input.scopeHash, refs })) };
  }
}

export { SILVER as REGIONAL_SILVER_TABLES, GOLD as REGIONAL_GOLD_VIEWS };
