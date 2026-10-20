import { expect, test } from "bun:test";
import { AccountChatService } from "../src/account-chat-service";
import { regionalScope } from "../src/regional-scope";

test("an account session cannot authorize another account or an unapproved account", () => {
  const service = new AccountChatService({
    scope: regionalScope, harnessArn: "test", data: {} as never, runtime: {} as never,
    createInvoker: async () => { throw new Error("No invocation should occur"); },
    authorize: async () => {},
  });
  const [first, second] = regionalScope.accounts;
  const session = service.createSession(first!.account_id);
  expect(service.validateTurn(first!.account_id, { sessionId: session.sessionId, message: "Evidence?" }).accountId).toBe(first!.account_id);
  expect(() => service.validateTurn(second!.account_id, { sessionId: session.sessionId, message: "Evidence?" })).toThrow();
  expect(() => service.createSession("not-approved")).toThrow();
  const another = service.createSession(second!.account_id);
  expect(another.sessionId).not.toBe(session.sessionId);
  expect(another.runtimeSessionId).not.toBe(session.runtimeSessionId);
});
