import { HarnessToolInputError, type HarnessToolHandlers } from "./harness-tool-cycle";
import { requireAccount, scopeHash } from "./regional-scope";
import type { EvidenceEnvelope, ReadContext, RegionalDataPort, RegionalScope } from "./regional-types";

export const REGIONAL_TOOL_NAMES = ["get_account_evidence", "find_options", "ask_analytics"] as const;
export const EVIDENCE_SECTIONS = ["activity", "contract", "purchases", "benefits"] as const;
const metrics = ["activity_count", "latest_activity_at", "net_amount", "issued_ticket_count", "included_quantity", "purchased_line_count", "accepted_ticket_uses"];

export function regionalToolDefinitions(accountIds: string[]) {
  const account = { type: "string", enum: accountIds };
  const inline = (name: string, description: string, properties: Record<string, unknown>, required: string[]) => ({
    type: "inline_function", name,
    config: { inlineFunction: { description, inputSchema: { type: "object", additionalProperties: false, properties: { account_id: account, ...properties }, required: ["account_id", ...required] } } },
  });
  return [
    inline("get_account_evidence", "Read dated synthetic evidence for one assigned account. Missing activity body and direction remain unknown.", {
      sections: { type: "array", minItems: 1, maxItems: 4, uniqueItems: true, items: { type: "string", enum: EVIDENCE_SECTIONS } },
    }, ["sections"]),
    inline("find_options", "Read historical option snapshots for this account's authorized event scope. No eligibility or inventory hold is confirmed.", {
      event_id: { type: "string", maxLength: 128 }, product_id: { type: "string", maxLength: 128 },
      page_size: { type: "integer", minimum: 1, maximum: 50 },
      constraints: { type: "object", additionalProperties: false, properties: {
        quantity: { type: "integer", minimum: 1, maximum: 100 },
        max_unit_price: { type: "number", minimum: 0 },
      } },
    }, []),
    inline("ask_analytics", "Investigate this account with a reviewed SQL template. Match metric and group to the dataset. Attendance is historical accepted use, not net paid demand.", {
      question: { type: "string", minLength: 1, maxLength: 2000 },
      dataset: { type: "string", enum: ["activity", "purchases", "benefits", "attendance"] },
      metric: { type: "string", enum: metrics },
      aggregation: { type: "string", enum: ["count", "sum", "latest"] },
      group_by: { type: "string", enum: ["none", "event_id", "product_id", "activity_type", "artist_id"] },
      filters: { type: "object", additionalProperties: false, properties: {
        date_from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        date_to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        event_id: { type: "string", maxLength: 128 }, product_id: { type: "string", maxLength: 128 },
      } },
    }, ["question", "dataset", "metric", "aggregation", "group_by"]),
  ];
}

/** Only complete fixed evidence belongs in this cache. It expires with its scan. */
export class RegionalEvidenceCache {
  private readonly completed = new Map<string, EvidenceEnvelope>();
  private readonly pending = new Map<string, Promise<EvidenceEnvelope>>();
  private readonly accountEntries = new Map<string, number>();
  private bytes = 0;
  constructor(private readonly maxEntries: number, private readonly expiresAt: number) {}

  async read(key: string, context: ReadContext, load: () => Promise<EvidenceEnvelope>, verify: () => Promise<void>) {
    if (Date.now() >= this.expiresAt || Date.now() >= context.deadlineAt) throw new Error("Evidence deadline expired");
    context.signal?.throwIfAborted();
    const hit = this.completed.get(key);
    if (hit) {
      await verify();
      return { ...structuredClone(hit), served_at: new Date().toISOString(), cache: "hit" as const };
    }
    const existing = this.pending.get(key);
    if (existing) {
      const result = await existing;
      await verify();
      return { ...structuredClone(result), served_at: new Date().toISOString(), cache: "hit" as const };
    }
    const request = load();
    this.pending.set(key, request);
    try {
      const result = await request;
      const bytes = Buffer.byteLength(JSON.stringify(result));
      if (result.status === "complete" && result.consistency === "stable" && !result.truncated && !result.error &&
        this.completed.size < this.maxEntries && (this.accountEntries.get(result.account_id) ?? 0) < 2 && this.bytes + bytes <= 1024 * 1024) {
        this.completed.set(key, structuredClone(result));
        this.accountEntries.set(result.account_id, (this.accountEntries.get(result.account_id) ?? 0) + 1);
        this.bytes += bytes;
      }
      return { ...result, cache: "miss" as const };
    } finally { this.pending.delete(key); }
  }
}

function inputObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HarnessToolInputError("Use the tool input schema.");
  return input as Record<string, unknown>;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]));
  return value;
}

export function createRegionalTools(options: {
  scope: RegionalScope;
  accountIds: string[];
  data: RegionalDataPort;
  context: ReadContext;
  authorize: () => Promise<void>;
  reserveTool: () => void | Promise<void>;
  registerEvidence: (evidence: EvidenceEnvelope) => void;
  cache?: RegionalEvidenceCache;
}): HarnessToolHandlers {
  const assigned = new Set(options.accountIds);
  const hash = scopeHash(options.scope);
  const run = (name: typeof REGIONAL_TOOL_NAMES[number]) => async (raw: unknown) => {
    await options.reserveTool();
    await options.authorize();
    options.context.signal?.throwIfAborted();
    const input = inputObject(raw);
    const account = requireAccount(options.scope, input.account_id);
    if (!assigned.has(account.account_id)) throw new HarnessToolInputError("This tool can read only the assigned account.");
    const allowed = name === "get_account_evidence" ? ["account_id", "sections"]
      : name === "find_options" ? ["account_id", "event_id", "product_id", "page_size", "constraints"]
      : ["account_id", "question", "dataset", "metric", "aggregation", "group_by", "filters"];
    if (Object.keys(input).some(key => !allowed.includes(key))) throw new HarnessToolInputError("Use only the documented tool fields.");
    if (name === "get_account_evidence" && (!Array.isArray(input.sections) || !input.sections.length || input.sections.length > 4 ||
      new Set(input.sections).size !== input.sections.length || input.sections.some(section => !EVIDENCE_SECTIONS.includes(section)))) {
      throw new HarnessToolInputError("Choose activity, contract, purchases, or benefits.");
    }
    const load = async (): Promise<EvidenceEnvelope> => {
      try {
        return await (name === "get_account_evidence"
          ? options.data.evidence(account.account_id, input.sections as string[], options.context)
          : name === "find_options"
            ? options.data.options(account.account_id, input, options.context)
            : options.data.analytics(account.account_id, input, options.context));
      } catch (cause) {
        options.context.signal?.throwIfAborted();
        const message = cause instanceof Error ? cause.message : "";
        if (/unknown outcome|outcome is unknown|do not retry|scope|unauthorized/i.test(message)) throw cause;
        if (cause instanceof HarnessToolInputError) throw cause;
        const at = new Date().toISOString();
        return {
          scan_id: options.context.scanId, account_id: account.account_id, scope_hash: hash,
          source_fingerprint: options.context.fingerprint?.hash ?? "unknown",
          dataset_refs: options.context.fingerprint?.dataset_refs ?? [], origin: "synthetic",
          data_as_of: "2026-10-16T12:00:00Z", observed_at: "2026-10-16T12:00:00Z",
          retrieved_at: at, served_at: at, status: "unavailable", consistency: "unknown", truncated: false,
          sections: {}, evidence: [], error: "The evidence query did not complete. This is unavailable evidence, not absent data.",
        };
      }
    };
    const verify = async () => {
      await options.authorize();
      if (!options.context.fingerprint || options.context.fingerprint.hash === "unknown") throw new Error("Verified source context is unavailable.");
      // Cache keys bind the last verified source. The scan rechecks it before publication.
    };
    const key = JSON.stringify(["workspace.ln_premium", "regional-v1", hash, options.context.scanId, options.context.fingerprint?.hash, name, canonical(input)]);
    const result = options.cache && name !== "ask_analytics"
      ? await options.cache.read(key, options.context, load, verify)
      : await load();
    if (result.account_id !== account.account_id || result.scope_hash !== hash) throw new Error("Evidence account scope mismatch");
    options.registerEvidence(result);
    return result;
  };
  return Object.fromEntries(REGIONAL_TOOL_NAMES.map(name => [name, run(name)]));
}
