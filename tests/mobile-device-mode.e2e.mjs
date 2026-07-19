import { chromium, devices } from 'playwright';
import { artifact, launchOptions } from './browser-runtime.mjs';

const browser=await chromium.launch(launchOptions());
const context=await browser.newContext({
  ...devices['Pixel 7'],
  viewport:{width:980,height:1800},
  screen:{width:412,height:915},
  isMobile:true,
  hasTouch:true,
});
const page=await context.newPage();
await page.goto(process.env.CODEX_WEBUI_TEST_URL||'http://127.0.0.1:8899',{waitUntil:'networkidle'});
const before=await page.evaluate(()=>({
  innerWidth,
  coarse:matchMedia('(pointer: coarse)').matches,
  mobileClass:document.documentElement.classList.contains('mobile-device'),
  sidebarX:document.querySelector('#sidebar').getBoundingClientRect().x,
  sidebarPosition:getComputedStyle(document.querySelector('#sidebar')).position,
}));
await page.click('#toggleSidebar');
await page.waitForFunction(()=>Math.abs(document.querySelector('#sidebar').getBoundingClientRect().x)<.5);
const after=await page.evaluate(()=>{const sidebar=document.querySelector('#sidebar'),rect=sidebar.getBoundingClientRect();return{
  x:rect.x,
  right:rect.right,
  width:rect.width,
  mobileOpen:sidebar.classList.contains('mobile-open'),
  bodyHidden:document.body.classList.contains('sidebar-hidden'),
  position:getComputedStyle(sidebar).position,
  topElement:document.elementFromPoint(Math.min(rect.right-10,innerWidth-10),Math.min(rect.top+20,innerHeight-10))?.closest('#sidebar')===sidebar,
}});
await page.screenshot({path:artifact('mobile-device-sidebar.png'),fullPage:false});
console.log(JSON.stringify({before,after},null,2));
await browser.close();
if(!before.coarse||!before.mobileClass||before.sidebarPosition!=='fixed'||before.sidebarX>=0||!after.mobileOpen||after.bodyHidden||Math.abs(after.x)>.5||after.width>948||!after.topElement)process.exit(1);
