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
  actorId?: string;
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
  signal?: AbortSignal,
) => Promise<{ stream: AsyncIterable<HarnessEvent> }>;

/** Only server-authored input validation messages belong in this recoverable error. */
export class HarnessToolInputError extends Error {}
export type HarnessToolHandlers = Readonly<Record<string, (input: unknown) => unknown | Promise<unknown>>>;

export type HarnessProgressEvent =
  | {
      type: "tool";
      status: "started" | "completed";
      toolName: string;
    }
  | {
      type: "token";
      text: string;
    };

type StreamResult = {
  text: string;
  stopReason: string;
  toolUses?: HarnessToolUse[];
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
  options: {
    signal?: AbortSignal;
    maxToolCallsPerResponse?: number;
    allowedToolNames?: ReadonlySet<string>;
    onToolStart?: (toolName: string) => void | Promise<void>;
    onText?: (text: string) => void | Promise<void>;
  } = {},
): Promise<StreamResult> {
  let text = "";
  let stopReason = "";
  let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const toolUses = new Map<
    number,
    { toolUseId: string; name: string; input: string }
  >();

  const iterator = stream[Symbol.asyncIterator]();
  try {
    while (true) {
      const next = await nextWithAbort(iterator, options.signal);
      if (next.done) break;
      const event = next.value;
      throwIfAborted(options.signal);
      const error = streamError(event);
      if (error) throw error;

      const start = event.contentBlockStart?.start?.toolUse;
      if (start) {
        if (!(options.allowedToolNames ?? new Set(["get_sales_evidence"])).has(start.name)) {
          throw new Error(`Unexpected tool ${start.name}`);
        }
        toolUses.set(event.contentBlockStart!.contentBlockIndex, {
          toolUseId: start.toolUseId,
          name: start.name,
          input: "",
        });
        await options.onToolStart?.(start.name);
      }

      const delta = event.contentBlockDelta?.delta;
      if (delta?.text) {
        text += delta.text;
        await options.onText?.(delta.text);
      }
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
  } catch (error) {
    try { void iterator.return?.(); } catch {}
    throw error;
  }

  if (!stopReason) throw new Error("Harness stream ended without a stop reason");
  if (stopReason !== "tool_use") return { text, stopReason, usage };
  const limit = options.maxToolCallsPerResponse ?? 1;
  if (!toolUses.size || toolUses.size > limit) {
    throw new Error(`Expected at most ${limit} inline tool requests, received ${toolUses.size}`);
  }
  const pending = [...toolUses.entries()].sort(([a], [b]) => a - b).map(([, value]) => value);
  if (new Set(pending.map(tool => tool.toolUseId)).size !== pending.length) throw new Error("Duplicate inline tool ID");
  const parsed = pending.map(tool => {
    let input: unknown;
    try { input = JSON.parse(tool.input || "{}"); }
    catch { throw new Error("Harness returned invalid tool input JSON"); }
    return { toolUseId: tool.toolUseId, name: tool.name, input, type: "tool_use" as const };
  });
  return { text, stopReason, usage, toolUses: parsed };
}

function nextWithAbort(
  iterator: AsyncIterator<HarnessEvent>,
  signal?: AbortSignal,
): Promise<IteratorResult<HarnessEvent>> {
  throwIfAborted(signal);
  if (!signal) return iterator.next();
  let onAbort = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason instanceof Error ? signal.reason : new Error("Request aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  return Promise.race([iterator.next(), aborted]).finally(() => signal.removeEventListener("abort", onAbort));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new Error("Request aborted");
}

export async function runHarnessToolCycle(options: {
  harnessArn: string;
  sessionId: string;
  actorId?: string;
  prompt: string;
  resolveEvidence?: (input: unknown) => unknown | Promise<unknown>;
  toolHandlers?: HarnessToolHandlers;
  invoke: HarnessInvoker;
  maxIterations?: number;
  maxToolCallsPerResponse?: number;
  maxTotalToolCalls?: number;
  maxToolResultBytes?: number;
  streamInitialText?: boolean;
  signal?: AbortSignal;
  onEvent?: (event: HarnessProgressEvent) => void | Promise<void>;
}) {
  if (options.sessionId.length < 33 || options.sessionId.length > 100) {
    throw new Error("sessionId must contain 33 to 100 characters");
  }
  if (!!options.toolHandlers === !!options.resolveEvidence) throw new Error("Select exactly one tool resolver");
  const handlers: HarnessToolHandlers = options.toolHandlers ?? { get_sales_evidence: options.resolveEvidence! };
  const allowedToolNames = new Set(Object.keys(handlers));

  const maxIterations = options.maxIterations ?? 3;
  let messages: HarnessMessage[] = [
    { role: "user", content: [{ text: options.prompt }] },
  ];
  const toolCalls: Array<{ name: string; input: unknown; result: unknown }> = [];
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    throwIfAborted(options.signal);
    const response = await options.invoke({
      harnessArn: options.harnessArn,
      runtimeSessionId: options.sessionId,
      ...(options.actorId === undefined ? {} : { actorId: options.actorId }),
      messages,
    }, options.signal);
    const current = await consumeStream(response.stream, {
      maxToolCallsPerResponse: options.maxToolCallsPerResponse,
      allowedToolNames,
      signal: options.signal,
      onToolStart: (toolName) => options.onEvent?.({
        type: "tool",
        status: "started",
        toolName,
      }),
      onText: iteration > 0 || options.streamInitialText
        ? (text) => options.onEvent?.({ type: "token", text })
        : undefined,
    });
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
    if (current.stopReason !== "tool_use" || !current.toolUses?.length) {
      throw new Error(`Harness stopped with ${current.stopReason}`);
    }

    const content: HarnessMessage["content"] = [];
    if (toolCalls.length + current.toolUses.length > (options.maxTotalToolCalls ?? Infinity)) {
      throw new Error("Harness exceeded total tool call limit");
    }
    for (const tool of current.toolUses) {
      throwIfAborted(options.signal);
      let result: unknown;
      let status: "success" | "error" = "success";
      try { result = await handlers[tool.name]!(tool.input); }
      catch (error) {
        if (!(error instanceof HarnessToolInputError)) throw error;
        result = { error: error.message.slice(0, 300) };
        status = "error";
      }
      throwIfAborted(options.signal);
      const serialized = JSON.stringify(result);
      if (serialized === undefined || Buffer.byteLength(serialized) > (options.maxToolResultBytes ?? Infinity)) throw new Error("Harness tool result limit exceeded");
      toolCalls.push({ name: tool.name, input: tool.input, result });
      await options.onEvent?.({ type: "tool", status: "completed", toolName: tool.name });
      content.push({ toolResult: { toolUseId: tool.toolUseId, status, type: "tool_use", content: [{ text: serialized }] } });
    }
    messages = [{ role: "user", content }];
  }

  throw new Error(`Harness exceeded ${maxIterations} tool iterations`);
}
