import { useState, useId } from 'react';
import { gameTime, signedPoints, groupPlayerSessions } from './playerStats';
const dateLabel = date => new Date(gameTime(date)).toLocaleDateString();
export function SessionOverview({players}) {
  const headingId = useId();
  return <section className="session-overview" aria-labelledby={headingId}>
    <h2 id={headingId}>Session overview</h2>
    <p className="muted">Placement counts are 1st–2nd–3rd–4th. Total points include uma and oka; host fees are separate.</p>
    {players.length ? <div className="table-wrap"><table><thead><tr><th>Player</th><th>Games</th><th>1st–2nd–3rd–4th</th><th>Avg. place</th><th>Total points</th></tr></thead>
      <tbody>{players.map(p=><tr key={p.id}>
        <td><a href={`#player/${p.id}`}>{p.name}</a></td><td>{p.games}</td>
        <td className="placement-counts">{p.placementCounts.join('-')}{p.tiedGames>0 && <small>+ {p.tiedGames} tied</small>}</td>
        <td>{p.averagePlacement.toFixed(2)}</td>
        <td className={p.points>0?'positive':p.points<0?'negative':''}><strong>{signedPoints(p.points)}</strong></td>
      </tr>)}</tbody></table></div> : <p className="empty">Record a game to see this session’s overview.</p>}
  </section>;
}
export function Leaderboard({players, search}) {
  const visible = players.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  return <><p className="muted">Ranked by lifetime mahjong points, including uma and oka. Equal totals share a rank. Player profiles open in a new tab.</p>
    <div className="table-wrap"><table className="leaderboard"><thead><tr><th>Rank / player</th><th>Points</th><th>Games</th><th>1st / 2nd / 3rd / 4th</th><th>Avg. place</th></tr></thead><tbody>{visible.map(p => <tr key={p.id}><td><a href={`#player/${p.id}`} target="_blank" rel="noopener noreferrer" className="profile-link" aria-label={`${p.name} — player profile (opens in new tab)`}><span className={`rank ${p.rank===1?'first':''}`}>{p.rank ?? '—'}</span><span>{p.name} <span aria-hidden="true">↗</span></span></a></td><td className={p.points>=0?'positive':'negative'}><strong>{signedPoints(p.points)}</strong></td><td>{p.games}</td><td className="placement-counts">{p.placementCounts.join("-")}<small>{p.placementCounts.map(count=>`${p.games ? (count/p.games*100).toFixed(1) : "0.0"}%`).join(" - ")}</small>{p.tiedGames>0 && <small> + {p.tiedGames} tied</small>}</td><td>{p.averagePlacement?.toFixed(2) ?? '—'}</td></tr>)}</tbody></table></div>
    {!visible.length && <p className="empty">{search?'No matching players.':'Register your first player to get started.'}</p>}
    {visible.some(p=>!p.games) && <p className="footnote">Players without recorded games are unranked.</p>}</>;
}
function RecentTrend({records}) {
  const recent = records.slice(0,20);
  if (!recent.length) return <p className="empty">Your trend starts with your first recorded game.</p>;
  const width = Math.max(540, recent.length * 58 + 80);
  const x = i => recent.length === 1 ? width/2 : 55+i*(width-90)/(recent.length-1);
  const y = place => 30+(place-1)*48;
  return <><p className="muted">Placement · last {recent.length} games · newest to oldest. Dot labels show points.</p>
    <div className="placement-trend-scroll" role="region" aria-label="Placement trend, scroll horizontally to see all games" tabIndex={0}>
    <svg className="trend-chart placement-trend" style={{width}} viewBox={`0 0 ${width} 230`} role="img" aria-label="Recent placements: first and second above the axis, third and fourth below. Each dot is labeled with game points.">
      {[1,2,3,4].map(place=><g key={place}><text x="8" y={y(place)+4}>{['1st','2nd','3rd','4th'][place-1]}</text><line x1="45" x2={width-20} y1={y(place)} y2={y(place)} className="placement-guide"/></g>)}
      <line x1="45" x2={width-20} y1={y(2.5)} y2={y(2.5)} className="chart-zero"/>
      <polyline points={recent.map(({result},i)=>`${x(i)},${y(result.place)}`).join(' ')} className="placement-line"/>
      {recent.map(({game,result},i)=><g key={game.id}>
        <circle cx={x(i)} cy={y(result.place)} r="5" className={result.place<2.5?'chart-positive':'chart-negative'}><title>{dateLabel(game.date)}{game.source_game_number ? ` · Game ${game.source_game_number}` : ''}: {result.place_label} place, {signedPoints(result.final_points)} points</title></circle>
        <text x={x(i)} y={y(result.place)+(result.place<2.5?-12:21)} textAnchor="middle" className="placement-point-label">{signedPoints(result.final_points)}</text>
      </g>)}
      <text x="55" y="220">{dateLabel(recent[0].game.date)}</text><text x={width-20} y="220" textAnchor="end">{dateLabel(recent[recent.length-1].game.date)}</text>
    </svg></div></>;
}
export function PlayerProfile({player, data}) {
  const [limit,setLimit] = useState(20);
  const sessions = groupPlayerSessions(player.records);
  const playerName = id => data.players.find(p=>p.id===id)?.name || 'Unknown player';
  const stats = [['Lifetime points',signedPoints(player.points)],['Average placement',player.averagePlacement?.toFixed(2) ?? '—'],['Games played',player.games],['Average points',player.averagePoints===null?'—':signedPoints(player.averagePoints)],['Win rate',player.winRate===null?'—':`${player.winRate.toFixed(1)}%`],['Best game',player.bestPoints===null?'—':`${signedPoints(player.bestPoints)} pts`]];
  return <><a className="back-link" href="#players">← All players</a><div className="eyebrow">PLAYER PROFILE</div><div className="row"><h1>{player.name}</h1><span className="profile-rank">{player.rank ? `Rank #${player.rank}`:'Unranked'}</span></div><p className="muted">Lifetime results across all sessions and earlier games.</p><div className="stat-grid">{stats.map(([label,value])=><div className="stat-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><p className="footnote">Win rate counts outright first places. Tied placements use their shared average. Host-fee chips are separate: {signedPoints(player.hostChips)} chips.</p><h2>Recent game trend</h2><RecentTrend records={player.records}/><h2>Session history <span className="badge">{sessions.length}</span></h2>
    <p className="muted">Newest session first. Expand a session to see your games and the full table results.</p>
    {!player.games && <p className="empty">No games recorded yet.</p>}
    {sessions.slice(0,limit).map(session=><details key={session.id} className="profile-game">
      <summary><span><strong>{dateLabel(session.date)}</strong><small>{session.name} · {session.records.length} games played</small></span><strong className={session.points>=0?'positive':'negative'}>{signedPoints(session.points)} pts</strong></summary>
      <div className="record-body">
        {session.sessionId && <a href={`#session/${session.sessionId}`}>Open full session →</a>}
        {session.records.map(({game,result},index)=><section className="session-history-game" key={game.id}>
          <div className="row"><h3>Game {game.source_game_number ?? index+1}</h3><strong className={result.final_points>=0?'positive':'negative'}>{result.place_label} · {signedPoints(result.final_points)} pts</strong></div>
          <div className="table-wrap"><table><thead><tr><th>Player</th><th>Score</th><th>Place</th><th>Points</th></tr></thead><tbody>{game.results.map(r=><tr key={r.player_id} className={r.player_id===player.id?'own-result':''}><td>{playerName(r.player_id)}</td><td>{r.score?.toLocaleString() ?? 'Not recorded'}</td><td>{r.place_label}</td><td>{signedPoints(r.final_points)}</td></tr>)}</tbody></table></div>
          {game.host_fee && <p className="footnote">Host fee: {game.host_fee.chips ? `${playerName(game.host_fee.winner_player_id)} → ${playerName(game.host_fee.host_player_id)}: ${game.host_fee.chips} chips` : 'Host won; no transfer.'}</p>}
          {game.notes && <p className="muted">{game.notes}</p>}
        </section>)}
      </div>
    </details>)}
    {sessions.length>limit && <button className="load-more" onClick={()=>setLimit(limit+20)}>Show 20 more sessions</button>}</>;
}
