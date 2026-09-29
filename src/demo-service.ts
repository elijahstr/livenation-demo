import { selectWestAlert, validateApprovedWestRows, type WestSalesEvidence } from "./west-sales";

export type SalesCheck =
  | { status: "alert"; alert: ReturnType<typeof selectWestAlert> extends infer T ? Exclude<T, undefined> : never; rationale: string; evidence: WestSalesEvidence[]; toolCallCount: number }
  | { status: "healthy" | "empty" | "stale"; evidence?: WestSalesEvidence[] }
  | { status: "error"; evidence?: WestSalesEvidence[]; message: string };

export type SalesCheckProgress =
  | { type: "phase"; phase: "portfolio" | "risk" | "recommendation"; message: string; elapsedMs: number }
  | { type: "tool"; status: "started" | "completed"; toolName: string; message: string; elapsedMs: number }
  | { type: "token"; text: string; elapsedMs: number };

export type SalesCheckOptions = { signal?: AbortSignal; onEvent?: (event: SalesCheckProgress) => void | Promise<void> };
type WithoutElapsed<T> = T extends unknown ? Omit<T, "elapsedMs"> : never;
type SalesReader = { read(now?: Date, signal?: AbortSignal): Promise<WestSalesEvidence[]> };
type HarnessDiagnosis = { text: string; toolCalls: Array<{ name: string }> };
type HarnessProgress = { type: "tool"; status: "started" | "completed"; toolName: string } | { type: "token"; text: string };
type Harness = { diagnose(input: { prompt: string; evidence: WestSalesEvidence; signal?: AbortSignal; onEvent?: (event: HarnessProgress) => void | Promise<void> }): Promise<HarnessDiagnosis> };

export class DemoService {
  #lastCheck: Extract<SalesCheck, { status: "alert" }> | undefined;
  constructor(private readonly dependencies: { sales: SalesReader; harness: Harness }) {}
  get lastCheck() { return this.#lastCheck; }

  async salesCheck(now = new Date(), options: SalesCheckOptions = {}): Promise<SalesCheck> {
    const started = Date.now();
    const emit = (event: WithoutElapsed<SalesCheckProgress>) => options.onEvent?.({ ...event, elapsedMs: Date.now() - started });
    const throwIfAborted = () => options.signal?.throwIfAborted();
    this.#lastCheck = undefined;
    let rows: WestSalesEvidence[];
    await emit({ type: "phase", phase: "portfolio", message: "Reading six West Region shows." });
    try { rows = await this.dependencies.sales.read(now, options.signal); } catch (error) {
      throwIfAborted();
      const message = error instanceof Error ? error.message : "Sales evidence failed";
      return message.toLowerCase().includes("stale") ? { status: "stale" } : { status: "error", message };
    }
    throwIfAborted();
    await emit({ type: "phase", phase: "risk", message: "Evaluating cumulative sales risk." });
    if (!rows.length) return { status: "empty", evidence: rows };
    try { validateApprovedWestRows(rows); } catch (error) { return { status: "error", evidence: rows, message: error instanceof Error ? error.message : "Evidence allow-list failed" }; }
    let alert;
    try { alert = selectWestAlert(rows, now); } catch (error) {
      const message = error instanceof Error ? error.message : "Evidence validation failed";
      return { status: message.includes("stale") ? "stale" : "error", ...(message.includes("stale") ? { evidence: rows } : { evidence: rows, message }) } as SalesCheck;
    }
    if (!alert) return { status: "healthy", evidence: rows };
    const prompt = `Use get_sales_evidence for event_id ${alert.evidence.event_id} in region west. Explain one safe synthetic recovery action for ${alert.evidence.venue_name}. Do not state unverified facts.`;
    await emit({ type: "phase", phase: "recommendation", message: "Requesting a verified recovery recommendation." });
    try {
      const response = await this.dependencies.harness.diagnose({
        prompt,
        evidence: alert.evidence,
        signal: options.signal,
        onEvent: async (event) => {
          if (event.type === "token") return emit({ type: "token", text: event.text });
          return emit({
            type: "tool",
            status: event.status,
            toolName: event.toolName,
            message: event.status === "started" ? "AgentCore requested synthetic sales evidence." : "Synthetic sales evidence verified.",
          });
        },
      });
      throwIfAborted();
      if (!response.toolCalls.some((call) => call.name === "get_sales_evidence")) return { status: "error", evidence: rows, message: "Kimi returned no structured evidence tool call" };
      const result = { status: "alert" as const, alert, rationale: response.text, evidence: rows, toolCallCount: response.toolCalls.length };
      this.#lastCheck = result;
      return result;
    } catch (error) { throwIfAborted(); return { status: "error", evidence: rows, message: error instanceof Error ? error.message : "Kimi diagnosis failed" }; }
  }
}
