import { expect, test } from "bun:test";
import { access, chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertFoundationSql, assertTableMetadata, assertViewDefinition, comparisonSql } from "../scripts/setup-premium-databricks";
import { GOLD_VIEWS, MARKER, METRIC_VIEW } from "../src/premium-foundation";

test("metric metadata can hold the YAML comment without hiding definition drift", () => {
  const stored = METRIC_VIEW.definition.replace(/^comment:.*\n/, "");
  const metadata = { name: "sales_metrics", full_name: "workspace.ln_premium_gold.sales_metrics", table_type: "METRIC_VIEW", comment: MARKER };
  expect(() => assertViewDefinition(METRIC_VIEW, metadata, stored)).not.toThrow();
  expect(() => assertViewDefinition(METRIC_VIEW, { ...metadata, comment: "foreign" }, stored)).toThrow("ownership marker");
  expect(() => assertViewDefinition(METRIC_VIEW, metadata, stored.replace("SUM(admission_net_amount)", "SUM(parking_net_amount)"))).toThrow("Changed view definition");
});

const bronzeColumns = [
  { name: "batch_id", type: "STRING" }, { name: "source_id", type: "STRING" },
  { name: "record_type", type: "STRING" }, { name: "source_system", type: "STRING" },
  { name: "ingested_at", type: "TIMESTAMP" }, { name: "synthetic", type: "BOOLEAN" },
  { name: "payload_json", type: "STRING" }, { name: "payload_sha256", type: "STRING" },
];
const expectedBronze = { fullName: "workspace.ln_premium_bronze.salesforce_raw", columns: bronzeColumns };
const completeMetadata = {
  name: "salesforce_raw", full_name: expectedBronze.fullName, table_type: "MANAGED", data_source_format: "DELTA", comment: MARKER,
  columns: bronzeColumns.map(({ name, type }) => ({ name, type_text: type })),
};

test("the fixed SQL guard accepts generated scope and rejects unsafe mutations", () => {
  const source = "SELECT batch_id, source_id, record_type, source_system, ingested_at, synthetic, payload_json, payload_sha256 FROM workspace.ln_premium_bronze.salesforce_raw";
  const compare = comparisonSql(expectedBronze.fullName, bronzeColumns, source);
  for (const sql of ["CREATE SCHEMA workspace.ln_premium_bronze COMMENT 'livenation-premium foundation-v1'", `CREATE TABLE ${expectedBronze.fullName} (batch_id STRING) USING DELTA`, `MERGE INTO ${expectedBronze.fullName} t USING (${source}) s ON t.batch_id=s.batch_id WHEN NOT MATCHED THEN INSERT (batch_id) VALUES (s.batch_id)`, compare, ...GOLD_VIEWS.map(view => view.sql)]) assertFoundationSql(sql);
  for (const sql of [
    `DROP TABLE ${expectedBronze.fullName}`,
    "DELETE FROM workspace.ln_premium_bronze.salesforce_raw",
    "CREATE TABLE workspace.livenation_demo.injected (id STRING)",
    "CREATE TABLE workspace.other_schema.injected (id STRING)",
    `SELECT * FROM ${expectedBronze.fullName}; DROP TABLE ${expectedBronze.fullName}`,
    `MERGE INTO ${expectedBronze.fullName} t USING (${source}) s ON t.batch_id=s.batch_id WHEN MATCHED THEN UPDATE SET batch_id=s.batch_id`,
  ]) expect(() => assertFoundationSql(sql)).toThrow();
});

test("metadata requires the exact managed Delta shape and no row policy or mask", () => {
  expect(() => assertTableMetadata(completeMetadata, expectedBronze as never)).not.toThrow();
  for (const metadata of [
    { ...completeMetadata, comment: "foreign" },
    { ...completeMetadata, full_name: "workspace.ln_premium_bronze.foreign_raw" },
    { ...completeMetadata, table_type: "VIEW" },
    { ...completeMetadata, data_source_format: "PARQUET" },
    { ...completeMetadata, columns: completeMetadata.columns.slice(1) },
    { ...completeMetadata, row_filter: { function: "x" } },
    { ...completeMetadata, columns: [{ ...completeMetadata.columns[0], mask: { function: "x" } }, ...completeMetadata.columns.slice(1)] },
  ]) expect(() => assertTableMetadata(metadata, expectedBronze as never)).toThrow();
});

test("dry run reports the complete fixed scope without invoking the Databricks CLI", async () => {
  const directory = await mkdtemp(join(tmpdir(), "premium-setup-cli-"));
  const executable = join(directory, "databricks");
  const sentinel = join(directory, "invoked");
  const bun = Bun.which("bun");
  if (!bun) throw new Error("Bun executable is unavailable for the dry-run test");
  try {
    await writeFile(executable, `#!/bin/sh\nprintf invoked > '${sentinel}'\nexit 88\n`, { mode: 0o700 });
    await chmod(executable, 0o700);
    const child = Bun.spawn([bun, "scripts/setup-premium-databricks.ts"], { cwd: process.cwd(), env: { ...process.env, PATH: directory }, stdout: "pipe", stderr: "pipe" });
    const deadline = setTimeout(() => child.kill("SIGKILL"), 10_000);
    const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    clearTimeout(deadline);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    await expect(access(sentinel)).rejects.toThrow();
    const report = JSON.parse(stdout);
    expect(report).toMatchObject({ mode: "dry-run", cloudCalls: 0, rawRecords: 28, acceptedRecords: 27, expectedMetrics: { net_admission_revenue: "300.00", net_parking_revenue: "40.00", valid_admission_tickets: 3, admission_buying_accounts: 1 } });
    expect(report.schemas).toHaveLength(3);
    expect(report.tables).toHaveLength(22);
    expect(report.views).toHaveLength(6);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
