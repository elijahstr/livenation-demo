import { join, normalize } from "node:path";

type Check = { status: string; [key: string]: unknown };
type ServerDependencies = {
  port?: number;
  salesCheck(): Promise<Check>;
  state(): Promise<unknown>;
  createAction?(body: unknown): Promise<unknown>;
  editAction?(id: string, body: unknown): Promise<unknown>;
  approveAction?(id: string): Promise<unknown>;
  executeAction?(id: string): Promise<unknown>;
  getAction?(id: string): Promise<unknown>;
};

function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "content-type": "application/json; charset=utf-8" } }); }
async function body(request: Request) { try { return await request.json(); } catch { throw new Error("Request body must be JSON"); } }

function isLoopbackHost(value: string | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(`http://${value}`);
    return !url.username && !url.password && url.pathname === "/" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch { return false; }
}

function isLoopbackOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch { return false; }
}

export function createServer(dependencies: ServerDependencies) {
  const port = dependencies.port ?? Number(process.env.PORT ?? 3000);
  const publicDir = join(import.meta.dir, "..", "public");
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    idleTimeout: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const host = request.headers.get("host");
      if (!isLoopbackHost(host)) return new Response("Invalid Host", { status: 400 });
      const origin = request.headers.get("origin");
      if (origin && !isLoopbackOrigin(origin)) return new Response("Invalid Origin", { status: 400 });
      if (!url.pathname.startsWith("/api/")) {
        const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
        if (!["/index.html", "/app.js", "/styles.css"].includes(pathname)) return new Response("Not found", { status: 404 });
        const staticPath = normalize(join(publicDir, pathname));
        if (!staticPath.startsWith(`${publicDir}/`) || pathname.includes("..")) return new Response("Not found", { status: 404 });
        const file = Bun.file(staticPath);
        if (!(await file.exists())) return new Response("Not found", { status: 404 });
        return new Response(file);
      }
      try {
        if (url.pathname === "/api/sales-check" && request.method === "POST") return json(await dependencies.salesCheck());
        if (url.pathname === "/api/state" && request.method === "GET") return json(await dependencies.state());
        if (url.pathname === "/api/actions" && request.method === "POST" && dependencies.createAction) return json(await dependencies.createAction(await body(request)), 201);
        const action = url.pathname.match(/^\/api\/actions\/([^/]+)(?:\/(approve|execute))?$/);
        if (action) {
          const [, id, operation] = action;
          if (!operation && request.method === "GET" && dependencies.getAction) return json(await dependencies.getAction(id));
          if (!operation && request.method === "PATCH" && dependencies.editAction) return json(await dependencies.editAction(id, await body(request)));
          if (operation === "approve" && request.method === "POST" && dependencies.approveAction) return json(await dependencies.approveAction(id));
          if (operation === "execute" && request.method === "POST" && dependencies.executeAction) return json(await dependencies.executeAction(id));
        }
        const knownPath = url.pathname === "/api/sales-check" || url.pathname === "/api/state" || /^\/api\/actions\/[^/]+(?:\/(approve|execute))?$/.test(url.pathname) || url.pathname === "/api/actions";
        return new Response(knownPath ? "Method not allowed" : "Not found", { status: knownPath ? 405 : 404 });
      } catch (error) { return json({ error: error instanceof Error ? error.message : "Request failed" }, 400); }
    },
  });
  return server;
}
