export const signedPoints = value => `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
export function gameTime(date) {
  // Date-only records are local calendar dates, not midnight UTC.
  const value = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date;
  return new Date(value).getTime() || 0;
}
export function groupPlayerSessions(records) {
  const groups = new Map();
  for (const record of records) {
    const {game} = record;
    const key = game.session_id || `earlier:${game.date.slice(0,10)}`;
    if (!groups.has(key)) groups.set(key, {id:key, sessionId:game.session_id, name:record.sessionName, date:game.date, records:[], points:0});
    const group = groups.get(key);
    group.records.push(record);
    group.points += record.result.final_points;
  }
  return [...groups.values()].map(group => ({...group,
    points:Number(group.points.toFixed(1)),
    records:[...group.records].sort((a,b) =>
      (a.game.source_game_number != null && b.game.source_game_number != null)
        ? a.game.source_game_number-b.game.source_game_number
        : gameTime(a.game.date)-gameTime(b.game.date) || b.index-a.index),
  }));
}
export function buildPlayerStats(data) {
  const sessions = new Map(data.sessions.map(s => [s.id, s.name]));
  const players = data.players.map(player => {
    const records = data.games.flatMap((game, index) => {
      const result = game.results.find(r => r.player_id === player.id);
      return result ? [{ game, result, index, sessionName: sessions.get(game.session_id) || 'Earlier game' }] : [];
    }).sort((a,b) => gameTime(b.game.date)-gameTime(a.game.date) || a.index-b.index);
    const count = records.length;
    const points = Number(records.reduce((sum,r) => sum+r.result.final_points,0).toFixed(1));
    const firsts = records.filter(r => r.result.place === 1).length;
    const placementCounts = [0,0,0,0];
    let tiedGames = 0;
    records.forEach(({game,result}) => {
      if (!Number.isInteger(result.place) || game.results.filter(r=>r.place===result.place).length>1) tiedGames++;
      else placementCounts[result.place-1]++;
    });
    return { ...player, records, games:count, points, firsts, placementCounts, tiedGames,
      averagePlacement: count ? records.reduce((sum,r) => sum+r.result.place,0)/count : null,
      averagePoints: count ? points/count : null,
      winRate: count ? firsts/count*100 : null,
      bestPoints: count ? Math.max(...records.map(r => r.result.final_points)) : null,
      bestScore: records.some(r=>r.result.score!=null) ? Math.max(...records.filter(r=>r.result.score!=null).map(r => r.result.score)) : null,
      hostChips: records.reduce((sum,{game}) => sum + (game.host_fee?.host_player_id===player.id ? game.host_fee.chips : 0) - (game.host_fee?.winner_player_id===player.id ? game.host_fee.chips : 0), 0),
    };
  }).sort((a,b) => Number(b.games>0)-Number(a.games>0) || b.points-a.points || a.name.localeCompare(b.name));
  let rank = null;
  players.forEach((player,index) => {
    if (player.games && (!index || player.points !== players[index-1].points)) rank = index+1;
    player.rank = player.games ? rank : null;
  });
  return players;
}
