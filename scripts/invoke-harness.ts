import {
  runHarnessToolCycle,
} from "../src/harness-tool-cycle";
import { AgentCoreHarnessClient } from "../src/agentcore-harness-client";
import {
  assertSyntheticSalesFixture,
  getSalesEvidence,
  type SalesFixture,
} from "../src/local-setup";

const region = "us-east-1";

function terraformOutput(name: string): string {
  const result = Bun.spawnSync({
    cmd: ["terraform", "-chdir=infra", "output", "-raw", name],
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `Cannot read Terraform output ${name}: ${result.stderr.toString().trim()}`,
    );
  }
  return result.stdout.toString().trim();
}

async function main() {
  process.env.AWS_PROFILE ||= "livenation-demo";
  process.env.AWS_REGION ||= region;
  process.env.AWS_MAX_ATTEMPTS ||= "1";

  const harnessArn = process.env.HARNESS_ARN ?? terraformOutput("harness_arn");
  const fixture = JSON.parse(
    await Bun.file(new URL("../fixtures/synthetic-sales.json", import.meta.url)).text(),
  ) as SalesFixture;
  assertSyntheticSalesFixture(fixture);
  const harnessConfig = JSON.parse(
    await Bun.file(new URL("../config/create-harness.json", import.meta.url)).text(),
  ) as { tools: unknown[] };

  const client = new AgentCoreHarnessClient(region);
  const invoke = await client.createInvoker();

  const simple = await runHarnessToolCycle({
    harnessArn,
    sessionId: crypto.randomUUID(),
    prompt: "Reply with exactly HARNESS_OK and nothing else.",
    resolveEvidence: (input) => getSalesEvidence(input, "east", fixture),
    invoke,
  });
  if (simple.text.trim() !== "HARNESS_OK") {
    throw new Error(`Unexpected simple harness response: ${simple.text.trim()}`);
  }

  const tool = await runHarnessToolCycle({
    harnessArn,
    sessionId: crypto.randomUUID(),
    prompt: "Call get_sales_evidence for east_show in east. Then state the observed synthetic aggregate evidence and data_as_of timestamp.",
    resolveEvidence: (input) => getSalesEvidence(input, "east", fixture),
    invoke: await client.createInvoker({
      tools: harnessConfig.tools,
      // Kimi does not expose an inline function through its plain-name allow-list.
      // This trusted demo override also enables built-in tools for this invocation.
      allowedTools: ["*"],
    }),
  });
  if (tool.toolCalls.length === 0) {
    throw new Error("Harness ended without a structured get_sales_evidence tool call");
  }

  console.log(JSON.stringify({
    recordedAt: new Date().toISOString(),
    profile: process.env.AWS_PROFILE,
    region,
    harnessArn,
    simple,
    invocationToolOverride: true,
    invocationAllowsBuiltInTools: true,
    tool,
  }, null, 2));
}

await main();
