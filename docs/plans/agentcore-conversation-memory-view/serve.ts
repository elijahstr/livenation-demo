import { FIGURES, FIGURE_CSS } from "./figures.ts";
import { standalone } from "../agentcore-chat-observability-view/render.ts";

const plan = new URL("../2026-10-16-agentcore-conversation-memory.md", import.meta.url);
const port = Number(process.env.PLAN_PORT ?? 4428);
const options = { title: "AgentCore conversation memory implementation plan", eyebrow: "Tier 1 implementation plan", openHeading: "Risks and open questions", figures: FIGURES, figureCss: FIGURE_CSS };
const server = Bun.serve({ hostname: "127.0.0.1", port, fetch: async (request) => {
  const url = new URL(request.url);
  if (url.pathname === "/raw") return new Response(Bun.file(plan), { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store" } });
  if (url.pathname !== "/" && url.pathname !== "/full") return new Response("Not found", { status: 404 });
  return new Response(standalone(await Bun.file(plan).text(), options), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
} });
console.log(`AgentCore memory plan: http://127.0.0.1:${server.port}`);
await new Promise<void>(() => undefined);
