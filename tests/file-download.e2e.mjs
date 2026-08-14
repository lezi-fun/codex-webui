import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { launchOptions } from './browser-runtime.mjs';

const root=resolve(import.meta.dirname,'..');
const freePort=()=>new Promise((resolvePort,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(0,'127.0.0.1',()=>{const address=probe.address();if(!address||typeof address==='string')return reject(new Error('Could not allocate file download test port'));probe.close(error=>error?reject(error):resolvePort(address.port))})});
const port=await freePort();
const base=`http://127.0.0.1:${port}`;
const fixtureRoot=mkdtempSync(join(tmpdir(),'codex-webui-download-'));
const fixture=join(fixtureRoot,"agent's result.txt");
const body='downloaded from the Codex conversation\n';
writeFileSync(fixture,body);
const server=Bun.spawn(['bun','run','server.ts'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(port)},stdout:'ignore',stderr:'ignore'});
let browser;

try{
  for(let attempt=0;attempt<80;attempt++){
    try{if((await fetch(`${base}/api/health`)).ok)break}catch{}
    if(attempt===79)throw new Error('File download test server did not become ready');
    await Bun.sleep(100);
  }

  const direct=await fetch(`${base}/api/files/download?path=${encodeURIComponent(fixture)}&cwd=${encodeURIComponent(fixtureRoot)}`);
  if(!direct.ok||await direct.text()!==body)throw new Error('Authenticated file endpoint did not stream the fixture');
  if(!direct.headers.get('content-disposition')?.includes("filename*=UTF-8''agent%27s%20result.txt"))throw new Error(`Unexpected content disposition: ${direct.headers.get('content-disposition')}`);
  if(direct.headers.get('cache-control')!=='no-store'||direct.headers.get('x-content-type-options')!=='nosniff')throw new Error('File endpoint security headers are incomplete');
  const denied=await fetch(`${base}/api/files/download?path=${encodeURIComponent('/etc/hosts')}`);
  if(denied.status!==404)throw new Error(`Outside files must be rejected, got ${denied.status}`);

  browser=await chromium.launch(launchOptions());
  const page=await browser.newPage({acceptDownloads:true,viewport:{width:1000,height:720}});
  await page.goto(base,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>globalThis.__codexWebuiDebug);
  await page.evaluate(({fixture})=>{
    const api=globalThis.__codexWebuiDebug;
    api.state.active={id:'download-thread',cwd:'/tmp',source:'local'};
    document.querySelector('#conversation').replaceChildren();
    api.notify('item/completed',{turnId:'download-turn',item:{id:'download-answer',type:'agentMessage',phase:'final_answer',text:`The result is ready. :codex-file-citation{path="${fixture}" purpose="output" artifact_kind="workbook"}`}});
  },{fixture});
  const link=page.locator('[data-local-conversation-final-assistant] a[data-file-download]');
  await link.waitFor();
  const attributes=await link.evaluate(node=>({href:node.getAttribute('href'),download:node.getAttribute('download'),path:node.dataset.fileDownload}));
  if(!attributes.href?.startsWith('/api/files/download?')||attributes.download!=="agent's result.txt"||attributes.path!==fixture)throw new Error(`Unexpected download link: ${JSON.stringify(attributes)}`);
  const downloadPromise=page.waitForEvent('download');
  await link.click();
  const download=await downloadPromise;
  const downloadedPath=await download.path();
  if(download.suggestedFilename()!=="agent's result.txt"||!downloadedPath||readFileSync(downloadedPath,'utf8')!==body)throw new Error(`Browser download was incorrect: ${download.suggestedFilename()}`);
  console.log(JSON.stringify({endpoint:'ok',attributes,suggestedFilename:download.suggestedFilename(),content:'ok'},null,2));
}finally{
  await browser?.close();
  server.kill();
  await server.exited;
  rmSync(fixtureRoot,{recursive:true,force:true});
}
