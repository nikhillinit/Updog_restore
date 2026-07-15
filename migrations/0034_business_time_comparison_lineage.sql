-- @drift-patch
-- Reason: add owner-authored business-time attestations without backfilling legacy rows.

ALTER TABLE "calc_runs"
  ADD COLUMN IF NOT EXISTS "model_inputs_as_of_date" date,
  ADD COLUMN IF NOT EXISTS "comparison_lineage_version" varchar(48);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'calc_runs_comparison_lineage_check'
  ) THEN
    ALTER TABLE "calc_runs"
      ADD CONSTRAINT "calc_runs_comparison_lineage_check"
      CHECK (
        (
          "comparison_lineage_version" IS NULL
          AND "model_inputs_as_of_date" IS NULL
        )
        OR (
          "comparison_lineage_version" = 'comparison-lineage-v1'
          AND "model_inputs_as_of_date" IS NOT NULL
        )
      );
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "fund_scenario_calculation_runs"
  ADD COLUMN IF NOT EXISTS "model_inputs_as_of_date" date,
  ADD COLUMN IF NOT EXISTS "comparison_lineage_version" varchar(48),
  ADD COLUMN IF NOT EXISTS "hash_kind" varchar(48);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'fund_scenario_calculation_runs_hash_kind_check'
  ) THEN
    ALTER TABLE "fund_scenario_calculation_runs"
      ADD CONSTRAINT "fund_scenario_calculation_runs_hash_kind_check"
      CHECK (
        "hash_kind" IS NULL
        OR "hash_kind" IN ('scenario-input-hash-v1', 'scenario-input-hash-v2')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'fund_scenario_calculation_runs_typed_input_hash_check'
  ) THEN
    ALTER TABLE "fund_scenario_calculation_runs"
      ADD CONSTRAINT "fund_scenario_calculation_runs_typed_input_hash_check"
      CHECK ("hash_kind" IS NULL OR "input_hash" ~ '^[a-f0-9]{64}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'fund_scenario_calculation_runs_comparison_lineage_check'
  ) THEN
    ALTER TABLE "fund_scenario_calculation_runs"
      ADD CONSTRAINT "fund_scenario_calculation_runs_comparison_lineage_check"
      CHECK (
        (
          "comparison_lineage_version" IS NULL
          AND "model_inputs_as_of_date" IS NULL
          AND (
            "hash_kind" IS NULL
            OR "hash_kind" = 'scenario-input-hash-v1'
          )
        )
        OR (
          "comparison_lineage_version" = 'comparison-lineage-v1'
          AND "model_inputs_as_of_date" IS NOT NULL
          AND "hash_kind" = 'scenario-input-hash-v2'
          AND "input_hash" ~ '^[a-f0-9]{64}$'
        )
      );
  END IF;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "fund_scenario_calc_runs_active_dedup_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "fund_scenario_calc_runs_active_dedup_idx"
  ON "fund_scenario_calculation_runs" (
    "scenario_set_id",
    "source_config_id",
    "source_config_version",
    COALESCE("hash_kind", 'scenario-input-hash-v1'),
    "input_hash"
  )
  WHERE "status" IN ('queued', 'running', 'completed');
