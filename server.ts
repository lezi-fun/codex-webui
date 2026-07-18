import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { WebSocketServer, WebSocket } from "ws";
import { defaultBrowseRoots, isDirectory, listFolders, resolveBrowsePath } from "./folder-service.js";
import { applyReviewPatch } from "./review-service.js";
import { resolveAccountIdentity } from "./profile-service.js";

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 8899);
const publicDir = resolve(import.meta.dir, "public");
const homeDir = process.env.HOME || process.cwd();
const defaultCwd = resolve(process.env.CODEX_WEBUI_CWD || import.meta.dir);
const browseRoots = defaultBrowseRoots(homeDir);
const reviewRoots = [resolve(process.env.CODEX_WEBUI_REVIEW_ROOT || defaultCwd)];
const clients = new Set<WebSocket>();
const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
let seq = 1;
let codex: ChildProcessWithoutNullStreams | null = null;
let stdoutBuffer = "";
let connected = false;
let accountCache: { expiresAt: number; value: Awaited<ReturnType<typeof resolveAccountIdentity>> } | null = null;

async function getAccountIdentity(refresh = false) {
  if (!refresh && accountCache && accountCache.expiresAt > Date.now()) return accountCache.value;
  const account = await request("account/read", { refreshToken: refresh });
  const value = await resolveAccountIdentity(account);
  accountCache = { value, expiresAt: Date.now() + 5 * 60_000 };
  return value;
}

function startCodex() {
  if (codex && codex.exitCode === null) return;
  codex = spawn("codex", ["app-server", "--stdio"], {
    cwd: defaultCwd,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  connected = false;
  stdoutBuffer = "";
  codex.stdout.setEncoding("utf8");
  codex.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    for (;;) {
      const pos = stdoutBuffer.indexOf("\n");
      if (pos < 0) break;
      const line = stdoutBuffer.slice(0, pos).trim();
      stdoutBuffer = stdoutBuffer.slice(pos + 1);
      if (!line) continue;
      try { handleCodex(JSON.parse(line)); }
      catch (error) { console.error("[codex-webui] invalid app-server JSON:", line, error); }
    }
  });
  codex.stderr.setEncoding("utf8");
  codex.stderr.on("data", (data) => console.error("[codex app-server]", String(data).trimEnd()));
  codex.on("exit", (code, signal) => {
    connected = false;
    accountCache = null;
    broadcast({ type: "bridge/status", status: "disconnected", code, signal });
    for (const item of pending.values()) item.reject(new Error("Codex app-server exited"));
    pending.clear();
    codex = null;
    setTimeout(startCodex, 1000);
  });
  initialize().catch((error) => {
    console.error("[codex-webui] initialize failed", error);
    codex?.kill();
  });
}

function sendRaw(message: any) {
  startCodex();
  codex!.stdin.write(JSON.stringify(message) + "\n");
}

