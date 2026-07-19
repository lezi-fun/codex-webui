import { chromium } from 'playwright';
import { launchOptions } from './browser-runtime.mjs';

const browser=await chromium.launch(launchOptions());
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.goto(process.env.CODEX_WEBUI_TEST_URL||'http://127.0.0.1:8899',{waitUntil:'networkidle'});
await page.waitForFunction(()=>globalThis.__codexWebuiDebug);
await page.evaluate(async()=>{
  const api=globalThis.__codexWebuiDebug;
  api.state.active={id:'thread-review-owner',cwd:api.state.config.defaultCwd||'.',source:'local'};
  api.notify('turn/diff/updated',{turnId:'turn-old',threadId:'thread-review-owner',diff:'diff --git a/src/old.ts b/src/old.ts\n--- a/src/old.ts\n+++ b/src/old.ts\n@@ -1 +1 @@\n-oldValue();\n+oldFixed();\n'});
  await api.request({id:'approval-old',method:'item/fileChange/requestApproval',params:{threadId:'thread-review-owner',turnId:'turn-old',itemId:'file-old',reason:'Review the older turn before applying it.'}});
  api.notify('turn/diff/updated',{turnId:'turn-new',threadId:'thread-review-owner',diff:'diff --git a/src/new.ts b/src/new.ts\n--- a/src/new.ts\n+++ b/src/new.ts\n@@ -1 +1 @@\n-newValue();\n+newFixed();\n'});
});
await page.waitForSelector('.approval-review-link');
await page.click('.approval-review-link');
await page.waitForFunction(()=>!document.querySelector('#reviewPanelContent').hidden);
const selected=await page.evaluate(()=>({
  turnId:globalThis.__codexWebuiDebug.state.activeReview?.turnId,
  files:[...document.querySelectorAll('.review-file-name')].map(node=>node.textContent.trim()),
}));
await page.click('#reviewTab');
const selectedAfterTabClick=await page.evaluate(()=>({
  turnId:globalThis.__codexWebuiDebug.state.activeReview?.turnId,
  files:[...document.querySelectorAll('.review-file-name')].map(node=>node.textContent.trim()),
}));
await page.click('#newTask');
const reset=await page.evaluate(()=>({
  activeReview:globalThis.__codexWebuiDebug.state.activeReview,
  turnDiffCount:globalThis.__codexWebuiDebug.state.turnDiffs.size,
  reviewPatchDisabled:document.querySelector('#reviewPatch').disabled,
}));
console.log(JSON.stringify({selected,selectedAfterTabClick,reset,errors},null,2));
await browser.close();
if(errors.length||selected.turnId!=='turn-old'||selected.files.length!==1||selected.files[0]!=='src/old.ts'||selectedAfterTabClick.turnId!=='turn-old'||selectedAfterTabClick.files[0]!=='src/old.ts'||reset.activeReview!==null||reset.turnDiffCount!==0||!reset.reviewPatchDisabled)process.exit(1);
