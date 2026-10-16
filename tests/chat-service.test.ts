import { describe, expect, test } from "bun:test";

import { ChatError, ChatService, safeChatErrorMessage } from "../src/chat-service";
import type { HarnessEvent } from "../src/harness-tool-cycle";
import type { WestSalesEvidence } from "../src/west-sales";

const clock = { value: 0 };
const evidence: WestSalesEvidence[] = [];
const handoffEvidence: WestSalesEvidence[] = [
  ["hayden-homes-001", "Hayden Homes Amphitheater"], ["wiltern-001", "The Wiltern"], ["palladium-001", "Hollywood Palladium"],
  ["masonic-001", "The Masonic"], ["white-river-001", "White River Amphitheatre"], ["gorge-001", "The Gorge Amphitheatre"],
].map(([event_id, venue_name]) => ({ event_id, venue_name, region: "west" as const, city: "City", state: "CA", public_capacity: 1000, event_name: "Synthetic show", show_date: "2026-10-20", tickets_sold_cumulative: 500, tickets_target_cumulative: 600, data_as_of: "2026-10-01T00:00:00.000Z", market_signals: ["Synthetic awareness is healthy."], origin: "synthetic" as const }));
const harnessArn = "arn:aws:bedrock-agentcore:us-east-1:009073575420:harness/livenation_demo-ABCDEFGHIJ";

async function* stream(items: HarnessEvent[]) { yield* items; }

function createService(overrides: Partial<ConstructorParameters<typeof ChatService>[0]> = {}) {
  let id = 0;
  return new ChatService({
    harnessArn, enabled: true, now: () => clock.value, newId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    readEvidence: async () => evidence,
    invoke: async () => ({ stream: stream([{ contentBlockDelta: { contentBlockIndex: 0, delta: { text: "Hello." } } }, { messageStop: { stopReason: "end_turn" } }]) }),
    ...overrides,
  });
}

