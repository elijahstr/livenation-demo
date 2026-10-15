// Run from the repository root: bun docs/prototypes/premium-sales/serve.ts
const html = Bun.file(new URL("./index.html", import.meta.url));

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 4409,
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/" || pathname === "/index.html") {
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Premium sales workspace: ${server.url}`);
