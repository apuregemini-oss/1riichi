export function sessionListName(session,games,players) {
 const ordered=games.filter(g=>g.session_id===session.id).sort((a,b)=>a.date.localeCompare(b.date));
 const date=ordered[0]?.date??session.created_at;
 const day=/^\d{4}-\d{2}-\d{2}$/.test(date)?date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));
 const hostIds=session.host_player_id?[session.host_player_id]:[...new Set(ordered.map(g=>g.host_player_id??g.host_fee?.host_player_id).filter(Boolean))];
 const hosts=hostIds.map(id=>players.find(p=>p.id===id)?.name).filter(name=>name&&name.trim().toLowerCase()!=='eric c');
 return [day,...hosts].join(' ');
}
