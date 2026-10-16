import { page } from "./render.ts";
import { ARCHITECTURE_FIGURES, ARCHITECTURE_FIGURE_CSS, ARCHITECTURE_NAV } from "./figures-architecture.ts";

const source = new URL("./proposal.md", import.meta.url);
const architectureSource = new URL("./architecture.md", import.meta.url);
const port = Number(process.env.PORT ?? "4416");
const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const markdown = await Bun.file(source).text();
    const architecture = await Bun.file(architectureSource).text();
    const headers = { "cache-control": "no-store" };
    if (path === "/") return new Response(page(markdown, true), { headers: { ...headers, "content-type": "text/html; charset=utf-8" } });
    if (path === "/full") return new Response(page(markdown), { headers: { ...headers, "content-type": "text/html; charset=utf-8" } });
    if (path === "/raw") return new Response(markdown, { headers: { ...headers, "content-type": "text/markdown; charset=utf-8" } });
    const architectureOptions = { figures: ARCHITECTURE_FIGURES, extraCss: ARCHITECTURE_FIGURE_CSS, links: '<a href="/architecture/full">Read full walkthrough</a><a href="/architecture/raw">Markdown source</a>', nav: ARCHITECTURE_NAV };
    if (path === "/architecture") return new Response(page(architecture, true, architectureOptions), { headers: { ...headers, "content-type": "text/html; charset=utf-8" } });
    if (path === "/architecture/full") return new Response(page(architecture, false, architectureOptions), { headers: { ...headers, "content-type": "text/html; charset=utf-8" } });
    if (path === "/architecture/raw") return new Response(architecture, { headers: { ...headers, "content-type": "text/markdown; charset=utf-8" } });
    return new Response("Not found", { status: 404, headers });
  },
});
console.log(`http://127.0.0.1:${server.port}`);
