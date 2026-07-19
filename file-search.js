import { readdir, realpath } from 'node:fs/promises';
import { basename, relative, resolve, sep } from 'node:path';

const skippedDirectories = new Set(['.git', '.hg', '.svn', 'node_modules', '.next', 'dist', 'build', 'coverage', '.cache', '.turbo', 'vendor']);

function isInside(path, root) {
  return path === root || path.startsWith(root + sep);
}

export async function searchWorkspaceFiles(root, query, options = {}) {
  const allowedRoots = options.allowedRoots || [];
  const limit = Math.max(1, Math.min(options.limit || 30, 100));
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return [];
  const workspace = await realpath(resolve(root));
  const boundaries = await Promise.all(allowedRoots.map(path => realpath(resolve(path))));
  if (boundaries.length && !boundaries.some(boundary => isInside(workspace, boundary))) throw new Error('Workspace path is outside allowed roots');

  const matches = [];
  const queue = [workspace];
  let visited = 0;
  while (queue.length && visited < 5000) {
    const directory = queue.shift();
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch { continue; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (++visited > 5000) break;
      if (entry.isSymbolicLink()) continue;
      const fullPath = resolve(directory, entry.name);
      if (!isInside(fullPath, workspace)) continue;
      const relativePath = relative(workspace, fullPath).split(sep).join('/');
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || skippedDirectories.has(entry.name)) continue;
        queue.push(fullPath);
        if (entry.name.toLowerCase().includes(needle) || relativePath.toLowerCase().includes(needle)) matches.push({ path: relativePath, kind: 'folder' });
      } else if (entry.isFile() && (entry.name.toLowerCase().includes(needle) || relativePath.toLowerCase().includes(needle))) {
        matches.push({ path: relativePath, kind: 'file' });
      }
    }
  }
  const score = item => {
    const name = basename(item.path).toLowerCase();
    if (name === needle) return 0;
    if (name.startsWith(needle)) return 1;
    if (name.includes(needle)) return 2;
    return 3;
  };
  return matches.sort((a, b) => score(a) - score(b) || a.path.length - b.path.length || a.path.localeCompare(b.path)).slice(0, limit);
}
