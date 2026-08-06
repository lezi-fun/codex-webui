import { lstatSync, realpathSync, statSync } from "node:fs";
import { basename, extname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const LOCAL_IMAGE_MAX_BYTES = 25 * 1024 * 1024;

const IMAGE_TYPES = new Map([
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

function inside(candidate, root) {
  return candidate === root || candidate.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
}

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

function expandImagePath(value, home) {
  const input = String(value || "").trim();
  if (!input || input.length > 8192 || input.includes("\0")) throw new Error("Invalid image path");
  if (/^file:/i.test(input)) return fileURLToPath(input);
  if (input === "~") return home;
  if (input.startsWith("~/") || input.startsWith("~\\")) return resolve(home, input.slice(2));
  return input;
}

export function resolveLocalImage(input, {
  cwd = process.cwd(),
  home = process.env.HOME || process.cwd(),
  allowedRoots = [home],
  maxBytes = LOCAL_IMAGE_MAX_BYTES,
} = {}) {
  const expanded = expandImagePath(input, home);
  const candidate = resolve(isAbsolute(expanded) ? expanded : resolve(cwd, expanded));
  const roots = canonicalRoots(allowedRoots);
  if (!roots.length) throw new Error("No image roots are available");

  const metadata = lstatSync(candidate);
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error("Image not found");
  const path = realpathSync(candidate);
  if (!roots.some(root => inside(path, root))) throw new Error("Image is outside allowed roots");

  const contentType = IMAGE_TYPES.get(extname(path).toLowerCase());
  if (!contentType) throw new Error("Unsupported image type");
  const size = statSync(path).size;
  if (size > maxBytes) throw new Error("Image is too large");

  return { path, contentType, size, filename: basename(path) };
}
