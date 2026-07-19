import { chromium } from 'playwright';
import { artifact, launchOptions } from './browser-runtime.mjs';

const browser=await chromium.launch(launchOptions());
const page=await browser.newPage({viewport:{width:1018,height:980},colorScheme:'dark'});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.goto(process.env.CODEX_WEBUI_TEST_URL||'http://127.0.0.1:8899',{waitUntil:'networkidle'});
await page.waitForFunction(()=>globalThis.__codexWebuiDebug?.state?.config?.defaultCwd);
await page.evaluate(()=>{
  const api=globalThis.__codexWebuiDebug;
  api.state.active={id:'composer-native',name:'Composer parity',cwd:`${api.state.config.home}/projects/codex-webui`,source:'local'};
  api.renderHeader?.();
});
await page.waitForSelector('.composer-context');
await page.waitForFunction(()=>document.querySelector('#workspaceBranch')?.textContent?.trim()==='main');
const result=await page.evaluate(()=>{
  const composer=document.querySelector('.composer');
  const send=document.querySelector('#sendButton');
  const controls=[...document.querySelectorAll('.composer-footer [data-composer-control]')].map(node=>node.dataset.composerControl);
  const labels=[...document.querySelectorAll('.composer-context-item')].map(node=>node.textContent.trim());
  const style=node=>{const s=getComputedStyle(node),r=node.getBoundingClientRect();return {width:r.width,height:r.height,borderRadius:s.borderRadius,display:s.display}};
  return {
    labels,
    controls,
    composer:style(composer),
    send:style(send),
    placeholder:document.querySelector('#prompt')?.placeholder,
    plusIcon:Boolean(document.querySelector('[data-composer-control="add"] [data-icon="plus"]')),
    approvalText:document.querySelector('[data-composer-control="approval"]')?.textContent?.trim(),
    combinedModel:Boolean(document.querySelector('[data-composer-control="model"] #modelLabel')&&document.querySelector('[data-composer-control="model"] #effortLabel')),
    micIcon:Boolean(document.querySelector('[data-composer-control="dictation"] [data-icon="mic"]')),
    legacy:{workspace:Boolean(document.querySelector('.composer-footer #workspaceButton')),agentMode:/^Agent$/.test(document.querySelector('.composer-footer #modeButton')?.textContent?.trim()||''),effortSelectVisible:(()=>{const node=document.querySelector('.composer-footer #effortSelect');return Boolean(node&&node.getBoundingClientRect().width>1&&node.getBoundingClientRect().height>1)})(),contextRing:Boolean(document.querySelector('#contextRing')),caption:Boolean(document.querySelector('.composer-caption'))},
  };
});
await page.click('#modelButton');
const modelMenu=await page.evaluate(()=>({open:!document.querySelector('#modelMenu').hidden,reasoning:document.querySelector('.effort-options')?.textContent?.trim(),options:[...document.querySelectorAll('.effort-option')].map(node=>node.textContent.trim())}));
await page.keyboard.press('Escape');
await page.screenshot({path:artifact('composer-native.png'),fullPage:false});
await page.click('[data-composer-control="add"]');
const addNotice=await page.locator('#toast').textContent();
const folderOpened=await page.locator('#folderDialog').evaluate(node=>node.open);
await page.click('[data-composer-control="dictation"]');
const dictationNotice=await page.locator('#toast').textContent();
console.log(JSON.stringify({result,modelMenu,addNotice,folderOpened,dictationNotice,errors},null,2));
await browser.close();
const expected=['add','approval','model','dictation','send'];
if(errors.length||result.labels.length!==3||!result.labels.some(x=>/codex-webui/i.test(x))||!result.labels.some(x=>/^Local$/i.test(x))||!result.labels.some(x=>/^main$/i.test(x))||JSON.stringify(result.controls)!==JSON.stringify(expected)||!result.plusIcon||!/request approval/i.test(result.approvalText)||!result.combinedModel||!result.micIcon||result.legacy.workspace||result.legacy.agentMode||result.legacy.effortSelectVisible||result.legacy.contextRing||result.legacy.caption||!modelMenu.open||!modelMenu.reasoning||modelMenu.options.length<1||!/native desktop attachment bridge/i.test(addNotice)||folderOpened||!/native desktop audio bridge/i.test(dictationNotice)||parseFloat(result.composer.borderRadius)<20||parseFloat(result.send.borderRadius)<15||Math.abs(result.send.width-result.send.height)>0.5)process.exit(1);
