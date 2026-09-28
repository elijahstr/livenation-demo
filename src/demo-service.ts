import { selectWestAlert, validateApprovedWestRows, type WestSalesEvidence } from "./west-sales";

export type SalesCheck =
  | { status: "alert"; alert: ReturnType<typeof selectWestAlert> extends infer T ? Exclude<T, undefined> : never; rationale: string; evidence: WestSalesEvidence[]; toolCallCount: number }
  | { status: "healthy" | "empty" | "stale"; evidence?: WestSalesEvidence[] }
  | { status: "error"; evidence?: WestSalesEvidence[]; message: string };

type SalesReader = { read(now?: Date): Promise<WestSalesEvidence[]> };
type HarnessDiagnosis = { text: string; toolCalls: Array<{ name: string }> };
type Harness = { diagnose(input: { prompt: string; evidence: WestSalesEvidence }): Promise<HarnessDiagnosis> };

export class DemoService {
  #lastCheck: Extract<SalesCheck, { status: "alert" }> | undefined;
  constructor(private readonly dependencies: { sales: SalesReader; harness: Harness }) {}
  get lastCheck() { return this.#lastCheck; }

  async salesCheck(now = new Date()): Promise<SalesCheck> {
    this.#lastCheck = undefined;
    let rows: WestSalesEvidence[];
    try { rows = await this.dependencies.sales.read(now); } catch (error) {
      const message = error instanceof Error ? error.message : "Sales evidence failed";
      return message.toLowerCase().includes("stale") ? { status: "stale" } : { status: "error", message };
    }
    if (!rows.length) return { status: "empty", evidence: rows };
    try { validateApprovedWestRows(rows); } catch (error) { return { status: "error", evidence: rows, message: error instanceof Error ? error.message : "Evidence allow-list failed" }; }
    let alert;
    try { alert = selectWestAlert(rows, now); } catch (error) {
      const message = error instanceof Error ? error.message : "Evidence validation failed";
      return { status: message.includes("stale") ? "stale" : "error", ...(message.includes("stale") ? { evidence: rows } : { evidence: rows, message }) } as SalesCheck;
    }
    if (!alert) return { status: "healthy", evidence: rows };
    const prompt = `Use get_sales_evidence for event_id ${alert.evidence.event_id} in region west. Explain one safe synthetic recovery action for ${alert.evidence.venue_name}. Do not state unverified facts.`;
    try {
      const response = await this.dependencies.harness.diagnose({ prompt, evidence: alert.evidence });
      if (!response.toolCalls.some((call) => call.name === "get_sales_evidence")) return { status: "error", evidence: rows, message: "Kimi returned no structured evidence tool call" };
      const result = { status: "alert" as const, alert, rationale: response.text, evidence: rows, toolCallCount: response.toolCalls.length };
      this.#lastCheck = result;
      return result;
    } catch (error) { return { status: "error", evidence: rows, message: error instanceof Error ? error.message : "Kimi diagnosis failed" }; }
  }
}
