import { chromium } from 'playwright';
import { artifact, launchOptions } from './browser-runtime.mjs';

const browser=await chromium.launch(launchOptions());
const page=await browser.newPage({viewport:{width:1018,height:980},colorScheme:'dark'});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.goto(process.env.CODEX_WEBUI_TEST_URL||'http://127.0.0.1:8899',{waitUntil:'networkidle'});
await page.waitForFunction(()=>globalThis.__codexWebuiDebug?.state?.config?.defaultCwd);
await page.click('#newTask');
await page.waitForFunction(()=>document.querySelector('#modelLabel')?.textContent?.trim()&&!/loading/i.test(document.querySelector('#modelLabel').textContent));
const modelFilter=await page.evaluate(()=>{
  const api=globalThis.__codexWebuiDebug;
  const mixed=[...api.state.models,{model:'o3',displayName:'o3'}];
  api.state.models=api.filterAppModels(mixed);
  api.renderModels();
  return {models:api.state.models.map(model=>model.model),hasO3:api.state.models.some(model=>model.model==='o3')};
});

const home=await page.evaluate(()=>{
  const composer=document.querySelector('.composer');
  const send=document.querySelector('#sendButton');
  const trigger=document.querySelector('#modelButton');
  const style=node=>{const s=getComputedStyle(node),r=node.getBoundingClientRect();return {width:r.width,height:r.height,borderRadius:s.borderRadius,background:s.backgroundColor,border:s.borderTopWidth,display:s.display}};
  return {
    heading:document.querySelector('.empty-state h1')?.textContent?.trim(),
    placeholder:document.querySelector('#prompt')?.placeholder,
    fixedContextVisible:Boolean(document.querySelector('.composer-context')&&document.querySelector('.composer-context').getBoundingClientRect().height>1),
    contextTrayHidden:document.querySelector('#composerContextTray')?.hidden,
    controls:[...document.querySelectorAll('.composer-footer [data-composer-control]')].map(node=>node.dataset.composerControl),
    composer:style(composer),send:style(send),trigger:style(trigger),
    triggerText:trigger?.textContent?.replace(/\s+/g,' ').trim(),
    nativeTrigger:trigger?.hasAttribute('data-codex-intelligence-trigger'),
  };
});
const contextUsage=await page.evaluate(()=>{
  const api=globalThis.__codexWebuiDebug,initiallyHidden=document.querySelector('#contextUsage').hidden;
  api.state.active={id:'context-thread',cwd:api.state.config.defaultCwd};
  api.notify('thread/tokenUsage/updated',{threadId:'context-thread',tokenUsage:{modelContextWindow:200000,last:{totalTokens:80000}}});
  const indicator=document.querySelector('#contextUsage'),progress=indicator.querySelector('.context-usage-progress'),dictation=document.querySelector('[data-composer-control="dictation"]');
  return {
    initiallyHidden,
    hidden:indicator.hidden,
    ariaLabel:indicator.getAttribute('aria-label'),
    tooltip:indicator.dataset.tooltip,
    dashOffset:getComputedStyle(progress).strokeDashoffset,
    inComposerRight:indicator.parentElement?.classList.contains('composer-right'),
    beforeDictation:Boolean(indicator.compareDocumentPosition(dictation)&Node.DOCUMENT_POSITION_FOLLOWING),
  };
});

