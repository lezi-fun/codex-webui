import { chromium } from 'playwright';
import { artifact, launchOptions } from './browser-runtime.mjs';
const browser=await chromium.launch(launchOptions());
async function run(width,height,name){
 const page=await browser.newPage({viewport:{width,height},isMobile:width<720,hasTouch:width<720});
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log(name,'pageerror',e.message)});page.on('console',m=>{console.log(name,'console',m.type(),m.text());if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text())});
 await page.goto('http://127.0.0.1:8899',{waitUntil:'networkidle'});
 await page.waitForTimeout(1000);
 console.log(name,'debug-state',await page.evaluate(()=>({debug:!!globalThis.__codexWebuiDebug,scripts:[...document.scripts].map(s=>s.src)})));
 await page.waitForFunction(()=>globalThis.__codexWebuiDebug);
 await page.evaluate(async()=>{
   const api=globalThis.__codexWebuiDebug;
   api.notify('item/started',{turnId:'turn-demo',item:{id:'cmd-demo',type:'commandExecution',status:'inProgress',command:'bun test tests/codex-surfaces.test.ts'}});
   api.notify('turn/diff/updated',{turnId:'turn-demo',threadId:'thread-demo',diff:'diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1,2 +1,3 @@\n const app = true;\n-old();\n+next();\n+export { next };\n'});
   await api.request({id:'approval-demo',method:'item/commandExecution/requestApproval',params:{threadId:'thread-demo',turnId:'turn-demo',itemId:'cmd-demo',command:'bun test tests/codex-surfaces.test.ts',cwd:globalThis.__codexWebuiDebug.state.config.defaultCwd||'.',reason:'Run the focused test suite to verify the UI changes.',proposedExecpolicyAmendment:['bun','test'],startedAtMs:Date.now()}});
 });
 await page.waitForSelector('[data-codex-approval-surface]');
 await page.waitForSelector('.activity-motion svg');
 await page.waitForSelector('.review-file',{state:'attached'});
 await page.click('.approval-menu-toggle');
 if(width<720)await page.evaluate(()=>document.querySelector('#changesPanel').classList.add('mobile-review-open'));
 await page.waitForSelector('#reviewMode:not([disabled])');
 await page.click('#reviewMode');
 await page.click('#reviewWrap');
 const result=await page.evaluate(()=>{
  const rect=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r&&{x:r.x,y:r.y,width:r.width,height:r.height}};
  const card=document.querySelector('[data-codex-approval-surface]');
  const anim=document.querySelector('.activity-motion svg');
  const waiting=document.querySelector('.activity-summary-copy')?.textContent;
  const menuVisible=!card.querySelector('.approval-menu')?.hidden;
  return {card:rect('[data-codex-approval-surface]'),composer:rect('.composer'),buttons:[...card.querySelectorAll('button')].map(x=>x.textContent.trim()),commandLines:getComputedStyle(card.querySelector('.approval-command code')).webkitLineClamp,animationSvg:!!anim,reviewFiles:document.querySelectorAll('.review-file').length,reviewAdds:document.querySelector('#reviewStats')?.textContent,waiting,menuVisible,reviewDrawer:document.querySelector('#changesPanel').classList.contains('mobile-review-open'),reviewWidth:rect('#changesPanel')?.width,reviewMode:document.querySelector('#changeList')?.dataset.mode,reviewWrap:document.querySelector('#changeList')?.classList.contains('wrap'),splitRows:document.querySelectorAll('.review-split-row').length,scrollWidth:document.documentElement.scrollWidth,innerWidth};
 });
 await page.screenshot({path:artifact(`${name}.png`),fullPage:false});
 console.log(name,JSON.stringify({...result,errors},null,2));
 if(!result.animationSvg||result.reviewFiles!==1||result.commandLines!=='3'||result.scrollWidth>result.innerWidth||errors.length)throw new Error(`${name} failed`);
 await page.close();
}
await run(1280,720,'surfaces-desktop');
await run(591,1100,'surfaces-mobile');
await browser.close();
