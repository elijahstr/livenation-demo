import {
  parseJson,
  assertHarnessSetup,
  assertSyntheticSalesFixture,
} from "../src/local-setup";

const configPath = new URL("../config/create-harness.json", import.meta.url);
const fixturePath = new URL("../fixtures/synthetic-sales.json", import.meta.url);

const config = parseJson(await Bun.file(configPath).text(), "config/create-harness.json");
assertHarnessSetup(config);

const fixture = parseJson(await Bun.file(fixturePath).text(), "fixtures/synthetic-sales.json");
assertSyntheticSalesFixture(fixture);

const version = Bun.spawnSync({ cmd: ["aws", "--version"] });
const versionText = `${version.stdout}\n${version.stderr}`;
if (version.exitCode !== 0 || !versionText.includes("aws-cli/2.36.49")) {
  throw new Error("This preparation bundle requires AWS CLI 2.36.49");
}

const skeleton = Bun.spawnSync({
  cmd: [
    "aws",
    "bedrock-agentcore-control",
    "create-harness",
    "--generate-cli-skeleton",
    "input",
  ],
});
const skeletonText = `${skeleton.stdout}\n${skeleton.stderr}`;
if (skeleton.exitCode !== 0 || !skeletonText.includes('"harnessName"')) {
  throw new Error("AWS CLI cannot generate the local Harness input schema");
}

console.log("Local Harness configuration and synthetic aggregate fixtures are valid.");
console.log("AWS CLI input skeleton generation was local only; no AWS request was sent.");
