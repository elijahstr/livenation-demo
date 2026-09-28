import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const slidesDirectory = resolve(import.meta.dir, "../slides");
const expectedFiles = [".nojekyll", "README.md", "app.js", "build.ts", "index.html", "index.template.html", "serve.ts", "slide-data.json", "styles.css"];
const assetPath = (name: string) => resolve(slidesDirectory, name);
const deckExists = () => expectedFiles.every((name) => existsSync(assetPath(name)));

async function source(name: string) {
  return Bun.file(assetPath(name)).text();
}

describe("GitHub Pages slide deck", () => {
  test("ships the complete deck source", () => {
    expect(deckExists()).toBe(true);
    expect(readdirSync(slidesDirectory).sort()).toEqual(expectedFiles.slice().sort());
    expect(readdirSync(slidesDirectory).every((name) => !name.startsWith("_") && !name.startsWith("#"))).toBe(true);
  });

  test("keeps the committed index equal to a fresh static build", async () => {
    const committedIndex = await source("index.html");
    const result = Bun.spawnSync(["bun", "run", "slides/build.ts"], {
      cwd: resolve(import.meta.dir, ".."),
      stderr: "pipe",
      stdout: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(await source("index.html")).toBe(committedIndex);
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

  test("generates safe proof-link fallbacks from reviewed slide data", async () => {
    if (!deckExists()) return;
    const [html, script, data] = await Promise.all([source("index.html"), source("app.js"), source("slide-data.json")]);
    const proofCards = [...html.matchAll(/<article class="proof-card"[\s\S]*?<\/article>/g)].map(([card]) => card);
    const proofLinks = [...html.matchAll(/<a\s+[^>]*data-proof-link="([^"]+)"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    const slideData = JSON.parse(data) as { proofLinks: Record<string, { href: string; target: string; rel: string }> };

    expect(Object.keys(slideData.proofLinks).sort()).toEqual(["agentcore", "databricks", "implementation", "repository"]);
    expect(Object.values(slideData.proofLinks).map(({ href }) => href)).toEqual([
      "https://dbc-da714a97-83a0.cloud.databricks.com/explore/data/workspace/livenation_demo/current_sales_evidence",
      "https://console.aws.amazon.com/bedrock-agentcore/home?region=us-east-1#/",
      "https://github.com/elijahstr/livenation-demo",
      "https://github.com/elijahstr/livenation-demo/blob/main/docs/plans/2026-09-28-west-region-sales-demo-implementation.md",
    ]);
    expect(proofLinks.map(([, key, href]) => [key, href])).toEqual(Object.entries(slideData.proofLinks).map(([key, details]) => [key, details.href]));
    expect(script).not.toContain("slideData");
    expect(script).not.toContain("data-proof-link");
    for (const { href, target, rel } of Object.values(slideData.proofLinks)) {
      expect(href).toMatch(/^https:\/\//);
      expect(new URL(href).hostname).not.toBe("");
      expect(href).not.toMatch(/[?&](?:token|access_token|signature|sig|credential|password|secret|aws_access_key_id)=/i);
      expect(target).toBe("_blank");
      expect(rel).toBe("noreferrer");
    }
    const databricks = proofCards.find((card) => card.includes('data-proof-link="databricks"'));
    const agentCore = proofCards.find((card) => card.includes('data-proof-link="agentcore"'));
    expect(databricks).toContain("Console login required");
    expect(databricks).toContain("VIEW");
    expect(databricks).toContain("six validated synthetic rows");
    expect(agentCore).toContain("Console login required");
    expect(agentCore).toContain("READY");
    expect(agentCore).toContain("moonshotai.kimi-k2.5");
    expect(agentCore).toContain("get_sales_evidence");
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
