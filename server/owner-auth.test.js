import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {login,logout,ownerIdentity} from './owner-auth.js';
import {route} from '../api/ledger.js';
test('owner password issues a secure session, wrong password and CSRF denied',async()=>{
 const password=randomBytes(32).toString('base64url');
 const env={OWNER_PASSWORD_HASH:createHash('sha256').update(password).digest('hex'),OWNER_SESSION_SECRET:randomBytes(32).toString('hex')};
 const request=(pass,origin='https://ledger.example')=>new Request('https://ledger.example/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password:pass})});
 assert.equal((await login(request('wrong'),env)).status,403);
 assert.equal((await login(request(password,'https://other.example'),env)).status,403);
 const response=await login(request(password),env);assert.equal(response.status,200);
 const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);
 assert.ok(await ownerIdentity(new Request('https://ledger.example',{headers:{Cookie:cookie.split(';')[0]}}),env));
 assert.equal(await ownerIdentity(new Request('https://ledger.example',{headers:{Cookie:'__Host-ledger_owner=forged'}}),env),null);
 assert.equal((await logout(new Request('https://ledger.example/api/logout',{method:'POST',headers:{Origin:'https://ledger.example'}}))).status,200);
});
test('Vercel defaults to public read-only and fails closed without secrets',async()=>{
 assert.equal((await (await route(new Request('https://ledger.example/api/auth'),{})).json()).can_edit,false);
 assert.equal((await login(new Request('https://ledger.example/api/login',{method:'POST',headers:{Origin:'https://ledger.example'}}),{})).status,503);
});
