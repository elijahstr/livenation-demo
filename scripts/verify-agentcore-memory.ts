import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import memorySettings from "../config/conversation-memory.json";
import { AgentCoreHarnessClient } from "../src/agentcore-harness-client";
import { ChatService } from "../src/chat-service";
import { verifyConversationMemory } from "../src/conversation-memory";
import { resolveHarnessArn } from "../src/harness-discovery";
import { ACCOUNT, aws } from "./inspect-configure-agentcore-observability";
import runtime from "../config/demo-runtime.json";

const ATTEMPT_PATH = "outputs/agentcore-memory/probe-attempts.json";
const MAX_ATTEMPTS = 3;
const WAIT_MS = 310_000;
const WAIT_SEGMENT_MS = 10_000;

type Attempt = {
  attemptId: string;
  recordedAt: string;
  status: "started" | "passed" | "failed" | "aborted";
  observedAccountCost: number;
  harnessArn: string;
  memoryArn: string;
  failureStage?: string;
};

type TurnProof = { runtimeSessionId: string; usage: Record<string, number>; toolCallCount: number };

export function assertMemoryVerificationRun(args: string[]): void {
  if (args.length === 0) throw new Error("Use --run for the bounded paid memory verification.");
  if (args.length !== 1 || args[0] !== "--run") throw new Error("Use only --run for the bounded paid memory verification.");
}

export function proofHasNoToolCalls(turns: Array<{ toolCallCount: number }>): boolean {
  return turns.every((turn) => turn.toolCallCount === 0);
}

async function writePrivateJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

async function readAttempts(): Promise<Attempt[]> {
  try {
    const parsed = JSON.parse(await readFile(ATTEMPT_PATH, "utf8"));
    if (!Array.isArray(parsed)) throw new Error("Memory probe ledger is invalid");
    return parsed as Attempt[];
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

async function listEventIds(memoryId: string, sessionId: string): Promise<string[]> {
  const result = await aws([
    "bedrock-agentcore", "list-events", "--memory-id", memoryId,
    "--actor-id", memorySettings.actorId, "--session-id", sessionId,
    "--no-include-payloads", "--query", "events[].eventId",
  ]);
  if (!Array.isArray(result) || result.some((id) => typeof id !== "string")) throw new Error("Memory event metadata is unavailable");
  return result;
}

async function waitForEventIds(memoryId: string, sessionId: string, minimum: number): Promise<string[]> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const eventIds = await listEventIds(memoryId, sessionId);
    if (new Set(eventIds).size >= minimum) return eventIds;
    if (attempt < 5) await Bun.sleep(10_000);
  }
  throw new Error("Memory event metadata did not appear within one minute");
}

function turnProof(turn: { runtimeSessionId: string; usage: Record<string, number>; toolCallCount: number }): TurnProof {
  return { runtimeSessionId: turn.runtimeSessionId, usage: turn.usage, toolCallCount: turn.toolCallCount };
}

async function waitForRuntimeStop(signal: AbortSignal): Promise<void> {
  const endsAt = Date.now() + WAIT_MS;
  let nextProgressAt = Date.now();
  while (Date.now() < endsAt) {
    if (signal.aborted) throw new Error("Verification was interrupted");
    if (Date.now() >= nextProgressAt) {
      console.log("Memory verification waits for the 300-second runtime lifetime.");
      nextProgressAt += 30_000;
    }
    await Bun.sleep(Math.min(WAIT_SEGMENT_MS, endsAt - Date.now()));
  }
}

