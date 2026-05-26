-- 0014_fund_scenario_calculated_event.sql
-- ADR-022: scenario calculations write fund_snapshots rows and must be audit-visible.

BEGIN;

ALTER TABLE fund_scenario_set_events
  DROP CONSTRAINT IF EXISTS fund_scenario_set_events_type_check;

ALTER TABLE fund_scenario_set_events
  ADD CONSTRAINT fund_scenario_set_events_type_check
  CHECK (event_type IN ('created', 'updated', 'archived', 'calculated'));

COMMIT;
