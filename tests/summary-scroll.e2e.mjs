import { chromium } from 'playwright';
import { launchOptions } from './browser-runtime.mjs';

const browser=await chromium.launch(launchOptions());
const page=await browser.newPage({viewport:{width:591,height:360},isMobile:true,hasTouch:true});
await page.goto(process.env.CODEX_WEBUI_TEST_URL||'http://127.0.0.1:8899',{waitUntil:'networkidle'});
await page.click('#toggleSummaryPanel');
await page.waitForFunction(()=>document.activeElement?.id==='closeSummaryPanel');
const result=await page.evaluate(()=>{
  const panel=document.querySelector('#summaryPanel');
  const toolbar=document.querySelector('.summary-panel-toolbar');
  const scroller=document.querySelector('.summary-panel-scroll');
  scroller.scrollTop=scroller.scrollHeight;
  const source=[...document.querySelectorAll('.summary-section-title')].find(node=>node.textContent.trim()==='Sources');
  const panelRect=panel.getBoundingClientRect(),toolbarRect=toolbar.getBoundingClientRect(),scrollRect=scroller.getBoundingClientRect(),sourceRect=source.getBoundingClientRect();
  return {panelHeight:panelRect.height,toolbarHeight:toolbarRect.height,scrollHeight:scrollRect.height,total:toolbarRect.height+scrollRect.height,sourceBottom:sourceRect.bottom,panelBottom:panelRect.bottom};
});
console.log(JSON.stringify(result,null,2));
await browser.close();
if(result.total>result.panelHeight+.5||result.sourceBottom>result.panelBottom+.5)process.exit(1);