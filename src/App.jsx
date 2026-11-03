import OwnerLogin from './OwnerLogin';
import GameEditor from './GameEditor';
import { useEffect, useState } from 'react';
import { buildPlayerStats, gameTime } from './playerStats';
import { Leaderboard, PlayerProfile, SessionOverview } from './Players';

const defaultRules = { starting_points: 25000, target_points: 30000, starting_chips: 10, uma: [30,10,-10,-30], rate: .5, chip_rate: 1 };
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const signed = n => `${n > 0 ? '+' : ''}${Number(n.toFixed(2))}`;
function Field({label, ...props}) { return <label className="field"><span>{label}</span><input {...props}/></label>; }
function SessionCard({session, data, onOpen}) {
  const [expanded,setExpanded] = useState(false);
  const games = data.games.filter(g=>g.session_id===session.id);
  return <details className="session-expand" onToggle={e=>setExpanded(e.currentTarget.open)}>
    <summary className="session-card"><span><strong>{session.name}</strong><small>{new Date(gameTime(session.created_at)).toLocaleDateString()} · {games.length} games</small></span><span className="session-chevron" aria-hidden="true">▸</span></summary>
    {expanded && <div className="session-card-body">
      <SessionOverview players={buildPlayerStats({...data,games}).filter(p=>p.games>0)}/>
      <button className="primary" onClick={onOpen}>View all games →</button>
    </div>}
  </details>;
}
let apiMode='cloudflare', bootstrapCache=null, bootstrapEtag=null;
async function api(path, body, method='POST') {
  const response = await fetch(`/api/${body&&apiMode!=='local'?'admin/':''}${path}`, body ? {method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} : {headers:path==='bootstrap'&&bootstrapEtag?{'If-None-Match':bootstrapEtag}:{}});
  if(response.status===304&&bootstrapCache)return bootstrapCache;
  const data = await response.json();
  if (!response.ok) throw new Error(Array.isArray(data.detail) ? data.detail.map(e=>e.msg).join(' ') : data.detail || 'Unable to save. Try again.');
  if(path==='bootstrap'){bootstrapCache=data;bootstrapEtag=response.headers.get('ETag');}
  return data;
}
export default function App() {
  const [auth,setAuth]=useState({can_edit:false});
  const [editing,setEditing]=useState(null);
  useEffect(()=>{api('auth').then(value=>{apiMode=value.mode;setAuth(value);}).catch(()=>{});},[]);
  const [page,setPage] = useState(location.hash.slice(1) || 'home');
  const [data,setData] = useState({players:[],sessions:[],games:[]});
  const [loading,setLoading] = useState(true), [error,setError] = useState(''), [busy,setBusy] = useState(false);
  const [dark,setDark] = useState(()=>read('ledger-dark',false));
  const [form,setForm] = useState({name:'',...defaultRules});
  const [custom,setCustom] = useState(false);
  const [name,setName] = useState(''), [search,setSearch] = useState('');
  const [rows,setRows] = useState(Array.from({length:4},()=>({player_id:'',score:25000})));
  const [notice,setNotice] = useState('');
  const [updatedAt,setUpdatedAt] = useState(null);
  const [liveError,setLiveError] = useState('');
  const [hostChoice,setHostChoice] = useState('auto');
  const [feeWinner,setFeeWinner] = useState('');
  useEffect(()=>{setHostChoice('auto');setFeeWinner('');setEditing(null);},[page]);
  const go = next => { setError(''); setNotice(''); setSearch(''); location.hash=next; setPage(next); };
  async function refresh() {
    setLoading(true);
    try { setData(await api('bootstrap')); setUpdatedAt(new Date()); setError(''); }
    catch { setError('Cannot reach the ledger. Check that the backend is running, then retry.'); }
    finally { setLoading(false); }
  }
  useEffect(()=>{ refresh(); const handler=()=>{setPage(location.hash.slice(1)||'home');setError('');}; window.addEventListener('hashchange',handler);return()=>window.removeEventListener('hashchange',handler); },[]);
  useEffect(()=>{ document.documentElement.dataset.theme=dark?'dark':'light'; try { localStorage.setItem('ledger-dark',JSON.stringify(dark)); } catch {} },[dark]);
  async function save(action) { setBusy(true); setError(''); try {await action();} catch(e) {setError(e.message);} finally {setBusy(false);} }
  // Refresh stats in open profile tabs after games are saved elsewhere.
  useEffect(()=>{
    if (page!=='players' && !page.startsWith('player/')) return;
    let active=true, pending=false;
    const sync=async()=>{
      if (pending || document.hidden) return;
      pending=true;
      try {
        const payload=await api('bootstrap');
        if(active){setData(payload);setUpdatedAt(new Date());setLiveError('');setError('');}
      } catch { if(active)setLiveError('Live updates paused. Showing the last loaded results; retrying automatically.'); }
      finally {pending=false;}
    };
    sync();
    const timer=setInterval(sync,10000);
    window.addEventListener('focus',sync);
    document.addEventListener('visibilitychange',sync);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',sync);document.removeEventListener('visibilitychange',sync);};
  },[page]);
  const rankedPlayers = buildPlayerStats(data);
  const profile = rankedPlayers.find(p=>page===`player/${p.id}`);
  useEffect(()=>{document.title=profile ? `${profile.name} · Riichi Night` : 'Riichi Night Ledger';},[profile?.name]);
  const session = data.sessions.find(s=>page===`session/${s.id}`);
  const update = (key,value) => {setForm(f=>({...f,[key]:value}));};
  const playerName = id => data.players.find(p=>p.id===id)?.name || 'Unknown player';
  const games = session ? data.games.filter(g=>g.session_id===session.id) : data.games;
  const sessionPlayers = session ? buildPlayerStats({...data,games}).filter(p=>p.games>0) : [];
  const seatedPlayers = data.players.filter(p=>rows.some(r=>r.player_id===p.id));
  const defaultHost = seatedPlayers.find(p=>p.name.trim().toLowerCase()==='eric c')?.id || '';
  const hostId = hostChoice==='auto' ? defaultHost : seatedPlayers.some(p=>p.id===hostChoice) ? hostChoice : '';
  const topScore = Math.max(...rows.map(r=>Number(r.score)));
  const leaders = seatedPlayers.filter(p=>rows.some(r=>r.player_id===p.id && Number(r.score)===topScore));
  const winnerId = leaders.length===1 ? leaders[0].id : leaders.some(p=>p.id===feeWinner) ? feeWinner : '';
  const hostFeeTotals = {};
  for (const game of games) {
    if (!game.host_fee) continue;
    const {host_player_id, winner_player_id, chips:fee} = game.host_fee;
    hostFeeTotals[host_player_id] = (hostFeeTotals[host_player_id] || 0) + fee;
    hostFeeTotals[winner_player_id] = (hostFeeTotals[winner_player_id] || 0) - fee;
  }
  function feeDescription(game) {
    if (!game.host_fee) return 'No host fee';
    const fee = game.host_fee;
    return fee.chips ? `${playerName(fee.winner_player_id)} → ${playerName(fee.host_player_id)}: ${fee.chips} chips` : `${playerName(fee.host_player_id)} won as host — no chip transfer`;
  }
  function history(items) { return items.map(g=><article className="game" key={g.id}><div className="row"><strong>{new Date(gameTime(g.date)).toLocaleDateString()}</strong><span className="muted">{g.source_game_number ? `Game ${g.source_game_number}` : g.session_id ? 'Session game' : 'Earlier game'}</span></div>{auth.can_edit&&auth.mode!=='local'&&<button onClick={()=>setEditing(g)}>Edit game</button>}<div className="table-wrap"><table><thead><tr><th>Player</th><th>Score</th><th>Place</th><th>Points</th></tr></thead><tbody>{g.results.map(r=><tr key={r.player_id}><td>{playerName(r.player_id)}</td><td>{r.score?.toLocaleString() ?? 'Not recorded'}</td><td>{r.place_label}</td><td className={r.final_points>=0?'positive':'negative'}>{signed(r.final_points)}</td></tr>)}</tbody></table></div>{g.result_type==='final_points' && <p className="footnote">{g.points_standardization ? g.notes : <>Imported final points. Restored {g.source?.deduction_restored ?? 10} winner points; raw table scores were not recorded.</>}</p>}{g.host_player_id && <p className="host-fee-receipt"><strong>Host fee</strong><span>{feeDescription(g)}</span></p>}</article>); }
  return <div className="shell"><header><a className="brand" href="#home" onClick={()=>go('home')}><span aria-hidden="true">🀄</span> Riichi Night <span aria-hidden="true">🌙</span></a><p className="tagline">Good company. Every game counted.</p><p className="footnote">{auth.can_edit ? <>Owner mode {auth.mode!=='local'&&<button onClick={async()=>{if(auth.mode==='cloudflare'){location.href='/cdn-cgi/access/logout';return;}await fetch('/api/logout',{method:'POST'});setAuth({...auth,can_edit:false});setEditing(null);go('home');}}>Sign out</button>}</> : <a href={auth.login_url||'/#login'}>Owner sign in</a>}</p></header>
    {page!=='home' && <nav className="top-nav" aria-label="Primary">{[['new','New Session'],['sessions','Sessions'],['players','Players']].filter(([key])=>key!=='new'||auth.can_create).map(([key,label])=><a key={key} href={`#${key}`} aria-current={page===key||(key==='players'&&page.startsWith('player/'))?'page':undefined} onClick={()=>go(key)}>{label}</a>)}</nav>}
    <main className={page==='home'?'panel home-panel':'panel'}>
      {error && <div role="alert" className="error">{error} <button onClick={refresh}>Retry connection</button></div>}
      {editing&&auth.can_edit&&<GameEditor key={editing.id} game={editing} players={data.players} busy={busy} onCancel={()=>setEditing(null)} onSave={body=>save(async()=>{await api(`games/${editing.id}`,body,'PUT');setEditing(null);await refresh();setNotice('Game updated.');})}/>}
      {page==='login'&&<OwnerLogin onLogin={async()=>{const value=await api('auth');apiMode=value.mode;setAuth(value);go('sessions');}}/>}
      {notice && <p role="status" className="notice">{notice}</p>}
      {page==='home' && <><div className="greeting">Hello, table friends! <span>✦</span></div><nav className="menu" aria-label="Main menu">{[['new','New Session','A fresh night at the table','🀄'],['sessions','Sessions','Pick up where you left off','↗'],['players','Players','Rankings, records & rivalries','♧']].filter(([key])=>key!=='new'||auth.can_create).map(([key,title,sub,icon])=><a className={`menu-card ${key==='new'?'featured':''}`} href={`#${key}`} key={key} onClick={()=>go(key)}><span className="menu-icon" aria-hidden="true">{icon}</span><span><strong>{title}</strong><small>{sub}</small></span><span aria-hidden="true">→</span></a>)}</nav><button className="theme-button" onClick={()=>setDark(!dark)}>{dark?'Light Mode ☀':'Dark Mode ☾'}</button><p className="footnote">{loading?'Loading your table…':`${data.sessions.length} sessions · ${data.games.length} games · ${data.players.length} players`}</p></>}
      {page==='new'&&!auth.can_create&&<p role="status">Connecting to the ledger…</p>}
      {page==='new' && auth.can_create && <><div className="eyebrow">LET’S PLAY</div><h1>New Session</h1><p className="muted">Set the house rules, then gather your four.</p><fieldset className="rate-picker"><legend>How much is 1,000 points?</legend><div className="rate-options" role="group" aria-label="Dollars per 1,000 points">{[0.3,0.5,1].map(rate=><button key={rate} type="button" aria-pressed={form.rate===rate} className={form.rate===rate?'selected':''} onClick={()=>update('rate',rate)}>${rate.toFixed(2)}</button>)}</div><Field label="Amount in dollars per 1,000 points" form="new-session" type="number" min="0" max="1000" step="0.01" required value={form.rate} onChange={e=>update('rate',e.target.value===''?'':Number(e.target.value))}/><p className="muted">Choose an amount or enter your own. Default: $0.50.</p></fieldset><div className="preset-info"><span>{Number(form.starting_points).toLocaleString()} → {Number(form.target_points).toLocaleString()} points</span><span>Uma {form.uma.join(' / ')}</span><span>{form.starting_chips} chips · ${form.rate} / 1,000 points · ${form.chip_rate} / chip</span></div>
        <form id="new-session" onSubmit={e=>{e.preventDefault();save(async()=>{const created=await api('sessions',form);await refresh();setRows(Array.from({length:4},()=>({player_id:'',score:created.starting_points})));go(`session/${created.id}`);});}}><Field label="Session Name" placeholder="e.g. Friday at home" required maxLength={80} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/><label className="toggle"><input type="checkbox" checked={custom} onChange={e=>setCustom(e.target.checked)}/> Custom Options</label>{custom && <div className="form-grid">{[['starting_points','Starting Points',1000,100000],['target_points','Target Points',1000,100000],['starting_chips','Starting Chips',0,10000],['chip_rate','Dollars per chip',0,1000]].map(([key,label,min,max])=><Field key={key} label={label} type="number" min={min} max={max} step={key.includes('rate')?'.01':'1'} required value={form[key]} onChange={e=>update(key,e.target.value===''?'':Number(e.target.value))}/>)}<Field label="Oka (calculated)" readOnly value={(form.target_points-form.starting_points)*4/1000}/>{form.uma.map((n,i)=><Field key={i} label={`${['1st','2nd','3rd','4th'][i]} Place Uma`} type="number" step=".1" required value={n} onChange={e=>update('uma',form.uma.map((v,j)=>i===j?(e.target.value===''?'':Number(e.target.value)):v))}/>)}</div>}<p className="footnote">Saved to this ledger’s backend. Rates are recorded as house rules.</p><button className="primary" disabled={busy||loading}>{busy?'Saving…':'Create Session →'}</button></form></>}
      {(page==='players' || page.startsWith('player/')) && <p className="live-status" role="status">{liveError || (updatedAt ? `Live · updates every 10 seconds · last updated ${updatedAt.toLocaleTimeString()}` : 'Loading player results…')}</p>}
      {page==='players' && <><div className="eyebrow">THE STANDINGS</div><h1>Players</h1><h2>Lifetime leaderboard <span className="badge">{data.players.length}</span></h2><Field label="Find a player" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search names…"/>{loading&&!updatedAt ? <p role="status">Loading rankings…</p> : <Leaderboard players={rankedPlayers} search={search}/>}{auth.can_edit&&<details className="registration"><summary>+ Register a player</summary><form className="inline-form" onSubmit={e=>{e.preventDefault();save(async()=>{await api('players',{name});setName('');await refresh();setNotice('Player registered.');});}}><Field label="Player Name" placeholder="A unique name or handle" required maxLength={32} value={name} onChange={e=>setName(e.target.value)}/><button className="primary" disabled={busy||loading}>Register</button></form></details>}</>}
      {profile && <PlayerProfile key={profile.id} player={profile} data={data}/>}
      {page==='sessions' && <><div className="row"><h1>Sessions</h1>{auth.can_create&&<button className="primary" onClick={()=>go('new')}>+ New</button>}</div><Field label="Find a session" type="search" placeholder="Search sessions…" value={search} onChange={e=>setSearch(e.target.value)}/>{loading?<p role="status">Loading sessions…</p>:data.sessions.filter(s=>s.name.toLowerCase().includes(search.toLowerCase())).map(s=><SessionCard key={s.id} session={s} data={data} onOpen={()=>{setRows(Array.from({length:4},()=>({player_id:"",score:s.starting_points})));go(`session/${s.id}`);}}/>)}{!loading&&!data.sessions.some(s=>s.name.toLowerCase().includes(search.toLowerCase()))&&<p className="empty">{search?'No matching sessions.':'Your next game night starts here. Create a session to begin.'}</p>}{data.games.some(g=>!g.session_id)&&<><h2>Earlier games</h2>{history(data.games.filter(g=>!g.session_id))}</>}</>}
      {session && <><div className="eyebrow">AT THE TABLE</div><h1>{session.name}</h1><SessionOverview players={sessionPlayers}/>{session.imported_only && <p className="muted">{session.source?.chippirats_session_id ? 'Imported from Chippirats · 30/10 uma · 20 oka · $0.50 per 1,000 points. Raw scores retained; host fees tracked separately.' : 'Imported historical results · 30/10 uma · 20 oka · $0.50 per 1,000 points. Winner deductions restored; host fees tracked separately. Ending scores reconstructed where source points reconcile.'}</p>}{auth.can_create && !session.imported_only && <><p className="muted">{session.starting_points.toLocaleString()} starting · {session.target_points.toLocaleString()} target · Uma {session.uma.join(' / ')}</p><h2>Record a game</h2><form onSubmit={e=>{e.preventDefault();save(async()=>{const saved=await api(`sessions/${session.id}/games`,{results:rows,host_player_id:hostId||null,winner_player_id:hostId?(winnerId||null):null});await refresh();setNotice(`Game saved. ${feeDescription(saved)}.`);setFeeWinner('');setRows(rows.map(r=>({...r,score:session.starting_points})));});}}>{rows.map((r,i)=><div className="score-row" key={i}><label className="field"><span>{['East','South','West','North'][i]} player</span><select required value={r.player_id} onChange={e=>setRows(rows.map((v,j)=>i===j?{...v,player_id:e.target.value}:v))}><option value="">Choose player</option>{data.players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><Field label="Final score" type="number" min="-50000" max="150000" required value={r.score} onChange={e=>setRows(rows.map((v,j)=>i===j?{...v,score:e.target.value===''?'':Number(e.target.value)}:v))}/></div>)}<p className={rows.reduce((n,r)=>n+Number(r.score),0)===session.starting_points*4?'positive':'negative'}>Total: {rows.reduce((n,r)=>n+Number(r.score),0).toLocaleString()} / {(session.starting_points*4).toLocaleString()}</p><fieldset className="host-fee-options"><legend>Host fee</legend><label className="field"><span>Host player</span><select value={hostChoice==='auto'?'auto':hostId} onChange={e=>{setHostChoice(e.target.value);setFeeWinner('');}}><option value="auto">Auto: Eric C when playing</option><option value="">No host fee</option>{seatedPlayers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><p className="muted">The winner gives the host 5 chips after each game. If the host wins, no chips change hands.</p>{hostId ? <><p className="muted">Host: <strong>{playerName(hostId)}</strong></p>{leaders.length>1 && <label className="field"><span>Winner for host fee (tied top score)</span><select required value={winnerId} onChange={e=>setFeeWinner(e.target.value)}><option value="">Choose the winner</option>{leaders.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><small className="muted">Select your table’s tie-break winner. Shared mahjong points stay unchanged.</small></label>}{winnerId && <p className="fee-preview" role="status">{winnerId===hostId?'Host wins: no chip transfer.':`${playerName(winnerId)} −5 chips · ${playerName(hostId)} +5 chips`}</p>}</> : <p className="muted">{hostChoice==='auto'?'Select Eric C as a player to enable the default host fee, or choose another seated host.':'No host fee for this game.'}</p>}</fieldset><button className="primary" disabled={busy}>{busy?'Saving…':'Save Game'}</button></form></>}{Object.keys(hostFeeTotals).length>0 && <section className="host-totals"><h2>Host-fee chip totals</h2><p className="muted">Net chip changes across this session’s saved games.</p>{Object.entries(hostFeeTotals).map(([id,total])=><div className="row" key={id}><span>{playerName(id)}</span><strong className={total>=0?'positive':'negative'}>{signed(total)} chips</strong></div>)}</section>}<h2>Game history <span className="badge">{games.length}</span></h2>{games.length?history(games):<p className="empty">No games yet. Record the first result above.</p>}</>}
      {!['home','new','sessions','players','login'].includes(page)&&!session&&!profile&&!loading&&<><h1>{page.startsWith('player/')?'Player not found':'Page not found'}</h1><button onClick={()=>go('players')}>View players</button></>}
    </main><footer>RIICHI NIGHT LEDGER <span>✦</span> MADE FOR YOUR TABLE</footer></div>;
}
