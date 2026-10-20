import { expect, test } from "bun:test";

import { RegionalData } from "../src/regional-data";
import type { ReadContext, RegionalScope } from "../src/regional-types";

const scope: RegionalScope = {
  version: "test-v1",
  label: "Test region",
  seller_id: "seller",
  principal_version: "principal-v1",
  territory_assignment: "explicit test assignment",
  accounts: [{ account_id: "A100", account_name: "Harbor Works", venue_id: "V100", state: "CA" }],
};

const context: ReadContext = { scanId: "scan-test", deadlineAt: Date.now() + 60_000 };

test("summary evidence adds the venue name to the identity evidence", async () => {
  let query = "";
  const data = new RegionalData({
    scope,
    profile: "test",
    warehouseId: "warehouse",
    execute: async (sql) => {
      query = sql;
      return {
        statementId: "summary-artist",
        columns: ["account_id", "account_name", "venue_id", "venue_name", "state", "activity", "contract", "purchases", "benefits"],
        rows: [["A100", "Harbor Works", "V100", "Shoreline Amphitheatre", "CA", "[]", "[]", "[]", "[]"]],
      };
    },
  });

  const result = (await data.summaries(context))[0]!;

  expect(query).toContain("workspace.ln_premium_silver.artists");
  expect(query).toContain("v.venue_name");
  expect(query.match(/'event_name',artist\.artist_name/g)).toHaveLength(2);
  expect(result.sections.identity.rows[0]?.venue_name).toBe("Shoreline Amphitheatre");
  expect(result.evidence.find((item) => item.evidence_id.endsWith(":identity"))?.source_ref).toBe("workspace.ln_premium_silver.accounts and workspace.ln_premium_silver.venues");
});

test("summary marks an empty venue name as unavailable", async () => {
  const data = new RegionalData({
    scope,
    profile: "test",
    warehouseId: "warehouse",
    execute: async () => ({
      statementId: "summary-empty-venue",
      columns: ["account_id", "account_name", "venue_id", "venue_name", "state", "activity", "contract", "purchases", "benefits"],
      rows: [["A100", "Harbor Works", "V100", "", "CA", "[]", "[]", "[]", "[]"]],
    }),
  });
  const result = (await data.summaries(context))[0]!;
  expect(result.status).toBe("unavailable");
  expect(result.sections.identity.state).toBe("unavailable");
});

test("option evidence returns the real artist name as the event name", async () => {
  let query = "";
  const data = new RegionalData({
    scope,
    profile: "test",
    warehouseId: "warehouse",
    execute: async (sql) => {
      query = sql;
      return { statementId: "options-artist", columns: [], rows: [] };
    },
  });

  await data.options("A100", {}, context);

  expect(query).toContain("LEFT JOIN workspace.ln_premium_silver.artists");
  expect(query).toContain("artist.artist_name AS event_name");
});

test("the source fingerprint watches the artist labels used by event evidence", async () => {
  const queries: string[] = [];
  const data = new RegionalData({
    scope,
    profile: "test",
    warehouseId: "warehouse",
    metadataRequest: async (path) => ({ tables: path.includes("silver") ? ["accounts", "contacts", "identity_links", "contracts", "activities", "orders", "order_items", "tickets", "scans", "venues", "events", "artists", "entitlements", "inventory_snapshots"].map(name => ({ name, full_name: `workspace.ln_premium_silver.${name}`, table_id: `id-${name}`, table_type: "MANAGED", data_source_format: "DELTA" })) : ["account_attention", "account_event_benefits", "upcoming_options"].map(name => ({ name, full_name: `workspace.ln_premium_gold.${name}`, table_type: "VIEW", view_definition: `CREATE VIEW ${name}` })) }),
    execute: async (sql) => {
      queries.push(sql);
      return { statementId: "history", columns: ["source_name", "version"], rows: ["accounts", "contacts", "identity_links", "contracts", "activities", "orders", "order_items", "tickets", "scans", "venues", "events", "artists", "entitlements", "inventory_snapshots"].map(name => [name, "1"]) };
    },
  });

  await data.fingerprint(context);

  expect(queries[0]).toContain("DESCRIBE HISTORY workspace.ln_premium_silver.artists");
});
