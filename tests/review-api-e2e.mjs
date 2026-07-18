import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const config=await fetch('http://127.0.0.1:8899/api/config').then(response=>response.json());
const fixture=join(config.reviewRoot,`.codex-webui-review-api-${process.pid}`);
const file=join(fixture,'sample.txt');
function git(...args){const r=Bun.spawnSync(['git',...args],{cwd:fixture,stdout:'pipe',stderr:'pipe'});if(r.exitCode)throw new Error(r.stderr.toString());return r.stdout.toString()}
rmSync(fixture,{recursive:true,force:true});mkdirSync(fixture,{recursive:true});
try{
 git('init','-q');git('config','user.name','Codex WebUI Test');git('config','user.email','test@invalid.local');
 writeFileSync(file,'before\n');git('add','sample.txt');git('commit','-qm','initial');writeFileSync(file,'after\nextra\n');
 const diff=git('diff','--','sample.txt');
 const call=async action=>{const response=await fetch('http://127.0.0.1:8899/api/review/patch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cwd:fixture,diff,action})});const body=await response.json();if(!response.ok)throw new Error(body.error);return body};
 const undone=await call('undo');const afterUndo=readFileSync(file,'utf8');
 const reapplied=await call('reapply');const afterReapply=readFileSync(file,'utf8');
 console.log(JSON.stringify({undone,afterUndo,reapplied,afterReapply},null,2));
 if(afterUndo!=='before\n'||afterReapply!=='after\nextra\n')throw new Error('Review API did not update the worktree correctly');
}finally{rmSync(fixture,{recursive:true,force:true})}
