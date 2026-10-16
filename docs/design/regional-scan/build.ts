import { full } from "./render.ts";
const source = new URL("../../plans/2026-10-16-regional-scan.md", import.meta.url);
await Bun.write(new URL("regional-scan-review.html", import.meta.url), full(await Bun.file(source).text()));
console.log("regional-scan-review.html");
