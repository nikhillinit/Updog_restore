-- LP Reporting narrative draft foundation.
-- Enforces idempotent one-draft-per-type creation for locked metric runs.

CREATE UNIQUE INDEX IF NOT EXISTS narrative_runs_metric_run_type_unique
  ON narrative_runs(metric_run_id, narrative_type);
