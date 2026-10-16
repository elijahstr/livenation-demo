import { expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertScaleSql,
  buildCandidateValidationQuery,
  buildGlobalKeyOverlapQuery,
  buildGlobalSourceIdOverlapQuery,
  buildPreservedSilverComparison,
  expectedBronzeDigests,
  assertPreservedBronzeDigests,
  assertScaleExactComparison,
  buildScaleComparison,
  buildBatchScopedSilverSource,
  buildScaleBronzeSource,
  createScaleExecutionState,
  reconcileScaleState,
  publishCompletedSelection,
  hasPredictiveOptimizationEnabled,
  assertScaleSubsetComparison,
  selectScaleRun,
  setupPremiumScale,
} from "../scripts/setup-premium-scale";
import { generateBundle } from "../src/premium-scale";

test("builds parameterized Bronze and batch-scoped Silver sources", () => {
  const records = [...generateBundle(1), ...generateBundle(2)];
  const bronze = buildScaleBronzeSource("salesforce_raw", records);
  expect(bronze.sql).toContain("from_json(:records");
  expect(bronze.sql).toContain("x.batch_id");
  expect(bronze.parameters).toHaveLength(1);
  expect(bronze.parameters[0]?.value).toContain("premium-scale-v1-0001");
  expect(bronze.parameters[0]?.value).not.toContain("SC0001-A' OR 1=1");
  const silver = buildBatchScopedSilverSource("accounts", ["premium-scale-v1-0001", "premium-scale-v1-0002"]);
  expect(silver.sql).toContain("WHERE batch_id IN (:batch_0, :batch_1)");
  expect(silver.parameters.map((parameter) => parameter.value)).toEqual(["premium-scale-v1-0001", "premium-scale-v1-0002"]);
  expect(() => buildBatchScopedSilverSource("accounts", ["premium-scale-v1-0001' OR 1=1 --"])).toThrow("batch ID");
  expect(() => buildBatchScopedSilverSource("accounts", ["premium-scale-v1-0208", "premium-scale-v1-0219", "premium-scale-v1-0277"])).not.toThrow();
});

test("uses unique parameters for every Silver candidate table", () => {
  const query = buildCandidateValidationQuery(["premium-scale-v1-0001"]);
  expect(query.parameters).toHaveLength(15);
  expect(new Set(query.parameters.map((parameter) => parameter.name)).size).toBe(15);
  expect(query.sql).toContain(":accounts_batch_0");
  expect(query.sql).toContain(":inventory_snapshots_batch_0");
});

test("permits a missing selected target row before the insert-only merge", () => {
  const source = buildScaleBronzeSource("salesforce_raw", generateBundle(1));
  const comparison = buildScaleComparison("workspace.ln_premium_bronze.salesforce_raw", source, ["premium-scale-v1-0001"]);
  expect(comparison.sql).toContain("actual EXCEPT SELECT");
  expect(comparison.sql).not.toContain("expected EXCEPT SELECT");
});

test("a partial selected subset resumes only its missing write", () => {
  expect(assertScaleSubsetComparison({ actual_count: "1", expected_count: "2", conflicts: "0", duplicates: "0" }, "accounts")).toEqual({ actual: 1, expected: 2 });
  expect(() => assertScaleSubsetComparison({ actual_count: "2", expected_count: "2", conflicts: "1", duplicates: "0" }, "accounts")).toThrow("changed");
});

test("checks selected natural keys against every earlier live batch before Bronze writes", () => {
  const query = buildGlobalKeyOverlapQuery("accounts", generateBundle(1), ["premium-scale-v1-0001"]);
  expect(query.sql).toContain("INNER JOIN expected ON live.account_id=expected.account_id");
  expect(query.sql).toContain("live.batch_id NOT IN (:selected_0)");
  expect(query.parameters.map((parameter) => parameter.name)).toEqual(["records", "selected_0"]);
});

test("checks source IDs across all Bronze tables before Bronze writes", () => {
  const query = buildGlobalSourceIdOverlapQuery(generateBundle(1), ["premium-scale-v1-0001"]);
  expect(query.sql).toContain("workspace.ln_premium_bronze.finance_raw");
  expect(query.sql).toContain("INNER JOIN expected USING (source_id)");
  expect(query.sql).toContain("live.batch_id NOT IN (:selected_0)");
  expect(query.parameters.map((parameter) => parameter.name)).toEqual(["source_ids", "selected_0"]);
});

test("checks preserved Bronze hashes and every preserved Silver value", () => {
  const digests = expectedBronzeDigests(generateBundle(1));
  expect(digests["premium-scale-v1-0001"]?.record_count).toBe(36);
  expect(() => assertPreservedBronzeDigests([
    { batch_id: "premium-scale-v1-0001", record_count: "36", content_hash: digests["premium-scale-v1-0001"]!.content_hash },
  ], digests)).not.toThrow();
  expect(() => assertPreservedBronzeDigests([
    { batch_id: "premium-scale-v1-0001", record_count: "36", content_hash: "0".repeat(64) },
  ], digests)).toThrow("preserved Bronze");
  const silver = buildPreservedSilverComparison("contacts", ["premium-scale-v1-0002"]);
  expect(silver.sql).toContain("actual EXCEPT SELECT");
  expect(silver.sql).toContain("expected EXCEPT SELECT");
  expect(silver.sql).toContain("batch_id NOT IN (:selected_0)");
  expect(() => assertScaleExactComparison({ actual_count: "1", expected_count: "1", conflicts: "1", duplicates: "0" }, "contacts")).toThrow("changed");
  expect(() => assertScaleExactComparison({ actual_count: "1", expected_count: "1", conflicts: "1", duplicates: "0" }, "event_financials")).toThrow("changed");
  expect(() => assertScaleExactComparison({ actual_count: "0", expected_count: "1", conflicts: "0", duplicates: "0" }, "selected contacts")).toThrow("missing");
});

