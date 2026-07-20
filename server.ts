import { readFileSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { WebSocketServer, WebSocket } from "ws";
import { defaultBrowseRoots, isDirectory, listFolders, resolveBrowsePath } from "./folder-service.js";
import { applyReviewPatch } from "./review-service.js";
import { ReviewDiffStore, parseReviewPatchRequest } from "./review-state.js";
import { createTerminalSession, normalizeTerminalResize, resolveTerminalCwd } from "./terminal-service.js";
import { readWorkspaceContext } from "./workspace-context.js";
import { searchWorkspaceFiles } from "./file-search.js";
import {
  createPasswordSession,
  isAllowedBrowserRpcMethod,
  isAuthorizedHttpRequest,
  isRequestAuthorized,
  passwordSessionCookie,
  resolvePublicAsset,
  resolveSafeRegularFile,
  unauthorizedResponse,
} from "./server-security.js";
import {
  createAccountIdentityLoader,
  fetchProfileAvatar,
  isLocalAccountRequest,
  resolveAccountIdentity,
  toPublicAccountIdentity,
} from "./profile-service.js";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 8899);
const accessToken = process.env.CODEX_WEBUI_ACCESS_TOKEN || null;
const password = process.env.CODEX_WEBUI_PASSWORD || null;
const authSecret = password || accessToken;
const localhostOnly = host === "127.0.0.1" || host === "::1" || host === "localhost";
const publicDir = resolve(import.meta.dir, "public");
const homeDir = process.env.HOME || process.cwd();
const defaultCwd = resolve(process.env.CODEX_WEBUI_CWD || import.meta.dir);
const browseRoots = defaultBrowseRoots(homeDir);
const reviewRoots = [resolve(process.env.CODEX_WEBUI_REVIEW_ROOT || defaultCwd)];
const clients = new Set<WebSocket>();
const sseClients = new Set<ServerResponse>();
const terminalSessions = new Map<WebSocket, ReturnType<typeof createTerminalSession>>();
const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
const reviewDiffs = new ReviewDiffStore();
let seq = 1;
let codex: ChildProcessWithoutNullStreams | null = null;
let stdoutBuffer = "";
let connected = false;
let shuttingDown = false;
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let httpClosed = false;
const accountLoader = createAccountIdentityLoader(async (refresh) => {
  const account = await request("account/read", { refreshToken: refresh });
  return resolveAccountIdentity(account);
});

function startCodex() {
  if (shuttingDown) return;
  if (codex && codex.exitCode === null) return;
  const child = spawn("codex", ["app-server", "--stdio"], {
    cwd: defaultCwd,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  codex = child;
  connected = false;
  stdoutBuffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
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
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (data) => console.error("[codex app-server]", String(data).trimEnd()));
  child.on("exit", (code, signal) => {
    connected = false;
    accountLoader.invalidate();
    reviewDiffs.clear();
    broadcast({ type: "bridge/status", status: "disconnected", code, signal });
    for (const item of pending.values()) item.reject(new Error("Codex app-server exited"));
    pending.clear();
    if (codex === child) codex = null;
    if (shuttingDown) maybeFinishShutdown();
    else restartTimer = setTimeout(startCodex, 1000);
  });
  initialize().catch((error) => {
    console.error("[codex-webui] initialize failed", error);
    terminateCodex();
  });
}

function terminateCodex(signal: NodeJS.Signals = "SIGTERM") {
  const child = codex;
  if (!child || child.exitCode !== null) return;
  if (process.platform !== "win32" && child.pid) {
    try { process.kill(-child.pid, signal); return; }
    catch { /* Fall back to terminating the wrapper process. */ }
  }
  child.kill(signal);
}

function maybeFinishShutdown() {
  if (shuttingDown && httpClosed && !codex) process.exit(0);
}

function sendRaw(message: any) {
  if (shuttingDown) throw new Error("Codex WebUI is shutting down");
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
    if (message.method === "account/updated") accountLoader.invalidate();
    if (message.method === "turn/diff/updated") reviewDiffs.record(message.params || {});
    broadcast({ type: "codex/notification", payload: message });
  }
}

function broadcast(data: any) {
  const text = JSON.stringify(data);
  for (const client of clients) if (client.readyState === WebSocket.OPEN) client.send(text);
  for (const client of sseClients) if (!client.writableEnded) client.write(`data: ${text}\n\n`);
}

