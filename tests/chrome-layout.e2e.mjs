import { chromium } from 'playwright';
import { launchOptions } from './browser-runtime.mjs';

const browser=await chromium.launch(launchOptions());
const page=await browser.newPage({viewport:{width:1280,height:800},colorScheme:'dark'});
const baseUrl=process.env.CODEX_WEBUI_TEST_URL||'http://127.0.0.1:8899';
const pageErrors=[];
page.on('pageerror',error=>pageErrors.push(error.message));
await page.goto(baseUrl,{waitUntil:'networkidle'});

const initial=await page.evaluate(()=>{
  const topbar=document.querySelector('.topbar');
  const sidebar=document.querySelector('.sidebar');
  const main=document.querySelector('.conversation-shell');
  const sidePanel=document.querySelector('#sidePanel');
  const root=getComputedStyle(document.documentElement);
  return {
    topbarHeight:topbar?.getBoundingClientRect().height,
    hasBottomPanelButton:Boolean(document.querySelector('#toggleBottomPanel')),
    hasSummaryPanelButton:Boolean(document.querySelector('#toggleSummaryPanel')),
    hasSidePanelButton:Boolean(document.querySelector('#toggleSidePanel')),
    summaryPanelPressed:document.querySelector('#toggleSummaryPanel')?.getAttribute('aria-pressed'),
    summaryPanelWidth:document.querySelector('#summaryPanel')?.getBoundingClientRect().width??null,
    summaryPanelHidden:document.querySelector('#summaryPanel')?.hidden??null,
    sidePanelPressed:document.querySelector('#toggleSidePanel')?.getAttribute('aria-pressed'),
    sidePanelWidth:sidePanel?.getBoundingClientRect().width??null,
    sidePanelHidden:sidePanel?.hidden??null,
    appIconReferences:[...document.querySelectorAll('.window-brand img,.empty-state img,.assistant-mark img')].map(node=>node.getAttribute('src')).filter(Boolean),
    knotCount:document.querySelectorAll('[data-codex-interface-mark]').length,
    emptyHasKnot:Boolean(document.querySelector('#emptyState [data-codex-interface-mark]')),
    colors:{
      app:root.getPropertyValue('--app-main').trim(),
      sidebar:root.getPropertyValue('--app-sidebar').trim(),
      panel:root.getPropertyValue('--app-panel').trim(),
      border:root.getPropertyValue('--app-border').trim(),
      text:root.getPropertyValue('--app-text').trim(),
      topbar:getComputedStyle(topbar).backgroundColor,
      sidebarComputed:getComputedStyle(sidebar).backgroundColor,
      mainComputed:getComputedStyle(main).backgroundColor,
    },
    hasHardcodedTerminalPlaceholder:Boolean(document.querySelector('.terminal-placeholder')),
  };
});

await page.click('#toggleSummaryPanel');
await page.waitForFunction(()=>document.querySelector('#summaryPanel')&&!document.querySelector('#summaryPanel').hidden&&document.querySelector('#summaryPanel').getBoundingClientRect().width>0);
const summary=await page.evaluate(()=>({
  width:document.querySelector('#summaryPanel').getBoundingClientRect().width,
  pressed:document.querySelector('#toggleSummaryPanel').getAttribute('aria-pressed'),
  sections:[...document.querySelectorAll('#summaryPanel .summary-section-title')].map(node=>node.textContent.trim()),
  unavailable:[...document.querySelectorAll('#summaryPanel .summary-empty')].map(node=>node.textContent.trim()),
  geometry:(()=>{const panel=document.querySelector('#summaryPanel').getBoundingClientRect(),toolbar=document.querySelector('.summary-panel-toolbar').getBoundingClientRect(),scroll=document.querySelector('.summary-panel-scroll').getBoundingClientRect();return {panelHeight:panel.height,total:toolbar.height+scroll.height,scrollBottom:scroll.bottom,panelBottom:panel.bottom}})(),
}));
await page.click('#toggleSummaryPanel');
await page.waitForFunction(()=>document.querySelector('#summaryPanel').hidden||document.querySelector('#summaryPanel').getBoundingClientRect().width===0);

await page.click('#toggleSidePanel');
await page.waitForFunction(()=>document.querySelector('#sidePanel')&&!document.querySelector('#sidePanel').hidden&&document.querySelector('#sidePanel').getBoundingClientRect().width>0);
const opened=await page.evaluate(()=>({
  width:document.querySelector('#sidePanel').getBoundingClientRect().width,
  pressed:document.querySelector('#toggleSidePanel').getAttribute('aria-pressed'),
  title:document.querySelector('#sidePanelTitle')?.textContent?.trim(),
  activeTab:document.querySelector('.side-panel-tab.active')?.textContent?.trim(),
  launcherActions:[...document.querySelectorAll('.side-panel-launcher-action')].map(node=>node.textContent.trim()),
  reviewVisible:!document.querySelector('#reviewPanelContent')?.hidden,
  visibleTabs:[...document.querySelectorAll('.side-panel-tab')].filter(node=>node.getClientRects().length).map(node=>node.textContent.trim()),
}));

