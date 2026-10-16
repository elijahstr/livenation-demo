import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import limits from "../config/demo-limits.json";
import runtime from "../config/demo-runtime.json";
import { AgentCoreHarnessClient } from "../src/agentcore-harness-client";
import { ChatService } from "../src/chat-service";
import { verifyConversationMemory } from "../src/conversation-memory";
import { GenieMcpClient } from "../src/genie-mcp-client";
import { resolveHarnessArn } from "../src/harness-discovery";
import { createPremiumTools, readAccountAttention } from "../src/premium-tools";
import { AS_OF } from "../src/premium-foundation";
import { ACCOUNT, aws } from "./inspect-configure-agentcore-observability";

const DIRECTORY = "outputs/premium-tools";
const ATTEMPTS_PATH = `${DIRECTORY}/probe-attempts.json`;
const MAX_AGENTCORE_TURNS = 3;

type Mode = "data-only" | "agentcore";
type Attempt = {
  attemptId: string;
  recordedAt: string;
  mode: Mode;
  status: "started" | "passed" | "failed" | "aborted";
  observedAccountCost: number;
  paidAgentcoreTurns: number;
  dataProofPath?: string;
  failureStage?: string;
};

function assertArgs(args: string[]): Mode {
  if (args.length !== 1 || !["--data-only", "--agentcore"].includes(args[0])) {
    throw new Error("Use --data-only or --agentcore for one bounded premium verification.");
  }
  return args[0].slice(2) as Mode;
}

async function writePrivateJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

