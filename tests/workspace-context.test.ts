import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { readWorkspaceContext } from '../workspace-context.js';

describe('workspace composer context', () => {
  test('reports the selected folder, local environment, and current git branch', () => {
    const root=mkdtempSync(join(tmpdir(),'codex-webui-context-'));
    try {
      const repo=join(root,'sample-project');mkdirSync(repo);
      execFileSync('git',['init','-b','feature/composer'],{cwd:repo,stdio:'ignore'});
      expect(readWorkspaceContext(repo,[root])).toEqual({cwd:repo,project:'sample-project',environment:'Local',branch:'feature/composer'});
    } finally { rmSync(root,{recursive:true,force:true}); }
  });

  test('falls back cleanly outside a git repository and rejects escaped paths', () => {
    const root=mkdtempSync(join(tmpdir(),'codex-webui-context-'));
    try {
      expect(readWorkspaceContext(root,[root])).toEqual({cwd:root,project:root.split('/').at(-1),environment:'Local',branch:'No branch'});
      expect(()=>readWorkspaceContext('/private/tmp',[root])).toThrow('outside allowed roots');
    } finally { rmSync(root,{recursive:true,force:true}); }
  });
});
