import { expect, test } from "bun:test";
import { GenieMcpClient, type DatabricksJsonRequest } from "../src/genie-mcp-client";

const route = "/ai-gateway/mcp-services/system.ai.genie_one_mcp";

function requestSequence(responses: unknown[], calls: Array<{ args: string[]; body: any; options?: any }>): DatabricksJsonRequest {
  return async (args, body, options) => {
    calls.push({ args, body, options });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
}

const tools = {
  jsonrpc: "2.0",
  id: 2,
  result: { tools: ["genie_ask", "genie_poll_response", "genie_get_query_result", "genie_cancel_response"].map(name => ({ name })) },
};

test("retrieves every query item and returns only verified Gold results", async () => {
  const calls: Array<{ args: string[]; body: any }> = [];
  const client = new GenieMcpClient({
    profile: "test", warehouseId: "warehouse", deadlineAt: 60_000, clock: () => 0,
    request: requestSequence([
      { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26", serverInfo: { name: "genie_chat", version: "1.0.0" } } },
      null,
      tools,
      { jsonrpc: "2.0", id: 3, result: { structuredContent: { conversation_id: "c".repeat(32), response_id: "r".repeat(32), status: "in_progress" } } },
      { jsonrpc: "2.0", id: 4, result: { structuredContent: { conversation_id: "c".repeat(32), response_id: "r".repeat(32), status: "completed", query_items: [
        { item_id: "first", sql: "SELECT * FROM workspace.ln_premium_gold.account_attention" },
        { item_id: "second", sql: "SELECT * FROM workspace.ln_premium_gold.sales_metrics" },
      ] } } },
      { jsonrpc: "2.0", id: 5, result: { structuredContent: { conversation_id: "c".repeat(32), response_id: "r".repeat(32), item_id: "first", ready: false, statement_state: "FAILED" } } },
      { jsonrpc: "2.0", id: 6, result: { structuredContent: { conversation_id: "c".repeat(32), response_id: "r".repeat(32), item_id: "second", ready: true, statement_state: "SUCCEEDED", columns: [{ name: "total", type_text: "BIGINT" }], rows: [["1"]], total_row_count: 1, truncated: false } } },
    ], calls),
  });

  await expect(client.ask("What is the total?")).resolves.toMatchObject({
    conversationId: "c".repeat(32), responseId: "r".repeat(32),
    queryItems: [{ itemId: "first", statementState: "FAILED" }, { itemId: "second", statementState: "SUCCEEDED", rows: [["1"]] }],
  });
  expect(calls.map(call => call.args)).toEqual(Array(7).fill(["api", "post", route, "--profile", "test", "--output", "json"]));
  expect(calls[1].body.method).toBe("notifications/initialized");
  expect(calls[3].body.params._meta).toEqual({ warehouse_id: "warehouse" });
});

test("fails closed when no verified Gold query result exists", async () => {
  const client = new GenieMcpClient({
    profile: "test", warehouseId: "warehouse", deadlineAt: 60_000, clock: () => 0,
    request: requestSequence([
      { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26", serverInfo: { name: "genie_chat", version: "1.0.0" } } }, null, tools,
      { jsonrpc: "2.0", id: 3, result: { structuredContent: { conversation_id: "c".repeat(32), response_id: "r".repeat(32), status: "in_progress" } } },
      { jsonrpc: "2.0", id: 4, result: { structuredContent: { conversation_id: "c".repeat(32), response_id: "r".repeat(32), status: "completed", query_items: [] } } },
    ], []),
  });
  await expect(client.ask("Need an answer")).rejects.toThrow("no verified Gold query result");
});

test("does not return rows from a query that mixes a Gold source with another source", async () => {
  const client = new GenieMcpClient({
    profile: "test", warehouseId: "warehouse", deadlineAt: 60_000, clock: () => 0,
    request: requestSequence([
      { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26", serverInfo: { name: "genie_chat", version: "1.0.0" } } }, null, tools,
      { jsonrpc: "2.0", id: 3, result: { structuredContent: { conversation_id: "c".repeat(32), response_id: "r".repeat(32), status: "in_progress" } } },
      { jsonrpc: "2.0", id: 4, result: { structuredContent: { conversation_id: "c".repeat(32), response_id: "r".repeat(32), status: "completed", query_items: [{ item_id: "mixed", sql: "SELECT * FROM workspace.ln_premium_gold.account_attention JOIN workspace.other.sensitive ON 1=1" }] } } },
      { jsonrpc: "2.0", id: 5, result: { structuredContent: { conversation_id: "c".repeat(32), response_id: "r".repeat(32), item_id: "mixed", ready: true, statement_state: "SUCCEEDED", columns: [{ name: "total", type_text: "BIGINT" }], rows: [["1"]], total_row_count: 1, truncated: false } } },
    ], []),
  });
  await expect(client.ask("Need an answer")).rejects.toThrow("no verified Gold query result");
});

test("labels only Gold and declared-CTE query sources as Gold evidence", async () => {
  const cases = [
    { sql: "SELECT * FROM workspace.ln_premium_gold.account_attention JOIN workspace.ln_premium_silver.accounts ON 1=1", accepted: false },
    { sql: "SELECT * FROM workspace.ln_premium_gold.account_attention JOIN sensitive ON 1=1", accepted: false },
    { sql: "WITH attention AS (SELECT * FROM workspace.ln_premium_gold.account_attention) SELECT * FROM attention;", accepted: true },
    { sql: "SELECT b.secret FROM workspace.ln_premium_gold.account_attention a, workspace.other.private_data b", accepted: false },
    { sql: "WITH x AS (SELECT 300 AS revenue) SELECT * FROM x", accepted: false },
    { sql: "WITH x AS (SELECT 'workspace.ln_premium_gold.account_attention' AS source) SELECT * FROM x", accepted: false },
    { sql: "WITH first AS (SELECT * FROM workspace.ln_premium_gold.account_attention), second AS (SELECT * FROM first) SELECT * FROM second;", accepted: true },
  ];
  for (const item of cases) {
    const client = new GenieMcpClient({
      profile: "test", warehouseId: "warehouse", deadlineAt: 60_000, clock: () => 0, sleep: async () => {},
      request: requestSequence([
        { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26", serverInfo: { name: "genie_chat", version: "1.0.0" } } }, null, tools,
        { jsonrpc: "2.0", id: 3, result: { structuredContent: { conversation_id: "c".repeat(32), response_id: "r".repeat(32), status: "in_progress" } } },
        { jsonrpc: "2.0", id: 4, result: { structuredContent: { conversation_id: "c".repeat(32), response_id: "r".repeat(32), status: "completed", query_items: [{ item_id: "item", sql: item.sql }] } } },
        { jsonrpc: "2.0", id: 5, result: { structuredContent: { conversation_id: "c".repeat(32), response_id: "r".repeat(32), item_id: "item", ready: true, statement_state: "SUCCEEDED", columns: [{ name: "total", type_text: "BIGINT" }], rows: [["1"]], total_row_count: 1, truncated: false } } },
      ], []),
    });
    if (item.accepted) await expect(client.ask("Need an answer")).resolves.toMatchObject({ sourceIds: ["workspace.ln_premium_gold.account_attention"] });
    else await expect(client.ask("Need an answer")).rejects.toThrow("no verified Gold query result");
  }
});

test("cancels after its deadline and preserves an unknown outcome", async () => {
  let now = 0;
  const calls: Array<{ args: string[]; body: any }> = [];
  const client = new GenieMcpClient({
    profile: "test", warehouseId: "warehouse", deadlineAt: 1, clock: () => now, sleep: async () => { now += 7_000; }, reconciliationDeadlineMs: 5_000,
    request: requestSequence([
      { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26", serverInfo: { name: "genie_chat", version: "1.0.0" } } }, null, tools,
      { jsonrpc: "2.0", id: 3, result: { structuredContent: { conversation_id: "c".repeat(32), response_id: "r".repeat(32), status: "in_progress" } } },
      { jsonrpc: "2.0", id: 4, result: { structuredContent: { conversation_id: "c".repeat(32), response_id: "r".repeat(32), status: "in_progress" } } },
      new Error("connection closed"),
    ], calls),
  });
  await expect(client.ask("Need an answer")).rejects.toThrow("unknown outcome");
  expect(calls.some(call => call.body?.method === "tools/call" && call.body?.params.name === "genie_cancel_response")).toBe(true);
});

test("cancels a known active conversation after a polling protocol error", async () => {
  const calls: Array<{ args: string[]; body: any }> = [];
  const client = new GenieMcpClient({
    profile: "test", warehouseId: "warehouse", deadlineAt: 60_000, clock: () => 0,
    request: requestSequence([
      { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26", serverInfo: { name: "genie_chat", version: "1.0.0" } } }, null, tools,
      { jsonrpc: "2.0", id: 3, result: { structuredContent: { conversation_id: "c".repeat(32), response_id: "r".repeat(32), status: "in_progress" } } },
      new Error("invalid protocol response"),
      { jsonrpc: "2.0", id: 5, result: {} },
      { jsonrpc: "2.0", id: 6, result: { structuredContent: { conversation_id: "c".repeat(32), response_id: "r".repeat(32), status: "failed" } } },
    ], calls),
  });
  await expect(client.ask("Need an answer")).rejects.toThrow("observed terminal state is failed");
  expect(calls.some(call => call.body?.params?.name === "genie_cancel_response")).toBe(true);
});

test("uses an independent cancellation request after the parent signal aborts", async () => {
  const controller = new AbortController();
  const calls: Array<{ args: string[]; body: any; options?: any }> = [];
  const client = new GenieMcpClient({
    profile: "test", warehouseId: "warehouse", deadlineAt: 60_000, clock: () => 0, signal: controller.signal,
    sleep: async () => { controller.abort(new Error("parent stopped")); },
    request: requestSequence([
      { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26", serverInfo: { name: "genie_chat", version: "1.0.0" } } }, null, tools,
      { jsonrpc: "2.0", id: 3, result: { structuredContent: { conversation_id: "c".repeat(32), response_id: "r".repeat(32), status: "in_progress" } } },
      { jsonrpc: "2.0", id: 4, result: {} },
      { jsonrpc: "2.0", id: 5, result: { structuredContent: { conversation_id: "c".repeat(32), response_id: "r".repeat(32), status: "incomplete" } } },
    ], calls),
  });
  await expect(client.ask("Need an answer")).rejects.toThrow("observed terminal state is incomplete");
  const cancel = calls.find(call => call.body?.params?.name === "genie_cancel_response");
  expect(cancel?.options.signal).toBeUndefined();
});