async function readAttempts(): Promise<Attempt[]> {
  try {
    const value = JSON.parse(await readFile(ATTEMPTS_PATH, "utf8"));
    if (!Array.isArray(value)) throw new Error("Premium probe ledger is invalid");
    return value as Attempt[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function currentCost(): Promise<number> {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const result = await aws([
    "ce", "get-cost-and-usage",
    "--time-period", `Start=2026-09-25,End=${tomorrow.toISOString().slice(0, 10)}`,
    "--granularity", "MONTHLY", "--metrics", "UnblendedCost",
  ]);
  const totals = result.ResultsByTime?.map((period: { Total?: { UnblendedCost?: { Amount?: string; Unit?: string } } }) => period.Total?.UnblendedCost);
  if (!totals?.length || totals.some((total: { Amount?: string; Unit?: string } | undefined) => total?.Unit !== "USD" || !Number.isFinite(Number(total.Amount)))) {
    throw new Error("Cannot verify the demo cost allowance");
  }
  return totals.reduce((sum: number, total: { Amount?: string }) => sum + Number(total.Amount), 0);
}

export function compactData(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const provenance = record.provenance;
  const queryItems = record.query_items ?? record.queryItems;
  return {
    origin: record.origin,
    data_as_of: record.data_as_of ?? record.dataAsOf,
    conversation_id: record.conversation_id ?? record.conversationId,
    response_id: record.response_id ?? record.responseId,
    source_ids: record.source_ids ?? record.sourceIds,
    deep_link_present: typeof (record.deep_link ?? record.deepLink) === "string",
    query_items: Array.isArray(queryItems) ? queryItems.map((item: any) => ({
      item_id: item.item_id ?? item.itemId, statement_state: item.statement_state ?? item.statementState, ready: item.ready,
      returned_row_count: Array.isArray(item.rows) ? item.rows.length : 0,
      total_row_count: item.totalRowCount,
    })) : undefined,
    provenance: provenance && typeof provenance === "object" ? provenance : undefined,
  };
}

function rowsOf(value: unknown, section: string): Array<Record<string, unknown>> {
  const rows = (value as { rows?: Record<string, unknown> })?.rows?.[section];
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== "object" || Array.isArray(row))) throw new Error(`Premium verification omitted ${section} evidence`);
  return rows as Array<Record<string, unknown>>;
}

function hasRow(rows: Array<Record<string, unknown>>, expected: Record<string, string | number>): boolean {
  return rows.some(row => Object.entries(expected).every(([key, value]) => {
    if (key === "unit_price") return Number.isFinite(Number(row[key])) && Number(row[key]) === Number(value);
    return String(row[key]) === String(value);
  }));
}

function assertOrigin(value: unknown, name: string): void {
  const record = value as Record<string, unknown>;
  if (record?.origin !== "synthetic" || record.data_as_of !== "2026-10-16T12:00:00Z") throw new Error(`Premium ${name} omitted synthetic origin or data_as_of`);
}

function sameNumber(value: unknown, expected: number): boolean {
  return Number.isFinite(Number(value)) && Number(value) === expected;
}

export function assertPremiumData(attention: unknown, brief: unknown, options: unknown, analytics: unknown): void {
  assertOrigin(attention, "attention");
  assertOrigin(brief, "brief");
  assertOrigin(options, "options");
  assertOrigin(analytics, "analytics");
  if (!hasRow(rowsOf(attention, "attention"), { account_id: "A100", contract_id: "CT100" })) throw new Error("Premium attention evidence did not contain A100 and CT100");
  if (!hasRow(rowsOf(brief, "attention"), { account_id: "A100", contract_id: "CT100" })) throw new Error("Premium brief did not contain the A100 contract");
  if (!hasRow(rowsOf(brief, "artist_evidence"), { account_id: "A100", artist_id: "AR100", purchased_admission_tickets: 3, accepted_ticket_uses: 3 })) throw new Error("Premium brief did not contain the expected artist ticket use");
  if (!hasRow(rowsOf(options, "options"), { account_id: "A100", event_id: "E200", product_id: "premier-parking", available_quantity: 12, unit_price: 40 })) throw new Error("Premium options did not contain E200 Premier Parking");
  const queryItems = (analytics as { query_items?: unknown; queryItems?: unknown })?.query_items ?? (analytics as { queryItems?: unknown })?.queryItems;
  if (!Array.isArray(queryItems)) throw new Error("Premium analytics omitted query evidence");
  const valid = queryItems.some((item: any) => {
    if (item.ready !== true || item.statementState !== "SUCCEEDED" || item.totalRowCount !== 1 || !Array.isArray(item.columns) || !Array.isArray(item.rows) || item.rows.length !== 1) return false;
    if (item.columns.length !== 4 || new Set(item.columns).size !== 4) return false;
    const values = Object.fromEntries(item.columns.map((column: string, index: number) => [column, item.rows[0]?.[index]]));
    return sameNumber(values.net_admission_revenue, 300) && sameNumber(values.net_parking_revenue, 40) && sameNumber(values.valid_admission_tickets, 3) && sameNumber(values.admission_buying_accounts, 1);
  });
  if (!valid) throw new Error("Premium analytics metrics did not match 300, 40, 3, 1");
}

export function paidTurnCount(attempts: Attempt[]): number {
  if (attempts.some(attempt => !Number.isInteger(attempt.paidAgentcoreTurns) || attempt.paidAgentcoreTurns < 0 || attempt.paidAgentcoreTurns > MAX_AGENTCORE_TURNS)) throw new Error("Premium probe ledger has an invalid paid turn count");
  return attempts.reduce((sum, attempt) => sum + attempt.paidAgentcoreTurns, 0);
}

export function assertExpectedTools(required: readonly string[], toolNames: unknown): void {
  if (!Array.isArray(toolNames)) throw new Error("Premium AgentCore turn omitted tool names");
  for (const expected of required) if (!toolNames.includes(expected)) throw new Error(`Premium AgentCore turn did not call ${expected}`);
}

export function assertSuccessfulToolEvidence(expected: string, evidence: unknown[]): void {
  const match = evidence.find((value: any) => value?.tool_name === expected)?.result as Record<string, unknown> | undefined;
  if (!match || match.origin !== "synthetic" || match.data_as_of !== AS_OF) throw new Error(`Premium AgentCore turn did not return successful ${expected} evidence`);
  const statementId = (match.provenance as Record<string, unknown> | undefined)?.statement_id;
  const sourceIds = match.source_ids;
  const genieEvidence = typeof match.conversation_id === "string" && typeof match.response_id === "string" && Array.isArray(sourceIds) && sourceIds.length > 0;
  if (typeof statementId !== "string" && !genieEvidence) throw new Error(`Premium AgentCore turn returned incomplete ${expected} provenance`);
}

async function preflight(): Promise<number> {
  if (limits.target_total_usd !== 13 || limits.operational_stop_usd !== 15 || limits.absolute_cap_exclusive_usd !== 20 || limits.retries !== 0) {
    throw new Error("Demo cost ledger limits do not match the approved premium verification limits");
  }
  const identity = await aws(["sts", "get-caller-identity"]);
  if (identity.Account !== ACCOUNT) throw new Error("AWS identity is outside the demo account");
  const observed = await currentCost();
  if (observed >= limits.target_total_usd) throw new Error("Observed AWS account cost reached the $13 target");
  return observed;
}

function premiumHandlers(signal: AbortSignal, deadlineAt: number) {
  const askAnalytics = (question: string) => new GenieMcpClient({
    profile: runtime.databricksProfile,
    warehouseId: runtime.warehouseId,
    signal,
    deadlineAt,
  }).ask(question);
  return createPremiumTools({
    profile: runtime.databricksProfile,
    warehouseId: runtime.warehouseId,
    signal,
    deadlineAt,
    askAnalytics,
  });
}

async function verifyData(signal: AbortSignal): Promise<Record<string, unknown>> {
  const attention = await readAccountAttention({
    profile: runtime.databricksProfile,
    warehouseId: runtime.warehouseId,
    signal,
  });
  const tools = premiumHandlers(signal, Date.now() + 135_000);
  const brief = await tools.get_account_brief({ account_id: "A100" });
  const options = await tools.find_options({ account_id: "A100" });
  const analytics = await tools.ask_analytics({
    question: "For the Premium Gold foundation, return all-time sales_metrics. Treat AS OF 2026-10-16T12:00:00Z as snapshot context, not a sale_date filter.",
  });
  assertPremiumData(attention, brief, options, analytics);
  return { attention: compactData(attention), brief: compactData(brief), options: compactData(options), analytics: compactData(analytics) };
}

async function verifyAgentcore(observedAccountCost: number, attempt: Attempt, attempts: Attempt[], signal: AbortSignal): Promise<Array<Record<string, unknown>>> {
  const harnessArn = await resolveHarnessArn({ explicitArn: process.env.HARNESS_ARN });
  await verifyConversationMemory(harnessArn);
  const client = new AgentCoreHarnessClient(runtime.awsRegion, runtime.awsProfile);
  let returnedEvidence: unknown[] = [];
  const chat = new ChatService({
    harnessArn,
    enabled: true,
    memoryMode: "agentcore",
    beforeTurn: () => verifyConversationMemory(harnessArn).then(() => undefined),
    invoke: await client.createPremiumChatInvoker(),
    readEvidence: async () => [],
    premiumTools: ({ signal, deadlineAt }) => {
      const handlers = premiumHandlers(signal, deadlineAt);
      return Object.fromEntries(Object.entries(handlers).map(([name, handler]) => [name, async (input: unknown) => {
        const result = await handler(input);
        returnedEvidence.push({ tool_name: name, result: compactData(result) });
        return result;
      }]));
    },
  });
  const session = chat.createSession();
  const requests = [
    {
      requiredTools: ["get_account_brief", "find_options"],
      message: "Call get_account_brief and find_options for A100. State only returned synthetic evidence and each data_as_of.",
    },
    {
      requiredTools: ["ask_analytics"],
      message: "Call ask_analytics for all-time Premium Gold sales metrics. Treat AS OF as snapshot context, not a sale_date filter.",
    },
  ] as const;
  const turns: Array<Record<string, unknown>> = [];
  for (const { requiredTools, message } of requests) {
    if (paidTurnCount(attempts) >= MAX_AGENTCORE_TURNS) throw new Error("Premium probe reached its three-turn limit");
    const observed = await currentCost();
    if (observed >= limits.target_total_usd) throw new Error("Observed AWS account cost reached the $13 target");
    attempt.paidAgentcoreTurns += 1;
    await writePrivateJson(ATTEMPTS_PATH, attempts);
    returnedEvidence = [];
    const turn = await chat.run({ sessionId: session.sessionId, message }, { signal });
    const proof = { required_tools: requiredTools, tool_names: turn.toolNames, tool_call_count: turn.toolCallCount, runtime_session_id: turn.runtimeSessionId, usage: turn.usage, source_times: turn.sourceTimes, returned_evidence: returnedEvidence };
    const proofPath = `${DIRECTORY}/${attempt.attemptId}-${attempt.paidAgentcoreTurns}-turn-proof.json`;
    await writePrivateJson(proofPath, proof);
    assertExpectedTools(requiredTools, turn.toolNames);
    for (const expectedTool of requiredTools) assertSuccessfulToolEvidence(expectedTool, returnedEvidence);
    const matchingSourceTimes = turn.sourceTimes.filter((value) => value === AS_OF).length;
    if (matchingSourceTimes < requiredTools.length) throw new Error(`Premium AgentCore turn did not preserve ${AS_OF} for every required tool`);
    turns.push({ ...proof, proof_path: proofPath });
  }
  return [{ harness_arn: harnessArn, observed_account_cost: observedAccountCost, turns }];
}

async function run(mode: Mode): Promise<void> {
  process.umask(0o077);
  await mkdir(DIRECTORY, { recursive: true, mode: 0o700 });
  const lockPath = `${DIRECTORY}/probe.lock`;
  const lock = await open(lockPath, "wx", 0o600);
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  let attempts: Attempt[] | undefined;
  let attempt: Attempt | undefined;
  let stage = "preflight";
  try {
    const observedAccountCost = await preflight();
    attempts = await readAttempts();
    if (mode === "agentcore" && paidTurnCount(attempts) >= MAX_AGENTCORE_TURNS) {
      throw new Error("Three premium AgentCore turns are already recorded");
    }
    attempt = { attemptId: crypto.randomUUID(), recordedAt: new Date().toISOString(), mode, status: "started", observedAccountCost, paidAgentcoreTurns: 0 };
    attempts.push(attempt);
    await writePrivateJson(ATTEMPTS_PATH, attempts);
    stage = "data";
    const data = mode === "data-only" ? await verifyData(controller.signal) : undefined;
    if (data) {
      attempt.dataProofPath = `${DIRECTORY}/${attempt.attemptId}-data.json`;
      await writePrivateJson(attempt.dataProofPath, { checked_at: new Date().toISOString(), data });
      await writePrivateJson(ATTEMPTS_PATH, attempts);
    }
    let agentcore: Array<Record<string, unknown>> | undefined;
    if (mode === "agentcore") {
      stage = "agentcore";
      agentcore = await verifyAgentcore(observedAccountCost, attempt, attempts, controller.signal);
    }
    attempt.status = "passed";
    await writePrivateJson(ATTEMPTS_PATH, attempts);
    const proofPath = `${DIRECTORY}/${Date.now()}-verification.json`;
    const proof = {
      checked_at: new Date().toISOString(), mode, observed_aws_account_cost: observedAccountCost,
      cost_caveat: "Cost Explorer can lag and does not cover Databricks billing. The ledger is not a live billing control.",
      expected_side_effects: ["Genie conversation", "Databricks query history", "warehouse compute"],
      data, agentcore,
    };
    await writePrivateJson(proofPath, proof);
    console.log(JSON.stringify({ status: "passed", mode, proofPath }, null, 2));
  } catch (error) {
    if (attempt && attempts) {
      attempt.status = controller.signal.aborted ? "aborted" : "failed";
      attempt.failureStage = stage;
      await writePrivateJson(ATTEMPTS_PATH, attempts);
    }
    throw error;
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    await lock.close();
    await unlink(lockPath).catch(() => undefined);
  }
}

if (import.meta.main) {
  try { await run(assertArgs(process.argv.slice(2))); }
  catch (error) { console.error(error instanceof Error ? error.message : "Premium verification failed"); process.exitCode = 1; }
}
