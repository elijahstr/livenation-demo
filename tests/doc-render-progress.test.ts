import { expect, test } from "bun:test";

const renderer = new URL("../docs/design/databricks-layout/render.ts", import.meta.url).pathname;
const plan = new URL("../docs/plans/2026-10-16-premium-databricks-foundation.md", import.meta.url).pathname;

async function renderInChild(markdown: string): Promise<string> {
  const program = [
    `import { page } from ${JSON.stringify(renderer)};`,
    `const markdown = ${JSON.stringify(markdown)};`,
    "process.stdout.write(page(markdown));",
  ].join("\n");
  const child = Bun.spawn({
    cmd: ["timeout", "--kill-after=2s", "5s", "bun", "--eval", program],
    stdout: "pipe",
    stderr: "pipe",
  });
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(status, stderr).toBe(0);
  return stdout;
}

test("the renderer makes progress for malformed markers and fences", async () => {
  for (const markdown of ["<!-- fig:broken", "<!-- digest:start", "```sql\nSELECT 1"]) {
    await expect(renderInChild(markdown)).resolves.toContain("<!doctype html>");
  }
});

test("the renderer completes the normal foundation plan", async () => {
  const markdown = await Bun.file(plan).text();
  await expect(renderInChild(markdown)).resolves.toContain("Premium Databricks foundation");
});
