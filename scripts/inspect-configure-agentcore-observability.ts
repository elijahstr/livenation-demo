import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { resolveHarnessArn } from "../src/harness-discovery";

export const ACCOUNT = "009073575420";
export const REGION = "us-east-1";
const PROFILE = "livenation-demo";
const POLICY_NAME = "livenation-demo-transaction-search";
const SHARED_GROUPS = ["aws/spans", "/aws/application-signals/data"];
type Group = { logGroupName: string; retentionInDays?: number };
export type Snapshot = {
  account: string;
  harnessArn: string;
  runtimeId: string;
  groups: Group[];
  policies: Array<{ policyName: string; policyDocument: string }>;
  destination: { Destination: string; Status?: string };
  indexing: { IndexingRules: Array<{ Name: string; Rule: { Probabilistic?: { DesiredSamplingPercentage?: number } } }> };
};
type Change = { args: string[]; reason: string; rollback: string[] | null };

export async function aws(args: string[]): Promise<any> {
  const child = Bun.spawn(["aws", ...args, "--profile", PROFILE, "--region", REGION, "--output", "json", "--no-cli-pager"], { stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => child.kill(), 30_000);
  try {
    const [exit, output] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    if (exit !== 0) throw new Error(`AWS ${args[0]} ${args[1]} failed. Check the demo login and caller permissions.`);
    return output.trim() ? JSON.parse(output) : {};
  } finally { clearTimeout(timer); }
}

export function buildTelemetryPlan(state: Snapshot): Change[] {
  if (state.account !== ACCOUNT || !/^harness_livenation_demo-[A-Za-z0-9]{10}$/.test(state.runtimeId)) throw new Error("Unexpected AWS account or demo runtime");
  if (!["XRay", "CloudWatchLogs"].includes(state.destination.Destination)) throw new Error("Unknown trace destination; inspect before changes");
  const owned = state.groups.filter(group => group.logGroupName.startsWith(`/aws/bedrock-agentcore/runtimes/${state.runtimeId}-`));
  const resources = [...SHARED_GROUPS, ...owned.map(group => group.logGroupName)].map(name => `arn:aws:logs:${REGION}:${ACCOUNT}:log-group:${name}:*`);
  const document = { Version: "2012-10-17", Statement: [{ Sid: "LivenationDemoTransactionSearch", Effect: "Allow", Principal: { Service: "xray.amazonaws.com" }, Action: "logs:PutLogEvents", Resource: resources, Condition: { ArnLike: { "aws:SourceArn": `arn:aws:xray:${REGION}:${ACCOUNT}:*` }, StringEquals: { "aws:SourceAccount": ACCOUNT } } }] };
  const previousPolicy = state.policies.find(policy => policy.policyName === POLICY_NAME);
  if (previousPolicy && JSON.stringify(JSON.parse(previousPolicy.policyDocument)) !== JSON.stringify(document)) throw new Error("The named telemetry policy differs. Review it before replacement.");
  const changes: Change[] = [];
  for (const name of SHARED_GROUPS) if (!state.groups.some(group => group.logGroupName === name)) {
    changes.push({ args: ["logs", "create-log-group", "--log-group-name", name], reason: "Create the missing Transaction Search group", rollback: null });
    changes.push({ args: ["logs", "put-retention-policy", "--log-group-name", name, "--retention-in-days", "1"], reason: "Set one-day retention on the newly created group", rollback: null });
  }
  if (!previousPolicy) changes.push({ args: ["logs", "put-resource-policy", "--policy-name", POLICY_NAME, "--policy-document", JSON.stringify(document)], reason: "Allow X-Ray delivery only to named groups in the demo account", rollback: ["logs", "delete-resource-policy", "--policy-name", POLICY_NAME] });
  if (state.destination.Destination !== "CloudWatchLogs") changes.push({ args: ["xray", "update-trace-segment-destination", "--destination", "CloudWatchLogs"], reason: "Enable account-wide Transaction Search ingestion", rollback: ["xray", "update-trace-segment-destination", "--destination", state.destination.Destination] });
  if (!state.indexing.IndexingRules.some(rule => rule.Name === "Default" && typeof rule.Rule.Probabilistic?.DesiredSamplingPercentage === "number")) {
    // A missing rule has no documented deletion API. Do not invent a rollback.
    throw new Error("Default indexing rule is absent. Inspect its supported restore path before configuration.");
  }
  return changes;
}

export const callerPermissions = {
  Version: "2012-10-17",
  Statement: [
    { Sid: "InspectAndConfigureTraceDestination", Effect: "Allow", Action: ["xray:GetTraceSegmentDestination", "xray:UpdateTraceSegmentDestination", "xray:GetIndexingRules", "xray:GetServiceGraph"], Resource: "*" },
    { Sid: "InspectAndConfigureLogDelivery", Effect: "Allow", Action: ["logs:DescribeResourcePolicies", "logs:PutResourcePolicy", "logs:DescribeLogGroups"], Resource: "*" },
    { Sid: "CreateMissingTraceGroups", Effect: "Allow", Action: ["logs:CreateLogGroup", "logs:PutRetentionPolicy"], Resource: SHARED_GROUPS.map(name => `arn:aws:logs:${REGION}:${ACCOUNT}:log-group:${name}:*`) },
    { Sid: "ReadDemoTraces", Effect: "Allow", Action: ["logs:FilterLogEvents", "logs:GetLogEvents", "logs:DescribeLogStreams", "logs:StartQuery"], Resource: [...SHARED_GROUPS, "/aws/bedrock-agentcore/runtimes/harness_livenation_demo-*"].map(name => `arn:aws:logs:${REGION}:${ACCOUNT}:log-group:${name}:*`) },
    { Sid: "ReadTraceQueryResults", Effect: "Allow", Action: ["logs:GetQueryResults", "logs:StopQuery"], Resource: "*" },
    { Sid: "CheckDemoCost", Effect: "Allow", Action: ["ce:GetCostAndUsage"], Resource: "*" },
  ],
};

// Logs resource policies have no IAM resource-level scope for this action.
// Keep this broader permission out of the normal apply policy.
export const rollbackPermissions = {
  Version: "2012-10-17",
  Statement: [{ Sid: "ExplicitTelemetryPolicyRollbackOnly", Effect: "Allow", Action: ["logs:DeleteResourcePolicy"], Resource: "*" }],
};

export async function waitForTraceDestination(
  read: () => Promise<{ Destination: string; Status?: string }> = () => aws(["xray", "get-trace-segment-destination"]),
  delay: () => Promise<unknown> = () => Bun.sleep(10_000),
  attempts = 60,
) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = await read();
    if (result.Destination === "CloudWatchLogs" && result.Status === "ACTIVE") return;
    if (attempt + 1 < attempts) await delay();
  }
  throw new Error("Transaction Search is not active yet. Inspect the destination before any live verification.");
}

