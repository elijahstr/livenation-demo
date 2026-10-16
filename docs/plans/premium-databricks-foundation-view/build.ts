import { renderDigest } from "./render.ts";

const source = new URL("../2026-10-16-premium-databricks-foundation.md", import.meta.url);
const output = new URL("./premium-databricks-foundation.html", import.meta.url);
const markdown = await Bun.file(source).text();

await Bun.write(output, `${renderDigest(markdown).trim()}\n`);
console.log(output.pathname);
