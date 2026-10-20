import type { SqlParameter, StatementResult } from "./databricks-statements";

export type ScopeAccount = {
  account_id: string;
  account_name: string;
  venue_id: string;
  state: string;
};
export type RegionalScope = {
  version: string;
  label: string;
  seller_id: string;
  principal_version: string;
  territory_assignment: string;
  accounts: ScopeAccount[];
};
export type DatasetRef = { source_id: string; version: string; definition_hash?: string };
export type SourceFingerprint = { hash: string; dataset_refs: DatasetRef[]; checked_at: string; elapsed_ms: number };
export type EvidenceSection = {
  state: "evidence" | "unavailable" | "error";
  rows: Record<string, unknown>[];
  reason: string | null;
  truncated?: boolean;
};
export type EvidenceRef = {
  evidence_id: string;
  source_ref: string;
  query_id: string;
  unit: string;
  observed_at: string;
};
export type EvidenceEnvelope = {
  scan_id: string;
  account_id: string;
  scope_hash: string;
  source_fingerprint: string;
  dataset_refs: DatasetRef[];
  origin: "synthetic";
  data_as_of: string;
  observed_at: string;
  retrieved_at: string;
  served_at: string;
  status: "complete" | "partial" | "unavailable" | "error";
  consistency: "stable" | "mixed" | "unknown";
  truncated: boolean;
  sections: Record<string, EvidenceSection>;
  evidence: EvidenceRef[];
  error: string | null;
  cache?: "hit" | "miss";
  query_proof?: { statement_id: string; sql: string; question: string; dataset: string; metric: string };
};
export type QueryTrace = {
  kind: string;
  statementId?: string;
  elapsed_ms?: number;
  [key: string]: unknown;
};
export type ReadContext = {
  scanId: string;
  signal?: AbortSignal;
  deadlineAt: number;
  fingerprint?: SourceFingerprint;
  onTrace?: (trace: QueryTrace) => void | Promise<void>;
};
export type RegionalDataPort = {
  fingerprint(context: ReadContext): Promise<SourceFingerprint>;
  summaries(context: ReadContext): Promise<EvidenceEnvelope[]>;
  evidence(accountId: string, sections: string[], context: ReadContext): Promise<EvidenceEnvelope>;
  options(accountId: string, input: Record<string, unknown>, context: ReadContext): Promise<EvidenceEnvelope>;
  analytics(accountId: string, input: Record<string, unknown>, context: ReadContext): Promise<EvidenceEnvelope>;
};
export type ScopedExecute = (sql: string, parameters: SqlParameter[], context: ReadContext) => Promise<StatementResult>;
export type AccountAssessment = {
  account_id: string;
  state: "act" | "ask" | "no-action" | "deferred" | "unavailable";
  reason: string;
  unknowns: string[];
  seller_next_step: string;
  evidence_ids: string[];
};
export type ScanAccount = {
  account: ScopeAccount;
  state: "pending" | "assessed" | "deferred" | "unavailable";
  summary?: EvidenceEnvelope;
  result?: AccountAssessment;
  reason?: string;
};
export type RawInvocation = {
  started_at: string;
  elapsed_ms: number;
  model: string;
  route: string;
  runtime_session_id: string;
  status: "completed" | "failed" | "unknown";
  usage: Record<string, number> | null;
  latency_ms: number | null;
  estimated_cost_usd: number | null;
  reserved_cost_usd: number;
};
export type ScanRecord = {
  id: string;
  scope_hash: string;
  scope_version: string;
  label: string;
  started_at: string;
  deadline_at: string;
  ended_at?: string;
  status: "running" | "complete" | "partial";
  phase: string;
  consistency: "stable" | "mixed" | "unknown";
  fingerprint?: SourceFingerprint;
  accounts: ScanAccount[];
  business_calls: number;
  invocations: RawInvocation[];
  traces: QueryTrace[];
  error?: string;
  coverage: {
    authorized_count: number;
    assessed_count: number;
    deferred_count: number;
    unavailable_count: number;
    unassessed_count: number;
    processing_finished: boolean;
    fully_assessed: boolean;
  };
};
