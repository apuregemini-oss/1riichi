import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionSettlement,signedDollars} from '../src/settlement.js';
test('settlement adds host transfers once to points at the session rates',()=>{
 const players=[['Alan',360.4,-30],['Eric',-116.4,-5],['Laura',-95.6,35],['Mark',-148.4,0]].map(([name,points,hostChips])=>({name,points,hostChips}));
 const rows=sessionSettlement(players,{rate:.5,chip_rate:1});
 assert.deepEqual(Object.fromEntries(rows.map(p=>[p.name,p.totalCents])),{Alan:15020,Laura:-1280,Eric:-6320,Mark:-7420});
 assert.equal(rows.reduce((sum,p)=>sum+p.totalCents,0),0);
 assert.equal(sessionSettlement(players,{rate:0,chip_rate:0})[0].totalCents,0);
 assert.equal(sessionSettlement([{name:'Host',points:48,hostChips:0}],{rate:1,chip_rate:2})[0].totalCents,4800);
 assert.equal(signedDollars(-1280),'−$12.80');assert.equal(signedDollars(0),'$0.00');
});
