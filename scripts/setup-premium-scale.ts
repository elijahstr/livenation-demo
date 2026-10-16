import { appendFile, chmod, mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabricksStatements, runDatabricksJson, type SqlParameter, type StatementResult } from "../src/databricks-statements";
import { BRONZE_NAMES, BATCH_ID, GOLD_VIEWS, MARKER, TABLES, canonicalJson, hash, oracleQuery, silverCandidateSql, validateFixture, type Column, type Envelope } from "../src/premium-foundation";
import { RECORDS_PER_BUNDLE, cumulativeOracle, expectedCounts, generateBundle, selectNextBundles, validateScaleSelection } from "../src/premium-scale";
import { assertTableMetadata, assertViewDefinition } from "./setup-premium-databricks";

const PROFILE = "livenation-demo";
const WAREHOUSE = "976766402458e7de";
const ROOT = new URL("../outputs/premium-scale/", import.meta.url).pathname;
const SCALE_PREFIX = "premium-scale-v1-";
const bronzeColumns: Column[] = [
  { name: "batch_id", type: "STRING" }, { name: "source_id", type: "STRING" }, { name: "record_type", type: "STRING" }, { name: "source_system", type: "STRING" },
  { name: "ingested_at", type: "TIMESTAMP" }, { name: "synthetic", type: "BOOLEAN" }, { name: "payload_json", type: "STRING" }, { name: "payload_sha256", type: "STRING" },
];
const bronzeWriteNames = BRONZE_NAMES.filter((name) => name !== "finance_raw");
const silverWriteTables = TABLES.filter((table) => !["event_financials", "artist_deal_terms"].includes(table.name));
const allBronzeObjects = BRONZE_NAMES.map((name) => `workspace.ln_premium_bronze.${name}`);
const allSilverObjects = TABLES.map((table) => `workspace.ln_premium_silver.${table.name}`);
const allGoldObjects = GOLD_VIEWS.map((view) => `workspace.ln_premium_gold.${view.name}`);
const allowedReads = new Set([...allBronzeObjects, ...allSilverObjects, ...allGoldObjects]);
const allowedWrites = new Set([...bronzeWriteNames.map((name) => `workspace.ln_premium_bronze.${name}`), ...silverWriteTables.map((table) => `workspace.ln_premium_silver.${table.name}`)]);
const terminal = new Set(["SUCCEEDED", "FAILED", "CANCELED", "CLOSED"]);

export type PendingStatement = { label: string; sqlHash: string; statementId?: string; state?: string };
export type ScaleExecutionState = {
  version: 1; selectedOrdinals: number[]; inputHash: string; readyOrdinals: number[]; pending?: PendingStatement;
  completed?: boolean; publishedAt?: string; statements?: PendingStatement[];
};
type Query = { sql: string; parameters: SqlParameter[] };
type Metadata = { name: string; full_name: string; table_type: string; data_source_format?: string; comment?: string; columns?: { name: string; type_text: string; nullable?: boolean; mask?: unknown }[]; view_definition?: string; row_filter?: unknown };

function fail(message: string): never { throw new Error(`Premium scale runner: ${message}`); }
function ordinalId(ordinal: number): string { return `${SCALE_PREFIX}${String(ordinal).padStart(4, "0")}`; }
function stable(value: unknown): string { return canonicalJson(value); }
function selectedIds(ordinals: readonly number[]): string[] { return ordinals.map(ordinalId); }
function validateBatchIds(ids: readonly string[]): void {
  if (!ids.length || ids.length > 7 || ids.some((id) => {
    const match = id.match(/^premium-scale-v1-(\d{4})$/);
    const ordinal = Number(match?.[1]);
    return !match || !Number.isInteger(ordinal) || ordinal < 1 || ordinal > 277 || id !== ordinalId(ordinal);
  })) fail("batch ID is not approved");
}
function sourceRows(name: string, records: readonly Envelope[]) {
  return records.filter((record) => {
    const table = TABLES.find((item) => item.name === record.record_type);
    return table?.bronze === name;
  }).map(({ payload, ...record }) => ({ ...record, payload: canonicalJson(payload) }));
}
function rawType(): string { return "array<struct<batch_id:string,source_id:string,record_type:string,source_system:string,ingested_at:string,synthetic:boolean,payload:string,payload_sha256:string>>"; }
function namesFromSql(sql: string): string[] { return sql.match(/\bworkspace\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*\b/g) ?? []; }
function stripLiterals(sql: string): string { return sql.replace(/'(?:[^']|'')*'/g, " "); }
function rows(result: StatementResult): Record<string, string | null>[] { return result.rows.map((row) => Object.fromEntries(result.columns.map((name, index) => [name, row[index]]))); }
function int(value: string | null | undefined, label: string): number { if (!value || !/^\d+$/.test(value)) fail(`invalid ${label} result`); return Number(value); }
export function hasPredictiveOptimizationEnabled(row: Record<string, string | null>): boolean { return /predictive optimization.*enable|enable.*predictive optimization/i.test(Object.values(row).join(" ")); }

