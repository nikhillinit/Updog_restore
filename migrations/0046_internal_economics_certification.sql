-- @drift-patch
-- Reason: Trust-Spine PR1 issue #1264 widens internal LP economics persistence
-- for versioned calculation contracts and the certified three-state result union.
-- Historical rows remain untouched; nullable contract identity is legacy-only.

DO $$
BEGIN
  ALTER TABLE "internal_lp_economics_runs"
    ADD COLUMN IF NOT EXISTS "calculation_contract_version" text;

  COMMENT ON COLUMN "internal_lp_economics_runs"."calculation_contract_version"
    IS 'null is legacy-only and requires registry verification';

  ALTER TABLE "internal_lp_economics_runs"
    DROP CONSTRAINT IF EXISTS "internal_lp_economics_runs_result_status_check";

  ALTER TABLE "internal_lp_economics_runs"
    ADD CONSTRAINT "internal_lp_economics_runs_result_status_check"
    CHECK (
      "result_status" IS NULL
      OR "result_status" IN ('available','indicative','unavailable')
    );
END $$;
--> statement-breakpoint
