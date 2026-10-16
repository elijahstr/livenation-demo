import { standalone } from "./render.ts";

const plan = new URL("../2026-10-16-agentcore-chat-observability.md", import.meta.url);
const port = Number(process.env.PLAN_PORT ?? 4427);
const server = Bun.serve({ hostname: "127.0.0.1", port, fetch: async (request) => {
  const url = new URL(request.url);
  if (url.pathname === "/raw") return new Response(Bun.file(plan), { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store" } });
  if (url.pathname !== "/" && url.pathname !== "/full") return new Response("Not found", { status: 404 });
  return new Response(standalone(await Bun.file(plan).text()), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
} });
console.log(`AgentCore chat plan: http://127.0.0.1:${server.port}`);
await new Promise<void>(() => undefined);
