import { join, normalize } from "node:path";
import { safeChatErrorMessage, type ChatService } from "./chat-service";

type Check = { status: string; [key: string]: unknown };
type CheckProgress = { type: "phase" | "risk-identified" | "recommendations-ready" | "tool" | "token"; [key: string]: unknown };
type CheckOptions = { signal?: AbortSignal; onEvent?: (event: CheckProgress) => void | Promise<void>; onInvocationStart?: () => void };
type ServerDependencies = {
  port?: number;
  salesCheck(options?: CheckOptions): Promise<Check>;
  state(): Promise<unknown>;
  chat?: Pick<ChatService, "createSession" | "validateTurn" | "run">;
  createAction?(body: unknown): Promise<unknown>;
  editAction?(id: string, body: unknown): Promise<unknown>;
  approveAction?(id: string): Promise<unknown>;
  executeAction?(id: string): Promise<unknown>;
  getAction?(id: string): Promise<unknown>;
  now?: () => number;
};

function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "cache-control": "no-store" } }); }
async function body(request: Request) { try { return await request.json(); } catch { throw new Error("Request body must be JSON"); } }
function httpError(status: number, message: string) { return Object.assign(new Error(message), { status }); }

async function chatBody(request: Request): Promise<{ sessionId: string; message: string }> {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (reader) while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 16 * 1024) { await reader.cancel(); throw httpError(413, "Chat request is too large"); }
      chunks.push(next.value);
    }
  } finally { reader?.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw httpError(400, "Request body must be JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw httpError(400, "Chat input must be an object");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => key !== "message" && key !== "sessionId") || typeof input.sessionId !== "string" || typeof input.message !== "string" || !input.message.trim()) throw httpError(400, "Chat requires only a message and sessionId");
  if (input.message.length > 4000) throw httpError(413, "Chat message is too large");
  return { sessionId: input.sessionId, message: input.message.trim() };
}

function isLoopbackHost(value: string | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(`http://${value}`);
    return !url.username && !url.password && url.pathname === "/" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch { return false; }
}
function isLoopbackOrigin(value: string): boolean {
  try { const url = new URL(value); return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"); }
  catch { return false; }
}

export function createServer(dependencies: ServerDependencies) {
  const publicDir = join(import.meta.dir, "..", "public");
  const now = dependencies.now ?? Date.now;
  let active = false;
  let remoteUntil = 0;
  const busy = () => active || now() < remoteUntil;
  const invoked = (seconds: number) => { remoteUntil = now() + (seconds + 5) * 1000; };

  function streamResponse(request: Request, work: (options: { signal: AbortSignal; onEvent: (event: Record<string, unknown>) => void; onInvocationStart: () => void }) => Promise<unknown>, timeoutSeconds: number, isChat = false) {
    active = true;
    const encoder = new TextEncoder();
    const aborter = new AbortController();
    let closed = false;
    const abort = () => aborter.abort();
    request.signal.addEventListener("abort", abort, { once: true });
    if (request.signal.aborted) abort();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: Record<string, unknown>) => {
          if (closed || aborter.signal.aborted) return;
          try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); }
          catch { closed = true; abort(); }
        };
        void (async () => {
          const started = now();
          try {
            const result = await work({ signal: aborter.signal, onEvent: send, onInvocationStart: () => invoked(timeoutSeconds) });
            if (!aborter.signal.aborted && (result as Check)?.status !== "error") remoteUntil = 0;
            send({ type: "result", result, elapsedMs: now() - started });
          } catch (error) {
            if (!aborter.signal.aborted) send({ type: "error", message: isChat ? safeChatErrorMessage(error) : error instanceof Error ? error.message : "Portfolio check failed", newChatRequired: isChat, elapsedMs: now() - started });
          } finally {
            request.signal.removeEventListener("abort", abort);
            active = false;
            if (!closed) { closed = true; try { controller.close(); } catch {} }
          }
        })();
      },
      cancel() { closed = true; abort(); },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
  }

  return Bun.serve({
    hostname: "127.0.0.1",
    port: dependencies.port ?? Number(process.env.PORT ?? 3000),
    idleTimeout: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const host = request.headers.get("host");
      if (!isLoopbackHost(host)) return new Response("Invalid Host", { status: 400 });
      const origin = request.headers.get("origin");
      if (origin && !isLoopbackOrigin(origin)) return new Response("Invalid Origin", { status: 400 });
      if (!url.pathname.startsWith("/api/")) {
        const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
        if (!["/index.html", "/app.js", "/chat-client.js", "/stream-client.js", "/recovery-workflow.js", "/styles.css", "/assets/outlook.png", "/assets/meta.png"].includes(pathname)) return new Response("Not found", { status: 404 });
        const staticPath = normalize(join(publicDir, pathname));
        if (!staticPath.startsWith(`${publicDir}/`) || pathname.includes("..")) return new Response("Not found", { status: 404 });
        const file = Bun.file(staticPath);
        return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
      }
      try {
        const chatPath = url.pathname === "/api/chat/sessions" || url.pathname === "/api/chat/stream";
        if (chatPath) {
          if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
          if (!origin || origin !== `http://${host}`) return json({ error: "Chat requires the same origin" }, 400);
          if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return json({ error: "Chat requires JSON" }, 400);
          if (!dependencies.chat) return json({ error: "Chat is not configured" }, 503);
          if (url.pathname === "/api/chat/sessions") return json(dependencies.chat.createSession(), 201);
          const input = await chatBody(request);
          if (busy()) return json({ error: "Another agent request is active. Try again shortly." }, 409);
          const turn = dependencies.chat.validateTurn(input);
          return streamResponse(request, options => dependencies.chat!.run(turn, options), 40, true);
        }
        if (url.pathname === "/api/sales-check" && request.method === "POST") {
          if (busy()) return json({ error: "A portfolio check is already active" }, 409);
          active = true;
          try {
            const result = await dependencies.salesCheck({ signal: request.signal, onInvocationStart: () => invoked(60) });
            if (!request.signal.aborted && result.status !== "error") remoteUntil = 0;
            return json(result);
          } finally { active = false; }
        }
        if (url.pathname === "/api/sales-check/stream" && request.method === "POST") {
          if (busy()) return json({ error: "A portfolio check is already active" }, 409);
          return streamResponse(request, options => dependencies.salesCheck(options), 60);
        }
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
        const knownPath = ["/api/sales-check", "/api/sales-check/stream", "/api/state", "/api/actions"].includes(url.pathname) || /^\/api\/actions\/[^/]+(?:\/(approve|execute))?$/.test(url.pathname);
        return new Response(knownPath ? "Method not allowed" : "Not found", { status: knownPath ? 405 : 404 });
      } catch (error) {
        const status = error && typeof error === "object" && "status" in error && [400, 404, 409, 413, 503].includes(Number(error.status)) ? Number(error.status) : 400;
        return json({ error: error instanceof Error ? error.message : "Request failed" }, status);
      }
    },
  });
}
