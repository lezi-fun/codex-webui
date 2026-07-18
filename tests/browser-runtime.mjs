import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const artifacts = resolve(root, '.artifacts');
mkdirSync(artifacts, { recursive: true });

export function launchOptions() {
  const candidates = [
    process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    '/Applications/Microsoft Edge Canary.app/Contents/MacOS/Microsoft Edge Canary',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  const executablePath = candidates.find(path => path && existsSync(path));
  return executablePath && existsSync(executablePath)
    ? { headless: true, executablePath }
    : { headless: true };
}

export function artifact(name) {
  return resolve(artifacts, name);
}
