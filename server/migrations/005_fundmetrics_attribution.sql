-- Migration 005: Add calc-run attribution columns to fund_metrics
-- Decision 0.1a of variance automation Phase 0
--
-- Adds run_id, config_id, config_version so baseline creation can read
-- KPIs keyed to a specific completed calc-run. Also adds baseline lineage
-- support and closes the default/sourceRunId uniqueness gaps for automation.
-- Also adds as_of_date
-- which the ORM schema references but was never migrated.
-- All new columns are nullable for backward compatibility with legacy rows.

ALTER TABLE fund_metrics ADD COLUMN IF NOT EXISTS as_of_date TIMESTAMP;
ALTER TABLE fund_metrics ADD COLUMN IF NOT EXISTS run_id INTEGER REFERENCES calc_runs(id);
ALTER TABLE fund_metrics ADD COLUMN IF NOT EXISTS config_id INTEGER REFERENCES fundconfigs(id);
ALTER TABLE fund_metrics ADD COLUMN IF NOT EXISTS config_version INTEGER;
ALTER TABLE fund_baselines ADD COLUMN IF NOT EXISTS source_run_id INTEGER REFERENCES calc_runs(id);

-- Composite index for attributed KPI lookups (fundId + runId + metricDate DESC)
CREATE INDEX IF NOT EXISTS fund_metrics_fund_metric_date_idx
  ON fund_metrics (fund_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS fund_metrics_run_lookup_idx
  ON fund_metrics (fund_id, run_id, metric_date DESC);
WITH ranked_run_metrics AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY fund_id, run_id
      ORDER BY metric_date DESC NULLS LAST, id DESC
    ) AS row_num
  FROM fund_metrics
  WHERE run_id IS NOT NULL
)
UPDATE fund_metrics
SET
  run_id = NULL,
  config_id = NULL,
  config_version = NULL
WHERE id IN (
  SELECT id FROM ranked_run_metrics WHERE row_num > 1
);
CREATE UNIQUE INDEX IF NOT EXISTS fund_metrics_run_unique
  ON fund_metrics (fund_id, run_id)
  WHERE run_id IS NOT NULL;

WITH ranked_defaults AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY fund_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS row_num
  FROM fund_baselines
  WHERE is_default = true AND is_active = true
)
UPDATE fund_baselines
SET is_default = false
WHERE id IN (
  SELECT id FROM ranked_defaults WHERE row_num > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS fund_baselines_default_unique
  ON fund_baselines (fund_id)
  WHERE is_default = true AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS fund_baselines_source_run_unique
  ON fund_baselines (fund_id, source_run_id)
  WHERE source_run_id IS NOT NULL;
