import { expect, test } from "bun:test";
import { ChatService } from "../src/chat-service";
import { AgentCoreHarnessClient } from "../src/agentcore-harness-client";
import { BedrockAgentCoreClient } from "@aws-sdk/client-bedrock-agentcore";
import type { HarnessEvent } from "../src/harness-tool-cycle";

test("premium chat creates a resolver per turn and retains evidence timestamps", async () => {
  let factories = 0, calls = 0;
  const now = Date.now();
  const service = new ChatService({
    harnessArn: "demo", enabled: true, now: () => now, readEvidence: async () => { throw new Error("West must not run"); },
    premiumTools: ({ signal, deadlineAt }) => {
      factories++;
      expect(signal.aborted).toBe(false);
      expect(deadlineAt).toBe(now + 135000);
      return { get_account_brief: async () => ({ origin: "synthetic", data_as_of: "2026-10-16T12:00:00Z" }) };
    },
    invoke: async () => {
      const events: HarnessEvent[] = ++calls % 2 ? [
        { contentBlockStart: { contentBlockIndex: 0, start: { toolUse: { name: "get_account_brief", toolUseId: "brief" } } } },
        { messageStop: { stopReason: "tool_use" } },
      ] : [{ messageStop: { stopReason: "end_turn" } }];
      return { stream: (async function* () { yield* events; })() };
    },
  });
  const session = service.createSession();
  for (let i = 0; i < 2; i++) {
    const result = await service.run({ sessionId: session.sessionId, message: "Read the account brief" });
    expect(result.sourceTimes).toEqual(["2026-10-16T12:00:00Z"]);
    expect(result.toolNames).toEqual(["get_account_brief"]);
  }
  expect(factories).toBe(2);
});

test("premium invoker uses the same exact three tools on every handoff", async () => {
  const original = BedrockAgentCoreClient.prototype.send;
  const inputs: any[] = [];
  BedrockAgentCoreClient.prototype.send = (async (command: any) => {
    inputs.push(command.input); return { stream: (async function* () {})() };
  }) as typeof original;
  try {
    const invoke = await new AgentCoreHarnessClient().createPremiumChatInvoker();
    await invoke({ harnessArn: "demo", runtimeSessionId: crypto.randomUUID(), messages: [], actorId: "demo-user" });
    await invoke({ harnessArn: "demo", runtimeSessionId: crypto.randomUUID(), messages: [], actorId: "demo-user" });
    for (const request of inputs) {
      expect(request.allowedTools).toEqual(["get_account_brief", "@*/get_account_brief", "find_options", "@*/find_options", "ask_analytics", "@*/ask_analytics"]);
      expect(request.tools.map((tool: any) => tool.name)).toEqual(["get_account_brief", "find_options", "ask_analytics"]);
      expect(request.actorId).toBe("demo-user");
      expect(request.systemPrompt[0].text).toContain("A100");
      expect(request.allowedTools).not.toContain("*");
    }
  } finally { BedrockAgentCoreClient.prototype.send = original; }
});
