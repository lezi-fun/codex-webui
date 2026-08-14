import { createServer } from 'node:net';
import { chromium } from 'playwright';
import { artifact, launchOptions } from './browser-runtime.mjs';

const root=new URL('..',import.meta.url).pathname;
async function freePort(){return await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(0,'127.0.0.1',()=>{const address=probe.address();if(!address||typeof address==='string')return reject(new Error('Could not allocate composer test port'));probe.close(error=>error?reject(error):resolve(address.port))})})}
async function waitFor(check,timeout=20_000){const started=Date.now();while(Date.now()-started<timeout){try{if(await check())return}catch{}await Bun.sleep(50)}throw new Error('Timed out waiting for composer test server')}

const port=await freePort(),base=`http://127.0.0.1:${port}`;
const server=Bun.spawn(['bun','run','server.ts'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(port)},stdout:'ignore',stderr:'ignore'});
let browser;
try{
  await waitFor(async()=>(await fetch(`${base}/api/health`)).ok);
  browser=await chromium.launch(launchOptions());
  const context=await browser.newContext({viewport:{width:1018,height:760},colorScheme:'dark'});
  await context.addInitScript(()=>{if(window===window.top)localStorage.setItem('codex-webui-locale','en')});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>globalThis.__codexWebuiDebug?.syncTurnSnapshot);
  await page.evaluate(()=>{
    const api=globalThis.__codexWebuiDebug;
    api.state.active={id:'composer-thread',name:'Composer thread',cwd:api.state.config.defaultCwd,turns:[]};
    api.syncTurnSnapshot({id:'composer-turn',status:'inProgress',itemsView:'full',items:[]});
    api.notify('turn/started',{threadId:'other-thread',turn:{id:'other-turn'}});
    window.__composerRpcCalls=[];
    window.__composerOriginalFetch=window.fetch;
    window.__composerOriginalTransport=api.state.transport;
    api.state.transport='sse';
    window.fetch=async(resource,options={})=>{
      const url=new URL(typeof resource==='string'?resource:resource.url,location.href);
      if(url.pathname==='/api/rpc'){
        const payload=JSON.parse(options.body||'{}');
        window.__composerRpcCalls.push(payload);
        if(window.__composerConflictMode&&payload.method==='thread/resume')return new Response(JSON.stringify({type:'rpc/error',id:payload.id,error:'thread external-thread already has an active writer',code:'thread_active_writer'}),{status:200,headers:{'content-type':'application/json'}});
        return new Response(JSON.stringify({type:'rpc/result',result:{turnId:payload.params?.expectedTurnId||payload.params?.turnId||'ok'}}),{status:200,headers:{'content-type':'application/json'}});
      }
      return window.__composerOriginalFetch(resource,options);
    };
  });
  const stop=await page.evaluate(()=>({mode:document.querySelector('#sendButton')?.dataset.submitMode,title:document.querySelector('#sendButton')?.title,turnId:document.querySelector('#sendButton')?.dataset.turnId,stopped:document.querySelector('#sendButton')?.classList.contains('stop'),square:Boolean(document.querySelector('#sendButton rect[fill="currentColor"]'))}));
  await page.screenshot({path:artifact('composer-submit-stop.png'),fullPage:false});
  await page.locator('#prompt').fill('Change direction while this task is running.');
  const steer=await page.evaluate(()=>({mode:document.querySelector('#sendButton')?.dataset.submitMode,title:document.querySelector('#sendButton')?.title,stopped:document.querySelector('#sendButton')?.classList.contains('stop'),arrow:Boolean(document.querySelector('#sendButton path[d="M12 19V5"]'))}));
  await page.click('#sendButton');
  await page.waitForTimeout(100);
  const afterSteer=await page.evaluate(()=>({input:document.querySelector('#prompt')?.value,mode:document.querySelector('#sendButton')?.dataset.submitMode,call:window.__composerRpcCalls.find(call=>call.method==='turn/steer')}));
  await page.click('#sendButton');
  await page.waitForTimeout(100);
  const interrupt=await page.evaluate(()=>({mode:document.querySelector('#sendButton')?.dataset.submitMode,call:window.__composerRpcCalls.find(call=>call.method==='turn/interrupt')}));
  const send=await page.evaluate(()=>{const api=globalThis.__codexWebuiDebug;api.syncTurnSnapshot({id:'composer-turn',status:'completed',itemsView:'full',items:[]});const button=document.querySelector('#sendButton');return{mode:button?.dataset.submitMode,title:button?.title,stopped:button?.classList.contains('stop'),arrow:Boolean(button?.querySelector('path[d="M12 19V5"]'))}});
  await page.evaluate(()=>{const api=globalThis.__codexWebuiDebug;api.state.active={id:'external-thread',name:'External thread',cwd:api.state.config.defaultCwd,turns:[],canAcceptDirectInput:null};api.syncTurnSnapshot({id:'external-turn',status:'inProgress',itemsView:'full',items:[]});window.__composerConflictMode=true;window.__composerConflictCallStart=window.__composerRpcCalls.length});
  await page.locator('#prompt').fill('Keep this message when the CLI owns the task.');
  await page.click('#sendButton');
  await page.waitForFunction(()=>document.querySelector('#toast')?.classList.contains('show'));
  const conflict=await page.evaluate(()=>({input:document.querySelector('#prompt')?.value,toast:document.querySelector('#toast')?.textContent?.trim(),activeId:globalThis.__codexWebuiDebug.state.active?.id,calls:window.__composerRpcCalls.slice(window.__composerConflictCallStart).map(call=>call.method),mode:document.querySelector('#sendButton')?.dataset.submitMode}));
  const result={stop,steer,afterSteer,interrupt,send,conflict,errors};
  console.log(JSON.stringify(result,null,2));
  if(errors.length||stop.mode!=='stop'||stop.title!=='Stop'||stop.turnId!=='composer-turn'||!stop.stopped||!stop.square||steer.mode!=='steer'||steer.title!=='Steer'||steer.stopped||!steer.arrow||afterSteer.input!==''||afterSteer.mode!=='stop'||afterSteer.call?.params?.threadId!=='composer-thread'||afterSteer.call?.params?.expectedTurnId!=='composer-turn'||afterSteer.call?.params?.input?.[0]?.text!=='Change direction while this task is running.'||interrupt.mode!=='stop'||interrupt.call?.params?.threadId!=='composer-thread'||interrupt.call?.params?.turnId!=='composer-turn'||send.mode!=='send'||send.title!=='Send message'||send.stopped||!send.arrow||conflict.input!=='Keep this message when the CLI owns the task.'||conflict.toast!=='This task is currently running in another Codex app or CLI. Close it there, then try again.'||conflict.activeId!=='external-thread'||JSON.stringify(conflict.calls)!==JSON.stringify(['thread/resume'])||conflict.mode!=='steer')process.exitCode=1;
}finally{
  await browser?.close();
  server.kill();
  await server.exited;
}
