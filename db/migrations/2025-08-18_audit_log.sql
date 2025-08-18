CREATE TABLE IF NOT EXISTS deployment_audit (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  environment TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  version TEXT,
  pr_numbers TEXT[],
  checks JSONB,
  decision TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_deploy_audit_env_ts ON deployment_audit(environment, ts DESC);
