import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const slidesDirectory = resolve(import.meta.dir, "../slides");
const expectedFiles = [".nojekyll", "README.md", "app.js", "index.html", "serve.ts", "styles.css"];
const assetPath = (name: string) => resolve(slidesDirectory, name);
const deckExists = () => expectedFiles.every((name) => existsSync(assetPath(name)));

async function source(name: string) {
  return Bun.file(assetPath(name)).text();
}

describe("GitHub Pages slide deck", () => {
  test("ships the complete static payload", () => {
    expect(deckExists()).toBe(true);
    expect(readdirSync(slidesDirectory).sort()).toEqual(expectedFiles.slice().sort());
    expect(readdirSync(slidesDirectory).every((name) => !name.startsWith("_") && !name.startsWith("#"))).toBe(true);
  });

  test("has five labelled slides and honest disclosures", async () => {
    if (!deckExists()) return;
    const html = await source("index.html");
    const sections = [...html.matchAll(/<section\b[^>]*class="[^"]*\bslide\b[^"]*"[^>]*>[\s\S]*?<\/section>/g)];
    const labels = sections.map(([section]) => section.match(/aria-labelledby="([^"]+)"/)?.[1]);

    expect(sections).toHaveLength(5);
    expect(labels.every(Boolean)).toBe(true);
    expect(new Set(labels).size).toBe(5);
    expect(sections.every(([section], index) => section.includes(`Slide ${index + 1} of 5`))).toBe(true);
    expect(html).toContain("Independent demo");
    expect(html).toContain("Synthetic data");
    expect(html).toContain("Verified September 28, 2026");
    expect(html).toMatch(/<title>[^<]*Independent demo[^<]*<\/title>/i);
    expect(html).toMatch(/<meta\s+name="robots"\s+content="noindex, nofollow"/i);
    expect(html).toMatch(/<link\s+rel="icon"\s+href="data:,"\s*>/i);
    expect(html).not.toMatch(/<body[^>]*interactive-deck/);
  });

  test("keeps proof links safe and places logged-in status beside console links", async () => {
    if (!deckExists()) return;
    const html = await source("index.html");
    const proofCards = [...html.matchAll(/<article class="proof-card"[\s\S]*?<\/article>/g)].map(([card]) => card);
    const proofLinks = [...html.matchAll(/<a\s+[^>]*data-proof-link[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];

    expect(proofLinks.length).toBeGreaterThanOrEqual(3);
    for (const [, href] of proofLinks) {
      expect(href).toMatch(/^https:\/\//);
      expect(new URL(href).hostname).not.toBe("");
      expect(href).not.toMatch(/[?&](?:token|access_token|signature|sig|credential|password|secret|aws_access_key_id)=/i);
    }
    const databricks = proofCards.find((card) => card.includes("dbc-da714a97-83a0.cloud.databricks.com"));
    const agentCore = proofCards.find((card) => card.includes("console.aws.amazon.com/bedrock-agentcore"));
    expect(databricks).toContain("Console login required");
    expect(databricks).toContain("VIEW");
    expect(databricks).toContain("six validated synthetic rows");
    expect(agentCore).toContain("Console login required");
    expect(agentCore).toContain("READY");
    expect(agentCore).toContain("moonshotai.kimi-k2.5");
    expect(agentCore).toContain("get_sales_evidence");
    expect(databricks).toMatch(/target="_blank"\s+rel="noreferrer"/);
    expect(agentCore).toMatch(/target="_blank"\s+rel="noreferrer"/);
  });

  test("uses light progressive enhancement and accessible navigation", async () => {
    if (!deckExists()) return;
    const [css, script] = await Promise.all([source("styles.css"), source("app.js")]);

    expect(css).toMatch(/:root\s*\{[\s\S]*color-scheme:\s*light/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(css).toMatch(/:focus-visible/);
    expect(css).toMatch(/\.deck-controls\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/\.interactive-deck\s+\.deck-controls\s*\{[^}]*display:\s*flex/);
    expect(script).toContain('classList.add("interactive-deck")');
    expect(script).toContain("ArrowLeft");
    expect(script).toContain("ArrowRight");
    expect(script).toContain("Home");
    expect(script).toContain("End");
    expect(script).toContain("touchstart");
    expect(script).toContain("touchend");
    expect(script).toContain("aria-hidden");
    expect(script).toContain("focus()");
  });
});
