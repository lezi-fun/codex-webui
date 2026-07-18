import { realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

const inside = (path, root) => path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);

function runGit(cwd, args, input) {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdin: input == null ? undefined : new TextEncoder().encode(input),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString().trim() || `git ${args.join(" ")} failed`);
  return result.stdout.toString().trim();
}

export async function applyReviewPatch({ cwd, diff, action }, allowedRoots) {
  if (action !== "undo" && action !== "reapply") throw new Error("Unsupported review action");
  if (typeof diff !== "string" || !diff.trim()) throw new Error("Missing unified diff");
  const directory = realpathSync(resolve(cwd));
  const roots = allowedRoots.map(root => {
    try { return realpathSync(resolve(root)); } catch { return resolve(root); }
  });
  if (!roots.some(root => inside(directory, root))) throw new Error("outside allowed roots");
  let root;
  try { root = runGit(directory, ["rev-parse", "--show-toplevel"]); }
  catch { throw new Error("Directory is not inside a Git repository"); }
  const canonicalRoot = realpathSync(root);
  if (directory !== canonicalRoot) throw new Error("Review patch cwd must be the Git repository root");
  if (!roots.some(allowed => inside(canonicalRoot, allowed))) throw new Error("Git repository outside allowed roots");
  const args = ["apply", "--whitespace=nowarn"];
  if (action === "undo") args.push("--reverse");
  runGit(canonicalRoot, args, diff);
  return { ok: true, action, root: canonicalRoot };
}
