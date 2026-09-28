import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ActionStore, UncertainActionError } from "../src/action-store";

const directories: string[] = [];
async function store() {
  const directory = await mkdtemp(join(tmpdir(), "livenation-actions-"));
  directories.push(directory);
  return new ActionStore(join(directory, "actions.json"));
}
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe("ActionStore", () => {
  test("invalidates approval when an operator edits a draft", async () => {
    const actions = await store();
    const created = await actions.create({ alertSnapshotHash: "snapshot", actionType: "email", content: "Draft" });
    const approved = await actions.approve(created.action_id);
    const edited = await actions.edit(approved.action_id, "Changed draft");

    expect(edited.status).toBe("pending");
  });

  test("returns one completed record for concurrent duplicate execution", async () => {
    const actions = await store();
    const created = await actions.create({ alertSnapshotHash: "snapshot", actionType: "social", content: "Draft" });
    await actions.approve(created.action_id);

    const [first, second] = await Promise.all([actions.execute(created.action_id), actions.execute(created.action_id)]);
    expect(first.action_id).toBe(second.action_id);
    expect(first.status).toBe("completed");
    expect((await actions.list()).filter((action) => action.status === "completed")).toHaveLength(1);
  });

  test("rejects an unapproved record even when another completed record has its idempotency key", async () => {
    const actions = await store();
    const first = await actions.create({ alertSnapshotHash: "snapshot", actionType: "social", content: "Draft" });
    await actions.approve(first.action_id);
    await actions.execute(first.action_id);
    const second = await actions.create({ alertSnapshotHash: "snapshot", actionType: "social", content: "Draft" });
    await expect(actions.execute(second.action_id)).rejects.toThrow("pending");
  });

  test("keeps a failed temporary location removable after a test", async () => {
    const actions = await store();
    await actions.create({ alertSnapshotHash: "snapshot", actionType: "dismiss", content: "Dismiss" });
    expect((await actions.list())).toHaveLength(1);
  });

  test("persists a known simulation failure as failed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "livenation-actions-")); directories.push(directory);
    const actions = new ActionStore(join(directory, "actions.json"), { simulate: async () => { throw new Error("known failure"); } });
    const action = await actions.create({ alertSnapshotHash: "snapshot", actionType: "email", content: "Draft" }); await actions.approve(action.action_id);
    expect((await actions.execute(action.action_id)).status).toBe("failed");
  });

  test("persists an uncertain simulation result and blocks retry", async () => {
    const directory = await mkdtemp(join(tmpdir(), "livenation-actions-")); directories.push(directory);
    const actions = new ActionStore(join(directory, "actions.json"), { simulate: async () => { throw new UncertainActionError("unknown result"); } });
    const action = await actions.create({ alertSnapshotHash: "snapshot", actionType: "email", content: "Draft" }); await actions.approve(action.action_id);
    expect((await actions.execute(action.action_id)).status).toBe("unknown");
    await expect(actions.execute(action.action_id)).rejects.toThrow("unknown");
  });
});
