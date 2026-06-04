-- 0014_fund_scenario_calculated_event.sql
-- ADR-022: scenario calculations write fund_snapshots rows and must be audit-visible.

BEGIN;

ALTER TABLE fund_scenario_set_events
  DROP CONSTRAINT IF EXISTS fund_scenario_set_events_type_check;

ALTER TABLE fund_scenario_set_events
  ADD CONSTRAINT fund_scenario_set_events_type_check
  CHECK (event_type IN ('created', 'updated', 'archived', 'calculated'));

CREATE UNIQUE INDEX IF NOT EXISTS fund_snapshots_scenario_set_calculation_unique
  ON fund_snapshots(fund_id, scenario_set_id)
  WHERE scenario_set_id IS NOT NULL
    AND type = 'SCENARIOS';

COMMIT;
