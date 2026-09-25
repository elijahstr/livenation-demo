import { standalone } from "./render.ts";

const plan = new URL("../2026-09-25-kimi-harness-deployment.md", import.meta.url);
const output = new URL("./kimi-harness-deployment.html", import.meta.url);

await Bun.write(output, standalone(await Bun.file(plan).text()));
console.log(output.pathname);
