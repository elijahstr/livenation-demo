import { expect, test } from "bun:test";

import { RegionalData } from "../src/regional-data";
import { collectRegionalChunks, RegionalStatements } from "../src/regional-statements";
import type { ReadContext, RegionalScope } from "../src/regional-types";

const scope: RegionalScope = {
  version: "test-v1",
  label: "Test region",
  seller_id: "seller",
  principal_version: "principal-v1",
  territory_assignment: "explicit test assignment",
  accounts: [
    { account_id: "A100", account_name: "Harbor Works", venue_id: "V100", state: "CA" },
    { account_id: "A200", account_name: "Missing Source", venue_id: "V200", state: "OR" },
  ],
};

const context: ReadContext = {
  scanId: "scan-test",
  deadlineAt: Date.now() + 60_000,
};

test("a disconnect during submission retains the statement ID for confirmed cancellation", async () => {
  const controller = new AbortController();
  const operations: string[] = [];
  const terminal: string[] = [];
  const statements = new RegionalStatements({ profile: "test", warehouseId: "warehouse", request: async (args, _body, options) => {
    if (args[2] === "/api/2.0/sql/statements") {
      expect(options.signal).toBeUndefined();
      controller.abort();
      operations.push("submit");
      return { statement_id: "statement-1", status: { state: "RUNNING" } };
    }
    if (args[2]!.endsWith("/cancel")) { operations.push("cancel"); expect(options.signal).toBeUndefined(); return {}; }
    operations.push("status");
    return { statement_id: "statement-1", status: { state: "CANCELED" } };
  } });
  await expect(statements.execute("SELECT 1", [], { ...context, signal: controller.signal, onTrace: trace => {
    if (trace.kind === "regional_statement_terminal") terminal.push(String(trace.state));
  } })).rejects.toMatchObject({ name: "AbortError" });
  expect(operations).toEqual(["submit", "cancel", "status"]);
  expect(terminal).toEqual(["CANCELED"]);
});

test("summary binds the full scope and reports a missing roster account as unavailable", async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const data = new RegionalData({
    scope,
    profile: "test",
    warehouseId: "warehouse",
    execute: async (sql, parameters) => {
      calls.push({ sql, parameters });
      return {
        statementId: "summary-1",
        columns: ["account_id", "account_name", "venue_id", "state", "activity", "contract", "purchases", "benefits"],
        rows: [["A100", "Harbor Works", "V100", "CA", "[]", "[]", "[]", "[]"]],
      };
    },
  });

  const results = await data.summaries(context);

  expect(calls).toHaveLength(1);
  expect(calls[0]!.sql).toContain("from_json(:scope");
  expect(calls[0]!.sql).not.toContain("A100");
  expect(calls[0]!.parameters).toEqual([{ name: "scope", value: JSON.stringify([{ account_id: "A100", venue_id: "V100" }, { account_id: "A200", venue_id: "V200" }]), type: "STRING" }]);
  expect(results.map((result) => [result.account_id, result.status, result.sections.activity.state])).toEqual([
    ["A100", "complete", "evidence"],
    ["A200", "unavailable", "unavailable"],
  ]);
});

test("a long activity section does not remove complete identity or benefit evidence", async () => {
  const activities = JSON.stringify(Array.from({ length: 60 }, (_, i) => ({ activity_type: "call", activity_at: `record-${i}` })));
  const data = new RegionalData({ scope, profile: "test", warehouseId: "warehouse", execute: async () => ({
    statementId: "partial-1", columns: ["account_id", "account_name", "venue_id", "state", "activity", "contract", "purchases", "benefits"],
    rows: [["A100", "Harbor Works", "V100", "CA", activities, "[]", "[]", '[{"product_id":"parking","included_quantity":1}]']],
  }) });
  const result = (await data.summaries(context))[0]!;
  expect(result.status).toBe("partial");
  expect(result.sections.activity.truncated).toBe(true);
  expect(result.sections.identity.rows[0]?.account_id).toBe("A100");
  expect(result.evidence.map(item => item.evidence_id)).toContain("partial-1:A100:benefits");
  expect(result.evidence.map(item => item.evidence_id)).not.toContain("partial-1:A100:activity");
});

