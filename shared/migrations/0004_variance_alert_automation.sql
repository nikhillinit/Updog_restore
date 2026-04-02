-- Migration: 0004_variance_alert_automation.sql
-- Purpose:
-- 1. Add a business-key dedupe seam to job_outbox for scheduled alert evaluation.
-- 2. Add a replay ledger for calc-run and scheduled alert executions.
-- 3. Enforce one open alert incident per (fund, baseline, rule).

ALTER TABLE job_outbox
ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_outbox_job_type_dedupe
  ON job_outbox (job_type, dedupe_key);

CREATE TABLE IF NOT EXISTS alert_evaluation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_key TEXT NOT NULL,
  source TEXT NOT NULL,
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  baseline_id UUID NOT NULL REFERENCES fund_baselines(id),
  rule_id UUID NOT NULL REFERENCES alert_rules(id),
  run_id INTEGER REFERENCES calc_runs(id),
  frequency TEXT,
  window_start TIMESTAMPTZ,
  applied_alert_id UUID REFERENCES performance_alerts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS alert_evaluation_executions_execution_key_unique
  ON alert_evaluation_executions (execution_key);

CREATE INDEX IF NOT EXISTS alert_evaluation_executions_fund_rule_idx
  ON alert_evaluation_executions (fund_id, rule_id, created_at DESC);

WITH ranked_open_incidents AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY fund_id, baseline_id, rule_id
      ORDER BY triggered_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS row_num
  FROM performance_alerts
  WHERE baseline_id IS NOT NULL
    AND rule_id IS NOT NULL
    AND status IN ('active', 'acknowledged', 'investigating')
)
UPDATE performance_alerts
SET
  status = 'resolved',
  resolution_notes = COALESCE(
    resolution_notes,
    'Resolved during migration cleanup before open incident uniqueness enforcement'
  ),
  resolved_at = COALESCE(resolved_at, NOW()),
  updated_at = NOW()
WHERE id IN (
  SELECT id
  FROM ranked_open_incidents
  WHERE row_num > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS performance_alerts_open_incident_unique
  ON performance_alerts (fund_id, baseline_id, rule_id)
  WHERE rule_id IS NOT NULL
    AND baseline_id IS NOT NULL
    AND status IN ('active', 'acknowledged', 'investigating');
