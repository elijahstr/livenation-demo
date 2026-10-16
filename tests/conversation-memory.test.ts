import { expect, test } from "bun:test";
import { verifyConversationMemory } from "../src/conversation-memory";

const harnessArn = "arn:aws:bedrock-agentcore:us-east-1:009073575420:harness/livenation_demo-ABCDEFGHIJ";
const memoryArn = "arn:aws:bedrock-agentcore:us-east-1:009073575420:memory/livenation_demo_conversation_memory-ABCDEFGHIJ";
const attached = { status: "READY", memory: { agentCoreMemoryConfiguration: { arn: memoryArn, actorId: "demo-user", messagesCount: 12 } } };
const memory = { arn: memoryArn, name: "livenation_demo_conversation_memory", status: "ACTIVE", eventExpiryDuration: 7, strategies: [] };

test("preflight verifies both the harness attachment and the short-term resource using metadata only", async () => {
  const calls: string[][] = [];
  const result = await verifyConversationMemory(harnessArn, async args => {
    calls.push(args);
    return JSON.stringify(calls.length === 1 ? attached : memory);
  });
  expect(result.memoryArn).toBe(memoryArn);
  expect(result.actorId).toBe("demo-user");
  expect(calls.map(args => args[2])).toEqual(["get-harness", "get-memory"]);
  expect(calls.every(args => args.includes("livenation-demo") && args.includes("us-east-1") && args.includes("--query"))).toBe(true);
});

test("preflight rejects disabled, cross-account, wrong-actor, and long-term memory attachments", async () => {
  for (const bad of [
    { status: "READY", memory: { disabled: {} } },
    { ...attached, status: "UPDATING" },
    { ...attached, memory: { agentCoreMemoryConfiguration: { ...attached.memory.agentCoreMemoryConfiguration, actorId: "someone-else" } } },
    { ...attached, memory: { agentCoreMemoryConfiguration: { ...attached.memory.agentCoreMemoryConfiguration, arn: memoryArn.replace("009073575420", "111111111111") } } },
    { ...attached, memory: { agentCoreMemoryConfiguration: { ...attached.memory.agentCoreMemoryConfiguration, retrievalConfig: { summary: {} } } } },
  ]) {
    let calls = 0;
    await expect(verifyConversationMemory(harnessArn, async () => { calls++; return JSON.stringify(bad); })).rejects.toThrow("unavailable");
    expect(calls).toBe(1);
  }
});

test("preflight rejects non-active, incorrect-retention, unexpected-resource, or long-term stores", async () => {
  for (const bad of [
    { ...memory, status: "CREATING" },
    { ...memory, eventExpiryDuration: 30 },
    { ...memory, arn: memoryArn.replace("ABCDEFGHIJ", "1234567890") },
    { ...memory, strategies: [{ strategyId: "summary" }] },
    { ...memory, strategies: {} },
  ]) {
    let calls = 0;
    await expect(verifyConversationMemory(harnessArn, async () => JSON.stringify(++calls === 1 ? attached : bad))).rejects.toThrow("unavailable");
  }
});

test("preflight accepts an omitted optional strategies field", async () => {
  let calls = 0;
  const result = await verifyConversationMemory(harnessArn, async () => JSON.stringify(++calls === 1 ? attached : { ...memory, strategies: null }));
  expect(result.memoryArn).toBe(memoryArn);
});

test("preflight hides CLI errors and rejects an unapproved harness before any command", async () => {
  await expect(verifyConversationMemory(harnessArn, async () => { throw new Error("secret-value"); })).rejects.toThrow("approved demo configuration");
  let called = false;
  await expect(verifyConversationMemory("unapproved", async () => { called = true; return "{}"; })).rejects.toThrow("approved demo harness");
  expect(called).toBe(false);
});
