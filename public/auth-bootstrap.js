import { codexInterfaceMark } from './codex-brand.js';

const $=selector=>document.querySelector(selector);

async function loadApp(){
  for(const href of ['/vendor/katex/katex.min.css','/vendor/xterm/xterm.css']){
    if(document.querySelector(`link[href="${href}"]`))continue;
    const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);
  }
  await import('/app.bundle.js');
}

async function start(){
  let status;
  try{status=await fetch('/api/auth/status',{cache:'no-store'}).then(response=>response.json())}
  catch{status={passwordRequired:false,authenticated:true}}
  if(!status.passwordRequired||status.authenticated){await loadApp();return}
  const gate=$('#passwordGate'),app=$('#app'),input=$('#passwordInput'),form=$('#passwordLoginForm'),button=$('#passwordLoginButton'),error=$('#passwordError');
  $('#passwordCodexMark').innerHTML=codexInterfaceMark('password-codex-mark');
  gate.hidden=false;app.setAttribute('aria-hidden','true');app.inert=true;requestAnimationFrame(()=>input.focus());
  form.onsubmit=async event=>{
    event.preventDefault();button.disabled=true;button.textContent='Logging in…';error.hidden=true;
    try{
      const response=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:input.value})}),data=await response.json();
      if(!response.ok)throw new Error(data.error||'Unable to log in');
      gate.hidden=true;app.removeAttribute('aria-hidden');app.inert=false;input.value='';
      loadApp().catch(reason=>console.error('[codex-webui] application load failed',reason));
    }catch(reason){error.textContent=reason instanceof Error?reason.message:String(reason);error.hidden=false;input.select()}
    finally{button.disabled=false;button.textContent='Log in'}
  };
}

start().catch(error=>console.error('[codex-webui] authentication bootstrap failed',error));