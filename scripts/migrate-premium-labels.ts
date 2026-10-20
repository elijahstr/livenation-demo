import { DatabricksStatements, type SqlParameter, type StatementResult } from "../src/databricks-statements";
import { canonicalJson, hash, type Envelope } from "../src/premium-foundation";
import { generateBundle, TOTAL_BUNDLES } from "../src/premium-scale";

const PROFILE = "livenation-demo";
const WAREHOUSE = "976766402458e7de";
const SCALE_BATCH = /^premium-scale-v1-\d{4}$/;
const targets = [
  "workspace.ln_premium_bronze.salesforce_raw",
  "workspace.ln_premium_bronze.artist_catalog_raw",
  "workspace.ln_premium_silver.accounts",
  "workspace.ln_premium_silver.artists",
] as const;
const allowedTargets = new Set<string>(targets);

type AccountLabel = { batch_id: string; source_id: string; account_id: string; account_name: string; payload_json: string; payload_sha256: string };
type ArtistLabel = { batch_id: string; source_id: string; artist_id: string; artist_name: string; payload_json: string; payload_sha256: string };
type Query = { sql: string; parameters: SqlParameter[] };
type Execute = (sql: string, parameters: SqlParameter[]) => Promise<StatementResult>;
export type LabelMigrationPlan = { accounts: AccountLabel[]; artists: ArtistLabel[]; statements: Query[] };

