import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const directory = import.meta.dir;
const rootPrefix = `${directory}/`;
const port = Number(Bun.env.PORT || 4173);
const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function contentType(path: string) {
  const extension = path.slice(path.lastIndexOf("."));
  return contentTypes[extension] || "application/octet-stream";
}

Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch(request) {
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Method Not Allowed", { status: 405 });
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const requested = pathname === "/" ? "index.html" : pathname.slice(1);
    const filePath = resolve(directory, requested);
    if (!filePath.startsWith(rootPrefix) || !existsSync(filePath) || statSync(filePath).isDirectory()) return new Response("Not Found", { status: 404 });
    const headers = { "content-type": contentType(filePath), "x-content-type-options": "nosniff" };
    return request.method === "HEAD" ? new Response(null, { headers }) : new Response(Bun.file(filePath), { headers });
  },
});

console.log(`Slides available at http://127.0.0.1:${port}`);
