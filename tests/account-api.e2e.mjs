import WebSocket from 'ws';

const base='http://127.0.0.1:8899';
const response=await fetch(`${base}/api/account`,{cache:'no-store'});
const account=await response.json();
const keys=Object.keys(account).sort();
const expected=['avatarUrl','displayName','initials','planType','type'];
const result={status:response.status,keys,hasDisplayName:Boolean(account.displayName),avatarUrl:account.avatarUrl||null};
if(response.ok&&account.avatarUrl){
  const avatar=await fetch(`${base}${account.avatarUrl}`,{cache:'no-store',redirect:'error'});
  result.avatar={status:avatar.status,contentType:avatar.headers.get('content-type'),length:(await avatar.arrayBuffer()).byteLength};
}
const foreignHostResponse=await fetch(`${base}/api/account`,{headers:{host:'codex.example.com'},cache:'no-store'});
result.foreignHostStatus=foreignHostResponse.status;
const blockedRpc=await new Promise((resolve,reject)=>{
  const ws=new WebSocket('ws://127.0.0.1:8899/ws');
  const timer=setTimeout(()=>{ws.close();reject(new Error('account RPC check timed out'))},10_000);
  ws.on('open',()=>ws.send(JSON.stringify({type:'rpc',id:991,method:'account/read',params:{}})));
  ws.on('message',raw=>{const message=JSON.parse(String(raw));if(message.id!==991)return;clearTimeout(timer);ws.close();resolve(message)});
  ws.on('error',reject);
});
result.blockedRpc=blockedRpc;
console.log(JSON.stringify(result,null,2));
if(response.status!==200||JSON.stringify(keys)!==JSON.stringify(expected)||!account.displayName||'email' in account||'imageUrl' in account||JSON.stringify(account).toLowerCase().includes('token')||(account.avatarUrl&&(!result.avatar?.status||!result.avatar.contentType?.startsWith('image/')||!result.avatar.length))||result.foreignHostStatus!==401||blockedRpc.type!=='rpc/error')process.exit(1);
