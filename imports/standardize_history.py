import copy,json,sys
from pathlib import Path
from datetime import datetime,timezone
from history_rules import standardize_game

path=Path(__file__).resolve().parents[1]/'data/store.json'
before=path.read_bytes()
data=json.loads(before)
old=copy.deepcopy(data)
changed=0
unresolved=[]
for game in data['games']:
    standardize_game(game)
    if game.get('points_standardization'):
        changed+=game['points_standardization']['original_uma'][0]==20
        if not game['score_reconstructed']:
            unresolved.append({'date':game['date'],'game':game.get('source_game_number')})
for a,b in zip(old['games'],data['games']):
    assert a.get('host_fee')==b.get('host_fee')
    assert [(r['player_id'],r['place']) for r in a['results']]==[(r['player_id'],r['place']) for r in b['results']]
    if b.get('score_reconstructed'):assert sum(r['score'] for r in b['results'])==100000
    again=copy.deepcopy(b);standardize_game(again);assert again==b
for session in data['sessions']:
    if session.get('imported_only'):
        session.update(uma=[30,10,-10,-30],starting_points=25000,target_points=30000)
print(json.dumps({'converted_games':changed,'backfilled_games':sum(g.get('score_reconstructed',False) for g in data['games']),'unresolved':unresolved,'total_games':len(data['games'])}))
if '--apply' in sys.argv:
    assert path.read_bytes()==before
    backup=path.with_name('store-before-uma-standardization-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json')
    backup.write_bytes(before)
    tmp=path.with_suffix('.standardize.tmp')
    tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8');tmp.replace(path)
    print('Saved. Backup: '+str(backup))