function fail(message: string): never { throw new Error(`Premium label migration: ${message}`); }
function sourceParameter(name: string, rows: readonly object[]): SqlParameter { return { name, value: canonicalJson(rows), type: "STRING" }; }
function accountRows(): AccountLabel[] {
  return Array.from({ length: TOTAL_BUNDLES }, (_, index) => generateBundle(index + 1)).map(records => records.find(row => row.record_type === "accounts")!).map((row: Envelope) => ({
    batch_id: row.batch_id, source_id: row.source_id, account_id: String(row.payload.account_id), account_name: String(row.payload.account_name), payload_json: canonicalJson(row.payload), payload_sha256: row.payload_sha256,
  }));
}
function artistRows(): ArtistLabel[] {
  return Array.from({ length: TOTAL_BUNDLES }, (_, index) => generateBundle(index + 1)).flatMap(records => records.filter(row => row.record_type === "artists")).map((row: Envelope) => ({
    batch_id: row.batch_id, source_id: row.source_id, artist_id: String(row.payload.artist_id), artist_name: String(row.payload.artist_name), payload_json: canonicalJson(row.payload), payload_sha256: row.payload_sha256,
  }));
}
function expectedSource(name: string, type: "accounts" | "artists"): Query {
  const rows = type === "accounts" ? accountRows() : artistRows();
  const id = type === "accounts" ? "account_id" : "artist_id";
  const label = type === "accounts" ? "account_name" : "artist_name";
  return {
    sql: `SELECT x.batch_id,x.source_id,x.${id},x.${label},x.payload_json,x.payload_sha256 FROM inline(from_json(:${name},'array<struct<batch_id:string,source_id:string,${id}:string,${label}:string,payload_json:string,payload_sha256:string>>')) x`,
    parameters: [sourceParameter(name, rows)],
  };
}
function countSql(): Query {
  return { sql: `SELECT
    (SELECT count(*) FROM workspace.ln_premium_bronze.salesforce_raw WHERE record_type='accounts' AND batch_id RLIKE '^premium-scale-v1-[0-9]{4}$') AS account_bronze_count,
    (SELECT count(*) FROM workspace.ln_premium_bronze.artist_catalog_raw WHERE record_type='artists' AND batch_id RLIKE '^premium-scale-v1-[0-9]{4}$') AS artist_bronze_count,
    (SELECT count(*) FROM workspace.ln_premium_silver.accounts WHERE batch_id RLIKE '^premium-scale-v1-[0-9]{4}$') AS account_silver_count,
    (SELECT count(*) FROM workspace.ln_premium_silver.artists WHERE batch_id RLIKE '^premium-scale-v1-[0-9]{4}$') AS artist_silver_count`, parameters: [] };
}
function bronzeMerge(table: typeof targets[number], recordType: "accounts" | "artists", source: Query): Query {
  return { sql: `MERGE INTO ${table} t USING (${source.sql}) s ON t.batch_id=s.batch_id AND t.source_id=s.source_id WHEN MATCHED AND t.record_type='${recordType}' THEN UPDATE SET payload_json=s.payload_json,payload_sha256=s.payload_sha256`, parameters: source.parameters };
}
function silverMerge(table: typeof targets[number], recordType: "accounts" | "artists", source: Query): Query {
  const id = recordType === "accounts" ? "account_id" : "artist_id";
  const label = recordType === "accounts" ? "account_name" : "artist_name";
  return { sql: `MERGE INTO ${table} t USING (${source.sql}) s ON t.batch_id=s.batch_id AND t.source_id=s.source_id AND t.${id}=s.${id} WHEN MATCHED THEN UPDATE SET ${label}=s.${label}`, parameters: source.parameters };
}
function verificationSql(accounts: Query, artists: Query): Query {
  const accountBronze = "SELECT batch_id,source_id,payload_json,payload_sha256 FROM workspace.ln_premium_bronze.salesforce_raw WHERE record_type='accounts' AND batch_id RLIKE '^premium-scale-v1-[0-9]{4}$'";
  const artistBronze = "SELECT batch_id,source_id,payload_json,payload_sha256 FROM workspace.ln_premium_bronze.artist_catalog_raw WHERE record_type='artists' AND batch_id RLIKE '^premium-scale-v1-[0-9]{4}$'";
  const accountSilver = "SELECT batch_id,source_id,account_id,account_name FROM workspace.ln_premium_silver.accounts WHERE batch_id RLIKE '^premium-scale-v1-[0-9]{4}$'";
  const artistSilver = "SELECT batch_id,source_id,artist_id,artist_name FROM workspace.ln_premium_silver.artists WHERE batch_id RLIKE '^premium-scale-v1-[0-9]{4}$'";
  return { sql: `WITH expected_accounts AS (${accounts.sql}), expected_artists AS (${artists.sql}), expected_bronze_accounts AS (SELECT batch_id,source_id,payload_json,payload_sha256 FROM expected_accounts), expected_bronze_artists AS (SELECT batch_id,source_id,payload_json,payload_sha256 FROM expected_artists), expected_silver_accounts AS (SELECT batch_id,source_id,account_id,account_name FROM expected_accounts), expected_silver_artists AS (SELECT batch_id,source_id,artist_id,artist_name FROM expected_artists), actual_bronze_accounts AS (${accountBronze}), actual_bronze_artists AS (${artistBronze}), actual_silver_accounts AS (${accountSilver}), actual_silver_artists AS (${artistSilver}), checks AS (
    SELECT 'bronze_accounts' AS label,(SELECT count(*) FROM actual_bronze_accounts) AS actual_count,(SELECT count(*) FROM expected_bronze_accounts) AS expected_count,(SELECT count(*) FROM ((SELECT * FROM actual_bronze_accounts EXCEPT SELECT * FROM expected_bronze_accounts) UNION ALL (SELECT * FROM expected_bronze_accounts EXCEPT SELECT * FROM actual_bronze_accounts))) AS difference_count,(SELECT count(*) FROM actual_bronze_accounts WHERE sha2(payload_json,256)<>payload_sha256) AS hash_mismatch
    UNION ALL
    SELECT 'bronze_artists' AS label,(SELECT count(*) FROM actual_bronze_artists) AS actual_count,(SELECT count(*) FROM expected_bronze_artists) AS expected_count,(SELECT count(*) FROM ((SELECT * FROM actual_bronze_artists EXCEPT SELECT * FROM expected_bronze_artists) UNION ALL (SELECT * FROM expected_bronze_artists EXCEPT SELECT * FROM actual_bronze_artists))) AS difference_count,(SELECT count(*) FROM actual_bronze_artists WHERE sha2(payload_json,256)<>payload_sha256) AS hash_mismatch
    UNION ALL
    SELECT 'silver_accounts' AS label,(SELECT count(*) FROM actual_silver_accounts) AS actual_count,(SELECT count(*) FROM expected_silver_accounts) AS expected_count,(SELECT count(*) FROM ((SELECT * FROM actual_silver_accounts EXCEPT SELECT * FROM expected_silver_accounts) UNION ALL (SELECT * FROM expected_silver_accounts EXCEPT SELECT * FROM actual_silver_accounts))) AS difference_count,0 AS hash_mismatch
    UNION ALL
    SELECT 'silver_artists' AS label,(SELECT count(*) FROM actual_silver_artists) AS actual_count,(SELECT count(*) FROM expected_silver_artists) AS expected_count,(SELECT count(*) FROM ((SELECT * FROM actual_silver_artists EXCEPT SELECT * FROM expected_silver_artists) UNION ALL (SELECT * FROM expected_silver_artists EXCEPT SELECT * FROM actual_silver_artists))) AS difference_count,0 AS hash_mismatch
  ) SELECT label,actual_count,expected_count,difference_count,hash_mismatch FROM checks ORDER BY label`, parameters: [...accounts.parameters, ...artists.parameters] };
}