await page.click('[data-side-panel-action="review"]');
const review=await page.evaluate(()=>({
  activeTab:document.querySelector('.side-panel-tab.active')?.textContent?.trim(),
  reviewVisible:!document.querySelector('#reviewPanelContent')?.hidden,
  launcherHidden:document.querySelector('#sidePanelLauncher')?.hidden,
  visibleTabs:[...document.querySelectorAll('.side-panel-tab')].filter(node=>node.getClientRects().length).map(node=>node.textContent.trim()),
}));

await page.click('#toggleSidePanel');
await page.waitForFunction(()=>document.querySelector('#sidePanel').hidden||document.querySelector('#sidePanel').getBoundingClientRect().width===0);

await page.click('#toggleBottomPanel');
await page.waitForFunction(()=>!document.querySelector('#bottomPanel').hidden&&document.querySelector('#bottomPanel').getBoundingClientRect().height>0);
const bottomLauncher=await page.evaluate(()=>({
  pressed:document.querySelector('#toggleBottomPanel').getAttribute('aria-pressed'),
  title:document.querySelector('#bottomPanelTab')?.textContent?.trim(),
  launcherHidden:document.querySelector('#bottomPanelLauncher')?.hidden,
  utilityVisible:!document.querySelector('#bottomPanelUtility')?.hidden,
}));
await page.click('[data-bottom-panel-action="terminal"]');
const bottom=await page.evaluate(()=>({
  pressed:document.querySelector('#toggleBottomPanel').getAttribute('aria-pressed'),
  title:document.querySelector('#bottomPanelTab')?.textContent?.trim(),
  launcherHidden:document.querySelector('#bottomPanelLauncher')?.hidden,
  utilityVisible:!document.querySelector('#bottomPanelUtility')?.hidden,
  description:document.querySelector('#bottomPanelDescription')?.textContent?.trim(),
}));
await page.click('#closeBottomPanel');
await page.waitForFunction(()=>document.querySelector('#bottomPanel').hidden);
await page.click('#toggleBottomPanel');
await page.click('#bottomPanelTab');
await page.click('[data-bottom-panel-action="browser"]');
await page.click('#closeBottomPanel');
await page.click('#toggleBottomPanel');
const bottomRestored=await page.evaluate(()=>({
  title:document.querySelector('#bottomPanelTab')?.textContent?.trim(),
  launcherHidden:document.querySelector('#bottomPanelLauncher')?.hidden,
  utilityVisible:!document.querySelector('#bottomPanelUtility')?.hidden,
}));
await page.click('#closeBottomPanel');

console.log(JSON.stringify({initial,summary,opened,review,bottomLauncher,bottom,bottomRestored,pageErrors},null,2));
await browser.close();

const expectedActions=['Review','Terminal','Browser','Files','Side task'];
const valid=pageErrors.length===0
  &&initial.topbarHeight===46
  &&initial.hasBottomPanelButton
  &&initial.hasSummaryPanelButton
  &&initial.hasSidePanelButton
  &&initial.summaryPanelPressed==='false'
  &&initial.summaryPanelWidth===0
  &&initial.summaryPanelHidden===true
  &&initial.sidePanelPressed==='false'
  &&initial.sidePanelWidth===0
  &&initial.sidePanelHidden===true
  &&initial.appIconReferences.length===0
  &&initial.knotCount>=2
  &&initial.emptyHasKnot
  &&initial.colors.app
  &&initial.colors.sidebar
  &&initial.colors.panel
  &&initial.colors.border
  &&initial.colors.text
  &&initial.hasHardcodedTerminalPlaceholder===false
  &&summary.width>=280
  &&summary.pressed==='true'
  &&JSON.stringify(summary.sections)===JSON.stringify(['Environment','Scheduled','Computer Use','Plan','Side tasks','Sources'])
  &&summary.unavailable.every(text=>/native|app-server/i.test(text))
  &&Math.abs(summary.geometry.total-summary.geometry.panelHeight)<1
  &&summary.geometry.scrollBottom<=summary.geometry.panelBottom+.5
  &&opened.width>=320
  &&opened.pressed==='true'
  &&opened.title==='New tab'
  &&opened.activeTab==='New tab'
  &&JSON.stringify(opened.visibleTabs)===JSON.stringify(['New tab'])
  &&expectedActions.every(label=>opened.launcherActions.includes(label))
  &&opened.reviewVisible===false
  &&review.activeTab?.startsWith('Review')
  &&review.visibleTabs.length===2
  &&review.visibleTabs[0]==='New tab'
  &&review.visibleTabs[1]?.startsWith('Review')
  &&review.reviewVisible===true
  &&review.launcherHidden===true
  &&bottomLauncher.title==='New tab'
  &&bottomLauncher.launcherHidden===false
  &&bottomLauncher.utilityVisible===false
  &&bottom.pressed==='true'
  &&bottom.title==='Terminal'
  &&bottom.launcherHidden===true
  &&bottom.utilityVisible===true
  &&bottom.description?.includes('terminal bridge')
  &&bottomRestored.title==='Browser'
  &&bottomRestored.launcherHidden===true
  &&bottomRestored.utilityVisible===true;
if(!valid)process.exit(1);
