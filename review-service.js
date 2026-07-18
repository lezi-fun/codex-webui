import { existsSync, lstatSync, realpathSync } from "node:fs";
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

function validateReviewDiffShape(diff) {
  const modes = [...diff.matchAll(/^(?:(?:new|old|deleted) file )?mode (\d+)$/gm), ...diff.matchAll(/^index [0-9a-f]+\.\.[0-9a-f]+ (\d+)$/gm)].map(match => match[1]);
  if (modes.includes("120000")) throw new Error("Review diff may not create or modify symbolic links");
  if (modes.some(mode => mode !== "100644" && mode !== "100755")) throw new Error("Review diff contains an unsupported file mode");
  if (/^(?:rename|copy) (?:from|to) /m.test(diff)) throw new Error("Review diff renames and copies are not supported");
}

function parsedDiffPaths(cwd, diff) {
  const output = runGit(cwd, ["apply", "--numstat", "-z"], diff);
  const paths = output.split("\0").filter(Boolean).map(record => {
    const first = record.indexOf("\t");
    const second = first < 0 ? -1 : record.indexOf("\t", first + 1);
    if (second < 0) throw new Error("Review diff has invalid path metadata");
    return record.slice(second + 1);
  });
  if (!paths.length) throw new Error("Review diff contains no file paths");
  return paths;
}

function validateReviewDiffPaths(root, paths) {
  for (const path of paths) {
    const parts = path.split(/[\\/]/);
    if (!path || path.startsWith("/") || parts.includes("..")) throw new Error("Review diff contains an unsafe path");
    const first = parts[0];
    if (first === ".git" || first.startsWith(".git") || first === "node_modules" || first === ".env" || first.startsWith(".env.")) {
      throw new Error(`Review diff targets a protected or sensitive path: ${path}`);
    }
    let current = root;
    for (const part of parts) {
      current = resolve(current, part);
      if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
        throw new Error(`Review diff may not modify a symbolic link: ${path}`);
      }
    }
  }
}

export async function applyReviewPatch({ cwd, diff, action }, allowedRoots) {
  if (action !== "undo" && action !== "reapply") throw new Error("Unsupported review action");
  if (typeof diff !== "string" || !diff.trim()) throw new Error("Missing unified diff");
  validateReviewDiffShape(diff);
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
  validateReviewDiffPaths(canonicalRoot, parsedDiffPaths(canonicalRoot, diff));
  const args = ["apply", "--whitespace=nowarn"];
  if (action === "undo") args.push("--reverse");
  runGit(canonicalRoot, [...args, "--check"], diff);
  runGit(canonicalRoot, args, diff);
  return { ok: true, action, root: canonicalRoot };
}
