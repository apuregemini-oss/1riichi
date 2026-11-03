import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {postgresDB} from './postgres.js';
import {handle} from '../cloudflare/worker.js';
test('full Postgres migration, public reads, owner writes, edit audit and stale edit rejection',async()=>{
 const pg=new PGlite();
 try{
 await pg.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
 const data=JSON.parse(readFileSync(new URL('../cloudflare/.generated/normalized.json',import.meta.url),'utf8'));
 const db=postgresDB(null,{query:async(q,p)=>(await pg.query(q,p)).rows});
 for(const p of data.players)await db.prepare('INSERT INTO players(id,name,payload) VALUES(?,?,?)').bind(p.id,p.name,JSON.stringify(p)).run();
 for(const s of data.sessions)await db.prepare('INSERT INTO sessions(id,payload) VALUES(?,?)').bind(s.id,JSON.stringify(s)).run();
 for(const g of data.games)await db.prepare('INSERT INTO games(id,session_id,payload) VALUES(?,?,?)').bind(g.id,g.session_id??null,JSON.stringify(g)).run();
 const env={DB:db},ctx={waitUntil:()=>{}};
 const result=await handle(new Request('https://ledger.example/api/bootstrap'),env,ctx);
 assert.equal(result.status,200);const payload=await result.json();assert.equal(payload.games.length,817);assert.equal(payload.sessions.length,104);assert.equal(payload.players.length,44);
 const total=games=>games.reduce((n,g)=>n+(g.results.find(r=>r.player_id===data.players.find(p=>p.name==='Eric C').id)?.final_points??0),0);
 assert.equal(total(payload.games),total(data.games));
 const game=payload.games.find(g=>g.scoring&&g.results.every(r=>r.score!=null));
 const update={results:game.results.map(({player_id,score})=>({player_id,score})),host_player_id:game.host_player_id,winner_player_id:game.host_fee?.winner_player_id,revision:game.revision};
 const request=()=>new Request('https://ledger.example/api/admin/games/'+game.id,{method:'PUT',headers:{Origin:'https://ledger.example','Content-Type':'application/json'},body:JSON.stringify(update)});
 assert.equal((await handle(request(),env,ctx)).status,403);
 const saved=await handle(request(),env,ctx,async()=>({owner:true}));assert.equal(saved.status,200,await saved.clone().text());assert.equal((await saved.json()).revision,2);
 assert.equal((await handle(request(),env,ctx,async()=>({owner:true}))).status,409);
 assert.equal(Number((await pg.query('SELECT count(*) n FROM game_edits')).rows[0].n),1);
 assert.notEqual((await handle(new Request('https://ledger.example/api/bootstrap'),env,ctx)).headers.get('etag'),result.headers.get('etag'));
 }finally{await pg.close();}
});
