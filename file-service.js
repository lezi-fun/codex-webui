import { lstatSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const LOCAL_FILE_MAX_BYTES = 512 * 1024 * 1024;

const inside = (candidate, root) => candidate === root || candidate.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);

function canonicalRoots(roots) {
  const result = [];
  for (const root of roots || []) {
    try {
      const canonical = realpathSync(resolve(root));
      if (!result.includes(canonical)) result.push(canonical);
    } catch { /* Ignore unavailable roots. */ }
  }
  return result;
}

function decodePath(value) {
  try { return decodeURIComponent(value); }
  catch { return value; }
}

function expandFilePath(value, home) {
  const input = String(value || "").trim();
  if (!input || input.length > 8192 || input.includes("\0")) throw new Error("Invalid file path");
  if (/^file:/i.test(input)) return fileURLToPath(input);
  if (/^sandbox:/i.test(input)) return decodePath(input.replace(/^sandbox:/i, ""));
  if (input === "~") return home;
  if (input.startsWith("~/") || input.startsWith("~\\")) return resolve(home, decodePath(input.slice(2)));
  return decodePath(input);
}

export function resolveLocalFile(input, {
  cwd = process.cwd(),
  home = process.env.HOME || process.cwd(),
  allowedRoots = [home],
  maxBytes = LOCAL_FILE_MAX_BYTES,
} = {}) {
  const expanded = expandFilePath(input, home);
  const candidate = resolve(isAbsolute(expanded) ? expanded : resolve(cwd, expanded));
  const roots = canonicalRoots(allowedRoots);
  if (!roots.length) throw new Error("No file roots are available");

  const metadata = lstatSync(candidate);
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error("File not found");
  const path = realpathSync(candidate);
  if (!roots.some(root => inside(path, root))) throw new Error("File is outside allowed roots");

  const size = statSync(path).size;
  if (size > maxBytes) throw new Error("File is too large");
  return { path, size, filename: basename(path) };
}
