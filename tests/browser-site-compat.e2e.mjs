import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { launchOptions } from './browser-runtime.mjs';

const site=createServer((req,res)=>{
  if(req.url==='/start'){res.writeHead(302,{location:'/app/'});res.end();return}
  if(req.url==='/assets/site.css'){res.writeHead(200,{'content-type':'text/css'});res.end('body{background:rgb(12,34,56);color:white}');return}
  if(req.url==='/assets/app.mjs'){res.writeHead(200,{'content-type':'text/javascript'});res.end('document.body.dataset.module="ready"');return}
  if(req.url==='/next'){res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>Next</title><h1>Navigation complete</h1>');return}
  if(req.url==='/app/'){res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><link rel="stylesheet" href="/assets/site.css"><script type="module" src="/assets/app.mjs"></script><h1>Styled app</h1><a id="next" href="/next">Next</a>');return}
  res.writeHead(404);res.end('Not found');
});
await new Promise(resolve=>site.listen(0,'127.0.0.1',resolve));
const address=site.address();
const target=`http://127.0.0.1:${address.port}/start`;
const base=process.env.CODEX_WEBUI_TEST_URL||'http://127.0.0.1:8899';
const browser=await chromium.launch(launchOptions());
const page=await browser.newPage({viewport:{width:1280,height:760},colorScheme:'dark'});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.goto(base,{waitUntil:'networkidle'});
await page.click('#toggleSidePanel');
await page.click('[data-side-panel-action="browser"]');
await page.fill('#browserUrl',target);
await page.press('#browserUrl','Enter');
const frame=page.frameLocator('#browserFrame');
await frame.locator('body[data-module="ready"]').waitFor();
const styled=await frame.locator('body').evaluate(node=>getComputedStyle(node).backgroundColor);
await frame.locator('#next').click();
await frame.locator('h1').filter({hasText:'Navigation complete'}).waitFor();
const result=await page.evaluate(()=>({sandbox:document.querySelector('#browserFrame').getAttribute('sandbox'),status:document.querySelector('#browserStatus').dataset.tone}));
console.log(JSON.stringify({styled,result,errors},null,2));
await browser.close();
await new Promise(resolve=>site.close(resolve));
if(errors.length||styled!=='rgb(12, 34, 56)'||!result.sandbox.includes('allow-same-origin')||result.status!=='loaded')process.exit(1);
