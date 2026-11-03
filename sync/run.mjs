import {readFileSync,mkdirSync,appendFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sessionWorksheet} from '../server/excel-export.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const config=JSON.parse(readFileSync(new URL('../.local-sync/config.json',import.meta.url),'utf8'));
mkdirSync(root+'.local-sync',{recursive:true});
try{
 const response=await fetch(config.site+'/api/bootstrap',{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Ledger request failed: '+response.status);
 const data=await response.json();
 const sheets=data.sessions.filter(s=>s.finished_at&&!s.imported_only).map(s=>sessionWorksheet(s,data.games.filter(g=>g.session_id===s.id),data.players));
 let updated=[];
 if(sheets.length){
  const result=spawnSync(config.python,[root+'sync/write_workbook.py'],{input:JSON.stringify({workbook:config.workbook,backup_dir:root+'.local-sync/backups',sheets}),encoding:'utf8',windowsHide:true,timeout:90000});
  if(result.error)throw result.error;
  const output=JSON.parse(result.stdout||'{}');if(result.status!==0)throw Error(output.error||'Workbook update failed');updated=output.updated;
 }
 writeFileSync(root+'.local-sync/status.json',JSON.stringify({checked_at:new Date().toISOString(),finished_sessions:sheets.length,updated,error:null},null,2));
 if(updated.length)appendFileSync(root+'.local-sync/sync.log',new Date().toISOString()+' '+JSON.stringify(updated)+'\n');
 console.log(JSON.stringify({finished_sessions:sheets.length,updated}));
}catch(error){writeFileSync(root+'.local-sync/status.json',JSON.stringify({checked_at:new Date().toISOString(),error:error.message},null,2));console.error(error.message);process.exitCode=1;}
