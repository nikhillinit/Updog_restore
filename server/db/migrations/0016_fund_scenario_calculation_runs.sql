-- 0016_fund_scenario_calculation_runs.sql
-- ADR-022: append-only scenario retention and calculation-run governance.

BEGIN;

DROP INDEX IF EXISTS fund_snapshots_scenario_set_calculation_unique;

CREATE TABLE IF NOT EXISTS fund_scenario_calculation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id integer NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  scenario_set_id uuid NOT NULL REFERENCES fund_scenario_sets(id) ON DELETE CASCADE,
  source_config_id integer NOT NULL REFERENCES fundconfigs(id),
  source_config_version integer NOT NULL,
  calculation_mode varchar(48) NOT NULL,
  override_type varchar(48) NOT NULL,
  input_hash varchar(64) NOT NULL,
  job_id text,
  correlation_id varchar(36) NOT NULL,
  status varchar(24) NOT NULL,
  snapshot_id integer REFERENCES fund_snapshots(id),
  failure_code varchar(80),
  failure_message text,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS fund_scenario_calc_runs_active_dedup_idx
  ON fund_scenario_calculation_runs (
    scenario_set_id,
    source_config_id,
    source_config_version,
    input_hash
  )
  WHERE status IN ('queued', 'running', 'completed');

CREATE UNIQUE INDEX IF NOT EXISTS fund_snapshots_scenarios_dedup_idx
  ON fund_snapshots (
    fund_id,
    scenario_set_id,
    config_id,
    config_version,
    state_hash
  )
  WHERE type = 'SCENARIOS'
    AND scenario_set_id IS NOT NULL
    AND config_id IS NOT NULL
    AND config_version IS NOT NULL
    AND state_hash IS NOT NULL;

COMMIT;
