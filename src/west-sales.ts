import { createHash } from "node:crypto";

export type WestSalesEvidence = {
  event_id: string;
  region: "west";
  venue_name: string;
  city: string;
  state: string;
  public_capacity: number;
  event_name: string;
  show_date: string;
  tickets_sold_cumulative: number;
  tickets_target_cumulative: number;
  data_as_of: string;
  market_signals: string[];
  origin: "synthetic";
};

export type WestSalesAlert = {
  evidence: WestSalesEvidence;
  ratio: number;
  snapshotHash: string;
};
const approvedVenues = new Map([["hayden-homes-001", "Hayden Homes Amphitheater"], ["wiltern-001", "The Wiltern"], ["palladium-001", "Hollywood Palladium"], ["masonic-001", "The Masonic"], ["white-river-001", "White River Amphitheatre"], ["gorge-001", "The Gorge Amphitheatre"]]);
const approvedSignals = new Set(["Synthetic local awareness is below target.", "Synthetic awareness is healthy."]);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Evidence row must be an object");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be non-empty text`);
  return value;
}

function number(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} must be finite`);
  return value;
}

function timestamp(value: unknown, field: string): string {
  const result = text(value, field);
  if (Number.isNaN(Date.parse(result))) throw new Error(`${field} must be an ISO timestamp`);
  return result;
}

function showDate(value: unknown): string {
  const result = text(value, "show_date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00.000Z`))) throw new Error("show_date must use YYYY-MM-DD");
  return result;
}

export function validateWestSalesRow(value: unknown, now = new Date()): WestSalesEvidence {
  const row = object(value);
  const evidence: WestSalesEvidence = {
    event_id: text(row.event_id, "event_id"),
    region: text(row.region, "region") as "west",
    venue_name: text(row.venue_name, "venue_name"),
    city: text(row.city, "city"),
    state: text(row.state, "state"),
    public_capacity: number(row.public_capacity, "public_capacity"),
    event_name: text(row.event_name, "event_name"),
    show_date: showDate(row.show_date),
    tickets_sold_cumulative: number(row.tickets_sold_cumulative, "tickets_sold_cumulative"),
    tickets_target_cumulative: number(row.tickets_target_cumulative, "tickets_target_cumulative"),
    data_as_of: timestamp(row.data_as_of, "data_as_of"),
    market_signals: (() => {
      if (!Array.isArray(row.market_signals) || row.market_signals.length === 0 || row.market_signals.some((signal) => typeof signal !== "string" || !signal.trim())) throw new Error("market_signals must be a non-empty string array");
      return row.market_signals;
    })(),
    origin: text(row.origin, "origin") as "synthetic",
  };
  if (evidence.region !== "west") throw new Error("Evidence region must be west");
  if (evidence.origin !== "synthetic") throw new Error("Evidence origin must be synthetic");
  if (evidence.public_capacity <= 0) throw new Error("public_capacity must be positive");
  if (evidence.tickets_sold_cumulative < 0 || evidence.tickets_target_cumulative <= 0) {
    throw new Error("Sales and target must be positive");
  }
  if (evidence.tickets_sold_cumulative > evidence.public_capacity || evidence.tickets_target_cumulative > evidence.public_capacity) {
    throw new Error("Sales and target must not exceed public capacity");
  }
  if (Date.parse(evidence.data_as_of) < now.getTime() - 7 * 24 * 60 * 60 * 1000) {
    throw new Error("Evidence is stale");
  }
  return evidence;
}

export function validateWestSalesRows(value: unknown, now = new Date(), expectedRows = 6): WestSalesEvidence[] {
  if (!Array.isArray(value)) throw new Error("Evidence rows must be an array");
  if (value.length !== expectedRows) throw new Error(`Expected exactly ${expectedRows} evidence rows`);
  const rows = value.map((row) => validateWestSalesRow(row, now));
  if (new Set(rows.map((row) => row.event_id)).size !== rows.length) throw new Error("Evidence event identifiers must be unique");
  return rows;
}

export function validateApprovedWestRows(rows: WestSalesEvidence[]): WestSalesEvidence[] {
  for (const row of rows) {
    if (approvedVenues.get(row.event_id) !== row.venue_name) throw new Error("Evidence must use an approved venue");
    if (row.market_signals.some((signal) => !approvedSignals.has(signal))) throw new Error("Evidence must use an approved market signal");
  }
  return rows;
}

export function stableSnapshotHash(evidence: WestSalesEvidence): string {
  const canonical = JSON.stringify(Object.fromEntries(Object.entries(evidence).sort(([a], [b]) => a.localeCompare(b))));
  return createHash("sha256").update(canonical).digest("hex");
}

export function selectWestAlert(rows: WestSalesEvidence[], now = new Date()): WestSalesAlert | undefined {
  const valid = rows.map((row) => validateWestSalesRow(row, now));
  const candidates = valid
    .map((evidence) => ({ evidence, ratio: evidence.tickets_sold_cumulative / evidence.tickets_target_cumulative }))
    .filter((candidate) => candidate.ratio < 0.75)
    .sort((left, right) => left.ratio - right.ratio || Date.parse(left.evidence.show_date) - Date.parse(right.evidence.show_date) || left.evidence.event_id.localeCompare(right.evidence.event_id));
  const selected = candidates[0];
  return selected && { ...selected, snapshotHash: stableSnapshotHash(selected.evidence) };
}
