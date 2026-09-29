import { describe, expect, test } from "bun:test";
import { BedrockAgentCoreClient } from "@aws-sdk/client-bedrock-agentcore";
import { AgentCoreHarnessClient, createWestEvidenceTool, createWestEvidenceResolver } from "../src/agentcore-harness-client";
import type { WestSalesEvidence } from "../src/west-sales";

const evidence: WestSalesEvidence = {
  event_id: "hayden-homes-001", region: "west", venue_name: "Hayden Homes Amphitheater", city: "Bend", state: "OR", public_capacity: 8000,
  event_name: "Cascades After Dark", show_date: "2026-10-15", tickets_sold_cumulative: 550, tickets_target_cumulative: 1000,
  data_as_of: "2026-09-28T11:00:00.000Z", market_signals: ["Synthetic signal"], origin: "synthetic",
};

describe("West Harness tool contract", () => {
  test("creates an invoker without a global AgentCore CLI", async () => {
    const invoke = await new AgentCoreHarnessClient().createInvoker();
    expect(typeof invoke).toBe("function");
  });

  test("passes an abort signal to the AWS Harness request", async () => {
    const controller = new AbortController();
    const options: Array<{ abortSignal?: AbortSignal } | undefined> = [];
    const originalSend = BedrockAgentCoreClient.prototype.send;
    BedrockAgentCoreClient.prototype.send = (async (_command, requestOptions) => {
      options.push(requestOptions as { abortSignal?: AbortSignal } | undefined);
      return { stream: (async function* () {})() };
    }) as typeof BedrockAgentCoreClient.prototype.send;

    try {
      const invoke = await new AgentCoreHarnessClient().createInvoker();
      await invoke({
        harnessArn: "arn:aws:bedrock-agentcore:us-east-1:009073575420:harness/livenation_demo-ABCDEFGHIJ",
        runtimeSessionId: "12345678-1234-1234-1234-123456789012",
        messages: [{ role: "user", content: [{ text: "Use the evidence tool." }] }],
      }, controller.signal);
    } finally {
      BedrockAgentCoreClient.prototype.send = originalSend;
    }

    expect(options).toEqual([{ abortSignal: controller.signal }]);
  });

  test("creates a schema for exactly the selected West event", () => {
    const tool = createWestEvidenceTool(evidence.event_id);
    expect(tool.config.inlineFunction.inputSchema.properties.event_id.enum).toEqual(["hayden-homes-001"]);
    expect(tool.config.inlineFunction.inputSchema.properties.region.enum).toEqual(["west"]);
  });

  test("resolves only the selected aggregate", () => {
    const resolve = createWestEvidenceResolver(evidence);
    const result = resolve({ event_id: "hayden-homes-001", region: "west" });
    expect(result).toEqual(expect.not.objectContaining({ market_signals: expect.anything(), event_name: expect.anything(), city: expect.anything(), state: expect.anything() }));
    expect(result).toMatchObject({ event_id: "hayden-homes-001", venue_name: "Hayden Homes Amphitheater", tickets_sold_cumulative: 550, tickets_target_cumulative: 1000 });
    expect(() => resolve({ event_id: "other", region: "west" })).toThrow("selected");
  });
});
