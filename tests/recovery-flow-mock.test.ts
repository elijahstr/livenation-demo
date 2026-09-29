import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const mockPath = resolve(import.meta.dir, "../mocks/recovery-case-file.html");

async function source() {
  return Bun.file(mockPath).text();
}

function workflow(html: string) {
  const match = html.match(/<main\b[^>]*data-recovery-workflow[^>]*>([\s\S]*?)<\/main>/i);
  expect(match).not.toBeNull();
  return match?.[1] ?? "";
}

function tagWithAttributes(html: string, tag: string, attributes: RegExp[]) {
  return new RegExp(`<${tag}\\b${attributes.map((attribute) => `(?=[^>]*${attribute.source})`).join("")}[^>]*>`, "i");
}

function assetSource(card: string, channel: string, alt: string) {
  const image = card.match(tagWithAttributes(card, "img", [
    new RegExp(`data-channel-logo=["']${channel}["']`, "i"),
    /src=["'][^"']+["']/i,
    new RegExp(`alt=["']${alt}["']`, "i"),
  ]));

  return image?.[0].match(/\bsrc=["']([^"']+)["']/i)?.[1];
}

describe("Recovery Case File mock", () => {
  test("ships one focused recovery case file instead of alternative mock tabs", async () => {
    const html = await source();

    expect(html).toMatch(/<main\b[^>]*data-recovery-workflow/i);
    expect(html).toContain("Recovery Case File");
    expect(html).not.toMatch(/role=["']tab(?:list|panel)["']/i);
    expect(html).not.toMatch(/Alternative\s+[A-C]/i);
  });

  test("starts with only the recovery agent and a run control", async () => {
    const html = await source();
    const caseFile = workflow(html);

    expect(caseFile).toMatch(/data-recovery-state=["']idle["']/i);
    expect(caseFile).toMatch(/data-stage=["']agent["']/i);
    expect(caseFile).toMatch(/data-action=["']start-recovery["']/i);
    expect(caseFile).toMatch(tagWithAttributes(caseFile, "ol", [/data-agent-activity/i, /\bhidden\b/i]));
    expect(caseFile).toMatch(tagWithAttributes(caseFile, "section", [/data-stage=["']at-risk["']/i, /\bhidden\b/i]));
    expect(caseFile).toMatch(tagWithAttributes(caseFile, "section", [/data-stage=["']recommendations["']/i, /\bhidden\b/i]));
    expect(caseFile).toMatch(tagWithAttributes(caseFile, "section", [/data-stage=["']review["']/i, /\bhidden\b/i]));
  });

  test("declares the ordered recovery progression", async () => {
    const html = await source();

    expect(html).toMatch(/data-event=["']sales-loaded["']/i);
    expect(html).toMatch(/data-event=["']risk-identified["']/i);
    expect(html).toMatch(/data-event=["']recommendations-ready["']/i);
    expect(html).toMatch(/setState\(["']risk-ready["']\)/i);
    expect(html).toMatch(/setState\(["']recommendations-ready["']\)/i);
    expect(html).toMatch(/setState\(["']recommendation-selected["']\)/i);
    expect(html).toMatch(/data-action=["']select-recommendation["']/i);
    expect(html).toMatch(tagWithAttributes(html, "section", [/data-stage=["']at-risk["']/i, /data-reveals-on=["']risk-identified["']/i]));
    expect(html).toMatch(tagWithAttributes(html, "section", [/data-stage=["']recommendations["']/i, /data-reveals-on=["']recommendations-ready["']/i]));
    expect(html).toMatch(tagWithAttributes(html, "section", [/data-stage=["']review["']/i, /data-reveals-on=["']recommendation-selected["']/i]));
  });

  test("identifies the supplied outreach channels with image assets", async () => {
    const html = await source();
    const cards = [...html.matchAll(/<article\b[^>]*data-recommendation=["']([^"']+)["'][^>]*>([\s\S]*?)<\/article>/gi)];
    const card = (name: string) => cards.find(([, recommendation]) => recommendation === name)?.[2] ?? "";

    const outlook = assetSource(card("suite-outreach"), "outlook", "Outlook");
    const meta = assetSource(card("seat-campaign"), "meta", "Meta");

    expect(outlook).toBeDefined();
    expect(meta).toBeDefined();
    expect(outlook).toMatch(/^(?!https?:|data:).+/i);
    expect(meta).toMatch(/^(?!https?:|data:).+/i);
    expect(existsSync(resolve(dirname(mockPath), outlook!))).toBe(true);
    expect(existsSync(resolve(dirname(mockPath), meta!))).toBe(true);
  });

  test("keeps the data disclosure quiet and outside workflow content", async () => {
    const html = await source();
    const caseFile = workflow(html);
    const syntheticUses = html.match(/synthetic/gi) ?? [];

    expect(caseFile).not.toMatch(/synthetic/i);
    expect(syntheticUses).toHaveLength(1);
    expect(html).toMatch(/<footer\b[^>]*data-demo-disclosure[^>]*>[\s\S]*SYNTHETIC DATA/i);
    expect(html).toMatch(/INDEPENDENT DEMO/i);
  });
});
