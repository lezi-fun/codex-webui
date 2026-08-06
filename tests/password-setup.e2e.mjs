import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { artifact, launchOptions, root } from './browser-runtime.mjs';

const password='correct horse battery staple';
const tempRoot=mkdtempSync(join(tmpdir(),'codex-webui-password-setup-'));
const storePath=join(tempRoot,'auth.json');
const lanAddress=Object.values(networkInterfaces()).flat().find(entry=>entry?.family==='IPv4'&&!entry.internal)?.address;
if(!lanAddress)throw new Error('No LAN IPv4 address available for password setup test');

const port=await new Promise((resolve,reject)=>{
  const probe=createNetServer();
  probe.once('error',reject);
  probe.listen(0,'127.0.0.1',()=>{
    const address=probe.address();
    if(!address||typeof address==='string')return reject(new Error('Could not allocate password setup test port'));
    probe.close(error=>error?reject(error):resolve(address.port));
  });
});
const baseUrl=`http://${lanAddress}:${port}`;
const serverEnv={...process.env,HOST:'0.0.0.0',PORT:String(port),CODEX_WEBUI_PASSWORD:'',CODEX_WEBUI_ACCESS_TOKEN:'',CODEX_WEBUI_AUTH_STORE:storePath};

const startServer=async()=>{
  const child=spawn('bun',['run','server.ts'],{cwd:root,env:serverEnv,stdio:['ignore','pipe','pipe']});
  child.stdout.resume();child.stderr.resume();
  const started=Date.now();
  while(Date.now()-started<30_000){
    if(child.exitCode!==null)throw new Error(`Password setup server exited with code ${child.exitCode}`);
    try{if((await fetch(`http://127.0.0.1:${port}/api/auth/status`)).ok)return child}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  child.kill('SIGTERM');
  throw new Error('Timed out waiting for password setup server');
};
const stopServer=async child=>{
  if(!child||child.exitCode!==null)return;
  child.kill('SIGTERM');
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Timed out stopping password setup server')),10_000);
    child.once('exit',()=>{clearTimeout(timer);resolve()});
  });
};

