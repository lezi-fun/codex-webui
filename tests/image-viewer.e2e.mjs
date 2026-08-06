import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { chromium } from 'playwright';
import { launchOptions } from './browser-runtime.mjs';

const base=process.env.CODEX_WEBUI_TEST_URL||'http://127.0.0.1:8899';
const imageA='/tmp/codex-webui-agent-image-a.png';
const imageB='/tmp/codex-webui-agent-image-b.png';
const png=readFileSync(new URL('../public/assets/codex-app-icon-128.png',import.meta.url));
writeFileSync(imageA,png);
writeFileSync(imageB,png);

let browser;
try{
  const imageResponse=await fetch(`${base}/api/images/local?path=${encodeURIComponent(imageA)}&cwd=${encodeURIComponent('/tmp')}`);
  if(!imageResponse.ok||imageResponse.headers.get('content-type')!=='image/png'||(await imageResponse.arrayBuffer()).byteLength!==png.byteLength)throw new Error('Local image endpoint did not return the PNG');
  const deniedResponse=await fetch(`${base}/api/images/local?path=${encodeURIComponent('/Users/home/Projects/codex-webui/package.json')}`);
  if(deniedResponse.status!==404)throw new Error(`Non-image local files must be rejected, got ${deniedResponse.status}`);

  browser=await chromium.launch(launchOptions());
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('404'))errors.push(message.text())});
  await page.goto(base,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>globalThis.__codexWebuiDebug);
  await page.evaluate(({imageA,imageB})=>{
    const api=globalThis.__codexWebuiDebug;
    for(const animation of api.state.motion.values())animation?.destroy?.();
    for(const map of [api.state.items,api.state.turns,api.state.activities,api.state.activityItems,api.state.dividers,api.state.motion])map.clear();
    api.state.active={id:'image-thread',cwd:'/tmp',source:'local'};
    document.querySelector('#conversation').replaceChildren();
    api.notify('item/completed',{turnId:'image-turn',item:{id:'image-commentary',type:'agentMessage',phase:'commentary',text:`Here is the captured result.\n\n![Agent screenshot](${imageA})\n\n[Open the screenshot](${imageA})`}});
    api.notify('item/completed',{turnId:'image-turn',item:{id:'image-command-before',type:'commandExecution',status:'completed',command:'ls /tmp'}});
    api.notify('item/completed',{turnId:'image-turn',item:{id:'image-view',type:'imageView',status:'completed',imagePaths:[imageA,imageB]}});
    api.notify('item/completed',{turnId:'image-turn',item:{id:'image-command-after',type:'commandExecution',status:'completed',command:'ls /tmp'}});
    api.notify('item/completed',{turnId:'image-turn',item:{id:'image-generated',type:'imageGeneration',status:'completed',src:imageB,title:'Generated preview'}});
    api.notify('item/completed',{turnId:'image-turn',item:{id:'image-final',type:'agentMessage',phase:'final_answer',content:[{type:'output_text',text:'The structured result is ready.'},{type:'output_image',path:imageB,alt:'Structured result'}]}});
  },{imageA,imageB});

  await page.waitForFunction(()=>[...document.querySelectorAll('.message-image')].length===5&&[...document.querySelectorAll('.message-image')].every(image=>image.complete&&image.naturalWidth>0));
  const result=await page.evaluate(()=>{
    const viewGroup=document.querySelector('[data-item-id="image-view"]')?.closest('[data-agent-activity-group]');
    const viewRow=viewGroup?.querySelector('[data-item-id="image-view"]');
    const stream=document.querySelector('[data-turn-id="image-turn"] .turn-event-stream');
    const markdownButton=document.querySelector('[data-local-conversation-commentary] .message-image-button');
    return {
      imageCount:document.querySelectorAll('.message-image').length,
      localSources:[...document.querySelectorAll('.message-image')].map(image=>image.getAttribute('src')),
      timeline:[...stream.children].map(node=>node.dataset.agentActivityGroup!==undefined?`tools:${[...node.querySelectorAll('.activity-item')].map(row=>row.dataset.itemId).join(',')}`:node.className),
      activityGroupCount:document.querySelectorAll('[data-agent-activity-group]').length,
      imageViewStandalone:viewGroup?.dataset.standalone,
      imageViewExpanded:viewRow?.getAttribute('aria-expanded'),
      imageViewVisible:viewGroup&&getComputedStyle(viewGroup.querySelector('.activity-image-output')).display!=='none',
      imageViewPreviewCount:viewGroup?.querySelectorAll('.message-image').length,
      imageViewIcon:viewRow?.querySelector('.activity-motion')?.innerHTML,
      generatedVisible:!!document.querySelector('.assistant-generated-image .message-image'),
      structuredVisible:!!document.querySelector('[data-local-conversation-final-assistant] .structured-message-images .message-image'),
      markdownButton,
    };
  });
  if(result.imageCount!==5||result.localSources.some(source=>!source?.startsWith('/api/images/local?')))throw new Error(`Images were not routed through the local endpoint: ${JSON.stringify(result)}`);
  if(result.activityGroupCount!==3||result.imageViewStandalone!=='true'||result.imageViewExpanded!=='true'||!result.imageViewVisible||result.imageViewPreviewCount!==2)throw new Error(`imageView must be standalone and immediately viewable: ${JSON.stringify(result)}`);
  if(!result.imageViewIcon?.includes('<rect')||!result.generatedVisible||!result.structuredVisible)throw new Error(`Structured image surfaces were not rendered: ${JSON.stringify(result)}`);

  await page.locator('[data-local-conversation-commentary] .message-image-button').focus();
  await page.locator('[data-local-conversation-commentary] .message-image-button').click();
  await page.waitForSelector('#imageViewer[open]');
  await page.waitForFunction(()=>document.querySelector('#imageViewerImage')?.naturalWidth>0);
  const viewer=await page.evaluate(()=>({
    title:document.querySelector('#imageViewerTitle').textContent,
    path:document.querySelector('#imageViewerPath').textContent,
    source:document.querySelector('#imageViewerImage').getAttribute('src'),
    original:document.querySelector('#imageViewerOriginal').getAttribute('href'),
    closeFocused:document.activeElement===document.querySelector('#closeImageViewer'),
  }));
  if(viewer.title!=='Agent screenshot'||viewer.path!==imageA||viewer.source!==viewer.original||!viewer.closeFocused)throw new Error(`Unexpected image viewer state: ${JSON.stringify(viewer)}`);
  await page.screenshot({path:'/tmp/codex-webui-image-viewer.png',fullPage:false});
  await page.locator('#closeImageViewer').click();
  if(!await page.locator('[data-local-conversation-commentary] .message-image-button').evaluate(node=>document.activeElement===node))throw new Error('Closing the viewer must restore focus to the image preview');

  const citationResult=await page.evaluate(()=>new Promise(resolve=>{
    let fileEvents=0;
    addEventListener('codex-webui:file-reference',()=>fileEvents++);
    document.querySelector('[data-local-conversation-commentary] .image-citation').click();
    requestAnimationFrame(()=>resolve({fileEvents,open:document.querySelector('#imageViewer').open,title:document.querySelector('#imageViewerTitle').textContent}));
  }));
  if(citationResult.fileEvents!==0||!citationResult.open||citationResult.title!=='codex-webui-agent-image-a.png')throw new Error(`Image citations must open the viewer instead of the file bridge: ${JSON.stringify(citationResult)}`);
  await page.locator('#closeImageViewer').click();

  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-local-conversation-final-assistant] .message-image-button').click();
  const mobile=await page.evaluate(()=>{
    const dialog=document.querySelector('#imageViewer').getBoundingClientRect();
    const image=document.querySelector('#imageViewerImage').getBoundingClientRect();
    return {innerWidth,scrollWidth:document.documentElement.scrollWidth,dialogLeft:dialog.left,dialogRight:dialog.right,imageLeft:image.left,imageRight:image.right};
  });
  if(mobile.scrollWidth>mobile.innerWidth||mobile.dialogLeft<-.5||mobile.dialogRight>mobile.innerWidth+.5||mobile.imageLeft<0||mobile.imageRight>mobile.innerWidth+.5)throw new Error(`Image viewer overflows the mobile viewport: ${JSON.stringify(mobile)}`);
  await page.screenshot({path:'/tmp/codex-webui-image-viewer-mobile.png',fullPage:false});
  if(errors.length)throw new Error(`Browser errors: ${errors.join('; ')}`);
  console.log(JSON.stringify({endpoint:'ok',result:{...result,markdownButton:!!result.markdownButton},viewer,citationResult,mobile,errors},null,2));
}finally{
  await browser?.close();
  rmSync(imageA,{force:true});
  rmSync(imageB,{force:true});
}