test("allows only bounded reads and insert-only owned Scale MERGEs", () => {
  const bronze = buildScaleBronzeSource("salesforce_raw", generateBundle(1));
  assertScaleSql(bronze.sql);
  assertScaleSql(buildBatchScopedSilverSource("accounts", ["premium-scale-v1-0001"]).sql);
  assertScaleSql("SHOW CREATE TABLE workspace.ln_premium_gold.sales_metrics");
  assertScaleSql("DESCRIBE SCHEMA EXTENDED workspace.ln_premium_silver");
  for (const sql of [
    "OPTIMIZE workspace.ln_premium_silver.accounts",
    "UPDATE workspace.ln_premium_silver.accounts SET account_id='x'",
    "MERGE INTO workspace.ln_premium_bronze.finance_raw t USING (SELECT 1) s ON true WHEN NOT MATCHED THEN INSERT (batch_id) VALUES ('x')",
    "MERGE INTO workspace.ln_premium_silver.event_financials t USING (SELECT 1) s ON true WHEN NOT MATCHED THEN INSERT (batch_id) VALUES ('x')",
    "SELECT * FROM workspace.ln_premium_silver.accounts; DELETE FROM workspace.ln_premium_silver.accounts",
  ]) expect(() => assertScaleSql(sql)).toThrow();
});

test("reports complete without a cloud call after the final ready bundle", async () => {
  const directory = await mkdtemp(join(tmpdir(), "premium-scale-complete-"));
  try {
    const state = createScaleExecutionState([], Array.from({ length: 277 }, (_, index) => index + 1));
    await writeFile(join(directory, "execution-state.json"), JSON.stringify({ ...state, selectedOrdinals: [], publishedAt: "2026-10-16T12:00:00Z" }), { mode: 0o600 });
    await expect(setupPremiumScale(false, { root: directory })).resolves.toMatchObject({ mode: "complete", cloudCalls: 0, expected: { bronze: 10_000, silver: 9_999 } });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("keeps a saved selection after interruption and blocks a lost statement ID", () => {
  const state = createScaleExecutionState([1]);
  expect(selectScaleRun(state)).toEqual([1]);
  const pending = { ...state, pending: { label: "Load accounts", sqlHash: "a".repeat(64), state: "RUNNING" } };
  expect(() => reconcileScaleState(pending)).toThrow("statement ID");
  const terminal = { ...state, pending: { label: "Load accounts", sqlHash: "a".repeat(64), statementId: "statement-1", state: "SUCCEEDED" } };
  expect(reconcileScaleState(terminal, "SUCCEEDED").pending).toBeUndefined();
});

test("publishes a completed selection once and makes the next state select the next bounded batch", () => {
  const completed = { ...createScaleExecutionState([1]), completed: true };
  const published = publishCompletedSelection(completed, "2026-10-16T12:00:00Z");
  expect(published.readyOrdinals).toEqual([1]);
  expect(published.selectedOrdinals).toEqual([]);
  expect(() => publishCompletedSelection(published, "2026-10-16T12:01:00Z")).toThrow("not completed");
  expect(createScaleExecutionState([], published.readyOrdinals).selectedOrdinals).toEqual([2, 3, 4, 5, 6, 7, 8]);
});

test("an interruption after Bronze keeps the exact selection for safe reconciliation", () => {
  const state = { ...createScaleExecutionState([1]), pending: { label: "Load salesforce_raw", sqlHash: "b".repeat(64), statementId: "bronze-1", state: "SUCCEEDED" } };
  const recovered = reconcileScaleState(state, "SUCCEEDED");
  expect(selectScaleRun(recovered)).toEqual([1]);
  expect(recovered.readyOrdinals).toEqual([]);
});

test("an interruption during Silver keeps the exact selection and blocks a nonterminal statement", () => {
  const state = { ...createScaleExecutionState([1]), pending: { label: "Load tickets", sqlHash: "c".repeat(64), statementId: "silver-1", state: "RUNNING" } };
  expect(() => reconcileScaleState(state, "RUNNING")).toThrow("not terminal");
  expect(selectScaleRun(state)).toEqual([1]);
});

test("an interruption after writes before publication performs no second ready transition", () => {
  const state = { ...createScaleExecutionState([1]), completed: true };
  const published = publishCompletedSelection(state, "2026-10-16T12:00:00Z");
  expect(published.readyOrdinals).toEqual([1]);
  expect(published.statements ?? []).toEqual([]);
});

test("writes private journal files and never runs the Databricks CLI during dry run", async () => {
  const directory = await mkdtemp(join(tmpdir(), "premium-scale-runner-"));
  const statePath = join(directory, "execution-state.json");
  try {
    await writeFile(statePath, JSON.stringify(createScaleExecutionState([1])), { mode: 0o600 });
    expect((await stat(statePath)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(statePath, "utf8")).selectedOrdinals).toEqual([1]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("reads inherited Predictive Optimization across DESCRIBE SCHEMA result columns", () => {
  expect(hasPredictiveOptimizationEnabled({ property: "Predictive Optimization", value: "ENABLE (inherited from metastore)" })).toBe(true);
  expect(hasPredictiveOptimizationEnabled({ property: "Predictive Optimization", value: "DISABLE" })).toBe(false);
});
