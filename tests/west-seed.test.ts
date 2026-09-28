import { describe, expect, test } from "bun:test";
import { buildWestSeedInsert, buildWestSeedStatements, databricksRawString, validateWestSeedRows } from "../src/west-seed";

const valid = [{ event_id: "a", region: "west", venue_name: "Venue", city: "City", state: "CA", public_capacity: 1000, event_name: "Synthetic", show_date: "2026-10-15", tickets_sold_cumulative: 550, tickets_target_cumulative: 1000, data_as_of: "2026-09-28T00:00:00.000Z", market_signals: ["Synthetic awareness is healthy."], origin: "synthetic" }];

describe("West seed builder", () => {
  test("validates all six trusted rows before command construction", () => {
    const rows = ["hayden-homes-001", "wiltern-001", "palladium-001", "masonic-001", "white-river-001", "gorge-001"].map((event_id, index) => ({ ...valid[0], event_id, venue_name: ["Hayden Homes Amphitheater", "The Wiltern", "Hollywood Palladium", "The Masonic", "White River Amphitheatre", "The Gorge Amphitheatre"][index] }));
    expect(() => validateWestSeedRows(rows)).not.toThrow();
    expect(() => validateWestSeedRows(rows.map((row) => ({ ...row, market_signals: [] })))).toThrow("market_signals");
    expect(() => validateWestSeedRows(rows.map((row, index) => index ? row : { ...row, venue_name: "Wrong" }))).toThrow("approved venue");
  });

  test("builds typed SQL with the target-count constraint", () => {
    const rows = ["hayden-homes-001", "wiltern-001", "palladium-001", "masonic-001", "white-river-001", "gorge-001"].map((event_id, index) => ({ ...valid[0], event_id, venue_name: ["Hayden Homes Amphitheater", "The Wiltern", "Hollywood Palladium", "The Masonic", "White River Amphitheatre", "The Gorge Amphitheatre"][index] }));
    const sql = buildWestSeedInsert(rows);
    const statements = buildWestSeedStatements(rows);
    expect(sql).toContain("tickets_sold_cumulative <= tickets_target_cumulative");
    expect(sql).toContain("ARRAY<STRING>");
    expect(statements.createTableSql).not.toContain("CHECK");
    expect(statements.constraintSql).toHaveLength(2);
    expect(statements.constraintSql.join("\n")).toContain("ALTER TABLE workspace.livenation_demo.show_sales_snapshots ADD CONSTRAINT counts_are_valid CHECK");
  });

  test("uses raw literals for quotes and trailing backslashes", () => {
    expect(databricksRawString("O'Brien\\")).toBe("r'O''Brien\\'");
    const statements = buildWestSeedStatements(["hayden-homes-001", "wiltern-001", "palladium-001", "masonic-001", "white-river-001", "gorge-001"].map((event_id, index) => ({ ...valid[0], event_id, venue_name: ["Hayden Homes Amphitheater", "The Wiltern", "Hollywood Palladium", "The Masonic", "White River Amphitheatre", "The Gorge Amphitheatre"][index] })));
    expect(statements.createTableSql).not.toContain("INSERT INTO");
    expect(statements.insertSql).toStartWith("INSERT INTO");
  });
});
