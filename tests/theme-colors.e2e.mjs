import { chromium } from 'playwright';
import { launchOptions } from './browser-runtime.mjs';

function rgb(value){
  const match=value.match(/rgba?\((?:\s*)?(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/);
  if(!match)throw new Error(`Unsupported color: ${value}`);
  return match.slice(1,4).map(Number);
}
function luminance(value){
  return rgb(value).map(channel=>channel/255).map(channel=>channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4).reduce((sum,channel,index)=>sum+channel*[.2126,.7152,.0722][index],0);
}
function contrast(a,b){const l1=luminance(a),l2=luminance(b);return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05)}
function overlap(a,b){return Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top))}

const browser=await chromium.launch(launchOptions());
const results=[];
for(const scheme of ['light','dark']){
  const page=await browser.newPage({viewport:{width:1440,height:900},colorScheme:scheme});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.CODEX_WEBUI_TEST_URL||'http://127.0.0.1:8899',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>globalThis.__codexWebuiDebug);
  await page.evaluate(async()=>{
    const api=globalThis.__codexWebuiDebug;
    api.state.active={id:'theme-thread',cwd:'/tmp/theme-demo',source:'local'};
    document.querySelector('#conversation').innerHTML='<article class="turn user-turn"><div class="user-message">Review the complete command before approval.</div></article>';
    api.notify('item/completed',{turnId:'theme-turn',item:{id:'theme-agent',type:'agentMessage',text:'Use `bun test` and read the [verification guide](https://example.com).\n\n```ts\nconst theme = "system";\n```\n\n| Surface | State |\n| --- | --- |\n| Panel | Ready |'}});
    api.notify('item/started',{turnId:'theme-turn',item:{id:'theme-command',type:'commandExecution',status:'inProgress',command:'bun test tests/theme-colors.e2e.mjs --reporter=verbose',aggregatedOutput:'Theme command output'}});
    api.notify('turn/diff/updated',{turnId:'theme-turn',threadId:'theme-thread',diff:'diff --git a/src/theme.ts b/src/theme.ts\n--- a/src/theme.ts\n+++ b/src/theme.ts\n@@ -1,2 +1,3 @@\n export const mode = "system";\n-oldSurface();\n+newSurface();\n+export { newSurface };\n'});
    await api.request({id:'theme-approval',method:'item/commandExecution/requestApproval',params:{threadId:'theme-thread',turnId:'theme-turn',itemId:'theme-command',command:'bun test tests/theme-colors.e2e.mjs --reporter=verbose',cwd:'/tmp/theme-demo',reason:'Verify the complete App color contract.',proposedExecpolicyAmendment:['bun','test']}});
    document.querySelector('#toast').textContent='Theme verification complete';
    document.querySelector('#toast').classList.add('show');
    const older=document.createElement('button');older.className='load-older';older.textContent='Load earlier messages';document.querySelector('#conversation').prepend(older);
  });
  await page.click('#toggleSidePanel');
  await page.click('[data-side-panel-action="review"]');
  await page.click('.approval-menu-toggle');
  await page.click('.activity-item');
  await page.hover('.activity-item');
  await page.hover('.approval-deny');
  const result=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d',{willReadFrequently:true});
    const flatten=(value,backdrop)=>{context.clearRect(0,0,1,1);context.fillStyle=backdrop;context.fillRect(0,0,1,1);context.fillStyle=value;context.fillRect(0,0,1,1);const [r,g,b]=context.getImageData(0,0,1,1).data;return `rgb(${r}, ${g}, ${b})`};
    const bodyBackground=getComputedStyle(document.body).backgroundColor;
    const style=selector=>{const node=document.querySelector(selector),computed=getComputedStyle(node),background=flatten(computed.backgroundColor,bodyBackground);return {background,color:flatten(computed.color,background),border:flatten(computed.borderColor,background),shadow:computed.boxShadow,rect:node.getBoundingClientRect().toJSON()}};
    return {
      scheme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light',
      bubble:style('.user-message'),
      composer:style('.composer'),
      textarea:style('.composer textarea'),
      utility:style('.utility-button'),
      inlineCode:style('.message-text code'),
      codeBlock:style('.message-text pre'),
      codeBlockText:style('.message-text pre code'),
      tableHead:style('.message-text th'),
      link:style('.message-text a'),
      plus:style('#reviewStats .plus'),
      minus:style('#reviewStats .minus'),
      toast:style('#toast'),
      activityHover:style('.activity-item'),
      activityOutput:style('.activity-output'),
      loadOlder:style('.load-older'),
      approval:style('.approval-card'),
      approvalDenyHover:style('.approval-deny'),
      command:style('.approval-command code'),
      approvalMenu:style('.approval-menu'),
      approvalMenuItem:style('.approval-menu button'),
      reviewHead:style('.review-file-head'),
      reviewName:style('.review-file-name'),
      reviewChevron:style('.review-chevron svg'),
      reviewFilePlus:style('.review-file-stats .plus'),
      reviewFileMinus:style('.review-file-stats .minus'),
      hunk:style('.review-hunk'),
      hunkHead:style('.review-hunk-head'),
      contextLine:style('.review-line.context'),
      addLine:style('.review-line.add'),
      deleteLine:style('.review-line.delete'),
    };
  });
  result.errors=errors;
  result.contrast={
    bubble:contrast(result.bubble.color,result.bubble.background),
    textarea:contrast(result.textarea.color,result.composer.background),
    utility:contrast(result.utility.color,result.composer.background),
    inlineCode:contrast(result.inlineCode.color,result.inlineCode.background),
    codeBlock:contrast(result.codeBlockText.color,result.codeBlock.background),
    tableHead:contrast(result.tableHead.color,result.tableHead.background),
    link:contrast(result.link.color,result.link.background),
    plus:contrast(result.plus.color,result.plus.background),
    minus:contrast(result.minus.color,result.minus.background),
    toast:contrast(result.toast.color,result.toast.background),
    activityHover:contrast(result.activityHover.color,result.activityHover.background),
    activityOutput:contrast(result.activityOutput.color,result.activityOutput.background),
    loadOlder:contrast(result.loadOlder.color,result.loadOlder.background),
    menu:contrast(result.approvalMenuItem.color,result.approvalMenu.background),
    approvalDenyHover:contrast(result.approvalDenyHover.color,result.approvalDenyHover.background),
    reviewHead:contrast(result.reviewHead.color,result.reviewHead.background),
    reviewName:contrast(result.reviewName.color,result.reviewHead.background),
    reviewChevron:contrast(result.reviewChevron.color,result.reviewHead.background),
    reviewFilePlus:contrast(result.reviewFilePlus.color,result.reviewHead.background),
    reviewFileMinus:contrast(result.reviewFileMinus.color,result.reviewHead.background),
    context:contrast(result.contextLine.color,result.contextLine.background),
    add:contrast(result.addLine.color,result.addLine.background),
    delete:contrast(result.deleteLine.color,result.deleteLine.background),
  };
  result.menuCommandOverlap=overlap(result.approvalMenu.rect,result.command.rect);
  results.push(result);
  await page.close();
}
await browser.close();
console.log(JSON.stringify(results,null,2));

for(const result of results){
  if(result.errors.length)process.exit(1);
  for(const [name,value] of Object.entries(result.contrast))if(value<4.5){console.error(`${result.scheme} ${name} contrast ${value.toFixed(2)} < 4.5`);process.exit(1)}
  if(result.menuCommandOverlap>0){console.error(`${result.scheme} approval menu overlaps command by ${result.menuCommandOverlap}px²`);process.exit(1)}
  if(result.scheme==='light'&&luminance(result.composer.background)<.7){console.error('light composer still uses a dark fixed surface');process.exit(1)}
  if(result.scheme==='light'&&luminance(result.approvalMenu.background)<.7){console.error('light approval menu still uses a dark fixed surface');process.exit(1)}
  if(result.scheme==='dark'&&luminance(result.hunk.background)>.2){console.error('dark review hunk is not using the dark App surface');process.exit(1)}
  if(result.scheme==='light'&&luminance(result.hunk.background)<.7){console.error('light review hunk still uses a dark fixed surface');process.exit(1)}
}
