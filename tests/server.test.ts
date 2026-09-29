import { afterEach, describe, expect, test } from "bun:test";
import { createServer } from "../src/server";
import { ActionStore } from "../src/action-store";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const servers: Array<{ stop(): void; port: number }> = [];
afterEach(() => { servers.splice(0).forEach((server) => server.stop()); });

describe("local command-center server", () => {
  test("rejects an unexpected Host header and serves static assets", async () => {
    const server = createServer({ port: 0, salesCheck: async () => ({ status: "healthy" }), state: async () => ({ actions: [] }) });
    servers.push(server);
    const base = `http://127.0.0.1:${server.port}`;
    expect((await fetch(`${base}/`, { headers: { Host: `evil.example:${server.port}` } })).status).toBe(400);
    expect((await fetch(`${base}/`, { headers: { Host: `localhost:${server.port + 1}` } })).status).toBe(200);
    expect((await fetch(`${base}/`, { headers: { Host: "localhost:54407" } })).status).toBe(200);
    expect((await fetch(`${base}/api/sales-check`, { method: "POST", headers: { Origin: "https://evil.example" } })).status).toBe(400);
    expect((await fetch(`${base}/api/sales-check`, { method: "POST", headers: { Origin: base } })).status).toBe(200);
    expect((await fetch(`${base}/api/sales-check`, { method: "POST", headers: { Host: "localhost:54407", Origin: "http://localhost:54407" } })).status).toBe(200);
    expect((await fetch(`${base}/`)).status).toBe(200);
    expect((await fetch(`${base}/../src/server.ts`)).status).not.toBe(200);
    expect((await fetch(`${base}/%2e%2e/src/server.ts`)).status).toBe(404);
    expect((await fetch(`${base}/api/unknown`)).status).toBe(404);
    expect((await fetch(`${base}/api/state`, { method: "POST" })).status).toBe(405);
    expect((await fetch(`${base}/stream-client.js`)).status).toBe(200);
  });

  test("streams ordered sales progress and refuses concurrent checks", async () => {
    let release = () => undefined;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const server = createServer({
      port: 0,
      salesCheck: async (options) => {
        await options?.onEvent?.({ type: "phase", phase: "portfolio", message: "Reading evidence.", elapsedMs: 1 });
        await wait;
        await options?.onEvent?.({ type: "token", text: "Verified recommendation.", elapsedMs: 2 });
        return { status: "healthy" };
      },
      state: async () => ({ actions: [] }),
    });
    servers.push(server);
    const base = `http://127.0.0.1:${server.port}`;

    expect((await fetch(`${base}/api/sales-check/stream`)).status).toBe(405);
    expect((await fetch(`${base}/api/sales-check/stream`, { method: "POST", headers: { Origin: "https://evil.example" } })).status).toBe(400);
    const first = await fetch(`${base}/api/sales-check/stream`, { method: "POST" });
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toContain("application/x-ndjson");
    expect((await fetch(`${base}/api/sales-check/stream`, { method: "POST" })).status).toBe(409);
    expect((await fetch(`${base}/api/sales-check`, { method: "POST" })).status).toBe(409);
    release();
    const events = (await first.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(events.map((event) => event.type)).toEqual(["phase", "token", "result"]);
    expect(events.at(-1)?.result.status).toBe("healthy");
  });

  test("aborts a sales stream after the browser cancels it", async () => {
    let aborted = false;
    const server = createServer({
      port: 0,
      salesCheck: async (options) => {
        await options?.onEvent?.({ type: "phase", phase: "portfolio", message: "Reading evidence.", elapsedMs: 1 });
        await new Promise<void>((resolve) => options?.signal?.addEventListener("abort", () => { aborted = true; resolve(); }, { once: true }));
        options?.signal?.throwIfAborted();
        return { status: "healthy" };
      },
      state: async () => ({ actions: [] }),
    });
    servers.push(server);
    const base = `http://127.0.0.1:${server.port}`;
    const controller = new AbortController();
    const response = await fetch(`${base}/api/sales-check/stream`, { method: "POST", signal: controller.signal });
    const reader = response.body!.getReader();
    expect((await reader.read()).done).toBe(false);
    controller.abort();
    await reader.cancel().catch(() => undefined);
    for (let attempt = 0; attempt < 20 && !aborted; attempt += 1) await Bun.sleep(5);
    expect(aborted).toBe(true);
    expect((await fetch(`${base}/api/state`)).status).toBe(200);
  });

  test("keeps model text literal in the browser source", async () => {
    const app = await Bun.file(new URL("../public/app.js", import.meta.url)).text();
    const page = await Bun.file(new URL("../public/index.html", import.meta.url)).text();
    expect(app).toContain("textContent");
    expect(app).not.toContain("rationale.innerHTML");
    expect(app).toContain("/api/sales-check/stream");
    expect(page).toContain("AT RISK SHOW");
    expect(page).toContain('id="agent-activity"');
    expect(page).toContain('id="approval-stream"');
    expect(page).toContain('class="agent-chat" role="region"');
    const chatStart = page.indexOf('class="agent-chat"');
    const recommendationEnd = page.indexOf("</section>", chatStart);
    expect(chatStart).toBeLessThan(page.indexOf('data-action="email"'));
    expect(page.indexOf('data-action="dismiss"')).toBeLessThan(recommendationEnd);
  });

  test("serves disclosures and permits a route slower than ten seconds", async () => {
    const server = createServer({ port: 0, salesCheck: async () => { await Bun.sleep(10_050); return { status: "healthy" }; }, state: async () => ({ actions: [] }) });
    servers.push(server);
    const base = `http://127.0.0.1:${server.port}`;
    const page = await (await fetch(`${base}/`)).text();
    expect(page).toContain("LIVE NATION PORTFOLIO VENUE");
    expect(page).toContain("Real venue with synthetic demonstration data");
    expect((await fetch(`${base}/api/sales-check`, { method: "POST" })).status).toBe(200);
  }, 15_000);

  test("drives every local action route through a real store", async () => {
    const directory = await mkdtemp(join(tmpdir(), "livenation-server-"));
    try {
      const actions = new ActionStore(join(directory, "actions.json")); const snapshot = "current";
      const server = createServer({ port: 0, salesCheck: async () => ({ status: "healthy" }), state: async () => ({ actions: await actions.list() }), createAction: async (body) => { const input = body as { alertSnapshotHash: string; actionType: "social"; content: string }; if (input.alertSnapshotHash !== snapshot) throw new Error("Action snapshot is not current"); return actions.create(input); }, editAction: (id, body) => actions.edit(id, (body as { content: string }).content), approveAction: (id) => actions.approve(id), executeAction: (id) => actions.execute(id), getAction: (id) => actions.get(id) });
      servers.push(server); const base = `http://127.0.0.1:${server.port}`;
      const post = (path: string, body?: unknown) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      expect((await post("/api/actions", { alertSnapshotHash: "old", actionType: "social", content: "x" })).status).toBe(400);
      const created = await (await post("/api/actions", { alertSnapshotHash: snapshot, actionType: "social", content: "x" })).json() as { action_id: string };
      await fetch(`${base}/api/actions/${created.action_id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: "edited" }) });
      expect((await post(`/api/actions/${created.action_id}/execute`)).status).toBe(400);
      await post(`/api/actions/${created.action_id}/approve`); const first = await (await post(`/api/actions/${created.action_id}/execute`)).json() as { action_id: string; status: string }; const second = await (await post(`/api/actions/${created.action_id}/execute`)).json() as { action_id: string };
      expect(first.status).toBe("completed"); expect(second.action_id).toBe(first.action_id);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
