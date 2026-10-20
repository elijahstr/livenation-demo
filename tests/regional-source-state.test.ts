import { expect, test } from "bun:test";

import { RegionalSourceState, defaultMetadataRequest } from "../src/regional-source-state";

const silver = ["accounts", "contacts", "identity_links", "contracts", "activities", "orders", "order_items", "tickets", "scans", "venues", "events", "artists", "entitlements", "inventory_snapshots"];
const gold = ["account_attention", "account_event_benefits", "upcoming_options"];
const page = (schema: string) => ({ tables: (schema === "ln_premium_silver" ? silver : gold).map((name) => schema === "ln_premium_silver" ? ({ name, full_name: `workspace.${schema}.${name}`, table_id: `id-${name}`, table_type: "MANAGED", data_source_format: "DELTA" }) : ({ name, full_name: `workspace.${schema}.${name}`, table_type: "VIEW", view_definition: `CREATE VIEW ${name}` })) });

test("builds a canonical state despite metadata order and empty pagination pages", async () => {
  const paths: string[] = [];
  const state = new RegionalSourceState({
    metadataRequest: async (path) => {
      paths.push(path);
      if (path.includes("ln_premium_silver") && !path.includes("page_token")) return { next_page_token: "next token" };
      if (path.includes("ln_premium_silver")) return { tables: [...page("ln_premium_silver").tables].reverse().concat({ name: "unrelated", full_name: "workspace.ln_premium_silver.unrelated", table_id: "x", table_type: "MANAGED" }) };
      return page("ln_premium_gold");
    },
    execute: async (sql) => ({ statementId: "history", columns: ["source_name", "version"], rows: silver.map((name) => [name, "1"]), }),
  });
  const value = await state.read({ scopeHash: "scope", localRefs: [], context: { scanId: "test", deadlineAt: Date.now() + 60_000 } });
  expect(value.refs).toHaveLength(17);
  expect(value.refs.find((ref) => ref.source_id.includes("silver.artists"))?.version).toBe("1");
  expect(paths.some((path) => path.includes("page_token=next+token"))).toBe(true);
});

test("rejects a missing required metadata object", async () => {
  const state = new RegionalSourceState({
    metadataRequest: async (path) => path.includes("silver") ? { tables: page("ln_premium_silver").tables.slice(1) } : page("ln_premium_gold"),
    execute: async () => ({ statementId: "history", columns: ["source_name", "version"], rows: silver.map((name) => [name, "1"]), }),
  });
  await expect(state.read({ scopeHash: "scope", localRefs: [], context: { scanId: "test", deadlineAt: Date.now() + 60_000 } })).rejects.toThrow("missing");
});

test("rejects a repeated page token before the history query", async () => {
  let history = false;
  const state = new RegionalSourceState({
    metadataRequest: async () => ({ tables: [], next_page_token: "again" }),
    execute: async () => { history = true; return { statementId: "history", columns: [], rows: [] }; },
  });
  await expect(state.read({ scopeHash: "scope", localRefs: [], context: { scanId: "test", deadlineAt: Date.now() + 60_000 } })).rejects.toThrow("repeated");
  expect(history).toBe(false);
});

test("rejects nonnumeric Delta versions", async () => {
  const state = new RegionalSourceState({
    metadataRequest: async (path) => page(path.includes("silver") ? "ln_premium_silver" : "ln_premium_gold"),
    execute: async () => ({ statementId: "history", columns: ["source_name", "version"], rows: silver.map((name) => [name, name === "accounts" ? "new" : "1"]), }),
  });
  await expect(state.read({ scopeHash: "scope", localRefs: [], context: { scanId: "test", deadlineAt: Date.now() + 60_000 } })).rejects.toThrow("history");
});

test("rejects a duplicated required object before history", async () => {
  let history = false;
  const state = new RegionalSourceState({
    metadataRequest: async (path) => path.includes("silver") ? { tables: [...page("ln_premium_silver").tables, page("ln_premium_silver").tables[0]] } : page("ln_premium_gold"),
    execute: async () => { history = true; return { statementId: "history", columns: [], rows: [] }; },
  });
  await expect(state.read({ scopeHash: "scope", localRefs: [], context: { scanId: "test", deadlineAt: Date.now() + 60_000 } })).rejects.toThrow("repeats");
  expect(history).toBe(false);
});

test("rejects pagination beyond ten pages", async () => {
  let calls = 0;
  const state = new RegionalSourceState({
    metadataRequest: async () => ({ tables: [], next_page_token: `page-${++calls}` }),
    execute: async () => ({ statementId: "history", columns: [], rows: [] }),
  });
  await expect(state.read({ scopeHash: "scope", localRefs: [], context: { scanId: "test", deadlineAt: Date.now() + 60_000 } })).rejects.toThrow("pagination");
  expect(calls).toBe(10);
});

