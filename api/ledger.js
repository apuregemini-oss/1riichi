import {handle} from '../cloudflare/worker.js';
import {postgresDB} from '../server/postgres.js';
import {ownerIdentity,login,logout} from '../server/owner-auth.js';
export async function route(request,env=process.env){
 const path=new URL(request.url).pathname;
 if(path==='/api/login')return login(request,env);
 if(path==='/api/logout')return logout(request);
 if(path==='/api/auth')return Response.json({can_edit:!!await ownerIdentity(request,env),can_create:true,mode:'vercel',login_url:'/#login'},{headers:{'Cache-Control':'no-store'}});
 if(!env.DATABASE_URL)return Response.json({detail:'Database is not configured yet.'},{status:503});
 return handle(request,{...env,DB:postgresDB(env.DATABASE_URL)}, {waitUntil:()=>{}},ownerIdentity);
}
export default async function handler(req,res){
 try{
  const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value)headers.set(key,Array.isArray(value)?value.join(', '):value);
  const url=new URL(req.url,`https://${req.headers.host}`);
  if(url.searchParams.has('ledger_path')){url.pathname='/api/'+url.searchParams.get('ledger_path');url.searchParams.delete('ledger_path');}
  const body=['GET','HEAD'].includes(req.method)?undefined:typeof req.body==='string'?req.body:JSON.stringify(req.body??{});
  const response=await route(new Request(url,{method:req.method,headers,body}));
  res.statusCode=response.status;response.headers.forEach((value,key)=>res.setHeader(key,value));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.statusCode=500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({detail:'Unable to process this request.'}));}
}
