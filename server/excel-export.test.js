import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionWorksheet} from './excel-export.js';
const players=['Alan','Kakizaki','Justin','Eric C'].map((name,i)=>({id:String(i),name}));
const session={id:'test-session',name:'Friday',rate:.5};
const game={id:'game',date:'2026-11-03T02:00:00Z',results:players.map((p,i)=>({player_id:p.id,place:i+1,final_points:[60,10,-20,-50][i]}))};
test('Excel exports the existing layout with ten deducted exactly once from the winner',()=>{
 const before=JSON.stringify(game);const sheet=sessionWorksheet(session,[game],players);
 assert.equal(sheet.date,'2026-11-02');assert.equal(sheet.values[7][12],'Eric C');
 assert.deepEqual([3,6,9,12].map(c=>sheet.values[11][c]),[50,10,-20,-50]);
 assert.equal(sheet.values[11][16],10);assert.equal(sheet.formulas[11][18],'=-Q12-(D12+G12+J12+M12)');
 assert.equal(sheet.formulas[8][19],'=M9+Q9');assert.equal(JSON.stringify(game),before);
 assert.deepEqual(sessionWorksheet(session,[game],players),sheet);
});
test('Excel still deducts ten when the host wins, while website points stay intact',()=>{
 const hostWin={...game,results:game.results.map((r,i)=>({...r,place:4-i,final_points:[-50,-20,10,60][i]})),host_fee:{winner_player_id:'3',host_player_id:'3',chips:0}};
 const sheet=sessionWorksheet(session,[hostWin],players);assert.equal(sheet.values[11][12],50);assert.equal(sheet.values[11][16],10);
});
test('empty sessions and unresolved top ties cannot export',()=>{
 assert.throws(()=>sessionWorksheet(session,[],players),/at least one game/);
 assert.throws(()=>sessionWorksheet(session,[{...game,results:game.results.map((r,i)=>({...r,place:i<2?1.5:i+1}))}],players),/tie-break/);
});

test('the host total credits the recorded host when Eric is not hosting',()=>{
 const sheet=sessionWorksheet(session,[{...game,host_player_id:'1'}],players);
 assert.equal(sheet.formulas[8][19],'=G9+Q9');
 assert.equal(sheet.values[7][12],'Eric C');
});
