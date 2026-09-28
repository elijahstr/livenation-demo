import { describe, expect, test } from "bun:test";
import { DatabricksSalesAdapter, SALES_EVIDENCE_COLUMNS, SALES_EVIDENCE_SQL } from "../src/databricks-sales-adapter";

const names: Record<string, string> = { "hayden-homes-001": "Hayden Homes Amphitheater", "wiltern-001": "The Wiltern", "palladium-001": "Hollywood Palladium", "masonic-001": "The Masonic", "white-river-001": "White River Amphitheatre", "gorge-001": "The Gorge Amphitheatre" };
const row = (id: string) => [id, "west", names[id] ?? id, "City", "CA", "1000", "Synthetic", "2026-10-15", "500", "800", "2026-09-28 11:00:00.000", '["Synthetic awareness is healthy."]', "synthetic"];
const ids = Object.keys(names);
const sixRows = ids.map(row);
const succeeded = (data = sixRows) => ({ status: { state: "SUCCEEDED" }, result: { data_array: data }, manifest: { truncated: false, schema: { columns: SALES_EVIDENCE_COLUMNS.map((name) => ({ name })) } } });

describe("Databricks sales adapter", () => {
  test("uses fixed SQL, --json request data, and typed West parameters", async () => {
    const calls: Array<{ args: string[]; body?: unknown }> = [];
    const adapter = new DatabricksSalesAdapter({ command: async (args, body) => { calls.push({ args, body }); return succeeded(); }, profile: "livenation-demo", warehouseId: "warehouse" });
    await adapter.read(new Date("2026-09-28T12:00:00.000Z"));
    expect(SALES_EVIDENCE_SQL).toContain("current_sales_evidence");
    expect(SALES_EVIDENCE_SQL).toContain("origin = 'synthetic'");
    expect(calls[0].args).toContain("--json");
    expect(calls[0].args).toContain("--output");
    expect(calls[0].body).toMatchObject({ disposition: "INLINE", format: "JSON_ARRAY", row_limit: 25, byte_limit: 65536, on_wait_timeout: "CONTINUE", session_timezone: "UTC" });
  });

  test("maps positional strings to typed aggregate values", async () => {
    const adapter = new DatabricksSalesAdapter({ command: async () => succeeded(), profile: "p", warehouseId: "w" });
    const rows = await adapter.read(new Date("2026-09-28T12:00:00.000Z"));
    expect(rows[0]).toMatchObject({ event_id: "hayden-homes-001", public_capacity: 1000, tickets_sold_cumulative: 500, market_signals: ["Synthetic awareness is healthy."], data_as_of: "2026-09-28T11:00:00.000Z" });
  });

  test("rejects truncated, malformed-schema, and seven-row responses", async () => {
    const base = succeeded();
    const cases = [
      { ...base, manifest: { ...base.manifest, truncated: true } },
      { ...base, manifest: { ...base.manifest, schema: { columns: [{ name: "wrong" }] } } },
      succeeded([...sixRows, row("g")]),
    ];
    for (const response of cases) {
      const adapter = new DatabricksSalesAdapter({ command: async () => response, profile: "p", warehouseId: "w" });
      await expect(adapter.read(new Date("2026-09-28T12:00:00.000Z"))).rejects.toThrow();
    }
  });

  test("returns empty rows for a successful zero-row response", async () => {
    const adapter = new DatabricksSalesAdapter({ command: async () => succeeded([]), profile: "p", warehouseId: "w" });
    expect(await adapter.read(new Date("2026-09-28T12:00:00.000Z"))).toEqual([]);
  });

  test("rejects invalid JSON array cells", async () => {
    const invalidJson = sixRows.map((values) => [...values]);
    invalidJson[0][11] = "not-json";
    const adapter = new DatabricksSalesAdapter({ command: async () => succeeded(invalidJson), profile: "p", warehouseId: "w" });
    await expect(adapter.read(new Date("2026-09-28T12:00:00.000Z"))).rejects.toThrow("market_signals must be valid JSON");
  });

  test("polls a pending statement and sends one body-free GET", async () => {
    const calls: Array<{ args: string[]; body: unknown }> = [];
    const responses = [{ statement_id: "statement", status: { state: "PENDING" } }, succeeded()];
    const adapter = new DatabricksSalesAdapter({ command: async (args, body) => { calls.push({ args, body }); return responses.shift()!; }, profile: "p", warehouseId: "w" });
    await adapter.read(new Date("2026-09-28T12:00:00.000Z"));
    expect(calls[1].args).toContain("get");
    expect(calls[1].args).not.toContain("--json");
    expect(calls[1].body).toBeUndefined();
  });

  test("cancels an expired pending statement without a real ten-second wait", async () => {
    const calls: string[][] = [];
    const adapter = new DatabricksSalesAdapter({ command: async (args) => { calls.push(args); return { statement_id: "statement", status: { state: "PENDING" } }; }, profile: "p", warehouseId: "w", timeoutMs: 0 });
    await expect(adapter.read(new Date("2026-09-28T12:00:00.000Z"))).rejects.toThrow("timed out");
    expect(calls.at(-1)?.join(" ")).toContain("/cancel");
  });
});
