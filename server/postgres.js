import {neon} from '@neondatabase/serverless';
// Small adapter lets the tested ledger service run against Postgres on Vercel.
export function postgresDB(url,driver){
 const sql=driver??neon(url);
 function prepare(source){
  let n=0;
  const query=source.replace(/json_extract\(payload,'\$\.([^']+)'\)/g,(_,key)=>key==='source_game_number'?`(payload::jsonb->>'${key}')::int`:`payload::jsonb->>'${key}'`).replace(/\?/g,()=>`$${++n}`);
  let params=[];
  return {bind(...values){params=values;return this;},
   async first(){return (await sql.query(query,params))[0]??null;},
   async all(){return {results:await sql.query(query,params)};},
   async run(){const results=await sql.query(query+' RETURNING id',params);return {results,meta:{changes:results.length}};}
  };
 }
 return {prepare,batch:statements=>Promise.all(statements.map(s=>s.all()))};
}