/** This guard accepts only the four migration targets and matched-update MERGEs. */
export function assertLabelMigrationSql(sql: string): void {
  const code = sql.replace(/'(?:[^']|'')*'/g, " ").trim();
  if (!/^(?:SELECT\b|WITH\b|MERGE INTO\b)/i.test(code) || /;|--|\/\*|`|\b(?:DELETE|INSERT|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|REPLACE|OPTIMIZE|VACUUM)\b/i.test(code)) fail("SQL operation is not approved");
  const names = code.match(/\bworkspace\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*\b/g) ?? [];
  if (names.some(name => !allowedTargets.has(name))) fail("SQL references an unapproved object");
  if (/^MERGE INTO/i.test(code)) {
    const target = code.match(/^MERGE INTO\s+([\w.]+)/i)?.[1];
    if (!target || !allowedTargets.has(target) || !/\bWHEN MATCHED(?: AND [^\n]+)? THEN UPDATE SET\b/i.test(code) || /WHEN NOT MATCHED|\bINSERT\b/i.test(code)) fail("MERGE is not a scoped matched update");
  }
}

export function buildLabelMigrationPlan(): LabelMigrationPlan {
  const accounts = accountRows(); const artists = artistRows();
  if (accounts.length !== 277 || artists.length !== 554 || new Set(accounts.map(row => row.source_id)).size !== 277 || new Set(artists.map(row => row.source_id)).size !== 554) fail("generated label cardinality is invalid");
  const accountSource = expectedSource("accounts", "accounts"); const artistSource = expectedSource("artists", "artists");
  const statements = [countSql(), bronzeMerge(targets[0], "accounts", accountSource), bronzeMerge(targets[1], "artists", artistSource), silverMerge(targets[2], "accounts", accountSource), silverMerge(targets[3], "artists", artistSource), countSql(), verificationSql(accountSource, artistSource)];
  for (const statement of statements) assertLabelMigrationSql(statement.sql);
  return { accounts, artists, statements };
}

function values(result: StatementResult): Record<string, string | null>[] { return result.rows.map(row => Object.fromEntries(result.columns.map((column, index) => [column, row[index]]))); }
function exactCount(row: Record<string, string | null>, key: string, expected: number): void { if (row[key] !== String(expected)) fail(`${key} must equal ${expected}`); }
function assertCounts(result: StatementResult): void {
  const row = values(result)[0]; if (!row) fail("count query returned no row");
  exactCount(row, "account_bronze_count", 277); exactCount(row, "artist_bronze_count", 554); exactCount(row, "account_silver_count", 277); exactCount(row, "artist_silver_count", 554);
}
function assertVerification(result: StatementResult): void {
  const rows = values(result); if (rows.length !== 4) fail("verification query returned an unexpected row count");
  for (const row of rows) {
    const expected = row.label === "bronze_accounts" || row.label === "silver_accounts" ? 277 : row.label === "bronze_artists" || row.label === "silver_artists" ? 554 : 0;
    if (!expected || row.actual_count !== String(expected) || row.expected_count !== String(expected) || row.difference_count !== "0" || row.hash_mismatch !== "0") fail("label equality or Bronze hash verification failed");
  }
}

export async function migratePremiumLabels(apply: boolean, options: { execute?: Execute } = {}) {
  const plan = buildLabelMigrationPlan();
  const summary = { targets: [...targets], accountCount: plan.accounts.length, artistCount: plan.artists.length, note: "All company labels are fictional. Artist names identify artists only and do not imply endorsement or participation." };
  if (!apply) return { mode: "dry-run", cloudCalls: 0, ...summary };
  const client = options.execute ?? ((sql: string, parameters: SqlParameter[]) => new DatabricksStatements({ profile: PROFILE, warehouseId: WAREHOUSE }).execute(sql, parameters));
  let cloudCalls = 0;
  const execute = async (statement: Query) => { cloudCalls++; return client(statement.sql, statement.parameters); };
  assertCounts(await execute(plan.statements[0]!));
  for (const statement of plan.statements.slice(1, 5)) await execute(statement);
  assertCounts(await execute(plan.statements[5]!));
  assertVerification(await execute(plan.statements[6]!));
  return { mode: "apply", cloudCalls, ...summary };
}

if (import.meta.main) {
  const args = process.argv.slice(2); if (args.length > 1 || (args[0] !== undefined && args[0] !== "--apply")) throw new Error("Usage: bun scripts/migrate-premium-labels.ts [--apply]");
  console.log(JSON.stringify(await migratePremiumLabels(args[0] === "--apply"), null, 2));
}
