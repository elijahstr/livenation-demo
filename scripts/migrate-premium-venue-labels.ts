import { DatabricksStatements, type SqlParameter, type StatementResult } from "../src/databricks-statements";
import fixture from "../fixtures/premium-harbor-works.json" with { type: "json" };
import { BATCH_ID, canonicalJson, type Envelope, validateFixture } from "../src/premium-foundation";
import { generateBundle, TOTAL_BUNDLES } from "../src/premium-scale";

const PROFILE = "livenation-demo";
const WAREHOUSE = "976766402458e7de";
const SCALE_BATCH = "^premium-scale-v1-[0-9]{4}$";
const VENUE_COUNT = 278;
const targets = ["workspace.ln_premium_bronze.artist_catalog_raw", "workspace.ln_premium_silver.venues"] as const;
const allowedTargets = new Set<string>(targets);

type VenueLabel = { batch_id: string; source_id: string; venue_id: string; venue_name: string; payload_json: string; payload_sha256: string };
type Query = { sql: string; parameters: SqlParameter[] };
type Execute = (sql: string, parameters: SqlParameter[]) => Promise<StatementResult>;
export type VenueLabelMigrationPlan = { venues: VenueLabel[]; statements: Query[] };

function fail(message: string): never { throw new Error(`Premium venue label migration: ${message}`); }
function sourceParameter(name: string, rows: readonly object[]): SqlParameter { return { name, value: canonicalJson(rows), type: "STRING" }; }
function venueRows(): VenueLabel[] {
  const foundation = validateFixture(fixture).accepted.filter((row) => row.record_type === "venues");
  const scale = Array.from({ length: TOTAL_BUNDLES }, (_, index) => generateBundle(index + 1)).map(records => records.find(row => row.record_type === "venues")!);
  return [...foundation, ...scale].map((row: Envelope) => ({
    batch_id: row.batch_id, source_id: row.source_id, venue_id: String(row.payload.venue_id), venue_name: String(row.payload.venue_name), payload_json: canonicalJson(row.payload), payload_sha256: row.payload_sha256,
  }));
}
function expectedSource(): Query {
  return {
    sql: "SELECT x.batch_id,x.source_id,x.venue_id,x.venue_name,x.payload_json,x.payload_sha256 FROM inline(from_json(:venues,'array<struct<batch_id:string,source_id:string,venue_id:string,venue_name:string,payload_json:string,payload_sha256:string>>')) x",
    parameters: [sourceParameter("venues", venueRows())],
  };
}
function countSql(): Query {
  return { sql: `SELECT
    (SELECT count(*) FROM workspace.ln_premium_bronze.artist_catalog_raw WHERE record_type='venues' AND batch_id='${BATCH_ID}') AS foundation_venue_bronze_count,
    (SELECT count(*) FROM workspace.ln_premium_bronze.artist_catalog_raw WHERE record_type='venues' AND batch_id RLIKE '${SCALE_BATCH}') AS scale_venue_bronze_count,
    (SELECT count(*) FROM workspace.ln_premium_silver.venues WHERE batch_id='${BATCH_ID}') AS foundation_venue_silver_count,
    (SELECT count(*) FROM workspace.ln_premium_silver.venues WHERE batch_id RLIKE '${SCALE_BATCH}') AS scale_venue_silver_count`, parameters: [] };
}
function bronzeMerge(source: Query): Query {
  return { sql: `MERGE INTO ${targets[0]} t USING (${source.sql}) s ON t.batch_id=s.batch_id AND t.source_id=s.source_id WHEN MATCHED AND t.record_type='venues' THEN UPDATE SET payload_json=s.payload_json,payload_sha256=s.payload_sha256`, parameters: source.parameters };
}
function silverMerge(source: Query): Query {
  return { sql: `MERGE INTO ${targets[1]} t USING (${source.sql}) s ON t.batch_id=s.batch_id AND t.source_id=s.source_id AND t.venue_id=s.venue_id WHEN MATCHED THEN UPDATE SET venue_name=s.venue_name`, parameters: source.parameters };
}
function verificationSql(source: Query): Query {
  const bronze = `SELECT batch_id,source_id,payload_json,payload_sha256 FROM ${targets[0]} WHERE record_type='venues' AND (batch_id='${BATCH_ID}' OR batch_id RLIKE '${SCALE_BATCH}')`;
  const silver = `SELECT batch_id,source_id,venue_id,venue_name FROM ${targets[1]} WHERE batch_id='${BATCH_ID}' OR batch_id RLIKE '${SCALE_BATCH}'`;
  return { sql: `WITH expected_venues AS (${source.sql}), expected_bronze_venues AS (SELECT batch_id,source_id,payload_json,payload_sha256 FROM expected_venues), expected_silver_venues AS (SELECT batch_id,source_id,venue_id,venue_name FROM expected_venues), actual_bronze_venues AS (${bronze}), actual_silver_venues AS (${silver}), checks AS (
    SELECT 'bronze_venues' AS label,(SELECT count(*) FROM actual_bronze_venues) AS actual_count,(SELECT count(*) FROM expected_bronze_venues) AS expected_count,(SELECT count(*) FROM ((SELECT * FROM actual_bronze_venues EXCEPT SELECT * FROM expected_bronze_venues) UNION ALL (SELECT * FROM expected_bronze_venues EXCEPT SELECT * FROM actual_bronze_venues))) AS difference_count,(SELECT count(*) FROM actual_bronze_venues WHERE sha2(payload_json,256)<>payload_sha256) AS hash_mismatch
    UNION ALL
    SELECT 'silver_venues' AS label,(SELECT count(*) FROM actual_silver_venues) AS actual_count,(SELECT count(*) FROM expected_silver_venues) AS expected_count,(SELECT count(*) FROM ((SELECT * FROM actual_silver_venues EXCEPT SELECT * FROM expected_silver_venues) UNION ALL (SELECT * FROM expected_silver_venues EXCEPT SELECT * FROM actual_silver_venues))) AS difference_count,0 AS hash_mismatch
  ) SELECT label,actual_count,expected_count,difference_count,hash_mismatch FROM checks ORDER BY label`, parameters: source.parameters };
}

