import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn, type Subprocess } from "bun";
import { createServer } from "node:net";
import { rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import WebSocket from "ws";

const ROOT = new URL("..", import.meta.url).pathname;
let port = 0;
let proc: Subprocess;
let ws: WebSocket;
let seq = 1;
const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
const notifications: any[] = [];
const authorization = `Basic ${Buffer.from("codex:integration-access-token").toString("base64")}`;

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

async function rejectedWebSocketStatus() {
  const script = `
    const WebSocket = require('ws');
    const socket = new WebSocket('ws://127.0.0.1:${port}/ws', { headers: { host: 'codex.example.com', origin: 'http://codex.example.com' } });
    socket.on('unexpected-response', (_request, response) => { process.stdout.write(response.statusCode === 401 ? 'rejected' : String(response.statusCode)); process.exit(response.statusCode === 401 ? 0 : 5); });
    socket.on('open', () => process.exit(2));
    socket.on('error', error => { const message=String(error); if(/socket hang up|401/.test(message)){process.stdout.write('rejected');process.exit(0)} process.stderr.write(message); process.exit(3); });
    setTimeout(() => process.exit(4), 5000);
  `;
  const child = Bun.spawn(["node", "-e", script], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const output = await new Response(child.stdout).text();
  const error = await new Response(child.stderr).text();
  const code = await child.exited;
  if (code !== 0) throw new Error(`WebSocket rejection probe failed (${code}): ${error}`);
  return output.trim();
}

beforeAll(async () => {
  port = await freePort();
  proc = spawn({
    cmd: ["bun", "run", "server.ts"],
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", CODEX_WEBUI_ACCESS_TOKEN: "integration-access-token" },
    stdout: "pipe",
    stderr: "pipe",
  });
  await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { authorization } });
      const body = await response.json();
      return body.codex ? true : undefined;
    } catch { return undefined; }
  });
  ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { authorization } });
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
  test("requires authentication when a reverse proxy supplies a non-localhost host", async () => {
    const denied = await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { host: "codex.example.com" } });
    expect(denied.status).toBe(401);
    expect(denied.headers.get("www-authenticate")).toContain("Basic");

    const allowed = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { host: "codex.example.com", authorization, origin: "http://codex.example.com" },
    });
    expect(allowed.status).toBe(200);

    expect(await rejectedWebSocketStatus()).toBe("rejected");

    const authenticatedUpgrade = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { host: "codex.example.com", origin: "http://codex.example.com", authorization },
    });
    await new Promise<void>((resolve, reject) => {
      authenticatedUpgrade.once("open", resolve);
      authenticatedUpgrade.once("error", reject);
    });
    authenticatedUpgrade.close();
  }, 15_000);

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

  test("blocks filesystem and configuration RPC methods from browser clients", async () => {
    const probe = join(ROOT, `.security-rpc-probe-${process.pid}.txt`);
    const writeProbe = join(ROOT, `.security-rpc-write-probe-${process.pid}.txt`);
    writeFileSync(probe, "harmless probe\n");
    try {
      await expect(rpc("fs/readFile", { path: probe })).rejects.toThrow(/not available|not allowed/i);
      await expect(rpc("fs/writeFile", { path: writeProbe, dataBase64: Buffer.from("blocked").toString("base64") })).rejects.toThrow(/not available|not allowed/i);
      await expect(rpc("config/read", {})).rejects.toThrow(/not available|not allowed/i);
      expect(Bun.file(writeProbe).size).toBe(0);
    } finally {
      rmSync(probe, { force: true });
      rmSync(writeProbe, { force: true });
    }
  });

  test("does not serve public-directory symbolic links", async () => {
    const target = join(ROOT, `.security-static-target-${process.pid}.txt`);
    const name = `security-static-probe-${process.pid}`;
    const link = join(ROOT, "public", name);
    const regularName = `security-static-regular-${process.pid}`;
    const regular = join(ROOT, "public", regularName);
    writeFileSync(target, "harmless probe\n");
    symlinkSync(target, link);
    writeFileSync(regular, "harmless probe\n");
    try {
      const response = await fetch(`http://127.0.0.1:${port}/${name}`, { headers: { authorization } });
      expect(response.status).toBe(404);
      const regularResponse = await fetch(`http://127.0.0.1:${port}/${regularName}`, { headers: { authorization } });
      expect(regularResponse.status).toBe(404);
    } finally {
      rmSync(link, { force: true });
      rmSync(regular, { force: true });
      rmSync(target, { force: true });
    }
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
