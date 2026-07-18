import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchOptions, root } from './browser-runtime.mjs';

const output=resolve(root,'docs/assets/overview.png');
mkdirSync(resolve(root,'docs/assets'),{recursive:true});
const browser=await chromium.launch(launchOptions());
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
await page.goto('http://127.0.0.1:8899',{waitUntil:'networkidle'});
await page.waitForFunction(()=>globalThis.__codexWebuiDebug?.state?.config?.defaultCwd);
await page.evaluate(async()=>{
 const api=globalThis.__codexWebuiDebug;
 const demo=`${api.state.config.home}/projects/demo-app`;
 api.state.active={id:'readme-thread',name:'Build a responsive settings panel',cwd:demo,source:'local'};
 document.querySelector('#threadTitle').textContent='Build a responsive settings panel';
 document.querySelector('#threadPath').textContent='~/projects/demo-app';
 document.querySelector('#projectName').textContent='demo-app';
 document.querySelector('#projectPath').textContent='~/projects/demo-app';
 document.querySelector('#workspaceName').textContent='demo-app';
 document.querySelector('#modelLabel').textContent='Codex model';
 api.renderAccount({type:'chatgpt',displayName:'Demo User',avatarUrl:null,planType:'plus',initials:'DU'});
 document.querySelector('#threadList').innerHTML=`
   <div class="thread-group">Today</div>
   <button class="thread-item active"><span class="thread-name">Build a responsive settings panel</span><span class="thread-meta"><time>now</time></span></button>
   <button class="thread-item"><span class="thread-name">Add keyboard shortcuts</span><span class="thread-meta"><time>18m</time></span></button>
   <div class="thread-group">Yesterday</div>
   <button class="thread-item"><span class="thread-name">Refactor the settings store</span><span class="thread-meta"><time>1d</time></span></button>`;
 document.querySelector('#conversation').innerHTML='<article class="turn user-turn"><div class="user-message">Add a responsive settings panel, run the checks, and show me the changes.</div></article>';
 api.notify('item/completed',{turnId:'readme-turn',item:{id:'readme-edit',type:'fileChange',status:'completed',changes:[{path:`${demo}/src/settings.ts`,additions:3,deletions:1}]}});
 api.notify('item/completed',{turnId:'readme-turn',item:{id:'readme-test',type:'commandExecution',status:'completed',command:'bun test',aggregatedOutput:'12 tests passed'}});
 api.notify('item/started',{turnId:'readme-turn',item:{id:'readme-command',type:'commandExecution',status:'inProgress',command:'bun run check'}});
 api.notify('turn/diff/updated',{turnId:'readme-turn',threadId:'readme-thread',diff:'diff --git a/src/settings.ts b/src/settings.ts\n--- a/src/settings.ts\n+++ b/src/settings.ts\n@@ -1,3 +1,5 @@\n export const settings = {\n-  compact: false,\n+  compact: true,\n+  responsive: true,\n+  theme: "system",\n };\n'});
 await api.request({id:'readme-approval',method:'item/commandExecution/requestApproval',params:{threadId:'readme-thread',turnId:'readme-turn',itemId:'readme-command',command:'bun run check',cwd:demo,reason:'Verify the browser and server bundles before finishing.',proposedExecpolicyAmendment:['bun','run','check']}});
 document.querySelector('.approval-title').textContent='Allow Codex to run this command?';
 document.body.classList.remove('changes-hidden');
 api.renderChanges();
});
await page.waitForSelector('[data-codex-approval-surface]');
await page.waitForSelector('.review-file');
await page.screenshot({path:output,fullPage:false});
console.log(output);
await browser.close();
