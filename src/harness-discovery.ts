const accountId = "009073575420";
const region = "us-east-1";
const profile = "livenation-demo";
const harnessName = "livenation_demo";
const harnessArn = new RegExp(`^arn:aws:bedrock-agentcore:${region}:${accountId}:harness/${harnessName}-[a-zA-Z0-9]{10}$`);

export type HarnessDiscoveryOptions = {
  explicitArn?: string;
  profile?: string;
  region?: string;
  command?: (args: string[]) => Promise<string>;
};

function assertApprovedHarnessArn(value: unknown): string {
  if (typeof value !== "string" || !harnessArn.test(value)) throw new Error("Harness ARN is not the approved demo harness");
  return value;
}

async function runAws(args: string[]): Promise<string> {
  const process = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const stdout = new Response(process.stdout).text();
  const stderr = new Response(process.stderr).text();
  const timeout = setTimeout(() => process.kill(), 15_000);
  try {
    const [exitCode, output] = await Promise.all([process.exited, stdout, stderr]).then(([code, text]) => [code, text] as const);
    if (exitCode !== 0) throw new Error("AWS CLI command failed");
    return output;
  } catch {
    throw new Error("Could not discover the approved demo harness");
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveHarnessArn(options: HarnessDiscoveryOptions = {}): Promise<string> {
  if (options.profile && options.profile !== profile) throw new Error("Harness discovery requires the approved demo profile");
  if (options.region && options.region !== region) throw new Error("Harness discovery requires the approved demo region");
  if (options.explicitArn !== undefined) return assertApprovedHarnessArn(options.explicitArn);

  const command = options.command ?? runAws;
  let matches: unknown;
  try {
    matches = JSON.parse(await command([
      "aws", "bedrock-agentcore-control", "list-harnesses",
      "--profile", profile, "--region", region,
      "--query", "harnesses[?harnessName==`livenation_demo` && status==`READY`].arn",
      "--output", "json",
    ]));
  } catch {
    throw new Error("Could not discover the approved demo harness");
  }
  if (!Array.isArray(matches) || matches.length !== 1) throw new Error("Could not discover the approved demo harness");
  return assertApprovedHarnessArn(matches[0]);
}
