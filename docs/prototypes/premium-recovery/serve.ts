// Throwaway UI prototype server. Run with: bun docs/prototypes/premium-recovery/serve.ts
const html = Bun.file(new URL("./index.html", import.meta.url));

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 4408,
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/index.html") {
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

console.log(`Premium recovery prototype: ${server.url}`);
