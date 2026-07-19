import { chromium } from 'playwright';
import { artifact, launchOptions } from './browser-runtime.mjs';

const browser=await chromium.launch(launchOptions());
const page=await browser.newPage({viewport:{width:1018,height:980},colorScheme:'dark'});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.goto(process.env.CODEX_WEBUI_TEST_URL||'http://127.0.0.1:8899',{waitUntil:'networkidle'});
await page.waitForFunction(()=>globalThis.__codexWebuiDebug?.state?.config?.defaultCwd);
await page.click('#newTask');

await page.locator('#prompt').fill('/');
await page.waitForSelector('#composerAutocomplete:not([hidden])');
await page.screenshot({path:artifact('composer-slash-menu.png'),fullPage:false});
const slash=await page.evaluate(()=>({
  type:document.querySelector('#composerAutocomplete').dataset.type,
  label:document.querySelector('#composerAutocomplete').getAttribute('aria-label'),
  items:[...document.querySelectorAll('#composerAutocomplete [data-autocomplete-id]')].map(node=>({id:node.dataset.autocompleteId,title:node.querySelector('.autocomplete-title')?.textContent?.trim(),description:node.querySelector('.autocomplete-description')?.textContent?.trim()})),
  above:document.querySelector('#composerAutocomplete').getBoundingClientRect().bottom<=document.querySelector('.composer').getBoundingClientRect().top+1,
  onscreen:document.querySelector('#composerAutocomplete').getBoundingClientRect().top>=46,
  topmost:(()=>{const rect=document.querySelector('#composerAutocomplete').getBoundingClientRect();return Boolean(document.elementFromPoint(rect.left+12,rect.top+12)?.closest('#composerAutocomplete'))})(),
}));
await page.locator('#prompt').fill('/pla');
const filtered=await page.locator('#composerAutocomplete [data-autocomplete-id]').allTextContents();
await page.keyboard.press('Enter');
const plan=await page.evaluate(()=>({
  active:globalThis.__codexWebuiDebug.state.planMode,
  placeholder:document.querySelector('#prompt').placeholder,
  value:document.querySelector('#prompt').value,
  menuHidden:document.querySelector('#composerAutocomplete').hidden,
  approval:document.querySelector('#modeButton .control-label').textContent.trim(),
}));

await page.locator('#prompt').fill('/model');
await page.keyboard.press('Enter');
const modelCommand=await page.evaluate(()=>({autocompleteHidden:document.querySelector('#composerAutocomplete').hidden,modelOpen:!document.querySelector('#modelMenu').hidden,modelTitle:document.querySelector('#modelMenu .model-menu-title')?.textContent?.trim()}));
await page.keyboard.press('Escape');

await page.locator('#prompt').fill('@');
const mentionEmpty=await page.evaluate(()=>({type:document.querySelector('#composerAutocomplete').dataset.type,text:document.querySelector('#composerAutocomplete').textContent.trim(),label:document.querySelector('#composerAutocomplete').getAttribute('aria-label')}));
await page.locator('#prompt').fill('@package');
await page.waitForFunction(()=>[...document.querySelectorAll('#composerAutocomplete [data-autocomplete-id]')].some(node=>node.dataset.autocompleteId==='file:package.json'));
await page.screenshot({path:artifact('composer-mention-menu.png'),fullPage:false});
const mentionResults=await page.evaluate(()=>{const menu=document.querySelector('#composerAutocomplete'),rect=menu.getBoundingClientRect();return{items:[...menu.querySelectorAll('[data-autocomplete-id]')].map(node=>({id:node.dataset.autocompleteId,title:node.querySelector('.autocomplete-title')?.textContent?.trim(),description:node.querySelector('.autocomplete-description')?.textContent?.trim()})),onscreen:rect.top>=46,topmost:Boolean(document.elementFromPoint(rect.left+12,rect.top+12)?.closest('#composerAutocomplete'))}});
await page.keyboard.press('Enter');
const mentionSelected=await page.evaluate(()=>({value:document.querySelector('#prompt').value,menuHidden:document.querySelector('#composerAutocomplete').hidden,trayHidden:document.querySelector('#composerContextTray').hidden,chips:[...document.querySelectorAll('#composerContextTray .composer-context-chip')].map(node=>node.textContent.trim())}));
await page.click('#newTask');
const reset=await page.evaluate(()=>({value:document.querySelector('#prompt').value,trayHidden:document.querySelector('#composerContextTray').hidden,chips:document.querySelectorAll('#composerContextTray .composer-context-chip').length}));
const mobile=await browser.newPage({viewport:{width:360,height:780},colorScheme:'dark'});
await mobile.goto(process.env.CODEX_WEBUI_TEST_URL||'http://127.0.0.1:8899',{waitUntil:'networkidle'});
await mobile.locator('#prompt').fill('/');
await mobile.waitForSelector('#composerAutocomplete:not([hidden])');
const mobileLayout=await mobile.evaluate(()=>{const menu=document.querySelector('#composerAutocomplete').getBoundingClientRect(),composer=document.querySelector('.composer').getBoundingClientRect();return{left:menu.left,right:menu.right,top:menu.top,bottom:menu.bottom,composerTop:composer.top,scrollWidth:document.documentElement.scrollWidth,innerWidth}});
await mobile.close();
console.log(JSON.stringify({slash,filtered,plan,modelCommand,mentionEmpty,mentionResults,mentionSelected,reset,mobileLayout,errors},null,2));
await browser.close();

const ids=slash.items.map(item=>item.id);
if(errors.length
  ||slash.type!=='slash'
  ||slash.label!=='Slash command menu'
  ||!slash.above||!slash.onscreen||!slash.topmost
  ||!['model','plan','project','reasoning','init','mcp'].every(id=>ids.includes(id))
  ||slash.items.some(item=>!item.title||!item.description)
  ||filtered.length!==1||!/Plan mode/i.test(filtered[0])
  ||!plan.active
  ||plan.placeholder!=='Describe your task to generate a plan...'
  ||plan.value!==''
  ||!plan.menuHidden
  ||plan.approval!=='Plan mode'
  ||!modelCommand.autocompleteHidden
  ||!modelCommand.modelOpen
  ||modelCommand.modelTitle!=='Reasoning'
  ||mentionEmpty.type!=='mention'
  ||mentionEmpty.label!=='Mention menu'
  ||!/Type to search for files/i.test(mentionEmpty.text)
  ||!mentionResults.onscreen||!mentionResults.topmost
  ||!mentionResults.items.some(item=>item.id==='file:package.json'&&item.title==='package.json')
  ||mentionSelected.value!=='@package.json '
  ||!mentionSelected.menuHidden
  ||mentionSelected.trayHidden
  ||!mentionSelected.chips.includes('package.json')
  ||reset.value!==''
  ||!reset.trayHidden
  ||reset.chips!==0
  ||mobileLayout.left<0||mobileLayout.right>mobileLayout.innerWidth
  ||mobileLayout.top<46||mobileLayout.bottom>mobileLayout.composerTop
  ||mobileLayout.scrollWidth>mobileLayout.innerWidth)process.exit(1);
