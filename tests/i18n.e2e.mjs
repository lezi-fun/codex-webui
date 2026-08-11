import { chromium } from 'playwright';
import { artifact, launchOptions } from './browser-runtime.mjs';

const base=process.env.CODEX_WEBUI_TEST_URL||'http://127.0.0.1:8899';
const browser=await chromium.launch(launchOptions());
const context=await browser.newContext({viewport:{width:1120,height:760},colorScheme:'dark'});
await context.addInitScript(()=>{if(window===window.top)localStorage.setItem('codex-webui-locale','zh-CN')});
const page=await context.newPage();
page.setDefaultTimeout(10_000);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));

await page.goto(base,{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>globalThis.__codexWebuiDebug?.openSettings);
await page.waitForFunction(()=>document.documentElement.lang==='zh-CN');
await page.evaluate(()=>{
  globalThis.__codexWebuiDebug.startNewTask();
  const effort=document.querySelector('#effortSelect');
  effort.innerHTML='<option value="low" selected>low</option>';
  globalThis.__codexWebuiI18n.setPreference('zh-CN');
  const message=document.createElement('div');
  message.id='i18nContentProbe';
  message.className='message-text';
  message.textContent='Settings Running command';
  document.body.append(message);
  globalThis.__codexWebuiDebug.openSettings('general-settings');
});
await page.waitForFunction(()=>document.querySelector('#settingsDialog')?.open&&document.querySelector('#settingsPageTitle')?.textContent==='通用');

const chinese=await page.evaluate(()=>({
  lang:document.documentElement.lang,
  preference:localStorage.getItem('codex-webui-locale'),
  newChat:document.querySelector('#newTask span:nth-child(2)')?.textContent.trim(),
  threadTitle:document.querySelector('#threadTitle')?.textContent.trim(),
  settings:document.querySelector('#settingsTitle')?.textContent.trim(),
  page:document.querySelector('#settingsPageTitle')?.textContent.trim(),
  language:document.querySelector('#languageSelect')?.value,
  systemOption:document.querySelector('#languageSelect option[value="system"]')?.textContent.trim(),
  effort:document.querySelector('#effortLabel')?.textContent.trim(),
  content:document.querySelector('#i18nContentProbe')?.textContent,
}));
await page.screenshot({path:artifact('i18n-zh-cn.png'),fullPage:false});

await page.selectOption('#languageSelect','en');
await page.waitForFunction(()=>document.documentElement.lang==='en'&&document.querySelector('#settingsPageTitle')?.textContent==='General');
const english=await page.evaluate(()=>({
  lang:document.documentElement.lang,
  preference:localStorage.getItem('codex-webui-locale'),
  newChat:document.querySelector('#newTask span:nth-child(2)')?.textContent.trim(),
  threadTitle:document.querySelector('#threadTitle')?.textContent.trim(),
  page:document.querySelector('#settingsPageTitle')?.textContent.trim(),
  language:document.querySelector('#languageSelect')?.value,
  effort:document.querySelector('#effortLabel')?.textContent.trim(),
  content:document.querySelector('#i18nContentProbe')?.textContent,
}));

await page.selectOption('#languageSelect','zh-CN');
await page.reload({waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>globalThis.__codexWebuiDebug&&document.documentElement.lang==='zh-CN');
const persisted=await page.evaluate(()=>({
  lang:document.documentElement.lang,
  preference:localStorage.getItem('codex-webui-locale'),
  language:document.querySelector('#languageSelect')?.value,
  page:document.querySelector('#settingsPageTitle')?.textContent.trim(),
}));

console.log(JSON.stringify({chinese,english,persisted,errors},null,2));
await browser.close();
if(
  errors.length||
  chinese.lang!=='zh-CN'||chinese.preference!=='zh-CN'||chinese.newChat!=='新对话'||chinese.threadTitle!=='新任务'||chinese.settings!=='设置'||chinese.page!=='通用'||chinese.language!=='zh-CN'||chinese.systemOption!=='跟随系统'||chinese.effort!=='低'||chinese.content!=='Settings Running command'||
  english.lang!=='en'||english.preference!=='en'||english.newChat!=='New chat'||english.threadTitle!=='New task'||english.page!=='General'||english.language!=='en'||english.effort!=='Low'||english.content!=='Settings Running command'||
  persisted.lang!=='zh-CN'||persisted.preference!=='zh-CN'||persisted.language!=='zh-CN'||persisted.page!=='通用'
)process.exit(1);