/** This guard accepts only the two venue migration targets and matched-update MERGEs. */
export function assertVenueLabelMigrationSql(sql: string): void {
  const code = sql.replace(/'(?:[^']|'')*'/g, " ").trim();
  if (!/^(?:SELECT\b|WITH\b|MERGE INTO\b)/i.test(code) || /;|--|\/\*|`|\b(?:DELETE|INSERT|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|REPLACE|OPTIMIZE|VACUUM)\b/i.test(code)) fail("SQL operation is not approved");
  const names = code.match(/\bworkspace\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*\b/g) ?? [];
  if (names.some(name => !allowedTargets.has(name))) fail("SQL references an unapproved object");
  if (/^MERGE INTO/i.test(code)) {
    const target = code.match(/^MERGE INTO\s+([\w.]+)/i)?.[1];
    if (!target || !allowedTargets.has(target) || !/\bWHEN MATCHED(?: AND [^\n]+)? THEN UPDATE SET\b/i.test(code) || /WHEN NOT MATCHED|\bINSERT\b/i.test(code)) fail("MERGE is not a scoped matched update");
  }
}

export function buildVenueLabelMigrationPlan(): VenueLabelMigrationPlan {
  const venues = venueRows();
  if (venues.length !== VENUE_COUNT || new Set(venues.map(row => row.source_id)).size !== VENUE_COUNT) fail("generated venue cardinality is invalid");
  const source = expectedSource();
  const statements = [countSql(), bronzeMerge(source), silverMerge(source), countSql(), verificationSql(source)];
  for (const statement of statements) assertVenueLabelMigrationSql(statement.sql);
  return { venues, statements };
}

function values(result: StatementResult): Record<string, string | null>[] { return result.rows.map(row => Object.fromEntries(result.columns.map((column, index) => [column, row[index]]))); }
function assertCounts(result: StatementResult): void {
  const row = values(result)[0]; if (!row) fail("count query returned no row");
  const expected = { foundation_venue_bronze_count: "1", scale_venue_bronze_count: "277", foundation_venue_silver_count: "1", scale_venue_silver_count: "277" };
  for (const [key, count] of Object.entries(expected)) if (row[key] !== count) fail(`${key} must equal ${count}`);
}
function assertVerification(result: StatementResult): void {
  const rows = values(result); if (rows.length !== 2) fail("verification query returned an unexpected row count");
  for (const row of rows) if (row.actual_count !== String(VENUE_COUNT) || row.expected_count !== String(VENUE_COUNT) || row.difference_count !== "0" || row.hash_mismatch !== "0") fail("venue label equality or Bronze hash verification failed");
}

export async function migratePremiumVenueLabels(apply: boolean, options: { execute?: Execute } = {}) {
  const plan = buildVenueLabelMigrationPlan();
  const summary = { targets: [...targets], venueCount: plan.venues.length };
  if (!apply) return { mode: "dry-run", cloudCalls: 0, ...summary };
  const client = options.execute ?? ((sql: string, parameters: SqlParameter[]) => new DatabricksStatements({ profile: PROFILE, warehouseId: WAREHOUSE }).execute(sql, parameters));
  let cloudCalls = 0;
  const execute = async (statement: Query) => { cloudCalls++; return client(statement.sql, statement.parameters); };
  assertCounts(await execute(plan.statements[0]!));
  await execute(plan.statements[1]!); await execute(plan.statements[2]!);
  assertCounts(await execute(plan.statements[3]!));
  assertVerification(await execute(plan.statements[4]!));
  return { mode: "apply", cloudCalls, ...summary };
}

if (import.meta.main) {
  const args = process.argv.slice(2); if (args.length > 1 || (args[0] !== undefined && args[0] !== "--apply")) throw new Error("Usage: bun scripts/migrate-premium-venue-labels.ts [--apply]");
  console.log(JSON.stringify(await migratePremiumVenueLabels(args[0] === "--apply"), null, 2));
}
