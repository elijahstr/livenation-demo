import { describe, expect, test } from "bun:test";

import { assertExpectedTools, assertPremiumData, assertSuccessfulToolEvidence, paidTurnCount } from "../scripts/verify-premium-tools";
import proof from "./fixtures/premium-fixed-tools-proof.json" with { type: "json" };

const metadata = { origin: "synthetic", data_as_of: "2026-10-16T12:00:00Z" };
const attention = { ...metadata, rows: { attention: [{ account_id: "A100", contract_id: "CT100" }] } };
const brief = { ...metadata, rows: {
  attention: [{ account_id: "A100", contract_id: "CT100" }],
  artist_evidence: [{ account_id: "A100", artist_id: "AR100", purchased_admission_tickets: 3, accepted_ticket_uses: 3 }],
} };
const options = { ...metadata, rows: { options: [{ account_id: "A100", event_id: "E200", product_id: "premier-parking", available_quantity: 12, unit_price: 40 }] } };
const analytics = { ...metadata, queryItems: [{
  ready: true, statementState: "SUCCEEDED", totalRowCount: 1,
  columns: ["net_admission_revenue", "net_parking_revenue", "valid_admission_tickets", "admission_buying_accounts"],
  rows: [["300.00", "40.00", "3", "1"]],
}] };

describe("premium verifier assertions", () => {
  test("accepts the exact Harbor Works evidence contract", () => {
    expect(() => assertPremiumData(attention, brief, options, analytics)).not.toThrow();
  });

  test("accepts the minimum shape from the live fixed-tool proof", () => {
    expect(() => assertPremiumData(proof.attention, proof.brief, proof.options, proof.analytics)).not.toThrow();
  });

  test("rejects wrong analytics metrics", () => {
    expect(() => assertPremiumData(attention, brief, options, { ...analytics, queryItems: [{ ...analytics.queryItems[0], rows: [["0", "40.00", "3", "1"]] }] })).toThrow("300, 40, 3, 1");
  });

  test("rejects grouped, incomplete, or missing-origin analytics evidence", () => {
    expect(() => assertPremiumData(attention, brief, options, { ...analytics, queryItems: [{ ...analytics.queryItems[0], totalRowCount: 2, rows: [["300", "40", "3", "1"], ["300", "40", "3", "1"]] }] })).toThrow("300, 40, 3, 1");
    expect(() => assertPremiumData(attention, brief, options, { ...analytics, data_as_of: undefined })).toThrow("origin or data_as_of");
  });

  test("counts a failed paid turn against the cross-run cap", () => {
    expect(paidTurnCount([{ paidAgentcoreTurns: 1 }, { paidAgentcoreTurns: 2 } ] as any)).toBe(3);
    expect(() => paidTurnCount([{ paidAgentcoreTurns: 4 }] as any)).toThrow("invalid paid turn count");
  });

  test("rejects a turn that omits one required premium tool", () => {
    expect(() => assertExpectedTools(["get_account_brief", "find_options"], ["get_account_brief"])).toThrow("find_options");
  });

  test("accepts a turn that calls both fixed premium tools", () => {
    expect(() => assertExpectedTools(["get_account_brief", "find_options"], ["get_account_brief", "find_options"])).not.toThrow();
  });

  test("does not accept a tool name when the result is an input error", () => {
    expect(() => assertSuccessfulToolEvidence("get_account_brief", [{ tool_name: "get_account_brief", result: { status: "error" } }])).toThrow("successful get_account_brief evidence");
  });
});