let server,browser;
try{
  server=await startServer();
  const baseLaunch=launchOptions();
  browser=await chromium.launch({...baseLaunch,args:[...(baseLaunch.args||[]),'--no-proxy-server']});
  const context=await browser.newContext({viewport:{width:1018,height:820},colorScheme:'dark'});
  const page=await context.newPage();
  await page.goto(`${baseUrl}/`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#passwordGate:not([hidden])',{timeout:30_000});

  const preAuth={
    health:await fetch(`${baseUrl}/api/health`).then(response=>response.status),
    events:await fetch(`${baseUrl}/api/events`).then(response=>response.status),
    bundle:await fetch(`${baseUrl}/app.bundle.js`).then(response=>response.status),
    status:await fetch(`${baseUrl}/api/auth/status`).then(response=>response.json()),
  };
  const initial=await page.evaluate(()=>({
    title:document.querySelector('#passwordTitle').textContent.trim(),
    placeholder:document.querySelector('#passwordInput').placeholder,
    confirmHidden:document.querySelector('#passwordConfirmInput').hidden,
    button:document.querySelector('#passwordLoginButton').textContent.trim(),
    appHidden:document.querySelector('#app').getAttribute('aria-hidden'),
    appLoaded:Boolean(globalThis.__codexWebuiDebug),
  }));

  await page.setViewportSize({width:390,height:844});
  const mobileLayout=await page.evaluate(()=>{
    const form=document.querySelector('#passwordLoginForm').getBoundingClientRect();
    return {fits:form.left>=0&&form.right<=innerWidth,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
  });
  await page.screenshot({path:artifact('password-setup-mobile.png'),fullPage:false,timeout:10_000});
  await page.setViewportSize({width:1018,height:820});
  await page.screenshot({path:artifact('password-setup.png'),fullPage:false,timeout:10_000});

  await page.locator('#passwordInput').fill(password);
  await page.locator('#passwordConfirmInput').fill('correct horse battery wrong');
  await page.locator('#passwordLoginButton').click();
  await page.waitForSelector('#passwordError:not([hidden])');
  const mismatch=await page.locator('#passwordError').textContent();
  await page.locator('#passwordConfirmInput').fill(password);
  await page.locator('#passwordLoginButton').click();
  await page.waitForSelector('#passwordGate',{state:'hidden'});
  await page.waitForFunction(()=>Boolean(globalThis.__codexWebuiDebug),null,{timeout:30_000});
  const cookie=(await context.cookies()).find(item=>item.name==='codex_webui_session');
  const stored=readFileSync(storePath,'utf8');
  const afterSetup=await page.evaluate(()=>fetch('/api/auth/status',{cache:'no-store'}).then(response=>response.json()));
  const health=await page.evaluate(()=>fetch('/api/health').then(response=>response.status));

  await stopServer(server);server=null;
  server=await startServer();
  const restartStatus=await fetch(`${baseUrl}/api/auth/status`).then(response=>response.json());
  const loginContext=await browser.newContext({viewport:{width:1018,height:820},colorScheme:'dark'});
  const loginPage=await loginContext.newPage();
  await loginPage.goto(`${baseUrl}/`,{waitUntil:'domcontentloaded'});
  await loginPage.waitForSelector('#passwordGate:not([hidden])',{timeout:30_000});
  const restarted=await loginPage.evaluate(()=>({
    title:document.querySelector('#passwordTitle').textContent.trim(),
    placeholder:document.querySelector('#passwordInput').placeholder,
    confirmHidden:document.querySelector('#passwordConfirmInput').hidden,
    button:document.querySelector('#passwordLoginButton').textContent.trim(),
  }));
  await loginPage.locator('#passwordInput').fill('wrong password');
  await loginPage.locator('#passwordLoginButton').click();
  await loginPage.waitForSelector('#passwordError:not([hidden])');
  const wrong=await loginPage.locator('#passwordError').textContent();
  await loginPage.locator('#passwordInput').fill(password);
  await loginPage.locator('#passwordLoginButton').click();
  await loginPage.waitForSelector('#passwordGate',{state:'hidden'});
  await loginPage.waitForFunction(()=>Boolean(globalThis.__codexWebuiDebug),null,{timeout:30_000});
  await loginPage.screenshot({path:artifact('password-login-after-setup.png'),fullPage:false,timeout:10_000});

  const result={preAuth,initial,mobileLayout,mismatch,cookie:{httpOnly:cookie?.httpOnly,sameSite:cookie?.sameSite},storedWithoutPlaintext:!stored.includes(password),afterSetup,health,restartStatus,restarted,wrong};
  console.log(JSON.stringify(result,null,2));
  if(preAuth.health!==401||preAuth.events!==401||preAuth.bundle!==401||preAuth.status.setupRequired!==true||preAuth.status.passwordRequired!==false||initial.title!=='Set a LAN password'||initial.placeholder!=='New password'||initial.confirmHidden||initial.button!=='Set password'||initial.appHidden!=='true'||initial.appLoaded||!mobileLayout.fits||mobileLayout.scrollWidth>mobileLayout.viewport||!mismatch?.includes('do not match')||!cookie?.httpOnly||cookie?.sameSite!=='Strict'||stored.includes(password)||afterSetup.setupRequired||!afterSetup.passwordRequired||!afterSetup.authenticated||health!==200||restartStatus.setupRequired||!restartStatus.passwordRequired||restartStatus.authenticated||restarted.title!=='Log in'||restarted.placeholder!=='Password'||!restarted.confirmHidden||restarted.button!=='Log in'||!wrong?.includes('Incorrect password'))process.exitCode=1;
}finally{
  await browser?.close().catch(()=>{});
  await stopServer(server).catch(()=>{});
  rmSync(tempRoot,{recursive:true,force:true});
}
