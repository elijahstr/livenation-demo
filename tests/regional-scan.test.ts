import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RegionalScanService } from "../src/regional-scan-service";
import { scopeHash } from "../src/regional-scope";
import type { EvidenceEnvelope, RegionalDataPort, RegionalScope, SourceFingerprint } from "../src/regional-types";

const scope: RegionalScope = {
  version: "v1", label: "Synthetic territory", seller_id: "seller", principal_version: "read-v1",
  territory_assignment: "Explicit demo assignment",
  accounts: [
    { account_id: "A100", account_name: "Harbor Works", venue_id: "V100", state: "CA" },
    { account_id: "A200", account_name: "River Hall", venue_id: "V200", state: "OR" },
  ],
};
const fingerprint: SourceFingerprint = { hash: "source-v1", dataset_refs: [], checked_at: "2026-10-20T00:00:00.000Z", elapsed_ms: 1 };
const envelope = (accountId: string): EvidenceEnvelope => ({
  scan_id: "scan", account_id: accountId, scope_hash: scopeHash(scope), source_fingerprint: fingerprint.hash,
  dataset_refs: [], origin: "synthetic", data_as_of: "2026-10-16T00:00:00.000Z", observed_at: "2026-10-16T00:00:00.000Z",
  retrieved_at: "2026-10-20T00:00:00.000Z", served_at: "2026-10-20T00:00:00.000Z", status: "complete",
  consistency: "stable", truncated: false, sections: {}, evidence: [{ evidence_id: `e-${accountId}`, source_ref: "source", query_id: "q", unit: "count", observed_at: "2026-10-16T00:00:00.000Z" }], error: null,
});
const data = (fingerprints: SourceFingerprint[] = [fingerprint]): RegionalDataPort => ({
  async fingerprint() { return fingerprints.shift() ?? fingerprint; },
  async summaries(context) { return scope.accounts.map((account) => ({ ...envelope(account.account_id), scan_id: context.scanId })); },
  async evidence(accountId, _sections, context) { return { ...envelope(accountId), scan_id: context.scanId }; }, async options(accountId, _input, context) { return { ...envelope(accountId), scan_id: context.scanId }; }, async analytics(accountId, _input, context) { return { ...envelope(accountId), scan_id: context.scanId }; },
});
const assessment = (accountId: string) => ({ account_id: accountId, state: "act" as const, reason: "Fact: synthetic evidence supports a seller review.", unknowns: [], seller_next_step: "Review the account.", evidence_ids: [`e-${accountId}`] });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
};

test("rejects a batch that omits an expected account", async () => {
  const service = new RegionalScanService({ scope, data: data(), directory: await mkdtemp(join(tmpdir(), "regional-scan-")), assessBatch: async ({ batch }) => [assessment(batch[0]!.account.account_id)] });
  await service.start(); await service.waitForIdle();
  const record = await service.get();
  expect(record?.status).toBe("partial");
  expect(record?.accounts.every((account) => account.state === "deferred")).toBe(true);
});

test("marks pending accounts deferred when the deadline leaves no batch time", async () => {
  let time = 0;
  const service = new RegionalScanService({ scope, data: data(), directory: await mkdtemp(join(tmpdir(), "regional-scan-")), now: () => time, beforeStart: async () => { time = 596_000; }, assessBatch: async ({ batch }) => batch.map((account) => assessment(account.account.account_id)) });
  await service.start(); await service.waitForIdle();
  const record = await service.get();
  expect(record?.coverage.deferred_count).toBeGreaterThan(0);
  expect(record?.status).toBe("partial");
});

test("stops publication when a batch fingerprint changes", async () => {
  const changed = { ...fingerprint, hash: "source-v2" };
  const service = new RegionalScanService({ scope, data: data([fingerprint, fingerprint, changed]), directory: await mkdtemp(join(tmpdir(), "regional-scan-")), assessBatch: async ({ batch }) => batch.map((account) => assessment(account.account.account_id)) });
  await service.start(); await service.waitForIdle();
  const record = await service.get();
  expect(record?.consistency).toBe("mixed");
  expect(record?.status).toBe("partial");
  expect(record?.accounts.some((account) => account.state === "assessed")).toBe(false);
});

test("keeps reserved tool calls after a failed batch", async () => {
  const service = new RegionalScanService({ scope, data: data(), directory: await mkdtemp(join(tmpdir(), "regional-scan-")), assessBatch: async ({ reserveTool }) => { await reserveTool(); await reserveTool(); throw new Error("model failed"); } });
  await service.start(); await service.waitForIdle();
  expect((await service.get())?.business_calls).toBe(2);
});

test("an unavailable final source check retains earlier committed assessments as historical", async () => {
  let checks = 0;
  const adapter: RegionalDataPort = { ...data(), async fingerprint() { if (++checks === 3) throw new Error("source check timed out"); return fingerprint; } };
  const service = new RegionalScanService({ scope, data: adapter, directory: await mkdtemp(join(tmpdir(), "regional-scan-")), assessBatch: async ({ batch }) => batch.map(item => assessment(item.account.account_id)) });
  await service.start(); await service.waitForIdle();
  const record = await service.get();
  expect(record?.status).toBe("partial");
  expect(record?.consistency).toBe("unknown");
  expect(record?.coverage.assessed_count).toBe(2);
});