async function run(): Promise<void> {
  process.umask(0o077);
  await mkdir(dirname(ATTEMPT_PATH), { recursive: true, mode: 0o700 });
  const lockPath = `${dirname(ATTEMPT_PATH)}/probe.lock`;
  const lock = await open(lockPath, "wx", 0o600);
  console.log("Memory verification starts. It makes bounded paid model calls.");
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once("SIGINT", interrupt);
  let attempts: Attempt[] | undefined;
  let attempt: Attempt | undefined;
  let stage = "preflight";
  try {
    const identity = await aws(["sts", "get-caller-identity"]);
    if (identity.Account !== ACCOUNT) throw new Error("AWS identity is outside the demo account");
    const harnessArn = await resolveHarnessArn({ explicitArn: process.env.HARNESS_ARN });
    const memory = await verifyConversationMemory(harnessArn);
    const observedAccountCost = await currentCost();
    if (observedAccountCost >= 13) throw new Error("Observed account cost reached the $13 target");

    attempts = await readAttempts();
    if (attempts.length >= MAX_ATTEMPTS) throw new Error("Three memory probe attempts are already recorded");
    attempt = {
      attemptId: crypto.randomUUID(), recordedAt: new Date().toISOString(), status: "started",
      observedAccountCost, harnessArn, memoryArn: memory.memoryArn,
    };
    attempts.push(attempt);
    await writePrivateJson(ATTEMPT_PATH, attempts);

    const client = new AgentCoreHarnessClient(runtime.awsRegion, runtime.awsProfile);
    const chat = new ChatService({
      harnessArn,
      enabled: true,
      memoryMode: "agentcore",
      beforeTurn: async () => { await verifyConversationMemory(harnessArn); },
      invoke: await client.createChatInvoker("qualified"),
      readEvidence: async () => { throw new Error("The memory probe does not permit sales evidence tools"); },
    });
    const nonce = `memory-probe-${crypto.randomUUID()}`;
    const firstConversation = chat.createSession();
    stage = "first-turn";
    const first = await chat.run({
      sessionId: firstConversation.sessionId,
      message: `Remember this opaque synthetic label for this conversation only: ${nonce}. Reply with ACK only.`,
    }, { signal: controller.signal });
    if (!proofHasNoToolCalls([first])) throw new Error("The memory probe used an unexpected tool");
    stage = "stored-event-metadata";
    const eventIdsBeforeWait = await waitForEventIds(memory.memoryId, first.runtimeSessionId, 1);

    stage = "runtime-lifetime-wait";
    await waitForRuntimeStop(controller.signal);
    stage = "same-session-recall";
    const restored = await chat.run({
      sessionId: firstConversation.sessionId,
      message: "What exact opaque synthetic label did I ask you to remember? Reply with only that label.",
    }, { signal: controller.signal });
    if (!proofHasNoToolCalls([restored]) || !restored.text.includes(nonce)) throw new Error("The same conversation did not restore its label");

    const secondConversation = chat.createSession();
    stage = "new-session-isolation";
    const isolated = await chat.run({
      sessionId: secondConversation.sessionId,
      message: "What opaque synthetic label did another conversation use? Reply with NONE only when you do not know it.",
    }, { signal: controller.signal });
    if (!proofHasNoToolCalls([isolated]) || isolated.text.includes(nonce)) {
      throw new Error("A new conversation did not preserve memory isolation");
    }

    stage = "final-event-metadata";
    const eventIdsAfterWait = await waitForEventIds(memory.memoryId, first.runtimeSessionId, 2);
    const proof = {
      checkedAt: new Date().toISOString(), harnessArn, memoryArn: memory.memoryArn, memoryId: memory.memoryId,
      actorId: memory.actorId, observedAccountCost,
      costCaveat: "Cost Explorer can lag. The observed amount is not a hard billing cap.",
      liveVerification: "passed", firstConversation: firstConversation.sessionId, secondConversation: secondConversation.sessionId,
      turns: [turnProof(first), turnProof(restored), turnProof(isolated)],
      eventIdsBeforeWait, eventIdsAfterWait, sameSessionRestored: true, differentSessionIsolated: true,
      isolationAcknowledged: /\bNONE\b/i.test(isolated.text),
      noToolCalls: proofHasNoToolCalls([first, restored, isolated]),
    };
    attempt.status = "passed";
    await writePrivateJson(ATTEMPT_PATH, attempts);
    await writePrivateJson(`outputs/agentcore-memory/${Date.now()}-verification.json`, proof);
    console.log("Memory verification passed. The private proof file contains metadata and usage only.");
  } catch (error) {
    if (attempt && attempts) {
      attempt.status = controller.signal.aborted ? "aborted" : "failed";
      attempt.failureStage = stage;
      await writePrivateJson(ATTEMPT_PATH, attempts);
    }
    console.error(`Memory verification stopped during ${stage}.`);
    throw error;
  } finally {
    process.removeListener("SIGINT", interrupt);
    await lock.close();
    await unlink(lockPath);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.log("Live memory verification is pending. Use --run for the bounded paid check.");
    return;
  }
  assertMemoryVerificationRun(args);
  await run();
}

if (import.meta.main) {
  try {
    await main();
  } catch {
    console.error("Memory verification did not complete. Inspect the private attempt record before another run.");
    process.exitCode = 1;
  }
}
