import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn, type Subprocess } from "bun";
import { createServer } from "node:net";
import WebSocket from "ws";

const ROOT = new URL("..", import.meta.url).pathname;
let port = 0;
let proc: Subprocess;
let ws: WebSocket;
let seq = 1;
const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
const notifications: any[] = [];

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Could not allocate a test port"));
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function waitFor<T>(check: () => T | undefined | Promise<T | undefined>, timeout = 20_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = async () => {
      try {
        const result = await check();
        if (result !== undefined) return resolve(result);
        if (Date.now() - started > timeout) return reject(new Error("Timed out waiting for condition"));
        setTimeout(tick, 30);
      } catch (error) {
        if (Date.now() - started > timeout) return reject(error);
        setTimeout(tick, 30);
      }
    };
    tick();
  });
}

function rpc(method: string, params: any = {}) {
  const id = seq++;
  ws.send(JSON.stringify({ type: "rpc", id, method, params }));
  return new Promise<any>((resolve, reject) => pending.set(id, { resolve, reject }));
}

beforeAll(async () => {
  port = await freePort();
  proc = spawn({
    cmd: ["bun", "run", "server.ts"],
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      const body = await response.json();
      return body.codex ? true : undefined;
    } catch { return undefined; }
  });
  ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "rpc/result" || msg.type === "rpc/error") {
      const item = pending.get(msg.id);
      if (!item) return;
      pending.delete(msg.id);
      msg.type === "rpc/result" ? item.resolve(msg.result) : item.reject(new Error(msg.error));
    } else if (msg.type === "codex/notification") notifications.push(msg.payload);
  });
  await new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
}, 30_000);

afterAll(() => {
  ws?.close();
  proc?.kill();
});

describe("Codex WebUI app-server bridge", () => {
  test("loads models and threads from the real Codex app-server", async () => {
    const [models, threads] = await Promise.all([
      rpc("model/list", { limit: 5 }),
      rpc("thread/list", { limit: 3, sortKey: "recency_at", sortDirection: "desc" }),
    ]);
    expect(models.data.length).toBeGreaterThan(0);
    expect(models.data[0].model).toBeString();
    expect(threads.data.length).toBeGreaterThan(0);
    expect(threads.data[0].id).toBeString();
  });

  test("streams a harmless real turn to completion", async () => {
    const started = await rpc("thread/start", {
      cwd: ROOT,
      model: "gpt-5.4-mini",
      approvalPolicy: "never",
      sandbox: "read-only",
      ephemeral: true,
      sessionStartSource: "startup",
    });
    const threadId = started.thread.id;
    const turn = await rpc("turn/start", {
      threadId,
      input: [{ type: "text", text: "Reply with exactly WEBUI_OK and do not use tools." }],
      model: "gpt-5.4-mini",
      effort: "low",
      approvalPolicy: "never",
    });
    const turnId = turn.turn.id;
    const completed = await waitFor(() => notifications.find((n) => n.method === "turn/completed" && n.params.threadId === threadId && n.params.turn.id === turnId), 60_000);
    const deltas = notifications.filter((n) => n.method === "item/agentMessage/delta" && n.params.threadId === threadId && n.params.turnId === turnId).map((n) => n.params.delta).join("");
    expect(completed.params.turn.status).toBe("completed");
    expect(deltas).toContain("WEBUI_OK");
  }, 70_000);
});
