import {ownerIdentity} from './auth.js';
import {InputError,requireValue,validateSession,makeGame} from './scoring.js';
import {sessionWorksheet} from '../server/excel-export.js';
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const publicGame=game=>{const {source,points_standardization,...rest}=game;return {...rest,results:game.results.map(({player_id,score,place,place_label,uma,final_points})=>({player_id,score,place,place_label,uma,final_points}))};};
async function bodyOf(request){
 requireValue(request.headers.get('Content-Type')?.includes('application/json'),'Expected JSON.',415);
 const text=await request.text();requireValue(text.length<=20000,'Request too large.',413);
 try{return JSON.parse(text);}catch{throw new InputError('Invalid JSON.');}
}
export async function handle(request,env,ctx,authenticate=ownerIdentity){
 try{
  const url=new URL(request.url),path=url.pathname;
  const read=request.method==='GET'||request.method==='HEAD';
  if(path==='/api/health'&&read)return json({status:'ok'});
  if(path==='/api/auth'&&read){const owner=await authenticate(request,env);return json({can_edit:!!owner,can_create:true,mode:'cloudflare',login_url:'/admin/'});}
  if(path==='/api/bootstrap'&&read){
   const version=(await env.DB.prepare("SELECT value FROM metadata WHERE key='version'").first())?.value??'0';
   const etag=`"ledger-${version}"`;
   if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers:{ETag:etag,'Cache-Control':'no-cache'}});
   const key=new Request(`${url.origin}/__ledger_cache/${version}`);
   const cache=globalThis.caches?.default;
   const cached=cache?await cache.match(key):null;
   if(cached)return new Response(cached.body,{headers:{'Content-Type':'application/json',ETag:etag,'Cache-Control':'no-cache'}});
   const [p,s,g]=await env.DB.batch([env.DB.prepare('SELECT payload FROM players ORDER BY name'),env.DB.prepare('SELECT payload FROM sessions ORDER BY json_extract(payload,\'$.created_at\') DESC'),env.DB.prepare('SELECT payload,revision FROM games ORDER BY json_extract(payload,\'$.date\') DESC, json_extract(payload,\'$.source_game_number\') DESC')]);
   const payload={players:p.results.map(r=>JSON.parse(r.payload)),sessions:s.results.map(r=>{const v=JSON.parse(r.payload);return {...v,excel_player_ids:v.finished_at? [...new Set(g.results.map(r=>JSON.parse(r.payload)).filter(game=>game.session_id===v.id).flatMap(game=>game.results.map(r=>r.player_id)))]:undefined,source:v.source?.chippirats_session_id?{chippirats_session_id:v.source.chippirats_session_id}:undefined};}),games:g.results.filter(r=>!JSON.parse(r.payload).deleted_at).map(r=>publicGame({...JSON.parse(r.payload),revision:r.revision}))};
   const content=JSON.stringify(payload);
   if(cache)ctx.waitUntil(cache.put(key,new Response(content,{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=86400'}})));
   return new Response(content,{headers:{'Content-Type':'application/json',ETag:etag,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});
  }
  if(path.startsWith('/api/')||path.startsWith('/admin')){
   const owner=await authenticate(request,env);
   const guestCreate=request.method==='POST'&&(path==='/api/admin/sessions'||/^\/api\/admin\/sessions\/[^/]+\/(games|finish)$/.test(path));
   const guestDelete=request.method==='DELETE'&&/^\/api\/admin\/games\/[^/]+$/.test(path);
   requireValue(!!owner||guestCreate||guestDelete,'Sign in as the owner to edit this ledger.',403);
   if(path.startsWith('/admin')&&read){const assetUrl=new URL('/',request.url);return env.ASSETS.fetch(new Request(assetUrl,request));}
   requireValue(path.startsWith('/api/admin/'),'Endpoint not found.',404);
   if(path==='/api/admin/excel-sync'&&read){
    const row=await env.DB.prepare("SELECT value FROM metadata WHERE key='excel_sync_request'").first();
    return json(row?JSON.parse(row.value):{status:'idle'});
   }
   requireValue(request.headers.get('Origin')===url.origin,'Invalid request origin.',403);
   const body=await bodyOf(request);
   if(path==='/api/admin/excel-sync'&&request.method==='POST'){
    const row=await env.DB.prepare("SELECT value FROM metadata WHERE key='excel_sync_request'").first();
    const previous=row?JSON.parse(row.value):null;
    if(body.action==='complete'||body.action==='error'){
     requireValue(previous?.id===body.id&&previous.status==='pending','Sync request changed.',409);
     const next={...previous,status:body.action,completed_at:new Date().toISOString(),error:body.action==='error'?String(body.error??'Sync failed').slice(0,300):null};
     const result=await env.DB.prepare("UPDATE metadata SET value=? WHERE key='excel_sync_request' AND value=?").bind(JSON.stringify(next),row.value).run();
     requireValue(result.meta.changes===1,'Sync request changed.',409);return json(next);
    }
    requireValue(!body.action||body.action==='request','Invalid sync action.');
    if(previous?.status==='pending')return json(previous);
    const next={id:crypto.randomUUID(),status:'pending',requested_at:new Date().toISOString()};
    await env.DB.prepare("INSERT INTO metadata(key,value) VALUES('excel_sync_request',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(next)).run();
    return json(next);
   }
   const finish=path.match(/^\/api\/admin\/sessions\/([^/]+)\/finish$/);
   if(finish&&request.method==='POST'){
    const row=await env.DB.prepare('SELECT payload FROM sessions WHERE id=?').bind(finish[1]).first();
    requireValue(!!row,'Session not found.',404);
    const session=JSON.parse(row.payload);requireValue(!session.imported_only,'Historical sessions are already in the workbook.');
    if(session.finished_at)return json(session);
    const records=await env.DB.prepare('SELECT payload FROM games WHERE session_id=?').bind(session.id).all();
    const players=await env.DB.prepare('SELECT payload FROM players').all();
    try{sessionWorksheet(session,records.results.map(r=>JSON.parse(r.payload)).filter(g=>!g.deleted_at),players.results.map(r=>JSON.parse(r.payload)));}catch(e){throw new InputError(e.message);}
    session.finished_at=new Date().toISOString();
    const result=await env.DB.prepare('UPDATE sessions SET payload=? WHERE id=? AND payload=?').bind(JSON.stringify(session),session.id,row.payload).run();
    requireValue(result.meta.changes===1,'Session changed. Refresh and try again.',409);
    return json(session);
   }
   if(path==='/api/admin/players'&&request.method==='POST'){
    const name=body.name?.trim();requireValue(typeof name==='string'&&name.length>0&&name.length<=32,'Enter a player name (up to 32 characters).');
    const player={id:crypto.randomUUID(),name};
    try{await env.DB.prepare('INSERT INTO players(id,name,payload) VALUES(?,?,?)').bind(player.id,name,JSON.stringify(player)).run();}catch(e){if(/unique|duplicate key/i.test(String(e)))throw new InputError('Player already exists.');throw e;}
    return json(player,201);
   }
   if(path==='/api/admin/sessions'&&request.method==='POST'){
    const session={...validateSession(body),id:crypto.randomUUID(),created_at:new Date().toISOString()};
    await env.DB.prepare('INSERT INTO sessions(id,payload) VALUES(?,?)').bind(session.id,JSON.stringify(session)).run();return json(session,201);
   }
   const add=path.match(/^\/api\/admin\/sessions\/([^/]+)\/games$/);
   const edit=path.match(/^\/api\/admin\/games\/([^/]+)$/);
   if(edit&&request.method==='DELETE'){
    const row=await env.DB.prepare('SELECT payload,revision FROM games WHERE id=?').bind(edit[1]).first();
    requireValue(!!row,'Game not found.',404);
    const game=JSON.parse(row.payload);requireValue(!game.deleted_at,'Game already deleted.',409);
    requireValue(Number.isInteger(body.revision)&&body.revision===row.revision,'This game changed. Reload before deleting.',409);
    const sessionRow=game.session_id?await env.DB.prepare('SELECT payload FROM sessions WHERE id=?').bind(game.session_id).first():null;
    const session=sessionRow?JSON.parse(sessionRow.payload):null;
    requireValue(!!owner||(session&&!session.finished_at&&!session.imported_only),'Only the owner can delete games from finished or historical sessions.',403);
    game.deleted_at=new Date().toISOString();
    const statement=owner?'UPDATE games SET payload=?,revision=revision+1 WHERE id=? AND revision=?':"UPDATE games SET payload=?,revision=revision+1 WHERE id=? AND revision=? AND EXISTS (SELECT 1 FROM sessions WHERE sessions.id=games.session_id AND payload=?)";
    const args=[JSON.stringify(game),game.id,body.revision];if(!owner)args.push(sessionRow.payload);
    const result=await env.DB.prepare(statement).bind(...args).run();
    requireValue(result.meta.changes===1,'Game or session changed. Refresh and try again.',409);
    return json({ok:true});
   }
   if((add&&request.method==='POST')||(edit&&request.method==='PUT')){
    let previous=null,session=null;
    if(edit){const row=await env.DB.prepare('SELECT payload,revision FROM games WHERE id=?').bind(edit[1]).first();requireValue(!!row,'Game not found.',404);previous=JSON.parse(row.payload);requireValue(!previous.deleted_at,'Game not found.',404);requireValue(Number.isInteger(body.revision)&&body.revision===row.revision,'This game changed. Reload before editing.',409);}
    const sessionId=add?.[1]??previous?.session_id;
    if(sessionId){const row=await env.DB.prepare('SELECT payload FROM sessions WHERE id=?').bind(sessionId).first();requireValue(!!row,'Session not found.',404);session=JSON.parse(row.payload);}
    if(add){requireValue(!session.imported_only,'Create a new session to record new games.');requireValue(!session.finished_at,'This session is finished. Create a new session.');}
    const players=await env.DB.prepare('SELECT id FROM players').all();
    const game=makeGame(body,session,new Set(players.results.map(p=>p.id)),previous);
    if(edit){const result=await env.DB.prepare('UPDATE games SET payload=?,revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(game),game.id,body.revision).run();requireValue(result.meta.changes===1,'This game changed. Reload before editing.',409);}
    else await env.DB.prepare('INSERT INTO games(id,session_id,payload) VALUES(?,?,?)').bind(game.id,sessionId,JSON.stringify(game)).run();
    return json({...publicGame(game),revision:edit?body.revision+1:1},edit?200:201);
   }
   throw new InputError('Endpoint not found.',404);
  }
  requireValue(read,'Method not allowed.',405);
  return env.ASSETS.fetch(request);
 }catch(error){if(error instanceof InputError)return json({detail:error.message},error.status);console.error('Request failed',error.name);return json({detail:'Unable to process this request.'},500);}
}
export default {fetch:handle};
