import { expect, test } from "bun:test";
import { HarnessToolInputError, runHarnessToolCycle, type HarnessEvent } from "../src/harness-tool-cycle";

const names = ["get_account_brief", "find_options", "ask_analytics"];
function response(name?: string, input = "{}"): HarnessEvent[] {
  return name ? [
    { contentBlockStart: { contentBlockIndex: 0, start: { toolUse: { name, toolUseId: crypto.randomUUID() } } } },
    { contentBlockDelta: { contentBlockIndex: 0, delta: { toolUse: { input } } } },
    { messageStop: { stopReason: "tool_use" } },
  ] : [{ messageStop: { stopReason: "end_turn" } }];
}
function run(sequence: string[], handlers: Record<string, (input: unknown) => unknown>, extra = {}) {
  const requests: any[] = [];
  const operation = runHarnessToolCycle({
    harnessArn: "demo", sessionId: crypto.randomUUID(), prompt: "Read premium evidence",
    toolHandlers: handlers, maxIterations: 5, maxTotalToolCalls: 3, maxToolCallsPerResponse: 3,
    maxToolResultBytes: 65536,
    invoke: async request => {
      const name = sequence[requests.length]; requests.push(request);
      return { stream: (async function* () { yield* response(name); })() };
    }, ...extra,
  });
  return { operation, requests };
}
test("three sequential premium tools complete before the final model answer", async () => {
  const called: string[] = [];
  const handlers = Object.fromEntries(names.map(name => [name, () => { called.push(name); return { origin: "synthetic" }; }]));
  const check = run(names, handlers, { maxIterations: 4 });
  expect((await check.operation).toolCalls).toHaveLength(3);
  expect(called).toEqual(names);
  expect(check.requests).toHaveLength(4);
});
test("fourth tool is rejected before resolver execution", async () => {
  let calls = 0;
  const check = run(Array(4).fill(names[0]), { [names[0]]: () => ++calls });
  await expect(check.operation).rejects.toThrow("total tool");
  expect(calls).toBe(3);
});
test("unknown and inherited tool names never reach a handler", async () => {
  for (const name of ["shell", "get_sales_evidence", "toString", "__proto__"]) {
    let calls = 0;
    await expect(run([name], { get_account_brief: () => ++calls }).operation).rejects.toThrow("Unexpected tool");
    expect(calls).toBe(0);
  }
});
test("safe input errors return a bounded error tool result", async () => {
  const check = run([names[0]], { [names[0]]: () => { throw new HarnessToolInputError("Only account A100 is available."); } });
  const result = await check.operation;
  expect(result.toolCalls[0].result).toEqual({ error: "Only account A100 is available." });
  expect(check.requests[1].messages[0].content[0].toolResult.status).toBe("error");
});
test("backend failures and oversized tool results abort before a handoff", async () => {
  const failure = run([names[0]], { [names[0]]: () => { throw new Error("Databricks failed"); } });
  await expect(failure.operation).rejects.toThrow("Databricks failed");
  expect(failure.requests).toHaveLength(1);
  const large = run([names[0]], { [names[0]]: () => "a".repeat(65536) });
  await expect(large.operation).rejects.toThrow("result limit");
  expect(large.requests).toHaveLength(1);
});
