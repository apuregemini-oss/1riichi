CREATE OR REPLACE TRIGGER version_sessions AFTER INSERT OR UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION ledger_changed();
CREATE OR REPLACE FUNCTION ledger_open_session() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE session_data text;
BEGIN
 IF NEW.session_id IS NOT NULL THEN
  SELECT payload INTO session_data FROM sessions WHERE id=NEW.session_id FOR UPDATE;
  IF session_data::jsonb->>'finished_at' IS NOT NULL THEN
   RAISE EXCEPTION 'Session is finished';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER game_open_session BEFORE INSERT ON games FOR EACH ROW EXECUTE FUNCTION ledger_open_session();
