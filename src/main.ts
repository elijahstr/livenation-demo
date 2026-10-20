import runtime from "../config/demo-runtime.json";
import { ActionStore } from "./action-store";
import type { ActionType } from "./action-state";
import { DatabricksSalesAdapter } from "./databricks-sales-adapter";
import { DemoService } from "./demo-service";
import { AgentCoreHarnessClient, createWestEvidenceResolver } from "./agentcore-harness-client";
import { runHarnessToolCycle } from "./harness-tool-cycle";
import { createServer } from "./server";
import { ChatService } from "./chat-service";
import { resolveHarnessArn } from "./harness-discovery";
import { verifyConversationMemory } from "./conversation-memory";
import { createPremiumTools } from "./premium-tools";
import { GenieMcpClient } from "./genie-mcp-client";
import { createRegionalApp } from "./regional-app";

const config = {
  port: Number(process.env.PORT ?? runtime.port),
  warehouseId: process.env.DATABRICKS_WAREHOUSE_ID ?? runtime.warehouseId,
  profile: process.env.DATABRICKS_PROFILE ?? runtime.databricksProfile,
  awsProfile: process.env.AWS_PROFILE ?? runtime.awsProfile,
  awsRegion: process.env.AWS_REGION ?? runtime.awsRegion,
  harnessArn: await resolveHarnessArn({ explicitArn: process.env.HARNESS_ARN, profile: process.env.AWS_PROFILE ?? runtime.awsProfile, region: process.env.AWS_REGION ?? runtime.awsRegion }),
};
if (!config.warehouseId || !config.harnessArn) throw new Error("DATABRICKS_WAREHOUSE_ID and HARNESS_ARN are required");
const sales = new DatabricksSalesAdapter({ profile: config.profile, warehouseId: config.warehouseId });
const harness = new AgentCoreHarnessClient(config.awsRegion, config.awsProfile);
const premium = await createRegionalApp({ ...config, harnessArn: config.harnessArn });
const service = new DemoService({ sales, harness: { diagnose: async ({ prompt, evidence, signal, onEvent, onInvocationStart }) => {
  const base = await harness.createKimiEvidenceInvoker(evidence.event_id);
  const invoke = await premium.runtime.wrapInvoker(async (input, abortSignal) => {
    await premium.runtime.remoteUntil(65_000);
    return base(input, abortSignal);
  }, { deadlineAt: Date.now() + 180_000, systemBytes: 8192 });
  return runHarnessToolCycle({ harnessArn: config.harnessArn!, sessionId: crypto.randomUUID(), prompt, invoke: async (input, abortSignal) => { onInvocationStart?.(); return invoke(input, abortSignal); }, resolveEvidence: createWestEvidenceResolver(evidence), signal, onEvent });
} } });
const selector = process.env.AGENTCORE_CHAT_TOOL_SELECTOR ?? "plain";
if (selector !== "plain" && selector !== "qualified") throw new Error("Invalid chat tool selector");
const chatDataSource = process.env.AGENTCORE_CHAT_DATA_SOURCE ?? "west";
if (chatDataSource !== "west" && chatDataSource !== "premium") throw new Error("Invalid chat data source");
let chatEnabled = process.env.AGENTCORE_CHAT_ENABLED === "1";
const checkMemory = () => verifyConversationMemory(config.harnessArn).then(() => undefined);
if (chatEnabled) {
  try { await checkMemory(); }
  catch {
    chatEnabled = false;
    console.warn("Live chat is disabled because conversation memory could not be verified.");
  }
}
const chat = new ChatService({
  harnessArn: config.harnessArn, region: config.awsRegion,
  enabled: chatEnabled,
  memoryMode: "agentcore",
  beforeTurn: checkMemory,
  invoke: async (input, signal) => {
    const base = await (chatDataSource === "premium" ? harness.createPremiumChatInvoker() : harness.createChatInvoker(selector));
    const invoke = await premium.runtime.wrapInvoker(base, { deadlineAt: Date.now() + 180_000, systemBytes: 8192 });
    return invoke(input, signal);
  },
  readEvidence: (now, signal) => sales.read(now, signal),
  ...(chatDataSource === "premium" ? { premiumTools: (context: { signal: AbortSignal; deadlineAt: number }) => {
    const options = { profile: config.profile, warehouseId: config.warehouseId, ...context };
    const genie = new GenieMcpClient(options);
    return createPremiumTools({ ...options, askAnalytics: question => genie.ask(question) });
  } } : {}),
});
const actions = new ActionStore(`${import.meta.dir}/../outputs/demo-actions.json`);
const server = createServer({
  port: config.port,
  chat,
  premium,
  salesCheck: (options) => service.salesCheck(new Date(), options),
  state: async () => ({ check: service.lastCheck, actions: await actions.list() }),
  getAction: async (id) => { const value = await actions.get(id); if (!value) throw new Error("Action not found"); return value; },
  createAction: async (body) => { const input = body as { alertSnapshotHash?: string; actionType?: ActionType; content?: string }; if (!service.lastCheck || input.alertSnapshotHash !== service.lastCheck.alert.snapshotHash || !input.actionType) throw new Error("Action snapshot is not current"); return actions.create({ alertSnapshotHash: input.alertSnapshotHash, actionType: input.actionType, content: input.content ?? "" }); },
  editAction: (id, body) => actions.edit(id, (body as { content?: string }).content ?? ""),
  approveAction: (id) => actions.approve(id), executeAction: (id) => actions.execute(id),
});
console.log(`Live Nation West demo serves at http://127.0.0.1:${server.port}`);
console.log(`Premium regional scan serves at http://127.0.0.1:${server.port}/premium`);
