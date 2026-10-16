import { validateApprovedWestRows, validateWestSalesRows, type WestSalesEvidence } from "./west-sales";

const approvedEventIds = ["hayden-homes-001", "wiltern-001", "palladium-001", "masonic-001", "white-river-001", "gorge-001"] as const;

function isApprovedEventId(value: string): value is typeof approvedEventIds[number] {
  return approvedEventIds.includes(value as typeof approvedEventIds[number]);
}

export function createChatEvidenceTool() {
  return {
    type: "inline_function" as const,
    name: "get_sales_evidence",
    config: {
      inlineFunction: {
        description: "Read approved aggregate synthetic West sales evidence. Use no other data source.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: { event_id: { type: "string", enum: [...approvedEventIds] } },
        },
      },
    },
  };
}

export function createChatEvidenceResolver(
  readEvidence: (now: Date, signal?: AbortSignal) => Promise<WestSalesEvidence[]>,
  now: Date,
  signal?: AbortSignal,
) {
  let cached: WestSalesEvidence[] | undefined;
  return async (input: unknown): Promise<WestSalesEvidence[]> => {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Evidence tool input must be an object");
    const values = input as Record<string, unknown>;
    if (Object.keys(values).some((key) => key !== "event_id")) throw new Error("Evidence tool accepts event_id only");
    const eventId = values.event_id;
    if (eventId !== undefined && (typeof eventId !== "string" || !isApprovedEventId(eventId))) {
      throw new Error("Evidence event_id must be approved");
    }
    if (!cached) cached = validateApprovedWestRows(validateWestSalesRows(await readEvidence(now, signal), now));
    return eventId === undefined ? cached : cached.filter((row) => row.event_id === eventId);
  };
}
