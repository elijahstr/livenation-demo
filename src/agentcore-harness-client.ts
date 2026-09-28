import { realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { HarnessEvent, HarnessInvokeInput, HarnessInvoker } from "./harness-tool-cycle";
import type { WestSalesEvidence } from "./west-sales";

const expectedSdkVersion = "3.1140.0";

export function createWestEvidenceTool(eventId: string) {
  return {
    type: "inline_function",
    name: "get_sales_evidence",
    config: { inlineFunction: {
      description: "Read the selected synthetic West aggregate only.",
      inputSchema: {
        type: "object", additionalProperties: false, required: ["event_id", "region"],
        properties: { event_id: { type: "string", enum: [eventId] }, region: { type: "string", enum: ["west"] } },
      },
    } },
  };
}

export function createWestEvidenceResolver(selected: WestSalesEvidence) {
  return (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Evidence tool input must be an object");
    const candidate = input as Record<string, unknown>;
    if (Object.keys(candidate).length !== 2 || candidate.event_id !== selected.event_id || candidate.region !== "west") {
      throw new Error("Evidence tool input must select the selected West event");
    }
    return { event_id: selected.event_id, region: selected.region, venue_name: selected.venue_name, show_date: selected.show_date, tickets_sold_cumulative: selected.tickets_sold_cumulative, tickets_target_cumulative: selected.tickets_target_cumulative, data_as_of: selected.data_as_of, origin: selected.origin };
  };
}

async function loadAgentCoreSdk() {
  const executable = Bun.which("agentcore");
  if (!executable) throw new Error("AgentCore CLI is required on PATH");
  const entry = await realpath(executable);
  const packageRoot = resolve(dirname(entry), "../../../..", "@aws-sdk/client-bedrock-agentcore");
  const packageJson = JSON.parse(await Bun.file(resolve(packageRoot, "package.json")).text()) as { version?: string };
  if (packageJson.version !== expectedSdkVersion) throw new Error(`AgentCore SDK ${expectedSdkVersion} is required; found ${packageJson.version ?? "unknown"}`);
  return import(pathToFileURL(resolve(packageRoot, "dist-cjs/index.js")).href);
}

export class AgentCoreHarnessClient {
  constructor(private readonly region = process.env.AWS_REGION ?? "us-east-1", private readonly profile = process.env.AWS_PROFILE ?? "livenation-demo") {}

  async createInvoker(overrides: Record<string, unknown> = {}): Promise<HarnessInvoker> {
    process.env.AWS_PROFILE = this.profile;
    process.env.AWS_REGION = this.region;
    process.env.AWS_MAX_ATTEMPTS ||= "1";
    const sdk = await loadAgentCoreSdk();
    const client = new sdk.BedrockAgentCoreClient({ region: this.region, maxAttempts: 1 });
    return async (input: HarnessInvokeInput) => {
      const response = await client.send(new sdk.InvokeHarnessCommand({ ...input, ...overrides }));
      if (!response.stream) throw new Error("Harness response did not include a stream");
      return { stream: response.stream as AsyncIterable<HarnessEvent> };
    };
  }

  async createKimiEvidenceInvoker(selectedEventId: string): Promise<HarnessInvoker> {
    // Kimi requires this override for inline tools. It also exposes built-in shell and
    // file_operations tools and adds about 900 input tokens for each trusted request.
    return this.createInvoker({ tools: [createWestEvidenceTool(selectedEventId)], allowedTools: ["*"] });
  }
}
