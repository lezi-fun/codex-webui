import { chromium } from 'playwright';
import { launchOptions } from './browser-runtime.mjs';

const browser=await chromium.launch(launchOptions());
const page=await browser.newPage({viewport:{width:1280,height:800}});
await page.goto('http://127.0.0.1:8899',{waitUntil:'networkidle'});
await page.waitForFunction(()=>globalThis.__codexWebuiDebug?.state?.config?.defaultCwd);
const result={
  title:await page.locator('#emptyState h1').textContent(),
  composer:await page.locator('#composer').count(),
  workspace:await page.locator('#workspaceButton').count(),
  local:await page.locator('#threadSource').textContent(),
  folderDialog:await page.locator('#folderDialog').count(),
  scrollWidth:await page.evaluate(()=>document.documentElement.scrollWidth),
  innerWidth:await page.evaluate(()=>innerWidth),
};
console.log(JSON.stringify(result,null,2));
await browser.close();
if(!result.title?.includes('What do you want to build')||result.composer!==1||result.workspace!==1||result.local!=='local'||result.folderDialog!==1||result.scrollWidth>result.innerWidth)process.exit(1);
