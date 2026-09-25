import {
  getSalesEvidence,
  type Region,
  type SalesFixture,
} from "./local-setup";

type HarnessToolUse = {
  toolUseId: string;
  name: string;
  input: unknown;
  type: "tool_use";
};

type HarnessMessage = {
  role: "user" | "assistant";
  content: Array<
    | { text: string }
    | { toolUse: HarnessToolUse }
    | {
        toolResult: {
          toolUseId: string;
          status: "success" | "error";
          type: "tool_use";
          content: Array<{ json: unknown } | { text: string }>;
        };
      }
  >;
};

export type HarnessInvokeInput = {
  harnessArn: string;
  runtimeSessionId: string;
  messages: HarnessMessage[];
};

export type HarnessEvent = {
  contentBlockStart?: {
    contentBlockIndex: number;
    start?: {
      toolUse?: {
        toolUseId: string;
        name: string;
        type?: string;
      };
    };
  };
  contentBlockDelta?: {
    contentBlockIndex: number;
    delta?: {
      text?: string;
      toolUse?: { input?: string };
    };
  };
  messageStop?: { stopReason?: string };
  metadata?: {
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
    metrics?: { latencyMs?: number };
  };
  internalServerException?: { message?: string };
  runtimeClientError?: { message?: string };
  validationException?: { message?: string };
};

export type HarnessInvoker = (
  input: HarnessInvokeInput,
) => Promise<{ stream: AsyncIterable<HarnessEvent> }>;

type StreamResult = {
  text: string;
  stopReason: string;
  toolUse?: HarnessToolUse;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

function streamError(event: HarnessEvent): Error | undefined {
  for (const [key, value] of Object.entries({
    internalServerException: event.internalServerException,
    runtimeClientError: event.runtimeClientError,
    validationException: event.validationException,
  })) {
    if (value) return new Error(value.message ?? `Harness stream returned ${key}`);
  }
}

async function consumeStream(
  stream: AsyncIterable<HarnessEvent>,
): Promise<StreamResult> {
  let text = "";
  let stopReason = "";
  let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const toolUses = new Map<
    number,
    { toolUseId: string; name: string; input: string }
  >();

  for await (const event of stream) {
    const error = streamError(event);
    if (error) throw error;

    const start = event.contentBlockStart?.start?.toolUse;
    if (start) {
      if (start.name !== "get_sales_evidence") {
        throw new Error(`Unexpected tool ${start.name}`);
      }
      toolUses.set(event.contentBlockStart!.contentBlockIndex, {
        toolUseId: start.toolUseId,
        name: start.name,
        input: "",
      });
    }

    const delta = event.contentBlockDelta?.delta;
    if (delta?.text) text += delta.text;
    if (delta?.toolUse?.input) {
      const index = event.contentBlockDelta!.contentBlockIndex;
      const toolUse = toolUses.get(index);
      if (!toolUse) throw new Error("Tool input arrived before tool start");
      toolUse.input += delta.toolUse.input;
    }

    if (event.messageStop?.stopReason) stopReason = event.messageStop.stopReason;
    if (event.metadata?.usage) {
      usage = {
        inputTokens: event.metadata.usage.inputTokens ?? 0,
        outputTokens: event.metadata.usage.outputTokens ?? 0,
        totalTokens: event.metadata.usage.totalTokens ?? 0,
      };
    }
  }

  if (!stopReason) throw new Error("Harness stream ended without a stop reason");
  if (stopReason !== "tool_use") return { text, stopReason, usage };
  if (toolUses.size !== 1) {
    throw new Error(`Expected one inline tool request, received ${toolUses.size}`);
  }

  const pending = [...toolUses.values()][0];
  let input: unknown;
  try {
    input = JSON.parse(pending.input);
  } catch {
    throw new Error("Harness returned invalid tool input JSON");
  }

  return {
    text,
    stopReason,
    usage,
    toolUse: {
      toolUseId: pending.toolUseId,
      name: pending.name,
      input,
      type: "tool_use",
    },
  };
}

export async function runHarnessToolCycle(options: {
  harnessArn: string;
  sessionId: string;
  prompt: string;
  authorizedRegion: Region;
  fixture: SalesFixture;
  invoke: HarnessInvoker;
  maxIterations?: number;
}) {
  if (options.sessionId.length < 33 || options.sessionId.length > 100) {
    throw new Error("sessionId must contain 33 to 100 characters");
  }

  const maxIterations = options.maxIterations ?? 3;
  let messages: HarnessMessage[] = [
    { role: "user", content: [{ text: options.prompt }] },
  ];
  const toolCalls: Array<{ name: string; input: unknown; result: unknown }> = [];
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const response = await options.invoke({
      harnessArn: options.harnessArn,
      runtimeSessionId: options.sessionId,
      messages,
    });
    const current = await consumeStream(response.stream);
    usage.inputTokens += current.usage.inputTokens;
    usage.outputTokens += current.usage.outputTokens;
    usage.totalTokens += current.usage.totalTokens;

    if (current.stopReason === "end_turn") {
      return {
        text: current.text,
        stopReason: current.stopReason,
        toolCalls,
        usage,
      };
    }
    if (current.stopReason !== "tool_use" || !current.toolUse) {
      throw new Error(`Harness stopped with ${current.stopReason}`);
    }

    const result = getSalesEvidence(
      current.toolUse.input,
      options.authorizedRegion,
      options.fixture,
    );
    toolCalls.push({
      name: current.toolUse.name,
      input: current.toolUse.input,
      result,
    });
    messages = [
      {
        role: "assistant",
        content: [{ toolUse: current.toolUse }],
      },
      {
        role: "user",
        content: [
          {
            toolResult: {
              toolUseId: current.toolUse.toolUseId,
              status: "success",
              type: "tool_use",
              content: [{ text: JSON.stringify(result) }],
            },
          },
        ],
      },
    ];
  }

  throw new Error(`Harness exceeded ${maxIterations} tool iterations`);
}
