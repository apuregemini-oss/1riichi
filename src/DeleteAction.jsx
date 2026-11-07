import {useState} from 'react';

export default function DeleteAction({label,description,busy,onConfirm}) {
 const [confirming,setConfirming]=useState(false);
 return <span className="delete-action" onClick={e=>{e.preventDefault();e.stopPropagation();}}>
  <button type="button" className="compact-delete" disabled={busy} aria-label={label} onClick={()=>setConfirming(true)}>Delete</button>
  {confirming&&<span className="delete-confirm" role="group" aria-label={label+' confirmation'}>
   <span>{description}</span>
   <button type="button" className="compact-delete" disabled={busy} onClick={onConfirm}>Confirm</button>
   <button type="button" className="compact-button" disabled={busy} onClick={()=>setConfirming(false)}>Cancel</button>
  </span>}
 </span>;
}