function request(method: string, params: any = {}) {
  const id = seq++;
  sendRaw({ id, method, params });
  return new Promise<any>((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Codex request timed out: ${method}`));
    }, 30000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolvePromise(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
  });
}

async function initialize() {
  const result = await request("initialize", {
    clientInfo: { name: "codex-webui", title: "Codex WebUI", version: "0.2.0" },
    capabilities: { experimentalApi: true },
  });
  sendRaw({ method: "initialized", params: {} });
  connected = true;
  broadcast({ type: "bridge/status", status: "connected", info: result });
}

function handleCodex(message: any) {
  if (message.id !== undefined && ("result" in message || "error" in message)) {
    const item = pending.get(Number(message.id));
    if (item) {
      pending.delete(Number(message.id));
      if (message.error) item.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else item.resolve(message.result);
      return;
    }
  }
  if (message.id !== undefined && message.method) {
    broadcast({ type: "codex/request", payload: message });
    return;
  }
  if (message.method) {
    if (message.method === "account/updated") accountCache = null;
    broadcast({ type: "codex/notification", payload: message });
  }
}

function broadcast(data: any) {
  const text = JSON.stringify(data);
  for (const client of clients) if (client.readyState === WebSocket.OPEN) client.send(text);
}

async function handleClient(client: WebSocket, message: any) {
  const id = message.id;
  try {
    if (message.type === "rpc") {
      const result = await request(message.method, message.params || {});
      client.send(JSON.stringify({ type: "rpc/result", id, result }));
      return;
    }
    if (message.type === "codex/response") {
      sendRaw({ id: message.requestId, result: message.result });
      return;
    }
    if (message.type === "codex/error") {
      sendRaw({ id: message.requestId, error: message.error });
      return;
    }
    if (message.type === "ping") client.send(JSON.stringify({ type: "pong" }));
  } catch (error) {
    client.send(JSON.stringify({ type: "rpc/error", id, error: error instanceof Error ? error.message : String(error) }));
  }
}

const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/api/health") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify({ ok: true, codex: connected, version: "0.2.0" }));
    return;
  }
  if (url.pathname === "/api/config") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify({ home: homeDir, defaultCwd, reviewRoot: reviewRoots[0] }));
    return;
  }
  if (url.pathname === "/api/account") {
    try {
      const account = await getAccountIdentity(url.searchParams.get("refresh") === "1");
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify(account));
    } catch (error) {
      console.warn("[codex-webui] account request failed:", error instanceof Error ? error.message : String(error));
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify(await resolveAccountIdentity({ account: null, requiresOpenaiAuth: true })));
    }
    return;
  }
  if (url.pathname === "/api/folders") {
    try {
      const path = resolveBrowsePath(url.searchParams.get("path") || "~", browseRoots, homeDir);
      if (!isDirectory(path)) throw new Error("Directory not found");
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify(listFolders(path, browseRoots)));
    } catch (error) {
      res.writeHead(400, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }
  if (url.pathname === "/api/review/patch") {
    if (req.method !== "POST") {
      res.writeHead(405, { "content-type": "application/json; charset=utf-8", allow: "POST" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    let body = "";
    req.setEncoding("utf8");
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 2_000_000) req.destroy(new Error("Review patch payload too large"));
    });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        if (!payload.cwd || !payload.diff || !payload.action) throw new Error("Missing review patch parameters");
        const result = await applyReviewPatch(payload, reviewRoots);
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
    });
    return;
  }
  if (url.pathname.startsWith("/vendor/katex/")) {
    const relative = decodeURIComponent(url.pathname.slice("/vendor/katex/".length));
    const katexDir = resolve(import.meta.dir, "node_modules/katex/dist");
    const file = resolve(katexDir, relative);
    if (!file.startsWith(katexDir) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); res.end("Not found"); return;
    }
    res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream", "cache-control": "public, max-age=86400" });
    res.end(readFileSync(file));
    return;
  }
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const file = resolve(publicDir, "." + pathname);
  if (!file.startsWith(publicDir) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); res.end("Not found"); return;
  }
  res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  res.end(readFileSync(file));
});

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (client) => {
  clients.add(client);
  client.send(JSON.stringify({ type: "bridge/status", status: connected ? "connected" : "connecting" }));
  client.on("message", (raw) => {
    try { handleClient(client, JSON.parse(String(raw))); }
    catch (error) { client.send(JSON.stringify({ type: "rpc/error", error: String(error) })); }
  });
  client.on("close", () => clients.delete(client));
});

const frontendBuild = await Bun.build({
  entrypoints: [resolve(publicDir, "app.js")],
  outdir: publicDir,
  naming: "app.bundle.js",
  target: "browser",
  minify: false,
});
if (!frontendBuild.success) throw new Error(`Frontend build failed: ${frontendBuild.logs.join("\n")}`);

startCodex();
server.listen(port, host, () => {
  console.log(`Codex WebUI listening on http://${host}:${port}`);
  const addresses = Object.values(networkInterfaces()).flat().filter((entry): entry is NonNullable<typeof entry> => !!entry && entry.family === "IPv4" && !entry.internal);
  for (const entry of addresses) console.log(`LAN: http://${entry.address}:${port}`);
});

function shutdown() {
  for (const client of clients) client.close();
  codex?.kill();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
