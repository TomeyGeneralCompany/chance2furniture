import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
test('HTTP storefront creates and restores a guest card, rejects unconfigured checkout and keeps secrets private',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'chance2-http-')),port=38643,origin=`http://localhost:${port}`;
 const child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:String(port),PUBLIC_ORIGIN:origin,DATABASE_PATH:join(dir,'test.sqlite'),STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:''},stdio:['ignore','pipe','pipe']});
 try{
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Server did not start');}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Server timeout')),5000).unref())]);
  assert.equal((await fetch(origin)).status,200);
  assert.equal((await fetch(origin+'/.env')).status,404);
  assert.equal((await fetch(origin+'/.data/store.sqlite')).status,404);
  const created=await fetch(origin+'/api/cards',{method:'POST',headers:{Origin:origin}});assert.equal(created.status,201);const card=await created.json();assert.equal(card.punches,0);assert.equal(card.id.length,48);
  const restored=await fetch(origin+'/api/card',{headers:{'X-Card-Code':card.id}});assert.equal((await restored.json()).id,card.id);
  assert.equal((await fetch(origin+'/api/card')).status,401);
  assert.equal((await fetch(origin+'/api/cards',{method:'POST',headers:{Origin:'https://other.example'}})).status,403);
  const checkout=await fetch(origin+'/api/checkout',{method:'POST',headers:{Origin:origin,'X-Card-Code':card.id,'Content-Type':'application/json'},body:JSON.stringify({items:[]})});assert.equal(checkout.status,503);
  const invalid=await fetch(origin+'/api/stripe/webhook',{method:'POST',body:'{}'});assert.equal(invalid.status,400);
 }finally{child.kill('SIGTERM');await once(child,'exit');rmSync(dir,{recursive:true,force:true});}
});
