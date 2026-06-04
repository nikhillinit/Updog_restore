-- 0015_fund_scenario_reserve_allocation.sql
-- ADR-022: add reserve-allocation scenario contract support and async lifecycle events.

BEGIN;

ALTER TABLE fund_scenario_variants
  DROP CONSTRAINT IF EXISTS fund_scenario_variants_override_type_check;

ALTER TABLE fund_scenario_variants
  ADD CONSTRAINT fund_scenario_variants_override_type_check
  CHECK (override_type IN ('fee_profile', 'reserve_allocation'));

ALTER TABLE fund_scenario_set_events
  DROP CONSTRAINT IF EXISTS fund_scenario_set_events_type_check;

ALTER TABLE fund_scenario_set_events
  ADD CONSTRAINT fund_scenario_set_events_type_check
  CHECK (event_type IN (
    'created',
    'updated',
    'archived',
    'calculated',
    'calculation_queued',
    'calculation_started',
    'calculation_failed'
  ));

COMMIT;
