import { spawn } from 'node:child_process';
import { readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { launchOptions, root } from './browser-runtime.mjs';

const sourcePath=resolve(root,'public/app.js');
const bundlePath=resolve(root,'public/app.bundle.js');
const sourceTimes=statSync(sourcePath);
const sourceContent=readFileSync(sourcePath,'utf8');
const port=await new Promise((resolvePort,reject)=>{
  const probe=createServer();
  probe.once('error',reject);
  probe.listen(0,'127.0.0.1',()=>{
    const address=probe.address();
    if(!address||typeof address==='string')return reject(new Error('Could not allocate dev watch test port'));
    probe.close(error=>error?reject(error):resolvePort(address.port));
  });
});

let output='';
let browser;
const dev=spawn('bun',['run','dev'],{
  cwd:root,
  env:{...process.env,HOST:'127.0.0.1',PORT:String(port),CODEX_WEBUI_PASSWORD:'',CODEX_WEBUI_ACCESS_TOKEN:''},
  stdio:['ignore','pipe','pipe'],
});
for(const stream of [dev.stdout,dev.stderr])stream.on('data',chunk=>{output=(output+chunk).slice(-20_000)});

const waitFor=async(check,label,timeout=30_000)=>{
  const started=Date.now();
  while(Date.now()-started<timeout){
    if(dev.exitCode!==null)throw new Error(`Development process exited early (${dev.exitCode}):\n${output}`);
    try{if(await check())return}catch{}
    await new Promise(resolveWait=>setTimeout(resolveWait,100));
  }
  throw new Error(`Timed out waiting for ${label}:\n${output}`);
};

try{
  await waitFor(async()=>((await fetch(`http://127.0.0.1:${port}/api/health`)).status===200),'development server');
  browser=await chromium.launch(launchOptions());
  const page=await browser.newPage({viewport:{width:1280,height:800},colorScheme:'dark'});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('404'))errors.push(message.text())});
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(globalThis.__codexWebuiDebug));
  await new Promise(resolveWait=>setTimeout(resolveWait,500));
  const before=statSync(bundlePath).mtimeMs;
  writeFileSync(sourcePath,`${sourceContent}\n/* codex-webui dev watch test */\n`);
  await waitFor(()=>statSync(bundlePath).mtimeMs>before,'frontend bundle rebuild',15_000);
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(globalThis.__codexWebuiDebug));
  const health=await fetch(`http://127.0.0.1:${port}/api/health`).then(response=>response.json());
  const bundle=await fetch(`http://127.0.0.1:${port}/app.bundle.js`);
  const rendered=await page.evaluate(()=>({title:document.title,newTask:document.querySelector('#newTask')?.textContent?.trim(),appLoaded:Boolean(globalThis.__codexWebuiDebug),overlay:Boolean(document.querySelector('[data-nextjs-dialog-overlay],vite-error-overlay,webpack-dev-server-client-overlay'))}));
  await page.screenshot({path:'/tmp/codex-webui-dev-watch.png',fullPage:false});
  const result={bundleRebuilt:statSync(bundlePath).mtimeMs>before,health,bundleStatus:bundle.status,bundleBytes:Number(bundle.headers.get('content-length')||0),rendered,errors};
  console.log(JSON.stringify(result,null,2));
  if(!result.bundleRebuilt||health.ok!==true||bundle.status!==200||result.bundleBytes<100_000||rendered.title!=='Codex WebUI'||!rendered.newTask?.includes('New task')||!rendered.appLoaded||rendered.overlay||errors.length)process.exitCode=1;
}finally{
  await browser?.close().catch(()=>{});
  dev.kill('SIGTERM');
  await new Promise(resolveExit=>dev.exitCode!==null?resolveExit():dev.once('exit',resolveExit));
  writeFileSync(sourcePath,sourceContent);
  utimesSync(sourcePath,sourceTimes.atime,sourceTimes.mtime);
}
