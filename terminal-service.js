import { chmodSync, realpathSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const inside = (path, root) => path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);

export function normalizeTerminalResize(message) {
  if (!message || message.type !== 'resize') return null;
  const cols = Number(message.cols);
  const rows = Number(message.rows);
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 20 || cols > 500 || rows < 5 || rows > 200) return null;
  return { cols, rows };
}

export function resolveTerminalCwd(requested, allowedRoots, fallback) {
  let canonicalFallback;
  try { canonicalFallback = realpathSync(resolve(fallback)); }
  catch { canonicalFallback = resolve(fallback); }
  if (typeof requested !== 'string' || !requested.trim()) return canonicalFallback;
  try {
    const candidate = realpathSync(resolve(requested));
    if (!statSync(candidate).isDirectory()) return canonicalFallback;
    const roots = allowedRoots.map(root => realpathSync(resolve(root)));
    return roots.some(root => inside(candidate, root)) ? candidate : canonicalFallback;
  } catch { return canonicalFallback; }
}

function ensureNodePtySpawnHelper() {
  if (process.platform === 'win32') return;
  const entry = require.resolve('node-pty');
  const packageRoot = resolve(dirname(entry), '..');
  const helper = join(packageRoot, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper');
  try { chmodSync(helper, 0o755); }
  catch { /* Source builds use build/Release and already carry executable permissions. */ }
}

export function createTerminalSession({ cwd, cols = 100, rows = 24, onData, onExit }) {
  ensureNodePtySpawnHelper();
  const worker = fileURLToPath(new URL('./terminal-worker.js', import.meta.url));
  let session;
  let finished = false;
  const finish = (exitCode, signal = null, error = null) => {
    if (finished) return;
    finished = true;
    if (error) onData(`\r\n[Terminal failed: ${error.message}]\r\n`);
    onExit({ exitCode, signal, error });
  };
  try {
    session = spawn(process.env.CODEX_WEBUI_NODE || 'node', [worker, cwd, String(cols), String(rows)], {
      cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });
  } catch (error) {
    queueMicrotask(() => finish(1, null, error));
    return { pid: undefined, write: () => false, resize: () => false, kill: () => {} };
  }
  session.stdout.setEncoding('utf8');
  session.stderr.setEncoding('utf8');
  session.stdout.on('data', onData);
  session.stderr.on('data', onData);
  session.on('error', error => finish(1, null, error));
  session.on('exit', (exitCode, signal) => finish(exitCode ?? 0, signal));
  return {
    pid: session.pid,
    write: data => session.stdin.write(data),
    resize: (nextCols, nextRows) => session.send?.({ type: 'resize', cols: nextCols, rows: nextRows }),
    kill: () => {
      try { session.stdin.end(); } catch { /* Session already exited. */ }
      try { session.kill(); } catch { /* Session already exited. */ }
    },
  };
}
