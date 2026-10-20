import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RegionalRuntime } from "../src/regional-runtime";
import type { HarnessEvent, HarnessInvoker } from "../src/harness-tool-cycle";

const directories: string[] = [];

async function directory() {
  const value = await mkdtemp(join(tmpdir(), "regional-runtime-"));
  directories.push(value);
  return value;
}

async function* stream(events: HarnessEvent[]) { yield* events; }

async function consume(events: AsyncIterable<HarnessEvent>) {
  for await (const _event of events) { /* Consume the wrapped stream. */ }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe("RegionalRuntime", () => {
  test("blocks paid work when Cost Explorer is unavailable", async () => {
    const runtime = new RegionalRuntime({ directory: await directory(), readCost: async () => { throw new Error("unavailable"); } });

    await expect(runtime.admit()).rejects.toThrow("Cost Explorer");
  });

  test("treats a Cost Explorer credit as zero accrued spend", async () => {
    const runtime = new RegionalRuntime({ directory: await directory(), readCost: async () => -0.000000005 });

    await expect(runtime.admit()).resolves.toMatchObject({ observed_cost_usd: 0 });
  });

  test("keeps a remote quarantine after release and restart", async () => {
    const path = await directory();
    let now = 10_000;
    const runtime = new RegionalRuntime({ directory: path, now: () => now, readCost: async () => 0 });
    const release = await runtime.acquire("scan");
    await runtime.remoteUntil(5_000);
    await release();

    const restarted = new RegionalRuntime({ directory: path, now: () => now, readCost: async () => 0 });
    await expect(restarted.acquire("chat")).rejects.toMatchObject({ status: 409 });
    now += 5_001;
    await expect(restarted.acquire("chat")).resolves.toEqual(expect.any(Function));
  });

  test("keeps an ambiguous submission blocked after its remote timeout expires", async () => {
    const path = await directory();
    let now = 10_000;
    const runtime = new RegionalRuntime({ directory: path, now: () => now, readCost: async () => 0 });
    const release = await runtime.acquire("scan");
    await runtime.remoteUntil(1);
    await runtime.blockUnknown("statement submission outcome is unknown");
    await release();

    now += 2;
    await expect(new RegionalRuntime({ directory: path, now: () => now, readCost: async () => 0 }).acquire("chat")).rejects.toMatchObject({ status: 409 });
  });

  test("rejects a concurrent cloud operation", async () => {
    const runtime = new RegionalRuntime({ directory: await directory(), readCost: async () => 0 });
    const release = await runtime.acquire("scan");

    await expect(runtime.acquire("chat")).rejects.toMatchObject({ status: 409 });
    await release();
  });

  test("a completed response keeps unknown cost reserved without blocking the next conversation", async () => {
    const runtime = new RegionalRuntime({ directory: await directory(), readCost: async () => 0 });
    const release = await runtime.acquire("chat");
    const wrapped = await runtime.wrapInvoker(async () => ({
      stream: stream([{ messageStop: { stopReason: "end_turn" } }]),
    }), { deadlineAt: Date.now() + 10_000 });
    await consume((await wrapped({ harnessArn: "h", runtimeSessionId: "r", messages: [] })).stream);
    const cost = await runtime.checkAdmission();
    expect(cost.local_cost_usd).toBeCloseTo(cost.reserved_cost_usd + 0.02, 10);
    await release();
    const nextRelease = await runtime.acquire("chat");
    await nextRelease();
  });

  test("records a known remote failure and retains its reservation", async () => {
    const path = await directory();
    const runtime = new RegionalRuntime({ directory: path, readCost: async () => 0 });
    const release = await runtime.acquire("chat");
    const invoke: HarnessInvoker = async () => ({ stream: stream([{ metadata: { usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } } }, { internalServerException: { message: "remote failure" } }]) });
    let record: { status?: string } | undefined;
    const wrapped = await runtime.wrapInvoker(invoke, { deadlineAt: Date.now() + 10_000, onInvocation: value => { record = value; } });

    await expect(wrapped({ harnessArn: "h", runtimeSessionId: "r", messages: [] }).then(response => consume(response.stream))).rejects.toThrow("remote failure");
    const admission = await runtime.admit();

    expect(record?.status).toBe("failed");
    expect(admission.local_cost_usd).toBeCloseTo(admission.reserved_cost_usd + 0.02, 10);
    await release();
    await expect(new RegionalRuntime({ directory: path, readCost: async () => 0 }).acquire("chat")).rejects.toMatchObject({ status: 409 });
  });

  test("rejects a request whose supplied system content reaches the byte cap", async () => {
    const runtime = new RegionalRuntime({ directory: await directory(), readCost: async () => 0 });
    const release = await runtime.acquire("chat");
    let called = false;
    const invoke: HarnessInvoker = async () => { called = true; return { stream: stream([]) }; };
    const wrapped = await runtime.wrapInvoker(invoke, { systemBytes: 64 * 1024, deadlineAt: Date.now() + 10_000 });

    await expect(wrapped({ harnessArn: "h", runtimeSessionId: "r", messages: [] })).rejects.toThrow("64 KiB");
    expect(called).toBe(false);
    await release();
  });

  test("a slow cost check cannot submit a model call after its deadline", async () => {
    let now = 10_000;
    const runtime = new RegionalRuntime({ directory: await directory(), now: () => now, readCost: async () => { now = 30_000; return 0; } });
    const release = await runtime.acquire("chat");
    let called = false;
    const wrapped = await runtime.wrapInvoker(async () => { called = true; return { stream: stream([]) }; }, { deadlineAt: 20_000 });
    await expect(wrapped({ harnessArn: "h", runtimeSessionId: "r", messages: [] })).rejects.toThrow("deadline");
    expect(called).toBe(false);
    await release();
  });

  test("a statement completion cannot clear an unresolved model invocation", async () => {
    const runtime = new RegionalRuntime({ directory: await directory(), readCost: async () => 0 });
    const release = await runtime.acquire("scan");
    await runtime.remoteUntil(40_000, "model");
    await runtime.remoteUntil(45_000, "statement");
    await runtime.clearRemote("statement");
    let called = false;
    const wrapped = await runtime.wrapInvoker(async () => { called = true; return { stream: stream([]) }; }, { deadlineAt: Date.now() + 10_000 });
    await expect(wrapped({ harnessArn: "h", runtimeSessionId: "r", messages: [] })).rejects.toThrow("quarantined");
    expect(called).toBe(false);
    await release();
  });

  test("counts streamed assistant output before the next session request", async () => {
    const runtime = new RegionalRuntime({ directory: await directory(), readCost: async () => 0 });
    const release = await runtime.acquire("chat");
    const largeText = "x".repeat(60 * 1024);
    const invoke: HarnessInvoker = async () => ({ stream: stream([
      { contentBlockDelta: { contentBlockIndex: 0, delta: { text: largeText } } },
      { messageStop: { stopReason: "end_turn" } },
      { metadata: { usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, cacheReadInputTokens: 0, cacheWriteInputTokens: 0 } as any } },
    ]) });
    const wrapped = await runtime.wrapInvoker(invoke, { deadlineAt: Date.now() + 10_000 });
    const input = { harnessArn: "h", runtimeSessionId: "r", messages: [] as [] };

    for (let index = 0; index < 3; index += 1) await consume((await wrapped(input)).stream);
    await expect(wrapped(input).then(response => consume(response.stream))).rejects.toThrow("Cumulative session context");
    await release();
  });
});
