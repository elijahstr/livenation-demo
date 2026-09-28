import { describe, expect, test } from "bun:test";
import { createWestEvidenceTool, createWestEvidenceResolver } from "../src/agentcore-harness-client";
import type { WestSalesEvidence } from "../src/west-sales";

const evidence: WestSalesEvidence = {
  event_id: "hayden-homes-001", region: "west", venue_name: "Hayden Homes Amphitheater", city: "Bend", state: "OR", public_capacity: 8000,
  event_name: "Cascades After Dark", show_date: "2026-10-15", tickets_sold_cumulative: 550, tickets_target_cumulative: 1000,
  data_as_of: "2026-09-28T11:00:00.000Z", market_signals: ["Synthetic signal"], origin: "synthetic",
};

describe("West Harness tool contract", () => {
  test("creates a schema for exactly the selected West event", () => {
    const tool = createWestEvidenceTool(evidence.event_id);
    expect(tool.config.inlineFunction.inputSchema.properties.event_id.enum).toEqual(["hayden-homes-001"]);
    expect(tool.config.inlineFunction.inputSchema.properties.region.enum).toEqual(["west"]);
  });

  test("resolves only the selected aggregate", () => {
    const resolve = createWestEvidenceResolver(evidence);
    const result = resolve({ event_id: "hayden-homes-001", region: "west" });
    expect(result).toEqual(expect.not.objectContaining({ market_signals: expect.anything(), event_name: expect.anything(), city: expect.anything(), state: expect.anything() }));
    expect(result).toMatchObject({ event_id: "hayden-homes-001", venue_name: "Hayden Homes Amphitheater", tickets_sold_cumulative: 550, tickets_target_cumulative: 1000 });
    expect(() => resolve({ event_id: "other", region: "west" })).toThrow("selected");
  });
});
