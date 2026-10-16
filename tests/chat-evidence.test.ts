import { describe, expect, test } from "bun:test";

import { createChatEvidenceResolver, createChatEvidenceTool } from "../src/chat-evidence";
import type { WestSalesEvidence } from "../src/west-sales";

const now = new Date("2026-10-16T12:00:00.000Z");

function row(event_id: string, venue_name: string): WestSalesEvidence {
  return {
    event_id, region: "west", venue_name, city: "City", state: "OR", public_capacity: 1000,
    event_name: "Synthetic Event", show_date: "2026-10-20", tickets_sold_cumulative: 500,
    tickets_target_cumulative: 800, data_as_of: "2026-10-16T11:00:00.000Z",
    market_signals: ["Synthetic awareness is healthy."], origin: "synthetic",
  };
}

const rows = [
  row("hayden-homes-001", "Hayden Homes Amphitheater"), row("wiltern-001", "The Wiltern"),
  row("palladium-001", "Hollywood Palladium"), row("masonic-001", "The Masonic"),
  row("white-river-001", "White River Amphitheatre"), row("gorge-001", "The Gorge Amphitheatre"),
];

describe("chat evidence", () => {
  test("defines an event-only inline tool", () => {
    expect(createChatEvidenceTool()).toEqual({
      type: "inline_function", name: "get_sales_evidence",
      config: { inlineFunction: {
        description: expect.any(String),
        inputSchema: { type: "object", additionalProperties: false, properties: { event_id: { type: "string", enum: rows.map((item) => item.event_id) } } },
      } },
    });
  });

  test("reads and validates evidence once per turn", async () => {
    let reads = 0;
    const resolve = createChatEvidenceResolver(async () => { reads += 1; return rows; }, now);
    expect(await resolve({ event_id: "wiltern-001" })).toEqual([rows[1]]);
    expect(await resolve({})).toEqual(rows);
    expect(reads).toBe(1);
  });

  test("rejects unapproved input before a data read", async () => {
    let reads = 0;
    const resolve = createChatEvidenceResolver(async () => { reads += 1; return rows; }, now);
    await expect(resolve({ region: "west" })).rejects.toThrow("event_id");
    await expect(resolve({ event_id: "not-approved" })).rejects.toThrow("approved");
    expect(reads).toBe(0);
  });
});
