import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { requireAccount, scopeHash } from "./regional-scope";
import type {
  AccountAssessment, EvidenceEnvelope, RawInvocation, ReadContext, RegionalDataPort, RegionalScope, ScanAccount, ScanRecord, SourceFingerprint,
} from "./regional-types";

const SCAN_MS = 600_000;
const CLEANUP_RESERVE_MS = 5_000;
const BATCH_MS = 180_000;
const MAX_CALLS = 120;
const FIRST_BATCH_SIZE = 3;
const MAX_TEXT = 2_000;

export class RegionalScanBusyError extends Error {
  readonly status = 409;
  constructor(message = "A regional scan is active") { super(message); }
}

type AssessArgs = {
  batch: ScanAccount[];
  context: ReadContext;
  toolAllowance: number;
  reserveTool: () => void | Promise<void>;
  registerEvidence: (envelope: EvidenceEnvelope) => void;
  onInvocation: (row: RawInvocation) => Promise<void>;
};

export type RegionalScanServiceOptions = {
  scope: RegionalScope;
  data: RegionalDataPort;
  directory?: string;
  now?: () => number;
  acquire?: () => Promise<() => Promise<void>>;
  beforeStart?: () => Promise<void>;
  assessBatch: (args: AssessArgs) => Promise<AccountAssessment[]>;
};

const clone = <T>(value: T): T => structuredClone(value);
const iso = (time: number) => new Date(time).toISOString();
const validState = new Set<AccountAssessment["state"]>(["act", "ask", "no-action", "deferred", "unavailable"]);

export class RegionalScanService {
  private readonly directory: string;
  private readonly now: () => number;
  private readonly records = new Map<string, ScanRecord>();
  private readonly running = new Map<string, Promise<void>>();
  private loadPromise?: Promise<void>;
  private writes = Promise.resolve();
  private lastFingerprintMs = 0;

  constructor(private readonly options: RegionalScanServiceOptions) {
    this.directory = options.directory ?? "outputs/regional-scans";
    this.now = options.now ?? Date.now;
  }

  async start(): Promise<ScanRecord> {
    await this.load();
    await this.recoverUnfinished();
    if (this.running.size) throw new RegionalScanBusyError();
    let release: () => Promise<void>;
    try { release = await this.options.acquire?.() ?? (async () => {}); }
    catch (error) { throw new RegionalScanBusyError(error instanceof Error ? error.message : undefined); }
    const started = this.now();
    const record: ScanRecord = {
      id: crypto.randomUUID(), scope_hash: scopeHash(this.options.scope), scope_version: this.options.scope.version,
      label: this.options.scope.label, started_at: iso(started), deadline_at: iso(started + SCAN_MS),
      status: "running", phase: "starting", consistency: "unknown",
      accounts: this.options.scope.accounts.map((account) => ({ account: clone(account), state: "pending" })),
      business_calls: 0, invocations: [], traces: [],
      coverage: { authorized_count: this.options.scope.accounts.length, assessed_count: 0, deferred_count: 0, unavailable_count: 0, unassessed_count: this.options.scope.accounts.length, processing_finished: false, fully_assessed: false },
    };
    this.records.set(record.id, record);
    this.running.set(record.id, Promise.resolve());
    try { await this.persist(record); }
    catch (error) { this.records.delete(record.id); this.running.delete(record.id); await release(); throw error; }
    const completion = this.run(record, release).catch(async (error) => {
      record.error = error instanceof Error ? error.message : "Regional scan failed";
      this.deferPending(record, record.error);
      this.finish(record);
      await this.persist(record);
    });
    this.running.set(record.id, completion);
    void completion.finally(() => this.running.delete(record.id));
    return clone(record);
  }

