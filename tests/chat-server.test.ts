import { afterEach, describe, expect, test } from "bun:test";

import { createServer } from "../src/server";

const servers: Array<{ stop(): void; port: number }> = [];
afterEach(() => { servers.splice(0).forEach((server) => server.stop()); });

function createChat(overrides: Record<string, unknown> = {}) {
  return {
    createSession: () => ({ sessionId: "session-1", cloudWatchUrl: "https://console.aws.amazon.com/cloudwatch" }),
    validateTurn: (input: { sessionId: string; message: string }) => input,
    run: async (_input: unknown, options: { signal?: AbortSignal; onEvent?: (event: Record<string, unknown>) => void | Promise<void>; onInvocationStart?: () => void }) => {
      await options.onEvent?.({ type: "session", sessionId: "session-1", runtimeSessionId: "runtime-1", cloudWatchUrl: "https://console.aws.amazon.com/cloudwatch" });
      options.onInvocationStart?.();
      await options.onEvent?.({ type: "token", text: "Synthetic evidence is below target." });
      await options.onEvent?.({ type: "tool", name: "get_sales_evidence" });
      return { sessionId: "session-1", runtimeSessionId: "runtime-1", text: "Draft a local follow-up.", usage: { inputTokens: 1, outputTokens: 2 }, toolCallCount: 1, sourceTimes: ["2026-09-28T00:00:00.000Z"], cloudWatchUrl: "https://console.aws.amazon.com/cloudwatch" };
    },
    ...overrides,
  };
}

function start(chat = createChat()) {
  const server = createServer({ port: 0, salesCheck: async () => ({ status: "healthy" }), state: async () => ({ actions: [] }), chat });
  servers.push(server);
  const base = `http://127.0.0.1:${server.port}`;
  const headers = { Origin: base, "content-type": "application/json" };
  return { server, base, headers };
}

