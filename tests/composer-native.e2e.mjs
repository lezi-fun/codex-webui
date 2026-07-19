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
console.log(JSON.stringify({home,modelMain,effortSelection,modelSubmenu,lunaEfforts,solEfforts,errors},null,2));
await browser.close();

const expected=['add','project','approval','model','dictation','send'];
if(errors.length
  ||!/^What can I help with in .+\?$/.test(home.heading||'')
  ||home.placeholder!=='Do anything'
  ||home.fixedContextVisible
  ||home.contextTrayHidden!==true
  ||JSON.stringify(home.controls)!==JSON.stringify(expected)
  ||!home.nativeTrigger
  ||/^GPT-/i.test(home.triggerText||'')
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
  ||lunaEfforts.includes('Ultra')
  ||!lunaEfforts.includes('Max')
  ||!solEfforts.includes('Ultra')
  ||parseFloat(home.composer.borderRadius)<20
  ||Math.abs(home.send.width-home.send.height)>.5)process.exit(1);