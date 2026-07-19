import { chromium } from 'playwright';
import { launchOptions } from './browser-runtime.mjs';

const browser=await chromium.launch(launchOptions());
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('404'))errors.push(message.text())});

await page.goto('http://127.0.0.1:8899',{waitUntil:'networkidle'});
await page.waitForFunction(()=>globalThis.__codexWebuiDebug);
await page.evaluate(()=>{
  const api=globalThis.__codexWebuiDebug;
  document.querySelector('#conversation').replaceChildren();
  api.notify('item/completed',{turnId:'optimistic-turn',item:{id:'local-native-user',type:'userMessage',content:[{type:'text',text:'Inspect the native conversation layout.'}]}});
  api.notify('item/completed',{turnId:'native-turn',item:{id:'native-user',type:'userMessage',content:[{type:'text',text:'Inspect the native conversation layout.'}]}});
  api.notify('item/completed',{turnId:'native-turn',item:{id:'native-commentary',type:'agentMessage',phase:'commentary',text:'I’ll inspect the source and verify the native timeline.'}});
  api.notify('item/started',{turnId:'native-turn',item:{id:'native-read',type:'commandExecution',status:'inProgress',command:'cat public/app.js'}});
  api.notify('item/completed',{turnId:'native-turn',item:{id:'native-read',type:'commandExecution',status:'completed',command:'cat public/app.js',aggregatedOutput:'source inspected'}});
  api.notify('item/completed',{turnId:'native-turn',item:{id:'native-edit',type:'fileChange',status:'completed',changes:[{path:'/tmp/example.ts',additions:2,deletions:1}]}});
  api.notify('item/completed',{turnId:'native-turn',item:{id:'native-failed',type:'commandExecution',status:'failed',command:'bun test',aggregatedOutput:'one test failed'}});
  api.notify('item/agentMessage/delta',{turnId:'native-turn',itemId:'native-agent',delta:'Implemented the native conversation timeline.'});
  api.notify('item/completed',{turnId:'native-turn',item:{id:'native-agent',type:'agentMessage',phase:'final_answer',text:'Implemented the native conversation timeline.\n\n- Tool activity is grouped.\n- The final response is plain Markdown.'}});
  api.notify('turn/completed',{turn:{id:'native-turn',durationMs:null,startedAt:100,completedAt:104,items:[
    {id:'native-user',type:'userMessage',content:[{type:'text',text:'Inspect the native conversation layout.'}]},
    {id:'native-commentary',type:'agentMessage',phase:'commentary',text:'I’ll inspect the source and verify the native timeline.'},
    {id:'native-read',type:'commandExecution',status:'completed',command:'cat public/app.js',aggregatedOutput:'source inspected'},
    {id:'native-edit',type:'fileChange',status:'completed',changes:[{path:'/tmp/example.ts',additions:2,deletions:1}]},
    {id:'native-failed',type:'commandExecution',status:'failed',command:'bun test',aggregatedOutput:'one test failed'},
    {id:'native-agent',type:'agentMessage',phase:'final_answer',text:'Implemented the native conversation timeline.\n\n- Tool activity is grouped.\n- The final response is plain Markdown.'},
  ]}});
});
await page.waitForSelector('[data-local-conversation-final-assistant]',{timeout:5000});

const markdownTypography=await page.evaluate(()=>{
  const fixture=document.createElement('div');
  fixture.className='message-text markdown-typography-fixture';
  fixture.innerHTML=globalThis.__renderAssistantMarkdown('# Heading one\n\nParagraph one.\n\n#### Heading four\n\n- First item\n- Second `code` item\n\n> Quote\n\n---\n\n```js\nconst ok = true;\n```\n\nTail paragraph.');
  document.body.append(fixture);
  const style=(selector)=>{const value=getComputedStyle(fixture.querySelector(selector));return {fontSize:value.fontSize,lineHeight:value.lineHeight,marginTop:value.marginTop,marginBottom:value.marginBottom,paddingLeft:value.paddingLeft,paddingTop:value.paddingTop,paddingBottom:value.paddingBottom,borderRadius:value.borderRadius}};
  const result={paragraph:style('p'),h1:style('h1'),h4:style('h4'),list:style('ul'),secondItem:style('li+li'),inlineCode:style('li code'),blockquote:style('blockquote'),hr:style('hr'),pre:style('pre')};
  fixture.remove();
  return result;
});

