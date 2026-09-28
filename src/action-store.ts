import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { assertActionType, assertTransition, type ActionStatus, type ActionType } from "./action-state";

export type ActionRecord = {
  action_id: string;
  idempotency_key: string;
  alert_snapshot_hash: string;
  action_type: ActionType;
  content: string;
  status: ActionStatus;
  created_at: string;
  updated_at: string;
  failure_message?: string;
};
export class UncertainActionError extends Error {}

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function key(snapshot: string, actionType: ActionType, content: string): string { return digest(`${snapshot}\n${actionType}\n${digest(content)}`); }
function assertContent(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 4000) throw new Error("Action content must contain 1 to 4000 characters");
}

export class ActionStore {
  #queue = Promise.resolve();
  constructor(private readonly filePath: string, private readonly options: { simulate?: (record: ActionRecord) => Promise<void> } = {}) {}

  private async transaction<T>(operation: (records: ActionRecord[]) => Promise<T> | T, persist = true): Promise<T> {
    let release!: () => void;
    const previous = this.#queue;
    this.#queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const records = await this.load();
      const result = await operation(records);
      if (persist) await this.persist(records);
      return result;
    } finally { release(); }
  }

  private async load(): Promise<ActionRecord[]> {
    const file = Bun.file(this.filePath);
    if (!(await file.exists())) return [];
    const value = JSON.parse(await file.text()) as unknown;
    if (!Array.isArray(value)) throw new Error("Action store is not an array");
    return value as ActionRecord[];
  }

  private async persist(records: ActionRecord[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(records, null, 2)}\n`, "utf8");
    await rename(temporary, this.filePath);
  }

  async list(): Promise<ActionRecord[]> { return this.transaction((records) => [...records], false); }
  async get(actionId: string): Promise<ActionRecord | undefined> { return this.transaction((records) => records.find((record) => record.action_id === actionId), false); }

  async create(input: { alertSnapshotHash: string; actionType: ActionType; content: string }): Promise<ActionRecord> {
    assertActionType(input.actionType); assertContent(input.content);
    if (!input.alertSnapshotHash) throw new Error("alertSnapshotHash is required");
    return this.transaction(async (records) => {
      const now = new Date().toISOString();
      const record: ActionRecord = { action_id: randomUUID(), idempotency_key: key(input.alertSnapshotHash, input.actionType, input.content), alert_snapshot_hash: input.alertSnapshotHash, action_type: input.actionType, content: input.content, status: "pending", created_at: now, updated_at: now };
      records.push(record); return record;
    });
  }

  async edit(actionId: string, content: string): Promise<ActionRecord> {
    assertContent(content);
    return this.transaction(async (records) => {
      const record = records.find((item) => item.action_id === actionId); if (!record) throw new Error("Action not found");
      if (["completed", "failed", "unknown", "executing"].includes(record.status)) throw new Error("Action cannot be edited");
      record.content = content; record.status = "pending"; record.idempotency_key = key(record.alert_snapshot_hash, record.action_type, content); record.updated_at = new Date().toISOString(); return record;
    });
  }

  async approve(actionId: string): Promise<ActionRecord> {
    return this.transaction((records) => {
      const record = records.find((item) => item.action_id === actionId); if (!record) throw new Error("Action not found");
      assertTransition(record.status, "approved"); record.status = "approved"; record.updated_at = new Date().toISOString(); return record;
    });
  }

  async execute(actionId: string): Promise<ActionRecord> {
    return this.transaction(async (records) => {
      const record = records.find((item) => item.action_id === actionId); if (!record) throw new Error("Action not found");
      if (record.status === "completed") return record;
      if (record.status !== "approved") throw new Error(`Action must be approved before execution; current state is ${record.status}`);
      const existing = records.find((item) => item.idempotency_key === record.idempotency_key && item.status === "completed");
      if (existing) return existing;
      assertTransition(record.status, "executing"); record.status = "executing"; record.updated_at = new Date().toISOString();
      try {
        await this.options.simulate?.(record);
        assertTransition(record.status, "completed"); record.status = "completed";
      } catch (error) {
        record.status = error instanceof UncertainActionError ? "unknown" : "failed";
        record.failure_message = error instanceof Error ? error.message : "Local simulation failed";
      }
      record.updated_at = new Date().toISOString(); return record;
    });
  }
}
