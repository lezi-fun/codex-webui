import { chromium } from 'playwright';
import { launchOptions } from './browser-runtime.mjs';

const base=process.env.CODEX_WEBUI_TEST_URL||'http://127.0.0.1:8899';
const browser=await chromium.launch(launchOptions());
const page=await browser.newPage({viewport:{width:1180,height:820},colorScheme:'dark'});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.goto(base,{waitUntil:'networkidle'});
await page.waitForFunction(()=>globalThis.__codexWebuiDebug?.notify);

await page.evaluate(()=>{
  const api=globalThis.__codexWebuiDebug;
  api.state.active={id:'runtime-thread',name:'Runtime thread',cwd:api.state.config.defaultCwd,turns:[]};
  api.notify('item/started',{turnId:'runtime-turn',item:{id:'runtime-command',type:'commandExecution',command:'bun test'}});
  api.notify('item/commandExecution/outputDelta',{turnId:'runtime-turn',itemId:'runtime-command',delta:'starting tests\n'});
  api.notify('item/started',{turnId:'runtime-turn',item:{id:'runtime-interactive',type:'commandExecution',command:'',commandActions:[]}});
  api.notify('item/commandExecution/terminalInteraction',{turnId:'runtime-turn',itemId:'runtime-interactive',processId:'pty-1',stdin:'echo interactive\r'});
  api.notify('item/fileChange/patchUpdated',{turnId:'runtime-turn',itemId:'runtime-file',changes:[{path:'/tmp/runtime.ts',kind:'update',diff:'@@ -1 +1 @@\n-old\n+new'}]});
});

await page.waitForFunction(()=>document.querySelector('[data-item-id="runtime-command"] .activity-name')?.textContent.includes('Running command'));
await page.click('[data-item-id="runtime-command"]');
await page.click('[data-item-id="runtime-interactive"]');
await page.click('[data-item-id="runtime-file"]');
const running=await page.evaluate(()=>({
  commandLabel:document.querySelector('[data-item-id="runtime-command"] .activity-name')?.textContent.trim(),
  commandOutput:document.querySelector('[data-item-id="runtime-command"] + .activity-output pre')?.textContent,
  interactiveCommand:document.querySelector('[data-item-id="runtime-interactive"] + .activity-output .command-shell-command code')?.textContent,
  fileLabel:document.querySelector('[data-item-id="runtime-file"] .activity-label')?.textContent.trim(),
  filePath:document.querySelector('[data-item-id="runtime-file"] + .activity-output .file-change-output-head span:nth-of-type(2)')?.textContent.trim(),
  fileDiff:document.querySelector('[data-item-id="runtime-file"] + .activity-output pre')?.textContent,
  fileExpanded:document.querySelector('[data-item-id="runtime-file"]')?.getAttribute('aria-expanded'),
}));

await page.evaluate(()=>globalThis.__codexWebuiDebug.notify('item/completed',{turnId:'runtime-turn',item:{id:'runtime-file',type:'fileChange',status:'completed',changes:[{path:'/tmp/runtime.ts',kind:'update',diff:'@@ -1 +1 @@\n-old\n+new'}]}}));
await page.waitForFunction(()=>document.querySelector('[data-item-id="runtime-file"] .activity-label')?.textContent.includes('Edited'));
const completedLabel=await page.locator('[data-item-id="runtime-file"] .activity-label').textContent();

await page.evaluate(()=>{
  const api=globalThis.__codexWebuiDebug;
  api.syncTurnSnapshot({id:'synced-turn',status:'inProgress',itemsView:'full',items:[{id:'synced-command',type:'commandExecution',status:'inProgress',command:'bun run build',aggregatedOutput:'building\n'}]});
});
await page.click('[data-item-id="synced-command"]');
await page.evaluate(()=>{
  const api=globalThis.__codexWebuiDebug;
  api.syncTurnSnapshot({id:'synced-turn',status:'inProgress',itemsView:'full',items:[{id:'synced-command',type:'commandExecution',status:'inProgress',command:'bun run build',aggregatedOutput:'building\nbundled\n'}]});
});
const syncing=await page.evaluate(()=>({
  output:document.querySelector('[data-item-id="synced-command"] + .activity-output pre')?.textContent,
  expanded:document.querySelector('[data-item-id="synced-command"]')?.getAttribute('aria-expanded'),
  stopping:document.querySelector('#sendButton')?.classList.contains('stop'),
  turnId:document.querySelector('#sendButton')?.dataset.turnId,
}));
await page.evaluate(()=>{
  const api=globalThis.__codexWebuiDebug;
  api.syncTurnSnapshot({id:'synced-turn',status:'completed',itemsView:'full',items:[{id:'synced-command',type:'commandExecution',status:'completed',command:'bun run build',aggregatedOutput:'building\nbundled\n',exitCode:0}]});
});
await page.click('#toggleSidePanel');
await page.click('#reviewTab');
const recovered=await page.evaluate(()=>({
  stopped:!document.querySelector('#sendButton')?.classList.contains('stop'),
  reviewPath:document.querySelector('.review-file-name')?.textContent,
  reviewText:document.querySelector('#changeList')?.textContent,
  reviewSource:globalThis.__codexWebuiDebug.state.activeReview?.source,
}));

console.log(JSON.stringify({running,completedLabel,syncing,recovered,errors},null,2));
await browser.close();
if(errors.length||running.commandLabel!=='Running command'||running.commandOutput!=='starting tests\n'||running.interactiveCommand!=='echo interactive'||running.fileLabel!=='Editing files'||!running.filePath?.endsWith('runtime.ts')||!running.fileDiff?.includes('+new')||running.fileExpanded!=='true'||completedLabel?.trim()!=='Edited a file'||syncing.output!=='building\nbundled\n'||syncing.expanded!=='true'||!syncing.stopping||syncing.turnId!=='synced-turn'||!recovered.stopped||!recovered.reviewPath?.endsWith('runtime.ts')||!recovered.reviewText?.includes('old')||!recovered.reviewText?.includes('new')||recovered.reviewSource!=='fileChange')process.exit(1);
