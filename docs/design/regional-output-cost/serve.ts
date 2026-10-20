import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { content, digest } from "./render.ts";

const root = join(import.meta.dir, "../..");
const plan = join(root, "plans/2026-10-20-regional-output-cost-fixes.md");
const port = Number(process.env.PORT ?? "4215");
const host = "127.0.0.1";

Bun.serve({
  hostname: host,
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const md = await readFile(plan, "utf8");
    if (url.pathname === "/raw") return new Response(md, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store" } });
    if (url.pathname === "/full") return new Response(content(md), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    if (url.pathname === "/") return new Response(digest(md), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Regional output-cost plan: http://${host}:${port}`);
