type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type Region = "east" | "west";

export type SalesFixture = {
  origin: "synthetic";
  data_as_of: string;
  shows: Array<{
    show_id: "east_show" | "west_show";
    region: Region;
    tickets_sold_cumulative: number;
    tickets_target_cumulative: number;
  }>;
};

type SalesEvidenceInput = {
  show_id: "east_show" | "west_show";
  region: Region;
};

const expectedRole =
  "arn:aws:iam::009073575420:role/livenation-demo-harness";
const expectedModel = "moonshotai.kimi-k2.5";
const allowedTool = "get_sales_evidence";
const showIds = new Set(["east_show", "west_show"]);
const regions = new Set(["east", "west"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireOnlyKeys(
  value: unknown,
  allowed: readonly string[],
  path: string,
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${path} has unknown key ${key}`);
  }
}

function requireNumberInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  path: string,
): void {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${path} must be an integer from ${minimum} to ${maximum}`);
  }
}

function assertEvidenceInput(value: unknown): asserts value is SalesEvidenceInput {
  requireOnlyKeys(value, ["show_id", "region"], "tool input");
  if (typeof value.show_id !== "string" || !showIds.has(value.show_id)) {
    throw new Error("Unknown synthetic show");
  }
  if (typeof value.region !== "string" || !regions.has(value.region)) {
    throw new Error("Unknown synthetic region");
  }
}

export function assertSyntheticSalesFixture(value: unknown): asserts value is SalesFixture {
  requireOnlyKeys(value, ["origin", "data_as_of", "shows"], "fixture");
  if (value.origin !== "synthetic" || typeof value.data_as_of !== "string") {
    throw new Error("fixture must declare a synthetic origin and data_as_of");
  }
  if (Number.isNaN(Date.parse(value.data_as_of)) || !Array.isArray(value.shows)) {
    throw new Error("fixture data_as_of and shows must be valid");
  }
  if (value.shows.length !== 2) throw new Error("fixture must contain two fictional shows");
  const expectedShows = new Set(["east_show:east", "west_show:west"]);
  for (const show of value.shows) {
    requireOnlyKeys(
      show,
      [
        "show_id",
        "region",
        "tickets_sold_cumulative",
        "tickets_target_cumulative",
      ],
      "fixture show",
    );
    if (typeof show.show_id !== "string" || typeof show.region !== "string") {
      throw new Error("fixture show and region must be strings");
    }
    const key = `${show.show_id}:${show.region}`;
    if (!expectedShows.delete(key)) throw new Error("fixture has an unknown or duplicate show");
    for (const metric of [
      show.tickets_sold_cumulative,
      show.tickets_target_cumulative,
    ]) {
      if (typeof metric !== "number" || !Number.isSafeInteger(metric) || metric < 0) {
        throw new Error("fixture metrics must be non-negative integer counts");
      }
    }
  }
  if (expectedShows.size !== 0) throw new Error("fixture is missing a fictional region");
}

export function getSalesEvidence(
  input: unknown,
  authorizedRegion: Region,
  fixture: SalesFixture,
) {
  assertEvidenceInput(input);
  assertSyntheticSalesFixture(fixture);
  if (input.region !== authorizedRegion) {
    throw new Error("Caller is not authorized for this synthetic region");
  }

  const show = fixture.shows.find(
    (candidate) =>
      candidate.show_id === input.show_id && candidate.region === input.region,
  );
  if (!show) throw new Error("Unknown synthetic show");

  return {
    data_as_of: fixture.data_as_of,
    origin: fixture.origin,
    region: show.region,
    show_id: show.show_id,
    tickets_sold_cumulative: show.tickets_sold_cumulative,
    tickets_target_cumulative: show.tickets_target_cumulative,
  };
}