await page.click('#modelButton');
await page.screenshot({path:artifact('composer-model-menu.png'),fullPage:false});
const modelMain=await page.evaluate(()=>({
  open:!document.querySelector('#modelMenu').hidden,
  title:document.querySelector('#modelMenu .model-menu-title')?.textContent?.trim(),
  effortRows:[...document.querySelectorAll('#modelMenu .model-effort-row')].map(node=>node.textContent.trim()),
  modelRow:document.querySelector('#modelSubmenuButton')?.textContent?.replace(/\s+/g,' ').trim(),
  directModelRows:document.querySelectorAll('#modelMenu>.model-option').length,
  width:document.querySelector('#modelMenu').getBoundingClientRect().width,
}));
await page.click('#modelMenu .model-effort-row[data-value="high"]');
const effortSelection=await page.evaluate(()=>({menuHidden:document.querySelector('#modelMenu').hidden,label:document.querySelector('#effortLabel').textContent.trim()}));
await page.click('#modelButton');
await page.click('#modelSubmenuButton');
const modelSubmenu=await page.evaluate(()=>({
  title:document.querySelector('#modelMenu .model-menu-title')?.textContent?.trim(),
  rows:[...document.querySelectorAll('#modelMenu .model-option')].map(node=>node.textContent.replace(/\s+/g,' ').trim()),
  back:Boolean(document.querySelector('#modelMenuBack')),
}));
await page.click('#modelMenu .model-option[data-model="gpt-5.6-luna"]');
await page.click('#modelButton');
const lunaEfforts=await page.locator('#modelMenu .model-effort-row').allTextContents();
await page.click('#modelSubmenuButton');
await page.click('#modelMenu .model-option[data-model="gpt-5.6-sol"]');
await page.click('#modelButton');
const solEfforts=await page.locator('#modelMenu .model-effort-row').allTextContents();
await page.keyboard.press('Escape');
await page.screenshot({path:artifact('composer-native.png'),fullPage:false});
await page.setViewportSize({width:390,height:844});
const mobileModel=await page.evaluate(()=>{
  const label=document.querySelector('#modelLabel'),trigger=document.querySelector('#modelButton'),rect=label?.getBoundingClientRect();
  return {
    label:label?.textContent?.trim(),
    labelDisplay:label?getComputedStyle(label).display:null,
    labelWidth:rect?.width??0,
    triggerText:trigger?.textContent?.replace(/\s+/g,' ').trim(),
    horizontalOverflow:document.documentElement.scrollWidth>innerWidth,
  };
});
console.log(JSON.stringify({home,contextUsage,modelFilter,modelMain,effortSelection,modelSubmenu,lunaEfforts,solEfforts,mobileModel,errors},null,2));
await browser.close();

const expected=['add','project','approval','model','dictation','send'];
if(errors.length
  ||!/^What can I help with in .+\?$/.test(home.heading||'')
  ||home.placeholder!=='Do anything'
  ||home.fixedContextVisible
  ||home.contextTrayHidden!==true
  ||JSON.stringify(home.controls)!==JSON.stringify(expected)
  ||!home.nativeTrigger
  ||!contextUsage.initiallyHidden
  ||contextUsage.hidden
  ||contextUsage.ariaLabel!=='Context usage: 40%'
  ||contextUsage.tooltip!=='Context window:\n40% used (60% left)\n80k / 200k tokens used'
  ||Math.abs(parseFloat(contextUsage.dashOffset)-60)>.1
  ||!contextUsage.inComposerRight
  ||!contextUsage.beforeDictation
  ||/^GPT-/i.test(home.triggerText||'')
  ||modelFilter.hasO3
  ||modelFilter.models.some(model=>!/^gpt(?:[-_.\s]|$)/i.test(model))
  ||home.trigger.border!=='0px'
  ||modelMain.title!=='Reasoning'
  ||modelMain.effortRows.length<1
  ||!/Model/i.test(modelMain.modelRow||'')
  ||modelMain.directModelRows!==0
  ||modelMain.width<210||modelMain.width>250
  ||!effortSelection.menuHidden||effortSelection.label!=='High'
  ||modelSubmenu.title!=='Model'
  ||modelSubmenu.rows.length<1
  ||!modelSubmenu.back
  ||modelMain.effortRows.includes('Light')
  ||lunaEfforts.includes('Light')
  ||solEfforts.includes('Light')
  ||lunaEfforts.includes('Ultra')
  ||!lunaEfforts.includes('Max')
  ||!solEfforts.includes('Ultra')
  ||!mobileModel.label
  ||mobileModel.labelDisplay==='none'
  ||mobileModel.labelWidth<1
  ||!mobileModel.triggerText?.includes(mobileModel.label)
  ||mobileModel.horizontalOverflow
  ||parseFloat(home.composer.borderRadius)<20
  ||Math.abs(home.send.width-home.send.height)>.5)process.exit(1);
