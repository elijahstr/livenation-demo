import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { HarnessEvent, HarnessInvoker } from "./harness-tool-cycle";
import type { RawInvocation } from "./regional-types";

const UTF8 = new TextEncoder();
const MAX_PROMPT_BYTES = 64 * 1024;
const MODEL_CONTEXT_UNITS = 256_000;
const HIDDEN_CONTEXT_UNITS = 8_192;
const OUTPUT_BUDGET_TOKENS = 2_048;
const MAX_ITERATIONS = 4;
const INPUT_USD_PER_MILLION = 0.60;
const OUTPUT_USD_PER_MILLION = 3.00;
const TARGET_USD = 13;
const STOP_USD = 15;
const CAP_USD = 20;
const RESERVE_USD = 5;

type CostReader = () => Promise<number>;
type Charge = RawInvocation & { id: string };
type RuntimeState = {
  version: 1;
  remote_until?: number;
  statement_until?: number;
  cost_explorer_requests?: number;
  unknown_block?: { reason: string; blocked_at: string };
  context_bytes: Record<string, number>;
  charges: Charge[];
  cost_explorer: { checked_at: string; value_usd: number | null; raw_value_usd?: number | null; latency_ms: number | null; status: "known" | "unknown" };
};
type Owner = { pid: number; kind: string; acquired_at: string };

export type RegionalRuntimeOptions = {
  directory?: string;
  readCost?: CostReader;
  now?: () => number;
};
export type CostAdmission = {
  observed_cost_usd: number;
  local_cost_usd: number;
  reserved_cost_usd: number;
  projected_cost_usd: number;
};
export type WrapInvokerOptions = {
  onInvocation?: (record: RawInvocation) => void | Promise<void>;
  systemBytes?: number;
  deadlineAt: number;
};

function failure(message: string, status?: number): Error & { status?: number } {
  const error = new Error(message) as Error & { status?: number };
  if (status) error.status = status;
  return error;
}

function initialState(now: number): RuntimeState {
  return {
    version: 1,
    context_bytes: {},
    charges: [],
    cost_explorer: { checked_at: new Date(now).toISOString(), value_usd: null, latency_ms: null, status: "unknown" },
  };
}

function assertState(value: unknown, now: number): RuntimeState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw failure("Regional runtime state is invalid");
  const record = value as Partial<RuntimeState>;
  if (record.version !== 1 || !Array.isArray(record.charges) || !record.context_bytes || typeof record.context_bytes !== "object") throw failure("Regional runtime state is invalid");
  return record as RuntimeState;
}

function reservation(): number {
  return MAX_ITERATIONS * ((MODEL_CONTEXT_UNITS * INPUT_USD_PER_MILLION + OUTPUT_BUDGET_TOKENS * OUTPUT_USD_PER_MILLION) / 1_000_000);
}

function estimate(usage: Record<string, number> | null): number | null {
  if (!usage || !Number.isFinite(usage.inputTokens) || !Number.isFinite(usage.outputTokens) || usage.inputTokens < 0 || usage.outputTokens < 0) return null;
  if (!("cacheReadInputTokens" in usage) || !("cacheWriteInputTokens" in usage)) return null;
  const cacheRead = usage.cacheReadInputTokens;
  const cacheWrite = usage.cacheWriteInputTokens;
  if (!Number.isFinite(cacheRead) || !Number.isFinite(cacheWrite) || cacheRead < 0 || cacheWrite < 0) return null;
  return ((usage.inputTokens + cacheRead + cacheWrite) * INPUT_USD_PER_MILLION + usage.outputTokens * OUTPUT_USD_PER_MILLION) / 1_000_000;
}

function eventError(event: HarnessEvent): Error | undefined {
  for (const value of [event.internalServerException, event.runtimeClientError, event.validationException]) {
    if (value) return failure(value.message ?? "Remote harness error");
  }
}

