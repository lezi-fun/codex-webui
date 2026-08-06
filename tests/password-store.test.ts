import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStoredPassword } from "../server-security.js";
import { loadStoredPassword, passwordStorePath, saveStoredPassword } from "../password-store.js";

describe("managed LAN password store", () => {
  test("resolves the configured location", () => {
    expect(passwordStorePath({ CODEX_WEBUI_AUTH_STORE: "./custom-auth.json" })).toBe(join(process.cwd(), "custom-auth.json"));
    expect(passwordStorePath({ CODEX_HOME: "/tmp/codex-home" })).toBe("/tmp/codex-home/codex-webui-auth.json");
  });

  test("writes only the credential hash with private permissions and never overwrites", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-webui-password-store-"));
    const path = join(root, "nested", "auth.json");
    const password = "correct horse battery staple";
    const credential = createStoredPassword(password, { salt: "0123456789abcdef" });
    try {
      saveStoredPassword(path, credential);
      const raw = readFileSync(path, "utf8");
      expect(raw).not.toContain(password);
      expect(loadStoredPassword(path)).toEqual(credential);
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(() => saveStoredPassword(path, credential)).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects malformed credential files", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-webui-password-store-invalid-"));
    const path = join(root, "auth.json");
    try {
      writeFileSync(path, '{"version":1,"algorithm":"scrypt"}\n');
      expect(() => loadStoredPassword(path)).toThrow("Invalid Codex WebUI password store");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
