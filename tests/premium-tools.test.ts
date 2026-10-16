import { describe, expect, test } from "bun:test";

import { AS_OF } from "../src/premium-foundation";
import { PREMIUM_TOOL_DEFINITIONS, PREMIUM_TOOL_NAMES, createPremiumTools, readAccountAttentionSummary, readCurrentSalesMetrics } from "../src/premium-tools";

const statement = (columns: string[], rows: (string | null)[][], statementId = "statement-1") => ({ statementId, columns, rows });

const briefRows = [
  ["attention", JSON.stringify([{ account_id: "A100", contract_id: "CT100", latest_order_id: "O100" }])],
  ["artist_evidence", JSON.stringify([{ account_id: "A100", artist_id: "AR100", purchased_admission_tickets: 3 }])],
  ["benefits", JSON.stringify([{ account_id: "A100", event_id: "E200", product_id: "general-parking", included_quantity: 1 }])],
];

describe("premium tools", () => {
  test("exports only the three server-owned inline tools", () => {
    expect(PREMIUM_TOOL_NAMES).toEqual(["get_account_brief", "find_options", "ask_analytics"]);
    expect(PREMIUM_TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual(PREMIUM_TOOL_NAMES);
    for (const tool of PREMIUM_TOOL_DEFINITIONS) {
      expect(tool.type).toBe("inline_function");
      expect(tool.config.inlineFunction.inputSchema.additionalProperties).toBe(false);
    }
  });

  test("returns bounded structured account evidence with top-level provenance", async () => {
    const calls: Array<{ sql: string; parameters: unknown }> = [];
    const handlers = createPremiumTools({
      profile: "test", warehouseId: "warehouse", now: () => 100,
      execute: async (sql, parameters) => {
        calls.push({ sql, parameters });
        return statement(["section", "evidence"], briefRows);
      },
      askAnalytics: async () => ({ kind: "analytics" }),
    });

    const result: any = await handlers.get_account_brief({ account_id: "A100" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toContain("workspace.ln_premium_gold.account_attention");
    expect(calls[0]!.sql).toContain("LIMIT 51");
    expect(calls[0]!.parameters).toEqual([{ name: "account_id", value: "A100", type: "STRING" }]);
    expect(result).toMatchObject({
      origin: "synthetic", data_as_of: AS_OF,
      rows: { attention: [{ account_id: "A100", contract_id: "CT100", latest_order_id: "O100" }] },
      provenance: { statement_id: "statement-1", returned_row_count: 3 },
    });
    expect(result.provenance.source_ids).toContain("workspace.ln_premium_gold.account_attention");
    expect(result.provenance.source_ids).toEqual(expect.arrayContaining(["A100", "CT100", "O100", "AR100", "E200", "general-parking"]));
  });

  test("caches a fixed tool result only within its handler set", async () => {
    let calls = 0;
    const options = {
      profile: "test", warehouseId: "warehouse",
      execute: async () => { calls++; return statement(["section", "evidence"], briefRows); },
      askAnalytics: async () => ({ kind: "analytics" }),
    };
    const first = createPremiumTools(options);
    await first.get_account_brief({ account_id: "A100" });
    await first.get_account_brief({ account_id: "A100" });
    expect(calls).toBe(1);
    const second = createPremiumTools(options);
    await second.get_account_brief({ account_id: "A100" });
    expect(calls).toBe(2);
  });

  test("rejects untrusted fixed-tool input before SQL", async () => {
    let calls = 0;
    const handlers = createPremiumTools({
      profile: "test", warehouseId: "warehouse",
      execute: async () => { calls++; return statement(["section", "evidence"], briefRows); },
      askAnalytics: async () => ({ kind: "analytics" }),
    });
    await expect(handlers.get_account_brief({ account_id: "A101" })).rejects.toThrow();
    await expect(handlers.find_options({ account_id: "A100", limit: 1 })).rejects.toThrow();
    await expect(handlers.ask_analytics({ question: "x".repeat(2_001) })).rejects.toThrow();
    expect(calls).toBe(0);
  });

  test("keeps fixed account tools scoped to A100", async () => {
    const handlers = createPremiumTools({
      profile: "test", warehouseId: "warehouse",
      execute: async () => statement(["section", "evidence"], [
        ["attention", JSON.stringify([{ account_id: "A101", contract_id: "CT101" }])],
        ["artist_evidence", "[]"], ["benefits", "[]"],
      ]),
      askAnalytics: async () => ({ kind: "analytics" }),
    });
    await expect(handlers.get_account_brief({ account_id: "A100" })).rejects.toThrow("unapproved account");
  });

  test("returns one bounded attention summary when the account population grows", async () => {
    const result: any = await readAccountAttentionSummary({
      profile: "test", warehouseId: "warehouse",
      execute: async () => statement(["section", "evidence"], [["attention", JSON.stringify([
        { account_count: 278, latest_activity_at: "2026-10-15T12:00:00.000Z" },
      ])]]),
    });
    expect(result.rows.attention).toEqual([{ account_count: 278, latest_activity_at: "2026-10-15T12:00:00.000Z" }]);
  });

  test("returns one bounded independent sales oracle", async () => {
    const result: any = await readCurrentSalesMetrics({
      profile: "test", warehouseId: "warehouse",
      execute: async () => statement(["section", "evidence"], [["sales_metrics", JSON.stringify([
        { net_admission_revenue: "300.00", net_parking_revenue: "40.00", valid_admission_tickets: 3, admission_buying_accounts: 1 },
      ])]]),
    });
    expect(result.rows.sales_metrics).toHaveLength(1);
  });

  test("rejects a sentinel result and invalid fixed-tool provenance", async () => {
    const fiftyOne = Array.from({ length: 51 }, (_, index) => ["attention", JSON.stringify([{ account_id: "A100", contract_id: `CT${index}` }])]);
    const handlers = createPremiumTools({
      profile: "test", warehouseId: "warehouse",
      execute: async () => statement(["section", "evidence"], fiftyOne),
      askAnalytics: async () => ({ kind: "analytics" }),
    });
    await expect(handlers.get_account_brief({ account_id: "A100" })).rejects.toThrow("50");
  });

  test("rejects more than fifty aggregate elements even when the statement has few rows", async () => {
    const handlers = createPremiumTools({
      profile: "test", warehouseId: "warehouse",
      execute: async () => statement(["section", "evidence"], [
        ["attention", JSON.stringify(Array.from({ length: 51 }, (_, index) => ({ account_id: "A100", contract_id: `CT${index}` })))],
        ["artist_evidence", "[]"], ["benefits", "[]"],
      ]),
      askAnalytics: async () => ({ kind: "analytics" }),
    });
    await expect(handlers.get_account_brief({ account_id: "A100" })).rejects.toThrow("50");
  });

  test("uses account-scoped fixed options and retains sibling products", async () => {
    const calls: string[] = [];
    const handlers = createPremiumTools({
      profile: "test", warehouseId: "warehouse",
      execute: async (sql) => {
        calls.push(sql);
        return statement(["section", "evidence"], [["options", JSON.stringify([{ account_id: "A100", event_id: "E200", product_id: "premier-parking", available_quantity: 12 }])]]);
      },
      askAnalytics: async () => ({ kind: "analytics" }),
    });
    const result: any = await handlers.find_options({ account_id: "A100" });
    expect(calls[0]).toContain("workspace.ln_premium_gold.upcoming_options");
    expect(calls[0]).toContain("workspace.ln_premium_gold.account_event_benefits");
    expect(calls[0]).toContain("relevant_events");
    expect(calls[0]).toContain("JOIN relevant_events");
    expect(calls[0]).toContain("o.product_id = b.product_id");
    expect(calls[0]).toContain("WHERE account_id=:account_id AND included_quantity+purchased_quantity>0\n), options");
    expect(result.rows.options[0].product_id).toBe("premier-parking");
  });

  test("passes only the validated analytics question to the MCP boundary", async () => {
    const inputs: unknown[] = [];
    const handlers = createPremiumTools({
      profile: "test", warehouseId: "warehouse",
      execute: async () => statement([], []),
      askAnalytics: async (question) => { inputs.push(question); return { kind: "analytics", origin: "synthetic", data_as_of: AS_OF }; },
    });
    await expect(handlers.ask_analytics({ question: "Revenue by state?" })).resolves.toMatchObject({ kind: "analytics" });
    expect(inputs).toEqual(["Revenue by state?"]);
  });
});
