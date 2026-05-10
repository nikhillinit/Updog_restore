-- Phase 1c: metric-run commit idempotency.
-- The server computes a content-sensitive inputs_hash for each metric-run
-- commit. This unique index makes repeated draft commits race-safe.

CREATE UNIQUE INDEX IF NOT EXISTS lp_metric_runs_fund_run_inputs_unique
  ON lp_metric_runs(fund_id, run_type, perspective, as_of_date, inputs_hash);