async function dispatchBrowserMessage(message: any) {
  const id = message?.id;
  if (message?.type === "rpc") {
    if (!isAllowedBrowserRpcMethod(message.method)) throw new Error("RPC method is not available to browser clients");
    return { type: "rpc/result", id, result: await request(message.method, message.params || {}) };
  }
  if (message?.type === "codex/response") {
    if (!Number.isSafeInteger(message.requestId)) throw new Error("Invalid Codex request id");
    sendRaw({ id: message.requestId, result: message.result });
    return { type: "ack" };
  }
  if (message?.type === "codex/error") {
    if (!Number.isSafeInteger(message.requestId)) throw new Error("Invalid Codex request id");
    sendRaw({ id: message.requestId, error: message.error });
    return { type: "ack" };
  }
  if (message?.type === "ping") return { type: "pong" };
  throw new Error("Unsupported browser bridge message");
}

async function handleClient(client: WebSocket, message: any) {
  try { client.send(JSON.stringify(await dispatchBrowserMessage(message))); }
  catch (error) { client.send(JSON.stringify({ type: "rpc/error", id: message?.id, error: error instanceof Error ? error.message : String(error) })); }
}

function readJsonBody(req: IncomingMessage, maxBytes = 256_000) {
  return new Promise<any>((resolvePromise, reject) => {
    let body = "", tooLarge = false;
    req.setEncoding("utf8");
    req.on("data", chunk => {
      if (tooLarge) return;
      if (Buffer.byteLength(body) + Buffer.byteLength(chunk) > maxBytes) { tooLarge = true; return; }
      body += chunk;
    });
    req.on("error", reject);
    req.on("end", () => {
      if (tooLarge) return reject(new Error("Bridge payload too large"));
      try { resolvePromise(JSON.parse(body || "{}")); }
      catch { reject(new Error("Invalid JSON payload")); }
    });
  });
}

