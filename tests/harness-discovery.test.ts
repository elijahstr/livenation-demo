import { describe, expect, test } from "bun:test";

import { resolveHarnessArn } from "../src/harness-discovery";

const arn = "arn:aws:bedrock-agentcore:us-east-1:009073575420:harness/livenation_demo-ABCDEFGHIJ";

describe("resolveHarnessArn", () => {
  test("returns a valid explicit demo harness ARN without discovery", async () => {
    let called = false;
    await expect(resolveHarnessArn({ explicitArn: arn, command: async () => { called = true; return "[]"; } })).resolves.toBe(arn);
    expect(called).toBe(false);
  });

  test("discovers exactly one ready named demo harness with the fixed CLI scope", async () => {
    const calls: string[][] = [];
    const command = async (args: string[]) => {
      calls.push(args);
      return JSON.stringify([arn]);
    };
    await expect(resolveHarnessArn({ command })).resolves.toBe(arn);
    expect(calls).toEqual([[
      "aws", "bedrock-agentcore-control", "list-harnesses",
      "--profile", "livenation-demo", "--region", "us-east-1",
      "--query", "harnesses[?harnessName==`livenation_demo` && status==`READY`].arn",
      "--output", "json",
    ]]);
  });

  test("rejects ARNs outside the approved account, region, name, and identifier shape", async () => {
    for (const value of [
      "arn:aws:bedrock-agentcore:us-west-2:009073575420:harness/livenation_demo-ABCDEFGHIJ",
      "arn:aws:bedrock-agentcore:us-east-1:000000000000:harness/livenation_demo-ABCDEFGHIJ",
      "arn:aws:bedrock-agentcore:us-east-1:009073575420:harness/other-ABCDEFGHIJ",
      "arn:aws:bedrock-agentcore:us-east-1:009073575420:harness/livenation_demo-short",
    ]) await expect(resolveHarnessArn({ explicitArn: value })).rejects.toThrow("approved demo harness");
  });

  test("rejects invalid discovery output and ambiguous matches", async () => {
    await expect(resolveHarnessArn({ command: async () => "not JSON" })).rejects.toThrow("discover the approved demo harness");
    await expect(resolveHarnessArn({ command: async () => JSON.stringify([]) })).rejects.toThrow("discover the approved demo harness");
    await expect(resolveHarnessArn({ command: async () => JSON.stringify([arn, arn]) })).rejects.toThrow("discover the approved demo harness");
    await expect(resolveHarnessArn({ command: async () => JSON.stringify(["arn:aws:bedrock-agentcore:us-east-1:009073575420:harness/other-ABCDEFGHIJ"]) })).rejects.toThrow("approved demo harness");
  });
});
