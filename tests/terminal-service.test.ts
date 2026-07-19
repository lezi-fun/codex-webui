import { realpathSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import { createTerminalSession, normalizeTerminalResize, resolveTerminalCwd } from '../terminal-service.js';

describe('terminal service', () => {
  test('accepts bounded PTY sizes and rejects malformed resize messages', () => {
    expect(normalizeTerminalResize({ type: 'resize', cols: 120, rows: 32 })).toEqual({ cols: 120, rows: 32 });
    expect(normalizeTerminalResize({ type: 'resize', cols: 0, rows: 32 })).toBeNull();
    expect(normalizeTerminalResize({ type: 'resize', cols: 120, rows: 5000 })).toBeNull();
    expect(normalizeTerminalResize({ type: 'data', cols: 120, rows: 32 })).toBeNull();
  });

  test('keeps terminal cwd inside the same allowed browse roots', () => {
    const roots = ['/Users/home'];
    expect(resolveTerminalCwd('/Users/home/projects/codex-webui', roots, '/Users/home/projects')).toBe(realpathSync('/Users/home/projects/codex-webui'));
    expect(resolveTerminalCwd('/private/tmp', roots, '/Users/home/projects')).toBe(realpathSync('/Users/home/projects'));
    expect(resolveTerminalCwd(null, roots, '/Users/home/projects')).toBe(realpathSync('/Users/home/projects'));
  });

  test('reports a missing PTY worker runtime without crashing the server', async () => {
    const previous = process.env.CODEX_WEBUI_NODE;
    process.env.CODEX_WEBUI_NODE = '/definitely/missing/codex-webui-node';
    try {
      const result = await new Promise(resolve => {
        const session = createTerminalSession({
          cwd: realpathSync('/Users/home/projects'),
          onData: () => {},
          onExit: event => { session.kill(); resolve(event); },
        });
      });
      expect(result.exitCode).toBe(1);
    } finally {
      if (previous === undefined) delete process.env.CODEX_WEBUI_NODE;
      else process.env.CODEX_WEBUI_NODE = previous;
    }
  });
});
