-- 0012_scenario_set_id.sql
-- ADR-022: Add nullable scenario_set_id to fund_snapshots for scenario isolation.
-- Authoritative reads filter scenario_set_id IS NULL.
-- Scenario reads filter on a specific scenario_set_id.

BEGIN;

ALTER TABLE fund_snapshots ADD COLUMN IF NOT EXISTS scenario_set_id UUID NULL;

CREATE INDEX IF NOT EXISTS idx_fund_snapshots_authoritative
  ON fund_snapshots(fund_id, type, config_version, snapshot_time DESC)
  WHERE scenario_set_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_fund_snapshots_scenario_set
  ON fund_snapshots(fund_id, scenario_set_id, type, config_version)
  WHERE scenario_set_id IS NOT NULL;

COMMIT;