test("metadata transport runs the guard and encodes a page token", async () => {
  const calls: string[][] = [];
  const request = defaultMetadataRequest("test", {
    beforeRequest: async () => { throw new Error("runtime blocked"); },
    request: async (args) => { calls.push(args); return {}; },
  });
  const context = { scanId: "test", deadlineAt: Date.now() + 60_000 };
  await expect(request("/api/2.1/unity-catalog/tables?catalog_name=workspace&schema_name=ln_premium_silver&max_results=0&omit_columns=true&omit_properties=true&omit_username=true", context)).rejects.toThrow("blocked");
  expect(calls).toHaveLength(0);
  const allowed = defaultMetadataRequest("test", { request: async (args) => { calls.push(args); return {}; } });
  await allowed("/api/2.1/unity-catalog/tables?catalog_name=workspace&schema_name=ln_premium_silver&max_results=0&omit_columns=true&omit_properties=true&omit_username=true&page_token=a%2Fb%20c", context);
  expect(calls.at(-1)?.[2]).toContain("page_token=a%2Fb+c");
  await expect(allowed("/api/2.1/unity-catalog/tables?catalog_name=workspace&schema_name=other&max_results=0&omit_columns=true&omit_properties=true&omit_username=true", context)).rejects.toThrow("not approved");
});

test("canonical state changes for a Delta version, table recreation, or view definition", async () => {
  let version = "1", tableId = "id-accounts", definition = "CREATE VIEW account_attention";
  const state = new RegionalSourceState({
    metadataRequest: async (path) => path.includes("silver")
      ? { tables: page("ln_premium_silver").tables.map(row => row.name === "accounts" ? { ...row, table_id: tableId } : row) }
      : { tables: page("ln_premium_gold").tables.map(row => row.name === "account_attention" ? { ...row, view_definition: definition } : row) },
    execute: async () => ({ statementId: "history", columns: ["source_name", "version"], rows: silver.map(name => [name, name === "accounts" ? version : "1"]) }),
  });
  const input = { scopeHash: "scope", localRefs: [], context: { scanId: "test", deadlineAt: Date.now() + 60_000 } };
  const first = await state.read(input);
  version = "2"; const second = await state.read(input);
  tableId = "new-table-id"; const third = await state.read(input);
  definition = "CREATE VIEW account_attention AS SELECT 2"; const fourth = await state.read(input);
  expect(new Set([first.hash, second.hash, third.hash, fourth.hash]).size).toBe(4);
});

test("metadata requests trace receipt and failure without pagination tokens", async () => {
  const traces: Array<Record<string, unknown>> = [];
  const state = new RegionalSourceState({
    metadataRequest: async path => path.includes("silver") ? page("ln_premium_silver") : Promise.reject(new Error("denied")),
    execute: async () => ({ statementId: "history", columns: [], rows: [] }),
  });
  await expect(state.read({ scopeHash: "scope", localRefs: [], context: { scanId: "test", deadlineAt: Date.now() + 60_000, onTrace: trace => { traces.push(trace); } } })).rejects.toThrow("denied");
  expect(traces.map(trace => [trace.kind, trace.status, trace.schema])).toEqual([
    ["source_metadata_request", "received", "ln_premium_silver"],
    ["source_metadata_request", "failed", "ln_premium_gold"],
  ]);
  expect(JSON.stringify(traces)).not.toContain("page_token");
});

test("rejects an external Silver object before the history query", async () => {
  let history = false;
  const state = new RegionalSourceState({
    metadataRequest: async path => path.includes("silver")
      ? { tables: page("ln_premium_silver").tables.map(row => row.name === "accounts" ? { ...row, table_type: "EXTERNAL" } : row) }
      : page("ln_premium_gold"),
    execute: async () => { history = true; return { statementId: "history", columns: [], rows: [] }; },
  });
  await expect(state.read({ scopeHash: "scope", localRefs: [], context: { scanId: "test", deadlineAt: Date.now() + 60_000 } })).rejects.toThrow("invalid");
  expect(history).toBe(false);
});

test("rejects an oversized metadata page before history and records receipt", async () => {
  let history = false; const traces: string[] = [];
  const state = new RegionalSourceState({
    metadataRequest: async () => ({ tables: [], ignored: "x".repeat(1024 * 1024) }),
    execute: async () => { history = true; return { statementId: "history", columns: [], rows: [] }; },
  });
  await expect(state.read({ scopeHash: "scope", localRefs: [], context: { scanId: "test", deadlineAt: Date.now() + 60_000, onTrace: trace => { traces.push(`${trace.kind}:${trace.status}`); } } })).rejects.toThrow("exceeds");
  expect(history).toBe(false);
  expect(traces).toEqual(["source_metadata_request:received"]);
});
