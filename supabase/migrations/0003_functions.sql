-- ============================================================
-- 0003_functions.sql — DB functions, triggers, pg_cron
-- ============================================================

-- Auto-update updated_at on any table that has the column
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_visitors_updated_at
  BEFORE UPDATE ON visitors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_canned_updated_at
  BEFORE UPDATE ON canned_responses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Mark widget sessions inactive when last_seen_at is > 90 seconds ago
-- (called by pg_cron every minute)
CREATE OR REPLACE FUNCTION mark_inactive_sessions()
RETURNS void AS $$
  UPDATE widget_sessions
  SET is_active = false
  WHERE is_active = true
    AND last_seen_at < now() - interval '90 seconds';
$$ LANGUAGE sql;

-- Mark conversations as missed when status = waiting for > 5 minutes
CREATE OR REPLACE FUNCTION mark_missed_conversations()
RETURNS void AS $$
  UPDATE conversations
  SET status = 'missed',
      updated_at = now()
  WHERE status = 'waiting'
    AND created_at < now() - interval '5 minutes';
$$ LANGUAGE sql;

-- pg_cron jobs (enable pg_cron extension first in Supabase dashboard)
-- Run: SELECT cron.schedule(...) after enabling the extension.
-- Documented here as a reference — apply via Supabase SQL editor after enabling pg_cron:
--
-- SELECT cron.schedule('mark-inactive-sessions',  '* * * * *',    'SELECT mark_inactive_sessions()');
-- SELECT cron.schedule('mark-missed-conversations','*/5 * * * *',  'SELECT mark_missed_conversations()');
