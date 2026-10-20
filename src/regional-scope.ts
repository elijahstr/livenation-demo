import { createHash } from "node:crypto";
import configuredScope from "../config/regional-scan-scope.json";
import type { RegionalScope, ScopeAccount } from "./regional-types";

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function scopeError(message = "This account is outside the approved demo roster"): Error & { status: number } {
  return Object.assign(new Error(message), { status: 403 });
}

/** Authorization comes from the explicit account/venue map, never a state filter. */
export function validateScope(input: unknown): RegionalScope {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw scopeError("Invalid roster configuration");
  const scope = input as RegionalScope;
  for (const key of ["version", "label", "seller_id", "principal_version", "territory_assignment"] as const) {
    if (typeof scope[key] !== "string" || !scope[key].trim() || scope[key].length > 1000) throw scopeError("Invalid roster configuration");
  }
  if (!Array.isArray(scope.accounts) || !scope.accounts.length || scope.accounts.length > 1000) throw scopeError("Invalid roster size");
  const ids = new Set<string>();
  for (const row of scope.accounts) {
    if (!row || !ID.test(row.account_id) || !ID.test(row.venue_id) || typeof row.account_name !== "string" ||
      !row.account_name.trim() || row.account_name.length > 256 || !["CA", "OR", "WA"].includes(row.state) || ids.has(row.account_id)) {
      throw scopeError("Invalid or duplicate roster account");
    }
    ids.add(row.account_id);
  }
  return structuredClone(scope);
}

export function scopeHash(scope: RegionalScope): string {
  return createHash("sha256").update(JSON.stringify({
    version: scope.version, seller: scope.seller_id, principal: scope.principal_version,
    assignment: scope.territory_assignment,
    accounts: [...scope.accounts].sort((a, b) => a.account_id.localeCompare(b.account_id)),
  })).digest("hex");
}

export function requireAccount(scope: RegionalScope, accountId: unknown): ScopeAccount {
  if (typeof accountId !== "string" || !ID.test(accountId)) throw scopeError();
  const account = scope.accounts.find(row => row.account_id === accountId);
  if (!account) throw scopeError();
  return account;
}

export const regionalScope = validateScope(configuredScope);

export async function assertCurrentScope(expected: RegionalScope): Promise<void> {
  const current = validateScope(await Bun.file(new URL("../config/regional-scan-scope.json", import.meta.url)).json());
  if (scopeHash(current) !== scopeHash(expected)) throw scopeError("The roster changed. Restart the demo before another request.");
}
