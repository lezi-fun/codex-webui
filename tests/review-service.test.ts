import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
});
