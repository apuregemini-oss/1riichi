import copy,csv,json,unittest
from pathlib import Path
from imports.import_chippirats import build_import,local_date,IGNORED_SESSIONS
from api.index import normalize_store
ROOT=Path(__file__).resolve().parents[1]

class ChippiratsImportTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  with (ROOT/'imports/eric-c-games.csv').open(encoding='utf-8-sig') as source:
   cls.rows=list(csv.DictReader(source))
  cls.before=json.loads((ROOT/'data/store.json').read_text(encoding='utf-8'))
  cls.after,cls.audit=build_import(cls.rows,cls.before)
 def test_source_coverage_and_preservation(self):
  self.assertEqual(self.audit['input_games'],140)
  self.assertEqual(len(self.audit['skipped']),4)
  self.assertEqual(self.audit['added_games']+len(self.audit['duplicates']),136)
  byid={g['id']:g for g in self.after['games']}
  for g in self.before['games']:self.assertEqual(byid[g['id']],g)
  self.assertFalse(any(g.get('source',{}).get('chippirats_session_id') in IGNORED_SESSIONS for g in self.after['games']))
 def test_points_raw_scores_and_host_fee(self):
  imported=[g for g in self.after['games'] if g.get('source',{}).get('chippirats_game_id')]
  self.assertEqual(len(imported),114)
  for g in imported:
   self.assertEqual(sum(r['score'] for r in g['results']),100000)
   self.assertAlmostEqual(sum(r['final_points'] for r in g['results']),0)
   self.assertEqual(sorted(r['score'] for r in g['results']),sorted(r['points'] for r in g['source']['results']))
   winner=g['results'][0]['player_id'];host=g['host_player_id']
   self.assertEqual(g['host_fee']['chips'],0 if winner==host else 5)
  normalized=normalize_store(self.after)
  original_games={g['id']:g for g in self.after['games']}
  for g in normalized['games']:
   if g.get('source',{}).get('chippirats_game_id'):self.assertEqual(g['results'],original_games[g['id']]['results'])
 def test_repeat_import_and_timezone(self):
  again,audit=build_import(self.rows,self.after)
  self.assertEqual(audit['added_games'],0);self.assertEqual(audit['added_sessions'],0)
  self.assertEqual(again,self.after)
  self.assertEqual(local_date('2026-09-13T00:22:49.231Z'),'2026-09-12')
 def test_rejects_bad_totals_and_duplicate_ids(self):
  row=copy.deepcopy(next(r for r in self.rows if r['sessionId'] not in IGNORED_SESSIONS))
  with self.assertRaises(ValueError):build_import([row,row],self.before)
  result=json.loads(row['result']);result[0]['points']+=100;row['result']=json.dumps(result)
  with self.assertRaises(ValueError):build_import([row],self.before)

if __name__=='__main__':unittest.main()
