"""Import Chippirats CSV with source IDs, exact overlap checks, and backup."""
import argparse,copy,csv,json,sys
from collections import defaultdict
from datetime import datetime,timezone
from pathlib import Path
from uuid import uuid5,NAMESPACE_URL
from zoneinfo import ZoneInfo

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from api.index import calculate_results,normalize_store

ALIASES={'Alan O':'Alan','Jimmy Sun':'Jimmy','Jimmy S':'Jimmy','Matsumoto K':'Kazuma',
         'Ueda':'上田','Laura K':'Laura','Mark K':'Mark','Eric N.':'Eric N'}
IGNORED_SESSIONS={'6679adb81101911f4c1f321a'} # June 24, 2024, excluded by user.
SCORING={'returning_score':30000,'uma':[50,10,-10,-30]}
def uid(kind,key):return str(uuid5(NAMESPACE_URL,'riichi-chippirats/'+kind+'/'+key))
def local_date(value):return datetime.fromisoformat(value.replace('Z','+00:00')).astimezone(ZoneInfo('America/Chicago')).date().isoformat()
def signature(date,results):return (date,tuple(sorted((r['player_id'],r['score']) for r in results)))

def build_import(rows,original):
    data=copy.deepcopy(original)
    names={p['name'].casefold():p['id'] for p in data['players']}
    known=normalize_store(original)
    fingerprints=defaultdict(list)
    for game in known['games']:
        if all(r.get('score') is not None for r in game['results']):
            date=game['date'] if len(game['date'])==10 else local_date(game['date'])
            fingerprints[signature(date,game['results'])].append(game)
    existing_ids={g.get('source',{}).get('chippirats_game_id'):g for g in data['games'] if g.get('source',{}).get('chippirats_game_id')}
    audit={'input_games':len(rows),'skipped':[],'duplicates':[],'added_games':0,'added_sessions':0,'added_players':[],'rescored_games':0}
    grouped=defaultdict(list);seen=set()
    for row in rows:
        if row['_id'] in seen:raise ValueError('Repeated source game ID '+row['_id'])
        seen.add(row['_id'])
        if row['sessionId'] in IGNORED_SESSIONS:
            audit['skipped'].append(row['_id']);continue
        grouped[row['sessionId']].append(row)
    host=names['eric c']
    for source_session,items in grouped.items():
        items.sort(key=lambda r:r['time'])
        date=local_date(items[0]['time']);session_id=uid('session',source_session)
        additions=[];matched_sessions=set()
        for number,row in enumerate(items,1):
            source=json.loads(row['result'])
            if len(source)!=4 or sum(r['points'] for r in source)!=100000:raise ValueError('Invalid raw score total '+row['_id'])
            raw=[]
            for r in source:
                name=ALIASES.get(r['name'].strip(),r['name'].strip())
                if name.casefold() not in names:
                    names[name.casefold()]=uid('player',name.casefold())
                    data['players'].append({'id':names[name.casefold()],'name':name});audit['added_players'].append(name)
                if not isinstance(r['points'],int):raise ValueError('Non-integer raw score')
                raw.append({'player_id':names[name.casefold()],'score':r['points']})
            if len({r['player_id'] for r in raw})!=4 or host not in {r['player_id'] for r in raw}:raise ValueError('Invalid seating')
            results=calculate_results(raw,SCORING)
            if abs(sum(r['final_points'] for r in results))>1e-8:raise ValueError('Points do not balance')
            key=signature(local_date(row['time']),results)
            matches=fingerprints.get(key,[])
            same=existing_ids.get(row['_id'])
            if same:
                if sorted((r['player_id'],r['score']) for r in same['results'])!=sorted((r['player_id'],r['score']) for r in results):raise ValueError('Source game changed')
                matches=[same]
            if matches:
                if len(matches)!=1:raise ValueError('Ambiguous duplicate '+row['_id'])
                matched_sessions.add(matches[0].get('session_id'))
                audit['duplicates'].append({'source_id':row['_id'],'existing_id':matches[0]['id']});continue
            winner=results[0]['player_id']
            if results[0]['score']==results[1]['score']:raise ValueError('Host fee needs tie winner')
            source_scores={names[ALIASES.get(r['name'].strip(),r['name'].strip()).casefold()]:r['score'] for r in source}
            adjusted=any(abs(r['final_points']-source_scores[r['player_id']])>1e-8 for r in results)
            audit['rescored_games']+=adjusted
            game={'id':uid('game',row['_id']),'session_id':session_id,'date':row['time'],
                'source_game_number':number,'scoring':copy.deepcopy(SCORING),'results':results,
                'host_player_id':host,'host_fee':{'host_player_id':host,'winner_player_id':winner,'chips':0 if winner==host else 5},
                'notes':'Imported from Chippirats. Raw scores retained; points use 30/10 uma and 20 oka. Host fee tracked separately.',
                'source':{'file':'eric-c-games.csv','chippirats_game_id':row['_id'],'chippirats_session_id':source_session,'time':row['time'],'results':source}}
            additions.append(game);fingerprints[key].append(game)
        if additions:
            if matched_sessions and matched_sessions!={session_id}:raise ValueError('Partial session overlap needs review')
            if not any(s['id']==session_id for s in data['sessions']):
                data['sessions'].append({'id':session_id,'name':date+' · Chippirats','created_at':date,
                    'imported_only':True,'starting_points':25000,'target_points':30000,'uma':[30,10,-10,-30],
                    'starting_chips':None,'rate':0.5,'chip_rate':1,'host_player_id':host,
                    'source':{'file':'eric-c-games.csv','chippirats_session_id':source_session}})
                audit['added_sessions']+=1
            data['games'].extend(additions);audit['added_games']+=len(additions)
    data['games'].sort(key=lambda g:(g['date'],g.get('source_game_number',0)),reverse=True)
    data['sessions'].sort(key=lambda s:s['created_at'],reverse=True)
    return data,audit

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('source');parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    path=ROOT/'data/store.json';before=path.read_bytes()
    with Path(args.source).open(encoding='utf-8-sig') as source:
        rows=list(csv.DictReader(source))
    data,audit=build_import(rows,json.loads(before))
    (ROOT/'imports/chippirats-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in audit.items() if k not in ['skipped','duplicates']},ensure_ascii=False))
    print('Skipped:',len(audit['skipped']),'Matched existing:',len(audit['duplicates']))
    if args.apply:
        assert path.read_bytes()==before
        backup=path.with_name('store-before-chippirats-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json');backup.write_bytes(before)
        tmp=path.with_suffix('.import.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8');tmp.replace(path)
        print('Saved; backup:',backup)
