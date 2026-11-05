import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {postgresDB} from './postgres.js';
import {handle} from '../cloudflare/worker.js';
test('owner session deletion hides all its games, updates cache, retains recovery records, and rejects later writes',async()=>{
 const pg=new PGlite();
 try{
  await pg.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
  await pg.exec(readFileSync(new URL('./session-finish.sql',import.meta.url),'utf8'));
  const DB=postgresDB(null,{query:async(q,p)=>(await pg.query(q,p)).rows});
  const call=(path,body,method='POST',owner=false)=>handle(new Request('https://ledger.example/api/'+path,{method,headers:{Origin:'https://ledger.example','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),{DB},{waitUntil:()=>{}},async()=>owner?{owner:true}:null);
  for(const id of ['a','b','c','d'])await DB.prepare('INSERT INTO players(id,name,payload) VALUES(?,?,?)').bind(id,id,JSON.stringify({id,name:id})).run();
  const session=await (await call('admin/sessions',{name:'Remove me'})).json();
  const other=await (await call('admin/sessions',{name:'Keep me'})).json();
  const body={results:['a','b','c','d'].map((player_id,i)=>({player_id,score:40000-i*10000}))};
  const game=await (await call(`admin/sessions/${session.id}/games`,body)).json();
  await call(`admin/sessions/${session.id}/games`,body);
  await call(`admin/sessions/${other.id}/games`,body);
  const before=await call('bootstrap',null,'GET');
  assert.equal((await call(`admin/sessions/${session.id}`,{},'DELETE')).status,403);
  assert.equal((await call(`admin/sessions/${session.id}`,{},'DELETE',true)).status,200);
  const after=await call('bootstrap',null,'GET');assert.notEqual(before.headers.get('etag'),after.headers.get('etag'));
  const data=await after.json();assert.deepEqual(data.sessions.map(s=>s.id),[other.id]);assert.equal(data.games.length,1);assert.equal(data.games[0].session_id,other.id);
  assert.equal((await pg.query('SELECT * FROM games')).rows.length,3);
  assert.equal((await call(`admin/sessions/${session.id}/games`,body)).status,404);
  assert.equal((await call(`admin/sessions/${session.id}/finish`,{})).status,404);
  assert.equal((await call(`admin/games/${game.id}`,{...body,revision:1},'PUT',true)).status,404);
  assert.equal((await call(`admin/sessions/${session.id}`,{},'DELETE',true)).status,409);
  const archived={id:'historical',name:'Historical',imported_only:true,created_at:'2024-01-01'};
  await DB.prepare('INSERT INTO sessions(id,payload) VALUES(?,?)').bind(archived.id,JSON.stringify(archived)).run();
  assert.equal((await call('admin/sessions/historical',{},'DELETE',true)).status,200);
  await call(`admin/sessions/${other.id}/finish`,{});
  assert.equal((await call(`admin/sessions/${other.id}`,{},'DELETE',true)).status,200);
  assert.equal((await (await call('bootstrap',null,'GET')).json()).games.length,0);
 }finally{await pg.close();}
});
