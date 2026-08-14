import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveLocalFile } from "../file-service.js";

describe("local agent file download boundary", () => {
  test("resolves absolute, relative, file URL and sandbox file references inside an allowed root", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-webui-file-"));
    const folder = join(root, "generated files");
    const file = join(folder, "report.txt");
    try {
      mkdirSync(folder);
      writeFileSync(file, "download me");
      const canonicalFile = realpathSync(file);
      expect(resolveLocalFile(file, { cwd: root, home: root, allowedRoots: [root] })).toMatchObject({ path: canonicalFile, filename: "report.txt", size: 11 });
      expect(resolveLocalFile("./generated%20files/report.txt", { cwd: root, home: root, allowedRoots: [root] }).path).toBe(canonicalFile);
      expect(resolveLocalFile(new URL(`file://${file}`).href, { cwd: root, home: root, allowedRoots: [root] }).path).toBe(canonicalFile);
      expect(resolveLocalFile(`sandbox:${file.replaceAll(" ", "%20")}`, { cwd: root, home: root, allowedRoots: [root] }).path).toBe(canonicalFile);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects paths outside the boundary, directories, symbolic links, invalid paths and oversized files", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-webui-file-root-"));
    const outside = mkdtempSync(join(tmpdir(), "codex-webui-file-outside-"));
    try {
      const outsideFile = join(outside, "outside.txt");
      const localFile = join(root, "large.bin");
      writeFileSync(outsideFile, "outside");
      writeFileSync(localFile, Buffer.alloc(8));
      symlinkSync(outsideFile, join(root, "linked.txt"));

      expect(() => resolveLocalFile(outsideFile, { cwd: root, home: root, allowedRoots: [root] })).toThrow();
      expect(() => resolveLocalFile(root, { cwd: root, home: root, allowedRoots: [root] })).toThrow();
      expect(() => resolveLocalFile(join(root, "linked.txt"), { cwd: root, home: root, allowedRoots: [root] })).toThrow();
      expect(() => resolveLocalFile(localFile, { cwd: root, home: root, allowedRoots: [root], maxBytes: 4 })).toThrow();
      expect(() => resolveLocalFile("bad\0path", { cwd: root, home: root, allowedRoots: [root] })).toThrow();
      expect(() => resolveLocalFile("a".repeat(8193), { cwd: root, home: root, allowedRoots: [root] })).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
