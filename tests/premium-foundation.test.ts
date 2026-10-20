import { expect, test } from "bun:test";
import fixture from "../fixtures/premium-harbor-works.json" with { type: "json" };
import { BATCH_ID, BRONZE_NAMES, GOLD_VIEWS, METRIC_VIEW, TABLES, buildBronzeSource, candidateValidationSql, canonicalJson, hash, oracleMetrics, silverCandidateSql, validateFixture } from "../src/premium-foundation";

const validated = validateFixture(fixture);

test("the Harbor Works fixture has the reviewed source and entity counts", () => {
  expect(validated.records).toHaveLength(28);
  expect(validated.accepted).toHaveLength(27);
  expect(validated.rejected).toEqual([{ source_id: "AC-E-BAD", reason: "unknown venue" }]);
  expect(new Set(validated.accepted.map((row) => row.record_type)).size).toBe(17);
  expect(BRONZE_NAMES).toHaveLength(5);
  expect(TABLES).toHaveLength(17);
  expect(validated.accepted.find((row) => row.source_id === "AC-V100")?.payload.venue_name).toBe("Shoreline Amphitheatre");
});

test("the oracle separates money and issued tickets from scan attempts", () => {
  expect(validated.metrics).toEqual({ net_admission_revenue: "300.00", net_parking_revenue: "40.00", valid_admission_tickets: 3, admission_buying_accounts: 1 });
  const changed = structuredClone(validated.accepted);
  changed.push({ ...changed.find((row) => row.source_id === "TM-S1")!, source_id: "TM-S6", payload: { scan_id: "S6", ticket_id: "T1", scan_timestamp: "2026-09-20T01:05:00Z", scan_result: "duplicate" } });
  expect(oracleMetrics(changed)).toEqual(validated.metrics);
  const refunded = structuredClone(validated.accepted);
  refunded.find((row) => row.source_id === "TM-L100")!.payload.refunded_amount = "300.00";
  expect(oracleMetrics(refunded)).toEqual({ net_admission_revenue: "0.00", net_parking_revenue: "40.00", valid_admission_tickets: 0, admission_buying_accounts: 0 });
  const partial = structuredClone(validated.accepted); partial.find((row) => row.source_id === "TM-L100")!.payload.refunded_amount = "100.00"; partial.find((row) => row.source_id === "TM-T3")!.payload.ticket_status = "void";
  expect(oracleMetrics(partial)).toEqual({ net_admission_revenue: "200.00", net_parking_revenue: "40.00", valid_admission_tickets: 2, admission_buying_accounts: 1 });
  const cancelled = structuredClone(validated.accepted); cancelled.find((row) => row.source_id === "TM-O100")!.payload.order_status = "cancelled";
  expect(oracleMetrics(cancelled)).toEqual({ net_admission_revenue: "0.00", net_parking_revenue: "0.00", valid_admission_tickets: 0, admission_buying_accounts: 0 });
  const parkingOnly = structuredClone(validated.accepted); parkingOnly.find((row) => row.source_id === "TM-L100")!.payload.line_status = "cancelled";
  expect(oracleMetrics(parkingOnly)).toEqual({ net_admission_revenue: "0.00", net_parking_revenue: "40.00", valid_admission_tickets: 0, admission_buying_accounts: 0 });
});

test("the validator rejects an unexpected bad relationship and duplicate natural key", () => {
  const unknownVenue = structuredClone(fixture); unknownVenue.records.find((row) => row.source_id === "AC-E100")!.payload.venue_id = "V404";
  const changed = unknownVenue.records.find(row => row.source_id === "AC-E100")!;
  // This case tests relationships after the envelope hash has passed validation.
  changed.payload_sha256 = hash(changed.payload);
  expect(() => validateFixture(unknownVenue)).toThrow("unknown venue");
  const duplicate = structuredClone(fixture); duplicate.records.find((row) => row.source_id === "TM-T2")!.payload.ticket_id = "T1";
  const duplicateTicket = duplicate.records.find(row => row.source_id === "TM-T2")!;
  duplicateTicket.payload_sha256 = hash(duplicateTicket.payload);
  expect(() => validateFixture(duplicate)).toThrow("duplicate natural business key");
  const changedHash = structuredClone(fixture); (changedHash.records[0] as unknown as { payload_sha256: string }).payload_sha256 = "0".repeat(64);
  expect(() => validateFixture(changedHash)).toThrow("changed payload hash");
});

test("the validator rejects changed hashes, late timestamps, and non-existent calendar dates", () => {
  const changed = structuredClone(fixture);
  changed.records.find(row => row.source_id === "TM-L100")!.payload.line_amount = "350.00";
  expect(() => validateFixture(changed)).toThrow("changed payload hash");
  const late = structuredClone(fixture);
  const order = late.records.find(row => row.source_id === "TM-O100")!;
  order.payload.order_timestamp = "2026-10-17T00:00:00Z";
  order.payload_sha256 = hash(order.payload);
  expect(() => validateFixture(late)).toThrow("invalid timestamp or cutoff");
  const invalidDate = structuredClone(fixture);
  const event = invalidDate.records.find(row => row.source_id === "AC-E100")!;
  event.payload.event_date = "2026-02-30";
  event.payload_sha256 = hash(event.payload);
  expect(() => validateFixture(invalidDate)).toThrow("invalid date");
});

test("the Bronze builder binds raw JSON as data", () => {
  const built = buildBronzeSource("ticketmaster_raw", validated);
  expect(built.sql).toContain("from_json(:records");
  expect(built.sql).toContain("payload_json");
  expect(built.parameters).toHaveLength(1);
  expect(built.parameters[0].type).toBe("STRING");
  expect(built.parameters[0].value).toContain("TM-L100");
  expect(() => buildBronzeSource("ticketmaster_raw; DROP TABLE x" as never, validated)).toThrow("allowlisted");
});

test("the generated candidates retain the rejection boundary and typed casts", () => {
  expect(silverCandidateSql("order_items")).toContain("try_cast");
  expect(silverCandidateSql("events")).toContain("source_id <> 'AC-E-BAD'");
  expect(candidateValidationSql()).toContain("record_type = 'events'");
  expect(candidateValidationSql()).toContain("unknown venue");
  expect(() => silverCandidateSql("events; DELETE" )).toThrow("allowlisted");
});

test("the Gold contract excludes finance and uses the metric marker", () => {
  expect(GOLD_VIEWS).toHaveLength(6);
  expect(GOLD_VIEWS.every((view) => !view.definition.includes("event_financials") && !view.definition.includes("artist_deal_terms"))).toBe(true);
  expect(METRIC_VIEW.sql).toContain("WITH METRICS LANGUAGE YAML");
  expect(METRIC_VIEW.definition).toContain("version: 1.1");
  expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  expect(BATCH_ID).toBe("harbor-works-foundation-v1");
});
