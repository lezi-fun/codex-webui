import { chromium } from 'playwright';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchOptions } from './browser-runtime.mjs';

const base=process.env.CODEX_WEBUI_TEST_URL||'http://127.0.0.1:8899';
const browser=await chromium.launch(launchOptions());
const page=await browser.newPage({viewport:{width:1280,height:760},colorScheme:'dark'});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
async function waitForTerminalOutput(kind,expected){
  try{
    await page.waitForFunction(({kind,expected})=>{
      const term=globalThis.__codexTerminals?.[kind]?.term;
      return term&&[...Array(term.buffer.active.length)].some((_,index)=>term.buffer.active.getLine(index)?.translateToString(true).trim()===expected);
    },{kind,expected},{timeout:10_000});
  }catch(error){
    const output=await page.evaluate(kind=>{
      const term=globalThis.__codexTerminals?.[kind]?.term;
      return term?[...Array(term.buffer.active.length)].map((_,index)=>term.buffer.active.getLine(index)?.translateToString(true)||'').join('\n'):'<terminal unavailable>';
    },kind);
    throw new Error(`${kind} terminal did not render ${expected}. Current output:\n${output}`,{cause:error});
  }
}
await page.goto(base,{waitUntil:'networkidle'});
await page.waitForFunction(()=>globalThis.__codexWebuiDebug?.notify);
await page.click('#toggleSidePanel');
await page.click('[data-side-panel-action="terminal"]');
await page.waitForFunction(()=>document.querySelector('#sideTerminalHost')?.dataset.connected==='true'&&document.querySelector('#sideTerminalHost .xterm'));
await page.locator('#sideTerminalHost .xterm-helper-textarea').focus();
await page.keyboard.type("printf 'SIDE_TERMINAL_OK\\n'");
await page.keyboard.press('Enter');
await waitForTerminalOutput('side','SIDE_TERMINAL_OK');
const terminal=await page.evaluate(()=>({
  panelVisible:!document.querySelector('#sideTerminalPanel').hidden,
  hostVisible:!document.querySelector('#sideTerminalHost').hidden,
  connected:document.querySelector('#sideTerminalHost').dataset.connected,
  title:document.querySelector('#utilityTab').textContent.trim(),
  output:[...Array(globalThis.__codexTerminals.side.term.buffer.active.length)].map((_,index)=>globalThis.__codexTerminals.side.term.buffer.active.getLine(index)?.translateToString(true)||'').join('\n'),
  hasOutputLine:[...Array(globalThis.__codexTerminals.side.term.buffer.active.length)].some((_,index)=>globalThis.__codexTerminals.side.term.buffer.active.getLine(index)?.translateToString(true).trim()==='SIDE_TERMINAL_OK'),
}));

await page.click('#toggleBottomPanel');
await page.click('[data-bottom-panel-action="terminal"]');
await page.waitForFunction(()=>document.querySelector('#terminalHost')?.dataset.connected==='true'&&document.querySelector('#terminalHost .xterm'));
await page.locator('#terminalHost .xterm-helper-textarea').focus();
await page.keyboard.type("printf 'BOTTOM_TERMINAL_OK\\n'");
await page.keyboard.press('Enter');
await waitForTerminalOutput('bottom','BOTTOM_TERMINAL_OK');
const independentTerminals=await page.evaluate(()=>{
  const lines=term=>[...Array(term.buffer.active.length)].map((_,index)=>term.buffer.active.getLine(index)?.translateToString(true)||'');
  const side=lines(globalThis.__codexTerminals.side.term),bottom=lines(globalThis.__codexTerminals.bottom.term);
  return {
    side:side.join('\n'),
    bottom:bottom.join('\n'),
    sideHasSide:side.some(line=>line.trim()==='SIDE_TERMINAL_OK'),
    sideHasBottom:side.some(line=>line.trim()==='BOTTOM_TERMINAL_OK'),
    bottomHasBottom:bottom.some(line=>line.trim()==='BOTTOM_TERMINAL_OK'),
    bottomHasSide:bottom.some(line=>line.trim()==='SIDE_TERMINAL_OK'),
  };
});

await page.evaluate(()=>globalThis.__codexWebuiDebug.notify('item/started',{turnId:'side-task-turn',item:{id:'spawn-side-task',type:'collabAgentToolCall',tool:'spawnAgent',status:'inProgress',senderThreadId:'parent-thread',receiverThreadIds:['child-thread'],prompt:'Inspect the browser compatibility issue.',model:'gpt-5.6-terra',reasoningEffort:'medium',agentsStates:{'child-thread':{status:'running',message:'Checking redirects'}}}}));
await page.click('#openSidePanelTab');
await page.click('[data-side-panel-action="side-task"]');
await page.waitForFunction(()=>document.querySelector('#sideTaskList .side-task-card'));
const sideTask=await page.evaluate(()=>({
  panelVisible:!document.querySelector('#sideTaskPanel').hidden,
  title:document.querySelector('#utilityTab').textContent.trim(),
  taskTitle:document.querySelector('.side-task-card strong')?.textContent.trim(),
  taskBody:document.querySelector('.side-task-card small')?.textContent.trim(),
  taskStatus:document.querySelector('.side-task-status')?.textContent.trim(),
}));

