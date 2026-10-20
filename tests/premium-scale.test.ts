import { expect, test } from "bun:test";

import { hash, validateFixture } from "../src/premium-foundation";
import {
  FIRST_APPLY_BUNDLES,
  FOUNDATION_RAW,
  MAX_LATER_BUNDLES,
  RECORDS_PER_BUNDLE,
  TARGET_BRONZE,
  TARGET_SILVER,
  TOTAL_BUNDLES,
  cumulativeAccepted,
  cumulativeOracle,
  expectedCounts,
  generateBundle,
  selectNextBundles,
  validateScaleSelection,
} from "../src/premium-scale";
import fixture from "../fixtures/premium-harbor-works.json" with { type: "json" };

test("generates one deterministic valid 36-envelope bundle", () => {
  const first = generateBundle(1);
  expect(first).toEqual(generateBundle(1));
  expect(first).toHaveLength(RECORDS_PER_BUNDLE);
  expect(first.every((row) => row.batch_id === "premium-scale-v1-0001" && row.source_id.startsWith("SC0001-"))).toBe(true);
  expect(first.some((row) => row.record_type === "event_financials" || row.record_type === "artist_deal_terms")).toBe(false);
  expect(() => validateScaleSelection(first)).not.toThrow();
});

test("uses valid local relationships and all required domains", () => {
  const records = generateBundle(2);
  const counts = Object.groupBy(records, (row) => row.source_system);
  expect(counts.salesforce).toHaveLength(8);
  expect(counts.artist_catalog).toHaveLength(6);
  expect(counts.ticketmaster).toHaveLength(20);
  expect(counts.inventory).toHaveLength(2);
  expect(records.filter((row) => row.record_type === "events").map((row) => row.payload.event_date)).toEqual(expect.arrayContaining(["2026-09-12", "2026-11-12"]));
  expect(records.filter((row) => row.record_type === "scans").map((row) => row.payload.scan_result)).toEqual(expect.arrayContaining(["accepted", "rejected"]));
  const items = new Map(records.filter((row) => row.record_type === "order_items").map((row) => [String(row.payload.order_item_id), row.payload.product_family]));
  expect(records.filter((row) => row.record_type === "tickets").every((row) => items.get(String(row.payload.order_item_id)) === "admission")).toBe(true);
});

test("keeps generated source and natural keys disjoint from the foundation", () => {
  const foundation = validateFixture(fixture).accepted;
  expect(() => validateScaleSelection(generateBundle(1), foundation)).not.toThrow();
});

test("rejects changed hashes and duplicate natural keys across the selection", () => {
  const records = [...generateBundle(3), ...generateBundle(4)];
  records[0] = { ...records[0]!, payload_sha256: "0".repeat(64) };
  expect(() => validateScaleSelection(records)).toThrow("hash");
  const second = generateBundle(4);
  const replacement = { ...second[0]!, payload: { ...generateBundle(3)[0]!.payload } };
  replacement.payload_sha256 = hash(replacement.payload);
  const duplicate = [...generateBundle(3), replacement, ...second.slice(1)];
  expect(() => validateScaleSelection(duplicate)).toThrow("natural");
});

test("selects one first bundle, then seven, then the final three without autofill", () => {
  expect(selectNextBundles([])).toEqual([1]);
  expect(selectNextBundles([1])).toEqual([2, 3, 4, 5, 6, 7, 8]);
  expect(selectNextBundles(Array.from({ length: 274 }, (_, index) => index + 1))).toEqual([275, 276, 277]);
  expect(selectNextBundles([1], [2, 3, 4, 5, 6, 7, 8])).toEqual([2, 3, 4, 5, 6, 7, 8]);
  expect(() => selectNextBundles([1], [2, 3])).toThrow("saved selection");
  expect(() => selectNextBundles([1, 3])).toThrow("contiguous");
});

test("derives exact counts and cumulative metrics without changing the foundation fixture", () => {
  const foundation = validateFixture(fixture).accepted;
  expect(expectedCounts(0)).toEqual({ bronze: FOUNDATION_RAW, silver: FOUNDATION_RAW - 1 });
  expect(expectedCounts(TOTAL_BUNDLES)).toEqual({ bronze: TARGET_BRONZE, silver: TARGET_SILVER });
  expect(cumulativeAccepted(foundation, [1, 2])).toHaveLength(27 + 2 * RECORDS_PER_BUNDLE);
  expect(hash(generateBundle(1))).toBe("2ce3b36b727d4e1a8f0aa1b08e5560a29aca2978734c30fff6e1e461d84cd00d");
  expect(cumulativeOracle(foundation, [1])).toEqual({ net_admission_revenue: "490.00", net_parking_revenue: "75.00", valid_admission_tickets: 11, admission_buying_accounts: 2 });
});

test("validates all 277 bundles within the target totals", () => {
  const records = Array.from({ length: TOTAL_BUNDLES }, (_, index) => generateBundle(index + 1)).flat();
  expect(records).toHaveLength(TOTAL_BUNDLES * RECORDS_PER_BUNDLE);
  expect(() => validateScaleSelection(records)).not.toThrow();
  const foundation = validateFixture(fixture).accepted;
  expect(cumulativeOracle(foundation, Array.from({ length: TOTAL_BUNDLES }, (_, index) => index + 1))).toEqual({ net_admission_revenue: "45180.00", net_parking_revenue: "9360.00", valid_admission_tickets: 1899, admission_buying_accounts: 273 });
  expect(FIRST_APPLY_BUNDLES).toBe(1);
  expect(MAX_LATER_BUNDLES).toBe(7);
});
