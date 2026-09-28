import { standaloneDigest } from "./render.ts";

const source = new URL("../2026-09-28-west-region-sales-demo-design.md", import.meta.url);
const output = new URL("./west-region-sales-demo.html", import.meta.url);

const html = standaloneDigest(await Bun.file(source).text())
  .replace(/[ \t]+$/gm, "")
  .replace(/\n*$/, "\n");

await Bun.write(output, html);
console.log(output.pathname);