const result=await page.evaluate(()=>{
  const finals=[...document.querySelectorAll('[data-local-conversation-final-assistant]')];
  const final=finals[0];
  const commentary=document.querySelector('[data-local-conversation-commentary]');
  const message=final?.querySelector('.message-text');
  const style=message&&getComputedStyle(message);
  const user=document.querySelector('.user-message');
  const userStyle=user&&getComputedStyle(user);
  const activity=document.querySelector('[data-agent-activity-group]');
  const divider=document.querySelector('[data-worked-for-divider]');
  return {
    hasLegacyAssistantMark:!!document.querySelector('.assistant-mark'),
    hasLegacyAssistantHeader:!!document.querySelector('.assistant-header'),
    finalCount:finals.length,
    finalText:message?.textContent?.trim(),
    commentaryExists:!!commentary,
    commentaryText:commentary?.textContent?.trim(),
    commentaryBeforeActivity:!!commentary&&!!activity&&Boolean(commentary.compareDocumentPosition(activity)&Node.DOCUMENT_POSITION_FOLLOWING),
    fontSize:style?.fontSize,
    lineHeight:style?.lineHeight,
    fontFamily:style?.fontFamily,
    userFontSize:userStyle?.fontSize,
    userLineHeight:userStyle?.lineHeight,
    userFontFamily:userStyle?.fontFamily,
    userMessageCount:document.querySelectorAll('.user-message').length,
    activityExists:!!activity,
    activityRows:activity?.querySelectorAll('.activity-item').length,
    activitySummary:activity?.querySelector('.activity-summary-copy')?.textContent?.trim(),
    activityStatusExists:!!activity?.querySelector('.activity-status'),
    activityCollapsed:!activity?.querySelector('.activity-summary')?.classList.contains('open')&&getComputedStyle(activity?.querySelector('.activity-items')).display==='none',
    activityOutputCollapsed:getComputedStyle(activity?.querySelector('.activity-output')).display==='none',
    workedForText:divider?.querySelector('span')?.textContent?.trim(),
    workedForFlexDirection:divider&&getComputedStyle(divider).flexDirection,
    workedForLineCount:divider?.querySelectorAll(':scope > div').length,
    workedForChildren:divider?[...divider.children].map(node=>node.tagName.toLowerCase()):[],
    dividerBeforeFinal:!!divider&&!!final&&Boolean(divider.compareDocumentPosition(final)&Node.DOCUMENT_POSITION_FOLLOWING),
  };
});
await page.click('.activity-summary');
result.groupExpansion=await page.evaluate(()=>({
  itemsVisible:getComputedStyle(document.querySelector('.activity-items')).display!=='none',
  outputHidden:getComputedStyle(document.querySelector('.activity-output')).display==='none',
}));
await page.click('.activity-item');
result.rowExpansion=await page.evaluate(()=>({
  outputVisible:getComputedStyle(document.querySelector('.activity-output')).display!=='none',
}));
result.errors=errors;
result.markdownTypography=markdownTypography;

