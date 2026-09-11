-- @drift-patch
-- Reason: Add capital-plan scenario variants while preserving all existing override modes.
-- Replacing the CHECK validates existing rows without rewriting stored payloads.

DO $$
BEGIN
  ALTER TABLE "fund_scenario_variants"
    DROP CONSTRAINT IF EXISTS "fund_scenario_variants_override_type_check";

  ALTER TABLE "fund_scenario_variants"
    ADD CONSTRAINT "fund_scenario_variants_override_type_check"
    CHECK ("override_type" IN (
      'fee_profile',
      'reserve_allocation',
      'allocation',
      'sector_profile',
      'methodology',
      'capital_plan'
    ));
END
$$;
--> statement-breakpoint
