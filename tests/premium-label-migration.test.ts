import { expect, test } from "bun:test";

import { ARTIST_NAMES, companyName, artistName } from "../src/premium-names";
import scope from "../config/regional-scan-scope.json" with { type: "json" };
import {
  assertLabelMigrationSql,
  buildLabelMigrationPlan,
  migratePremiumLabels,
} from "../scripts/migrate-premium-labels";

test("generates deterministic unique fictional company labels for every scale account", () => {
  const names = Array.from({ length: 277 }, (_, index) => companyName(index + 1));
  expect(new Set(names).size).toBe(277);
  expect(companyName(1)).toBe("Alder Crest Partners");
  expect(companyName(277)).toBe("Alder Crest Company");
  expect(names.every((name) => !/^Scale Account/.test(name))).toBe(true);
  expect(() => companyName(278)).toThrow("outside the approved range");
});

test("projects scale artist slots onto the curated real-artist list", () => {
  expect(ARTIST_NAMES).toContain("Beyoncé");
  expect(ARTIST_NAMES).toContain("Khruangbin");
  expect(artistName(1, 1)).toBe("Beyoncé");
  expect(artistName(1, 2)).toBe("Post Malone");
  for (let ordinal = 1; ordinal <= 277; ordinal++) {
    expect(ARTIST_NAMES).toContain(artistName(ordinal, 1));
    expect(ARTIST_NAMES).toContain(artistName(ordinal, 2));
    expect(artistName(ordinal, 1)).not.toBe(artistName(ordinal, 2));
  }
});

test("builds exact expected label row counts for the fixed scale dataset", () => {
  const plan = buildLabelMigrationPlan();
  expect(plan.accounts).toHaveLength(277);
  expect(plan.artists).toHaveLength(554);
  expect(plan.accounts[24]).toMatchObject({ batch_id: "premium-scale-v1-0025", source_id: "SC0025-A", account_id: "SC0025-A" });
  expect(plan.artists[42]).toMatchObject({ source_id: "SC0022-AR1", artist_id: "SC0022-AR1" });
});

test("keeps the static regional account roster aligned with generated company labels", () => {
  const scaleAccounts = scope.accounts.filter((account) => /^SC\d{4}-A$/.test(account.account_id));
  expect(scaleAccounts).toHaveLength(277);
  for (const account of scaleAccounts) {
    const ordinal = Number(account.account_id.slice(2, 6));
    expect(account.account_name).toBe(companyName(ordinal));
  }
});

test("keeps dry run local and reports the allowed four target objects", async () => {
  const result = await migratePremiumLabels(false, { execute: async () => { throw new Error("cloud call"); } });
  expect(result).toMatchObject({ mode: "dry-run", cloudCalls: 0, accountCount: 277, artistCount: 554 });
  expect(result.targets).toEqual([
    "workspace.ln_premium_bronze.salesforce_raw",
    "workspace.ln_premium_bronze.artist_catalog_raw",
    "workspace.ln_premium_silver.accounts",
    "workspace.ln_premium_silver.artists",
  ]);
});

test("allows only scoped matched-update MERGEs and exact-count verification", () => {
  const plan = buildLabelMigrationPlan();
  for (const statement of plan.statements) assertLabelMigrationSql(statement.sql);
  const sql = plan.statements.map((statement) => statement.sql).join("\n");
  expect(sql).toContain("WHEN MATCHED THEN UPDATE SET");
  expect(sql).not.toContain("WHEN NOT MATCHED");
  expect(sql).toContain(") AS account_bronze_count");
  expect(sql).toContain(") AS artist_silver_count");
  expect(sql).toContain("actual_silver_accounts");
  expect(sql).toContain("actual_silver_artists");
  expect(sql).toContain("SELECT batch_id,source_id,payload_json,payload_sha256 FROM expected_accounts");
  expect(sql).toContain("SELECT batch_id,source_id,account_id,account_name FROM expected_accounts");
  expect(() => assertLabelMigrationSql("MERGE INTO workspace.ln_premium_silver.events t USING (SELECT 1) s ON true WHEN MATCHED THEN UPDATE SET event_status='changed'")) .toThrow("unapproved");
  expect(() => assertLabelMigrationSql("MERGE INTO workspace.ln_premium_silver.accounts t USING (SELECT 1) s ON true WHEN NOT MATCHED THEN INSERT (account_id) VALUES ('x')")) .toThrow("operation");
  expect(() => assertLabelMigrationSql("DELETE FROM workspace.ln_premium_silver.accounts")) .toThrow("operation");
});

test("stops before the first write when the live scale row counts differ", async () => {
  const submitted: string[] = [];
  const execute = async (sql: string) => {
    submitted.push(sql);
    return {
      statementId: "count-mismatch",
      columns: ["account_bronze_count", "artist_bronze_count", "account_silver_count", "artist_silver_count"],
      rows: [["276", "554", "277", "554"]],
    };
  };

  await expect(migratePremiumLabels(true, { execute })).rejects.toThrow("account_bronze_count must equal 277");
  expect(submitted).toHaveLength(1);
  expect(submitted.some((sql) => sql.startsWith("MERGE INTO"))).toBe(false);
});
