import { describe, expect, test } from "bun:test";

import {
  runHarnessToolCycle,
  type HarnessEvent,
  type HarnessInvokeInput,
} from "../src/harness-tool-cycle";
import type { SalesFixture } from "../src/local-setup";

const fixture: SalesFixture = {
  origin: "synthetic",
  data_as_of: "2026-09-25T00:00:00Z",
  shows: [
    {
      show_id: "east_show",
      region: "east",
      tickets_sold_cumulative: 320,
      tickets_target_cumulative: 500,
    },
    {
      show_id: "west_show",
      region: "west",
      tickets_sold_cumulative: 410,
      tickets_target_cumulative: 500,
    },
  ],
};

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
            delta: { toolUse: { input: '{"show_id":"east_' } },
          },
        },
        {
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: { toolUse: { input: 'show","region":"east"}' } },
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
      authorizedRegion: "east",
      fixture,
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
              input: { show_id: "east_show", region: "east" },
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
                  text: '{"data_as_of":"2026-09-25T00:00:00Z","origin":"synthetic","region":"east","show_id":"east_show","tickets_sold_cumulative":320,"tickets_target_cumulative":500}',
                },
              ],
            },
          },
        ],
      },
    ]);
  });

  test("rejects an unexpected tool name", async () => {
    await expect(
      runHarnessToolCycle({
        harnessArn: "arn:aws:bedrock-agentcore:us-east-1:009073575420:harness/livenation_demo-ABCDEFGHIJ",
        sessionId: "12345678-1234-1234-1234-123456789012",
        prompt: "Use a tool.",
        authorizedRegion: "east",
        fixture,
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
        authorizedRegion: "east",
        fixture,
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
        authorizedRegion: "east",
        fixture,
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
        authorizedRegion: "east",
        fixture,
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
        authorizedRegion: "east",
        fixture,
        invoke: async () => {
          calls += 1;
          return {
            stream: events(
              toolUseEvents('{"show_id":"east_show","region":"east"}'),
            ),
          };
        },
      }),
    ).rejects.toThrow("exceeded 3 tool iterations");
    expect(calls).toBe(3);
  });

  test("rejects a tool request outside the authorized region", async () => {
    await expect(
      runHarnessToolCycle({
        harnessArn: "arn:aws:bedrock-agentcore:us-east-1:009073575420:harness/livenation_demo-ABCDEFGHIJ",
        sessionId: "12345678-1234-1234-1234-123456789012",
        prompt: "Use a tool.",
        authorizedRegion: "east",
        fixture,
        invoke: async () => ({
          stream: events(
            toolUseEvents('{"show_id":"west_show","region":"west"}'),
          ),
        }),
      }),
    ).rejects.toThrow("not authorized");
  });
});
