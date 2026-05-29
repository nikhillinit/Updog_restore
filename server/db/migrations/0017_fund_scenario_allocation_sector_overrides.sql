-- 0017_fund_scenario_allocation_sector_overrides.sql
-- ADR-022: add allocation and sector-profile scenario override types.

BEGIN;

ALTER TABLE fund_scenario_variants
  DROP CONSTRAINT IF EXISTS fund_scenario_variants_override_type_check;

ALTER TABLE fund_scenario_variants
  ADD CONSTRAINT fund_scenario_variants_override_type_check
  CHECK (override_type IN (
    'fee_profile',
    'reserve_allocation',
    'allocation',
    'sector_profile'
  ));

COMMIT;
