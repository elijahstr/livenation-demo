import { renderDigest } from "./render.ts";

const source = new URL("../2026-10-16-premium-10k-scale.md", import.meta.url);
const output = new URL("./premium-10k-scale.html", import.meta.url);
await Bun.write(output, `${renderDigest(await Bun.file(source).text()).trim()}\n`);
console.log(output.pathname);
