import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionStore } from "../src/action-store";
import { validateWestSalesRows, selectWestAlert } from "../src/west-sales";

const directory = await mkdtemp(join(tmpdir(), "livenation-west-verify-"));
try {
  const fixture = (JSON.parse(await Bun.file(new URL("../fixtures/west-region-sales.json", import.meta.url)).text()) as Array<Record<string, unknown>>).map((row) => ({ ...row, data_as_of: new Date().toISOString() }));
  const rows = validateWestSalesRows(fixture, new Date(), 6);
  const alert = selectWestAlert(rows, new Date());
  if (!alert || alert.evidence.venue_name !== "Hayden Homes Amphitheater") throw new Error("Hayden Homes must be the selected West alert");
  const store = new ActionStore(join(directory, "actions.json"));
  const action = await store.create({ alertSnapshotHash: alert.snapshotHash, actionType: "social", content: "Synthetic local social draft." });
  await store.approve(action.action_id);
  const first = await store.execute(action.action_id); const second = await store.execute(action.action_id);
  if (first.action_id !== second.action_id) throw new Error("Duplicate simulation execution did not reuse the action");
  console.log("Local West sales verification passed.");
} finally { await rm(directory, { recursive: true, force: true }); }