test("analytics rejects a mismatched account before it submits SQL", async () => {
  let submitted = false;
  const data = new RegionalData({
    scope,
    profile: "test",
    warehouseId: "warehouse",
    execute: async () => {
      submitted = true;
      return { statementId: "unexpected", columns: [], rows: [] };
    },
  });

  await expect(data.analytics("A100", {
    account_id: "A200",
    question: "How many activities occurred?",
    dataset: "activity",
    metric: "activity_count",
    aggregation: "count",
    group_by: "none",
  }, context)).rejects.toThrow("account");
  expect(submitted).toBe(false);
});

test("detail evidence binds only the selected approved account", async () => {
  let parameter = "";
  const data = new RegionalData({ scope, profile: "test", warehouseId: "warehouse", execute: async (_sql, parameters) => {
    parameter = String(parameters[0]?.value);
    return { statementId: "detail-1", columns: ["account_id", "account_name", "venue_id", "state", "activity", "contract", "purchases", "benefits"], rows: [["A100", "Harbor Works", "V100", "CA", "[]", "[]", "[]", "[]"]] };
  } });
  await data.evidence("A100", ["activity"], context);
  expect(parameter).toBe(JSON.stringify([{ account_id: "A100", venue_id: "V100" }]));
});

test("analytics rejects a metric with the wrong aggregation", async () => {
  const data = new RegionalData({ scope, profile: "test", warehouseId: "warehouse", execute: async () => ({ statementId: "unexpected", columns: [], rows: [] }) });
  await expect(data.analytics("A100", { account_id: "A100", question: "Count activity", dataset: "activity", metric: "activity_count", aggregation: "sum", group_by: "none" }, context)).rejects.toThrow("approved");
});

test("benefit analytics compiles the approved benefits projection with a bound account", async () => {
  let query = "";
  const data = new RegionalData({
    scope,
    profile: "test",
    warehouseId: "warehouse",
    execute: async (sql) => {
      query = sql;
      return { statementId: "analytics-1", columns: ["value", "event_id"], rows: [["1", "E200"]] };
    },
  });

  await data.analytics("A100", {
    account_id: "A100",
    question: "What benefits are included?",
    dataset: "benefits",
    metric: "included_quantity",
    aggregation: "sum",
    group_by: "event_id",
  }, context);

  expect(query).toContain("sum(b.included_quantity)");
  expect(query).toContain("b.event_id");
  expect(query).toContain("a.account_id=b.account_id");
  expect(query).toContain("a.account_id=:account_id");
});

test("chunk validation rejects a missing expected result chunk", () => {
  expect(() => collectRegionalChunks({
    manifest: { total_chunk_count: 2, total_row_count: 2 },
    result: { chunk_index: 0, row_offset: 0, data_array: [["first"]], next_chunk_index: 1 },
  }, [])).toThrow("manifest");
});

test("fingerprint reports each validated source object", async () => {
  const traces: Array<{ completed?: number; total?: number }> = [];
  const data = new RegionalData({
    scope,
    profile: "test",
    warehouseId: "warehouse",
    execute: async (sql) => {
      if (sql.startsWith("DESCRIBE DETAIL")) return { statementId: "detail", columns: ["id"], rows: [["table-id"]] };
      if (sql.startsWith("DESCRIBE HISTORY")) return { statementId: "history", columns: ["version"], rows: [["1"]] };
      return { statementId: "view", columns: ["definition"], rows: [["CREATE VIEW"]] };
    },
  });

  await data.fingerprint({ ...context, onTrace: (trace) => {
    if (trace.kind === "source_check_progress") traces.push({ completed: trace.completed as number | undefined, total: trace.total as number | undefined });
  } });

  expect(traces).toHaveLength(17);
  expect(traces.map((trace) => trace.completed)).toEqual(Array.from({ length: 17 }, (_, index) => index + 1));
  expect(traces.every((trace) => trace.total === 17)).toBe(true);
});
