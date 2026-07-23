-- @drift-patch
-- Reason: Task 13 (R23/R24/R35) — append-only current-forecast reference pins for incident-held display,
-- fund_calculation_modes activation event columns, and substrate-shadow representability widening.

CREATE TABLE IF NOT EXISTS "current_forecast_references" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "calculation_key" text NOT NULL DEFAULT 'current_forecast',
  "fund_snapshot_id" integer NOT NULL,
  "current_plan_version_id" integer NOT NULL,
  "financial_facts_snapshot_id" integer NOT NULL,
  "input_hash" text NOT NULL,
  "result_hash" text NOT NULL,
  "assumptions_hash" text NOT NULL,
  "engine_version" text NOT NULL,
  "methodology_version" text NOT NULL,
  "candidate" boolean NOT NULL DEFAULT true,
  "superseded_by_reference_id" integer,
  "reason" text,
  "created_by" integer,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "current_forecast_references_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "current_forecast_references_superseded_by_fk"
    FOREIGN KEY ("superseded_by_reference_id") REFERENCES "public"."current_forecast_references"("id"),
  CONSTRAINT "current_forecast_references_fund_snapshot_fk"
    FOREIGN KEY ("fund_snapshot_id") REFERENCES "public"."fund_snapshots"("id"),
  CONSTRAINT "current_forecast_references_plan_version_fk"
    FOREIGN KEY ("current_plan_version_id") REFERENCES "public"."current_plan_versions"("id"),
  CONSTRAINT "current_forecast_references_facts_snapshot_fk"
    FOREIGN KEY ("financial_facts_snapshot_id") REFERENCES "public"."financial_facts_snapshots"("id"),
  CONSTRAINT "current_forecast_references_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "current_forecast_references_fund_idempotency_unique"
    UNIQUE ("fund_id", "idempotency_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_current_forecast_references_fund_created"
  ON "current_forecast_references" ("fund_id", "created_at" DESC);
--> statement-breakpoint
-- one accepted served-pointer head per fund (non-superseded, non-candidate)
CREATE UNIQUE INDEX IF NOT EXISTS "current_forecast_references_fund_accepted_head_unique"
  ON "current_forecast_references" ("fund_id")
  WHERE "superseded_by_reference_id" IS NULL AND "candidate" = false;
--> statement-breakpoint

-- fund_calculation_modes activation event columns (R24/R35)
ALTER TABLE "fund_calculation_modes" ADD COLUMN IF NOT EXISTS "activated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "fund_calculation_modes" ADD COLUMN IF NOT EXISTS "cutover_reference_id" integer;
--> statement-breakpoint
ALTER TABLE "fund_calculation_modes"
  ADD CONSTRAINT "fund_calculation_modes_cutover_reference_fk"
  FOREIGN KEY ("cutover_reference_id") REFERENCES "public"."current_forecast_references"("id");
--> statement-breakpoint

-- substrate_shadow_reconciliations representability (R23/R35)
ALTER TABLE "substrate_shadow_reconciliations"
  DROP CONSTRAINT IF EXISTS "substrate_shadow_reconciliations_substrate_state_check";
--> statement-breakpoint
ALTER TABLE "substrate_shadow_reconciliations"
  ADD CONSTRAINT "substrate_shadow_reconciliations_substrate_state_check"
  CHECK ("substrate_state" IN ('available','indicative','unavailable','failed'));
--> statement-breakpoint
ALTER TABLE "substrate_shadow_reconciliations" ALTER COLUMN "result_hash" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "substrate_shadow_reconciliations"
  ADD CONSTRAINT "substrate_shadow_reconciliations_result_hash_state_check"
  CHECK ("result_hash" IS NOT NULL OR "substrate_state" IN ('unavailable','failed'));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "substrate_shadow_reconciliations_fund_key_input_null_hash_unique"
  ON "substrate_shadow_reconciliations" ("fund_id", "calculation_key", "input_hash")
  WHERE "result_hash" IS NULL;
