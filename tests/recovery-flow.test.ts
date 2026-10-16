import { describe, expect, test } from "bun:test";

const indexPath = new URL("../public/index.html", import.meta.url);
const appPath = new URL("../public/app.js", import.meta.url);

async function page() { return Bun.file(indexPath).text(); }
async function app() { return Bun.file(appPath).text(); }

describe("Recovery Case File product flow", () => {
  test("starts with only Recovery Agent and keeps later stages hidden", async () => {
    const html = await page();

    expect(html).toMatch(/data-recovery-workflow/i);
    expect(html).toMatch(/data-stage=["']agent["']/i);
    expect(html).toMatch(/data-stage=["']at-risk["'][^>]*hidden/i);
    expect(html).toMatch(/data-stage=["']recommendations["'][^>]*hidden/i);
    expect(html).toMatch(/data-stage=["']review["'][^>]*hidden/i);
  });

  test("uses the verified stream gates and persistent action API", async () => {
    const [source, html] = await Promise.all([app(), page()]);

    expect(source).toContain('event.type === "risk-identified"');
    expect(source).toContain('event.type === "recommendations-ready"');
    expect(source).not.toContain('event.type === "result" && event.result?.status === "alert"');
    expect(source).toContain("rationale.textContent = streamState.rationale || terminal.result?.rationale");
    expect(source).toContain("const presentation = presentTerminalResult(terminal.result)");
    expect(source).toContain("if (!controller.signal.aborted) controller.abort()");
    expect(source).toContain('requestJson("/api/actions"');
    expect(source).toContain('method: "POST"');
    expect(html).toContain('data-action="email"');
    expect(html).toContain('data-action="social"');
    expect(html).toContain('data-action="dismiss"');
    expect(html).toContain("UNSOLD SUITES · SCENARIO VALUE");
    expect(html).toContain("PREMIUM SEATS · SCENARIO VALUE");
    expect(source).toContain("This local draft is not sent.");
    expect(source).toContain("does not create or fund a campaign.");
    expect(source).toContain("local audit record only.");
  });

  test("uses served channel assets and one quiet disclosure outside workflow cards", async () => {
    const html = await page();
    const workflow = html.match(/<main\b[^>]*data-recovery-workflow[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? "";
    const cards = workflow.match(/<div class="case-file">([\s\S]*)/i)?.[1] ?? "";

    expect(html).toContain('/assets/outlook.png');
    expect(html).toContain('/assets/meta.png');
    expect(workflow.match(/synthetic/gi)).toHaveLength(1);
    expect(cards).not.toMatch(/synthetic/i);
    expect(html).toMatch(/INDEPENDENT DEMO/i);
  });
});
