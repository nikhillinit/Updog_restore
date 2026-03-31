-- Rollback: Allocation scenario audit events and header metadata

ALTER TABLE allocation_scenarios
  DROP COLUMN IF EXISTS last_synced_by,
  DROP COLUMN IF EXISTS last_synced_at,
  DROP COLUMN IF EXISTS last_applied_allocation_version,
  DROP COLUMN IF EXISTS last_applied_by,
  DROP COLUMN IF EXISTS last_applied_at;

DROP INDEX IF EXISTS allocation_scenario_events_fund_created_idx;
DROP INDEX IF EXISTS allocation_scenario_events_scenario_created_idx;
DROP TABLE IF EXISTS allocation_scenario_events CASCADE;
