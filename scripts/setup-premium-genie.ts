import { canonicalJson, hash } from "../src/premium-foundation";
import { runDatabricksJsonRequest, type DatabricksJsonRequest } from "../src/databricks-statements";

const PROFILE = "livenation-demo";
const WAREHOUSE = "976766402458e7de";
const TITLE = "Live Nation Premium Gold";
const MARKER = "livenation-premium-genie-v1";
const PARENT_PATH = "/Users/elijahstraight14@gmail.com";
const TABLES = [
  "workspace.ln_premium_gold.account_artist_evidence",
  "workspace.ln_premium_gold.account_attention",
  "workspace.ln_premium_gold.account_event_benefits",
  "workspace.ln_premium_gold.regional_sales",
  "workspace.ln_premium_gold.upcoming_options",
];
const METRIC_VIEWS = ["workspace.ln_premium_gold.sales_metrics"];

type Space = { space_id?: unknown; title?: unknown; description?: unknown; warehouse_id?: unknown; parent_path?: unknown; serialized_space?: unknown };
type Options = { apply?: boolean; request?: DatabricksJsonRequest };

function object(value: unknown, name: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} is invalid`); return value as Record<string, unknown>; }
function string(value: unknown, name: string): string { if (typeof value !== "string" || !value) throw new Error(`${name} is invalid`); return value; }
function ids(values: unknown[], label: string): void {
  let previous = "";
  for (const value of values) { const id = string(object(value, label).id, `${label} ID`); if (!/^[a-f0-9]{32}$/.test(id) || id <= previous) throw new Error(`${label} IDs must be sorted lowercase hexadecimal values`); previous = id; }
}

export function validatePremiumGenieConfig(value: unknown): Record<string, unknown> {
  const config = object(value, "Genie configuration");
  if (config.version !== 2) throw new Error("Genie configuration must use version 2");
  const samples = object(config.config, "Genie configuration config").sample_questions;
  if (!Array.isArray(samples)) throw new Error("Genie sample questions are invalid");
  ids(samples, "sample question");
  const sources = object(config.data_sources, "Genie data sources");
  const sourceNames = (name: "tables" | "metric_views") => {
    const entries = sources[name]; if (!Array.isArray(entries)) throw new Error(`Genie ${name} are invalid`);
    const names = entries.map(entry => string(object(entry, name).identifier, `${name} identifier`));
    if (canonicalJson(names) !== canonicalJson(name === "tables" ? TABLES : METRIC_VIEWS)) throw new Error(`Genie ${name} scope differs from the approved Gold objects`);
  };
  sourceNames("tables"); sourceNames("metric_views");
  const instructions = object(config.instructions, "Genie instructions");
  const texts = instructions.text_instructions;
  if (!Array.isArray(texts) || texts.length !== 1) throw new Error("Genie requires one text instruction");
  ids(texts, "text instruction");
  const examples = instructions.example_question_sqls;
  if (!Array.isArray(examples)) throw new Error("Genie SQL examples are invalid");
  ids(examples, "SQL example");
  return config;
}

function description(definitionHash: string): string { return `${MARKER}; definition_sha256=${definitionHash}`; }
function normalizeGenieDefinition(value: unknown): Record<string, unknown> {
  const definition = structuredClone(object(value, "Genie serialized configuration"));
  if (definition.version !== 2) throw new Error("Genie serialized configuration has an invalid version");
  const sources = object(definition.data_sources, "Genie serialized data sources");
  const tables = Array.isArray(sources.tables) ? sources.tables : [];
  const metricViews = sources.metric_views === undefined ? [] : sources.metric_views;
  if (!Array.isArray(metricViews)) throw new Error("Genie serialized metric views are invalid");
  const allSources = [...tables, ...metricViews].map(entry => object(entry, "Genie serialized source"));
  const sourceNames = allSources.map(entry => string(entry.identifier, "Genie serialized source identifier")).sort();
  const expectedSources = [...TABLES, ...METRIC_VIEWS].sort();
  if (canonicalJson(sourceNames) !== canonicalJson(expectedSources) || new Set(sourceNames).size !== expectedSources.length) throw new Error("Genie serialized source scope differs from the approved Gold objects");
  sources.tables = allSources.sort((left, right) => string(left.identifier, "Genie serialized source identifier").localeCompare(string(right.identifier, "Genie serialized source identifier")));
  delete sources.metric_views;
  const instructions = object(definition.instructions, "Genie serialized instructions");
  const texts = instructions.text_instructions;
  if (!Array.isArray(texts)) throw new Error("Genie serialized text instructions are invalid");
  for (const text of texts) {
    const instruction = object(text, "Genie serialized text instruction");
    if (!Array.isArray(instruction.content) || instruction.content.some(part => typeof part !== "string")) throw new Error("Genie serialized instruction content is invalid");
    instruction.content = [instruction.content.join("")];
  }
  return definition;
}
function owned(space: Space, definitionHash: string, serialized: string): boolean {
  if (space.title !== TITLE || space.description !== description(definitionHash) || space.warehouse_id !== WAREHOUSE || space.parent_path !== PARENT_PATH || typeof space.serialized_space !== "string") return false;
  try { return canonicalJson(normalizeGenieDefinition(JSON.parse(space.serialized_space))) === canonicalJson(normalizeGenieDefinition(JSON.parse(serialized))); } catch { return false; }
}

async function listSpaces(request: DatabricksJsonRequest): Promise<Space[]> {
  const spaces: Space[] = []; let pageToken: string | undefined; const seenTokens = new Set<string>(); let pages = 0;
  do {
    if (++pages > 100) throw new Error("Genie space pagination exceeded its limit");
    const query = pageToken ? `?page_size=100&page_token=${encodeURIComponent(pageToken)}` : "?page_size=100";
    const page = object(await request(["api", "get", `/api/2.0/genie/spaces${query}`, "--profile", PROFILE, "--output", "json"], undefined, { timeoutMs: 15_000, maxBytes: 64 * 1024 }), "Genie list response");
    if (!Array.isArray(page.spaces)) throw new Error("Genie list response has no spaces");
    spaces.push(...page.spaces.map(item => object(item, "Genie space")));
    pageToken = page.next_page_token === undefined ? undefined : string(page.next_page_token, "Genie page token");
    if (pageToken && seenTokens.has(pageToken)) throw new Error("Genie space pagination repeated a token");
    if (pageToken) seenTokens.add(pageToken);
  } while (pageToken);
  return spaces;
}

export async function setupPremiumGenie(options: Options = {}): Promise<{ mode: "dry-run" | "created" | "verified"; title: string; definitionHash: string; sources: string[]; spaceId?: string; verifiedUrl?: string }> {
  const config = validatePremiumGenieConfig(await Bun.file(new URL("../config/premium-genie.json", import.meta.url)).json());
  const serialized = canonicalJson(config);
  const definitionHash = hash(config);
  const result = { title: TITLE, definitionHash, sources: [...TABLES, ...METRIC_VIEWS] };
  if (!options.apply) return { mode: "dry-run", ...result };
  const request = options.request ?? runDatabricksJsonRequest;
  const folder = object(await request(["api", "get", `/api/2.0/workspace/get-status?path=${encodeURIComponent(PARENT_PATH)}`, "--profile", PROFILE, "--output", "json"], undefined, { timeoutMs: 15_000, maxBytes: 64 * 1024 }), "Genie parent folder");
  if (folder.object_type !== "DIRECTORY") throw new Error("Genie parent path is not an existing workspace directory");
  const spaces = await listSpaces(request);
  const sameTitle = spaces.filter(space => space.title === TITLE);
  if (sameTitle.length > 1) throw new Error("More than one owned Genie title exists");
  if (sameTitle.length === 1) {
    const id = string(sameTitle[0].space_id, "Genie space ID");
    const inspected = object(await request(["api", "get", `/api/2.0/genie/spaces/${encodeURIComponent(id)}?include_serialized_space=true`, "--profile", PROFILE, "--output", "json"], undefined, { timeoutMs: 15_000, maxBytes: 64 * 1024 }), "Genie space inspection");
    if (!owned(inspected, definitionHash, serialized)) throw new Error("Existing Genie title is foreign or has changed configuration");
    return { mode: "verified", ...result, spaceId: id, verifiedUrl: `/genie/rooms/${id}` };
  }
  const created = object(await request(["api", "post", "/api/2.0/genie/spaces", "--profile", PROFILE, "--output", "json"], {
    title: TITLE, description: description(definitionHash), parent_path: PARENT_PATH, warehouse_id: WAREHOUSE, serialized_space: serialized,
  }, { timeoutMs: 30_000, maxBytes: 64 * 1024 }), "Genie create response");
  const spaceId = string(created.space_id, "created Genie space ID");
  const readback = object(await request(["api", "get", `/api/2.0/genie/spaces/${encodeURIComponent(spaceId)}?include_serialized_space=true`, "--profile", PROFILE, "--output", "json"], undefined, { timeoutMs: 15_000, maxBytes: 64 * 1024 }), "Created Genie Agent inspection");
  if (!owned(readback, definitionHash, serialized)) throw new Error("Created Genie Agent did not match the approved configuration");
  return { mode: "created", ...result, spaceId, verifiedUrl: `/genie/rooms/${spaceId}` };
}

if (import.meta.main) {
  const apply = process.argv.slice(2).includes("--apply");
  if (process.argv.slice(2).some(argument => argument !== "--apply")) throw new Error("Use no argument for dry-run or --apply for creation");
  console.log(JSON.stringify(await setupPremiumGenie({ apply }), null, 2));
}
