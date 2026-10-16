import { describe, expect, test } from "bun:test";

import { ACCOUNT, REGION, buildTelemetryPlan, callerPermissions, waitForLogGroup, type Snapshot } from "../scripts/inspect-configure-agentcore-observability";

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
    const first = snapshot({
      groups: [
        { logGroupName: "aws/spans", retentionInDays: 1 },
        { logGroupName: "/aws/application-signals/data", retentionInDays: 1 },
        { logGroupName: runtimeGroup, retentionInDays: 14 },
        { logGroupName: "/aws/bedrock-agentcore/runtimes/other-runtime-logs", retentionInDays: 14 },
      ],
    });
    const policy = policyDocument(first);
    const stable = {
      ...first,
      policies: [{ policyName: "livenation-demo-transaction-search", policyDocument: policy }],
      destination: { Destination: "CloudWatchLogs" },
    };
    expect(buildTelemetryPlan(stable)).toEqual([]);
    expect(stable.groups.map((group) => group.retentionInDays)).toEqual([1, 1, 14, 14]);
    expect(stable.indexing.IndexingRules[0].Rule.Probabilistic?.DesiredSamplingPercentage).toBe(15);
  });

  test("accepts the same policy when AWS returns object keys in a different order", () => {
    const document = JSON.parse(policyDocument(snapshot()));
    const reordered = {
      Statement: document.Statement.map((statement: any) => ({
        Condition: {
          StringEquals: statement.Condition.StringEquals,
          ArnLike: statement.Condition.ArnLike,
        },
        Resource: statement.Resource,
        Action: statement.Action,
        Principal: statement.Principal,
        Effect: statement.Effect,
        Sid: statement.Sid,
      })),
      Version: document.Version,
    };
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(document));
    const stable = snapshot({
      policies: [{ policyName: "livenation-demo-transaction-search", policyDocument: JSON.stringify(reordered) }],
      destination: { Destination: "CloudWatchLogs" },
    });
    expect(buildTelemetryPlan(stable)).toEqual([]);
  });

  test("rejects a reordered policy when an account, resource, or action differs", () => {
    const document = JSON.parse(policyDocument(snapshot()));
    const reordered = {
      Statement: document.Statement.map((statement: any) => ({
        Condition: { StringEquals: statement.Condition.StringEquals, ArnLike: statement.Condition.ArnLike },
        Resource: statement.Resource,
        Action: statement.Action,
        Principal: statement.Principal,
        Effect: statement.Effect,
        Sid: statement.Sid,
      })),
      Version: document.Version,
    };
    for (const changed of [
      { ...reordered, Statement: [{ ...reordered.Statement[0], Condition: { ...reordered.Statement[0].Condition, StringEquals: { "aws:SourceAccount": "000000000000" } } }] },
      { ...reordered, Statement: [{ ...reordered.Statement[0], Resource: [...reordered.Statement[0].Resource, "arn:aws:logs:us-east-1:009073575420:log-group:other:*"] }] },
      { ...reordered, Statement: [{ ...reordered.Statement[0], Action: "logs:CreateLogGroup" }] },
    ]) {
      const stable = snapshot({
        policies: [{ policyName: "livenation-demo-transaction-search", policyDocument: JSON.stringify(changed) }],
        destination: { Destination: "CloudWatchLogs" },
      });
      expect(() => buildTelemetryPlan(stable)).toThrow("differs");
    }
  });

  test("lets the service create absent aws/spans and defers its retention until after the policy and destination", () => {
    const state = snapshot({ groups: [{ logGroupName: runtimeGroup, retentionInDays: 14 }] });
    const changes = buildTelemetryPlan(state);
    expect(changes.filter((change) => change.args.includes("create-log-group")).map((change) => change.args)).toEqual([
      ["logs", "create-log-group", "--log-group-name", "/aws/application-signals/data"],
    ]);
    expect(changes.map((change) => change.args.slice(0, 2))).toEqual([
      ["logs", "create-log-group"],
      ["logs", "put-retention-policy"],
      ["logs", "put-resource-policy"],
      ["xray", "update-trace-segment-destination"],
      ["logs", "put-retention-policy"],
    ]);
    expect(changes.find((change) => change.args[1] === "put-retention-policy" && change.args.includes("/aws/application-signals/data"))?.args).toEqual([
      "logs", "put-retention-policy", "--log-group-name", "/aws/application-signals/data", "--retention-in-days", "30",
    ]);
    const deferredRetention = changes.at(-1);
    expect(deferredRetention?.args).toEqual(["logs", "put-retention-policy", "--log-group-name", "aws/spans", "--retention-in-days", "30"]);
    expect(deferredRetention?.waitForLogGroup).toBe("aws/spans");
  });

  test("waits for the service-created span group before deferred retention", async () => {
    const reads = [[{ logGroupName: "aws/spans-other" }], [{ logGroupName: "aws/spans" }]];
    const delay = async () => undefined;
    await expect(waitForLogGroup("aws/spans", async () => ({ logGroups: reads.shift()! }), delay)).resolves.toEqual({ logGroupName: "aws/spans" });
  });

  test("waits for a missing span group even when the destination is already CloudWatch Logs", () => {
    const state = snapshot({
      groups: snapshot().groups.filter(group => group.logGroupName !== "aws/spans"),
      destination: { Destination: "CloudWatchLogs", Status: "ACTIVE" },
      policies: [{ policyName: "livenation-demo-transaction-search", policyDocument: policyDocument(snapshot()) }],
    });
    const changes = buildTelemetryPlan(state);
    expect(changes).toHaveLength(1);
    expect(changes[0].waitForLogGroup).toBe("aws/spans");
    expect(changes[0].args[1]).toBe("put-retention-policy");
  });

  test("stops after the bounded span-group wait and explains the next action", async () => {
    let delays = 0;
    await expect(waitForLogGroup("aws/spans", async () => ({ logGroups: [] }), async () => { delays++; }, 3)).rejects.toThrow("aws/spans did not appear");
    expect(delays).toBe(2);
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