console.log(JSON.stringify(result,null,2));
if(result.hasLegacyAssistantMark)throw new Error('Native Codex final responses do not render an assistant avatar');
if(result.hasLegacyAssistantHeader)throw new Error('Native Codex final responses do not render a Codex/model header');
if(result.finalCount!==1)throw new Error(`Expected one final response, got ${result.finalCount}`);
if(!result.commentaryExists||result.commentaryText!=="I’ll inspect the source and verify the native timeline."||!result.commentaryBeforeActivity)throw new Error(`Commentary must remain before tool activity: ${JSON.stringify(result)}`);
const normalizedFinal=result.finalText?.replace(/\s+/g,' ').trim();
if(normalizedFinal!=='Implemented the native conversation timeline. Tool activity is grouped. The final response is plain Markdown.')throw new Error(`Unexpected final response text: ${result.finalText}`);
if((result.finalText?.match(/Implemented the native conversation timeline\./g)||[]).length!==1)throw new Error('Streaming completion replay duplicated the final response');
if(result.fontSize!=='13px'||result.lineHeight!=='21px')throw new Error(`Expected native 13px/21px typography, got ${result.fontSize}/${result.lineHeight}`);
if(result.userFontSize!=='13px'||result.userLineHeight!=='21px')throw new Error(`Expected native user 13px/21px typography, got ${result.userFontSize}/${result.userLineHeight}`);
if(!result.fontFamily?.includes('-apple-system')||result.fontFamily?.includes('Inter'))throw new Error(`Expected native system font stack, got ${result.fontFamily}`);
if(!result.userFontFamily?.includes('-apple-system')||result.userFontFamily?.includes('Inter'))throw new Error(`Expected native user system font stack, got ${result.userFontFamily}`);
if(result.userMessageCount!==1)throw new Error(`Optimistic and server user messages must reconcile to one bubble; got ${result.userMessageCount}`);
if(!result.activityExists)throw new Error('Tool activity must be rendered as an inline activity group');
if(result.activityRows!==3)throw new Error(`Started/completed items must update in place; got ${result.activityRows} rows`);
if(result.activitySummary!=='Edited a file, read files and ran a command')throw new Error(`Unexpected activity summary: ${result.activitySummary}`);
if(result.activityStatusExists)throw new Error('Native activity summaries do not render a redundant status label');
if(!result.activityCollapsed||!result.activityOutputCollapsed)throw new Error('Completed activity must be collapsed by default');
if(!result.groupExpansion?.itemsVisible||!result.groupExpansion?.outputHidden)throw new Error('Expanding a group must reveal rows without expanding command output');
if(!result.rowExpansion?.outputVisible)throw new Error('Expanding a command row must reveal its output');
if(result.workedForText!=='Worked for 4s'||!result.dividerBeforeFinal)throw new Error(`Unexpected worked-for divider: ${result.workedForText}`);
if(result.workedForFlexDirection!=='column'||result.workedForLineCount!==1||JSON.stringify(result.workedForChildren)!==JSON.stringify(['span','div']))throw new Error(`Worked-for unit must render label then one rule; got ${result.workedForFlexDirection}/${result.workedForLineCount}/${JSON.stringify(result.workedForChildren)}`);
const type=result.markdownTypography;
if(type.paragraph.marginTop!=='0px'||type.paragraph.marginBottom!=='11px')throw new Error(`Unexpected paragraph rhythm: ${JSON.stringify(type.paragraph)}`);
if(type.h1.fontSize!=='24px'||type.h1.lineHeight!=='30px'||type.h1.marginTop!=='0px'||type.h1.marginBottom!=='10px')throw new Error(`Unexpected H1 typography: ${JSON.stringify(type.h1)}`);
if(type.h4.fontSize!=='17px'||type.h4.lineHeight!=='22px'||type.h4.marginTop!=='20px'||type.h4.marginBottom!=='10px')throw new Error(`Unexpected H4 typography: ${JSON.stringify(type.h4)}`);
if(type.list.marginTop!=='0px'||type.list.marginBottom!=='0px'||type.list.paddingLeft!=='21px'||type.secondItem.marginTop!=='8px'||type.secondItem.paddingLeft!=='2px')throw new Error(`Unexpected list rhythm: ${JSON.stringify({list:type.list,item:type.secondItem})}`);
if(type.inlineCode.fontSize!=='11.96px'||type.inlineCode.paddingLeft!=='6px'||type.inlineCode.paddingTop!=='1px'||type.inlineCode.borderRadius!=='6px')throw new Error(`Unexpected inline code typography: ${JSON.stringify(type.inlineCode)}`);
if(type.blockquote.marginBottom!=='8px'||type.blockquote.paddingLeft!=='24px'||type.blockquote.paddingTop!=='8px'||type.blockquote.lineHeight!=='24px')throw new Error(`Unexpected blockquote rhythm: ${JSON.stringify(type.blockquote)}`);
if(type.hr.marginTop!=='28px'||type.hr.marginBottom!=='28px'||type.pre.marginTop!=='14px'||type.pre.marginBottom!=='14px')throw new Error(`Unexpected block spacing: ${JSON.stringify({hr:type.hr,pre:type.pre})}`);
if(result.errors.length)throw new Error(`Browser errors: ${result.errors.join('; ')}`);

const optimisticFailure=await page.evaluate(async()=>{
  const api=globalThis.__codexWebuiDebug;
  api.state.active={id:'optimistic-failure-thread',cwd:'/tmp',source:'local'};
  api.state.ws={send(raw){const request=JSON.parse(raw);queueMicrotask(()=>{const pending=api.state.pending.get(request.id);api.state.pending.delete(request.id);pending?.reject(new Error('forced turn start failure'))})}};
  const input=document.querySelector('#prompt');
  input.value='Retry this identical message';
  document.querySelector('#composer').requestSubmit();
  await new Promise(resolve=>setTimeout(resolve,20));
  return {
    optimisticCount:document.querySelectorAll('.user-turn[data-optimistic-user="true"]').length,
    matchingCount:[...document.querySelectorAll('.user-message')].filter(node=>node.textContent==='Retry this identical message').length,
  };
});
console.log(JSON.stringify({optimisticFailure},null,2));
if(optimisticFailure.optimisticCount!==0||optimisticFailure.matchingCount!==0)throw new Error(`Failed turn/start left an optimistic bubble: ${JSON.stringify(optimisticFailure)}`);

await browser.close();
