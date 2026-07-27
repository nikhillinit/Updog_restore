-- @drift-patch
-- Reason: Production schema reconciliation needs manifest 09 to own the final
-- substrate_shadow_reconciliations shape. Migration 0038 keeps the same guards
-- for empty/replay clone compatibility.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'substrate_shadow_reconciliations_substrate_state_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%unavailable%'
  ) THEN
    ALTER TABLE "substrate_shadow_reconciliations"
      DROP CONSTRAINT "substrate_shadow_reconciliations_substrate_state_check";
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'substrate_shadow_reconciliations_substrate_state_check'
  ) THEN
    ALTER TABLE "substrate_shadow_reconciliations"
      ADD CONSTRAINT "substrate_shadow_reconciliations_substrate_state_check"
      CHECK ("substrate_state" IN ('available','indicative','unavailable','failed'));
  END IF;

  ALTER TABLE "substrate_shadow_reconciliations"
    ALTER COLUMN "result_hash" DROP NOT NULL;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'substrate_shadow_reconciliations_result_hash_state_check'
  ) THEN
    ALTER TABLE "substrate_shadow_reconciliations"
      ADD CONSTRAINT "substrate_shadow_reconciliations_result_hash_state_check"
      CHECK ("result_hash" IS NOT NULL OR "substrate_state" IN ('unavailable','failed'));
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "substrate_shadow_reconciliations_fund_key_input_null_hash_unique"
  ON "substrate_shadow_reconciliations" ("fund_id", "calculation_key", "input_hash")
  WHERE "result_hash" IS NULL;
