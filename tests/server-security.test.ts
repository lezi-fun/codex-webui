import { describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPasswordSession, createStoredPassword, isAllowedBrowserRpcMethod, isRequestAuthorized, parseCookieHeader, resolvePublicAsset, storedPasswordSessionSecret, verifyPasswordSession, verifyStoredPassword } from "../server-security.js";

describe("WebUI server security boundary", () => {
  test("allows only the RPC methods used by the browser client", () => {
    for (const method of ["model/list", "permissionProfile/list", "account/logout", "thread/list", "thread/read", "thread/resume", "thread/turns/list", "host/thread/live", "thread/start", "turn/start", "turn/interrupt"]) {
      expect(isAllowedBrowserRpcMethod(method)).toBe(true);
    }
    for (const method of ["fs/readFile", "fs/writeFile", "fs/remove", "fs/copy", "config/read", "account/read", "skills/list"]) {
      expect(isAllowedBrowserRpcMethod(method)).toBe(false);
    }
  });

  test("serves only declared public assets and never follows symbolic links", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-webui-public-"));
    try {
      writeFileSync(join(root, "style.css"), "body{}\n");
      writeFileSync(join(root, "favicon.svg"), "<svg/>\n");
      writeFileSync(join(root, "i18n.js"), "export {};\n");
      writeFileSync(join(root, "unknown.txt"), "not public\n");
      expect(resolvePublicAsset("/style.css", root)).toBe(realpathSync(join(root, "style.css")));
      expect(resolvePublicAsset("/favicon.svg", root)).toBe(realpathSync(join(root, "favicon.svg")));
      expect(resolvePublicAsset("/i18n.js", root)).toBe(realpathSync(join(root, "i18n.js")));
      expect(resolvePublicAsset("/unknown.txt", root)).toBeNull();
      expect(resolvePublicAsset("/%ZZ", root)).toBeNull();

      rmSync(join(root, "style.css"));
      symlinkSync(join(root, "unknown.txt"), join(root, "style.css"));
      expect(resolvePublicAsset("/style.css", root)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("requires a shared token for non-loopback clients", () => {
    expect(isRequestAuthorized({ remoteAddress: "127.0.0.1", hostHeader: "localhost:8899", authorization: null, accessToken: null })).toBe(true);
    expect(isRequestAuthorized({ remoteAddress: "127.0.0.1", hostHeader: "localhost:8899", authorization: null, accessToken: "correct horse" })).toBe(true);
    expect(isRequestAuthorized({ remoteAddress: "127.0.0.1", hostHeader: "localhost:8899", authorization: "Basic Y29kZXg6Y29ycmVjdCBob3JzZQ==", accessToken: "correct horse" })).toBe(true);
    expect(isRequestAuthorized({ remoteAddress: "127.0.0.1", hostHeader: "codex.example.com", authorization: null, accessToken: null })).toBe(false);
    expect(isRequestAuthorized({ remoteAddress: "198.51.100.20", hostHeader: "codex.example.com", authorization: null, accessToken: null })).toBe(false);
    expect(isRequestAuthorized({ remoteAddress: "198.51.100.20", hostHeader: "codex.example.com", authorization: "Basic Zm9vOmJhcg==", accessToken: "correct horse" })).toBe(false);
    expect(isRequestAuthorized({ remoteAddress: "198.51.100.20", hostHeader: "codex.example.com", authorization: "Basic Y29kZXg6Y29ycmVjdCBob3JzZQ==", accessToken: "correct horse" })).toBe(true);
    expect(isRequestAuthorized({ remoteAddress: "127.0.0.1", hostHeader: "localhost:8899", authorization: null, accessToken: null, origin: "https://evil.example" })).toBe(false);
    expect(isRequestAuthorized({ remoteAddress: "127.0.0.1", hostHeader: "localhost:8899", authorization: null, accessToken: null, forwardedFor: "198.51.100.20" })).toBe(false);
    expect(isRequestAuthorized({ remoteAddress: "127.0.0.1", hostHeader: "localhost:8899", authorization: "Basic Y29kZXg6Y29ycmVjdCBob3JzZQ==", accessToken: "correct horse", forwardedFor: "198.51.100.20" })).toBe(true);
    expect(isRequestAuthorized({ remoteAddress: "127.0.0.1", hostHeader: "localhost:8899", authorization: null, accessToken: "correct horse", allowLoopback: false })).toBe(false);
    expect(isRequestAuthorized({ remoteAddress: "127.0.0.1", hostHeader: "localhost:8899", authorization: "Basic Y29kZXg6Y29ycmVjdCBob3JzZQ==", accessToken: "correct horse", allowLoopback: false })).toBe(true);
  });

  test("creates signed browser sessions without storing the configured password", () => {
    const session = createPasswordSession("correct horse", { now: 1_700_000_000_000, ttlMs: 60_000 });
    expect(session.token).not.toContain("correct horse");
    expect(session.expiresAt).toBe(1_700_000_060_000);
    expect(verifyPasswordSession(session.token, "correct horse", { now: 1_700_000_030_000 })).toBe(true);
    expect(verifyPasswordSession(session.token, "wrong horse", { now: 1_700_000_030_000 })).toBe(false);
    expect(verifyPasswordSession(session.token, "correct horse", { now: 1_700_000_060_001 })).toBe(false);
    expect(verifyPasswordSession(`${session.token}x`, "correct horse", { now: 1_700_000_030_000 })).toBe(false);
  });

  test("hashes managed passwords and derives a stable session secret", () => {
    const credential = createStoredPassword("correct horse battery staple", { salt: "0123456789abcdef" });
    expect(JSON.stringify(credential)).not.toContain("correct horse battery staple");
    expect(verifyStoredPassword("correct horse battery staple", credential)).toBe(true);
    expect(verifyStoredPassword("wrong horse battery staple", credential)).toBe(false);
    const secret = storedPasswordSessionSecret(credential);
    expect(secret).toBe(storedPasswordSessionSecret(credential));
    expect(secret).not.toBe(credential.hash);
    const session = createPasswordSession(secret, { now: 1_700_000_000_000, ttlMs: 60_000 });
    expect(verifyPasswordSession(session.token, secret, { now: 1_700_000_030_000 })).toBe(true);
  });

  test("accepts the signed session cookie for same-origin LAN HTTP and WebSocket requests", () => {
    const session = createPasswordSession("correct horse", { now: 1_700_000_000_000, ttlMs: 60_000 });
    const cookie = `other=1; codex_webui_session=${encodeURIComponent(session.token)}; theme=dark`;
    expect(parseCookieHeader(cookie).codex_webui_session).toBe(session.token);
    expect(isRequestAuthorized({ remoteAddress: "192.168.2.40", hostHeader: "192.168.2.10:8899", authorization: null, accessToken: "correct horse", cookie, now: 1_700_000_030_000 })).toBe(true);
    expect(isRequestAuthorized({ remoteAddress: "192.168.2.40", hostHeader: "192.168.2.10:8899", authorization: null, accessToken: "correct horse", cookie, now: 1_700_000_060_001 })).toBe(false);
    expect(isRequestAuthorized({ remoteAddress: "192.168.2.40", hostHeader: "192.168.2.10:8899", authorization: null, accessToken: "correct horse", cookie, origin: "https://evil.example", now: 1_700_000_030_000 })).toBe(false);
  });
});
