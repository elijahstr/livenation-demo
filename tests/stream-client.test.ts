import { describe, expect, test } from "bun:test";

import { createNdjsonParser, initialStreamState, reduceStreamState } from "../public/stream-client.js";

describe("sales-check stream client", () => {
  test("parses split UTF-8 NDJSON and reduces a verified result", () => {
    const events: Array<Record<string, unknown>> = [];
    const parser = createNdjsonParser((event) => events.push(event));
    const bytes = new TextEncoder().encode([
      JSON.stringify({ type: "phase", message: "Checking evidence — West", elapsedMs: 4 }),
      JSON.stringify({ type: "token", text: "Use suite outreach.", elapsedMs: 12 }),
      JSON.stringify({ type: "result", result: { status: "alert", rationale: "Use suite outreach." }, elapsedMs: 14 }),
      "",
    ].join("\n"));
    const dash = bytes.indexOf(0xe2);

    parser.write(bytes.slice(0, dash + 1));
    parser.write(bytes.slice(dash + 1));
    const terminal = parser.end();

    expect(events.map((event) => event.type)).toEqual(["phase", "token", "result"]);
    expect(events[0]?.message).toBe("Checking evidence — West");
    expect(terminal?.type).toBe("result");

    const state = events.reduce(reduceStreamState, initialStreamState());
    expect(state).toEqual({ rationale: "Use suite outreach.", error: null });
  });

  test("rejects a stream without a final result or error", () => {
    const parser = createNdjsonParser(() => undefined);
    parser.write(new TextEncoder().encode(`${JSON.stringify({ type: "phase", message: "Checking" })}\n`));
    expect(() => parser.end()).toThrow("ended without a result or error");
  });
});
