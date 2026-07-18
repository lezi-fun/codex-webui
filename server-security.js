import { lstatSync, realpathSync, statSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { resolve, sep } from "node:path";

const BROWSER_RPC_METHODS = new Set([
  "model/list",
  "thread/list",
  "thread/read",
  "thread/start",
  "turn/start",
  "turn/interrupt",
]);

const PUBLIC_ASSETS = new Set([
  "/index.html",
  "/style.css",
  "/app.bundle.js",
  "/assets/codex-app-icon-128.png",
  "/assets/codex-app-icon.png",
  "/assets/codex-motion/local-context.json",
  "/assets/codex-motion/searching.json",
  "/assets/codex-motion/list-files.json",
  "/assets/codex-motion/edit-files.json",
  "/assets/codex-motion/run-command.json",
]);

const inside = (path, root) => path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function hostnameOf(hostHeader) {
  if (!hostHeader) return null;
  try { return new URL(`http://${hostHeader}`).hostname.replace(/^\[|\]$/g, "").toLowerCase(); }
  catch { return null; }
}

function isLoopbackAddress(address) {
  const value = (address || "").replace(/^::ffff:/, "").toLowerCase();
  return value === "127.0.0.1" || value === "::1";
}

function isLoopbackHost(hostHeader) {
  const host = hostnameOf(hostHeader);
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

function isSameOrigin(origin, hostHeader) {
  if (!origin) return true;
  try { return new URL(origin).host.toLowerCase() === String(hostHeader || "").toLowerCase(); }
  catch { return false; }
}

function suppliedToken(authorization) {
  if (!authorization) return null;
  if (authorization.startsWith("Bearer ")) return authorization.slice(7);
  if (!authorization.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0 || decoded.slice(0, separator) !== "codex") return null;
    return decoded.slice(separator + 1);
  } catch { return null; }
}

export function isAllowedBrowserRpcMethod(method) {
  return typeof method === "string" && BROWSER_RPC_METHODS.has(method);
}

export function isRequestAuthorized({ remoteAddress, hostHeader, authorization, accessToken, origin = null, fetchSite = null, forwardedFor = null, forwarded = null, realIp = null, allowLoopback = true }) {
  if (fetchSite === "cross-site" || !isSameOrigin(origin, hostHeader)) return false;
  const proxied = Boolean(forwardedFor || forwarded || realIp);
  if (accessToken) {
    const candidate = suppliedToken(authorization);
    return candidate != null && safeEqual(candidate, accessToken);
  }
  return allowLoopback && !proxied && isLoopbackAddress(remoteAddress) && isLoopbackHost(hostHeader);
}

export function resolveSafeRegularFile(root, relativePath) {
  try {
    const canonicalRoot = realpathSync(root);
    const candidate = resolve(root, relativePath);
    if (!inside(candidate, resolve(root))) return null;
    const metadata = lstatSync(candidate);
    if (metadata.isSymbolicLink() || !metadata.isFile()) return null;
    const canonicalFile = realpathSync(candidate);
    if (!inside(canonicalFile, canonicalRoot) || !statSync(canonicalFile).isFile()) return null;
    return canonicalFile;
  } catch { return null; }
}

export function resolvePublicAsset(pathname, publicDir) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { return null; }
  if (decoded === "/") decoded = "/index.html";
  if (!PUBLIC_ASSETS.has(decoded)) return null;
  return resolveSafeRegularFile(publicDir, `.${decoded}`);
}

export function unauthorizedResponse(res) {
  res.writeHead(401, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "www-authenticate": 'Basic realm="Codex WebUI", charset="UTF-8"',
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify({ error: "Authentication required" }));
}

export function isAuthorizedHttpRequest(req, accessToken, allowLoopback = true) {
  return isRequestAuthorized({
    remoteAddress: req.socket.remoteAddress,
    hostHeader: req.headers.host,
    authorization: req.headers.authorization,
    accessToken,
    origin: req.headers.origin,
    fetchSite: req.headers["sec-fetch-site"],
    forwardedFor: req.headers["x-forwarded-for"],
    forwarded: req.headers.forwarded,
    realIp: req.headers["x-real-ip"],
    allowLoopback,
  });
}
