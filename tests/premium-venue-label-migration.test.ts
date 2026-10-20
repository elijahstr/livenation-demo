import { expect, test } from "bun:test";

import { VENUE_NAMES_BY_STATE, venueName } from "../src/premium-names";
import { generateBundle } from "../src/premium-scale";
import fixture from "../fixtures/premium-harbor-works.json" with { type: "json" };
import {
  assertVenueLabelMigrationSql,
  buildVenueLabelMigrationPlan,
  migratePremiumVenueLabels,
} from "../scripts/migrate-premium-venue-labels";

test("uses only the ten approved regional venue labels", () => {
  expect(VENUE_NAMES_BY_STATE).toEqual({
    CA: ["Shoreline Amphitheatre", "Toyota Amphitheatre", "Toyota Pavilion at Concord", "The Masonic"],
    OR: ["Hayden Homes Amphitheater"],
    WA: ["BECU Live at Northern Quest", "Cascades Amphitheater", "Chateau Ste. Michelle Winery", "Gorge Amphitheatre", "White River Amphitheatre"],
  });
});

test("assigns venue labels by generated state and cycles within each state", () => {
  expect(venueName(1, "CA")).toBe("Shoreline Amphitheatre");
  expect(venueName(4, "CA")).toBe("Toyota Amphitheatre");
  expect(venueName(7, "CA")).toBe("Toyota Pavilion at Concord");
  expect(venueName(10, "CA")).toBe("The Masonic");
  expect(venueName(13, "CA")).toBe("Shoreline Amphitheatre");
  expect(venueName(2, "OR")).toBe("Hayden Homes Amphitheater");
  expect(venueName(3, "WA")).toBe("BECU Live at Northern Quest");
  expect(venueName(6, "WA")).toBe("Cascades Amphitheater");
  expect(venueName(15, "WA")).toBe("White River Amphitheatre");
  for (let ordinal = 1; ordinal <= 277; ordinal++) {
    const venue = generateBundle(ordinal).find((row) => row.record_type === "venues")!;
    expect(venue.payload.venue_name).toBe(venueName(ordinal, String(venue.payload.state) as "CA" | "OR" | "WA"));
  }
});

test("builds exact expected venue rows for all scale bundles", () => {
  const plan = buildVenueLabelMigrationPlan();
  const allowlist = new Set(Object.values(VENUE_NAMES_BY_STATE).flat());
  expect(plan.venues).toHaveLength(278);
  expect(plan.venues.every((venue) => allowlist.has(venue.venue_name))).toBe(true);
  expect(plan.venues[0]).toMatchObject({ batch_id: "harbor-works-foundation-v1", source_id: "AC-V100", venue_id: "V100", venue_name: "Shoreline Amphitheatre" });
  expect(plan.venues[25]).toMatchObject({ batch_id: "premium-scale-v1-0025", source_id: "SC0025-V", venue_id: "SC0025-V" });
  expect((fixture.records.find((row) => row.source_id === "AC-V100")?.payload as { venue_name: string }).venue_name).toBe("Shoreline Amphitheatre");
});

test("keeps the venue migration local by default and limits it to two tables", async () => {
  const result = await migratePremiumVenueLabels(false, { execute: async () => { throw new Error("cloud call"); } });
  expect(result).toMatchObject({ mode: "dry-run", cloudCalls: 0, venueCount: 278 });
  expect(result.targets).toEqual([
    "workspace.ln_premium_bronze.artist_catalog_raw",
    "workspace.ln_premium_silver.venues",
  ]);
});

test("uses scoped matched updates with exact venue counts and equality verification", () => {
  const plan = buildVenueLabelMigrationPlan();
  for (const statement of plan.statements) assertVenueLabelMigrationSql(statement.sql);
  const sql = plan.statements.map((statement) => statement.sql).join("\n");
  expect(sql).toContain("WHEN MATCHED");
  expect(sql).not.toContain("WHEN NOT MATCHED");
  expect(sql).toContain("venue_bronze_count");
  expect(sql).toContain("venue_silver_count");
  expect(sql).toContain("foundation_venue_bronze_count");
  expect(sql).toContain("scale_venue_bronze_count");
  expect(sql).toContain("foundation_venue_silver_count");
  expect(sql).toContain("scale_venue_silver_count");
  expect(sql).toContain("harbor-works-foundation-v1");
  expect(sql).toContain("actual_bronze_venues");
  expect(sql).toContain("actual_silver_venues");
  expect(sql).toContain("sha2(payload_json,256)<>payload_sha256");
  expect(() => assertVenueLabelMigrationSql("MERGE INTO workspace.ln_premium_silver.events t USING (SELECT 1) s ON true WHEN MATCHED THEN UPDATE SET event_status='changed'")) .toThrow("unapproved");
  expect(() => assertVenueLabelMigrationSql("DELETE FROM workspace.ln_premium_silver.venues")) .toThrow("operation");
});

test("stops before any update when the venue count differs", async () => {
  const submitted: string[] = [];
  const execute = async (sql: string) => {
    submitted.push(sql);
    return { statementId: "count-mismatch", columns: ["foundation_venue_bronze_count", "scale_venue_bronze_count", "foundation_venue_silver_count", "scale_venue_silver_count"], rows: [["1", "276", "1", "277"]] };
  };
  await expect(migratePremiumVenueLabels(true, { execute })).rejects.toThrow("scale_venue_bronze_count must equal 277");
  expect(submitted).toHaveLength(1);
  expect(submitted.some((sql) => sql.startsWith("MERGE INTO"))).toBe(false);
});

test("repeats only matched venue updates and verifies the same final rows", async () => {
  const calls: string[] = [];
  const execute = async (sql: string) => {
    calls.push(sql);
    if (sql.startsWith("SELECT")) return { statementId: "count", columns: ["foundation_venue_bronze_count", "scale_venue_bronze_count", "foundation_venue_silver_count", "scale_venue_silver_count"], rows: [["1", "277", "1", "277"]] };
    if (sql.startsWith("WITH")) return { statementId: "verify", columns: ["label", "actual_count", "expected_count", "difference_count", "hash_mismatch"], rows: [["bronze_venues", "278", "278", "0", "0"], ["silver_venues", "278", "278", "0", "0"]] };
    return { statementId: "merge", columns: [], rows: [] };
  };
  const first = await migratePremiumVenueLabels(true, { execute });
  const second = await migratePremiumVenueLabels(true, { execute });
  expect(first.cloudCalls).toBe(5);
  expect(second.cloudCalls).toBe(5);
  expect(calls.filter((sql) => sql.startsWith("MERGE INTO"))).toHaveLength(4);
  expect(calls.filter((sql) => sql.startsWith("MERGE INTO")).every((sql) => sql.includes("WHEN MATCHED") && !sql.includes("WHEN NOT MATCHED"))).toBe(true);
});
