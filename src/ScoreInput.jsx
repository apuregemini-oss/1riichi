export default function ScoreInput({value,onChange,label='Final score'}) {
 return <label className="field"><span>{label} (×100)</span><input required type="number" min="-500" max="4000" step="0.01" value={value===''?'':value/100} onChange={e=>onChange(e.target.value===''?'':Math.round(Number(e.target.value)*100))}/><small className="muted">{value===''?'349 = 34,900':`${Number(value).toLocaleString()} points`}</small></label>;
}
