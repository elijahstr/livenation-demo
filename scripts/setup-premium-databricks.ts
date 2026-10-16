import { appendFile, mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabricksStatements, runDatabricksJson, type SqlParameter, type StatementResult } from "../src/databricks-statements";
import { AS_OF, BATCH_ID, BRONZE_NAMES, GOLD_VIEWS, MARKER, TABLES, buildBronzeSource, candidateValidationSql, canonicalJson, hash, silverCandidateSql, validateFixture, type Column } from "../src/premium-foundation";

const PROFILE = "livenation-demo";
const WAREHOUSE = "976766402458e7de";
const schemas = ["ln_premium_bronze", "ln_premium_silver", "ln_premium_gold"];
const views = GOLD_VIEWS;
const bronzeColumns: Column[] = [
  { name: "batch_id", type: "STRING" }, { name: "source_id", type: "STRING" },
  { name: "record_type", type: "STRING" }, { name: "source_system", type: "STRING" },
  { name: "ingested_at", type: "TIMESTAMP" }, { name: "synthetic", type: "BOOLEAN" },
  { name: "payload_json", type: "STRING" }, { name: "payload_sha256", type: "STRING" },
];
const tables = [
  ...BRONZE_NAMES.map(name => ({ name, fullName: `workspace.ln_premium_bronze.${name}`, columns: bronzeColumns, key: ["batch_id", "source_id"], bronze: true })),
  ...TABLES.map(table => ({ ...table, fullName: `workspace.ln_premium_silver.${table.name}`, columns: [{ name: "batch_id", type: "STRING" }, { name: "source_id", type: "STRING" }, ...table.columns], bronze: false })),
];
const allowedNames = new Set([...schemas.map(name => `workspace.${name}`), ...tables.map(t => t.fullName), ...views.map(v => `workspace.ln_premium_gold.${v.name}`)]);
type Query = { sql: string; parameters: SqlParameter[] };
type Metadata = { name: string; full_name: string; table_type: string; data_source_format?: string; comment?: string; columns?: { name: string; type_text: string; nullable?: boolean; mask?: unknown }[]; view_definition?: string; row_filter?: unknown; properties?: Record<string, string> };

