import runtime from "../config/demo-runtime.json";
import { ActionStore } from "./action-store";
import type { ActionType } from "./action-state";
import { DatabricksSalesAdapter } from "./databricks-sales-adapter";
import { DemoService } from "./demo-service";
import { AgentCoreHarnessClient, createWestEvidenceResolver } from "./agentcore-harness-client";
import { runHarnessToolCycle } from "./harness-tool-cycle";
import { createServer } from "./server";

function terraformOutput(name: string): string {
  const result = Bun.spawnSync({ cmd: ["terraform", "-chdir=infra", "output", "-raw", name], stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`Cannot read Terraform output ${name}`);
  return result.stdout.toString().trim();
}

const config = {
  port: Number(process.env.PORT ?? runtime.port),
  warehouseId: process.env.DATABRICKS_WAREHOUSE_ID ?? runtime.warehouseId,
  profile: process.env.DATABRICKS_PROFILE ?? runtime.databricksProfile,
  awsProfile: process.env.AWS_PROFILE ?? runtime.awsProfile,
  awsRegion: process.env.AWS_REGION ?? runtime.awsRegion,
  harnessArn: process.env.HARNESS_ARN ?? terraformOutput("harness_arn"),
};
if (!config.warehouseId || !config.harnessArn) throw new Error("DATABRICKS_WAREHOUSE_ID and HARNESS_ARN are required");
const sales = new DatabricksSalesAdapter({ profile: config.profile, warehouseId: config.warehouseId });
const harness = new AgentCoreHarnessClient(config.awsRegion, config.awsProfile);
const service = new DemoService({ sales, harness: { diagnose: async ({ prompt, evidence }) => {
  const invoke = await harness.createKimiEvidenceInvoker(evidence.event_id);
  return runHarnessToolCycle({ harnessArn: config.harnessArn!, sessionId: crypto.randomUUID(), prompt, invoke, resolveEvidence: createWestEvidenceResolver(evidence) });
} } });
const actions = new ActionStore(`${import.meta.dir}/../outputs/demo-actions.json`);
const server = createServer({
  port: config.port,
  salesCheck: () => service.salesCheck(),
  state: async () => ({ check: service.lastCheck, actions: await actions.list() }),
  getAction: async (id) => { const value = await actions.get(id); if (!value) throw new Error("Action not found"); return value; },
  createAction: async (body) => { const input = body as { alertSnapshotHash?: string; actionType?: ActionType; content?: string }; if (!service.lastCheck || input.alertSnapshotHash !== service.lastCheck.alert.snapshotHash || !input.actionType) throw new Error("Action snapshot is not current"); return actions.create({ alertSnapshotHash: input.alertSnapshotHash, actionType: input.actionType, content: input.content ?? "" }); },
  editAction: (id, body) => actions.edit(id, (body as { content?: string }).content ?? ""),
  approveAction: (id) => actions.approve(id), executeAction: (id) => actions.execute(id),
});
console.log(`Live Nation West demo serves at http://127.0.0.1:${server.port}`);