test("finalizes a scan when its initial fingerprint fails", async () => {
  const unavailable: RegionalDataPort = { ...data(), async fingerprint() { throw new Error("fingerprint unavailable"); } };
  const service = new RegionalScanService({ scope, data: unavailable, directory: await mkdtemp(join(tmpdir(), "regional-scan-")), assessBatch: async () => [] });
  await service.start(); await service.waitForIdle();
  const record = await service.get();
  expect(record?.status).toBe("partial");
  expect(record?.coverage.processing_finished).toBe(true);
});

test("denies a resume after the original deadline expires", async () => {
  let time = 0;
  const service = new RegionalScanService({ scope, data: data(), directory: await mkdtemp(join(tmpdir(), "regional-scan-")), now: () => time, assessBatch: async ({ batch }) => batch.map((account) => assessment(account.account.account_id)) });
  const record = await service.start(); await service.waitForIdle();
  time = 700_000;
  await expect(service.resume(record.id)).rejects.toThrow("deadline expired");
});

test("rejects evidence that belongs to another account", async () => {
  const service = new RegionalScanService({ scope, data: data(), directory: await mkdtemp(join(tmpdir(), "regional-scan-")), assessBatch: async ({ batch }) => [assessment(batch[0]!.account.account_id), { ...assessment(batch[1]!.account.account_id), evidence_ids: ["e-A100"] }] });
  await service.start(); await service.waitForIdle();
  const record = await service.get();
  expect(record?.status).toBe("partial");
  expect(record?.accounts.some((account) => account.reason?.includes("evidence"))).toBe(true);
});

test("moves prior deferred accounts before stable roster order without reusing results", async () => {
  const directory = await mkdtemp(join(tmpdir(), "regional-scan-"));
  const first = new RegionalScanService({ scope, data: data(), directory, assessBatch: async ({ batch }) => batch.map((account) => account.account.account_id === "A100" ? { ...assessment("A100"), state: "deferred" as const } : assessment(account.account.account_id)) });
  await first.start(); await first.waitForIdle();
  const seen: string[] = [];
  const second = new RegionalScanService({ scope, data: data(), directory, assessBatch: async ({ batch }) => { seen.push(...batch.map((account) => account.account.account_id)); return batch.map((account) => assessment(account.account.account_id)); } });
  await second.start(); await second.waitForIdle();
  expect(seen[0]).toBe("A100");
});

test("persists observable progress before each slow scan operation", async () => {
  const sourceGate = deferred<void>();
  const summaryGate = deferred<void>();
  const assessmentGate = deferred<void>();
  const publishGate = deferred<void>();
  const sourceStarted = deferred<void>();
  const summaryStarted = deferred<void>();
  const assessmentStarted = deferred<void>();
  const publishStarted = deferred<void>();
  let checks = 0;
  const adapter: RegionalDataPort = {
    ...data(),
    async fingerprint() {
      checks++;
      if (checks === 1) { sourceStarted.resolve(); await sourceGate.promise; }
      if (checks === 2) { publishStarted.resolve(); await publishGate.promise; }
      return fingerprint;
    },
    async summaries(context) {
      summaryStarted.resolve();
      await summaryGate.promise;
      return scope.accounts.map((account) => ({ ...envelope(account.account_id), scan_id: context.scanId }));
    },
  };
  const service = new RegionalScanService({
    scope,
    data: adapter,
    directory: await mkdtemp(join(tmpdir(), "regional-scan-")),
    assessBatch: async ({ batch }) => {
      assessmentStarted.resolve();
      await assessmentGate.promise;
      return batch.map((account) => assessment(account.account.account_id));
    },
  });

  await service.start();
  await sourceStarted.promise;
  expect((await service.get())?.progress).toEqual({ stage: "sources", completed: 0 });
  sourceGate.resolve();

  await summaryStarted.promise;
  expect((await service.get())?.progress).toEqual({ stage: "evidence" });
  summaryGate.resolve();

  await assessmentStarted.promise;
  const duringAssessment = await service.get();
  expect(duringAssessment?.progress).toEqual({ stage: "assessment", account_ids: ["A100", "A200"] });
  expect(duringAssessment?.accounts.every((account) => account.summary)).toBe(true);
  assessmentGate.resolve();

  await publishStarted.promise;
  const duringPublish = await service.get();
  expect(duringPublish?.progress).toEqual({ stage: "verification", completed: 0, account_ids: ["A100", "A200"] });
  expect(duringPublish?.accounts.every((account) => account.state === "pending")).toBe(true);
  publishGate.resolve();

  await service.waitForIdle();
  expect((await service.get())?.progress).toEqual({ stage: "finished" });
});