/** A scope check for this fixed SQL builder, not a general SQL sandbox. Values use parameters. */
export function assertFoundationSql(sql: string): void {
  // Preserve YAML for its source check; remove SQL literals before keyword checks.
  const yaml = sql.match(/\$\$([\s\S]*?)\$\$/)?.[1];
  if (yaml && (!sql.startsWith("CREATE VIEW workspace.ln_premium_gold.sales_metrics WITH METRICS LANGUAGE YAML AS $$") || !yaml.includes("source: workspace.ln_premium_gold.regional_sales"))) throw new Error("Unexpected metric view scope");
  const code = sql.replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/'(?:[^']|'')*'/g, " ");
  if (!/^(?:SELECT\b|WITH\b|DESCRIBE HISTORY\b|SHOW CREATE TABLE\b|CREATE (?:SCHEMA|TABLE|VIEW)\b|MERGE INTO\b)/.test(code)) throw new Error("Statement operation is not allowed");
  if (/;|--|\/\*|`|\b(?:DROP|TRUNCATE|DELETE|UPDATE|ALTER|GRANT|REVOKE|REPLACE|LOCATION|CATALOG)\b/i.test(code)) throw new Error("Unsafe statement operation");
  if (/\bworkspace\.livenation_demo\b/i.test(sql)) throw new Error("The existing demo is outside this write scope");
  const names = code.match(/\b[a-zA-Z_][\w]*\.[a-zA-Z_][\w]*\.[a-zA-Z_][\w]*\b/g) ?? [];
  if (names.some(name => !allowedNames.has(name))) throw new Error("Statement references an unapproved object");
  if (/^MERGE/.test(code) && (!/WHEN NOT MATCHED THEN INSERT/.test(code) || /WHEN MATCHED|NOT MATCHED BY/.test(code))) throw new Error("Only insert-only MERGE is allowed");
  const mutation = code.match(/^(?:CREATE (?:SCHEMA|TABLE|VIEW)(?: IF NOT EXISTS)?|MERGE INTO)\s+([\w.]+)/)?.[1];
  if (mutation && !allowedNames.has(mutation)) throw new Error("Mutation target is not allowed");
}

export function assertTableMetadata(actual: Metadata, expected: typeof tables[number]): void {
  if (!actual || actual.full_name !== expected.fullName || actual.table_type !== "MANAGED" || actual.data_source_format !== "DELTA" || actual.comment !== MARKER) throw new Error(`Foreign table or marker: ${expected.fullName}`);
  if (actual.row_filter || actual.columns?.some(c => c.mask)) throw new Error(`Unexpected policy on ${expected.fullName}`);
  const shape = (columns: { name: string; type_text: string }[]) => columns.map(c => [c.name, c.type_text.replace(/\s/g, "").toUpperCase()]);
  if (canonicalJson(shape(actual.columns ?? [])) !== canonicalJson(shape(expected.columns.map(c => ({ name: c.name, type_text: c.type }))))) throw new Error(`Changed column shape: ${expected.fullName}`);
}

function createTable(table: typeof tables[number]): string {
  return `CREATE TABLE ${table.fullName} (${table.columns.map(c => `${c.name} ${c.type}${c.nullable ? "" : " NOT NULL"}`).join(", ")}) USING DELTA COMMENT '${MARKER}' TBLPROPERTIES ('demo_project'='livenation-premium', 'batch'='foundation-v1')`;
}
function insertOnly(table: typeof tables[number], source: string): string {
  return `MERGE INTO ${table.fullName} t USING (${source}) s ON t.batch_id=s.batch_id AND t.source_id=s.source_id WHEN NOT MATCHED THEN INSERT (${table.columns.map(c => c.name).join(", ")}) VALUES (${table.columns.map(c => `s.${c.name}`).join(", ")})`;
}
export function comparisonSql(fullName: string, columns: Column[], source: string): string {
  if (!allowedNames.has(fullName)) throw new Error("Unknown comparison table");
  const fields = columns.map(c => c.name).join(", ");
  return `WITH expected AS (${source}), actual AS (SELECT ${fields} FROM ${fullName} WHERE batch_id='${BATCH_ID}'), conflicts AS (SELECT ${fields} FROM actual EXCEPT SELECT ${fields} FROM expected), duplicates AS (SELECT batch_id, source_id FROM actual GROUP BY batch_id, source_id HAVING count(*)>1) SELECT (SELECT count(*) FROM actual) AS actual_count, (SELECT count(*) FROM expected) AS expected_count, (SELECT count(*) FROM conflicts) AS conflicts, (SELECT count(*) FROM duplicates) AS duplicates`;
}
function rows(result: StatementResult): Record<string, string | null>[] { return result.rows.map(row => Object.fromEntries(result.columns.map((name, i) => [name, row[i]]))); }
function assertComparison(row: Record<string, string | null>, name: string): number {
  if (!row || ["conflicts", "duplicates", "actual_count", "expected_count"].some(key => row[key] === null || !/^\d+$/.test(row[key] ?? "")) || Number(row.conflicts) !== 0 || Number(row.duplicates) !== 0 || Number(row.actual_count) > Number(row.expected_count)) throw new Error(`Extra, duplicate, or changed rows: ${name}`);
  return Number(row.actual_count);
}
async function atomicJson(path: string, value: unknown) {
  await writeFile(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}
const normalizeDefinition = (s: string) => s.trim().replace(/\r\n/g, "\n");

export function assertViewDefinition(view: { name: string; definition: string }, actual: Metadata, definition: string): void {
  const metric = view.name === "sales_metrics";
  if (!actual || actual.table_type !== (metric ? "METRIC_VIEW" : "VIEW") || !definition) throw new Error(`Unexpected or hidden view: ${view.name}`);
  let sameDefinition: boolean;
  if (metric) {
    // Unity Catalog moves the top-level YAML comment to TableInfo.comment.
    const expected = Bun.YAML.parse(view.definition) as Record<string, unknown>;
    const stored = Bun.YAML.parse(definition) as Record<string, unknown>;
    if (actual.comment !== MARKER || expected.comment !== MARKER || (stored.comment !== undefined && stored.comment !== MARKER)) throw new Error("Metric ownership marker is absent or changed");
    delete expected.comment; delete stored.comment;
    sameDefinition = canonicalJson(stored) === canonicalJson(expected);
  } else {
    if (actual.comment !== `${MARKER}; definition_sha256=${hash(view.definition)}`) throw new Error(`Foreign view marker: ${view.name}`);
    sameDefinition = normalizeDefinition(definition) === normalizeDefinition(view.definition);
  }
  if (!sameDefinition) throw new Error(`Changed view definition: ${view.name}`);
  if (/(event_financials|artist_deal_terms|finance_raw)/.test(definition)) throw new Error(`Finance dependency in Gold: ${view.name}`);
}

export async function setupPremium(apply: boolean): Promise<unknown> {
  const fixture = validateFixture(await Bun.file(new URL("../fixtures/premium-harbor-works.json", import.meta.url)).json());
  if (canonicalJson(fixture.metrics) !== canonicalJson({ net_admission_revenue: "300.00", net_parking_revenue: "40.00", valid_admission_tickets: 3, admission_buying_accounts: 1 })) throw new Error("Fixture differs from the locked teaching totals");
  const sourceFor = (table: typeof tables[number], live: boolean): Query => {
    if (table.bronze) return buildBronzeSource(table.name as typeof BRONZE_NAMES[number], fixture);
    let sql = silverCandidateSql(table.name);
    const parameters: SqlParameter[] = [];
    if (live) sql = `SELECT * FROM (${sql}) foundation_candidate WHERE batch_id='${BATCH_ID}'`;
    else for (const name of BRONZE_NAMES) {
      if (!sql.includes(`workspace.ln_premium_bronze.${name}`)) continue;
      const source = buildBronzeSource(name, fixture);
      const parameter = `${name}_records`;
      sql = sql.replaceAll(`workspace.ln_premium_bronze.${name}`, `(${source.sql.replaceAll(":records", `:${parameter}`)})`);
      parameters.push({ ...source.parameters[0], name: parameter });
    }
    return { sql, parameters };
  };
  const proposed = { schemas: schemas.map(s => `workspace.${s}`), tables: tables.map(t => t.fullName), views: views.map(v => `workspace.ln_premium_gold.${v.name}`), rawRecords: fixture.records.length, acceptedRecords: fixture.accepted.length, rejected: fixture.rejected, expectedMetrics: fixture.metrics, fixtureHash: fixture.fixtureHash };
  for (const table of tables) { assertFoundationSql(createTable(table)); assertFoundationSql(insertOnly(table, sourceFor(table, true).sql)); }
  for (const view of views) assertFoundationSql(view.sql);
  assertFoundationSql(candidateValidationSql());
  if (!apply) return { mode: "dry-run", cloudCalls: 0, ...proposed };

  const directory = new URL("../outputs/premium-databricks/", import.meta.url).pathname;
  await mkdir(directory, { recursive: true });
  const lockPath = join(directory, "setup.lock");
  const lock = await open(lockPath, "wx", 0o600).catch(() => { throw new Error("Foundation setup lock exists. Check its PID before manual removal."); });
  await lock.writeFile(JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
  const runId = new Date().toISOString().replaceAll(":", "-");
  const runDirectory = join(directory, runId);
  await mkdir(runDirectory);
  const statePath = join(directory, "execution-state.json");
  let state: { pending?: { label: string; sqlHash: string; statementId?: string; state?: string }; [key: string]: unknown } = {};
  let label = ""; let sqlHash = ""; let writes = 0;
  const started = Date.now();
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on("SIGTERM", stop); process.on("SIGINT", stop);
  const get = (path: string) => runDatabricksJson(["api", "get", path, "--profile", PROFILE, "--output", "json"], { timeoutMs: 15_000 });
  const executor = new DatabricksStatements({ profile: PROFILE, warehouseId: WAREHOUSE, signal: controller.signal, onEvent: async event => {
    if (event.kind === "submission_intent") state.pending = { label, sqlHash };
    if (state.pending && event.statementId) state.pending.statementId = event.statementId;
    if (state.pending && event.state) state.pending.state = event.state;
    if (["SUCCEEDED", "FAILED", "CANCELED", "CLOSED"].includes(event.state ?? "")) delete state.pending;
    await appendFile(join(runDirectory, "statements.jsonl"), JSON.stringify({ at: new Date().toISOString(), label, ...event }) + "\n", { mode: 0o600 });
    await atomicJson(statePath, state);
  }});
  const execute = async (description: string, sql: string, parameters: SqlParameter[] = []) => {
    if (controller.signal.aborted || Date.now() - started > 20 * 60_000) throw new Error("Setup deadline or interruption; no next statement was submitted");
    assertFoundationSql(sql); label = description; sqlHash = hash(sql);
    console.log(description);
    const result = await executor.execute(sql, parameters);
    if (/^(CREATE|MERGE)/.test(sql)) writes++;
    return result;
  };
  const readMetadata = async () => {
    const response = await get("/api/2.1/unity-catalog/schemas?catalog_name=workspace&max_results=100");
    if (response.next_page_token) throw new Error("Schema metadata exceeds the small preflight bound");
    const owned = new Set<string>(); const objects = new Map<string, Metadata>();
    for (const name of schemas) {
      const schema = response.schemas?.find((s: any) => s.name === name);
      if (!schema) continue;
      if (schema.comment !== MARKER) throw new Error(`Foreign schema: ${name}`);
      owned.add(name);
      const listed = await get(`/api/2.1/unity-catalog/tables?catalog_name=workspace&schema_name=${name}&max_results=100`);
      if (listed.next_page_token) throw new Error(`Unexpected object count in ${name}`);
      for (const item of listed.tables ?? []) {
        const fullName = `workspace.${name}.${item.name}`;
        if (!allowedNames.has(fullName)) throw new Error(`Unexpected object: ${fullName}`);
        objects.set(fullName, await get(`/api/2.1/unity-catalog/tables/${fullName}`));
      }
    }
    return { owned, objects };
  };
  const verifyView = async (view: typeof views[number], actual: Metadata) => {
    const metric = view.name === "sales_metrics";
    if (!actual || actual.table_type !== (metric ? "METRIC_VIEW" : "VIEW")) throw new Error(`Unexpected view type: ${view.name}`);
    let definition = actual.view_definition;
    if (metric && !definition) {
      const ddl = (await execute(`Inspect ${view.name} definition`, `SHOW CREATE TABLE workspace.ln_premium_gold.${view.name}`)).rows[0]?.[0];
      definition = ddl?.match(/\$\$([\s\S]*?)\$\$/)?.[1];
    }
    assertViewDefinition(view, actual, definition ?? "");
  };
  try {
    try { state = JSON.parse(await readFile(statePath, "utf8")); } catch (error: any) { if (error.code !== "ENOENT") throw error; }
    if (state.pending) {
      if (!state.pending.statementId) throw new Error("Prior submission outcome is unknown. Reconcile query history before retry.");
      const prior = await get(`/api/2.0/sql/statements/${state.pending.statementId}`);
      if (!["SUCCEEDED", "FAILED", "CANCELED", "CLOSED"].includes(prior.status?.state)) throw new Error("Prior statement is not terminal. No new statement is allowed.");
      delete state.pending; await atomicJson(statePath, state);
    }
    const warehouse = await get(`/api/2.0/sql/warehouses/${WAREHOUSE}`);
    if (warehouse.cluster_size !== "2X-Small" || !warehouse.enable_serverless_compute || warehouse.auto_stop_mins !== 10) throw new Error("Warehouse configuration changed; review its cost scope");
    const before = await readMetadata();
    for (const table of tables) { const existing = before.objects.get(table.fullName); if (existing) assertTableMetadata(existing, table); }
    // Timestamp casts contain explicit offsets. Local-date expressions also require UTC session display semantics.
    const environment = rows(await execute("Check warehouse runtime and timezone", "SELECT current_timezone() AS timezone, version() AS version"))[0];
    if (!["UTC", "Etc/UTC"].includes(environment?.timezone ?? "")) throw new Error("Warehouse session timezone must be UTC for this frozen fixture");
    for (const view of views) { const existing = before.objects.get(`workspace.ln_premium_gold.${view.name}`); if (existing) await verifyView(view, existing); }
    const countsBefore: Record<string, number> = {};
    // Check every existing table against the complete local fixture BEFORE the first mutation.
    for (const table of tables) {
      if (!before.objects.has(table.fullName)) { countsBefore[table.fullName] = 0; continue; }
      const expected = sourceFor(table, false);
      const comparison = rows(await execute(`Preflight ${table.name}`, comparisonSql(table.fullName, table.columns, expected.sql), expected.parameters))[0];
      countsBefore[table.fullName] = assertComparison(comparison, table.fullName);
    }
    await atomicJson(join(runDirectory, "preflight.json"), { ...proposed, countsBefore, environment, warehouse: { state: warehouse.state, channel: warehouse.channel, auto_stop_mins: warehouse.auto_stop_mins } });
    for (const name of schemas) if (!before.owned.has(name)) await execute(`Create ${name}`, `CREATE SCHEMA workspace.${name} COMMENT '${MARKER}'`);
    for (const table of tables) if (!before.objects.has(table.fullName)) await execute(`Create ${table.name}`, createTable(table));
    for (const table of tables.filter(t => t.bronze)) {
      const source = sourceFor(table, true);
      const comparison = rows(await execute(`Check ${table.name} source conflict`, comparisonSql(table.fullName, table.columns, source.sql), source.parameters))[0];
      const count = assertComparison(comparison, table.fullName);
      if (count < Number(comparison.expected_count)) await execute(`Load ${table.name}`, insertOnly(table, source.sql), source.parameters);
    }
    const hashChecks = BRONZE_NAMES.map(name => `SELECT source_id FROM workspace.ln_premium_bronze.${name} WHERE sha2(payload_json,256) <> payload_sha256`).join(" UNION ALL ");
    if ((await execute("Verify Bronze payload hashes", hashChecks)).rows.length) throw new Error("Bronze payload hash mismatch");
    const rejected = rows(await execute("Validate all Bronze candidate relationships", candidateValidationSql()));
    if (canonicalJson(rejected) !== canonicalJson(fixture.rejected)) throw new Error("Server candidate rejections differ from the expected bad venue");
    await atomicJson(join(runDirectory, "validation-report.json"), { rejected, accepted: fixture.accepted.length, as_of: AS_OF });
    for (const table of tables.filter(t => !t.bronze)) {
      const source = sourceFor(table, true);
      const comparison = rows(await execute(`Check ${table.name} source conflict`, comparisonSql(table.fullName, table.columns, source.sql)))[0];
      const count = assertComparison(comparison, table.fullName);
      if (count < Number(comparison.expected_count)) await execute(`Load ${table.name}`, insertOnly(table, source.sql));
    }
    const contents: Record<string, { count: number; contentHash: string }> = {};
    const versions: Record<string, string | null> = {};
    for (const table of tables) {
      const expected = sourceFor(table, false);
      const comparison = rows(await execute(`Verify ${table.name} content`, comparisonSql(table.fullName, table.columns, expected.sql), expected.parameters))[0];
      const count = assertComparison(comparison, table.fullName);
      if (count !== Number(comparison.expected_count)) throw new Error(`Incomplete table: ${table.name}`);
      const fields = table.columns.map(c => c.name).join(", ");
      const content = await execute(`Capture ${table.name} content hash`, `SELECT ${fields} FROM ${table.fullName} WHERE batch_id='${BATCH_ID}' ORDER BY batch_id, source_id`);
      contents[table.fullName] = { count, contentHash: hash(content.rows) };
      const history = rows(await execute(`Capture ${table.name} Delta version`, `DESCRIBE HISTORY ${table.fullName} LIMIT 1`));
      versions[table.fullName] = history[0]?.version ?? null;
    }
    const bronzeCount = Object.entries(contents).filter(([name]) => name.includes("_bronze.")).reduce((sum, [, item]) => sum + item.count, 0);
    const silverCount = Object.entries(contents).filter(([name]) => name.includes("_silver.")).reduce((sum, [, item]) => sum + item.count, 0);
    if (bronzeCount !== 28 || silverCount !== 27) throw new Error("Unexpected foundation row totals");
    for (const view of views) if (!before.objects.has(`workspace.ln_premium_gold.${view.name}`)) await execute(`Create Gold ${view.name}`, view.sql);
    const finalMetadata = await readMetadata();
    for (const table of tables) assertTableMetadata(finalMetadata.objects.get(table.fullName)!, table);
    for (const view of views) await verifyView(view, finalMetadata.objects.get(`workspace.ln_premium_gold.${view.name}`)!);
    const grains: Record<string, string[]> = { regional_sales: ["order_item_id"], account_attention: ["account_id"], account_artist_evidence: ["account_id", "artist_id"], upcoming_options: ["event_id", "product_id", "source"], account_event_benefits: ["account_id", "event_id", "product_id"] };
    for (const view of GOLD_VIEWS.filter(view => view.name !== "sales_metrics")) {
      const name = `workspace.ln_premium_gold.${view.name}`;
      const duplicate = rows(await execute(`Verify ${view.name} grain`, `SELECT count(*) AS duplicate_count FROM (SELECT ${grains[view.name].join(", ")} FROM ${name} GROUP BY ${grains[view.name].join(", ")} HAVING count(*)>1)`))[0];
      if (Number(duplicate?.duplicate_count) !== 0) throw new Error(`Duplicate Gold grain: ${view.name}`);
    }
    const attention = rows(await execute("Capture A100 attention", "SELECT account_id,contract_id,latest_order_id FROM workspace.ln_premium_gold.account_attention WHERE account_id='A100'"));
    const artist = rows(await execute("Capture A100 artist evidence", "SELECT account_id,purchased_admission_tickets,accepted_ticket_uses FROM workspace.ln_premium_gold.account_artist_evidence WHERE account_id='A100'"));
    const options = rows(await execute("Capture A100 option", "SELECT event_id,product_id,available_quantity,unit_price FROM workspace.ln_premium_gold.upcoming_options WHERE event_id='E200' AND product_id='premier-parking'"));
    const benefits = rows(await execute("Capture A100 benefits", "SELECT account_id,event_id,product_id,included_quantity,purchased_quantity FROM workspace.ln_premium_gold.account_event_benefits WHERE account_id='A100' AND event_id='E200'"));
    const general = benefits.find(row => row.product_id === "general-parking");
    const premier = benefits.find(row => row.product_id === "premier-parking");
    if (attention.length !== 1 || attention[0].account_id !== "A100" || attention[0].contract_id !== "CT100" || attention[0].latest_order_id !== "O100" || artist.length !== 1 || Number(artist[0].purchased_admission_tickets) !== 3 || Number(artist[0].accepted_ticket_uses) !== 3 || options.length !== 1 || options[0].event_id !== "E200" || Number(options[0].available_quantity) !== 12 || Number(options[0].unit_price) !== 40 || !general || Number(general.included_quantity) !== 1 || !premier || Number(premier.included_quantity) + Number(premier.purchased_quantity) !== 0) throw new Error("Gold evidence differs from the Harbor Works teaching example");
    const foundationOracle = `WITH regional_sales AS (${GOLD_VIEWS.find(view => view.name === "regional_sales")!.definition.replace(/workspace\.ln_premium_silver\.([a-z_]+)/g, "(SELECT * FROM workspace.ln_premium_silver.$1 WHERE batch_id='" + BATCH_ID + "')")}) SELECT SUM(admission_net_amount) AS net_admission_revenue,SUM(parking_net_amount) AS net_parking_revenue,SUM(valid_admission_quantity) AS valid_admission_tickets,COUNT(DISTINCT admission_account_id) AS admission_buying_accounts FROM regional_sales`;
    const oracle = rows(await execute("Query foundation Silver oracle", foundationOracle));
    const metric = oracle;
    const matches = (row: Record<string, string | null>) => row && Object.entries(fixture.metrics).every(([name, value]) => Number(row[name]) === Number(value));
    if (oracle.length !== 1 || !matches(oracle[0])) throw new Error("Foundation Silver metrics differ from the independent fixture oracle");
    const stable = { fixtureHash: fixture.fixtureHash, batch_id: BATCH_ID, as_of: AS_OF, contents, definitions: Object.fromEntries(views.map(v => [v.name, hash(v.definition)])), metrics: fixture.metrics };
    const goldEvidence = { attention, artist, options, benefits };
    const manifest = { published: true, stable, stableHash: hash(stable), run: { runId, writes, versions, warehouseAutoStopMinutes: 10 }, goldEvidence, metric, oracle };
    await atomicJson(join(runDirectory, "manifest.json"), manifest);
    return { ...proposed, published: true, writes, bronzeCount, silverCount, stableHash: manifest.stableHash, manifest: join(runDirectory, "manifest.json"), metrics: metric };
  } catch (error) {
    await atomicJson(join(runDirectory, "failure.json"), { published: false, label, pending: state.pending, error: error instanceof Error ? error.message : "Unknown setup failure" });
    throw error;
  } finally {
    process.off("SIGTERM", stop); process.off("SIGINT", stop);
    await lock.close(); await unlink(lockPath);
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--apply") || args.length > 1) throw new Error("Usage: bun scripts/setup-premium-databricks.ts [--apply]");
  console.log(JSON.stringify(await setupPremium(args.includes("--apply")), null, 2));
}
