export class InputError extends Error { constructor(message,status=400){super(message);this.status=status;} }
export function requireValue(condition,message,status=400){if(!condition)throw new InputError(message,status);}
export function calculateResults(raw,scoring,tieBreaks=[]){
 const ordered=[...raw].sort((a,b)=>b.score-a.score || a.player_id.localeCompare(b.player_id));
 return ordered.map(row=>{
  const higher=ordered.filter(r=>r.score>row.score).length;
  const tied=ordered.filter(r=>r.score===row.score).length;
  const decision=tieBreaks.find(t=>t.score===row.score);
  const places=decision?.mode==='order'?[higher+decision.order.indexOf(row.player_id)+1]:Array.from({length:tied},(_,i)=>higher+i+1);
  const bonus=places.reduce((sum,p)=>sum+scoring.uma[p-1],0)/places.length;
  const labels=['1st','2nd','3rd','4th'];
  return {...row,place:places.reduce((a,b)=>a+b,0)/places.length,place_label:places.length===1?labels[places[0]-1]:`${labels[higher]}-${labels[higher+tied-1]}`,uma:Math.round(bonus*10)/10,final_points:Math.round(((row.score-scoring.returning_score)/1000+bonus)*10)/10};
 });
}
export function validateSession(body){
 const value={name:body.name?.trim(),starting_points:body.starting_points??25000,target_points:body.target_points??30000,starting_chips:body.starting_chips??10,uma:body.uma??[30,10,-10,-30],rate:body.rate??.5,chip_rate:body.chip_rate??1};
 requireValue(typeof value.name==='string'&&value.name.length>0&&value.name.length<=80,'Enter a session name (up to 80 characters).');
 for(const key of ['starting_points','target_points'])requireValue(Number.isInteger(value[key])&&value[key]>=1000&&value[key]<=100000,'Invalid starting/target points.');
 requireValue(Number.isInteger(value.starting_chips)&&value.starting_chips>=0&&value.starting_chips<=10000,'Invalid starting chips.');
 requireValue(Array.isArray(value.uma)&&value.uma.length===4&&value.uma.every(x=>Number.isFinite(x)&&Math.abs(x)<=10000)&&Math.abs(value.uma.reduce((a,b)=>a+b,0))<1e-8,'Uma must have four finite values totaling zero.');
 for(const key of ['rate','chip_rate'])requireValue(Number.isFinite(value[key])&&value[key]>=0&&value[key]<=1000,'Invalid rate.');
 return value;
}
export function makeGame(body,session,playerIds,previous=null){
 requireValue(Array.isArray(body.results)&&body.results.length===4,'Choose four players.');
 const raw=body.results.map(r=>({player_id:r.player_id,score:r.score}));
 requireValue(new Set(raw.map(r=>r.player_id)).size===4,'Choose four different players.');
 requireValue(raw.every(r=>playerIds.has(r.player_id)&&Number.isInteger(r.score)&&r.score>=-50000&&r.score<=400000),'Invalid player or score.');
 const starting=session?.starting_points??25000;
 requireValue(raw.reduce((sum,r)=>sum+r.score,0)===starting*4,`Scores must total ${starting*4}.`);
 const scoring=session?{returning_score:session.target_points,uma:session.uma.map((v,i)=>v+(i===0?(session.target_points-starting)*4/1000:0))}:previous?.scoring??{returning_score:30000,uma:[50,10,-10,-30]};
 const tieBreaks=body.tie_breaks??[];
 requireValue(Array.isArray(tieBreaks)&&tieBreaks.every(t=>t&&Number.isFinite(t.score)&&['split','order'].includes(t.mode)),'Invalid tie choices.');
 for(const score of new Set(raw.map(r=>r.score))){
  const tied=raw.filter(r=>r.score===score);if(tied.length<2)continue;
  const choice=tieBreaks.filter(t=>t?.score===score);
  requireValue(choice.length===1&&['split','order'].includes(choice[0].mode),'Choose placements or split uma for each tied score.');
  if(choice[0].mode==='order')requireValue(Array.isArray(choice[0].order)&&choice[0].order.length===tied.length&&new Set(choice[0].order).size===tied.length&&tied.every(r=>choice[0].order.includes(r.player_id)),'Assign each tied player a different placement.');
 }
 const results=calculateResults(raw,scoring,tieBreaks);
 const host=body.host_player_id||null;
 const leaders=results.filter(r=>r.place===Math.min(...results.map(v=>v.place)));
 requireValue(!host||raw.some(r=>r.player_id===host),'Host must be seated.');
 const winner=leaders.length===1?leaders[0].player_id:body.winner_player_id;
 requireValue(leaders.some(r=>r.player_id===winner),'Choose the winner for fees when first place is shared.');
 const game={...previous,id:previous?.id??crypto.randomUUID(),session_id:previous?.session_id??session?.id,date:previous?.date??new Date().toISOString(),scoring,results,
 tie_breaks:tieBreaks,excel_fee_winner_player_id:winner,host_player_id:host,host_fee:host?{host_player_id:host,winner_player_id:winner,chips:winner===host?0:5}:null};
 if(previous){delete game.result_type;delete game.score_reconstructed;game.notes='Scores updated by the owner.';game.updated_at=new Date().toISOString();}
 return game;
}