await page.evaluate(()=>{
  const {state}=globalThis.__codexWebuiDebug,cwd=state.active?.cwd||state.config.defaultCwd;
  state.transport='ws';
  state.ws={readyState:WebSocket.OPEN,send(raw){
    const request=JSON.parse(raw);
    queueMicrotask(()=>{
      const pending=state.pending.get(request.id);
      if(!pending)return;
      state.pending.delete(request.id);
      if(request.method==='thread/read'&&request.params.threadId==='child-thread')pending.resolve({thread:{id:'child-thread',cwd,source:'local',turns:[{id:'child-turn',items:[{id:'child-agent',type:'agentMessage',phase:'final_answer',text:'Child task result'}]}]}});
      else pending.reject(new Error(`Unexpected RPC ${request.method}`));
    });
  }};
});
await page.click('.side-task-card');
await page.waitForFunction(()=>globalThis.__codexWebuiDebug.state.active?.id==='child-thread'&&document.querySelector('.assistant-response .message-text')?.textContent.includes('Child task result'));
const sideTaskNavigation=await page.evaluate(()=>({
  activeId:globalThis.__codexWebuiDebug.state.active?.id,
  storedId:localStorage.getItem('codex-webui-active-thread'),
  heading:document.querySelector('#threadTitle')?.textContent.trim(),
  response:document.querySelector('.assistant-response .message-text')?.textContent.trim(),
}));
await page.screenshot({path:join(tmpdir(),'codex-webui-side-task-open.png'),fullPage:false});

await page.evaluate(()=>globalThis.__codexWebuiDebug.notify('item/started',{turnId:'missing-side-task-turn',item:{id:'missing-side-task',type:'collabAgentToolCall',tool:'spawnAgent',status:'inProgress',receiverThreadIds:['missing-child-thread'],prompt:'Unavailable child task',model:'gpt-5.6-terra',agentsStates:{'missing-child-thread':{status:'running'}}}}));
await page.click('#openSidePanelTab');
await page.click('[data-side-panel-action="side-task"]');
await page.click('.side-task-card[data-thread-id="missing-child-thread"]');
await page.waitForFunction(()=>document.querySelector('#toast')?.classList.contains('show'));
const failedSideTaskNavigation=await page.evaluate(()=>({
  activeId:globalThis.__codexWebuiDebug.state.active?.id,
  storedId:localStorage.getItem('codex-webui-active-thread'),
  heading:document.querySelector('#threadTitle')?.textContent.trim(),
  toast:document.querySelector('#toast')?.textContent.trim(),
  disabled:document.querySelector('.side-task-card[data-thread-id="missing-child-thread"]')?.disabled,
  busy:document.querySelector('.side-task-card[data-thread-id="missing-child-thread"]')?.getAttribute('aria-busy'),
}));

await page.click('#openSidePanelTab');
await page.click('[data-side-panel-action="terminal"]');
const restoredTerminal=await page.evaluate(()=>({
  panelVisible:!document.querySelector('#sideTerminalPanel').hidden,
  output:[...Array(globalThis.__codexTerminals.side.term.buffer.active.length)].map((_,index)=>globalThis.__codexTerminals.side.term.buffer.active.getLine(index)?.translateToString(true)||'').join('\n'),
  hasOutputLine:[...Array(globalThis.__codexTerminals.side.term.buffer.active.length)].some((_,index)=>globalThis.__codexTerminals.side.term.buffer.active.getLine(index)?.translateToString(true).trim()==='SIDE_TERMINAL_OK'),
}));

console.log(JSON.stringify({terminal,independentTerminals,sideTask,sideTaskNavigation,failedSideTaskNavigation,restoredTerminal,errors},null,2));
await browser.close();
if(errors.length||!terminal.panelVisible||!terminal.hostVisible||terminal.connected!=='true'||terminal.title!=='Terminal'||!terminal.hasOutputLine)process.exit(1);
if(!independentTerminals.sideHasSide||independentTerminals.sideHasBottom||!independentTerminals.bottomHasBottom||independentTerminals.bottomHasSide)process.exit(1);
if(!sideTask.panelVisible||sideTask.title!=='Side tasks'||sideTask.taskTitle!=='gpt-5.6-terra'||sideTask.taskBody!=='Checking redirects'||sideTask.taskStatus!=='running')process.exit(1);
if(sideTaskNavigation.activeId!=='child-thread'||sideTaskNavigation.storedId!=='child-thread'||sideTaskNavigation.heading!=='gpt-5.6-terra'||sideTaskNavigation.response!=='Child task result')process.exit(1);
if(failedSideTaskNavigation.activeId!=='child-thread'||failedSideTaskNavigation.storedId!=='child-thread'||failedSideTaskNavigation.heading!=='gpt-5.6-terra'||!failedSideTaskNavigation.toast.includes('Unexpected RPC thread/read')||failedSideTaskNavigation.disabled||failedSideTaskNavigation.busy!==null)process.exit(1);
if(!restoredTerminal.panelVisible||!restoredTerminal.hasOutputLine)process.exit(1);
