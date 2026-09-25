import { describe, expect, test } from "bun:test";

import {
  assertHarnessSetup,
  assertSyntheticSalesFixture,
  getSalesEvidence,
  type SalesFixture,
} from "../src/local-setup";

async function plannedHarness() {
  return JSON.parse(
    await Bun.file(new URL("../config/create-harness.json", import.meta.url)).text(),
  ) as Record<string, unknown>;
}

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

describe("getSalesEvidence", () => {
  test("returns aggregate evidence only for the caller authorized region", () => {
    expect(
      getSalesEvidence(
        { show_id: "east_show", region: "east" },
        "east",
        fixture,
      ),
    ).toEqual({
      data_as_of: "2026-09-25T00:00:00Z",
      origin: "synthetic",
      region: "east",
      show_id: "east_show",
      tickets_sold_cumulative: 320,
      tickets_target_cumulative: 500,
    });
  });

  test("rejects a cross-region request", () => {
    expect(() =>
      getSalesEvidence(
        { show_id: "east_show", region: "east" },
        "west",
        fixture,
      ),
    ).toThrow("not authorized");
  });

  test("rejects an unknown show", () => {
    expect(() =>
      getSalesEvidence(
        { show_id: "east_show", region: "west" },
        "west",
        fixture,
      ),
    ).toThrow("Unknown synthetic show");
  });

  test("rejects a non-string tool key", () => {
    expect(() =>
      getSalesEvidence({ show_id: ["east_show"], region: "east" }, "east", fixture),
    ).toThrow("Unknown synthetic show");
  });
});

describe("assertSyntheticSalesFixture", () => {
  test("rejects coerced identifiers and fractional ticket counts", () => {
    assertSyntheticSalesFixture(fixture);
    expect(() => assertSyntheticSalesFixture({ ...fixture, shows: [
      { ...fixture.shows[0], show_id: ["east_show"] }, fixture.shows[1],
    ] })).toThrow("must be strings");
    expect(() => assertSyntheticSalesFixture({ ...fixture, shows: [
      { ...fixture.shows[0], tickets_sold_cumulative: 0.5 }, fixture.shows[1],
    ] })).toThrow("integer counts");
  });
  test("rejects extra customer-like fields", () => {
    expect(() =>
      assertSyntheticSalesFixture({
        ...fixture,
        shows: [
          { ...fixture.shows[0], email: "not-allowed@example.test" },
          fixture.shows[1],
        ],
      }),
    ).toThrow("unknown key email");
  });
});

describe("assertHarnessSetup", () => {
  test("accepts direct Kimi and rejects Luna or prefixed Kimi", async () => {
    const candidate = await plannedHarness();
    assertHarnessSetup(candidate);

    candidate.model = { bedrockModelConfig: {
      modelId: "moonshotai.kimi-k2.5", apiFormat: "converse_stream", maxTokens: 1024,
    } };
    expect(() => assertHarnessSetup(candidate)).not.toThrow();

    for (const modelId of ["us.openai.gpt-6-luna", "us.moonshotai.kimi-k2.5"]) {
      candidate.model = { bedrockModelConfig: {
        modelId, apiFormat: "converse_stream", maxTokens: 1024,
      } };
      expect(() => assertHarnessSetup(candidate)).toThrow(
        "Only the direct moonshotai.kimi-k2.5 Converse Stream model route is allowed",
      );
    }
  });

  test("rejects provider parameter overrides", async () => {
    const candidate = await plannedHarness();
    assertHarnessSetup(candidate);
    candidate.model = { bedrockModelConfig: {
      modelId: "moonshotai.kimi-k2.5", apiFormat: "converse_stream", maxTokens: 1024,
      additionalParams: { endpoint_url: "https://invalid.example" },
    } };
    expect(() => assertHarnessSetup(candidate)).toThrow("unknown key additionalParams");
  });
  test("accepts the bounded planned harness configuration", async () => {
    const candidate = await plannedHarness();
    expect(() => assertHarnessSetup(candidate)).not.toThrow();
  });

  test("rejects wildcard tools after the complete candidate passes", async () => {
    const candidate = await plannedHarness();
    assertHarnessSetup(candidate);
    candidate.allowedTools = ["*"];
    expect(() => assertHarnessSetup(candidate)).toThrow("Only get_sales_evidence");
  });

  test("rejects an execution role change after the complete candidate passes", async () => {
    const candidate = await plannedHarness();
    assertHarnessSetup(candidate);
    candidate.executionRoleArn = "arn:aws:iam::009073575420:role/admin";
    expect(() => assertHarnessSetup(candidate)).toThrow("planned role ARN");
  });

  test("rejects a missing timeout after the complete candidate passes", async () => {
    const candidate = await plannedHarness();
    assertHarnessSetup(candidate);
    delete candidate.timeoutSeconds;
    expect(() => assertHarnessSetup(candidate)).toThrow("timeoutSeconds");
  });

  test("rejects an excessive total token limit after the complete candidate passes", async () => {
    const candidate = await plannedHarness();
    assertHarnessSetup(candidate);
    candidate.maxTokens = 2049;
    expect(() => assertHarnessSetup(candidate)).toThrow("maxTokens");
  });
});
