import { renderDigest, renderFull } from "./render.ts";

const source = new URL("../2026-10-16-premium-10k-scale.md", import.meta.url);
const port = Number(process.env.PORT ?? "4195");
const server = Bun.serve({ hostname: "127.0.0.1", port, async fetch(request) {
  const path = new URL(request.url).pathname;
  const markdown = await Bun.file(source).text();
  const headers = { "cache-control": "no-store" };
  if (path === "/") return new Response(renderDigest(markdown), { headers: { ...headers, "content-type": "text/html; charset=utf-8" } });
  if (path === "/full") return new Response(renderFull(markdown), { headers: { ...headers, "content-type": "text/html; charset=utf-8" } });
  if (path === "/raw") return new Response(markdown, { headers: { ...headers, "content-type": "text/markdown; charset=utf-8" } });
  return new Response("Not found", { status: 404, headers });
}});
console.log(`http://127.0.0.1:${server.port}`);
