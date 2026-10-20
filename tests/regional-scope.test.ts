import { expect, test } from "bun:test";
import { requireAccount, scopeHash, validateScope } from "../src/regional-scope";

const scope = {
  version: "v1", label: "Synthetic territory", seller_id: "seller", principal_version: "read-v1",
  territory_assignment: "Explicit demo assignment",
  accounts: [{ account_id: "A100", account_name: "Harbor Works", venue_id: "V100", state: "CA" }],
};

test("only an explicit account and venue pair grants scope", () => {
  const approved = validateScope(scope);
  expect(requireAccount(approved, "A100").venue_id).toBe("V100");
  expect(() => requireAccount(approved, "A101")).toThrow();
  expect(() => requireAccount(approved, "A100' OR 1=1")).toThrow();
  expect(() => validateScope({ ...scope, accounts: [...scope.accounts, ...scope.accounts] })).toThrow();
});

test("authorization changes invalidate the scope hash", () => {
  const before = scopeHash(validateScope(scope));
  expect(scopeHash(validateScope({ ...scope, principal_version: "read-v2" }))).not.toBe(before);
  expect(scopeHash(validateScope({ ...scope, accounts: [{ ...scope.accounts[0], venue_id: "V200" }] }))).not.toBe(before);
});
