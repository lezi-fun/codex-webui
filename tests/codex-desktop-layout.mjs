import { chromium } from 'playwright';
import { launchOptions } from './browser-runtime.mjs';

const browser=await chromium.launch(launchOptions());
const page=await browser.newPage({viewport:{width:1280,height:800}});
await page.goto('http://127.0.0.1:8899',{waitUntil:'networkidle'});
await page.waitForFunction(()=>globalThis.__codexWebuiDebug?.state?.config?.defaultCwd);
await page.waitForFunction(()=>document.querySelector('#accountName')?.textContent?.trim());
const box=async selector=>page.locator(selector).first().evaluate(element=>{
  const rect=element.getBoundingClientRect();
  const style=getComputedStyle(element);
  return {
    width:rect.width,
    height:rect.height,
    paddingLeft:parseFloat(style.paddingLeft),
    borderRadius:parseFloat(style.borderRadius),
  };
});
const result={
  title:await page.locator('#emptyState h1').textContent(),
  composer:await page.locator('#composer').count(),
  workspace:await page.locator('#workspaceButton').count(),
  hasAccountName:Boolean((await page.locator('#accountName').textContent())?.trim()),
  accountAvatar:await page.locator('#accountAvatar > img, #accountAvatar.account-initials').count(),
  accountButton:await box('#accountButton'),
  sidebar:await box('#sidebar'),
  newTask:await box('#newTask'),
  search:await box('.search-box'),
  firstThread:await box('.thread-item'),
  folderDialog:await page.locator('#folderDialog').count(),
  scrollWidth:await page.evaluate(()=>document.documentElement.scrollWidth),
  innerWidth:await page.evaluate(()=>innerWidth),
};
console.log(JSON.stringify(result,null,2));
await browser.close();
const valid=result.title?.includes('What do you want to build')
  &&result.composer===1
  &&result.workspace===1
  &&result.folderDialog===1
  &&result.hasAccountName
  &&result.accountAvatar===1
  &&result.sidebar.width===275
  &&result.newTask.height===30
  &&result.search.height===30
  &&result.firstThread.height===30
  &&result.accountButton.height===30
  &&result.newTask.paddingLeft===8
  &&result.firstThread.paddingLeft===8
  &&result.accountButton.paddingLeft===8
  &&result.newTask.borderRadius===10
  &&result.firstThread.borderRadius===10
  &&result.accountButton.borderRadius===10
  &&result.scrollWidth<=result.innerWidth;
if(!valid)process.exit(1);
