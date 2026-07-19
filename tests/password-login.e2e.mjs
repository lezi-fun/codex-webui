import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { chromium } from 'playwright';
import { artifact, launchOptions } from './browser-runtime.mjs';

const port=8913,password='correct horse battery staple';
const server=spawn('bun',['run','server.ts'],{
  cwd:new URL('..',import.meta.url).pathname,
  env:{...process.env,HOST:'0.0.0.0',PORT:String(port),CODEX_WEBUI_PASSWORD:password,CODEX_WEBUI_ACCESS_TOKEN:''},
  stdio:['ignore','pipe','pipe'],
});
server.stdout.resume();server.stderr.resume();
for(let i=0;i<60;i++){
  try{const response=await fetch(`http://127.0.0.1:${port}/api/auth/status`,{headers:{host:`192.168.2.10:${port}`}});if(response.ok)break}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
}
const baseLaunch=launchOptions();
const browser=await chromium.launch({...baseLaunch,args:[...(baseLaunch.args||[]),'--no-proxy-server']});
const context=await browser.newContext({viewport:{width:1018,height:820},colorScheme:'dark'});
const page=await context.newPage();
const lanAddress=Object.values(networkInterfaces()).flat().find(entry=>entry?.family==='IPv4'&&!entry.internal)?.address;
if(!lanAddress)throw new Error('No LAN IPv4 address available for password login test');
await page.goto(`http://${lanAddress}:${port}/`,{waitUntil:'domcontentloaded'});
await page.waitForSelector('#passwordGate:not([hidden])',{timeout:30_000});
const preAuth={
  health:await fetch(`http://${lanAddress}:${port}/api/health`).then(response=>response.status),
  bundle:await fetch(`http://${lanAddress}:${port}/app.bundle.js`).then(response=>response.status),
  appLoaded:await page.evaluate(()=>Boolean(globalThis.__codexWebuiDebug)),
};
await page.evaluate(()=>document.fonts.clear?.());
await page.screenshot({path:artifact('password-login.png'),fullPage:false,timeout:10_000});
const initial=await page.evaluate(()=>({
  gate:!document.querySelector('#passwordGate').hidden,
  app:document.querySelector('#app').getAttribute('aria-hidden'),
  mark:Boolean(document.querySelector('#passwordGate [data-codex-interface-mark]')),
  input:document.querySelector('#passwordInput').type,
  button:document.querySelector('#passwordLoginButton').textContent.trim(),
  body:document.body.textContent.includes('Authentication required'),
}));
await page.locator('#passwordInput').fill('wrong password');
await page.locator('#passwordLoginButton').click();
await page.waitForSelector('#passwordError:not([hidden])');
const wrong=await page.locator('#passwordError').textContent();
await page.locator('#passwordInput').fill(password);
await page.locator('#passwordLoginButton').click();
await page.waitForSelector('#passwordGate',{state:'hidden'});
const cookie=(await context.cookies()).find(item=>item.name==='codex_webui_session');
const health=await page.evaluate(()=>fetch('/api/health').then(response=>({status:response.status,json:response.json()})).then(async value=>({status:value.status,json:await value.json})));
const bundle=await fetch(`http://${lanAddress}:${port}/app.bundle.js`,{headers:{cookie:`codex_webui_session=${encodeURIComponent(cookie?.value||'')}`}}).then(response=>response.status);
console.log(JSON.stringify({preAuth,initial,wrong,cookie:{httpOnly:cookie?.httpOnly,sameSite:cookie?.sameSite,hasValue:Boolean(cookie?.value)},health,bundle},null,2));
await browser.close();
server.kill('SIGTERM');
await new Promise(resolve=>server.once('exit',resolve));
if(preAuth.health!==401||preAuth.bundle!==401||preAuth.appLoaded||!initial.gate||initial.app!=='true'||!initial.mark||initial.input!=='password'||initial.button!=='Log in'||initial.body||!wrong?.includes('Incorrect password')||!cookie?.httpOnly||cookie?.sameSite!=='Strict'||health.status!==200||health.json?.ok!==true||bundle!==200)process.exit(1);