import json,unittest
from pathlib import Path
from imports.import_history import build_import
from api.index import normalize_store,compute_standings,build_summary
ROOT=Path(__file__).resolve().parents[1]
class HistoryImportTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.sheets=json.loads((ROOT/'imports/workbook-cells.json').read_text(encoding='utf-8'))
  cls.original=json.loads((ROOT/'data/store.json').read_text(encoding='utf-8'))
  cls.payload,cls.audit=build_import(cls.sheets,cls.original,True,True)
 def test_counts_and_source_preservation(self):
  self.assertEqual(len(self.audit['sessions']),89)
  self.assertEqual(sum(s['games'] for s in self.audit['sessions']),714)
  self.assertEqual(len(self.audit['skipped']),5)
  self.assertEqual(self.audit['issues'],[])
  for old in self.original['games']:self.assertIn(old,self.payload['games'])
 def test_every_game_and_fee(self):
  imported=[g for g in self.payload['games'] if g.get('result_type')=='final_points']
  for g in imported:
   self.assertEqual(len(g['results']),4)
   self.assertAlmostEqual(sum(r['final_points'] for r in g['results']),0)
   if g.get('score_reconstructed'):
    self.assertEqual(sum(r['score'] for r in g['results']),100000)
   else:self.assertTrue(all(r['score'] is None for r in g['results']))
   winner=max(g['results'],key=lambda r:r['final_points'])['player_id']
   self.assertEqual(g['host_fee']['chips'],0 if winner==g['host_player_id'] else 5)
 def test_normalization_does_not_reapply_deductions(self):
  normalized=normalize_store(self.payload)
  for _ in range(3):
   again=normalize_store(normalized)
   self.assertEqual(normalized,again);normalized=again
  self.assertEqual(len(compute_standings(normalized)),len(self.payload['players']))
  self.assertTrue(build_summary(normalized)['games_logged']>=714)
 def test_reimport_is_idempotent_after_normalization(self):
  normalized=normalize_store(self.payload)
  again,audit=build_import(self.sheets,normalized,True,True)
  self.assertEqual(audit['imported_games'],0)
  self.assertEqual(audit['imported_sessions'],0)
  self.assertEqual(again,normalized)
 def test_latest_session_reconciliation(self):
  session=next(s for s in self.audit['sessions'] if s['sheet']=='10-25 Sun')
  self.assertEqual(session['points'],{'Alan':-21.8,'Kakizaki':-50.1,'Koseki':56.4,'Eric C':15.5})
  self.assertEqual(session['host_chips']['Eric C'],30)
 def test_uniform_uma_preserves_places_and_applies_once(self):
  for g in self.payload['games']:
   if g.get('result_type')!='final_points':continue
   old=g['date']<'2025-06-22' or g['date']=='2025-07-20'
   for r in g['results']:
    delta=(10 if r['place']==1 else -10 if r['place']==4 else 0) if old else 0
    self.assertAlmostEqual(r['final_points']-r['original_final_points'],delta)
   if g.get('score_reconstructed'):
    rows=sorted(g['results'],key=lambda r:r['place'])
    self.assertEqual([r['score'] for r in rows],sorted([r['score'] for r in rows],reverse=True))
 def test_deduction_exceptions_and_approved_typos(self):
  games=[g for g in self.payload['games'] if g.get('result_type')=='final_points']
  for g in games:
   sheet=g['source']['sheet']
   expected=15 if sheet=='2-8 Sun' else 0 if sheet in ['3-14 Fri','3-7 Sat'] else 10
   self.assertEqual(g['source']['deduction_restored'],expected)
   if sheet=='1-7 Sunday':self.assertEqual(g['date'],'2024-01-07')
  bad=next(g for g in games if g['source']['sheet']=='2-8 Sun' and g['source_game_number']==7)
  kakizaki=next(r for r in bad['results'] if r['source_cell']=='G24')
  self.assertEqual(kakizaki['source_points'],8.11)
  self.assertEqual(kakizaki['final_points'],8.1)
if __name__=='__main__':unittest.main()
