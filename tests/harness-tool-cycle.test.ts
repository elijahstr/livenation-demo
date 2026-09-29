import { describe, expect, test } from "bun:test";

import {
  runHarnessToolCycle,
  type HarnessEvent,
  type HarnessProgressEvent,
  type HarnessInvokeInput,
} from "../src/harness-tool-cycle";
const selected = { event_id: "hayden-homes-001", region: "west", origin: "synthetic" };

async function* events(items: HarnessEvent[]) {
  yield* items;
}

function toolUseEvents(input: string): HarnessEvent[] {
  return [
    {
      contentBlockStart: {
        contentBlockIndex: 0,
        start: {
          toolUse: {
            toolUseId: "tool-loop",
            name: "get_sales_evidence",
            type: "tool_use",
          },
        },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { toolUse: { input } },
      },
    },
    { messageStop: { stopReason: "tool_use" } },
  ];
}

describe("runHarnessToolCycle", () => {
  test("executes a fragmented tool request and returns the final answer", async () => {
    const calls: HarnessInvokeInput[] = [];
    const streams: HarnessEvent[][] = [
      [
        {
          contentBlockStart: {
            contentBlockIndex: 0,
            start: {
              toolUse: {
                toolUseId: "tool-1",
                name: "get_sales_evidence",
                type: "tool_use",
              },
            },
          },
        },
        {
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: { toolUse: { input: '{"event_id":"hayden-' } },
          },
        },
        {
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: { toolUse: { input: 'homes-001","region":"west"}' } },
          },
        },
        { messageStop: { stopReason: "tool_use" } },
        {
          metadata: {
            usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
            metrics: { latencyMs: 900 },
          },
        },
      ],
      [
        {
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: { text: "East show sold 320 of 500 target tickets." },
          },
        },
        { messageStop: { stopReason: "end_turn" } },
        {
          metadata: {
            usage: { inputTokens: 140, outputTokens: 14, totalTokens: 154 },
            metrics: { latencyMs: 700 },
          },
        },
      ],
    ];

    const result = await runHarnessToolCycle({
      harnessArn: "arn:aws:bedrock-agentcore:us-east-1:009073575420:harness/livenation_demo-ABCDEFGHIJ",
      sessionId: "12345678-1234-1234-1234-123456789012",
      prompt: "Use the tool for east_show in east.",
    resolveEvidence: (input) => {
      expect(input).toEqual({ event_id: "hayden-homes-001", region: "west" });
      return selected;
    },
      invoke: async (input) => {
        calls.push(input);
        const stream = streams.shift();
        if (!stream) throw new Error("unexpected invocation");
        return { stream: events(stream) };
      },
    });

    expect(result.text).toBe("East show sold 320 of 500 target tickets.");
    expect(result.stopReason).toBe("end_turn");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.usage.totalTokens).toBe(274);
    expect(calls).toHaveLength(2);
    expect(calls[0].runtimeSessionId).toBe(calls[1].runtimeSessionId);
    expect(calls[1].messages).toEqual([
      {
        role: "assistant",
        content: [
          {
            toolUse: {
              toolUseId: "tool-1",
              name: "get_sales_evidence",
              input: { event_id: "hayden-homes-001", region: "west" },
              type: "tool_use",
            },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            toolResult: {
              toolUseId: "tool-1",
              status: "success",
              type: "tool_use",
              content: [
                {
                  text: '{"event_id":"hayden-homes-001","region":"west","origin":"synthetic"}',
                },
              ],
            },
          },
        ],
      },
    ]);
  });

  test("emits evidence progress and final tokens only after evidence succeeds", async () => {
    const controller = new AbortController();
    const emitted: HarnessProgressEvent[] = [];
    const streams: HarnessEvent[][] = [
      [
        { contentBlockDelta: { contentBlockIndex: 0, delta: { text: "I will check sales." } } },
        ...toolUseEvents('{"event_id":"hayden-homes-001","region":"west"}'),
      ],
      [
        { contentBlockDelta: { contentBlockIndex: 0, delta: { text: "Use suite outreach." } } },
        { messageStop: { stopReason: "end_turn" } },
      ],
    ];
    const signals: Array<AbortSignal | undefined> = [];

    const result = await runHarnessToolCycle({
      harnessArn: "arn:aws:bedrock-agentcore:us-east-1:009073575420:harness/livenation_demo-ABCDEFGHIJ",
      sessionId: "12345678-1234-1234-1234-123456789012",
      prompt: "Use the evidence tool.",
      signal: controller.signal,
      onEvent: (event) => emitted.push(event),
      resolveEvidence: () => selected,
      invoke: async (_input, signal) => {
        signals.push(signal);
        const stream = streams.shift();
        if (!stream) throw new Error("unexpected invocation");
        return { stream: events(stream) };
      },
    });

    expect(result.text).toBe("Use suite outreach.");
    expect(signals).toEqual([controller.signal, controller.signal]);
    expect(emitted).toEqual([
      { type: "tool", status: "started", toolName: "get_sales_evidence" },
      { type: "tool", status: "completed", toolName: "get_sales_evidence" },
      { type: "token", text: "Use suite outreach." },
    ]);
  });

  test("stops the harness stream after the request aborts", async () => {
    const controller = new AbortController();
    let resolved = false;
    async function* abortingStream(): AsyncGenerator<HarnessEvent> {
      yield { contentBlockDelta: { contentBlockIndex: 0, delta: { text: "Checking evidence." } } };
      controller.abort();
      yield { messageStop: { stopReason: "end_turn" } };
    }

    await expect(
      runHarnessToolCycle({
        harnessArn: "arn:aws:bedrock-agentcore:us-east-1:009073575420:harness/livenation_demo-ABCDEFGHIJ",
        sessionId: "12345678-1234-1234-1234-123456789012",
        prompt: "Use the evidence tool.",
        signal: controller.signal,
        resolveEvidence: () => {
          resolved = true;
          return selected;
        },
        invoke: async () => ({ stream: abortingStream() }),
      }),
    ).rejects.toThrow("aborted");
    expect(resolved).toBe(false);
  });

  test("releases a stalled Harness iterator when the request aborts", async () => {
    const controller = new AbortController();
    let returned = false;
    const stream: AsyncIterable<HarnessEvent> = {
      [Symbol.asyncIterator]() {
        return {
          next: () => new Promise<IteratorResult<HarnessEvent>>(() => undefined),
          return: async () => { returned = true; return { done: true, value: undefined }; },
        };
      },
    };
    const cycle = runHarnessToolCycle({
      harnessArn: "arn:aws:bedrock-agentcore:us-east-1:009073575420:harness/livenation_demo-ABCDEFGHIJ",
      sessionId: "12345678-1234-1234-1234-123456789012",
      prompt: "Use the evidence tool.",
      signal: controller.signal,
      resolveEvidence: () => selected,
      invoke: async () => ({ stream }),
    });
    setTimeout(() => controller.abort(), 5);

    await expect(Promise.race([cycle, Bun.sleep(100).then(() => { throw new Error("Harness abort timed out"); })])).rejects.toThrow("aborted");
    expect(returned).toBe(true);
  });

  test("rejects an unexpected tool name", async () => {
    await expect(
      runHarnessToolCycle({
        harnessArn: "arn:aws:bedrock-agentcore:us-east-1:009073575420:harness/livenation_demo-ABCDEFGHIJ",
        sessionId: "12345678-1234-1234-1234-123456789012",
        prompt: "Use a tool.",
        resolveEvidence: () => selected,
        invoke: async () => ({
          stream: events([
            {
              contentBlockStart: {
                contentBlockIndex: 0,
                start: {
                  toolUse: {
                    toolUseId: "tool-2",
                    name: "shell",
                    type: "tool_use",
                  },
                },
              },
            },
          ]),
        }),
      }),
    ).rejects.toThrow("Unexpected tool shell");
  });

  test("fails when the stream contains a runtime error event", async () => {
    await expect(
      runHarnessToolCycle({
        harnessArn: "arn:aws:bedrock-agentcore:us-east-1:009073575420:harness/livenation_demo-ABCDEFGHIJ",
        sessionId: "12345678-1234-1234-1234-123456789012",
        prompt: "Use a tool.",
        resolveEvidence: () => selected,
        invoke: async () => ({
          stream: events([
            { runtimeClientError: { message: "runtime failed" } },
          ]),
        }),
      }),
    ).rejects.toThrow("runtime failed");
  });

  test("rejects a session identifier shorter than 33 characters", async () => {
    await expect(
      runHarnessToolCycle({
        harnessArn: "arn:aws:bedrock-agentcore:us-east-1:009073575420:harness/livenation_demo-ABCDEFGHIJ",
        sessionId: "too-short",
        prompt: "Use a tool.",
        resolveEvidence: () => selected,
        invoke: async () => {
          throw new Error("invoke must not run");
        },
      }),
    ).rejects.toThrow("33 to 100 characters");
  });

  test("rejects invalid fragmented tool input JSON", async () => {
    await expect(
      runHarnessToolCycle({
        harnessArn: "arn:aws:bedrock-agentcore:us-east-1:009073575420:harness/livenation_demo-ABCDEFGHIJ",
        sessionId: "12345678-1234-1234-1234-123456789012",
        prompt: "Use a tool.",
        resolveEvidence: () => selected,
        invoke: async () => ({ stream: events(toolUseEvents("not-json")) }),
      }),
    ).rejects.toThrow("invalid tool input JSON");
  });

  test("stops after three tool iterations", async () => {
    let calls = 0;
    await expect(
      runHarnessToolCycle({
        harnessArn: "arn:aws:bedrock-agentcore:us-east-1:009073575420:harness/livenation_demo-ABCDEFGHIJ",
        sessionId: "12345678-1234-1234-1234-123456789012",
        prompt: "Use a tool.",
        resolveEvidence: () => selected,
        invoke: async () => {
          calls += 1;
          return {
            stream: events(
              toolUseEvents('{"event_id":"hayden-homes-001","region":"west"}'),
            ),
          };
        },
      }),
    ).rejects.toThrow("exceeded 3 tool iterations");
    expect(calls).toBe(3);
  });

  test("rejects a tool request outside the selected event", async () => {
    await expect(
      runHarnessToolCycle({
        harnessArn: "arn:aws:bedrock-agentcore:us-east-1:009073575420:harness/livenation_demo-ABCDEFGHIJ",
        sessionId: "12345678-1234-1234-1234-123456789012",
        prompt: "Use a tool.",
        resolveEvidence: (input) => {
          if (JSON.stringify(input) !== JSON.stringify({ event_id: "hayden-homes-001", region: "west" })) throw new Error("not authorized");
          return selected;
        },
        invoke: async () => ({
          stream: events(
            toolUseEvents('{"event_id":"another-event","region":"west"}'),
          ),
        }),
      }),
    ).rejects.toThrow("not authorized");
  });
});