describe("chat HTTP API", () => {
  test("creates a server session and streams service events before the result", async () => {
    const { base, headers } = start();
    const session = await fetch(`${base}/api/chat/sessions`, { method: "POST", headers });
    expect(session.status).toBe(201);
    expect(await session.json()).toEqual({ sessionId: "session-1", cloudWatchUrl: "https://console.aws.amazon.com/cloudwatch" });

    const response = await fetch(`${base}/api/chat/stream`, { method: "POST", headers, body: JSON.stringify({ sessionId: "session-1", message: "What needs attention?" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(events.map((event) => event.type)).toEqual(["session", "token", "tool", "result"]);
    expect(events.at(-1)?.result).toMatchObject({ sessionId: "session-1", runtimeSessionId: "runtime-1", toolCallCount: 1 });
  });

  test("requires exact same-origin JSON chat writes but preserves recovery loopback origins", async () => {
    const { base, headers, server } = start();
    const otherLoopback = `http://localhost:${server.port + 1}`;
    expect((await fetch(`${base}/api/chat/sessions`, { method: "POST", headers: { "content-type": "application/json" } })).status).toBe(400);
    expect((await fetch(`${base}/api/chat/sessions`, { method: "POST", headers: { Origin: otherLoopback, "content-type": "application/json" } })).status).toBe(400);
    expect((await fetch(`${base}/api/chat/sessions`, { method: "POST", headers })).status).toBe(201);
    expect((await fetch(`${base}/api/sales-check`, { method: "POST", headers: { Origin: otherLoopback } })).status).toBe(200);
  });

  test("rejects malformed, oversized, and unknown-session chat input", async () => {
    const unknown = createChat({ validateTurn: () => { throw Object.assign(new Error("Unknown session"), { status: 404 }); } });
    const { base, headers } = start(unknown);
    expect((await fetch(`${base}/api/chat/stream`, { method: "POST", headers, body: "not JSON" })).status).toBe(400);
    expect((await fetch(`${base}/api/chat/stream`, { method: "POST", headers, body: JSON.stringify({ sessionId: "session-1", message: "hello", model: "other" }) })).status).toBe(400);
    expect((await fetch(`${base}/api/chat/stream`, { method: "POST", headers, body: JSON.stringify({ sessionId: "session-1", message: "x".repeat(16 * 1024) }) })).status).toBe(413);
    expect((await fetch(`${base}/api/chat/stream`, { method: "POST", headers, body: JSON.stringify({ sessionId: "missing", message: "hello" }) })).status).toBe(404);
  });

  test("uses one invocation gate for chat and recovery", async () => {
    let releaseChat = () => undefined;
    const chatWait = new Promise<void>((resolve) => { releaseChat = resolve; });
    const chat = createChat({ run: async (_input: unknown, options: { onEvent?: (event: Record<string, unknown>) => void | Promise<void>; onInvocationStart?: () => void }) => {
      await options.onEvent?.({ type: "session", sessionId: "session-1", runtimeSessionId: "runtime-1", cloudWatchUrl: "https://console.aws.amazon.com/cloudwatch" });
      options.onInvocationStart?.();
      await options.onEvent?.({ type: "token", text: "Starting." });
      await chatWait;
      return { sessionId: "session-1", runtimeSessionId: "runtime-1", text: "Done.", usage: {}, toolCallCount: 0, sourceTimes: [], cloudWatchUrl: "https://console.aws.amazon.com/cloudwatch" };
    } });
    const { base, headers } = start(chat);
    const first = await fetch(`${base}/api/chat/stream`, { method: "POST", headers, body: JSON.stringify({ sessionId: "session-1", message: "hello" }) });
    expect(first.status).toBe(200);
    expect((await fetch(`${base}/api/sales-check`, { method: "POST" })).status).toBe(409);
    releaseChat();
    await first.text();

    let releaseSales = () => undefined;
    const salesWait = new Promise<void>((resolve) => { releaseSales = resolve; });
    let enteredSales = () => undefined;
    const salesEntered = new Promise<void>((resolve) => { enteredSales = resolve; });
    const server = createServer({ port: 0, salesCheck: async () => { enteredSales(); await salesWait; return { status: "healthy" }; }, state: async () => ({ actions: [] }), chat });
    servers.push(server);
    const secondBase = `http://127.0.0.1:${server.port}`;
    const sales = fetch(`${secondBase}/api/sales-check`, { method: "POST" });
    await salesEntered;
    expect((await fetch(`${secondBase}/api/chat/stream`, { method: "POST", headers: { Origin: secondBase, "content-type": "application/json" }, body: JSON.stringify({ sessionId: "session-1", message: "hello" }) })).status).toBe(409);
    releaseSales();
    expect((await sales).status).toBe(200);
  });

  test("propagates a browser abort and releases a chat with no upstream invocation", async () => {
    let aborted = false;
    const chat = createChat({ run: async (_input: unknown, options: { signal?: AbortSignal; onEvent?: (event: Record<string, unknown>) => void | Promise<void> }) => {
      await options.onEvent?.({ type: "session", sessionId: "session-1", runtimeSessionId: "runtime-1", cloudWatchUrl: "https://console.aws.amazon.com/cloudwatch" });
      await new Promise<void>((resolve) => options.signal?.addEventListener("abort", () => { aborted = true; resolve(); }, { once: true }));
      options.signal?.throwIfAborted();
      throw new Error("unreachable");
    } });
    const { base, headers } = start(chat);
    const controller = new AbortController();
    const response = await fetch(`${base}/api/chat/stream`, { method: "POST", headers, body: JSON.stringify({ sessionId: "session-1", message: "hello" }), signal: controller.signal });
    const reader = response.body!.getReader();
    expect((await reader.read()).done).toBe(false);
    controller.abort();
    await reader.cancel().catch(() => undefined);
    for (let attempt = 0; attempt < 20 && !aborted; attempt += 1) await Bun.sleep(5);
    expect(aborted).toBe(true);
    expect((await fetch(`${base}/api/sales-check`, { method: "POST" })).status).toBe(200);
  });

  test("keeps the shared gate until the invocation cooldown expires after an abort", async () => {
    let clock = 0;
    let aborted = false;
    const chat = createChat({ run: async (_input: unknown, options: { signal?: AbortSignal; onEvent?: (event: Record<string, unknown>) => void | Promise<void>; onInvocationStart?: () => void }) => {
      await options.onEvent?.({ type: "session", sessionId: "session-1", runtimeSessionId: "runtime-1", cloudWatchUrl: "https://console.aws.amazon.com/cloudwatch" });
      options.onInvocationStart?.();
      await new Promise<void>((resolve) => options.signal?.addEventListener("abort", () => { aborted = true; resolve(); }, { once: true }));
      options.signal?.throwIfAborted();
      throw new Error("unreachable");
    } });
    const server = createServer({ port: 0, now: () => clock, salesCheck: async () => ({ status: "healthy" }), state: async () => ({ actions: [] }), chat });
    servers.push(server);
    const base = `http://127.0.0.1:${server.port}`;
    const controller = new AbortController();
    const response = await fetch(`${base}/api/chat/stream`, { method: "POST", headers: { Origin: base, "content-type": "application/json" }, body: JSON.stringify({ sessionId: "session-1", message: "hello" }), signal: controller.signal });
    const reader = response.body!.getReader();
    expect((await reader.read()).done).toBe(false);
    controller.abort();
    await reader.cancel().catch(() => undefined);
    for (let attempt = 0; attempt < 20 && !aborted; attempt += 1) await Bun.sleep(5);
    expect(aborted).toBe(true);
    expect((await fetch(`${base}/api/sales-check`, { method: "POST" })).status).toBe(409);
    clock = 45_001;
    expect((await fetch(`${base}/api/sales-check`, { method: "POST" })).status).toBe(200);
  });

  test("returns method errors for known chat paths", async () => {
    const { base } = start();
    expect((await fetch(`${base}/api/chat/sessions`)).status).toBe(405);
    expect((await fetch(`${base}/api/chat/stream`)).status).toBe(405);
  });
});