export function assertHarnessSetup(value: unknown): void {
  requireOnlyKeys(
    value,
    [
      "harnessName",
      "executionRoleArn",
      "environment",
      "environmentVariables",
      "model",
      "systemPrompt",
      "tools",
      "skills",
      "allowedTools",
      "memory",
      "truncation",
      "maxIterations",
      "maxTokens",
      "timeoutSeconds",
      "tags",
    ],
    "harness",
  );

  if (value.harnessName !== "livenation_demo") {
    throw new Error("harnessName must be livenation_demo");
  }
  if (value.executionRoleArn !== expectedRole) {
    throw new Error("executionRoleArn must match the planned role ARN");
  }
  requireOnlyKeys(value.environmentVariables, [], "environmentVariables");

  requireOnlyKeys(value.model, ["bedrockModelConfig"], "model");
  requireOnlyKeys(
    value.model.bedrockModelConfig,
    ["modelId", "apiFormat", "maxTokens"],
    "bedrockModelConfig",
  );
  const model = value.model.bedrockModelConfig;
  if (model.modelId !== expectedModel || model.apiFormat !== "converse_stream") {
    throw new Error(
      "Only the direct moonshotai.kimi-k2.5 Converse Stream model route is allowed",
    );
  }
  requireNumberInRange(model.maxTokens, 1, 1024, "bedrockModelConfig.maxTokens");

  requireOnlyKeys(value.environment, ["agentCoreRuntimeEnvironment"], "environment");
  const environment = value.environment.agentCoreRuntimeEnvironment;
  requireOnlyKeys(
    environment,
    ["lifecycleConfiguration", "networkConfiguration"],
    "environment.agentCoreRuntimeEnvironment",
  );
  requireOnlyKeys(
    environment.lifecycleConfiguration,
    ["idleRuntimeSessionTimeout", "maxLifetime"],
    "lifecycleConfiguration",
  );
  requireNumberInRange(
    environment.lifecycleConfiguration.idleRuntimeSessionTimeout,
    60,
    60,
    "idleRuntimeSessionTimeout",
  );
  requireNumberInRange(
    environment.lifecycleConfiguration.maxLifetime,
    60,
    300,
    "maxLifetime",
  );
  requireOnlyKeys(environment.networkConfiguration, ["networkMode"], "networkConfiguration");
  if (environment.networkConfiguration.networkMode !== "PUBLIC") {
    throw new Error("networkMode must be PUBLIC for the planned local demo setup");
  }

  if (!Array.isArray(value.systemPrompt) || value.systemPrompt.length !== 1) {
    throw new Error("systemPrompt must contain one text block");
  }
  requireOnlyKeys(value.systemPrompt[0], ["text"], "systemPrompt[0]");
  if (typeof value.systemPrompt[0].text !== "string" || !value.systemPrompt[0].text.trim()) {
    throw new Error("systemPrompt text is required");
  }

  if (!Array.isArray(value.skills) || value.skills.length !== 0) {
    throw new Error("skills must be empty");
  }
  if (
    !Array.isArray(value.allowedTools) ||
    value.allowedTools.length !== 1 ||
    value.allowedTools[0] !== allowedTool
  ) {
    throw new Error("Only get_sales_evidence is allowed");
  }
  requireOnlyKeys(value.memory, ["disabled"], "memory");
  requireOnlyKeys(value.memory.disabled, [], "memory.disabled");

  requireOnlyKeys(value.truncation, ["strategy", "config"], "truncation");
  if (value.truncation.strategy !== "sliding_window") {
    throw new Error("truncation.strategy must be sliding_window");
  }
  requireOnlyKeys(value.truncation.config, ["slidingWindow"], "truncation.config");
  requireOnlyKeys(
    value.truncation.config.slidingWindow,
    ["messagesCount"],
    "truncation.config.slidingWindow",
  );
  // AgentCore returns 150 as the service default. Pin it to prevent Terraform drift.
  requireNumberInRange(
    value.truncation.config.slidingWindow.messagesCount,
    150,
    150,
    "truncation.config.slidingWindow.messagesCount",
  );
  requireNumberInRange(value.maxIterations, 1, 3, "maxIterations");
  requireNumberInRange(value.maxTokens, 1, 2048, "maxTokens");
  requireNumberInRange(value.timeoutSeconds, 1, 60, "timeoutSeconds");

  if (!Array.isArray(value.tools) || value.tools.length !== 1) {
    throw new Error("Exactly one inline evidence tool is required");
  }
  const tool = value.tools[0];
  requireOnlyKeys(tool, ["type", "name", "config"], "tools[0]");
  if (tool.type !== "inline_function" || tool.name !== allowedTool) {
    throw new Error("Only the inline get_sales_evidence tool is allowed");
  }
  requireOnlyKeys(tool.config, ["inlineFunction"], "tools[0].config");
  requireOnlyKeys(
    tool.config.inlineFunction,
    ["description", "inputSchema"],
    "inlineFunction",
  );
  if (typeof tool.config.inlineFunction.description !== "string" ||
      !tool.config.inlineFunction.description.trim()) {
    throw new Error("inlineFunction description is required");
  }
  const inputSchema = tool.config.inlineFunction.inputSchema;
  requireOnlyKeys(
    inputSchema,
    ["type", "additionalProperties", "required", "properties"],
    "inputSchema",
  );
  if (
    inputSchema.type !== "object" ||
    inputSchema.additionalProperties !== false ||
    JSON.stringify(inputSchema.required) !== JSON.stringify(["show_id", "region"])
  ) {
    throw new Error("inputSchema must require only show_id and region");
  }
  requireOnlyKeys(inputSchema.properties, ["show_id", "region"], "inputSchema.properties");
  for (const [key, expected] of Object.entries({
    show_id: ["east_show", "west_show"],
    region: ["east", "west"],
  })) {
    requireOnlyKeys(
      inputSchema.properties[key],
      ["type", "enum"],
      `inputSchema.properties.${key}`,
    );
    if (
      inputSchema.properties[key].type !== "string" ||
      JSON.stringify(inputSchema.properties[key].enum) !== JSON.stringify(expected)
    ) {
      throw new Error(`inputSchema.properties.${key} has an unexpected enum`);
    }
  }
  requireOnlyKeys(value.tags, ["project", "data-origin", "environment"], "tags");
  if (value.tags.project !== "livenation-demo" ||
      value.tags["data-origin"] !== "synthetic" ||
      value.tags.environment !== "demo") {
    throw new Error("tags must identify the synthetic demo preparation");
  }
}

export function parseJson(text: string, path: string): Json {
  try {
    return JSON.parse(text) as Json;
  } catch {
    throw new Error(`${path} is not valid JSON`);
  }
}
