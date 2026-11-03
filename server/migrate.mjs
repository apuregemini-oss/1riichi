import {neon} from '@neondatabase/serverless';
import {readFileSync} from 'node:fs';
const sql=neon(process.env.DATABASE_URL);
const schema=readFileSync(new URL('./schema.sql',import.meta.url),'utf8');
// Split SQL while keeping the PL/pgSQL function bodies intact.
const statements=schema.match(/(?:[^;$]|\$(?!\$)|\$\$[\s\S]*?\$\$)+;/g).map(s=>s.trim().replace(/;$/,''));
await sql.transaction(statements.map(s=>sql.query(s,[])));
const existing=await sql.query('SELECT (SELECT count(*) FROM players) players,(SELECT count(*) FROM sessions) sessions,(SELECT count(*) FROM games) games',[]);
if(Object.values(existing[0]).some(v=>Number(v)!==0))throw Error('Database is not empty; refusing to re-import.');
const data=JSON.parse(readFileSync(new URL('../cloudflare/.generated/normalized.json',import.meta.url),'utf8'));
const operations=[];
for(const p of data.players)operations.push(sql.query('INSERT INTO players(id,name,payload) VALUES($1,$2,$3)',[p.id,p.name,JSON.stringify(p)]));
for(const s of data.sessions)operations.push(sql.query('INSERT INTO sessions(id,payload) VALUES($1,$2)',[s.id,JSON.stringify(s)]));
for(const g of data.games)operations.push(sql.query('INSERT INTO games(id,session_id,payload) VALUES($1,$2,$3)',[g.id,g.session_id??null,JSON.stringify(g)]));
await sql.transaction(operations);
console.log(await sql.query('SELECT (SELECT count(*) FROM players) players,(SELECT count(*) FROM sessions) sessions,(SELECT count(*) FROM games) games',[]));
