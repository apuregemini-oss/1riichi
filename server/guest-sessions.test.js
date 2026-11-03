import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {postgresDB} from './postgres.js';
import {handle} from '../cloudflare/worker.js';

test('guests create sessions and games but cannot edit or register players',async()=>{
 const pg=new PGlite();
 try{
  await pg.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
  const DB=postgresDB(null,{query:async(q,p)=>(await pg.query(q,p)).rows});
  for(const id of ['a','b','c','d'])await DB.prepare('INSERT INTO players(id,name,payload) VALUES(?,?,?)').bind(id,id,JSON.stringify({id,name:id})).run();
  const call=(path,body,method='POST',origin='https://ledger.example')=>handle(new Request('https://ledger.example/api/admin/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),{DB},{waitUntil:()=>{}});
  assert.equal((await call('sessions',{name:'Guest night'},'POST','https://other.example')).status,403);
  assert.equal((await call('sessions',{})).status,400);
  const response=await call('sessions',{name:'Guest night'});assert.equal(response.status,201);
  const session=await response.json();
  const body={results:['a','b','c','d'].map((player_id,i)=>({player_id,score:40000-i*10000})),host_player_id:'b'};
  const saved=await call(`sessions/${session.id}/games`,body);assert.equal(saved.status,201);
  const game=await saved.json();assert.equal(game.results[0].final_points,60);assert.equal(game.host_fee.chips,5);
  const finished=await call(`sessions/${session.id}/finish`,{});assert.equal(finished.status,200);assert.ok((await finished.json()).finished_at);
  assert.equal((await call(`sessions/${session.id}/finish`,{})).status,200);
  assert.equal((await call(`sessions/${session.id}/games`,body)).status,400);
  assert.equal((await call(`games/${game.id}`,{...body,revision:1},'PUT')).status,403);
  assert.equal((await call(`games/${game.id}`,{},'DELETE')).status,403);
  assert.equal((await call('players',{name:'Unauthorized registration'})).status,403);
  const imported={...session,id:'imported',imported_only:true};
  await DB.prepare('INSERT INTO sessions(id,payload) VALUES(?,?)').bind(imported.id,JSON.stringify(imported)).run();
  assert.equal((await call('sessions/imported/games',body)).status,400);
  const records=await pg.query('SELECT payload FROM games');assert.equal(records.rows.length,1);
  assert.deepEqual(JSON.parse(records.rows[0].payload).results,game.results);
 }finally{await pg.close();}
});
