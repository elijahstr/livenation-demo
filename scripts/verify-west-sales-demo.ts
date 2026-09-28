import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import runtime from "../config/demo-runtime.json";
import { ActionStore } from "../src/action-store";
import { AgentCoreHarnessClient, createWestEvidenceResolver } from "../src/agentcore-harness-client";
import { DatabricksSalesAdapter } from "../src/databricks-sales-adapter";
import { DemoService } from "../src/demo-service";
import { runHarnessToolCycle } from "../src/harness-tool-cycle";

function terraformOutput(name: string): string {
  const result = Bun.spawnSync({ cmd: ["terraform", "-chdir=infra", "output", "-raw", name], stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`Cannot read Terraform output ${name}`);
  return result.stdout.toString().trim();
}

const directory = await mkdtemp(join(tmpdir(), "livenation-west-live-verify-"));
try {
  const sales = new DatabricksSalesAdapter({ profile: process.env.DATABRICKS_PROFILE ?? runtime.databricksProfile, warehouseId: process.env.DATABRICKS_WAREHOUSE_ID ?? runtime.warehouseId });
  const harnessArn = process.env.HARNESS_ARN ?? terraformOutput("harness_arn");
  const client = new AgentCoreHarnessClient(process.env.AWS_REGION ?? runtime.awsRegion, process.env.AWS_PROFILE ?? runtime.awsProfile);
  const service = new DemoService({ sales, harness: { diagnose: async ({ prompt, evidence }) => runHarnessToolCycle({ harnessArn, sessionId: crypto.randomUUID(), prompt, invoke: await client.createKimiEvidenceInvoker(evidence.event_id), resolveEvidence: createWestEvidenceResolver(evidence) }) } });
  const result = await service.salesCheck();
  if (result.status !== "alert" || result.evidence.length !== 6 || result.alert.evidence.venue_name !== "Hayden Homes Amphitheater") throw new Error("Live West evidence did not select Hayden Homes");
  if (result.toolCallCount !== 1) throw new Error("Kimi did not return one structured tool call");
  const store = new ActionStore(join(directory, "actions.json"));
  const action = await store.create({ alertSnapshotHash: result.alert.snapshotHash, actionType: "social", content: "Synthetic live verification draft." });
  await store.approve(action.action_id);
  const first = await store.execute(action.action_id); const second = await store.execute(action.action_id);
  if (first.status !== "completed" || first.action_id !== second.action_id) throw new Error("Local simulated action verification failed");
  console.log("Live West sales verification passed.");
} finally { await rm(directory, { recursive: true, force: true }); }
