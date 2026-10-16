import { describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabricksStatements, runDatabricksJson, runDatabricksJsonRequest, type StatementTransport } from "../src/databricks-statements";

const ok = (id = "s1") => ({ statement_id: id, status: { state: "SUCCEEDED" }, manifest: { schema: { columns: [{ name: "value" }] } }, result: { data_array: [["1"]] } });
const transport = (responses: any[], calls: string[][]): StatementTransport => async (args) => { calls.push(args); const result = responses.shift(); if (result instanceof Error) throw result; return result; };

describe("DatabricksStatements", () => {
  test("submits an immediate inline result with fixed bounds and journals its ID", async () => {
    const calls: string[][] = []; const events: any[] = []; let body: any;
    const client = new DatabricksStatements({ profile: "p", warehouseId: "w", transport: async (args, request) => { calls.push(args); body = request; return ok(); }, onEvent: async (event) => { events.push(event); } });
    await expect(client.execute("SELECT :x", [{ name: "x", value: "1", type: "INT" }])).resolves.toEqual({ statementId: "s1", columns: ["value"], rows: [["1"]] });
    expect(events.slice(0, 2)).toEqual([{ kind: "submission_intent" }, { kind: "statement_id", statementId: "s1" }]);
    expect(calls[0]).toEqual(expect.arrayContaining(["api", "post", "--profile", "p"]));
    expect(body).toMatchObject({ warehouse_id: "w", statement: "SELECT :x", parameters: [{ name: "x", value: "1", type: "INT" }], disposition: "INLINE", format: "JSON_ARRAY", row_limit: 1000, byte_limit: 1024 * 1024, wait_timeout: "0s" });
  });

  test("rejects failed, truncated, and multi-chunk results", async () => {
    for (const response of [{ statement_id: "s", status: { state: "FAILED" } }, { ...ok("s"), manifest: { truncated: true } }, { ...ok("s"), manifest: { total_chunk_count: 2, schema: { columns: [{ name: "value" }] } } }, { ...ok("s"), result: { data_array: [["1", "2"]] } }]) {
      const client = new DatabricksStatements({ profile: "p", warehouseId: "w", transport: transport([response], []) });
      await expect(client.execute("SELECT 1")).rejects.toThrow();
    }
  });

  test("keeps a bounded failed-state diagnostic and redacts a bearer credential", async () => {
    const response = { statement_id: "s", status: { state: "FAILED", error: { message: "Syntax error; Authorization: Bearer credential-value" } } };
    const client = new DatabricksStatements({ profile: "p", warehouseId: "w", transport: transport([response], []) });
    await expect(client.execute("SELECT bad")).rejects.toThrow("Authorization=[REDACTED]");
    await expect(new DatabricksStatements({ profile: "p", warehouseId: "w", transport: transport([response], []) }).execute("SELECT bad")).rejects.not.toThrow("credential-value");
  });

  test("cancels a timed out statement and polls the terminal state", async () => {
    let now = 0; const calls: string[][] = [];
    const client = new DatabricksStatements({ profile: "p", warehouseId: "w", clock: () => now, sleep: async () => { now = 2; }, executionDeadlineMs: 1, reconciliationDeadlineMs: 20, transport: transport([{ statement_id: "s", status: { state: "RUNNING" } }, { statement_id: "s", status: { state: "RUNNING" } }, {}, { statement_id: "s", status: { state: "CANCELED" } }], calls) });
    await expect(client.execute("SELECT 1")).rejects.toThrow("timed out");
    expect(calls.map((call) => call.join(" ")).join("\n")).toContain("/s/cancel");
  });

  test("does not retry an unknown submission", async () => {
    const client = new DatabricksStatements({ profile: "p", warehouseId: "w", transport: transport([new Error("lost process")], []) });
    await expect(client.execute("SELECT 1")).rejects.toThrow("submission outcome is unknown");
  });

  test("accepts an explicit empty result and rejects a mismatched total", async () => {
    const empty = { statement_id: "s", status: { state: "SUCCEEDED" }, manifest: { total_row_count: 0, schema: { columns: [{ name: "value" }] } } };
    const client = new DatabricksStatements({ profile: "p", warehouseId: "w", transport: transport([empty], []) });
    await expect(client.execute("SELECT 1 WHERE false")).resolves.toEqual({ statementId: "s", columns: ["value"], rows: [] });
    const incomplete = { ...ok("s"), manifest: { total_row_count: 2, schema: { columns: [{ name: "value" }] } } };
    const broken = new DatabricksStatements({ profile: "p", warehouseId: "w", transport: transport([incomplete], []) });
    await expect(broken.execute("SELECT 1")).rejects.toThrow("incomplete result");
  });

  test("accepts the zero-column DDL response returned by Databricks", async () => {
    const response = { statement_id: "ddl-1", status: { state: "SUCCEEDED" }, manifest: { format: "JSON_ARRAY", schema: { column_count: 0 }, total_chunk_count: 0, total_row_count: 0, truncated: false }, result: {} };
    const client = new DatabricksStatements({ profile: "p", warehouseId: "w", transport: transport([response], []) });
    await expect(client.execute("CREATE SCHEMA workspace.ln_premium_bronze COMMENT 'livenation-premium foundation-v1'")).resolves.toEqual({ statementId: "ddl-1", columns: [], rows: [] });
  });

  test("rejects a SELECT response without a result schema", async () => {
    const client = new DatabricksStatements({ profile: "p", warehouseId: "w", transport: transport([{ statement_id: "select-1", status: { state: "SUCCEEDED" }, result: {} }], []) });
    await expect(client.execute("SELECT 1")).rejects.toThrow("incomplete result");
  });

  test("cancels and reconciles when the caller aborts", async () => {
    const controller = new AbortController(); const calls: string[][] = [];
    const client = new DatabricksStatements({ profile: "p", warehouseId: "w", signal: controller.signal, sleep: async () => { controller.abort(); }, transport: transport([{ statement_id: "s", status: { state: "RUNNING" } }, {}, { statement_id: "s", status: { state: "CANCELED" } }], calls) });
    await expect(client.execute("SELECT 1")).rejects.toThrow("interrupted after cancellation");
    expect(calls.map((call) => call.join(" ")).join("\n")).toContain("/s/cancel");
  });

  test("reports timeout even when cancellation observes success", async () => {
    let now = 0;
    const client = new DatabricksStatements({ profile: "p", warehouseId: "w", clock: () => now, sleep: async () => { now = 2; }, executionDeadlineMs: 1, transport: transport([{ statement_id: "s", status: { state: "RUNNING" } }, { statement_id: "s", status: { state: "RUNNING" } }, {}, ok("s")], []) });
    await expect(client.execute("SELECT 1")).rejects.toThrow(/timed out.*SUCCEEDED/);
  });

  test("stops a CLI response that exceeds its configured drain cap", async () => {
    const directory = await mkdtemp(join(tmpdir(), "databricks-statements-test-"));
    const executable = join(directory, "databricks");
    const oldPath = process.env.PATH;
    try {
      await writeFile(executable, "#!/bin/sh\nprintf '0123456789'\n", { mode: 0o700 });
      await chmod(executable, 0o700);
      process.env.PATH = `${directory}:${oldPath ?? ""}`;
      await expect(runDatabricksJson(["api", "get", "/api/2.0/test"], { maxBytes: 8 })).rejects.toThrow("configured limit");
    } finally {
      process.env.PATH = oldPath;
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("terminates an aborted CLI subprocess within the bounded cleanup window", async () => {
    const directory = await mkdtemp(join(tmpdir(), "databricks-statements-abort-test-"));
    const executable = join(directory, "databricks");
    const oldPath = process.env.PATH; const controller = new AbortController();
    try {
      await writeFile(executable, "#!/bin/sh\ntrap '' TERM\nwhile :; do :; done\n", { mode: 0o700 });
      await chmod(executable, 0o700);
      process.env.PATH = `${directory}:${oldPath ?? ""}`;
      setTimeout(() => controller.abort(new DOMException("cancelled", "AbortError")), 20);
      const started = Date.now();
      await expect(runDatabricksJsonRequest(["api", "post", "/api/2.0/test"], {}, { timeoutMs: 15_000, maxBytes: 1024, signal: controller.signal })).rejects.toThrow("cancelled");
      expect(Date.now() - started).toBeLessThan(3_500);
    } finally {
      process.env.PATH = oldPath;
      await rm(directory, { recursive: true, force: true });
    }
  });
});
