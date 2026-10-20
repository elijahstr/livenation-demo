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

test("a terminal submission records its terminal trace before an abort", async () => {
  const controller = new AbortController(); const terminal: string[] = [];
  const statements = new RegionalStatements({ profile: "test", warehouseId: "warehouse", request: async () => {
    controller.abort();
    return { statement_id: "statement-1", status: { state: "SUCCEEDED" }, manifest: { total_chunk_count: 1, total_row_count: 0, schema: { columns: [] } }, result: { data_array: [] } };
  } });
  await expect(statements.execute("SELECT 1", [], { ...context, signal: controller.signal, onTrace: trace => { if (trace.kind === "regional_statement_terminal") terminal.push(String(trace.state)); } })).rejects.toMatchObject({ name: "AbortError" });
  expect(terminal).toEqual(["SUCCEEDED"]);
});

test("regional statement wait uses zero below five seconds and waits five to ten seconds otherwise", async () => {
  const originalNow = Date.now; const start = originalNow(); Date.now = () => start;
  try {
    const waits: string[] = [];
    const request = async (_args: string[], body?: unknown) => {
      waits.push(String((body as { wait_timeout?: string }).wait_timeout));
      return { statement_id: "statement-1", status: { state: "SUCCEEDED" }, manifest: { total_chunk_count: 1, total_row_count: 0, schema: { columns: [] } }, result: { data_array: [] } };
    };
    const statements = new RegionalStatements({ profile: "test", warehouseId: "warehouse", request });
    await statements.execute("SELECT 1", [], { ...context, deadlineAt: start + 10_000 });
    await statements.execute("SELECT 1", [], { ...context, deadlineAt: start + 14_000 });
    await statements.execute("SELECT 1", [], { ...context, deadlineAt: start + 13_000 });
    await statements.execute("SELECT 1", [], { ...context, deadlineAt: start + 60_000 });
    expect(waits).toEqual(["0s", "5s", "0s", "10s"]);
  } finally { Date.now = originalNow; }
});

test("a known terminal response records its trace before a deadline error", async () => {
  const originalNow = Date.now; const start = originalNow(); let late = false; const terminal: string[] = [];
  Date.now = () => late ? start + 6_001 : start;
  try {
    const statements = new RegionalStatements({ profile: "test", warehouseId: "warehouse", request: async () => {
      late = true;
      return { statement_id: "statement-1", status: { state: "SUCCEEDED" }, manifest: { total_chunk_count: 1, total_row_count: 0, schema: { columns: [] } }, result: { data_array: [] } };
    } });
    await expect(statements.execute("SELECT 1", [], { ...context, deadlineAt: start + 6_000, onTrace: trace => { if (trace.kind === "regional_statement_terminal") terminal.push(String(trace.state)); } })).rejects.toThrow("deadline expired");
    expect(terminal).toEqual(["SUCCEEDED"]);
  } finally { Date.now = originalNow; }
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
        columns: ["account_id", "account_name", "venue_id", "venue_name", "state", "activity", "contract", "purchases", "benefits"],
        rows: [["A100", "Harbor Works", "V100", "Shoreline Amphitheatre", "CA", "[]", "[]", "[]", "[]"]],
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
    statementId: "partial-1", columns: ["account_id", "account_name", "venue_id", "venue_name", "state", "activity", "contract", "purchases", "benefits"],
    rows: [["A100", "Harbor Works", "V100", "Shoreline Amphitheatre", "CA", activities, "[]", "[]", '[{"product_id":"parking","included_quantity":1}]']],
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
    return { statementId: "detail-1", columns: ["account_id", "account_name", "venue_id", "venue_name", "state", "activity", "contract", "purchases", "benefits"], rows: [["A100", "Harbor Works", "V100", "Shoreline Amphitheatre", "CA", "[]", "[]", "[]", "[]"]] };
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
    metadataRequest: async (path) => ({ tables: path.includes("silver") ? ["accounts", "contacts", "identity_links", "contracts", "activities", "orders", "order_items", "tickets", "scans", "venues", "events", "artists", "entitlements", "inventory_snapshots"].map(name => ({ name, full_name: `workspace.ln_premium_silver.${name}`, table_id: `id-${name}`, table_type: "MANAGED", data_source_format: "DELTA" })) : ["account_attention", "account_event_benefits", "upcoming_options"].map(name => ({ name, full_name: `workspace.ln_premium_gold.${name}`, table_type: "VIEW", view_definition: `CREATE VIEW ${name}` })) }),
    execute: async (sql) => {
      if (sql.includes("DESCRIBE HISTORY")) return { statementId: "history", columns: ["source_name", "version"], rows: ["accounts", "contacts", "identity_links", "contracts", "activities", "orders", "order_items", "tickets", "scans", "venues", "events", "artists", "entitlements", "inventory_snapshots"].map(name => [name, "1"]) };
      throw new Error("unexpected statement");
    },
  });

  await data.fingerprint({ ...context, onTrace: (trace) => {
    if (trace.kind === "source_check_progress") traces.push({ completed: trace.completed as number | undefined, total: trace.total as number | undefined });
  } });

  expect(traces).toEqual([{ completed: 17, total: 17 }]);
});

