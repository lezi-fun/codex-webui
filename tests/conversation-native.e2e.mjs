import { chromium } from 'playwright';
import { launchOptions } from './browser-runtime.mjs';

const browser=await chromium.launch(launchOptions());
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('404'))errors.push(message.text())});

await page.goto(process.env.CODEX_WEBUI_TEST_URL||'http://127.0.0.1:8899',{waitUntil:'networkidle'});
await page.waitForFunction(()=>globalThis.__codexWebuiDebug);
await page.evaluate(()=>{
  const api=globalThis.__codexWebuiDebug;
  document.querySelector('#conversation').replaceChildren();
  api.notify('item/completed',{turnId:'optimistic-turn',item:{id:'local-native-user',type:'userMessage',content:[{type:'text',text:'Inspect the native conversation layout.'}]}});
  api.notify('item/completed',{turnId:'native-turn',item:{id:'native-user',type:'userMessage',content:[{type:'text',text:'Inspect the native conversation layout.'}]}});
  api.notify('item/completed',{turnId:'native-turn',item:{id:'native-commentary-1',type:'agentMessage',phase:'commentary',text:'I’ll inspect the source first.'}});
  api.notify('item/started',{turnId:'native-turn',item:{id:'native-read',type:'commandExecution',status:'inProgress',command:'cat public/app.js'}});
  api.notify('item/completed',{turnId:'native-turn',item:{id:'native-read',type:'commandExecution',status:'completed',command:'cat public/app.js',aggregatedOutput:'source inspected'}});
  api.notify('item/completed',{turnId:'native-turn',item:{id:'native-commentary-2',type:'agentMessage',phase:'commentary',text:'The renderer is clear; now I’ll update and verify it.'}});
  api.notify('item/completed',{turnId:'native-turn',item:{id:'native-edit',type:'fileChange',status:'completed',changes:[{path:'/tmp/example.ts',additions:2,deletions:1}]}});
  api.notify('item/completed',{turnId:'native-turn',item:{id:'native-failed',type:'commandExecution',status:'failed',command:'bun test',aggregatedOutput:'one test failed',exitCode:1}});
  api.notify('item/agentMessage/delta',{turnId:'native-turn',itemId:'native-agent',delta:'Implemented the native conversation timeline.'});
  api.notify('item/completed',{turnId:'native-turn',item:{id:'native-agent',type:'agentMessage',phase:'final_answer',content:[{type:'output_text',text:'Implemented the native conversation timeline.\n\n- Contiguous tool activity is grouped.\n- The final response is plain Markdown.\n\nUpdated [app.js](/tmp/example.ts:12-14) and [guide](https://example.com/guide).'}]}});
  api.notify('turn/completed',{turn:{id:'native-turn',durationMs:null,startedAt:100,completedAt:104,items:[
    {id:'native-user',type:'userMessage',content:[{type:'text',text:'Inspect the native conversation layout.'}]},
    {id:'native-commentary-1',type:'agentMessage',phase:'commentary',text:'I’ll inspect the source first.'},
    {id:'native-read',type:'commandExecution',status:'completed',command:'cat public/app.js',aggregatedOutput:'source inspected'},
    {id:'native-commentary-2',type:'agentMessage',phase:'commentary',text:'The renderer is clear; now I’ll update and verify it.'},
    {id:'native-edit',type:'fileChange',status:'completed',changes:[{path:'/tmp/example.ts',additions:2,deletions:1}]},
    {id:'native-failed',type:'commandExecution',status:'failed',command:'bun test',aggregatedOutput:'one test failed',exitCode:1},
    {id:'native-agent',type:'agentMessage',phase:'final_answer',content:[{type:'output_text',text:'Implemented the native conversation timeline.\n\n- Contiguous tool activity is grouped.\n- The final response is plain Markdown.\n\nUpdated [app.js](/tmp/example.ts:12-14) and [guide](https://example.com/guide).'}]},
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
  const commentaries=[...document.querySelectorAll('[data-local-conversation-commentary]')];
  const message=final?.querySelector('.message-text');
  const style=message&&getComputedStyle(message);
  const user=document.querySelector('.user-message');
  const userStyle=user&&getComputedStyle(user);
  const activities=[...document.querySelectorAll('[data-agent-activity-group]')];
  const activity=activities[1];
  const singleActivity=activities[0];
  const divider=document.querySelector('[data-worked-for-divider]');
  const stream=document.querySelector('.turn-event-stream');
  return {
    hasLegacyAssistantMark:!!document.querySelector('.assistant-mark'),
    hasLegacyAssistantHeader:!!document.querySelector('.assistant-header'),
    finalCount:finals.length,
    finalText:message?.textContent?.trim(),
    commentaryCount:commentaries.length,
    commentaryTexts:commentaries.map(node=>node.textContent?.trim()),
    timelineOrder:[...stream.children].map(node=>node.matches('[data-local-conversation-commentary]')?`message:${node.textContent.trim()}`:`tools:${[...node.querySelectorAll('.activity-item')].map(row=>row.dataset.itemId).join(',')}`),
    fontSize:style?.fontSize,
    lineHeight:style?.lineHeight,
    fontFamily:style?.fontFamily,
    userFontSize:userStyle?.fontSize,
    userLineHeight:userStyle?.lineHeight,
    userFontFamily:userStyle?.fontFamily,
    userMessageCount:document.querySelectorAll('.user-message').length,
    activityGroupCount:activities.length,
    activityRows:activities.map(group=>group.querySelectorAll('.activity-item').length),
    singleActivityDirect:singleActivity?.classList.contains('single')&&getComputedStyle(singleActivity.querySelector('.activity-summary')).display==='none'&&getComputedStyle(singleActivity.querySelector('.activity-items')).display!=='none',
    readRow:(()=>{const row=singleActivity?.querySelector('[data-item-id="native-read"]'),label=row?.querySelector('.activity-label'),detail=row?.querySelector('.activity-detail'),output=row?.nextElementSibling;return row?{text:row.querySelector('.activity-name')?.textContent?.trim(),role:row.getAttribute('role'),ariaExpanded:row.getAttribute('aria-expanded'),labelAndDetailInline:label?.parentElement===detail?.parentElement,outputText:output?.textContent,outputHidden:getComputedStyle(output).display==='none'}:null})(),
    completedToolIcon:(()=>{const icon=singleActivity?.querySelector('[data-item-id="native-read"] .activity-motion'),svg=icon?.querySelector('svg'),style=icon&&getComputedStyle(icon);return icon?{paths:icon.querySelectorAll('path').length,hasCheckPath:icon.innerHTML.includes('M20 6 9 17l-5-5'),width:style.width,height:style.height,svgWidth:svg?.getBoundingClientRect().width,svgHeight:svg?.getBoundingClientRect().height}:null})(),
    activitySummary:activity?.querySelector('.activity-summary-copy')?.textContent?.trim(),
    activitySummaryIcon:(()=>{const holder=activity?.querySelector('.activity-summary-icon'),svg=holder?.querySelector('svg'),style=holder&&getComputedStyle(holder),copy=activity?.querySelector('.activity-summary-copy');return holder?{exists:!!svg,paths:holder.querySelectorAll('path').length,width:style.width,height:style.height,beforeText:!!copy&&Boolean(holder.compareDocumentPosition(copy)&Node.DOCUMENT_POSITION_FOLLOWING)}:null})(),
    summaryChevronAfterText:(()=>{const copy=activity?.querySelector('.activity-summary-copy'),chevron=activity?.querySelector('.activity-chevron');return !!copy&&!!chevron&&Boolean(copy.compareDocumentPosition(chevron)&Node.DOCUMENT_POSITION_FOLLOWING)})(),
    activityStatusExists:!!activity?.querySelector('.activity-status'),
    activityCollapsed:!activity?.querySelector('.activity-summary')?.classList.contains('open')&&getComputedStyle(activity?.querySelector('.activity-items')).display==='none',
    activityOutputCollapsed:getComputedStyle(activity?.querySelector('.activity-output')).display==='none',
    workedForText:divider?.querySelector('span')?.textContent?.trim(),
    workedForFlexDirection:divider&&getComputedStyle(divider).flexDirection,
    workedForLineCount:divider?.querySelectorAll(':scope > div').length,
    workedForChildren:divider?[...divider.children].map(node=>node.tagName.toLowerCase()):[],
    dividerBeforeFinal:!!divider&&!!final&&Boolean(divider.compareDocumentPosition(final)&Node.DOCUMENT_POSITION_FOLLOWING),
    citation:(()=>{const link=message?.querySelector('.file-citation');return link?{text:link.textContent,href:link.getAttribute('href'),path:link.dataset.fileReference,lineStart:link.dataset.fileLineStart,lineEnd:link.dataset.fileLineEnd,title:link.title}:null})(),
    externalLink:(()=>{const link=[...message?.querySelectorAll('a')||[]].find(link=>link.href==='https://example.com/guide');return link?{target:link.target,rel:link.rel}:null})(),
  };
});
result.citationClick=await page.evaluate(()=>new Promise(resolve=>{
  addEventListener('codex-webui:file-reference',event=>resolve({detail:event.detail,hash:location.hash}),{once:true});
  document.querySelector('.file-citation').click();
}));
await page.click('.activity-group:not(.single) .activity-summary');
result.groupExpansion=await page.evaluate(()=>({
  itemsVisible:getComputedStyle(document.querySelector('.activity-group:not(.single) .activity-items')).display!=='none',
  outputHidden:getComputedStyle(document.querySelector('.activity-group:not(.single) .command-shell-wrap')).display==='none',
}));
await page.click('.command-activity');
result.commandExpansion=await page.evaluate(()=>{
  const row=document.querySelector('.command-activity');
  const shell=document.querySelector('.command-shell');
  const output=document.querySelector('.command-shell-output');
  return {
    expanded:row?.getAttribute('aria-expanded'),
    summary:row?.querySelector('.activity-name')?.textContent?.trim(),
    chevronGap:row?.querySelector('.activity-command-chevron')?.getBoundingClientRect().left-row?.querySelector('.activity-name')?.getBoundingClientRect().right,
    terminalIcon:!!row?.querySelector('.activity-command-icon svg'),
    prompt:shell?.querySelector('.command-shell-command>span')?.textContent,
    command:shell?.querySelector('.command-shell-command code')?.textContent,
    output:shell?.querySelector('.command-shell-output pre')?.textContent,
    footer:shell?.querySelector('.command-shell-footer')?.textContent?.trim(),
    borderRadius:shell&&getComputedStyle(shell).borderRadius,
    outputMaxHeight:output&&getComputedStyle(output).maxHeight,
  };
});
await page.screenshot({path:'/tmp/codex-webui-conversation-native.png',fullPage:false});
result.errors=errors;
result.markdownTypography=markdownTypography;

console.log(JSON.stringify(result,null,2));
if(result.hasLegacyAssistantMark)throw new Error('Native Codex final responses do not render an assistant avatar');
if(result.hasLegacyAssistantHeader)throw new Error('Native Codex final responses do not render a Codex/model header');
if(result.finalCount!==1)throw new Error(`Expected one final response, got ${result.finalCount}`);
if(result.commentaryCount!==2||JSON.stringify(result.commentaryTexts)!==JSON.stringify(["I’ll inspect the source first.","The renderer is clear; now I’ll update and verify it."]))throw new Error(`Expected two distinct commentary messages: ${JSON.stringify(result)}`);
if(JSON.stringify(result.timelineOrder)!==JSON.stringify(["message:I’ll inspect the source first.","tools:native-read","message:The renderer is clear; now I’ll update and verify it.","tools:native-edit,native-failed"]))throw new Error(`Messages and tools must retain chronological order: ${JSON.stringify(result.timelineOrder)}`);
const normalizedFinal=result.finalText?.replace(/\s+/g,' ').trim();
if(normalizedFinal!=='Implemented the native conversation timeline. Contiguous tool activity is grouped. The final response is plain Markdown. Updated app.js and guide.')throw new Error(`Unexpected final response text: ${result.finalText}`);
if((result.finalText?.match(/Implemented the native conversation timeline\./g)||[]).length!==1)throw new Error('Streaming completion replay duplicated the final response');
if(result.fontSize!=='13px'||result.lineHeight!=='21px')throw new Error(`Expected native 13px/21px typography, got ${result.fontSize}/${result.lineHeight}`);
if(result.userFontSize!=='13px'||result.userLineHeight!=='21px')throw new Error(`Expected native user 13px/21px typography, got ${result.userFontSize}/${result.userLineHeight}`);
if(!result.fontFamily?.includes('-apple-system')||result.fontFamily?.includes('Inter'))throw new Error(`Expected native system font stack, got ${result.fontFamily}`);
if(!result.userFontFamily?.includes('-apple-system')||result.userFontFamily?.includes('Inter'))throw new Error(`Expected native user system font stack, got ${result.userFontFamily}`);
if(result.userMessageCount!==1)throw new Error(`Optimistic and server user messages must reconcile to one bubble; got ${result.userMessageCount}`);
if(result.activityGroupCount!==2||JSON.stringify(result.activityRows)!==JSON.stringify([1,2]))throw new Error(`Only contiguous tools may share a group: ${JSON.stringify(result.activityRows)}`);
if(!result.singleActivityDirect)throw new Error('A standalone tool must render directly without a redundant summary row');
if(result.readRow?.text!=='Read public/app.js'||result.readRow.role!==null||result.readRow.ariaExpanded!==null||!result.readRow.labelAndDetailInline||result.readRow.outputText!==''||!result.readRow.outputHidden)throw new Error(`File reads must be a native single-line, non-expandable activity: ${JSON.stringify(result.readRow)}`);
if(result.completedToolIcon?.paths!==2||result.completedToolIcon?.hasCheckPath||result.completedToolIcon?.width!=='16px'||result.completedToolIcon?.height!=='16px'||result.completedToolIcon?.svgWidth!==16||result.completedToolIcon?.svgHeight!==16)throw new Error(`Completed file reads must use the native 16px file icon: ${JSON.stringify(result.completedToolIcon)}`);
if(result.activitySummary!=='Edited a file and ran a command')throw new Error(`Unexpected activity summary: ${result.activitySummary}`);
if(!result.activitySummaryIcon?.exists||result.activitySummaryIcon.paths!==4||result.activitySummaryIcon.width!=='16px'||result.activitySummaryIcon.height!=='16px'||!result.activitySummaryIcon.beforeText)throw new Error(`Grouped summaries must lead with the native 16px activity icon: ${JSON.stringify(result.activitySummaryIcon)}`);
if(!result.summaryChevronAfterText)throw new Error('The activity disclosure chevron must follow the summary text');
if(result.activityStatusExists)throw new Error('Native activity summaries do not render a redundant status label');
if(!result.activityCollapsed||!result.activityOutputCollapsed)throw new Error('Completed activity must be collapsed by default');
if(!result.groupExpansion?.itemsVisible||!result.groupExpansion?.outputHidden)throw new Error('Expanding a group must reveal rows without expanding command output');
if(result.commandExpansion?.expanded!=='true'||result.commandExpansion.summary!=='Ran command'||result.commandExpansion.chevronGap>8||!result.commandExpansion.terminalIcon||result.commandExpansion.prompt!=='$'||result.commandExpansion.command!=='bun test'||result.commandExpansion.output!=='one test failed'||result.commandExpansion.footer!=='Exit code 1'||result.commandExpansion.borderRadius!=='8px'||result.commandExpansion.outputMaxHeight!=='144px')throw new Error(`Command shell must match the native expandable terminal surface: ${JSON.stringify(result.commandExpansion)}`);
if(result.citation?.text!=='app.js'||result.citation.href!=='#file-reference'||result.citation.path!=='/tmp/example.ts'||result.citation.lineStart!=='12'||result.citation.lineEnd!=='14'||result.citation.title!=='Open /tmp/example.ts:12-14')throw new Error(`Unexpected file citation: ${JSON.stringify(result.citation)}`);
if(result.externalLink?.target!=='_blank'||!result.externalLink.rel.includes('noopener')||!result.externalLink.rel.includes('noreferrer'))throw new Error(`External links must retain safe target metadata: ${JSON.stringify(result.externalLink)}`);
if(result.citationClick?.hash!==''||JSON.stringify(result.citationClick.detail)!==JSON.stringify({path:'/tmp/example.ts',lineStart:12,lineEnd:14}))throw new Error(`File citation must preserve the conversation route and dispatch its reference: ${JSON.stringify(result.citationClick)}`);
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
await page.setViewportSize({width:390,height:844});
await page.evaluate(()=>document.querySelector('#sidebar')?.classList.remove('mobile-open'));
await page.waitForTimeout(250);
result.mobileCitation=await page.evaluate(()=>{const citation=document.querySelector('.file-citation')?.getBoundingClientRect(),timeline=document.querySelector('.native-turn-timeline')?.getBoundingClientRect();return{innerWidth,scrollWidth:document.documentElement.scrollWidth,citationRight:citation?.right||0,timelineLeft:timeline?.left||0,timelineRight:timeline?.right||0}});
if(result.mobileCitation.scrollWidth>result.mobileCitation.innerWidth||result.mobileCitation.citationRight>result.mobileCitation.innerWidth+.5||result.mobileCitation.timelineLeft<0||result.mobileCitation.timelineRight>result.mobileCitation.innerWidth+.5)throw new Error(`Conversation overflows the mobile viewport: ${JSON.stringify(result.mobileCitation)}`);
await page.screenshot({path:'/tmp/codex-webui-conversation-native-mobile.png',fullPage:false});
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
