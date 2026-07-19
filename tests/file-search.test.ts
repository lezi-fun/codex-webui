import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { searchWorkspaceFiles } from "../file-search.js";

const roots: string[] = [];
afterEach(async () => { while (roots.length) await rm(roots.pop()!, { recursive: true, force: true }); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "codex-webui-files-"));
  roots.push(root);
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "node_modules", "hidden"), { recursive: true });
  await mkdir(join(root, ".git"), { recursive: true });
  await writeFile(join(root, "package.json"), "{}");
  await writeFile(join(root, "src", "package-helper.ts"), "export {};");
  await writeFile(join(root, "node_modules", "hidden", "package.json"), "{}");
  await writeFile(join(root, ".git", "config"), "secret");
  return root;
}

describe("workspace file mention search", () => {
  test("returns matching relative files while skipping generated and hidden directories", async () => {
    const root = await fixture();
    expect(await searchWorkspaceFiles(root, "pack", { allowedRoots: [root] })).toEqual([
      { path: "package.json", kind: "file" },
      { path: "src/package-helper.ts", kind: "file" },
    ]);
  });

  test("rejects roots outside the configured boundary", async () => {
    const root = await fixture();
    await expect(searchWorkspaceFiles(tmpdir(), "pack", { allowedRoots: [root] })).rejects.toThrow("outside allowed roots");
  });

  test("does not follow symlinks outside the workspace", async () => {
    const root = await fixture();
    const outside = await mkdtemp(join(tmpdir(), "codex-webui-outside-"));
    roots.push(outside);
    await writeFile(join(outside, "package-secret.txt"), "secret");
    await symlink(outside, join(root, "external"));
    const paths = (await searchWorkspaceFiles(root, "package", { allowedRoots: [root] })).map(item => item.path);
    expect(paths).not.toContain("external/package-secret.txt");
  });
});