  async resume(id: string): Promise<ScanRecord> {
    await this.load();
    await this.recoverUnfinished();
    if (this.running.size) throw new RegionalScanBusyError();
    const record = this.records.get(id);
    if (!record || record.scope_hash !== scopeHash(this.options.scope)) throw new RegionalScanBusyError("This scan cannot resume");
    if (this.now() >= Date.parse(record.deadline_at)) throw new RegionalScanBusyError("This scan deadline expired; start a new scan");
    if (Date.parse(record.deadline_at) - this.now() <= BATCH_MS + (record.fingerprint?.elapsed_ms ?? 0) + 10_000) throw new RegionalScanBusyError("Too little time remains for a verified batch; start a new scan");
    if (record.error !== "The prior process ended before this batch completed.") throw new RegionalScanBusyError("This scan cannot resume");
    let release: () => Promise<void>;
    try { release = await this.options.acquire?.() ?? (async () => {}); }
    catch (error) { throw new RegionalScanBusyError(error instanceof Error ? error.message : undefined); }
    for (const account of record.accounts) if (account.state === "deferred" && account.reason === record.error) account.state = "pending";
    record.status = "running"; record.phase = "resuming"; record.ended_at = undefined;
    this.running.set(record.id, Promise.resolve());
    try { await this.persist(record); }
    catch (error) { this.running.delete(record.id); await release(); throw error; }
    const priorFingerprint = record.fingerprint?.hash;
    const completion = this.run(record, release, priorFingerprint).catch(async (error) => {
      record.error = error instanceof Error ? error.message : "Regional scan failed";
      this.deferPending(record, record.error); this.finish(record); await this.persist(record);
    });
    this.running.set(record.id, completion);
    void completion.finally(() => this.running.delete(record.id));
    return clone(record);
  }

  async get(id?: string): Promise<ScanRecord | null> {
    await this.load();
    await this.recoverUnfinished();
    const record = id ? this.records.get(id) : [...this.records.values()].sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
    return record ? clone(record) : null;
  }

  async detail(accountId: string, scanId?: string): Promise<ScanAccount | null> {
    requireAccount(this.options.scope, accountId);
    const record = await this.get(scanId);
    const account = record?.accounts.find((item) => item.account.account_id === accountId);
    return account ? clone(account) : null;
  }

  async waitForIdle(): Promise<void> {
    await Promise.all([...this.running.values()]);
  }

  private async run(record: ScanRecord, release: () => Promise<void>, expectedFingerprintHash?: string): Promise<void> {
    const scanController = new AbortController();
    const scanDeadline = Date.parse(record.deadline_at);
    const scanTimer = setTimeout(() => scanController.abort(), Math.max(0, scanDeadline - this.now()));
    try {
      await this.options.beforeStart?.();
      const fingerprint = await this.fingerprint(record, "start", scanController.signal, scanDeadline);
      if (!fingerprint) { this.finish(record); await this.persist(record); return; }
      if (expectedFingerprintHash && expectedFingerprintHash !== fingerprint.hash) {
        this.markMixed(record, "Source changed before the scan resumed; start a new scan."); this.finish(record); await this.persist(record); return;
      }
      record.fingerprint = fingerprint;
      record.consistency = "stable";
      record.phase = "loading-summary";
      await this.persist(record);
      let summaries: EvidenceEnvelope[];
      try { summaries = await this.options.data.summaries(this.context(record, scanController.signal, scanDeadline)); }
      catch (error) {
        const reason = error instanceof Error ? error.message : "Summary evidence is unavailable";
        for (const account of record.accounts) { account.state = "unavailable"; account.reason = reason; }
        this.finish(record); await this.persist(record); return;
      }
      this.applySummaries(record, summaries);
      this.prioritize(record);
      await this.persist(record);
      while (record.accounts.some((account) => account.state === "pending")) {
        if (!this.canStartBatch(record)) { this.deferPending(record, "The scan deadline reserved time for source verification."); break; }
        const batch = record.accounts.filter((account) => account.state === "pending").slice(0, FIRST_BATCH_SIZE);
        if (!batch.length) break;
        await this.assess(record, batch, scanController.signal, scanDeadline);
        if (record.consistency !== "stable") break;
      }
      if (record.consistency === "stable") {
        const check = await this.fingerprint(record, "end", scanController.signal, scanDeadline);
        if (check && !this.sameFingerprint(record.fingerprint!, check)) this.markMixed(record);
      }
      this.finish(record);
      await this.persist(record);
    } finally { clearTimeout(scanTimer); await release(); }
  }

