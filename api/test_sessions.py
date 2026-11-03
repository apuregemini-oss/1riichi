import tempfile
import unittest
from pathlib import Path
from fastapi import HTTPException
from pydantic import ValidationError
import api.index as ledger

class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.original = ledger.store
        ledger.store = ledger.Store(Path(self.directory.name) / 'store.json')
        self.players = [ledger.create_player(ledger.PlayerCreate(name=n)) for n in ['A','B','C','D']]
    def tearDown(self):
        ledger.store = self.original
        self.directory.cleanup()
    def game(self, scores):
        return ledger.SessionGameCreate(results=[{'player_id':p['id'],'score':s} for p,s in zip(self.players,scores)])
    def test_session_roundtrip_and_oka(self):
        s=ledger.create_session(ledger.SessionCreate(name='Friday'))
        g=ledger.create_session_game(s['id'],self.game([45000,35000,15000,5000]))
        self.assertEqual([r['final_points'] for r in g['results']],[65,15,-25,-55])
        self.assertEqual(sum(r['final_points'] for r in g['results']),0)
        self.assertEqual(ledger.bootstrap()['sessions'][0]['name'],'Friday')
        self.assertEqual(ledger.bootstrap()['games'][0]['session_id'],s['id'])
    def test_custom_total_and_ties(self):
        s=ledger.create_session(ledger.SessionCreate(name='Custom',starting_points=30000))
        g=ledger.create_session_game(s['id'],self.game([40000,40000,20000,20000]))
        self.assertEqual([r['final_points'] for r in g['results']],[30,30,-30,-30])
        with self.assertRaises(HTTPException):
            ledger.create_session_game(s['id'],self.game([25000]*4))
    def test_validation(self):
        with self.assertRaises(ValidationError): ledger.PlayerCreate(name='   ')
        with self.assertRaises(ValidationError): ledger.SessionCreate(name=' ')
        with self.assertRaises(ValidationError): ledger.SessionCreate(name='Bad',uma=[30,10,-10,0])
        with self.assertRaises(ValidationError): ledger.SessionGameCreate(results=[{'player_id':'same','score':25000}]*4)
        with self.assertRaises(HTTPException): ledger.create_player(ledger.PlayerCreate(name='a'))
    def test_legacy_preserved(self):
        old={'players':self.players,'games':[],'settings':ledger.DEFAULT_SETTINGS}
        normalized=ledger.normalize_store(old)
        self.assertEqual(normalized['sessions'],[])
        self.assertEqual(normalized['players'],self.players)

    def test_host_fee_persists_once_and_does_not_change_points(self):
        session = ledger.create_session(ledger.SessionCreate(name='Host fee'))
        game = self.game([45000,35000,15000,5000]).model_dump()
        game['host_player_id'] = self.players[1]['id']
        saved = ledger.create_session_game(session['id'], ledger.SessionGameCreate(**game))
        expected = {'winner_player_id':self.players[0]['id'], 'host_player_id':self.players[1]['id'], 'chips':5}
        self.assertEqual(saved['host_fee'], expected)
        self.assertEqual([r['final_points'] for r in saved['results']], [65,15,-25,-55])
        for _ in range(3):
            payload = ledger.bootstrap()
            self.assertEqual(payload['games'][0]['host_fee'], expected)
            self.assertEqual(len(payload['games']), 1)
            ledger.store.write(payload)

    def test_host_winner_and_disabled_fee(self):
        session = ledger.create_session(ledger.SessionCreate(name='Host wins'))
        game = self.game([45000,35000,15000,5000]).model_dump()
        game['host_player_id'] = self.players[0]['id']
        saved = ledger.create_session_game(session['id'], ledger.SessionGameCreate(**game))
        self.assertEqual(saved['host_fee']['chips'], 0)
        game['host_player_id'] = None
        saved = ledger.create_session_game(session['id'], ledger.SessionGameCreate(**game))
        self.assertIsNone(saved['host_fee'])

    def test_host_validation_and_tie_resolution(self):
        game = self.game([35000,35000,15000,15000]).model_dump()
        game['host_player_id'] = 'not-seated'
        with self.assertRaises(ValidationError): ledger.SessionGameCreate(**game)
        game['host_player_id'] = self.players[0]['id']
        with self.assertRaises(ValidationError): ledger.SessionGameCreate(**game)
        game['winner_player_id'] = self.players[2]['id']
        with self.assertRaises(ValidationError): ledger.SessionGameCreate(**game)
        game['winner_player_id'] = self.players[1]['id']
        self.assertEqual(ledger.host_fee_record(ledger.SessionGameCreate(**game))['host_fee']['chips'], 5)
        game['winner_player_id'] = self.players[0]['id']
        self.assertEqual(ledger.host_fee_record(ledger.SessionGameCreate(**game))['host_fee']['chips'], 0)

    def test_legacy_game_endpoint_supports_optional_host(self):
        game = self.game([45000,35000,15000,5000]).model_dump()
        game.update(date='2026-11-01', scoring=ledger.DEFAULT_SETTINGS, host_player_id=self.players[3]['id'])
        saved = ledger.create_game(ledger.GameCreate(**game))
        self.assertEqual(saved['host_fee']['chips'], 5)
        old = dict(saved)
        old.pop('host_fee')
        old.pop('host_player_id')
        self.assertNotIn('host_fee', ledger.normalize_game(old, ledger.DEFAULT_SETTINGS))

if __name__=='__main__': unittest.main()
