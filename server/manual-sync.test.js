import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {postgresDB} from './postgres.js';
import {handle} from '../cloudflare/worker.js';
test('manual Excel sync requires owner and completes only the requested job',async()=>{
 const pg=new PGlite();
 try{
  await pg.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
  const DB=postgresDB(null,{query:async(q,p)=>(await pg.query(q,p)).rows});
  const call=(body,owner=true)=>handle(new Request('https://ledger.example/api/admin/excel-sync',{method:body?'POST':'GET',headers:{Origin:'https://ledger.example','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),{DB},{waitUntil:()=>{}},async()=>owner?{owner:true}:null);
  assert.equal((await call({action:'request'},false)).status,403);
  assert.equal((await call(null,false)).status,403);
  assert.equal((await (await call()).json()).status,'idle');
  const request=await (await call({action:'request'})).json();assert.equal(request.status,'pending');
  assert.equal((await (await call({action:'request'})).json()).id,request.id);
  assert.equal((await call({action:'complete',id:'wrong'})).status,409);
  assert.equal((await (await call({action:'complete',id:request.id})).json()).status,'complete');
  assert.equal((await call({action:'error',id:request.id})).status,409);
  assert.notEqual((await (await call({action:'request'})).json()).id,request.id);
 }finally{await pg.close();}
});