  private context(record: ScanRecord, signal?: AbortSignal, deadlineAt = Date.parse(record.deadline_at)): ReadContext {
    return {
      scanId: record.id, signal, deadlineAt, fingerprint: record.fingerprint,
      onTrace: async (trace) => { record.traces.push(clone(trace)); await this.persist(record); },
    };
  }

  private async fingerprint(record: ScanRecord, phase: string, signal?: AbortSignal, deadlineAt?: number): Promise<SourceFingerprint | null> {
    const started = this.now();
    record.phase = `fingerprint:${phase}`;
    try {
      const value = await this.options.data.fingerprint(this.context(record, signal, deadlineAt));
      this.lastFingerprintMs = Math.max(this.lastFingerprintMs, value.elapsed_ms, this.now() - started);
      record.traces.push({ kind: "fingerprint", phase, elapsed_ms: this.now() - started, hash: value.hash });
      await this.persist(record);
      return value;
    } catch (error) {
      record.traces.push({ kind: "fingerprint", phase, elapsed_ms: this.now() - started, error: error instanceof Error ? error.message : "failed" });
      if (phase === "start") this.deferPending(record, "Source verification is unavailable.");
      else {
        record.consistency = "unknown";
        record.error = "Source verification is unavailable. Earlier committed assessments remain historical evidence.";
        this.deferPending(record, record.error);
      }
      await this.persist(record);
      return null;
    }
  }

  private applySummaries(record: ScanRecord, summaries: EvidenceEnvelope[]) {
    const byAccount = new Map<string, EvidenceEnvelope>();
    for (const summary of summaries) {
      if (summary.scan_id !== record.id || summary.scope_hash !== record.scope_hash || summary.source_fingerprint !== record.fingerprint?.hash) continue;
      if (!record.accounts.some((account) => account.account.account_id === summary.account_id)) continue;
      if (byAccount.has(summary.account_id)) throw new Error("Summary query returned duplicate account evidence");
      byAccount.set(summary.account_id, clone(summary));
    }
    for (const account of record.accounts) {
      const summary = byAccount.get(account.account.account_id);
      if (summary) account.summary = summary;
      else { account.state = "unavailable"; account.reason = "Summary evidence is unavailable for this authorized account."; }
    }
  }