export class RegionalRuntime {
  private readonly directory: string;
  private readonly statePath: string;
  private readonly lockPath: string;
  private readonly readCost: CostReader;
  private readonly now: () => number;
  private owner: Owner | undefined;
  busy = false;

  constructor(options: RegionalRuntimeOptions = {}) {
    this.directory = options.directory ?? "outputs/regional-runtime";
    this.statePath = join(this.directory, "runtime.json");
    this.lockPath = join(this.directory, "operation.lock");
    this.readCost = options.readCost ?? (async () => { throw failure("Cost Explorer reader is required"); });
    this.now = options.now ?? Date.now;
  }

  async acquire(kind: string): Promise<() => Promise<void>> {
    if (!kind || !/^[a-z][a-z-]{0,63}$/.test(kind)) throw failure("Regional operation kind is invalid");
    if (this.busy) throw failure("A regional cloud operation is already active", 409);
    const state = await this.load();
    if (state.unknown_block) throw failure("A prior remote operation needs explicit reconciliation", 409);
    if (Math.max(state.remote_until ?? 0, state.statement_until ?? 0) > this.now()) throw failure("A prior remote operation remains quarantined", 409);
    await this.claimFile(kind);
    this.busy = true;
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      this.busy = false;
      if (this.owner) await unlink(this.lockPath).catch(() => undefined);
      this.owner = undefined;
    };
  }

  async checkAdmission(): Promise<CostAdmission> {
    const started = this.now();
    const intent = await this.load();
    const priorLocal = intent.charges.reduce((sum, charge) => sum + (charge.estimated_cost_usd ?? charge.reserved_cost_usd), 0) + (intent.cost_explorer_requests ?? 0) * 0.01;
    if (priorLocal + reservation() + 0.01 >= TARGET_USD) throw failure("The local cost ledger cannot reserve another paid call");
    intent.cost_explorer_requests = (intent.cost_explorer_requests ?? 0) + 1;
    await this.save(intent);
    let observed: number;
    try {
      observed = await this.readCost();
    } catch {
      const state = await this.load();
      state.cost_explorer = { checked_at: new Date(this.now()).toISOString(), value_usd: null, latency_ms: this.now() - started, status: "unknown" };
      await this.save(state);
      throw failure("Cost Explorer is unavailable; paid calls are blocked");
    }
    if (!Number.isFinite(observed)) throw failure("Cost Explorer returned an invalid cost");
    const rawObserved = observed;
    observed = Math.max(0, observed);
    const state = await this.load();
    state.cost_explorer = { checked_at: new Date(this.now()).toISOString(), value_usd: observed, raw_value_usd: rawObserved, latency_ms: this.now() - started, status: "known" };
    await this.save(state);
    const local = state.charges.reduce((total, charge) => total + (charge.estimated_cost_usd ?? charge.reserved_cost_usd), 0) + (state.cost_explorer_requests ?? 0) * 0.01;
    const reserved = reservation();
    const projected = observed + local + reserved;
    if (observed >= TARGET_USD || observed + local >= STOP_USD || observed + local >= CAP_USD - RESERVE_USD || projected >= TARGET_USD) {
      throw failure("Regional cost admission rejected the next paid invocation");
    }
    return { observed_cost_usd: observed, local_cost_usd: local, reserved_cost_usd: reserved, projected_cost_usd: projected };
  }

  async admit(): Promise<CostAdmission> { return this.checkAdmission(); }

  async assertAvailable(): Promise<void> {
    const state = await this.load();
    if (state.unknown_block || Math.max(state.remote_until ?? 0, state.statement_until ?? 0) > this.now()) {
      throw failure("A prior remote operation remains quarantined; reconcile or wait for its confirmed timeout", 409);
    }
  }

  async remoteUntil(milliseconds: number, kind: "model" | "statement" = "model"): Promise<void> {
    if (!this.busy) throw failure("Only an active operation can quarantine remote work");
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) throw failure("Remote quarantine duration is invalid");
    const state = await this.load();
    const key = kind === "model" ? "remote_until" : "statement_until";
    state[key] = Math.max(state[key] ?? 0, this.now() + milliseconds);
    await this.save(state);
  }

  async clearRemote(kind: "model" | "statement" = "model"): Promise<void> {
    if (!this.busy) throw failure("Only an active operation can clear a known remote completion");
    const state = await this.load();
    if (kind === "model") delete state.remote_until;
    else delete state.statement_until;
    await this.save(state);
  }

  async blockUnknown(reason: string): Promise<void> {
    if (!this.busy) throw failure("Only an active operation can block an ambiguous remote outcome");
    if (!reason.trim()) throw failure("Unknown remote outcome reason is required");
    const state = await this.load();
    state.unknown_block = { reason, blocked_at: new Date(this.now()).toISOString() };
    await this.save(state);
  }

  async wrapInvoker(invoke: HarnessInvoker, options: WrapInvokerOptions): Promise<HarnessInvoker> {
    if (!Number.isFinite(options.deadlineAt)) throw failure("Invocation deadline is invalid");
    const systemBytes = options.systemBytes ?? 0;
    if (!Number.isInteger(systemBytes) || systemBytes < 0) throw failure("System prompt byte count is invalid");
    return async (input, signal) => {
      await this.assertAvailable();
      if (this.now() >= options.deadlineAt) throw failure("Regional operation deadline elapsed");
      const requestBytes = UTF8.encode(JSON.stringify(input.messages)).byteLength + systemBytes;
      if (requestBytes >= MAX_PROMPT_BYTES) throw failure("Serialized request reaches the 64 KiB limit");
      let state = await this.load();
      const cumulative = (state.context_bytes[input.runtimeSessionId] ?? 0) + requestBytes;
      if (cumulative + HIDDEN_CONTEXT_UNITS + OUTPUT_BUDGET_TOKENS > MODEL_CONTEXT_UNITS) throw failure("Cumulative session context exceeds the conservative model bound");
      await this.checkAdmission();
      signal?.throwIfAborted();
      if (this.now() >= options.deadlineAt) throw failure("Regional operation deadline elapsed before submission");
      state = await this.load();
      const startedAt = new Date(this.now()).toISOString();
      const charge: Charge = { id: crypto.randomUUID(), started_at: startedAt, elapsed_ms: 0, model: "moonshotai.kimi-k2.5", route: "converse_stream", runtime_session_id: input.runtimeSessionId, status: "unknown", usage: null, latency_ms: null, estimated_cost_usd: null, reserved_cost_usd: reservation() };
      const reservedState = await this.load();
      reservedState.context_bytes[input.runtimeSessionId] = cumulative;
      reservedState.charges.push(charge);
      await this.save(reservedState);
      if (signal?.aborted || this.now() >= options.deadlineAt) {
        const notSubmitted = await this.load();
        notSubmitted.charges = notSubmitted.charges.filter(item => item.id !== charge.id);
        await this.save(notSubmitted);
        signal?.throwIfAborted();
        throw failure("Regional operation deadline elapsed before submission");
      }
      let response: Awaited<ReturnType<HarnessInvoker>>;
      try {
        await this.remoteUntil(45_000);
        response = await this.waitFor(invoke(input, signal), signal, options.deadlineAt);
      } catch (error) {
        charge.elapsed_ms = this.now() - Date.parse(startedAt);
        await this.finish(charge, undefined, 0, options.onInvocation);
        throw error;
      }
      return { stream: this.recordStream(response.stream, charge, input.runtimeSessionId, cumulative, options, signal) };
    };
  }

  private async *recordStream(stream: AsyncIterable<HarnessEvent>, charge: Charge, sessionId: string, cumulative: number, options: WrapInvokerOptions, signal?: AbortSignal): AsyncIterable<HarnessEvent> {
    let terminal = false;
    let streamedBytes = 0;
    const iterator = stream[Symbol.asyncIterator]();
    try {
      while (true) {
        const next = await this.waitFor(iterator.next(), signal, options.deadlineAt);
        if (next.done) break;
        const event = next.value;
        const error = eventError(event);
        if (event.metadata?.usage) {
          const usage = event.metadata.usage as Record<string, unknown>;
          const raw = Object.fromEntries(Object.entries(usage).filter(([, value]) => typeof value === "number" && Number.isFinite(value))) as Record<string, number>;
          charge.usage = raw;
          charge.latency_ms = event.metadata.metrics?.latencyMs ?? null;
        }
        if (event.messageStop?.stopReason) terminal = true;
        const delta = event.contentBlockDelta?.delta;
        streamedBytes += UTF8.encode(delta?.text ?? "").byteLength + UTF8.encode(delta?.toolUse?.input ?? "").byteLength;
        if (cumulative + streamedBytes + HIDDEN_CONTEXT_UNITS + OUTPUT_BUDGET_TOKENS > MODEL_CONTEXT_UNITS) throw failure("Cumulative session context exceeds the conservative model bound");
        if (error) {
          charge.status = "failed";
          throw error;
        }
        yield event;
      }
      if (terminal) {
        // Remote completion and billing completeness are separate facts.
        charge.status = "completed";
        charge.estimated_cost_usd = estimate(charge.usage);
      }
    } finally {
      try { void iterator.return?.().catch(() => undefined); } catch {}
      charge.elapsed_ms = Math.max(0, this.now() - Date.parse(charge.started_at));
      await this.finish(charge, sessionId, streamedBytes, options.onInvocation);
    }
  }

  private async finish(charge: Charge, sessionId?: string, streamedBytes = 0, callback?: WrapInvokerOptions["onInvocation"]): Promise<void> {
    const state = await this.load();
    const index = state.charges.findIndex(candidate => candidate.id === charge.id);
    if (index >= 0) state.charges[index] = charge;
    if (sessionId) state.context_bytes[sessionId] = (state.context_bytes[sessionId] ?? 0) + streamedBytes;
    if (charge.status === "completed") delete state.remote_until;
    await this.save(state);
    try { await callback?.({ ...charge }); } catch { /* The persisted ledger remains authoritative. */ }
  }

  private async waitFor<T>(promise: Promise<T>, signal: AbortSignal | undefined, deadlineAt: number): Promise<T> {
    const remaining = deadlineAt - this.now();
    if (remaining <= 0) throw failure("Regional invocation deadline elapsed");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    const stopped = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(failure("Regional invocation deadline elapsed")), remaining);
      abort = () => reject(signal?.reason instanceof Error ? signal.reason : failure("Regional invocation aborted"));
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    });
    try { return await Promise.race([promise, stopped]); }
    finally {
      if (timer) clearTimeout(timer);
      if (abort) signal?.removeEventListener("abort", abort);
    }
  }

  private async claimFile(kind: string): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const owner: Owner = { pid: process.pid, kind, acquired_at: new Date(this.now()).toISOString() };
    try {
      const handle = await open(this.lockPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify(owner)}\n`);
      await handle.close();
      this.owner = owner;
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const existing = await this.readOwner();
    if (existing && this.pidExists(existing.pid)) throw failure("A regional cloud operation is already active", 409);
    await unlink(this.lockPath).catch(() => undefined);
    return this.claimFile(kind);
  }

  private pidExists(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try { process.kill(pid, 0); return true; } catch { return false; }
  }

  private async readOwner(): Promise<Owner | undefined> {
    try {
      const value = JSON.parse(await readFile(this.lockPath, "utf8"));
      if (!value || typeof value !== "object" || typeof value.pid !== "number" || typeof value.kind !== "string") return undefined;
      return value as Owner;
    } catch { return undefined; }
  }

  private async load(): Promise<RuntimeState> {
    try { return assertState(JSON.parse(await readFile(this.statePath, "utf8")), this.now()); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return initialState(this.now());
      throw error;
    }
  }

  private async save(state: RuntimeState): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = `${this.statePath}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.statePath);
  }
}
