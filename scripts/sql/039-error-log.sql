-- Error Log table for debugging across the app
-- Auto-cleanup: rows older than 30 days are deleted on each INSERT

CREATE TABLE IF NOT EXISTS app_error_log (
  id BIGSERIAL PRIMARY KEY,
  level TEXT NOT NULL DEFAULT 'error' CHECK (level IN ('error', 'warn')),
  user_id UUID REFERENCES auth.users(id),
  message TEXT NOT NULL,
  details JSONB,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_log_created_at ON app_error_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_user_id ON app_error_log(user_id);
CREATE INDEX IF NOT EXISTS idx_error_log_source ON app_error_log(source);

-- No RLS — audit table; POST endpoint handles auth server-side
ALTER TABLE app_error_log DISABLE ROW LEVEL SECURITY;

-- Auto-cleanup trigger: keeps table bounded to ~30 days of logs
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM app_error_log WHERE created_at < NOW() - INTERVAL '30 days';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cleanup_old_logs_trigger ON app_error_log;
CREATE TRIGGER cleanup_old_logs_trigger
  AFTER INSERT ON app_error_log
  FOR EACH STATEMENT
  EXECUTE FUNCTION cleanup_old_logs();