  private async assess(record: ScanRecord, batch: ScanAccount[], scanSignal: AbortSignal, scanDeadline: number) {
    record.phase = `assessing:${batch.map((account) => account.account.account_id).join(",")}`;
    const remainingBatches = Math.ceil(record.accounts.filter((account) => account.state === "pending").length / FIRST_BATCH_SIZE);
    const allowance = Math.min(12, Math.floor((MAX_CALLS - record.business_calls) / Math.max(1, remainingBatches)));
    let reserved = 0;
    const evidence = new Map<string, Set<string>>();
    for (const account of batch) if (account.summary && this.citable(account.summary)) evidence.set(account.summary.account_id, new Set(account.summary.evidence.map((item) => item.evidence_id)));
    const registerEvidence = (envelope: EvidenceEnvelope) => {
      if (envelope.scan_id !== record.id || envelope.scope_hash !== record.scope_hash || envelope.source_fingerprint !== record.fingerprint?.hash) throw new Error("Evidence does not match this scan");
      if (!batch.some((account) => account.account.account_id === envelope.account_id)) throw new Error("Evidence does not match this batch");
      if (!this.citable(envelope)) return;
      const ids = evidence.get(envelope.account_id) ?? new Set<string>();
      for (const item of envelope.evidence) ids.add(item.evidence_id);
      evidence.set(envelope.account_id, ids);
    };
    const postCheckReserve = Math.max(this.lastFingerprintMs, 1) + CLEANUP_RESERVE_MS;
    const batchDeadline = Math.min(scanDeadline - postCheckReserve - CLEANUP_RESERVE_MS, this.now() + BATCH_MS);
    const batchController = new AbortController();
    const abort = () => batchController.abort();
    if (scanSignal.aborted) abort(); else scanSignal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, Math.max(0, batchDeadline - this.now()));
    const workController = new AbortController();
    const abortWork = () => workController.abort();
    batchController.signal.addEventListener("abort", abortWork, { once: true });
    const workTimer = setTimeout(abortWork, Math.max(0, batchDeadline - postCheckReserve - this.now()));
    try {
      const results = await this.options.assessBatch({
        batch: clone(batch), context: this.context(record, workController.signal, batchDeadline - postCheckReserve), toolAllowance: allowance,
        reserveTool: async () => {
          if (reserved >= allowance || record.business_calls >= MAX_CALLS) throw new Error("Business call budget exhausted");
          reserved++; record.business_calls++; await this.persist(record);
        },
        registerEvidence,
        onInvocation: async (row) => { record.invocations.push(clone(row)); await this.persist(record); },
      });
      this.validateBatch(record, batch, results, evidence);
      const check = await this.fingerprint(record, "batch-publish", batchController.signal, batchDeadline);
      if (!check) return;
      if (!record.fingerprint || !this.sameFingerprint(record.fingerprint, check)) { this.markMixed(record); return; }
      for (const result of results) {
        const account = batch.find((item) => item.account.account_id === result.account_id)!;
        account.result = clone(result);
        account.reason = result.reason;
        account.state = result.state === "deferred" ? "deferred" : result.state === "unavailable" ? "unavailable" : "assessed";
      }
      record.phase = "batch-committed";
      await this.persist(record);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The batch result is unavailable.";
      for (const account of batch) { account.state = "deferred"; account.reason = reason; }
      record.phase = "batch-deferred";
      await this.persist(record);
    } finally {
      clearTimeout(timer); clearTimeout(workTimer);
      batchController.signal.removeEventListener("abort", abortWork);
      scanSignal.removeEventListener("abort", abort);
    }
  }

  private validateBatch(record: ScanRecord, batch: ScanAccount[], results: AccountAssessment[], evidence: Map<string, Set<string>>) {
    if (results.length !== batch.length) throw new Error("Batch result omitted or added an account");
    const expected = new Set(batch.map((account) => account.account.account_id)); const found = new Set<string>();
    for (const result of results) {
      if (!expected.has(result.account_id) || found.has(result.account_id)) throw new Error("Batch result has an unauthorized or duplicate account");
      found.add(result.account_id);
      if (!validState.has(result.state) || !this.bounded(result.reason, MAX_TEXT) || !this.bounded(result.seller_next_step, MAX_TEXT) || !Array.isArray(result.unknowns) || result.unknowns.length > 20 || result.unknowns.some((value) => !this.bounded(value, MAX_TEXT)) || !Array.isArray(result.evidence_ids) || result.evidence_ids.length > 50) throw new Error("Batch result has invalid fields");
      const available = evidence.get(result.account_id) ?? new Set<string>();
      if (result.evidence_ids.some((id) => !available.has(id))) throw new Error("Batch result cites evidence from another account");
      if (["act", "ask", "no-action"].includes(result.state) && (!result.evidence_ids.length || !result.seller_next_step.trim())) throw new Error("Assessment requires evidence and a seller next step");
    }
  }

  private canStartBatch(record: ScanRecord) {
    const remaining = Date.parse(record.deadline_at) - this.now();
    const fingerprint = Math.max(this.lastFingerprintMs, 1);
    return remaining > BATCH_MS + fingerprint + (CLEANUP_RESERVE_MS * 2);
  }

  private sameFingerprint(left: SourceFingerprint, right: SourceFingerprint) { return left.hash === right.hash; }
  private bounded(value: unknown, max: number): value is string { return typeof value === "string" && value.length <= max; }
  private citable(envelope: EvidenceEnvelope) { return ["complete", "partial"].includes(envelope.status) && envelope.consistency === "stable" && !envelope.error; }

  private markMixed(record: ScanRecord, reason = "Source changed during the scan.") {
    record.consistency = "mixed"; record.status = "partial"; record.error = reason;
    for (const account of record.accounts) {
      if (account.state === "assessed") { account.state = "deferred"; account.reason = reason; }
    }
    this.deferPending(record, reason);
  }

  private deferPending(record: ScanRecord, reason: string) {
    for (const account of record.accounts) if (account.state === "pending") { account.state = "deferred"; account.reason = reason; }
  }

  private finish(record: ScanRecord) {
    this.updateCoverage(record, true);
    record.status = record.coverage.fully_assessed ? "complete" : "partial";
    record.phase = "finished"; record.ended_at = iso(this.now());
  }

  private updateCoverage(record: ScanRecord, finished: boolean) {
    const accounts = record.accounts;
    const assessed = accounts.filter((account) => account.state === "assessed").length;
    const deferred = accounts.filter((account) => account.state === "deferred").length;
    const unavailable = accounts.filter((account) => account.state === "unavailable").length;
    const unassessed = accounts.filter((account) => account.state === "pending").length;
    record.coverage = { authorized_count: accounts.length, assessed_count: assessed, deferred_count: deferred, unavailable_count: unavailable, unassessed_count: unassessed, processing_finished: finished, fully_assessed: finished && unassessed === 0 && deferred === 0 && unavailable === 0 && record.consistency === "stable" };
  }

  private prioritize(record: ScanRecord) {
    const prior = [...this.records.values()].filter((item) => item.id !== record.id && item.scope_hash === record.scope_hash && item.fingerprint?.hash === record.fingerprint?.hash).sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
    if (!prior) return;
    const priority = new Set(prior.accounts.filter((account) => account.state === "deferred" || account.state === "unavailable").map((account) => account.account.account_id));
    record.accounts.sort((left, right) => Number(priority.has(right.account.account_id)) - Number(priority.has(left.account.account_id)));
  }

  private async load() {
    if (!this.loadPromise) this.loadPromise = (async () => {
      await mkdir(this.directory, { recursive: true });
      for (const file of await readdir(this.directory)) if (file.endsWith(".json")) {
        try { const record = JSON.parse(await readFile(join(this.directory, file), "utf8")) as ScanRecord; if (this.validLoadedRecord(record)) this.records.set(record.id, record); } catch { /* Ignore malformed local audit files. */ }
      }
    })();
    return this.loadPromise;
  }

  private validLoadedRecord(record: ScanRecord): boolean {
    if (!record?.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.id) || record.scope_hash !== scopeHash(this.options.scope) || !Array.isArray(record.accounts)) return false;
    const expected = new Set(this.options.scope.accounts.map((account) => account.account_id));
    return record.accounts.length === expected.size && record.accounts.every((account) => expected.delete(account.account.account_id)) && expected.size === 0;
  }

  private async recoverUnfinished() {
    for (const record of this.records.values()) if (record.status === "running") {
      if (this.running.has(record.id)) continue;
      this.deferPending(record, "The prior process ended before this batch completed.");
      record.consistency = "unknown";
      record.status = "partial";
      this.finish(record); await this.persist(record);
    }
  }

  private async persist(record: ScanRecord) {
    this.updateCoverage(record, record.status !== "running");
    this.writes = this.writes.catch(() => undefined).then(async () => {
      await mkdir(this.directory, { recursive: true });
      const target = join(this.directory, `${record.id}.json`); const temporary = `${target}.tmp`;
      await writeFile(temporary, JSON.stringify(record)); await rename(temporary, target);
    });
    await this.writes;
  }
}
