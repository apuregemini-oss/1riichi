"""Import the inspected Stefan workbook without changing source files.
Dry-run by default. --apply backs up the ledger and atomically commits a validated plan.
"""
import argparse,copy,hashlib,json,re,sys
from collections import defaultdict
from datetime import datetime,timedelta,timezone
from decimal import Decimal
from pathlib import Path
from uuid import uuid5,NAMESPACE_URL
try:
    from .history_rules import standardize_game
except ImportError:
    from history_rules import standardize_game

ROOT=Path(__file__).resolve().parents[1]
ALIASES={'Eric':'Eric C','柿崎':'Kakizaki','片桐':'Katagiri','Keigo':'Katagiri','松本':'Kazuma','中村':'Nate'}
def uid(kind,key):return str(uuid5(NAMESPACE_URL,'riichi-stefan-history/'+kind+'/'+key))
def dec(value):return Decimal(str(value)).quantize(Decimal('0.01'))
def build_import(sheets,store,restore_actual=False,fix_typos=False):
    payload=copy.deepcopy(store)
    payload.setdefault('sessions',[])
    names={p['name'].casefold():p['id'] for p in payload['players']}
    audit={'sessions':[],'skipped':[],'issues':[],'corrections':[],'aliases':ALIASES,'imported_games':0}
    pending_games=[];pending_sessions=[]
    for sheet in sheets:
        title=sheet['name'];c=sheet['cells']
        if title=='Template' or not c:
            audit['skipped'].append({'sheet':title,'reason':'Template' if title=='Template' else 'Empty sheet'});continue
        wide=c.get('P3',{}).get('t')=='s'
        cols=['D','G','J','M','P'] if wide else ['D','G','J','M']
        header=3 if wide else 8
        if not all(c.get(f'{col}{header}',{}).get('t')=='s' for col in cols):
            raise ValueError(f'Unrecognized layout: {title}')
        raw_names=[c[f'{col}{header}']['v'].strip() for col in cols]
        canonical=[ALIASES.get(n,n) for n in raw_names]
        for name in canonical:
            if name.casefold() not in names:
                player_id=uid('player',name.casefold());names[name.casefold()]=player_id
                payload['players'].append({'id':player_id,'name':name})
        ids=[names[n.casefold()] for n in canonical]
        host_id=names['eric c']
        source_date=(datetime(1899,12,30)+timedelta(days=float(c['P2' if wide else 'M7']['v']))).date().isoformat()
        date=source_date
        if title=='1-7 Sunday' and source_date=='2023-01-07':
            if fix_typos:
                date='2024-01-07';audit['corrections'].append({'sheet':title,'field':'date','from':source_date,'to':date})
            else:audit['issues'].append({'sheet':title,'issue':'Date conflicts with tab weekday and adjacent sessions','value':date})
        session_id=uid('session',title)
        session={'id':session_id,'name':f'{date} · {title}','created_at':date,'imported_only':True,'starting_points':None,'target_points':None,'starting_chips':None,'uma':None,'rate':0.5,'chip_rate':1,'host_player_id':host_id,'source':{'workbook':'Stefan Made Simple 計算表 for Eric.xlsx','sheet':title,'date':source_date}}
        entries=[];raw_totals=[Decimal(0)]*len(cols);corrected_totals=defaultdict(Decimal);chip_totals=defaultdict(int)
        for ref,cell in c.items():
            if not re.fullmatch(r'B\d+',ref) or cell['t'] is not None:continue
            row=int(ref[1:]);game_number=int(cell['v'])
            active=[]
            for index,col in enumerate(cols):
                source=c.get(f'{col}{row}',{}).get('v')
                if source is None:continue
                value=dec(source);raw_totals[index]+=value
                source_value=value
                if title=='2-8 Sun' and row==24 and col=='G' and value==Decimal('8.11') and fix_typos:
                    value=Decimal('8.1');audit['corrections'].append({'sheet':title,'cell':f'{col}{row}','from':8.11,'to':8.1})
                active.append({'player_id':ids[index],'source_points':float(source_value),'final_points':float(value),'source_cell':f'{col}{row}'})
            if not active:continue
            if len(active)!=4:raise ValueError(f'{title} game {game_number}: expected four results, found {len(active)}')
            if host_id not in [r['player_id'] for r in active]:raise ValueError(f'{title} game {game_number}: host not seated')
            total=sum(dec(r['final_points']) for r in active)
            recorded_fee=dec(c.get(f'{"T" if wide else "Q"}{row}',{}).get('v') or 0)
            # One row omits the fee cell but its four points still total -10.
            deduction=Decimal(10)
            if restore_actual:
                deduction=recorded_fee
                if recorded_fee==0 and total==Decimal(-10):deduction=Decimal(10)
            winner=max(active,key=lambda r:r['final_points'])
            if sum(r['final_points']==winner['final_points'] for r in active)>1:
                raise ValueError(f'{title} game {game_number}: ambiguous winner')
            winner['final_points']=float(dec(winner['final_points'])+deduction)
            corrected_sum=sum(dec(r['final_points']) for r in active)
            if corrected_sum!=0:audit['issues'].append({'sheet':title,'game':game_number,'row':row,'issue':'Corrected points do not total zero','total':float(corrected_sum),'source_fee':float(recorded_fee)})
            active.sort(key=lambda r:-r['final_points'])
            for result in active:
                higher=sum(r['final_points']>result['final_points'] for r in active)
                tied=sum(r['final_points']==result['final_points'] for r in active)
                places=list(range(higher+1,higher+tied+1))
                labels=['1st','2nd','3rd','4th']
                result.update(score=None,uma=None,place=sum(places)/len(places),place_label=labels[places[0]-1] if tied==1 else f'{labels[places[0]-1]}-{labels[places[-1]-1]}')
                corrected_totals[result['player_id']]+=dec(result['final_points'])
            fee=0 if winner['player_id']==host_id else 5
            chip_totals[host_id]+=fee;chip_totals[winner['player_id']]-=fee
            game={'id':uid('game',title+'/'+str(game_number)),'session_id':session_id,'date':date,'source_game_number':game_number,'result_type':'final_points','scoring':None,'results':active,'host_player_id':host_id,'host_fee':{'winner_player_id':winner['player_id'],'host_player_id':host_id,'chips':fee},'notes':f'Imported game {game_number}. Restored {deduction:g} winner points; raw table scores not supplied.','source':{'sheet':title,'row':row,'deduction_restored':float(deduction),'fee_cell':float(recorded_fee)}}
            standardize_game(game)
            entries.append(game)
        # Reconcile every player's extracted values to the workbook's cached session total.
        for i,col in enumerate(cols):
            cached=dec(c[f'{col}{header+1}']['v'])
            if abs(raw_totals[i]-cached)>Decimal('.001'):raise ValueError(f'{title}: total mismatch for {canonical[i]}: {raw_totals[i]} vs {cached}')
        if not entries:raise ValueError(f'Unexpected empty session {title}')
        corrected_totals=defaultdict(Decimal)
        for game in entries:
            for result in game['results']:
                corrected_totals[result['player_id']]+=dec(result['final_points'])
        existing_session=next((s for s in payload['sessions'] if s['id']==session_id),None)
        existing_games={g['id']:g for g in payload['games']}
        if existing_session:
            for g in entries:
                if g['id'] not in existing_games or sorted(existing_games[g['id']]['results'],key=lambda r:r['player_id'])!=sorted(g['results'],key=lambda r:r['player_id']):
                    raise ValueError(f'Previously imported session changed: {title}')
        else:
            pending_sessions.append(session);pending_games.extend(entries)
        lookup={p['id']:p['name'] for p in payload['players']}
        audit['sessions'].append({'sheet':title,'date':date,'games':len(entries),'points':{lookup[k]:float(v) for k,v in corrected_totals.items()},'host_chips':{lookup[k]:v for k,v in chip_totals.items()},'already_imported':bool(existing_session)})
    pending_games.sort(key=lambda g:(g['date'],g['source_game_number']),reverse=True)
    payload['games']=pending_games+payload['games']
    payload['sessions']=sorted(pending_sessions+payload['sessions'],key=lambda s:s['created_at'],reverse=True)
    audit['imported_games']=len(pending_games);audit['imported_sessions']=len(pending_sessions)
    return payload,audit

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--restore-actual',action='store_true');parser.add_argument('--fix-typos',action='store_true');parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    target=ROOT/'data/store.json';before=target.read_bytes()
    sheets=json.loads((ROOT/'imports/workbook-cells.json').read_text(encoding='utf-8'))
    payload,audit=build_import(sheets,json.loads(before),args.restore_actual,args.fix_typos)
    (ROOT/'imports/import-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
    (ROOT/'imports/import-preview.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in audit.items() if k!='sessions'},ensure_ascii=False,indent=2))
    if args.apply:
        if audit['issues']:raise ValueError('Resolve import issues before applying.')
        if before!=target.read_bytes():raise RuntimeError('Ledger changed during import; retry.')
        stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        backup=ROOT/f'data/store-before-history-{stamp}.json'
        backup.write_bytes(before)
        temp=target.with_suffix('.importing.json');temp.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(target)
        print('Applied. Backup: '+str(backup))
if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8');main()
