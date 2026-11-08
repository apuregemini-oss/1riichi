export function sessionSettlement(players,session) {
 const rate=session.rate??0.5,chipRate=session.chip_rate??1;
 const cents=value=>Math.sign(value)*Math.round((Math.abs(value)+Number.EPSILON)*100);
 return players.map(player=>{
  const pointsCents=cents(player.points*rate),hostCents=cents(player.hostChips*chipRate);
  return {...player,pointsCents,hostCents,totalCents:pointsCents+hostCents};
 }).sort((a,b)=>b.totalCents-a.totalCents||a.name.localeCompare(b.name));
}
export const signedDollars=cents=>`${cents>0?'+':cents<0?'−':''}$${(Math.abs(cents)/100).toFixed(2)}`;
