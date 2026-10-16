import { describe, expect, test } from "bun:test";
import { initialRecoveryWorkflow, presentTerminalResult, reduceRecoveryWorkflow } from "../public/recovery-workflow.js";

const alert = {
  snapshotHash: "verified-snapshot",
  ratio: 0.58,
  evidence: {
    event_id: "west-018",
    event_name: "Kacey Musgraves",
    venue_name: "Shoreline Amphitheatre",
    city: "Mountain View",
    state: "CA",
    show_date: "2026-10-18",
    tickets_sold_cumulative: 4212,
    tickets_target_cumulative: 7200,
    public_capacity: 22000,
    data_as_of: "2026-09-29T12:00:00Z",
    market_signals: [],
  },
};

describe("Recovery workflow", () => {
  test("presents every non-alert terminal status without revealing a recovery route", () => {
    expect(presentTerminalResult({ status: "error", message: "Sales evidence failed" })).toEqual({ kind: "error", message: "Sales evidence failed" });
    expect(presentTerminalResult({ status: "stale" })).toEqual({ kind: "complete", agentStatus: "STALE EVIDENCE", message: "The sales evidence is too old for a recovery recommendation." });
    expect(presentTerminalResult({ status: "empty" })).toEqual({ kind: "complete", agentStatus: "NO DATA", message: "No sales evidence is available for this recovery check." });
    expect(presentTerminalResult({ status: "healthy" })).toEqual({ kind: "complete", agentStatus: "PORTFOLIO ON TRACK", message: "No shows require a recovery route." });
  });

  test("keeps the case file on the agent until a verified risk identification arrives", () => {
    const initial = initialRecoveryWorkflow();
    const neutralRisk = reduceRecoveryWorkflow(initial, { type: "phase", phase: "risk" });

    expect(neutralRisk.stage).toBe("agent");
    expect(neutralRisk.alert).toBeNull();

    const identified = reduceRecoveryWorkflow(neutralRisk, { type: "risk-identified", alert });
    expect(identified.stage).toBe("at-risk");
    expect(identified.alert).toEqual(alert);
  });

  test("reveals recommendations only after the verified recommendation result", () => {
    const identified = reduceRecoveryWorkflow(initialRecoveryWorkflow(), { type: "risk-identified", alert });
    const waiting = reduceRecoveryWorkflow(identified, { type: "phase", phase: "recommendation" });
    const complete = reduceRecoveryWorkflow(waiting, { type: "recommendations-ready" });

    expect(waiting.stage).toBe("at-risk");
    expect(complete.stage).toBe("recommendations");
  });

  test("resets approval when the selected route changes", () => {
    const ready = reduceRecoveryWorkflow(
      reduceRecoveryWorkflow(initialRecoveryWorkflow(), { type: "risk-identified", alert }),
      { type: "recommendations-ready" },
    );
    const email = reduceRecoveryWorkflow(ready, { type: "route-selected", route: "email" });
    const approved = reduceRecoveryWorkflow(email, { type: "approval-recorded" });
    const social = reduceRecoveryWorkflow(approved, { type: "route-selected", route: "social" });

    expect(email.stage).toBe("review");
    expect(approved.approved).toBe(true);
    expect(social.route).toBe("social");
    expect(social.approved).toBe(false);
  });
});
