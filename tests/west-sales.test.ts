import { describe, expect, test } from "bun:test";

import {
  selectWestAlert,
  validateWestSalesRows,
  type WestSalesEvidence,
} from "../src/west-sales";

const now = new Date("2026-09-28T12:00:00.000Z");

function row(overrides: Partial<WestSalesEvidence> = {}): WestSalesEvidence {
  return {
    event_id: "hayden-homes-001",
    region: "west",
    venue_name: "Hayden Homes Amphitheater",
    city: "Bend",
    state: "OR",
    public_capacity: 8000,
    event_name: "Cascades After Dark",
    show_date: "2026-10-15",
    tickets_sold_cumulative: 550,
    tickets_target_cumulative: 1000,
    data_as_of: "2026-09-28T11:00:00.000Z",
    market_signals: ["Synthetic local awareness is below target."],
    origin: "synthetic",
    ...overrides,
  };
}

describe("West sales evidence", () => {
  test("selects a ratio below 0.75 but not an exact 0.75 ratio", () => {
    const under = row({ tickets_sold_cumulative: 749, tickets_target_cumulative: 1000 });
    const boundary = row({ event_id: "boundary", tickets_sold_cumulative: 750, tickets_target_cumulative: 1000 });

    expect(selectWestAlert([boundary, under], now)?.evidence.event_id).toBe("hayden-homes-001");
  });

  test("orders alert candidates by ratio, show date, then event identifier", () => {
    const later = row({ event_id: "later", tickets_sold_cumulative: 10, tickets_target_cumulative: 100, show_date: "2026-10-16" });
    const earlierB = row({ event_id: "b", tickets_sold_cumulative: 10, tickets_target_cumulative: 100, show_date: "2026-10-15" });
    const earlierA = row({ event_id: "a", tickets_sold_cumulative: 10, tickets_target_cumulative: 100, show_date: "2026-10-15" });

    expect(selectWestAlert([later, earlierB, earlierA], now)?.evidence.event_id).toBe("a");
  });

  test("accepts a row at the seven-day cutoff and rejects an older row", () => {
    expect(() => validateWestSalesRows([row({ data_as_of: "2026-09-21T12:00:00.000Z" })], now, 1)).not.toThrow();
    expect(() => validateWestSalesRows([row({ data_as_of: "2026-09-21T11:59:59.999Z" })], now, 1)).toThrow("stale");
  });

  test("rejects values outside capacity and a non-synthetic origin", () => {
    expect(() => validateWestSalesRows([row({ tickets_sold_cumulative: 8001 })], now, 1)).toThrow("capacity");
    expect(() => validateWestSalesRows([row({ origin: "live" as never })], now, 1)).toThrow("synthetic");
  });

  test("rejects a non-array market signal value", () => {
    expect(() => validateWestSalesRows([row({ market_signals: "Synthetic" as never })], now, 1)).toThrow("market_signals");
  });

  test("rejects empty signals and a non-date show value", () => {
    expect(() => validateWestSalesRows([row({ market_signals: [] })], now, 1)).toThrow("market_signals");
    expect(() => validateWestSalesRows([row({ show_date: "2026-10-15T00:00:00Z" })], now, 1)).toThrow("show_date");
  });
});
