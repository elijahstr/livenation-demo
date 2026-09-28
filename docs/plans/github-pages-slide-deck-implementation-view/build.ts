import { renderDigest } from "./render.ts";

const source = new URL("../2026-09-28-github-pages-slide-deck-implementation.md", import.meta.url);
const output = new URL("./index.html", import.meta.url);
await Bun.write(output, `${renderDigest(await Bun.file(source).text()).trim()}\n`);
console.log(output.pathname);
