import {useState,useEffect} from 'react';
export default function ExcelSync(){
 const [state,setState]=useState({status:'idle'}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  const refresh=()=>fetch('/api/admin/excel-sync').then(async r=>{if(!r.ok)throw Error('Cannot read Excel sync status.');return r.json();}).then(s=>{if(active)setState(s);}).catch(e=>{if(active)setError(e.message);});
  refresh();const timer=setInterval(refresh,10000);return()=>{active=false;clearInterval(timer);};
 },[]);
 async function request(){
  setBusy(true);setError('');
  try{const response=await fetch('/api/admin/excel-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'request'})});const value=await response.json();if(!response.ok)throw Error(value.detail??'Unable to request sync.');setState(value);}catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <section className="game" aria-label="Excel sync"><button disabled={busy||state.status==='pending'} onClick={request}>{state.status==='pending'?'Excel sync requested…':'Sync Excel now'}</button><p className="muted">Sync finished sessions once. Eric’s PC must be awake and signed in with OneDrive running. The helper checks for your request every minute.</p><p role="status">{error|| (state.status==='pending'?'Waiting for the PC helper.':state.status==='complete'?'Workbook updated. OneDrive will upload the changes.':state.status==='error'?`Sync failed: ${state.error}`:'Workbook syncing is manual.')}</p></section>;
}