/** Build an inline Bronze source. The payload remains a typed statement parameter. */
export function buildScaleBronzeSource(name: typeof BRONZE_NAMES[number], records: readonly Envelope[]): Query {
  if (!bronzeWriteNames.includes(name)) fail("Bronze table is not approved for Scale writes");
  const source = sourceRows(name, records);
  return { sql: `SELECT x.batch_id, x.source_id, x.record_type, x.source_system, CAST(x.ingested_at AS TIMESTAMP) AS ingested_at, x.synthetic, x.payload AS payload_json, x.payload_sha256 FROM inline(from_json(:records, '${rawType()}')) x`, parameters: [{ name: "records", value: stable(source), type: "STRING" }] };
}

/** Build a fixed-placeholder Silver source for the saved current selection. */
export function buildBatchScopedSilverSource(tableName: string, batchIds: readonly string[]): Query {
  const table = TABLES.find((item) => item.name === tableName);
  validateBatchIds(batchIds);
  if (!table || table.name === "event_financials" || table.name === "artist_deal_terms") fail("Silver table is not approved for Scale writes");
  const parameters = batchIds.map((value, index) => ({ name: `batch_${index}`, value, type: "STRING" }));
  return { sql: `SELECT * FROM (${silverCandidateSql(tableName)}) current_batch WHERE batch_id IN (${parameters.map((parameter) => `:${parameter.name}`).join(", ")})`, parameters };
}

/** Build the same typed Silver candidate from local deterministic envelopes before any Bronze write. */
export function buildLocalSilverCandidate(tableName: string, records: readonly Envelope[]): Query {
  const table = TABLES.find((item) => item.name === tableName);
  if (!table || ["event_financials", "artist_deal_terms"].includes(tableName)) fail("Silver table is not approved for Scale writes");
  const fields = table.columns.map((column) => `try_cast(get_json_object(x.payload, '$.${column.name}') AS ${column.type}) AS ${column.name}`).join(", ");
  const source = records.filter((record) => record.record_type === tableName).map(({ payload, ...record }) => ({ ...record, payload: canonicalJson(payload) }));
  return { sql: `SELECT x.batch_id,x.source_id,${fields} FROM inline(from_json(:records, '${rawType()}')) x WHERE x.record_type='${tableName}'`, parameters: [{ name: "records", value: stable(source), type: "STRING" }] };
}

export function buildGlobalKeyOverlapQuery(tableName: string, records: readonly Envelope[], batchIds: readonly string[]): Query {
  const table = TABLES.find((item) => item.name === tableName); if (!table || ["event_financials", "artist_deal_terms"].includes(tableName)) fail("Silver table is not approved for Scale writes");
  const source = buildLocalSilverCandidate(tableName, records); const selected = selectionParameters(batchIds);
  return { sql: `WITH expected AS (${source.sql}) SELECT count(*) AS conflict_count FROM workspace.ln_premium_silver.${tableName} live INNER JOIN expected ON ${table.key.map((key) => `live.${key}=expected.${key}`).join(" AND ")} WHERE live.batch_id NOT IN (${scopeSql(batchIds)})`, parameters: [...source.parameters, ...selected] };
}

export function buildGlobalSourceIdOverlapQuery(records: readonly Envelope[], batchIds: readonly string[]): Query {
  validateBatchIds(batchIds);
  const selected = selectionParameters(batchIds);
  const live = BRONZE_NAMES.map((name) => `SELECT batch_id,source_id FROM workspace.ln_premium_bronze.${name}`).join(" UNION ALL ");
  return {
    sql: `WITH expected AS (SELECT explode(from_json(:source_ids,'array<string>')) AS source_id), live AS (${live}) SELECT count(*) AS conflict_count FROM live INNER JOIN expected USING (source_id) WHERE live.batch_id NOT IN (${scopeSql(batchIds)})`,
    parameters: [{ name: "source_ids", value: stable(records.map((record) => record.source_id)), type: "STRING" }, ...selected],
  };
}

