import { expect, test } from "bun:test";

import { assertMemoryVerificationRun, proofHasNoToolCalls } from "../scripts/verify-agentcore-memory";

test("the memory verifier requires an explicit paid-run flag", () => {
  expect(() => assertMemoryVerificationRun([])).toThrow("--run");
  expect(() => assertMemoryVerificationRun(["--run", "unexpected"])).toThrow("only --run");
  expect(() => assertMemoryVerificationRun(["--run"])).not.toThrow();
});

test("the memory verifier rejects a proof that includes an inline tool call", () => {
  expect(proofHasNoToolCalls([{ toolCallCount: 0 }, { toolCallCount: 0 }])).toBe(true);
  expect(proofHasNoToolCalls([{ toolCallCount: 0 }, { toolCallCount: 1 }])).toBe(false);
});
