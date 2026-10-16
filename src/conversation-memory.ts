import settings from "../config/conversation-memory.json";
import { assertApprovedHarnessArn, runAws } from "./harness-discovery";

const prefix = "arn:aws:bedrock-agentcore:us-east-1:009073575420:memory/";
const memoryArnPattern = new RegExp(`^${prefix}${settings.name}-[A-Za-z0-9]{10}$`);
const cliOptions = ["--profile", "livenation-demo", "--region", "us-east-1", "--output", "json", "--no-cli-pager"];

/** Read metadata only. The fixed demo actor is not an end-user authentication boundary. */
export async function verifyConversationMemory(
  harnessArn: string,
  command: (args: string[]) => Promise<string> = runAws,
) {
  assertApprovedHarnessArn(harnessArn);
  try {
    const harness = JSON.parse(await command([
      "aws", "bedrock-agentcore-control", "get-harness", "--harness-id", harnessArn.split("/").at(-1)!,
      "--query", "harness.{status:status,memory:memory}", ...cliOptions,
    ]));
    const attached = harness.memory?.agentCoreMemoryConfiguration;
    if (harness.status !== "READY" || !attached || Object.keys(harness.memory).length !== 1 ||
      !memoryArnPattern.test(attached.arn) || attached.actorId !== settings.actorId ||
      attached.messagesCount !== settings.messagesCount || Object.keys(attached.retrievalConfig ?? {}).length) {
      throw new Error("Unexpected memory attachment");
    }
    const memory = JSON.parse(await command([
      "aws", "bedrock-agentcore-control", "get-memory", "--memory-id", attached.arn.slice(prefix.length),
      "--query", "memory.{arn:arn,name:name,status:status,eventExpiryDuration:eventExpiryDuration,strategies:strategies}", ...cliOptions,
    ]));
    const strategies = memory.strategies ?? [];
    if (memory.arn !== attached.arn || memory.name !== settings.name || memory.status !== "ACTIVE" ||
      memory.eventExpiryDuration !== settings.eventExpiryDuration || !Array.isArray(strategies) || strategies.length) {
      throw new Error("Unexpected memory resource");
    }
    return { memoryArn: memory.arn as string, memoryId: attached.arn.slice(prefix.length) as string, actorId: settings.actorId };
  } catch {
    throw new Error("Conversation memory is unavailable or does not match the approved demo configuration");
  }
}