export function expectedBronzeDigests(records: readonly Envelope[]): Record<string, { record_count: number; content_hash: string }> {
  const batches = new Map<string, string[]>();
  for (const record of records) {
    const table = TABLES.find((item) => item.name === record.record_type);
    if (!table) fail("Bronze digest record type is invalid");
    const tokens = batches.get(record.batch_id) ?? [];
    tokens.push(`${table.bronze}|${record.source_id}|${record.payload_sha256}`);
    batches.set(record.batch_id, tokens);
  }
  return Object.fromEntries([...batches].map(([batch, tokens]) => [batch, { record_count: tokens.length, content_hash: hash(tokens.sort().join("|")) }]));
}

function buildPreservedBronzeDigestQuery(batchIds: readonly string[]): Query {
  const live = BRONZE_NAMES.map((name) => `SELECT batch_id,concat('${name}|',source_id,'|',payload_sha256) token FROM workspace.ln_premium_bronze.${name}`).join(" UNION ALL ");
  return {
    sql: `WITH live AS (${live}) SELECT batch_id,count(*) record_count,sha2(concat_ws('|',sort_array(collect_list(token))),256) content_hash FROM live WHERE batch_id NOT IN (${scopeSql(batchIds)}) GROUP BY batch_id ORDER BY batch_id`,
    parameters: selectionParameters(batchIds),
  };
}

export function assertPreservedBronzeDigests(actual: Array<Record<string, string | null>>, expected: Record<string, { record_count: number; content_hash: string }>): void {
  const observed = Object.fromEntries(actual.map((row) => [row.batch_id, { record_count: Number(row.record_count), content_hash: row.content_hash }]));
  if (stable(observed) !== stable(expected)) fail("preserved Bronze content differs from the deterministic source");
}

export function buildPreservedSilverComparison(tableName: string, batchIds: readonly string[]): Query {
  const table = TABLES.find((item) => item.name === tableName); if (!table) fail("Silver table is not approved");
  validateBatchIds(batchIds);
  const fields = ["batch_id", "source_id", ...table.columns.map((column) => column.name)].join(",");
  const scope = scopeSql(batchIds);
  const source = silverCandidateSql(tableName);
  return {
    sql: `WITH expected AS (SELECT ${fields} FROM (${source}) preserved_expected WHERE batch_id NOT IN (${scope})), actual AS (SELECT ${fields} FROM workspace.ln_premium_silver.${tableName} WHERE batch_id NOT IN (${scope})), conflicts AS ((SELECT ${fields} FROM actual EXCEPT SELECT ${fields} FROM expected) UNION ALL (SELECT ${fields} FROM expected EXCEPT SELECT ${fields} FROM actual)), duplicates AS (SELECT ${table.key.join(",")} FROM actual GROUP BY ${table.key.join(",")} HAVING count(*)>1) SELECT (SELECT count(*) FROM actual) actual_count,(SELECT count(*) FROM expected) expected_count,(SELECT count(*) FROM conflicts) conflicts,(SELECT count(*) FROM duplicates) duplicates`,
    parameters: selectionParameters(batchIds),
  };
}

function bronzeMergeSql(name: string, source: string): string {
  const table = `workspace.ln_premium_bronze.${name}`;
  return `MERGE INTO ${table} t USING (${source}) s ON t.batch_id=s.batch_id AND t.source_id=s.source_id WHEN NOT MATCHED THEN INSERT (batch_id,source_id,record_type,source_system,ingested_at,synthetic,payload_json,payload_sha256) VALUES (s.batch_id,s.source_id,s.record_type,s.source_system,s.ingested_at,s.synthetic,s.payload_json,s.payload_sha256)`;
}
function silverMergeSql(tableName: string, source: string): string {
  const table = TABLES.find((item) => item.name === tableName); if (!table) fail("Silver table is not approved");
  const columns = ["batch_id", "source_id", ...table.columns.map((column) => column.name)];
  return `MERGE INTO workspace.ln_premium_silver.${table.name} t USING (${source}) s ON ${table.key.map((key) => `t.${key}=s.${key}`).join(" AND ")} WHEN NOT MATCHED THEN INSERT (${columns.join(",")}) VALUES (${columns.map((column) => `s.${column}`).join(",")})`;
}

