import { chromium } from 'playwright';
import { launchOptions } from './browser-runtime.mjs';

const browser=await chromium.launch(launchOptions());
const results=[];

for(const width of [1101,1150,1190]){
  const page=await browser.newPage({viewport:{width,height:800},colorScheme:'dark'});
  await page.goto(process.env.CODEX_WEBUI_TEST_URL||'http://127.0.0.1:8899',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>globalThis.__codexWebuiDebug);
  await page.evaluate(()=>{
    const api=globalThis.__codexWebuiDebug;
    api.notify('turn/diff/updated',{turnId:'responsive-turn',threadId:'responsive-thread',diff:'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old();\n+next();\n'});
    document.querySelector('#reviewMode').click();
  });
  await page.click('#toggleSidePanel');
  await page.click('[data-side-panel-action="review"]');
  await page.waitForFunction(()=>document.activeElement?.id==='closeSidePanel');
  const result=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,mainWidth:document.querySelector('.conversation-shell').getBoundingClientRect().width,panelWidth:document.querySelector('#sidePanel').getBoundingClientRect().width,ariaModal:document.querySelector('#sidePanel').getAttribute('aria-modal'),conversationInert:document.querySelector('.conversation-shell').inert,activeId:document.activeElement?.id}));
  results.push(result);
  await page.close();
}

for(const width of [320,360]){
  const page=await browser.newPage({viewport:{width,height:700},isMobile:true,hasTouch:true,colorScheme:'dark'});
  await page.goto(process.env.CODEX_WEBUI_TEST_URL||'http://127.0.0.1:8899',{waitUntil:'networkidle'});
  await page.click('#toggleBottomPanel');
  const launcher=await page.evaluate(()=>{const panel=document.querySelector('#bottomPanel').getBoundingClientRect(),buttons=[...document.querySelectorAll('[data-bottom-panel-action]')].map(node=>node.getBoundingClientRect().toJSON());return {title:document.querySelector('#bottomPanelTab').textContent.trim(),visible:!document.querySelector('#bottomPanelLauncher').hidden,buttonsInside:buttons.every(rect=>rect.left>=panel.left&&rect.right<=panel.right)}});
  await page.click('[data-bottom-panel-action="terminal"]');
  const result=await page.evaluate(launcher=>{const panel=document.querySelector('#bottomPanel').getBoundingClientRect();return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,panel,launcher,title:document.querySelector('#bottomPanelTab').textContent.trim(),utilityVisible:!document.querySelector('#bottomPanelUtility').hidden}},launcher);
  results.push(result);
  await page.close();
}

{
  const page=await browser.newPage({viewport:{width:1190,height:800},colorScheme:'dark'});
  await page.goto(process.env.CODEX_WEBUI_TEST_URL||'http://127.0.0.1:8899',{waitUntil:'networkidle'});
  await page.click('#toggleSidePanel');
  await page.waitForFunction(()=>document.querySelector('.conversation-shell').inert&&document.querySelector('#sidePanel').getAttribute('aria-modal')==='true');
  const overlay=await page.evaluate(()=>({conversationInert:document.querySelector('.conversation-shell').inert,modal:document.querySelector('#sidePanel').getAttribute('aria-modal')}));
  await page.setViewportSize({width:1280,height:800});
  await page.waitForFunction(()=>!document.querySelector('.conversation-shell').inert&&document.querySelector('#sidePanel').getAttribute('aria-modal')==='false');
  const docked=await page.evaluate(()=>({conversationInert:document.querySelector('.conversation-shell').inert,modal:document.querySelector('#sidePanel').getAttribute('aria-modal')}));
  await page.setViewportSize({width:1190,height:800});
  await page.waitForFunction(()=>document.querySelector('.conversation-shell').inert&&document.querySelector('#sidePanel').getAttribute('aria-modal')==='true'&&document.activeElement?.id==='closeSidePanel');
  const overlayAgain=await page.evaluate(()=>({conversationInert:document.querySelector('.conversation-shell').inert,modal:document.querySelector('#sidePanel').getAttribute('aria-modal'),activeId:document.activeElement?.id}));
  results.push({breakpointSync:{overlay,docked,overlayAgain}});
  await page.close();
}

await browser.close();
console.log(JSON.stringify(results,null,2));
const sync=results.find(result=>result.breakpointSync)?.breakpointSync;
if(results.some(result=>result.scrollWidth>result.width||('ariaModal'in result&&(result.ariaModal!=='true'||!result.conversationInert||result.activeId!=='closeSidePanel'))||('launcher'in result&&(result.launcher.title!=='New tab'||!result.launcher.visible||!result.launcher.buttonsInside||result.title!=='Terminal'||!result.utilityVisible)))||!sync?.overlay.conversationInert||sync.overlay.modal!=='true'||sync.docked.conversationInert||sync.docked.modal!=='false'||!sync.overlayAgain.conversationInert||sync.overlayAgain.modal!=='true'||sync.overlayAgain.activeId!=='closeSidePanel')process.exit(1);
