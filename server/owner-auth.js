import {createHash,timingSafeEqual} from 'node:crypto';
import {SignJWT,jwtVerify} from 'jose';
const cookieName='__Host-ledger_owner';
const cookie=(value,age)=>`${cookieName}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${age}`;
const secret=env=>new TextEncoder().encode(env.OWNER_SESSION_SECRET);
export const configured=env=>/^[a-f0-9]{64}$/.test(env.OWNER_PASSWORD_HASH??'')&&(env.OWNER_SESSION_SECRET?.length??0)>=32;
export async function ownerIdentity(request,env){
 if(!configured(env))return null;
 const token=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
 if(!token)return null;
 try{const {payload}=await jwtVerify(token,secret(env),{algorithms:['HS256'],issuer:'riichi-ledger',audience:'owner',requiredClaims:['exp','iat','sub']});return payload.sub==='owner'?{owner:true}:null;}catch{return null;}
}
export async function login(request,env){
 const headers={'Cache-Control':'no-store'};
 if(request.method!=='POST')return Response.json({detail:'Method not allowed.'},{status:405,headers});
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({detail:'Invalid origin.'},{status:403,headers});
 if(!configured(env))return Response.json({detail:'Owner sign-in is not configured yet.'},{status:503,headers});
 if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({detail:'Expected JSON.'},{status:415,headers});
 let body;try{const text=await request.text();if(text.length>2048)throw Error();body=JSON.parse(text);}catch{return Response.json({detail:'Invalid request.'},{status:400,headers});}
 if(typeof body.password!=='string'||body.password.length>256)return Response.json({detail:'Invalid password.'},{status:403,headers});
 const hash=createHash('sha256').update(body.password).digest();
 if(!timingSafeEqual(hash,Buffer.from(env.OWNER_PASSWORD_HASH,'hex')))return Response.json({detail:'Invalid password.'},{status:403,headers});
 const token=await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setSubject('owner').setIssuer('riichi-ledger').setAudience('owner').setIssuedAt().setExpirationTime('7d').sign(secret(env));
 return Response.json({ok:true},{headers:{...headers,'Set-Cookie':cookie(token,604800)}});
}
export function logout(request){
 if(request.method!=='POST'||request.headers.get('origin')!==new URL(request.url).origin)return new Response(null,{status:403});
 return Response.json({ok:true},{headers:{'Set-Cookie':cookie('',0),'Cache-Control':'no-store'}});
}