const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  let url: URL;
  try { url = new URL(req.url || "/", "http://localhost"); }
  catch {
    res.writeHead(400, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(JSON.stringify({ error: "Invalid request URL" }));
    return;
  }
  const loginAssets = new Set(["/", "/index.html", "/style.css", "/auth-bootstrap.js", "/codex-brand.js"]);
  if (url.pathname === "/api/auth/status") {
    const authenticated = isAuthorizedHttpRequest(req, authSecret, localhostOnly);
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(JSON.stringify({ passwordRequired: Boolean(password), authenticated }));
    return;
  }
  if (url.pathname === "/api/auth/login") {
    if (req.method !== "POST") {
      res.writeHead(405, { "content-type": "application/json; charset=utf-8", allow: "POST" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    let body = "";
    req.setEncoding("utf8");
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 4096) req.destroy(new Error("Login payload too large"));
    });
    req.on("end", () => {
      let submittedPassword = "";
      try { submittedPassword = JSON.parse(body || "{}").password || ""; }
      catch { /* Invalid JSON is an invalid password. */ }
      const valid = password && isRequestAuthorized({
        remoteAddress: req.socket.remoteAddress,
        hostHeader: req.headers.host,
        authorization: `Bearer ${submittedPassword}`,
        accessToken: password,
        origin: req.headers.origin,
        fetchSite: req.headers["sec-fetch-site"],
        forwardedFor: req.headers["x-forwarded-for"],
        forwarded: req.headers.forwarded,
        realIp: req.headers["x-real-ip"],
        allowLoopback: false,
      });
      if (!valid) {
        res.writeHead(401, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
        res.end(JSON.stringify({ error: "Incorrect password" }));
        return;
      }
      const session = createPasswordSession(password);
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "set-cookie": passwordSessionCookie(session.token, { secure: Boolean((req.socket as any).encrypted) }),
        "x-content-type-options": "nosniff",
      });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  if (!isAuthorizedHttpRequest(req, authSecret, localhostOnly)) {
    if (loginAssets.has(url.pathname)) {
      const file = resolvePublicAsset(url.pathname, publicDir);
      if (file) {
        res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
        res.end(readFileSync(file));
        return;
      }
    }
    unauthorizedResponse(res);
    return;
  }
  if (url.pathname === "/api/events") {
    if (req.method !== "GET") {
      res.writeHead(405, { "content-type": "application/json; charset=utf-8", allow: "GET" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      "x-content-type-options": "nosniff",
    });
    res.flushHeaders?.();
    res.write("retry: 1000\n\n");
    sseClients.add(res);
    res.write(`data: ${JSON.stringify({ type: "bridge/status", status: connected ? "connected" : "connecting" })}\n\n`);
    req.on("close", () => sseClients.delete(res));
    return;
  }
  if (url.pathname === "/api/rpc" || url.pathname === "/api/codex/respond") {
    if (req.method !== "POST") {
      res.writeHead(405, { "content-type": "application/json; charset=utf-8", allow: "POST" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    try {
      const payload = await readJsonBody(req);
      const message = url.pathname === "/api/rpc"
        ? { type: "rpc", id: payload.id, method: payload.method, params: payload.params || {} }
        : { type: payload.error ? "codex/error" : "codex/response", requestId: payload.requestId, result: payload.result, error: payload.error };
      const reply = await dispatchBrowserMessage(message);
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
      res.end(JSON.stringify(reply));
    } catch (error) {
      res.writeHead(400, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }
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
  if (url.pathname === "/api/workspace/context") {
    try {
      const context = readWorkspaceContext(url.searchParams.get("cwd") || defaultCwd, browseRoots);
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify(context));
    } catch (error) {
      res.writeHead(400, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }
  if (url.pathname === "/api/files/search") {
    try {
      const cwd = url.searchParams.get("cwd") || defaultCwd;
      const query = url.searchParams.get("query") || "";
      const items = await searchWorkspaceFiles(cwd, query, { allowedRoots: browseRoots, limit: 30 });
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify({ cwd, query, items }));
    } catch (error) {
      res.writeHead(400, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }
  if (url.pathname === "/api/account" || url.pathname === "/api/account/avatar") {
    const proxied = Boolean(req.headers["x-forwarded-for"] || req.headers.forwarded || req.headers["x-real-ip"]);
    if (!localhostOnly || proxied || !isLocalAccountRequest(req.socket.remoteAddress, req.headers.host, req.headers["sec-fetch-site"] as string | undefined)) {
      res.writeHead(403, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify({ error: "Account identity is available only on localhost" }));
      return;
    }
    try {
      const account = await accountLoader.get(url.searchParams.get("refresh") === "1");
      if (url.pathname === "/api/account") {
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
        res.end(JSON.stringify(toPublicAccountIdentity(account)));
        return;
      }
      if (!account.imageUrl) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        res.end(JSON.stringify({ error: "No profile avatar" }));
        return;
      }
      const avatar = await fetchProfileAvatar(account.imageUrl);
      res.writeHead(200, {
        "content-type": avatar.contentType,
        "content-length": String(avatar.body.byteLength),
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff",
      });
      res.end(avatar.body);
    } catch (error) {
      console.warn("[codex-webui] account request failed:", error instanceof Error ? error.message : String(error));
      if (url.pathname === "/api/account/avatar") {
        res.writeHead(502, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        res.end(JSON.stringify({ error: "Profile avatar unavailable" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify(toPublicAccountIdentity(await resolveAccountIdentity({ account: null, requiresOpenaiAuth: true }))));
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
      let requestPayload: ReturnType<typeof parseReviewPatchRequest> | null = null;
      let operationStarted = false;
      let success = false;
      try {
        const payload = JSON.parse(body || "{}");
        requestPayload = parseReviewPatchRequest(payload);
        const stored = reviewDiffs.begin(requestPayload.threadId, requestPayload.turnId, requestPayload.action);
        operationStarted = true;
        const threadResult = await request("thread/read", { threadId: requestPayload.threadId, includeTurns: false });
        const cwd = threadResult?.thread?.cwd;
        if (typeof cwd !== "string" || !cwd) throw new Error("Thread working directory is unavailable");
        const result = await applyReviewPatch({ cwd, diff: stored.diff, action: requestPayload.action }, reviewRoots);
        success = true;
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      } finally {
        if (operationStarted && requestPayload) reviewDiffs.finish(requestPayload.threadId, requestPayload.turnId, requestPayload.action, success);
      }
    });
    return;
  }
  if (url.pathname.startsWith("/vendor/katex/")) {
    let relative;
    try { relative = decodeURIComponent(url.pathname.slice("/vendor/katex/".length)); }
    catch { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); res.end("Not found"); return; }
    const katexDir = resolve(import.meta.dir, "node_modules/katex/dist");
    const file = resolveSafeRegularFile(katexDir, relative);
    if (!file) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); res.end("Not found"); return;
    }
    res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream", "cache-control": "public, max-age=86400" });
    res.end(readFileSync(file));
    return;
  }
  if (url.pathname === "/vendor/xterm/xterm.css") {
    const xtermDir = resolve(import.meta.dir, "node_modules/@xterm/xterm/css");
    const file = resolveSafeRegularFile(xtermDir, "xterm.css");
    if (!file) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); res.end("Not found"); return;
    }
    res.writeHead(200, { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=86400" });
    res.end(readFileSync(file));
    return;
  }
  const file = resolvePublicAsset(url.pathname, publicDir);
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); res.end("Not found"); return;
  }
  res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  res.end(readFileSync(file));
});

const sseKeepalive = setInterval(() => {
  for (const client of sseClients) if (!client.writableEnded) client.write(": keepalive\n\n");
}, 25_000);
sseKeepalive.unref();

const wss = new WebSocketServer({ noServer: true });
const terminalWss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  let pathname = "";
  try { pathname = new URL(req.url || "/", "http://localhost").pathname; }
  catch { socket.destroy(); return; }
  if ((pathname !== "/ws" && pathname !== "/terminal") || !isAuthorizedHttpRequest(req, authSecret, localhostOnly)) {
    const body = JSON.stringify({ error: "Authentication required" });
    socket.end([
      "HTTP/1.1 401 Unauthorized",
      "Connection: close",
      'WWW-Authenticate: Basic realm="Codex WebUI", charset="UTF-8"',
      "Content-Type: application/json; charset=utf-8",
      `Content-Length: ${Buffer.byteLength(body)}`,
      "X-Content-Type-Options: nosniff",
      "",
      body,
    ].join("\r\n"));
    return;
  }
  const target = pathname === "/terminal" ? terminalWss : wss;
  target.handleUpgrade(req, socket, head, client => target.emit("connection", client, req));
});
wss.on("connection", (client) => {
  clients.add(client);
  client.send(JSON.stringify({ type: "bridge/status", status: connected ? "connected" : "connecting" }));
  client.on("message", (raw) => {
    try { handleClient(client, JSON.parse(String(raw))); }
    catch (error) { client.send(JSON.stringify({ type: "rpc/error", error: String(error) })); }
  });
  client.on("close", () => clients.delete(client));
});
terminalWss.on("connection", (client, req) => {
  let terminal: ReturnType<typeof createTerminalSession> | null = null;
  try {
    const url = new URL(req.url || "/terminal", "http://localhost");
    const cwd = resolveTerminalCwd(url.searchParams.get("cwd"), browseRoots, defaultCwd);
    terminal = createTerminalSession({
      cwd,
      cols: 100,
      rows: 24,
      onData: data => { if (client.readyState === WebSocket.OPEN) client.send(data); },
      onExit: event => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(`\r\n[Process exited ${event.exitCode}]\r\n`);
          client.close(1000, "Terminal exited");
        }
      },
    });
    terminalSessions.set(client, terminal);
  } catch (error) {
    console.error("[codex-webui] terminal failed", error);
    client.close(1011, "Terminal unavailable");
    return;
  }
  client.on("message", (raw, isBinary) => {
    if (!terminal || raw.byteLength > 1_000_000) return;
    if (isBinary) {
      terminal.write(Buffer.from(raw as Buffer).toString("utf8"));
      return;
    }
    try {
      const resize = normalizeTerminalResize(JSON.parse(String(raw)));
      if (resize) terminal.resize(resize.cols, resize.rows);
    } catch { /* Terminal input is sent as binary; ignore malformed control frames. */ }
  });
  client.on("close", () => {
    terminalSessions.delete(client);
    terminal?.kill();
    terminal = null;
  });
  client.on("error", () => client.close());
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
  if (!localhostOnly && !authSecret) console.warn("[codex-webui] Non-localhost requests are disabled until CODEX_WEBUI_PASSWORD or CODEX_WEBUI_ACCESS_TOKEN is configured");
  if (!localhostOnly) {
    const addresses = Object.values(networkInterfaces()).flat().filter((entry): entry is NonNullable<typeof entry> => !!entry && entry.family === "IPv4" && !entry.internal);
    for (const entry of addresses) console.log(`LAN: http://${entry.address}:${port} (authentication required)`);
  }
});

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  connected = false;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = null;
  clearInterval(sseKeepalive);
  for (const item of pending.values()) item.reject(new Error("Codex WebUI is shutting down"));
  pending.clear();
  for (const client of clients) client.terminate();
  clients.clear();
  for (const client of sseClients) client.end();
  sseClients.clear();
  wss.close();
  for (const [client, terminal] of terminalSessions) { terminal.kill(); client.terminate(); }
  terminalSessions.clear();
  terminalWss.close();
  terminateCodex();
  server.close(() => { httpClosed = true; maybeFinishShutdown(); });
  server.closeAllConnections?.();
  const forceExit = setTimeout(() => {
    terminateCodex("SIGKILL");
    process.exit(0);
  }, 5000);
  forceExit.unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