describe("ChatService", () => {
  test("creates a session with the production UUID factory", () => {
    const service = new ChatService({
      harnessArn,
      enabled: true,
      readEvidence: async () => evidence,
      invoke: async () => ({ stream: stream([]) }),
    });
    expect(service.createSession().sessionId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  test("uses safe client messages without SDK or adapter text", () => {
    expect(safeChatErrorMessage(new Error("stderr: password=secret"))).toBe("Chat failed. Start a new chat.");
    expect(safeChatErrorMessage(new Error("Evidence is stale"))).toContain("stale");
    expect(safeChatErrorMessage(new Error("ExpiredTokenException"))).toContain("authentication");
  });

  test("creates stable app sessions and unique runtime IDs per turn", async () => {
    const service = createService();
    const session = service.createSession();
    const first = await service.run({ sessionId: session.sessionId, message: "Hello" }, {});
    const second = await service.run({ sessionId: session.sessionId, message: "Hello again" }, {});
    expect(first.sessionId).toBe(session.sessionId);
    expect(first.runtimeSessionId).not.toBe(second.runtimeSessionId);
  });

  test("agentcore memory reuses one runtime session per conversation and separates conversations", async () => {
    const requests: Array<{ runtimeSessionId: string; actorId?: string; prompt: string }> = [];
    const service = createService({ memoryMode: "agentcore", invoke: async (request) => {
      requests.push({ runtimeSessionId: request.runtimeSessionId, actorId: request.actorId, prompt: request.messages[0]!.content[0]!.text });
      return { stream: stream([{ messageStop: { stopReason: "end_turn" } }]) };
    } });
    const first = service.createSession();
    const second = service.createSession();
    await service.run({ sessionId: first.sessionId, message: "First turn" }, {});
    await service.run({ sessionId: first.sessionId, message: "Second turn" }, {});
    await service.run({ sessionId: second.sessionId, message: "Other chat" }, {});
    expect(requests.map((request) => request.runtimeSessionId)).toEqual([requests[0]!.runtimeSessionId, requests[0]!.runtimeSessionId, requests[2]!.runtimeSessionId]);
    expect(requests[0]!.runtimeSessionId).not.toBe(requests[2]!.runtimeSessionId);
    expect(requests.map((request) => request.actorId)).toEqual(["demo-user", "demo-user", "demo-user"]);
  });

  test("agentcore memory sends only the current raw user message", async () => {
    const prompts: string[] = [];
    const service = createService({ memoryMode: "agentcore", invoke: async (request) => {
      prompts.push(request.messages[0]!.content[0]!.text);
      return { stream: stream([{ contentBlockDelta: { contentBlockIndex: 0, delta: { text: "Answer." } } }, { messageStop: { stopReason: "end_turn" } }]) };
    } });
    const session = service.createSession();
    await service.run({ sessionId: session.sessionId, message: "First message" }, {});
    await service.run({ sessionId: session.sessionId, message: "Second message" }, {});
    expect(prompts).toEqual(["First message", "Second message"]);
  });

  test("agentcore memory rejects a twenty-first turn before another invocation", async () => {
    let invocations = 0;
    const service = createService({ memoryMode: "agentcore", invoke: async () => {
      invocations += 1;
      return { stream: stream([{ messageStop: { stopReason: "end_turn" } }]) };
    } });
    const session = service.createSession();
    for (let turn = 0; turn < 20; turn += 1) await service.run({ sessionId: session.sessionId, message: `Turn ${turn}` });
    await expect(service.run({ sessionId: session.sessionId, message: "Turn 21" })).rejects.toThrow("turn limit");
    expect(invocations).toBe(20);
  });

  test("agentcore preflight rejects before it invokes and invalidates only its conversation", async () => {
    let invocations = 0;
    const service = createService({
      memoryMode: "agentcore",
      beforeTurn: async () => { throw new Error("memory detached"); },
      invoke: async () => { invocations++; return { stream: stream([]) }; },
    });
    const affected = service.createSession();
    const unaffected = service.createSession();
    await expect(service.run({ sessionId: affected.sessionId, message: "hello" }, {})).rejects.toThrow("memory detached");
    expect(invocations).toBe(0);
    expect(() => service.validateTurn({ sessionId: affected.sessionId, message: "again" })).toThrow("new chat");
    expect(service.validateTurn({ sessionId: unaffected.sessionId, message: "hello" }).sessionId).toBe(unaffected.sessionId);
  });

  test("a rejected tool-result handoff invalidates only its conversation", async () => {
    let calls = 0;
    const service = createService({ readEvidence: async () => handoffEvidence, invoke: async () => {
      calls += 1;
      if (calls === 1) return { stream: stream([
        { contentBlockStart: { contentBlockIndex: 0, start: { toolUse: { toolUseId: "tool-1", name: "get_sales_evidence" } } } },
        { contentBlockDelta: { contentBlockIndex: 0, delta: { toolUse: { input: "{}" } } } },
        { messageStop: { stopReason: "tool_use" } },
      ]) };
      throw new Error("tool result no longer has a pending handoff");
    } });
    const affected = service.createSession();
    const unaffected = service.createSession();
    await expect(service.run({ sessionId: affected.sessionId, message: "show sales" }, {})).rejects.toThrow("pending handoff");
    expect(() => service.validateTurn({ sessionId: affected.sessionId, message: "again" })).toThrow("new chat");
    expect(service.validateTurn({ sessionId: unaffected.sessionId, message: "hello" }).sessionId).toBe(unaffected.sessionId);
  });

  test("rejects unknown input keys before it invokes", () => {
    const service = createService();
    expect(() => service.validateTurn({ sessionId: "missing", message: "hello", model: "no" })).toThrow(ChatError);
    expect(() => service.validateTurn({ sessionId: "missing", message: "hello", model: "no" })).toThrow("unknown");
  });

  test("expires an idle app session", () => {
    const service = createService();
    const session = service.createSession();
    clock.value = 30 * 60 * 1000 + 1;
    expect(() => service.validateTurn({ sessionId: session.sessionId, message: "hello" })).toThrow("expired");
  });

  test("invalidates a session after an aborted turn", async () => {
    const service = createService({ invoke: async (_input, signal) => {
      await new Promise<void>((resolve, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
      return { stream: stream([]) };
    } });
    const session = service.createSession();
    const controller = new AbortController();
    const turn = service.run({ sessionId: session.sessionId, message: "hello" }, { signal: controller.signal });
    controller.abort();
    await expect(turn).rejects.toThrow();
    expect(() => service.validateTurn({ sessionId: session.sessionId, message: "again" })).toThrow("new chat");
  });

  test("does not invoke when the request signal was already aborted", async () => {
    let invoked = false;
    const service = createService({ invoke: async () => { invoked = true; return { stream: stream([]) }; } });
    const session = service.createSession();
    const controller = new AbortController();
    controller.abort();
    await expect(service.run({ sessionId: session.sessionId, message: "hello" }, { signal: controller.signal })).rejects.toThrow();
    expect(invoked).toBe(false);
    expect(() => service.validateTurn({ sessionId: session.sessionId, message: "again" })).toThrow("new chat");
  });

  test("does not save a completed response after delivery aborts", async () => {
    const controller = new AbortController();
    const service = createService({ invoke: async () => ({ stream: stream([
      { contentBlockDelta: { contentBlockIndex: 0, delta: { text: "Done." } } },
      { messageStop: { stopReason: "end_turn" } },
    ]) }) });
    const session = service.createSession();
    await expect(service.run({ sessionId: session.sessionId, message: "hello" }, {
      signal: controller.signal,
      onEvent: (event) => { if (event.type === "token") controller.abort(); },
    })).rejects.toThrow();
    expect(() => service.validateTurn({ sessionId: session.sessionId, message: "again" })).toThrow("new chat");
  });

  test("invalidates a session after invalid evidence", async () => {
    const service = createService({ invoke: async () => ({ stream: stream([
      { contentBlockStart: { contentBlockIndex: 0, start: { toolUse: { toolUseId: "tool-1", name: "get_sales_evidence" } } } },
      { contentBlockDelta: { contentBlockIndex: 0, delta: { toolUse: { input: "{}" } } } },
      { messageStop: { stopReason: "tool_use" } },
    ]) }) });
    const session = service.createSession();
    await expect(service.run({ sessionId: session.sessionId, message: "show sales" }, {})).rejects.toThrow("Expected exactly 6");
    expect(() => service.validateTurn({ sessionId: session.sessionId, message: "again" })).toThrow("new chat");
  });

  test("drops oldest complete pairs to retain the character-bounded transcript", async () => {
    const prompts: string[] = [];
    const service = createService({ invoke: async (request) => {
      prompts.push(request.messages[0]!.content[0]!.text);
      return { stream: stream([{ contentBlockDelta: { contentBlockIndex: 0, delta: { text: "a".repeat(5000) } } }, { messageStop: { stopReason: "end_turn" } }]) };
    } });
    const session = service.createSession();
    for (let turn = 0; turn < 7; turn += 1) await service.run({ sessionId: session.sessionId, message: `turn-${turn}` }, {});
    expect(prompts[6]).not.toContain("turn-0");
    expect(prompts[6]).toContain("turn-6");
    expect(prompts[6].length).toBeLessThan(24_900);
  });
});

test("evicts the least-recently-used inactive session at twenty sessions", async () => {
  clock.value = 0;
  const service = createService();
  const sessions: string[] = [];
  for (let i = 0; i < 20; i++) { clock.value++; sessions.push(service.createSession().sessionId); }
  clock.value++;
  await service.run({ sessionId: sessions[0], message: "Keep this one" });
  service.createSession();
  expect(() => service.validateTurn({ sessionId: sessions[1], message: "Evicted" })).toThrow("unknown or expired");
  expect(service.validateTurn({ sessionId: sessions[0], message: "Retained" }).sessionId).toBe(sessions[0]);
});
test("rejects a twenty-first turn before another invocation", async () => {
  let invocations = 0;
  const service = createService({ invoke: async () => { invocations++; return { stream: stream([{ messageStop: { stopReason: "end_turn" } }]) }; } });
  const sessionId = service.createSession().sessionId;
  for (let i = 0; i < 20; i++) await service.run({ sessionId, message: `Turn ${i}` });
  await expect(service.run({ sessionId, message: "Turn 21" })).rejects.toThrow("turn limit");
  expect(invocations).toBe(20);
});
