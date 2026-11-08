import {useId} from 'react';
import {signedPoints} from './playerStats';
import {sessionSettlement,signedDollars} from './settlement';

export default function SessionSettlement({players,session}) {
 const heading=useId(),rows=sessionSettlement(players,session);
 const color=value=>value>0?'positive':value<0?'negative':'';
 return <section className="session-overview" aria-labelledby={heading}>
  <h2 id={heading}>Dollar settlement</h2>
  <p className="muted">Points before host fees × ${(session.rate??.5).toFixed(2)}, plus net host-fee chips × ${(session.chip_rate??1).toFixed(2)}. Positive amounts are winnings; negative amounts are losses.</p>
  <div className="table-wrap"><table><thead><tr><th>Player</th><th>Points</th><th>From points</th><th>Host fees</th><th>Net dollars</th></tr></thead>
   <tbody>{rows.map(p=><tr key={p.id}><td>{p.name}</td><td>{signedPoints(p.points)}</td><td className={color(p.pointsCents)}>{signedDollars(p.pointsCents)}</td><td className={color(p.hostCents)}>{signedDollars(p.hostCents)}</td><td className={color(p.totalCents)}><strong>{signedDollars(p.totalCents)}</strong></td></tr>)}</tbody>
  </table></div>
 </section>;
}
