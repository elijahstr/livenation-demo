import { full, teachingDocument } from "./render.ts";
const source = new URL("../../plans/2026-10-16-regional-scan.md", import.meta.url);
await Bun.write(new URL("regional-scan-review.html", import.meta.url), full(await Bun.file(source).text()));
const scale = new URL("scale-and-retrieval.md", import.meta.url);
await Bun.write(new URL("regional-scan-scale-explainer.html", import.meta.url), teachingDocument(await Bun.file(scale).text()));
const practices = new URL("best-practices.md", import.meta.url);
await Bun.write(new URL("regional-scan-best-practices.html", import.meta.url), teachingDocument(await Bun.file(practices).text(), "Regional scan reliability practices"));
console.log("regional-scan-review.html\nregional-scan-scale-explainer.html\nregional-scan-best-practices.html");
