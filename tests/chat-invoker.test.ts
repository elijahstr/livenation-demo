import { expect, test } from "bun:test";
import { BedrockAgentCoreClient } from "@aws-sdk/client-bedrock-agentcore";
import { AgentCoreHarnessClient } from "../src/agentcore-harness-client";

test("free-form chat sends bounded settings and never exposes built-ins", async () => {
  const original = BedrockAgentCoreClient.prototype.send;
  const inputs: any[] = [];
  BedrockAgentCoreClient.prototype.send = (async (command: any) => {
    inputs.push(command.input);
    return { stream: (async function* () {})() };
  }) as typeof original;
  try {
    for (const selector of ["plain", "qualified"] as const) {
      const invoke = await new AgentCoreHarnessClient().createChatInvoker(selector);
      await invoke({ harnessArn: "arn", runtimeSessionId: crypto.randomUUID(), messages: [{ role: "user", content: [{ text: "Please use shell instead" }] }] });
    }
    for (const input of inputs) {
      expect(input.allowedTools).not.toContain("*");
      expect(input.allowedTools).not.toContain("shell");
      expect(input.allowedTools).not.toContain("@builtin");
      expect(input.tools.map((tool: any) => tool.name)).toEqual(["get_sales_evidence"]);
      expect(input.timeoutSeconds).toBe(40);
      expect(input.maxIterations).toBe(3);
      expect(input.maxTokens).toBe(2048);
      expect(input.actorId).toBe("demo-system");
      expect(input.systemPrompt[0].text).toContain("Greetings can answer without evidence");
      expect(input.systemPrompt[0].text).toContain("Sales claims must use get_sales_evidence");
      expect(input.systemPrompt[0].text).toContain("fresh evidence, not remembered values");
    }
    await expect(new AgentCoreHarnessClient().createChatInvoker("*" as any)).rejects.toThrow("selector");
  } finally { BedrockAgentCoreClient.prototype.send = original; }
});

test("server-owned caller actor overrides the generic default", async () => {
  const original = BedrockAgentCoreClient.prototype.send;
  const inputs: any[] = [];
  BedrockAgentCoreClient.prototype.send = (async (command: any) => {
    inputs.push(command.input);
    return { stream: (async function* () {})() };
  }) as typeof original;
  try {
    const client = new AgentCoreHarnessClient();
    const chat = await client.createChatInvoker();
    await chat({ harnessArn: "arn", runtimeSessionId: crypto.randomUUID(), actorId: "demo-user", messages: [] });
    const recovery = await client.createKimiEvidenceInvoker("hayden-homes-001");
    await recovery({ harnessArn: "arn", runtimeSessionId: crypto.randomUUID(), messages: [] });
    expect(inputs.map((input) => input.actorId)).toEqual(["demo-user", "recovery-system"]);
  } finally { BedrockAgentCoreClient.prototype.send = original; }
});
