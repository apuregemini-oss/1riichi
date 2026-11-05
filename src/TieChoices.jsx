export function tiedGroups(rows){
 if(rows.some(r=>!r.player_id||r.score==='')||new Set(rows.map(r=>r.player_id)).size!==4)return [];
 return [...new Set(rows.map(r=>Number(r.score)))].sort((a,b)=>b-a).map(score=>({score,players:rows.filter(r=>Number(r.score)===score),first:rows.filter(r=>Number(r.score)>score).length+1})).filter(g=>g.players.length>1);
}
export default function TieChoices({rows,players,value,onChange}){
 const groups=tiedGroups(rows);
 if(!groups.length)return null;
 const name=id=>players.find(p=>p.id===id)?.name??id;
 const update=(score,choice)=>onChange([...value.filter(t=>t.score!==score),{score,...choice}]);
 return <fieldset className="host-fee-options"><legend>Tied scores: choose how to place players</legend>{groups.map(g=>{
  const choice=value.find(t=>t.score===g.score)??{};
  return <section key={g.score}><p>{g.players.map(r=>name(r.player_id)).join(' / ')} — {g.score.toLocaleString()} points</p>
   <label className="field"><span>Tie resolution</span><select required value={choice.mode??''} onChange={e=>update(g.score,{mode:e.target.value,order:[]})}><option value="">Choose placements or split uma</option><option value="order">Assign individual placements</option><option value="split">Split uma equally</option></select></label>
   {choice.mode==='split'&&<p className="muted">Share places {g.first}–{g.first+g.players.length-1} and average their bonuses, including oka when first place is tied.</p>}
   {choice.mode==='order'&&g.players.map((_,i)=><label className="field" key={i}><span>Placement {g.first+i}</span><select required value={choice.order?.[i]??''} onChange={e=>{const order=[...(choice.order??[])];order[i]=e.target.value;update(g.score,{mode:'order',order});}}><option value="">Choose player</option>{g.players.map(r=><option disabled={choice.order?.some((id,j)=>j!==i&&id===r.player_id)} key={r.player_id} value={r.player_id}>{name(r.player_id)}</option>)}</select></label>)}
  </section>;
 })}</fieldset>;
}
