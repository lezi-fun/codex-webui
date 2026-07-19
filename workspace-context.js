import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import { isDirectory, resolveBrowsePath } from './folder-service.js';

export function readWorkspaceContext(input, allowedRoots) {
  const cwd = resolveBrowsePath(input, allowedRoots);
  if (!isDirectory(cwd)) throw new Error('Directory not found');
  let branch = 'No branch';
  try {
    const value = execFileSync('git', ['branch', '--show-current'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim();
    if (value) branch = value;
  } catch { /* Non-git workspaces use the native empty-state label. */ }
  return { cwd, project: basename(cwd) || cwd, environment: 'Local', branch };
}
