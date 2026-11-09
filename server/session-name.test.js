import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionListName} from '../src/sessionName.js';
test('session labels use the played Chicago date and omit Eric as host',()=>{
 const players=[{id:'e',name:'Eric C'},{id:'l',name:'Laura'}];
 const session={id:'s',name:'Laura1107',created_at:'2026-11-06T01:04:20Z'};
 const games=[{session_id:'s',date:'2026-11-06T01:05:56Z',host_player_id:'l'}];
 assert.equal(sessionListName(session,games,players),'2026-11-05 Laura');
 assert.equal(sessionListName({...session,host_player_id:'e'},games,players),'2026-11-05');
 assert.equal(sessionListName({...session,created_at:'2024-01-07'},[],players),'2024-01-07');
 assert.equal(sessionListName(session,[{...games[0],host_player_id:undefined,host_fee:{host_player_id:'l'}}],players),'2026-11-05 Laura');
});
