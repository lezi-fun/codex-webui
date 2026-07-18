import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyReviewPatch } from "../review-service.js";

const allowedRoot = tmpdir();
const fixture = join(allowedRoot, `codex-webui-review-fixture-${process.pid}`);
const file = join(fixture, "sample.txt");
let diff = "";

function git(...args: string[]) {
  const result = Bun.spawnSync(["git", ...args], { cwd: fixture, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString();
}

beforeAll(() => {
  rmSync(fixture, { recursive: true, force: true });
  mkdirSync(fixture, { recursive: true });
  git("init", "-q");
  git("config", "user.name", "Codex WebUI Test");
  git("config", "user.email", "codex-webui@test.invalid");
  writeFileSync(file, "before\n");
  git("add", "sample.txt");
  git("commit", "-qm", "initial");
  writeFileSync(file, "after\nextra\n");
  diff = git("diff", "--", "sample.txt");
});

beforeEach(() => writeFileSync(file, "after\nextra\n"));
afterAll(() => rmSync(fixture, { recursive: true, force: true }));

describe("review patch service", () => {
  test("undoes and reapplies the exact unified diff inside a git repository", async () => {
    const undone = await applyReviewPatch({ cwd: fixture, diff, action: "undo" }, [allowedRoot]);
    expect(undone).toMatchObject({ ok: true, action: "undo", root: realpathSync(fixture) });
    expect(readFileSync(file, "utf8")).toBe("before\n");

    const reapplied = await applyReviewPatch({ cwd: fixture, diff, action: "reapply" }, [allowedRoot]);
    expect(reapplied).toMatchObject({ ok: true, action: "reapply", root: realpathSync(fixture) });
    expect(readFileSync(file, "utf8")).toBe("after\nextra\n");
  });

  test("rejects paths outside the allowed roots", async () => {
    await expect(applyReviewPatch({ cwd: fixture, diff, action: "undo" }, [join(allowedRoot, "elsewhere")])).rejects.toThrow("outside allowed roots");
    expect(readFileSync(file, "utf8")).toBe("after\nextra\n");
  });

  test("rejects non-git directories and unsupported operations", async () => {
    const plain = join(fixture, "plain");
    mkdirSync(plain, { recursive: true });
    await expect(applyReviewPatch({ cwd: plain, diff, action: "undo" }, [allowedRoot])).rejects.toThrow("Git repository");
    await expect(applyReviewPatch({ cwd: fixture, diff, action: "delete" as never }, [allowedRoot])).rejects.toThrow("Unsupported review action");
    expect(existsSync(file)).toBe(true);
  });

  test("rejects symbolic links and sensitive repository targets", async () => {
    const symlinkDiff = "diff --git a/public/leak b/public/leak\nnew file mode 120000\nindex 0000000..1111111\n--- /dev/null\n+++ b/public/leak\n@@ -0,0 +1 @@\n+/etc/hosts\n\\ No newline at end of file\n";
    await expect(applyReviewPatch({ cwd: fixture, diff: symlinkDiff, action: "reapply" }, [allowedRoot])).rejects.toThrow(/symbolic link|symlink/i);
    expect(existsSync(join(fixture, "public", "leak"))).toBe(false);

    const envDiff = "diff --git a/.env b/.env\nnew file mode 100644\nindex 0000000..2222222\n--- /dev/null\n+++ b/.env\n@@ -0,0 +1 @@\n+SECRET=test\n";
    await expect(applyReviewPatch({ cwd: fixture, diff: envDiff, action: "reapply" }, [allowedRoot])).rejects.toThrow(/protected|sensitive/i);
    expect(existsSync(join(fixture, ".env"))).toBe(false);

    const quotedEnvDiff = "diff --git \"a/\\056env\" \"b/\\056env\"\nnew file mode 100644\nindex 0000000..2222222\n--- /dev/null\n+++ \"b/\\056env\"\n@@ -0,0 +1 @@\n+SECRET=test\n";
    await expect(applyReviewPatch({ cwd: fixture, diff: quotedEnvDiff, action: "reapply" }, [allowedRoot])).rejects.toThrow(/protected|sensitive/i);
    expect(existsSync(join(fixture, ".env"))).toBe(false);

    const existingTarget = join(fixture, "existing-target.txt");
    const existingLink = join(fixture, "existing-link.txt");
    writeFileSync(existingTarget, "before\n");
    symlinkSync("existing-target.txt", existingLink);
    const existingLinkDiff = "diff --git a/existing-link.txt b/existing-link.txt\nindex 1a2b3c4..5d6e7f8 120000\n--- a/existing-link.txt\n+++ b/existing-link.txt\n@@ -1 +1 @@\n-existing-target.txt\n\\ No newline at end of file\n+other-target.txt\n\\ No newline at end of file\n";
    await expect(applyReviewPatch({ cwd: fixture, diff: existingLinkDiff, action: "reapply" }, [allowedRoot])).rejects.toThrow(/symbolic link|symlink/i);

    const gitlinkDiff = "diff --git a/submodule b/submodule\nnew file mode 160000\nindex 0000000..1234567\n--- /dev/null\n+++ b/submodule\n@@ -0,0 +1 @@\n+Subproject commit 1234567890123456789012345678901234567890\n";
    await expect(applyReviewPatch({ cwd: fixture, diff: gitlinkDiff, action: "reapply" }, [allowedRoot])).rejects.toThrow(/unsupported file mode/i);
  });
});
