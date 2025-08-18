-- db/migrations/2025_08_17_retention_audit.sql
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  changes JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ
  GENERATED ALWAYS AS (created_at + INTERVAL '7 years') STORED;

CREATE INDEX IF NOT EXISTS idx_audit_retention ON audit_log(retention_until);

-- Requires pg_cron extension in the DB
-- Nightly cleanup at 02:00 UTC
-- SELECT cron.schedule('cleanup-audit', '0 2 * * *', $$DELETE FROM audit_log WHERE retention_until < NOW();$$);
