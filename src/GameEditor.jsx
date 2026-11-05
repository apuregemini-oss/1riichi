import TieChoices from './TieChoices';
import {useState,useEffect} from 'react';
export default function GameEditor({game,players,onSave,onCancel,busy}) {
 const [rows,setRows]=useState(game.results.map(r=>({player_id:r.player_id,score:r.score??''})));
 const [ties,setTies]=useState(game.tie_breaks??[]);
 const signature=JSON.stringify(rows);
 const [initial]=useState(signature);
 useEffect(()=>{if(signature!==initial)setTies([]);},[signature]);
 const [host,setHost]=useState(game.host_player_id??'');
 const [winner,setWinner]=useState(game.excel_fee_winner_player_id??game.host_fee?.winner_player_id??'');
 const assigned=ties.find(t=>t.score===Math.max(...rows.map(r=>Number(r.score)))&&t.mode==='order')?.order?.[0];
 const leaders=rows.filter(r=>Number(r.score)===Math.max(...rows.map(x=>Number(x.score))));
 return <section className="game" aria-label="Edit game"><h2>Edit game</h2><form onSubmit={e=>{e.preventDefault();onSave({results:rows,tie_breaks:ties,host_player_id:host||null,winner_player_id:assigned||(leaders.length===1?leaders[0].player_id:winner),revision:game.revision});}}>
 {rows.map((row,i)=><div className="score-row" key={i}><label className="field"><span>Player</span><select required value={row.player_id} onChange={e=>setRows(rows.map((r,j)=>i===j?{...r,player_id:e.target.value}:r))}>{players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="field"><span>Ending score</span><input required type="number" min="-50000" max="400000" value={row.score} onChange={e=>setRows(rows.map((r,j)=>i===j?{...r,score:e.target.value===''?'':Number(e.target.value)}:r))}/></label></div>)}
 <label className="field"><span>Host</span><select value={host} onChange={e=>setHost(e.target.value)}><option value="">No host fee</option>{players.filter(p=>rows.some(r=>r.player_id===p.id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 <TieChoices rows={rows} players={players} value={ties} onChange={setTies}/>
 {leaders.length>1&&!assigned&&<label className="field"><span>Winner for fees when first place is shared</span><select required value={winner} onChange={e=>setWinner(e.target.value)}><option value="">Choose winner</option>{leaders.map(r=><option key={r.player_id} value={r.player_id}>{players.find(p=>p.id===r.player_id)?.name}</option>)}</select></label>}
 <p className="muted">Points and the five-chip host fee are recalculated when saved. The previous record is retained in the database audit history.</p><button className="primary" disabled={busy}>{busy?'Saving…':'Save changes'}</button> <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
 </form></section>;
}
