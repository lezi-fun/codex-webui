import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listFolders, resolveBrowsePath } from "../folder-service.js";

describe("folder browser", () => {
  test("lists only visible directories in stable order", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-webui-folders-"));
    mkdirSync(join(root, "zeta"));
    mkdirSync(join(root, "Alpha"));
    mkdirSync(join(root, ".secret"));
    writeFileSync(join(root, "file.txt"), "x");
    expect(listFolders(root).folders.map((item) => item.name)).toEqual(["Alpha", "zeta"]);
  });

  test("allows browsing only under configured roots", () => {
    const home = join(tmpdir(), "codex-webui-home");
    expect(resolveBrowsePath("~/projects", [home], home)).toBe(join(home, "projects"));
    expect(() => resolveBrowsePath("/etc", [home], home)).toThrow("outside allowed roots");
  });

  test("returns parent only when parent is still allowed", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-webui-parent-"));
    const child = join(root, "child"); mkdirSync(child);
    expect(listFolders(child, [root]).parent).toBe(root);
    expect(listFolders(root, [root]).parent).toBeNull();
  });

  test("rejects a symbolic link that escapes an allowed root", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-webui-symlink-root-"));
    const outside = mkdtempSync(join(tmpdir(), "codex-webui-symlink-outside-"));
    const link = join(root, "outside");
    symlinkSync(outside, link);
    expect(() => resolveBrowsePath(link, [root], root)).toThrow("outside allowed roots");
    expect(() => listFolders(link, [root])).toThrow("outside allowed roots");
  });
});
