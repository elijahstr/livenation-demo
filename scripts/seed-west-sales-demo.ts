import { mkdir, writeFile } from "node:fs/promises";
import runtime from "../config/demo-runtime.json";
import { DatabricksSalesAdapter } from "../src/databricks-sales-adapter";
import { buildWestSeedStatements, validateWestSeedRows } from "../src/west-seed";

const profile = process.env.DATABRICKS_PROFILE ?? runtime.databricksProfile;
const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID ?? runtime.warehouseId;
const timestamp = new Date().toISOString().replaceAll(":", "-");
const captureDirectory = new URL(`../outputs/migrations/${timestamp}/`, import.meta.url);
const fixture = (JSON.parse(await Bun.file(new URL("../fixtures/west-region-sales.json", import.meta.url)).text()) as Array<Record<string, unknown>>).map((row) => ({ ...row, data_as_of: new Date().toISOString() }));
if (fixture.length !== 6 || fixture.some((row) => row.region !== "west" || row.origin !== "synthetic")) throw new Error("West seed fixture must contain six synthetic West rows");
validateWestSeedRows(fixture);
await mkdir(captureDirectory, { recursive: true });

async function statement(sql: string): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 55_000;
  const invoke = async (method: "get" | "post", path: string, body?: unknown) => {
    const args = ["databricks", "api", method, path, "--profile", profile, "--output", "json"];
    if (body !== undefined) args.push("--json", JSON.stringify(body));
    const command = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => command.kill(), Math.max(1, deadline - Date.now()));
    try { if (await command.exited !== 0) throw new Error((await new Response(command.stderr).text()).trim()); return JSON.parse(await new Response(command.stdout).text()) as Record<string, unknown>; } finally { clearTimeout(timer); }
  };
  let result = await invoke("post", "/api/2.0/sql/statements", { warehouse_id: warehouseId, statement: sql, wait_timeout: "50s", on_wait_timeout: "CONTINUE" });
  while ((result.status as { state?: string } | undefined)?.state === "PENDING" || (result.status as { state?: string } | undefined)?.state === "RUNNING") {
    const id = result.statement_id as string | undefined;
    if (!id || Date.now() >= deadline) { if (id) await invoke("post", `/api/2.0/sql/statements/${id}/cancel`, {}); throw new Error("Databricks seed statement timed out"); }
    await Bun.sleep(Math.min(100, deadline - Date.now())); result = await invoke("get", `/api/2.0/sql/statements/${id}`);
  }
  const status = result.status as { state?: string; error?: { message?: string } } | undefined;
  if (status?.state !== "SUCCEEDED" || (result.manifest as { truncated?: boolean } | undefined)?.truncated) throw new Error(status?.error?.message ?? "Databricks capture or seed statement did not succeed");
  return result;
}
for (const [name, sql] of [["history.json", "DESCRIBE HISTORY workspace.livenation_demo.show_sales_snapshots"], ["table.json", "SHOW CREATE TABLE workspace.livenation_demo.show_sales_snapshots"], ["view.json", "SHOW CREATE TABLE workspace.livenation_demo.current_sales_evidence"]] as const) await writeFile(new URL(name, captureDirectory), `${JSON.stringify(await statement(sql), null, 2)}\n`);

const { createTableSql, constraintSql, insertSql } = buildWestSeedStatements(validateWestSeedRows(fixture));
await statement(createTableSql);
for (const sql of constraintSql) await statement(sql);
await statement(insertSql);
await statement("ALTER VIEW workspace.livenation_demo.current_sales_evidence AS SELECT event_id, region, venue_name, city, state, public_capacity, event_name, show_date, tickets_sold_cumulative, tickets_target_cumulative, data_as_of, market_signals, origin FROM workspace.livenation_demo.show_sales_snapshots");
const rows = await new DatabricksSalesAdapter({ profile, warehouseId }).read();
const hayden = rows.find((row) => row.venue_name === "Hayden Homes Amphitheater");
if (!hayden || hayden.tickets_sold_cumulative / hayden.tickets_target_cumulative !== 0.55) throw new Error("Seeded West view does not contain the Hayden 0.55 alert");
console.log(`Captured and seeded the West demo at ${captureDirectory.pathname}.`);
