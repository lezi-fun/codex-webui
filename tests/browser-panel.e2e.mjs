import { chromium } from 'playwright';
import { launchOptions } from './browser-runtime.mjs';

const base=process.env.CODEX_WEBUI_TEST_URL||'http://127.0.0.1:8899';
const browser=await chromium.launch(launchOptions());
const results=[];

for(const viewport of [{width:1280,height:720},{width:360,height:700}]){
  const mobile=viewport.width<720;
  const page=await browser.newPage({viewport,isMobile:mobile,hasTouch:mobile,colorScheme:'dark'});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('404'))errors.push(message.text())});
  await page.goto(base,{waitUntil:'networkidle'});
  await page.click('#toggleSidePanel');
  await page.click('[data-side-panel-action="browser"]');
  await page.waitForFunction(()=>!document.querySelector('#browserPanel').hidden);
  const emptyExternalHidden=await page.locator('#browserOpenExternal').evaluate(node=>node.hidden&&getComputedStyle(node).display==='none');

  await page.fill('#browserUrl','javascript:alert(1)');
  await page.press('#browserUrl','Enter');
  await page.waitForFunction(()=>document.querySelector('#browserNoticeTitle').textContent==='Invalid address');
  const first=`${base}/api/config?browser=first`;
  const second=`${base}/api/config?browser=second`;
  await page.fill('#browserUrl',first);
  await page.press('#browserUrl','Enter');
  await page.waitForFunction(()=>document.querySelector('#browserStatus')?.dataset.tone==='loaded');
  await page.fill('#browserUrl',second);
  await page.press('#browserUrl','Enter');
  await page.waitForFunction(url=>document.querySelector('#browserUrl').value===url&&document.querySelector('#browserStatus')?.dataset.tone==='loaded',second);
  await page.click('#browserBack');
  await page.waitForFunction(url=>document.querySelector('#browserUrl').value===url&&document.querySelector('#browserStatus')?.dataset.tone==='loaded',first);
  await page.click('#browserForward');
  await page.waitForFunction(url=>document.querySelector('#browserUrl').value===url&&document.querySelector('#browserStatus')?.dataset.tone==='loaded',second);
  await page.click('#browserRefresh');
  await page.waitForFunction(()=>document.querySelector('#browserStatus')?.dataset.tone==='loaded');
  await page.click('#newTab');
  await page.click('#utilityTab');

  const result=await page.evaluate(()=>{
    const panel=document.querySelector('#sidePanel').getBoundingClientRect();
    const debug=globalThis.__codexWebuiDebug;
    return {
      width:innerWidth,
      scrollWidth:document.documentElement.scrollWidth,
      panelWidth:panel.width,
      panelVisible:!document.querySelector('#browserPanel').hidden,
      tabSelected:document.querySelector('#utilityTab').getAttribute('aria-selected'),
      history:[...debug.browserState.history],
      historyIndex:debug.browserState.index,
      backDisabled:document.querySelector('#browserBack').disabled,
      forwardDisabled:document.querySelector('#browserForward').disabled,
      externalHref:document.querySelector('#browserOpenExternal').href,
      frameSrc:document.querySelector('#browserFrame').src,
      frameSandbox:document.querySelector('#browserFrame').getAttribute('sandbox'),
    };
  });
  results.push({...result,emptyExternalHidden,errors});
  await page.close();
}

await browser.close();
console.log(JSON.stringify(results,null,2));
if(results.some(result=>!result.emptyExternalHidden||!result.panelVisible||result.tabSelected!=='true'||result.history.length!==2||result.historyIndex!==1||result.backDisabled||!result.forwardDisabled||result.externalHref!==result.history[1]||result.frameSrc!==result.history[1]||!result.frameSandbox?.includes('allow-scripts')||result.scrollWidth>result.width||result.errors.length))process.exit(1);
if(results[1].panelWidth!==360)process.exit(1);
