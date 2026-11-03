import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlayerStats, groupPlayerSessions } from './playerStats.js';
const players=[{id:'a',name:'Eric C'},{id:'b',name:'Alan'},{id:'c',name:'New player'}];
const game=(id,date,a,b,place=1)=>({id,date,results:[{player_id:'a',final_points:a,score:35000,place,place_label:'1st'},{player_id:'b',final_points:b,score:25000,place:3,place_label:'3rd'}]});

test('session overview counts only games in the selected session and excludes unseated players',()=>{
 const games=[{...game('1','2026-04-01',20,-20,1),session_id:'s'},
 {...game('2','2026-04-01',-10,10,4),session_id:'s'},
 {...game('3','2026-04-02',100,-100,1),session_id:'other'}];
 const overview=buildPlayerStats({players,sessions:[],games:games.filter(g=>g.session_id==='s')}).filter(p=>p.games>0);
 const eric=overview.find(p=>p.id==='a');
 assert.equal(overview.length,2);assert.equal(eric.points,10);assert.equal(eric.games,2);
 assert.deepEqual(eric.placementCounts,[1,0,0,1]);assert.equal(eric.averagePlacement,2.5);
 assert.equal(overview.reduce((sum,p)=>sum+p.points,0),0);
});

test('history groups by workbook session, preserves same-day separate tabs, and orders games',()=>{
 const games=[{...game('2','2026-04-02',20,-20),session_id:'s',source_game_number:2},
 {...game('other','2026-04-02',5,-5),session_id:'t',source_game_number:1},
 {...game('1','2026-04-02',-10,10),session_id:'s',source_game_number:1},
 game('old','2026-04-01',3,-3)];
 const player=buildPlayerStats({players,sessions:[{id:'s',name:'Sheet one'},{id:'t',name:'Sheet two'}],games}).find(p=>p.id==='a');
 const groups=groupPlayerSessions(player.records);
 assert.equal(groups.length,3);
 assert.equal(groups[0].name,'Sheet one');
 assert.equal(groups[0].points,10);
 assert.deepEqual(groups[0].records.map(r=>r.game.id),['1','2']);
 assert.equal(groups[1].points,5);
 assert.equal(groups[2].sessionId,undefined);
 assert.equal(groups.reduce((sum,g)=>sum+g.records.length,0),player.games);
 assert.deepEqual(player.records.map(r=>r.game.id),['2','other','1','old']);
});
test('lifetime rank includes every game and leaves unplayed players unranked',()=>{
 const stats=buildPlayerStats({players,sessions:[],games:[game('1','2026-04-01',-10,10),game('2','2026-04-02',-20,20)]});
 assert.deepEqual(stats.map(p=>[p.id,p.points,p.rank]),[['b',30,1],['a',-30,2],['c',0,null]]);
 assert.equal(stats[1].games,2);
 assert.equal(stats[2].averagePlacement,null);
});
test('equal totals share rank, ties use fractional placement, stats remain precise',()=>{
 const stats=buildPlayerStats({players,sessions:[],games:[game('1','2026-04-01',10,10,1.5),game('2','2026-04-02',20,20,4)]});
 assert.equal(stats[0].rank,1);assert.equal(stats[1].rank,1);
 const eric=stats.find(p=>p.id==='a');
 assert.equal(eric.averagePlacement,2.75);assert.equal(eric.winRate,0);assert.equal(eric.averagePoints,15);
 assert.deepEqual(eric.placementCounts,[0,0,0,1]);assert.equal(eric.tiedGames,1);
});
test('history sorts by played date, supports legacy games, and keeps host chips separate',()=>{
 const first=game('old','2026-04-01',-20,20);first.host_fee={host_player_id:'a',winner_player_id:'b',chips:5};
 const newest=game('new','2026-04-03T12:00:00Z',-10,10);newest.session_id='s';
 const data={players,sessions:[{id:'s',name:'Friday'}],games:[first,newest]};
 const eric=buildPlayerStats(data).find(p=>p.id==='a');
 assert.deepEqual(eric.records.map(r=>r.game.id),['new','old']);
 assert.equal(eric.records[0].sessionName,'Friday');assert.equal(eric.records[1].sessionName,'Earlier game');
 assert.equal(eric.hostChips,5);assert.equal(eric.points,-30);assert.equal(eric.bestPoints,-10);
 assert.deepEqual(eric.placementCounts,[2,0,0,0]);assert.equal(eric.tiedGames,0);
 assert.equal(data.games[0].id,'old');
});
test('updated dataset immediately changes rankings',()=>{
 const data={players,sessions:[],games:[game('old','2026-04-01',10,-10)]};
 assert.equal(buildPlayerStats(data)[0].id,'a');
 data.games.push(game('new','2026-04-02',-50,50));
 assert.equal(buildPlayerStats(data)[0].id,'b');
});
test('imported points-only records preserve points and do not invent raw scores',()=>{
 const imported=game('imported','2026-10-25',64.8,-64.8);
 imported.results.forEach(r=>r.score=null);
 const stats=buildPlayerStats({players,sessions:[],games:[imported]});
 assert.equal(stats[0].points,64.8);assert.equal(stats[0].bestScore,null);assert.equal(stats[0].games,1);
});
