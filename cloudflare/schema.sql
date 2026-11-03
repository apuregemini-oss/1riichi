CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, session_id TEXT REFERENCES sessions(id), payload TEXT NOT NULL CHECK(json_valid(payload)), revision INTEGER NOT NULL DEFAULT 1);
CREATE INDEX IF NOT EXISTS games_session ON games(session_id);
CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO metadata VALUES ('version','1');
CREATE TABLE IF NOT EXISTS game_edits (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT NOT NULL, previous_payload TEXT NOT NULL, previous_revision INTEGER NOT NULL, edited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TRIGGER IF NOT EXISTS audit_game_edit BEFORE UPDATE ON games BEGIN
 INSERT INTO game_edits (game_id,previous_payload,previous_revision) VALUES (OLD.id,OLD.payload,OLD.revision);
END;
CREATE TRIGGER IF NOT EXISTS games_insert_version AFTER INSERT ON games BEGIN UPDATE metadata SET value=CAST(value AS INTEGER)+1 WHERE key='version'; END;
CREATE TRIGGER IF NOT EXISTS games_update_version AFTER UPDATE ON games BEGIN UPDATE metadata SET value=CAST(value AS INTEGER)+1 WHERE key='version'; END;
CREATE TRIGGER IF NOT EXISTS players_insert_version AFTER INSERT ON players BEGIN UPDATE metadata SET value=CAST(value AS INTEGER)+1 WHERE key='version'; END;
CREATE TRIGGER IF NOT EXISTS sessions_insert_version AFTER INSERT ON sessions BEGIN UPDATE metadata SET value=CAST(value AS INTEGER)+1 WHERE key='version'; END;
