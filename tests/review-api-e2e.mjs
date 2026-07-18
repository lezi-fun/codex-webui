const base='http://127.0.0.1:8899';

const injected=await fetch(`${base}/api/review/patch`,{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({
    cwd:'/tmp',
    diff:'diff --git a/public/leak b/public/leak\nnew file mode 120000\n--- /dev/null\n+++ b/public/leak\n@@ -0,0 +1 @@\n+/etc/hosts\n',
    action:'reapply',
  }),
});
const injectedBody=await injected.json();

const missing=await fetch(`${base}/api/review/patch`,{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({threadId:'missing-thread',turnId:'missing-turn',action:'reapply'}),
});
const missingBody=await missing.json();

const result={injectedStatus:injected.status,injectedError:injectedBody.error,missingStatus:missing.status,missingError:missingBody.error};
console.log(JSON.stringify(result,null,2));
if(injected.status!==400||!/client-supplied/i.test(injectedBody.error||'')||missing.status!==400||!/unavailable|expired/i.test(missingBody.error||''))process.exit(1);
