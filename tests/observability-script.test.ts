import { describe, expect, test } from "bun:test";

import { ACCOUNT, REGION, buildTelemetryPlan, callerPermissions, type Snapshot } from "../scripts/inspect-configure-agentcore-observability";

const harnessArn = "arn:aws:bedrock-agentcore:us-east-1:009073575420:harness/livenation_demo-1on72c4veC";
const runtimeId = "harness_livenation_demo-0XgsrOEUQn";
const runtimeGroup = `/aws/bedrock-agentcore/runtimes/${runtimeId}-logs`;

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    account: ACCOUNT,
    harnessArn,
    runtimeId,
    groups: [
      { logGroupName: "aws/spans", retentionInDays: 30 },
      { logGroupName: "/aws/application-signals/data", retentionInDays: 30 },
      { logGroupName: runtimeGroup, retentionInDays: 14 },
      { logGroupName: "/aws/bedrock-agentcore/runtimes/other-runtime-logs", retentionInDays: 14 },
    ],
    policies: [],
    destination: { Destination: "XRay" },
    indexing: { IndexingRules: [{ Name: "Default", Rule: { Probabilistic: { DesiredSamplingPercentage: 15 } } }] },
    ...overrides,
  };
}

function policyDocument(state: Snapshot): string {
  const change = buildTelemetryPlan(state).find((candidate) => candidate.args.includes("put-resource-policy"));
  if (!change) throw new Error("Expected a telemetry policy change");
  return change.args[change.args.indexOf("--policy-document") + 1];
}

describe("AgentCore observability configuration plan", () => {
  test("rejects a wrong account or a non-demo runtime", () => {
    expect(() => buildTelemetryPlan(snapshot({ account: "000000000000" }))).toThrow("Unexpected AWS account or demo runtime");
    expect(() => buildTelemetryPlan(snapshot({ runtimeId: "harness_other_demo-0XgsrOEUQn" }))).toThrow("Unexpected AWS account or demo runtime");
  });

  test("scopes the X-Ray resource policy to the discovered demo runtime and shared groups", () => {
    const document = JSON.parse(policyDocument(snapshot()));
    const statement = document.Statement[0];
    expect(statement.Resource).toEqual([
      `arn:aws:logs:${REGION}:${ACCOUNT}:log-group:aws/spans:*`,
      `arn:aws:logs:${REGION}:${ACCOUNT}:log-group:/aws/application-signals/data:*`,
      `arn:aws:logs:${REGION}:${ACCOUNT}:log-group:${runtimeGroup}:*`,
    ]);
    expect(statement.Resource.join("\n")).not.toContain("other-runtime");
    expect(statement.Condition.StringEquals["aws:SourceAccount"]).toBe(ACCOUNT);
    expect(statement.Condition.ArnLike["aws:SourceArn"]).toBe(`arn:aws:xray:${REGION}:${ACCOUNT}:*`);
  });

  test("preserves existing indexing and retention, and is idempotent after the desired state exists", () => {
    const first = snapshot();
    const policy = policyDocument(first);
    const stable = snapshot({
      policies: [{ policyName: "livenation-demo-transaction-search", policyDocument: policy }],
      destination: { Destination: "CloudWatchLogs" },
    });
    expect(buildTelemetryPlan(stable)).toEqual([]);
    expect(stable.groups.map((group) => group.retentionInDays)).toEqual([30, 30, 14, 14]);
    expect(stable.indexing.IndexingRules[0].Rule.Probabilistic?.DesiredSamplingPercentage).toBe(15);
  });

  test("creates absent shared groups with one-day retention only for new groups", () => {
    const state = snapshot({ groups: [{ logGroupName: runtimeGroup, retentionInDays: 14 }] });
    const changes = buildTelemetryPlan(state);
    expect(changes.filter((change) => change.args.includes("create-log-group")).map((change) => change.args)).toEqual([
      ["logs", "create-log-group", "--log-group-name", "aws/spans"],
      ["logs", "create-log-group", "--log-group-name", "/aws/application-signals/data"],
    ]);
    expect(changes.filter((change) => change.args.includes("put-retention-policy")).map((change) => change.args)).toEqual([
      ["logs", "put-retention-policy", "--log-group-name", "aws/spans", "--retention-in-days", "1"],
      ["logs", "put-retention-policy", "--log-group-name", "/aws/application-signals/data", "--retention-in-days", "1"],
    ]);
  });

  test("refuses a different task-named policy and preserves the prior X-Ray destination for rollback", () => {
    expect(() => buildTelemetryPlan(snapshot({ policies: [{ policyName: "livenation-demo-transaction-search", policyDocument: JSON.stringify({ Version: "2012-10-17", Statement: [] }) }] }))).toThrow("differs");
    const destination = buildTelemetryPlan(snapshot()).find((change) => change.args.includes("update-trace-segment-destination"));
    expect(destination?.rollback).toEqual(["xray", "update-trace-segment-destination", "--destination", "XRay"]);
  });

  test("does not plan destructive group or data commands", () => {
    const commands = buildTelemetryPlan(snapshot({ groups: [] })).flatMap((change) => change.args).join(" ");
    const permissions = JSON.stringify(callerPermissions);
    expect(commands).not.toMatch(/delete|truncate|purge/i);
    expect(permissions).not.toMatch(/DeleteLogGroup|DeleteResourcePolicy|logs:Delete/i);
  });
});
