"""Generate an insert-only D1 migration from the normalized local ledger."""
import json,sys,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from api.index import normalize_store

def quote(value):
    return "'"+str(value).replace("'","''")+"'"

if __name__=='__main__':
    source=(ROOT/'data/store.json').read_bytes()
    data=normalize_store(json.loads(source))
    lines=[]
    for p in data['players']:
        lines.append('INSERT INTO players(id,name,payload) VALUES('+','.join(map(quote,[p['id'],p['name'],json.dumps(p,ensure_ascii=False)]))+');')
    for s in data['sessions']:
        lines.append('INSERT INTO sessions(id,payload) VALUES('+','.join(map(quote,[s['id'],json.dumps(s,ensure_ascii=False)]))+');')
    for g in data['games']:
        lines.append('INSERT INTO games(id,session_id,payload) VALUES('+quote(g['id'])+','+(quote(g['session_id']) if g.get('session_id') else 'NULL')+','+quote(json.dumps(g,ensure_ascii=False))+');')
    folder=ROOT/'cloudflare/.generated';folder.mkdir(exist_ok=True)
    (folder/'seed.sql').write_text('\n'.join(lines),encoding='utf-8')
    (folder/'normalized.json').write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
    print(json.dumps({'source_sha256':hashlib.sha256(source).hexdigest(),**{key:len(data[key]) for key in ['players','sessions','games']}}))
