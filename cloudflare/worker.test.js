import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT} from 'jose';
import {ownerIdentity} from './auth.js';
import {handle} from './worker.js';
import {calculateResults,makeGame} from './scoring.js';
import {readFileSync} from 'node:fs';

test('owner verification rejects forged, expired, wrong audience and other email tokens',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256');
 const env={OWNER_EMAIL:'owner@example.com',ACCESS_AUD:'ledger',ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com'};
 async function token(email='owner@example.com',aud='ledger',expiry='1h') {return new SignJWT({email}).setProtectedHeader({alg:'RS256'}).setIssuer('https://test.cloudflareaccess.com').setAudience(aud).setSubject('owner').setIssuedAt().setExpirationTime(expiry).sign(privateKey);}
 const verify=t=>ownerIdentity(new Request('https://ledger.example/api/auth',{headers:{'Cf-Access-Jwt-Assertion':t}}),env,publicKey);
 assert.ok(await verify(await token()));
 for(const t of [await token('other@example.com'),await token(undefined,'wrong'),await token(undefined,undefined,'-1h'),'forged'])assert.equal(await verify(t),null);
 assert.equal(await ownerIdentity(new Request('https://ledger.example'),{}),null);
});
test('anonymous writes denied before any database access, including legacy routes',async()=>{
 for(const path of ['/api/admin/players','/api/admin/sessions','/api/admin/games/123','/api/games','/api/players']){
 const r=await handle(new Request('https://ledger.example'+path,{method:'POST'}),{},{});
 assert.equal(r.status,403);
 }
 const r=await handle(new Request('https://ledger.example/api/auth'),{},{});assert.equal((await r.json()).can_edit,false);
});
test('even authenticated writes require same origin',async()=>{
 const r=await handle(new Request('https://ledger.example/api/admin/players',{method:'POST',headers:{Origin:'https://elsewhere.example'}}),{},{},async()=>({email:'owner@example.com'}));
 assert.equal(r.status,403);
});
test('Cloudflare scoring matches every normalized raw-score game',()=>{
 const data=JSON.parse(readFileSync(new URL('./.generated/normalized.json',import.meta.url),'utf8'));
 let checked=0;
 for(const game of data.games){if(!game.scoring||game.results.some(r=>r.score==null))continue;
 const results=calculateResults(game.results.map(({player_id,score})=>({player_id,score})),game.scoring);
 for(const result of results){const old=game.results.find(r=>r.player_id===result.player_id);assert.equal(result.final_points,old.final_points,game.id);assert.equal(result.place,old.place,game.id);}checked++;
 }assert.ok(checked>100);
});
test('host fees stay separate and host win is waived',()=>{
 const results=[{player_id:'a',score:40000},{player_id:'b',score:30000},{player_id:'c',score:20000},{player_id:'d',score:10000}];
 const ids=new Set(results.map(r=>r.player_id));
 const game=makeGame({results,host_player_id:'b'},null,ids);
 assert.equal(game.host_fee.chips,5);assert.equal(game.results[0].final_points,60);
 assert.equal(makeGame({results,host_player_id:'a'},null,ids).host_fee.chips,0);
 assert.throws(()=>makeGame({results:[...results.slice(0,3),results[0]]},null,ids));
});
