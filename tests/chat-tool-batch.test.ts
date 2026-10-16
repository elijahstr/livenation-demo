import { expect, test } from "bun:test";
import { runHarnessToolCycle, type HarnessEvent, type HarnessInvokeInput } from "../src/harness-tool-cycle";

const start = (index: number): HarnessEvent => ({ contentBlockStart: { contentBlockIndex: index, start: { toolUse: { name: "get_sales_evidence", toolUseId: `tool-${index}` } } } });
async function run(first: HarnessEvent[], maxToolCallsPerResponse?: number) {
  const requests: HarnessInvokeInput[] = [];
  const inputs: unknown[] = [];
  const operation = runHarnessToolCycle({ harnessArn: "demo", sessionId: crypto.randomUUID(), prompt: "Read evidence", maxToolCallsPerResponse,
    resolveEvidence: input => { inputs.push(input); return { origin: "synthetic" }; },
    invoke: async request => {
      requests.push(request);
      const events = requests.length === 1 ? first : [{ messageStop: { stopReason: "end_turn" } }];
      return { stream: (async function* () { yield* events; })() };
    },
  });
  return { operation, requests, inputs };
}
test("accepts an argument-free portfolio request", async () => {
  const check = await run([start(0), { messageStop: { stopReason: "tool_use" } }]);
  await check.operation;
  expect(check.inputs).toEqual([{}]);
});
test("returns adjacent inline results in block order with one follow-up", async () => {
  const check = await run([start(1), start(0), { messageStop: { stopReason: "tool_use" } }], 3);
  await check.operation;
  expect(check.inputs).toEqual([{}, {}]);
  expect(check.requests).toHaveLength(2);
  expect(check.requests[1].messages).toHaveLength(1);
  expect(check.requests[1].messages[0].content.map(block => block.toolResult?.toolUseId)).toEqual(["tool-0", "tool-1"]);
});
test("rejects an oversized batch before any resolver", async () => {
  const check = await run([start(0), start(1), start(2), start(3), { messageStop: { stopReason: "tool_use" } }], 3);
  await expect(check.operation).rejects.toThrow();
  expect(check.inputs).toHaveLength(0);
});
test("parses the whole batch before any resolver", async () => {
  const check = await run([start(0), start(1), { contentBlockDelta: { contentBlockIndex: 1, delta: { toolUse: { input: "{broken" } } } }, { messageStop: { stopReason: "tool_use" } }], 3);
  await expect(check.operation).rejects.toThrow("invalid tool input JSON");
  expect(check.inputs).toHaveLength(0);
});
test("keeps the one-tool default for existing recovery callers", async () => {
  const check = await run([start(0), start(1), { messageStop: { stopReason: "tool_use" } }]);
  await expect(check.operation).rejects.toThrow();
  expect(check.inputs).toHaveLength(0);
});