/** This is a narrow guard for this file's constant SQL builders. */
export function assertScaleSql(sql: string): void {
  const code = stripLiterals(sql).trim();
  const showCreate = /^SHOW CREATE TABLE\b/i.test(code);
  if (/;|--|\/\*|`|\b(?:DROP|TRUNCATE|DELETE|UPDATE|ALTER|GRANT|REVOKE|REPLACE|OPTIMIZE|ANALYZE|VACUUM|INSERT\s+INTO)\b/i.test(code) || (!showCreate && /\bCREATE\b/i.test(code))) fail("unsafe SQL operation");
  if (!/^(?:SELECT\b|WITH\b|MERGE INTO\b|SHOW CREATE TABLE\b|DESCRIBE SCHEMA(?: EXTENDED)?\s+workspace\.ln_premium_silver\b)/i.test(code)) fail("SQL operation is not approved");
  const names = namesFromSql(code); if (names.some((name) => !allowedReads.has(name))) fail("SQL references an unapproved object");
  if (/^MERGE INTO/i.test(code)) {
    const target = code.match(/^MERGE INTO\s+([\w.]+)/i)?.[1];
    if (!target || !allowedWrites.has(target) || !/WHEN NOT MATCHED THEN INSERT/i.test(code) || /WHEN MATCHED|NOT MATCHED BY/i.test(code)) fail("SQL write is not an insert-only owned MERGE");
  }
}

export function createScaleExecutionState(ordinals: readonly number[], readyOrdinals: readonly number[] = []): ScaleExecutionState {
  const selected = [...ordinals]; const ready = [...readyOrdinals];
  const expected = selectNextBundles(ready, selected);
  const records = expected.flatMap(generateBundle); if (records.length) validateScaleSelection(records);
  return { version: 1, selectedOrdinals: expected, inputHash: hash(records), readyOrdinals: ready };
}

export function selectScaleRun(state: ScaleExecutionState): number[] {
  return selectNextBundles(state.readyOrdinals, state.selectedOrdinals);
}

/** Reconciliation clears only a recorded terminal statement. A missing ID blocks retry. */
export function reconcileScaleState(state: ScaleExecutionState, observedState?: string): ScaleExecutionState {
  if (!state.pending) return state;
  if (!state.pending.statementId) fail("prior pending statement has no statement ID; reconcile before retry");
  const current = observedState ?? state.pending.state;
  if (!terminal.has(current ?? "")) fail("prior pending statement is not terminal");
  return { ...state, pending: undefined, statements: [...(state.statements ?? []), { ...state.pending, state: current }] };
}

/** Publish only a proved selection. This transition cannot append the same bundle twice. */
export function publishCompletedSelection(state: ScaleExecutionState, publishedAt: string): ScaleExecutionState {
  if (!state.completed) fail("selection is not completed for publication");
  const selected = selectScaleRun(state);
  if (selected.some((ordinal) => state.readyOrdinals.includes(ordinal))) fail("completed selection overlaps a ready bundle");
  return { ...state, readyOrdinals: [...state.readyOrdinals, ...selected], selectedOrdinals: [], completed: false, publishedAt };
}

function selectionParameters(ids: readonly string[], prefix = "selected"): SqlParameter[] { validateBatchIds(ids); return ids.map((value, index) => ({ name: `${prefix}_${index}`, value, type: "STRING" })); }
function scopeSql(ids: readonly string[], prefix = "selected"): string { return selectionParameters(ids, prefix).map((parameter) => `:${parameter.name}`).join(", "); }
function comparisonSql(fullName: string, columns: readonly Column[], source: Query, ids: readonly string[]): Query {
  const selected = selectionParameters(ids); const fields = columns.map((column) => column.name).join(", ");
  return { sql: `WITH expected AS (${source.sql}), actual AS (SELECT ${fields} FROM ${fullName} WHERE batch_id IN (${scopeSql(ids)})), conflicts AS (SELECT ${fields} FROM actual EXCEPT SELECT ${fields} FROM expected), duplicates AS (SELECT source_id FROM actual GROUP BY source_id HAVING count(*)>1) SELECT (SELECT count(*) FROM actual) AS actual_count,(SELECT count(*) FROM expected) AS expected_count,(SELECT count(*) FROM conflicts) AS conflicts,(SELECT count(*) FROM duplicates) AS duplicates`, parameters: [...source.parameters, ...selected] };
}
export function buildScaleComparison(fullName: string, source: Query, ids: readonly string[]): Query {
  const columns = fullName.startsWith("workspace.ln_premium_bronze.") ? bronzeColumns : (() => {
    const table = TABLES.find((item) => fullName === `workspace.ln_premium_silver.${item.name}`); if (!table) fail("comparison table is not approved");
    return [{ name: "batch_id", type: "STRING" }, { name: "source_id", type: "STRING" }, ...table.columns];
  })();
  return comparisonSql(fullName, columns, source, ids);
}
export function assertScaleSubsetComparison(row: Record<string, string | null>, label: string): { actual: number; expected: number } {
  const actual = int(row.actual_count, `${label} actual count`); const expected = int(row.expected_count, `${label} expected count`);
  if (int(row.conflicts, `${label} conflict count`) || int(row.duplicates, `${label} duplicate count`) || actual > expected) fail(`target has a changed, extra, or duplicate ${label} row`);
  return { actual, expected };
}
export function assertScaleExactComparison(row: Record<string, string | null>, label: string): void {
  const result = assertScaleSubsetComparison(row, label);
  if (result.actual !== result.expected) fail(`preserved ${label} rows are missing`);
}
export function buildCandidateValidationQuery(ids: readonly string[]): Query {
  const included = TABLES.filter((table) => !["event_financials", "artist_deal_terms"].includes(table.name));
  const sources = included.map((table) => {
    const source = buildBatchScopedSilverSource(table.name, ids);
    const parameters = source.parameters.map((parameter) => ({ ...parameter, name: `${table.name}_${parameter.name}` }));
    let sql = source.sql;
    for (const parameter of source.parameters) sql = sql.replaceAll(`:${parameter.name}`, `:${table.name}_${parameter.name}`);
    return { table, sql, parameters };
  });
  const candidates = sources.map(({ table, sql }) => `${table.name} AS (${sql})`).join(",\n");
  const checks = included.flatMap((table) => table.columns.filter((column) => !column.nullable).map((column) => `SELECT source_id,'${table.name}.${column.name} is required' AS reason FROM ${table.name} WHERE ${column.name} IS NULL`).concat(table.columns.filter((column) => column.references).map((column) => `SELECT x.source_id,'missing ${column.references!.table} relationship' AS reason FROM ${table.name} x LEFT ANTI JOIN ${column.references!.table} r ON x.${column.name}=r.${column.references!.column} WHERE x.${column.name} IS NOT NULL`)).concat([`SELECT source_id,'duplicate natural business key' AS reason FROM ${table.name} QUALIFY count(*) OVER (PARTITION BY ${table.key.join(",")})>1`]));
  return { sql: `WITH ${candidates}\n${checks.join("\nUNION ALL\n")}`, parameters: sources.flatMap((source) => source.parameters) };
}
function aggregateCountSql(): string {
  const bronze = BRONZE_NAMES.map((name) => `SELECT count(*) count FROM workspace.ln_premium_bronze.${name}`).join(" UNION ALL ");
  const silver = TABLES.map((table) => `SELECT count(*) count FROM workspace.ln_premium_silver.${table.name}`).join(" UNION ALL ");
  return `WITH bronze AS (${bronze}), silver AS (${silver}) SELECT (SELECT sum(count) FROM bronze) AS bronze_count,(SELECT sum(count) FROM silver) AS silver_count`;
}
function selectedCountSql(ids: readonly string[]): Query {
  const bronze = BRONZE_NAMES.map((name) => `SELECT count(*) count FROM workspace.ln_premium_bronze.${name} WHERE batch_id IN (${scopeSql(ids)})`).join(" UNION ALL ");
  const silver = TABLES.map((table) => `SELECT count(*) count FROM workspace.ln_premium_silver.${table.name} WHERE batch_id IN (${scopeSql(ids)})`).join(" UNION ALL ");
  return { sql: `WITH bronze AS (${bronze}), silver AS (${silver}) SELECT (SELECT sum(count) FROM bronze) AS bronze_count,(SELECT sum(count) FROM silver) AS silver_count`, parameters: selectionParameters(ids) };
}
function metricsQuery(): string { return oracleQuery; }
async function atomicJson(path: string, value: unknown): Promise<void> { await writeFile(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); await rename(`${path}.tmp`, path); await chmod(path, 0o600); }
async function readJson(path: string): Promise<ScaleExecutionState | undefined> { try { return JSON.parse(await readFile(path, "utf8")) as ScaleExecutionState; } catch (error: any) { if (error?.code === "ENOENT") return undefined; throw error; } }

export type SetupScaleOptions = { root?: string; execute?: (sql: string, parameters?: SqlParameter[]) => Promise<StatementResult>; get?: (path: string) => Promise<any>; now?: () => Date };
export async function setupPremiumScale(apply: boolean, options: SetupScaleOptions = {}): Promise<Record<string, unknown>> {
  const now = options.now ?? (() => new Date());
  const root = options.root ?? ROOT; const statePath = join(root, "execution-state.json");
  if (!apply) {
    const state = await readJson(statePath); const selection = state?.selectedOrdinals?.length ? selectScaleRun(state) : selectNextBundles(state?.readyOrdinals ?? []);
    if (!selection.length) return { mode: "complete", cloudCalls: 0, expected: expectedCounts(state?.readyOrdinals.length ?? 0), profile: PROFILE, warehouse: WAREHOUSE };
    const records = selection.flatMap(generateBundle); validateScaleSelection(records);
    return { mode: "dry-run", cloudCalls: 0, selectedBundleIds: selectedIds(selection), selectedEnvelopeCount: records.length, profile: PROFILE, warehouse: WAREHOUSE, writeTables: [...bronzeWriteNames, ...silverWriteTables.map((table) => table.name)], inputHash: hash(records) };
  }
  await mkdir(join(root, "runs"), { recursive: true, mode: 0o700 });
  const lockPath = join(root, "setup.lock"); const lock = await open(lockPath, "wx", 0o600).catch(() => fail("scale setup lock exists; inspect it before removal"));
  let stop: (() => void) | undefined;
  try {
  const oldState = await readJson(statePath); const selection = oldState?.selectedOrdinals?.length ? selectScaleRun(oldState) : selectNextBundles(oldState?.readyOrdinals ?? []);
  if (!selection.length) return { mode: "complete", cloudCalls: 0, expected: expectedCounts(oldState?.readyOrdinals.length ?? 0), profile: PROFILE, warehouse: WAREHOUSE };
  const records = selection.flatMap(generateBundle); validateScaleSelection(records);
  const inputHash = hash(records); const proposed = { selectedBundleIds: selectedIds(selection), selectedEnvelopeCount: records.length, profile: PROFILE, warehouse: WAREHOUSE, writeTables: [...bronzeWriteNames, ...silverWriteTables.map((table) => table.name)], inputHash };
  const runDirectory = join(root, "runs", now().toISOString().replaceAll(":", "-")); await mkdir(runDirectory, { mode: 0o700 });
  const fixture = validateFixture(await Bun.file(new URL("../fixtures/premium-harbor-works.json", import.meta.url)).json());
  let state = oldState?.selectedOrdinals.length ? oldState : createScaleExecutionState(selection, oldState?.readyOrdinals ?? []); let label = ""; let sqlHash = ""; let writes = 0; const controller = new AbortController(); const started = Date.now();
  const persist = async () => atomicJson(statePath, state);
  const get = options.get ?? ((path: string) => runDatabricksJson(["api", "get", path, "--profile", PROFILE, "--output", "json"], { timeoutMs: 15_000 }));
  const client = options.execute ? undefined : new DatabricksStatements({ profile: PROFILE, warehouseId: WAREHOUSE, signal: controller.signal, executionDeadlineMs: 120_000, onEvent: async (event) => {
    if (event.kind === "submission_intent") state.pending = { label, sqlHash };
    if (state.pending && event.statementId) state.pending.statementId = event.statementId;
    if (state.pending && event.state) state.pending.state = event.state;
    await appendFile(join(runDirectory, "statements.jsonl"), `${JSON.stringify({ at: now().toISOString(), label, ...event })}\n`, { mode: 0o600 }); await persist();
  } });
  const execute = async (nextLabel: string, sql: string, parameters: SqlParameter[] = []) => {
    if (controller.signal.aborted || Date.now() - started > 20 * 60_000) fail("run deadline or interruption prevents a new statement");
    assertScaleSql(sql); label = nextLabel; sqlHash = hash(sql);
    if (options.execute) { state.pending = { label, sqlHash }; await persist(); const result = await options.execute(sql, parameters); if (/^MERGE INTO/i.test(sql)) writes++; state.statements = [...(state.statements ?? []), { ...state.pending, state: "SUCCEEDED" }]; state.pending = undefined; await persist(); return result; }
    const result = await client!.execute(sql, parameters); if (/^MERGE INTO/i.test(sql)) writes++; state.statements = [...(state.statements ?? []), { ...state.pending, state: "SUCCEEDED" }]; state.pending = undefined; await persist(); return result;
  };
  stop = () => controller.abort(); process.once("SIGINT", stop); process.once("SIGTERM", stop);
    if (oldState?.pending) {
      if (!oldState.pending.statementId) fail("prior pending statement has no statement ID; reconcile before retry");
      const prior = await get(`/api/2.0/sql/statements/${oldState.pending.statementId}`); state = reconcileScaleState(oldState, prior.status?.state); await persist();
    }
    if (state.inputHash !== inputHash || stable(state.selectedOrdinals) !== stable(selection)) fail("saved selection or input hash differs from the deterministic target");
    await persist();
    const schema = rows(await execute("Verify inherited Predictive Optimization", "DESCRIBE SCHEMA EXTENDED workspace.ln_premium_silver"));
    if (!schema.some(hasPredictiveOptimizationEnabled)) fail("Predictive Optimization is not enabled");
    for (const table of [...BRONZE_NAMES, ...TABLES.map((item) => item.name)]) {
      const bronze = BRONZE_NAMES.includes(table as typeof BRONZE_NAMES[number]); const fullName = bronze ? `workspace.ln_premium_bronze.${table}` : `workspace.ln_premium_silver.${table}`;
      const result = await get(`/api/2.1/unity-catalog/tables/${fullName}`) as Metadata;
      const expected = bronze ? { name: table, fullName, columns: bronzeColumns, bronze: true } : { ...(TABLES.find((item) => item.name === table)!), fullName, columns: [{ name: "batch_id", type: "STRING" }, { name: "source_id", type: "STRING" }, ...(TABLES.find((item) => item.name === table)!).columns], bronze: false };
      assertTableMetadata(result, expected as never);
    }
    for (const view of GOLD_VIEWS) {
      const fullName = `workspace.ln_premium_gold.${view.name}`;
      const metadata = await get(`/api/2.1/unity-catalog/tables/${fullName}`) as Metadata;
      let definition = metadata.view_definition;
      if (view.name === "sales_metrics" && !definition) definition = (await execute("Inspect sales_metrics definition", `SHOW CREATE TABLE ${fullName}`)).rows[0]?.[0]?.match(/\$\$([\s\S]*?)\$\$/)?.[1];
      assertViewDefinition(view, metadata, definition ?? "");
    }
    const preservedRecords = [...fixture.records, ...state.readyOrdinals.flatMap(generateBundle)];
    const preservedBronze = buildPreservedBronzeDigestQuery(selectedIds(selection));
    assertPreservedBronzeDigests(rows(await execute("Verify preserved Bronze content", preservedBronze.sql, preservedBronze.parameters)), expectedBronzeDigests(preservedRecords));
    for (const table of TABLES) {
      const preserved = buildPreservedSilverComparison(table.name, selectedIds(selection));
      assertScaleExactComparison(rows(await execute(`Verify preserved ${table.name}`, preserved.sql, preserved.parameters))[0]!, table.name);
    }
    const sourceIdOverlap = buildGlobalSourceIdOverlapQuery(records, selectedIds(selection));
    if (int(rows(await execute("Check global Bronze source-ID overlap", sourceIdOverlap.sql, sourceIdOverlap.parameters))[0]?.conflict_count, "source ID conflict count") !== 0) fail("an existing Bronze source ID conflicts with the selected batch");
    for (const table of TABLES.filter((item) => !["event_financials", "artist_deal_terms"].includes(item.name))) {
      const overlap = buildGlobalKeyOverlapQuery(table.name, records, selectedIds(selection));
      if (int(rows(await execute(`Check ${table.name} global natural-key overlap`, overlap.sql, overlap.parameters))[0]?.conflict_count, `${table.name} conflict count`) !== 0) fail(`existing ${table.name} natural key conflicts with the selected batch`);
    }
    const bronzePreflight = new Map<string, { source: Query; actual: number; expected: number }>();
    for (const name of bronzeWriteNames) {
      const source = buildScaleBronzeSource(name, records); const comparison = comparisonSql(`workspace.ln_premium_bronze.${name}`, bronzeColumns, source, selectedIds(selection));
      const current = assertScaleSubsetComparison(rows(await execute(`Preflight ${name}`, comparison.sql, comparison.parameters))[0]!, name);
      bronzePreflight.set(name, { source, ...current });
    }
    const silverPreflight = new Map<string, { actual: number; expected: number }>();
    for (const table of silverWriteTables) {
      const local = buildLocalSilverCandidate(table.name, records); const columns = [{ name: "batch_id", type: "STRING" }, { name: "source_id", type: "STRING" }, ...table.columns];
      const comparison = comparisonSql(`workspace.ln_premium_silver.${table.name}`, columns, local, selectedIds(selection));
      silverPreflight.set(table.name, assertScaleSubsetComparison(rows(await execute(`Preflight selected ${table.name}`, comparison.sql, comparison.parameters))[0]!, table.name));
    }
    for (const [name, current] of bronzePreflight) if (current.actual < current.expected) await execute(`Load ${name}`, bronzeMergeSql(name, current.source.sql), current.source.parameters);
    const hashes = bronzeWriteNames.map((name) => `SELECT source_id FROM workspace.ln_premium_bronze.${name} WHERE batch_id IN (${scopeSql(selectedIds(selection))}) AND sha2(payload_json,256)<>payload_sha256`).join(" UNION ALL ");
    if ((await execute("Verify selected Bronze hashes", hashes, selectionParameters(selectedIds(selection)))).rows.length) fail("selected Bronze payload hash differs");
    for (const table of TABLES.filter((item) => !["event_financials", "artist_deal_terms"].includes(item.name))) {
      const source = buildBatchScopedSilverSource(table.name, selectedIds(selection));
      const expected = records.filter((record) => record.record_type === table.name).length;
      const result = rows(await execute(`Count selected ${table.name} candidates`, `SELECT count(*) AS candidate_count FROM (${source.sql}) selected_candidates`, source.parameters))[0]!;
      if (int(result.candidate_count, `${table.name} candidate count`) !== expected) fail(`selected ${table.name} candidate count differs`);
    }
    const candidates = buildCandidateValidationQuery(selectedIds(selection)); if ((await execute("Validate selected Silver candidates", candidates.sql, candidates.parameters)).rows.length) fail("selected Silver candidates are invalid");
    for (const table of silverWriteTables) {
      const source = buildBatchScopedSilverSource(table.name, selectedIds(selection)); const current = silverPreflight.get(table.name)!;
      if (current.actual < current.expected) await execute(`Load ${table.name}`, silverMergeSql(table.name, source.sql), source.parameters);
    }
    const afterReady = [...state.readyOrdinals, ...selection]; const expected = expectedCounts(afterReady.length); const total = rows(await execute("Verify total Bronze and Silver counts", aggregateCountSql()))[0]!; const selected = selectedCountSql(selectedIds(selection)); const current = rows(await execute("Verify selected Bronze and Silver counts", selected.sql, selected.parameters))[0]!;
    if (int(total.bronze_count, "Bronze count") !== expected.bronze || int(total.silver_count, "Silver count") !== expected.silver || int(current.bronze_count, "selected Bronze count") !== records.length || int(current.silver_count, "selected Silver count") !== records.length) fail("post-batch counts differ from the deterministic proof");
    const expectedOracle = cumulativeOracle(fixture.accepted, afterReady); const actualOracle = rows(await execute("Verify Gold aggregate oracle", metricsQuery()))[0]!;
    for (const [key, value] of Object.entries(expectedOracle)) if (String(actualOracle[key] ?? "") !== String(value)) fail(`Gold aggregate ${key} differs from the oracle`);
    const grains: Record<string, string[]> = { regional_sales: ["order_item_id"], account_attention: ["account_id"], account_artist_evidence: ["account_id", "artist_id"], upcoming_options: ["event_id", "product_id", "source"], account_event_benefits: ["account_id", "event_id", "product_id"] };
    for (const [view, keys] of Object.entries(grains)) {
      const duplicate = rows(await execute(`Verify ${view} Gold grain`, `SELECT count(*) AS duplicate_count FROM (SELECT ${keys.join(",")} FROM workspace.ln_premium_gold.${view} GROUP BY ${keys.join(",")} HAVING count(*)>1)`))[0]!;
      if (int(duplicate.duplicate_count, `${view} duplicate count`) !== 0) fail(`Gold ${view} has duplicate grain rows`);
    }
    const attention = rows(await execute("Verify bounded A100 attention", "SELECT count(*) AS account_count,max(latest_activity_at) AS latest_activity_at FROM workspace.ln_premium_gold.account_attention WHERE account_id='A100'"))[0]!;
    const option = rows(await execute("Verify A100 premier option", "SELECT count(*) AS option_count,max(available_quantity) AS available_quantity,max(unit_price) AS unit_price FROM workspace.ln_premium_gold.upcoming_options WHERE event_id='E200' AND product_id='premier-parking'"))[0]!;
    if (int(attention.account_count, "A100 account count") !== 1 || int(option.option_count, "A100 premier option count") !== 1 || Number(option.available_quantity) !== 12 || Number(option.unit_price) !== 40) fail("A100 evidence changed");
    state.completed = true; await persist();
    await atomicJson(join(runDirectory, "proof.json"), { expected, selected: records.length, oracle: expectedOracle, at: now().toISOString() });
    state = publishCompletedSelection(state, now().toISOString()); await persist();
    return { mode: "apply", writes, ...proposed, expected };
  } finally { if (stop) { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); } await lock.close(); await unlink(lockPath).catch(() => {}); }
}

if (import.meta.main) {
  const args = process.argv.slice(2); if (args.some((arg) => arg !== "--apply")) throw new Error("Usage: bun scripts/setup-premium-scale.ts [--apply]");
  console.log(JSON.stringify(await setupPremiumScale(args.includes("--apply")), null, 2));
}