export async function inspectTelemetry(): Promise<Snapshot & { harness: unknown; executionPolicy: unknown; serviceGraph: unknown }> {
  const identity = await aws(["sts", "get-caller-identity"]);
  if (identity.Account !== ACCOUNT) throw new Error("AWS identity is outside the demo account");
  const harnessArn = await resolveHarnessArn({ explicitArn: process.env.HARNESS_ARN });
  const id = harnessArn.split("/").at(-1)!;
  const harness = await aws(["bedrock-agentcore-control", "get-harness", "--harness-id", id, "--query", "harness.{arn:arn,status:status,roleArn:executionRoleArn,runtimeArn:environment.agentCoreRuntimeEnvironment.agentRuntimeArn,allowedTools:allowedTools,modelId:model.bedrockModelConfig.modelId,memory:keys(memory)}"]);
  const runtimeId = String(harness.runtimeArn ?? "").split("/").at(-1)!;
  if (!/^harness_livenation_demo-[A-Za-z0-9]{10}$/.test(runtimeId)) throw new Error("Cannot identify the demo runtime from the harness");
  if (harness.roleArn !== `arn:aws:iam::${ACCOUNT}:role/livenation-demo-harness`) throw new Error("Unexpected harness execution role");
  const now = Math.floor(Date.now() / 1000);
  const [runtimeGroups, sharedA, sharedB, policies, destination, indexing, executionPolicy, serviceGraph] = await Promise.all([
    aws(["logs", "describe-log-groups", "--log-group-name-prefix", `/aws/bedrock-agentcore/runtimes/${runtimeId}`]),
    ...SHARED_GROUPS.map(name => aws(["logs", "describe-log-groups", "--log-group-name-prefix", name])),
    aws(["logs", "describe-resource-policies"]),
    aws(["xray", "get-trace-segment-destination"]),
    aws(["xray", "get-indexing-rules"]),
    aws(["iam", "get-role-policy", "--role-name", "livenation-demo-harness", "--policy-name", "livenation-demo-harness-execution"]),
    aws(["xray", "get-service-graph", "--start-time", String(now - 6 * 3600), "--end-time", String(now), "--query", "Services[].{Name:Name,Type:Type,ReferenceId:ReferenceId}"]),
  ]);
  const groups = [...runtimeGroups.logGroups, ...sharedA.logGroups, ...sharedB.logGroups].filter(group => SHARED_GROUPS.includes(group.logGroupName) || group.logGroupName.startsWith(`/aws/bedrock-agentcore/runtimes/${runtimeId}-`)).map(group => ({ logGroupName: group.logGroupName, retentionInDays: group.retentionInDays }));
  return { account: identity.Account, harnessArn, runtimeId, groups, policies: policies.resourcePolicies, destination, indexing, harness, executionPolicy: executionPolicy.PolicyDocument, serviceGraph: { windowHours: 6, services: serviceGraph } };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !["--apply", "--permissions", "--rollback-permissions"].includes(arg))) throw new Error("Use no flags for inspection, --permissions or --rollback-permissions for a caller policy, or --apply for the reviewed changes");
  if (args.includes("--rollback-permissions")) { console.log(JSON.stringify(rollbackPermissions, null, 2)); return; }
  if (args.includes("--permissions")) { console.log(JSON.stringify(callerPermissions, null, 2)); return; }
  const before = await inspectTelemetry();
  const changes = buildTelemetryPlan(before);
  console.log(JSON.stringify({ mode: args.includes("--apply") ? "apply" : "inspect", before, changes, note: "Transaction Search affects the whole account. Existing group retention and indexing stay unchanged. New shared groups use one-day retention. Ingestion and storage incur CloudWatch charges." }, null, 2));
  if (!args.includes("--apply")) return;
  if (!changes.length) { await waitForTraceDestination(); console.log("Transaction Search is ACTIVE. Verify a matching span separately."); return; }
  const dir = resolve("outputs/agentcore-observability");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const record = resolve(dir, `${Date.now()}-rollback.json`);
  await writeFile(record, JSON.stringify({ before, changes, completed: [] }, null, 2), { mode: 0o600, flag: "wx" });
  const completed: Change[] = [];
  for (const change of changes) {
    await aws(change.args);
    completed.push(change);
    await writeFile(record, JSON.stringify({ before, changes, completed }, null, 2), { mode: 0o600 });
  }
  console.log(JSON.stringify({ applied: completed.length, rollbackRecord: record, note: "Reverse completed rollback commands in reverse order. New log groups are retained; inspect them before any deletion." }));
  await waitForTraceDestination();
  console.log("Transaction Search is ACTIVE. Verify a matching span separately.");
}
if (import.meta.main) await main();