test("promotes a complete summary only after a later equal fingerprint and rebinds a cache hit", async () => {
  let summaries = 0; let version = "1";
  const tables = ["accounts", "contacts", "identity_links", "contracts", "activities", "orders", "order_items", "tickets", "scans", "venues", "events", "artists", "entitlements", "inventory_snapshots"];
  const data = new RegionalData({
    scope, profile: "test", warehouseId: "warehouse",
    metadataRequest: async path => ({ tables: path.includes("silver") ? tables.map(name => ({ name, full_name: `workspace.ln_premium_silver.${name}`, table_id: `id-${name}`, table_type: "MANAGED", data_source_format: "DELTA" })) : ["account_attention", "account_event_benefits", "upcoming_options"].map(name => ({ name, full_name: `workspace.ln_premium_gold.${name}`, table_type: "VIEW", view_definition: `CREATE VIEW ${name}` })) }),
    execute: async (sql) => {
      if (sql.includes("DESCRIBE HISTORY")) return { statementId: "history", columns: ["source_name", "version"], rows: tables.map(name => [name, version]) };
      summaries++;
      return { statementId: "summary-original", columns: ["account_id", "account_name", "venue_id", "venue_name", "state", "activity", "contract", "purchases", "benefits"], rows: [["A100", "Harbor Works", "V100", "Shoreline Amphitheatre", "CA", "[]", "[]", "[]", "[]"], ["A200", "Missing Source", "V200", "River Hall", "OR", "[]", "[]", "[]", "[]"]] };
    },
  });
  const start = await data.fingerprint(context);
  const first = await data.summaries({ ...context, fingerprint: start });
  first[0]!.sections.identity.rows[0]!.account_name = "mutated";
  await data.fingerprint({ ...context, fingerprint: start });
  const next = await data.fingerprint({ ...context, scanId: "next" });
  const hit = await data.summaries({ ...context, scanId: "next", fingerprint: next });
  expect(summaries).toBe(1);
  expect(hit[0]?.cache).toBe("hit");
  expect(hit[0]?.scan_id).toBe("next");
  expect(hit[0]?.evidence[0]?.query_id).toBe("summary-original");
  expect(hit[0]?.sections.identity.rows[0]?.account_name).toBe("Harbor Works");
  const controller = new AbortController(); controller.abort();
  await expect(data.summaries({ ...context, scanId: "aborted", fingerprint: next, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  await expect(data.summaries({ ...context, scanId: "expired", fingerprint: next, deadlineAt: Date.now() - 1 })).rejects.toThrow("deadline");
  const traces: string[] = []; version = "2";
  const changed = await data.fingerprint({ ...context, scanId: "next", fingerprint: next, onTrace: trace => { traces.push(trace.kind); } });
  const changedSummary = await data.summaries({ ...context, scanId: "next", fingerprint: changed });
  expect(traces).toContain("source_changed");
  expect(changedSummary[0]?.cache).toBe("miss");
  expect(summaries).toBe(2);
});

test("a tentative cache misses before confirmation and clears after metadata failure", async () => {
  const tables = ["accounts", "contacts", "identity_links", "contracts", "activities", "orders", "order_items", "tickets", "scans", "venues", "events", "artists", "entitlements", "inventory_snapshots"];
  let failMetadata = false; let summaryCalls = 0;
  const data = new RegionalData({
    scope, profile: "test", warehouseId: "warehouse",
    metadataRequest: async path => {
      if (failMetadata) throw new Error("metadata unavailable");
      return { tables: path.includes("silver") ? tables.map(name => ({ name, full_name: `workspace.ln_premium_silver.${name}`, table_id: `id-${name}`, table_type: "MANAGED", data_source_format: "DELTA" })) : ["account_attention", "account_event_benefits", "upcoming_options"].map(name => ({ name, full_name: `workspace.ln_premium_gold.${name}`, table_type: "VIEW", view_definition: `CREATE VIEW ${name}` })) };
    },
    execute: async sql => sql.includes("DESCRIBE HISTORY")
      ? ({ statementId: "history", columns: ["source_name", "version"], rows: tables.map(name => [name, "1"]) })
      : ({ statementId: `summary-${++summaryCalls}`, columns: ["account_id", "account_name", "venue_id", "venue_name", "state", "activity", "contract", "purchases", "benefits"], rows: [["A100", "Harbor Works", "V100", "Shoreline Amphitheatre", "CA", "[]", "[]", "[]", "[]"], ["A200", "Missing Source", "V200", "River Hall", "OR", "[]", "[]", "[]", "[]"]] }),
  });
  const first = await data.fingerprint(context);
  await data.summaries({ ...context, fingerprint: first });
  await data.summaries({ ...context, scanId: "before-confirm", fingerprint: first });
  expect(summaryCalls).toBe(2);
  await data.fingerprint({ ...context, scanId: "before-confirm", fingerprint: first });
  failMetadata = true;
  await expect(data.fingerprint({ ...context, scanId: "before-confirm", fingerprint: first })).rejects.toThrow("metadata unavailable");
  await data.summaries({ ...context, scanId: "after-failure", fingerprint: first });
  expect(summaryCalls).toBe(3);
});

test("partial summaries never promote into a later scan cache hit", async () => {
  const tables = ["accounts", "contacts", "identity_links", "contracts", "activities", "orders", "order_items", "tickets", "scans", "venues", "events", "artists", "entitlements", "inventory_snapshots"];
  let summaryCalls = 0;
  const data = new RegionalData({
    scope, profile: "test", warehouseId: "warehouse",
    metadataRequest: async path => ({ tables: path.includes("silver") ? tables.map(name => ({ name, full_name: `workspace.ln_premium_silver.${name}`, table_id: `id-${name}`, table_type: "MANAGED", data_source_format: "DELTA" })) : ["account_attention", "account_event_benefits", "upcoming_options"].map(name => ({ name, full_name: `workspace.ln_premium_gold.${name}`, table_type: "VIEW", view_definition: `CREATE VIEW ${name}` })) }),
    execute: async sql => sql.includes("DESCRIBE HISTORY")
      ? ({ statementId: "history", columns: ["source_name", "version"], rows: tables.map(name => [name, "1"]) })
      : ({ statementId: `summary-${++summaryCalls}`, columns: ["account_id", "account_name", "venue_id", "venue_name", "state", "activity", "contract", "purchases", "benefits"], rows: [["A100", "Harbor Works", "V100", "Shoreline Amphitheatre", "CA", JSON.stringify(Array.from({ length: 60 }, () => ({ activity_at: "x" }))), "[]", "[]", "[]"], ["A200", "Missing Source", "V200", "River Hall", "OR", "[]", "[]", "[]", "[]"]] }),
  });
  const fingerprint = await data.fingerprint(context);
  await data.summaries({ ...context, fingerprint });
  await data.fingerprint({ ...context, fingerprint });
  await data.summaries({ ...context, scanId: "next", fingerprint });
  expect(summaryCalls).toBe(2);
});

test("summary cache excludes complete envelopes above two MiB", async () => {
  const largeScope: RegionalScope = { ...scope, accounts: Array.from({ length: 700 }, (_, index) => ({ account_id: `A${index}`, account_name: `Account ${index}`, venue_id: `V${index}`, state: "CA" })) };
  const tables = ["accounts", "contacts", "identity_links", "contracts", "activities", "orders", "order_items", "tickets", "scans", "venues", "events", "artists", "entitlements", "inventory_snapshots"];
  const section = JSON.stringify([{ value: "x".repeat(300) }]); let summaries = 0;
  const data = new RegionalData({
    scope: largeScope, profile: "test", warehouseId: "warehouse",
    metadataRequest: async path => ({ tables: path.includes("silver") ? tables.map(name => ({ name, full_name: `workspace.ln_premium_silver.${name}`, table_id: `id-${name}`, table_type: "MANAGED", data_source_format: "DELTA" })) : ["account_attention", "account_event_benefits", "upcoming_options"].map(name => ({ name, full_name: `workspace.ln_premium_gold.${name}`, table_type: "VIEW", view_definition: `CREATE VIEW ${name}` })) }),
    execute: async sql => sql.includes("DESCRIBE HISTORY") ? ({ statementId: "history", columns: ["source_name", "version"], rows: tables.map(name => [name, "1"]) }) : ({ statementId: `summary-${++summaries}`, columns: ["account_id", "account_name", "venue_id", "venue_name", "state", "activity", "contract", "purchases", "benefits"], rows: largeScope.accounts.map(account => [account.account_id, account.account_name, account.venue_id, `Venue ${account.venue_id}`, "CA", section, section, section, section]) }),
  });
  const first = await data.fingerprint(context);
  await data.summaries({ ...context, fingerprint: first });
  await data.fingerprint({ ...context, fingerprint: first });
  await data.summaries({ ...context, scanId: "next", fingerprint: first });
  expect(summaries).toBe(2);
});
