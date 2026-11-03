import {createRemoteJWKSet,jwtVerify} from 'jose';
const keySets=new Map();
export async function ownerIdentity(request,env,keyOverride){
 if(!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD||!env.OWNER_EMAIL)return null;
 try {
  const issuer=`https://${env.ACCESS_TEAM_DOMAIN}`;
  if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN))return null;
  const cookie=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('CF_Authorization='))?.slice('CF_Authorization='.length);
  const token=request.headers.get('Cf-Access-Jwt-Assertion')||cookie;
  if(!token)return null;
  if(!keySets.has(issuer))keySets.set(issuer,createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)));
  const {payload}=await jwtVerify(token,keyOverride??keySets.get(issuer),{issuer,audience:env.ACCESS_AUD,algorithms:['RS256'],requiredClaims:['exp','iat','sub','email']});
  if(typeof payload.email!=='string'||payload.email.toLowerCase()!==env.OWNER_EMAIL.toLowerCase())return null;
  return {email:payload.email};
 }catch{return null;}
}
