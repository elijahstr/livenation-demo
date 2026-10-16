import { expect, test } from "bun:test";
import config from "../config/premium-genie.json" with { type: "json" };
import { setupPremiumGenie, validatePremiumGenieConfig } from "../scripts/setup-premium-genie";

test("the curated agent configuration contains only the approved sorted Gold sources", () => {
  const valid = validatePremiumGenieConfig(config);
  expect(valid.version).toBe(2);
  expect((valid.data_sources as { metric_views: unknown[] }).metric_views).toHaveLength(1);
});

test("setup defaults to a zero-cloud-call dry run", async () => {
  await expect(setupPremiumGenie()).resolves.toMatchObject({ mode: "dry-run", title: "Live Nation Premium Gold", sources: expect.arrayContaining(["workspace.ln_premium_gold.account_artist_evidence"]) });
});

test("recognizes only the observed Genie source and instruction normalizations", async () => {
  const created = await Bun.file("/tmp/ln-gold-tools-preflight/created-space.json").json();
  const calls: Array<{ args: string[]; body: unknown }> = [];
  const request = async (args: string[], body: unknown) => {
    calls.push({ args, body });
    if (args[2].includes("workspace/get-status")) return { object_type: "DIRECTORY" };
    if (args[2].startsWith("/api/2.0/genie/spaces?")) return { spaces: [{ title: created.title, space_id: created.space_id }] };
    if (args[2].startsWith(`/api/2.0/genie/spaces/${created.space_id}`)) return created;
    throw new Error("unexpected request");
  };
  await expect(setupPremiumGenie({ apply: true, request })).resolves.toMatchObject({ mode: "verified", spaceId: created.space_id });
  expect(calls.some(call => call.args[1] === "post")).toBe(false);
});

test("rejects an existing Genie Agent with drifted instructions or a non-Gold source", async () => {
  const created = await Bun.file("/tmp/ln-gold-tools-preflight/created-space.json").json();
  const requestFor = (space: any) => async (args: string[]) => {
    if (args[2].includes("workspace/get-status")) return { object_type: "DIRECTORY" };
    if (args[2].startsWith("/api/2.0/genie/spaces?")) return { spaces: [{ title: created.title, space_id: created.space_id }] };
    return space;
  };
  const instructionDrift = structuredClone(created);
  instructionDrift.serialized_space = JSON.stringify({ ...JSON.parse(created.serialized_space), instructions: { ...JSON.parse(created.serialized_space).instructions, text_instructions: [{ id: "20000000000000000000000000000001", content: ["changed"] }] } });
  await expect(setupPremiumGenie({ apply: true, request: requestFor(instructionDrift) })).rejects.toThrow("foreign or has changed configuration");
  const sourceDrift = structuredClone(created); const definition = JSON.parse(sourceDrift.serialized_space);
  definition.data_sources.tables[0].identifier = "workspace.ln_premium_silver.accounts";
  sourceDrift.serialized_space = JSON.stringify(definition);
  await expect(setupPremiumGenie({ apply: true, request: requestFor(sourceDrift) })).rejects.toThrow("foreign or has changed configuration");
});

test("reads back a created Genie Agent before it reports success", async () => {
  const created = await Bun.file("/tmp/ln-gold-tools-preflight/created-space.json").json();
  const calls: string[] = [];
  const request = async (args: string[]) => {
    calls.push(`${args[1]} ${args[2]}`);
    if (args[2].includes("workspace/get-status")) return { object_type: "DIRECTORY" };
    if (args[2].startsWith("/api/2.0/genie/spaces?")) return { spaces: [] };
    if (args[1] === "post") return { space_id: created.space_id };
    if (args[2].startsWith(`/api/2.0/genie/spaces/${created.space_id}`)) return created;
    throw new Error("unexpected request");
  };
  await expect(setupPremiumGenie({ apply: true, request })).resolves.toMatchObject({ mode: "created", spaceId: created.space_id });
  expect(calls.filter(call => call.startsWith("post "))).toHaveLength(1);
  expect(calls.at(-1)).toContain(`get /api/2.0/genie/spaces/${created.space_id}?include_serialized_space=true`);
});
