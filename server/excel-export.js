// Build Excel range values/formulas using the historical workbook's layout.
// No ledger points are modified: the ten-point deduction exists only in Excel.
export function columnName(index){let result='';for(let n=index+1;n;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;return result;}
export function sessionWorksheet(session,games,players){
 if(!games.length)throw Error('Record at least one game before finishing the session.');
 const ordered=[...games].sort((a,b)=>a.date.localeCompare(b.date)||(a.source_game_number??0)-(b.source_game_number??0)||a.id.localeCompare(b.id));
 const ids=[...new Set(ordered.flatMap(g=>g.results.map(r=>r.player_id)))];
 const names=new Map(players.map(p=>[p.id,p.name]));
 if(ids.some(id=>!names.has(id)))throw Error('A player name is missing.');
 // Eric occupies the last player column, matching the existing host total.
 ids.sort((a,b)=>(names.get(a)==='Eric C')-(names.get(b)==='Eric C'));
 const feeColumn=4+ids.length*3,checkColumn=feeColumn+2,hostColumn=feeColumn+3;
 const endRow=Math.max(50,11+ordered.length*2);
 const values=Array.from({length:endRow},()=>Array(hostColumn+1).fill(''));
 const formulas=Array.from({length:endRow},()=>Array(hostColumn+1).fill(null));
 const put=(row,col,value)=>{values[row-1][col]=value;};
 const formula=(row,col,value)=>{formulas[row-1][col]='='+value;};
 const scoreColumns=ids.map((_,i)=>columnName(3+i*3));
 const fee=columnName(feeColumn),check=columnName(checkColumn),host=columnName(hostColumn);
 put(1,1,'Winner points include uma/oka, less 10 points per game for the fee.');
 put(2,1,'Website lifetime points remain before this deduction.');
 put(3,1,session.name);
 const played=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ordered[0].date));
 const day=played.match(/\d{4}-\d{2}-\d{2}/)?.[0];
 if(!day)throw Error('Invalid session date.');
 put(7,3+(ids.length-1)*3,(Date.parse(day+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000);
 put(8,feeColumn,'場');put(8,checkColumn,'Check');put(8,hostColumn,'Host合計');put(9,1,'計');put(10,1,'金');
 for(const [i,id] of ids.entries()){
  const col=3+i*3,c=scoreColumns[i];put(8,col,names.get(id));formula(9,col,`SUM(${c}12:${c}${endRow})`);formula(10,col,`${c}9*${session.rate??0.5}`);
 }
 formula(9,feeColumn,`SUM(${fee}12:${fee}${endRow})`);formula(10,feeColumn,`${fee}9*${session.rate??0.5}`);
 formula(9,checkColumn,`${scoreColumns.map(c=>c+'9').join('+')}+${fee}9`);formula(10,checkColumn,`${check}9*${session.rate??0.5}`);
 const eric=ids.findIndex(id=>names.get(id)==='Eric C');
 if(eric>=0){formula(9,hostColumn,`${scoreColumns[eric]}9+${fee}9`);formula(10,hostColumn,`${host}9*${session.rate??0.5}`);}
 for(const [i,game] of ordered.entries()){
  if(game.results.length!==4||game.results.some(r=>!Number.isFinite(r.final_points)))throw Error('A game has invalid final points.');
  if(Math.abs(game.results.reduce((n,r)=>n+r.final_points,0))>0.11)throw Error('Game points do not balance.');
  const place=Math.min(...game.results.map(r=>r.place));
  const top=game.results.filter(r=>r.place===place);
  const winner=top.length===1?top[0].player_id:game.host_fee?.winner_player_id;
  if(!top.some(r=>r.player_id===winner))throw Error('Choose a tie-break winner before exporting this game.');
  const row=12+i*2;put(row,1,i+1);put(row,feeColumn,10);
  for(const [j,id] of ids.entries()){
   const result=game.results.find(r=>r.player_id===id);
   if(result)put(row,3+j*3,Math.round((result.final_points-(id===winner?10:0))*10)/10);
   const running=columnName(5+j*3),score=scoreColumns[j];formula(row+1,5+j*3,`${i?running+(row-1)+'+':''}${score}${row}`);
  }
  formula(row,checkColumn,`-${fee}${row}-(${scoreColumns.map(c=>c+row).join('+')})`);
 }
 // Stable session marker and name allow retries without duplicate worksheets.
 const marker=`1riichi:${session.id}`;put(5,1,marker);
 const title=`${day.slice(5)} ${session.id.replace(/-/g,'').slice(0,8)}`;
 return {name:title,marker,date:day,range:`A1:${host}${endRow}`,values,formulas,playerCount:ids.length,gameCount:ordered.length};
}
