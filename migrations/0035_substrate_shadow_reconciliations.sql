-- @drift-patch
-- Reason: add an append-only fund-scoped ledger of constrained-reserve substrate shadow reconciliation observations (ADR-050).

CREATE TABLE IF NOT EXISTS "substrate_shadow_reconciliations" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "calculation_key" text NOT NULL,
  "configured_mode" varchar(8) NOT NULL,
  "effective_mode" varchar(8) NOT NULL,
  "kill_switch_active" boolean NOT NULL,
  "substrate_state" varchar(16) NOT NULL,
  "reconciliation_status" varchar(16) NOT NULL,
  "input_hash" text NOT NULL,
  "result_hash" text NOT NULL,
  "assumptions_hash" text NOT NULL,
  "mismatches" jsonb NOT NULL,
  "observed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "substrate_shadow_reconciliations_fund_key_input_result_unique"
    UNIQUE ("fund_id", "calculation_key", "input_hash", "result_hash"),
  CONSTRAINT "substrate_shadow_reconciliations_configured_mode_check"
    CHECK ("configured_mode" IN ('off', 'shadow', 'on')),
  CONSTRAINT "substrate_shadow_reconciliations_effective_mode_check"
    CHECK ("effective_mode" IN ('off', 'shadow', 'on')),
  CONSTRAINT "substrate_shadow_reconciliations_substrate_state_check"
    CHECK ("substrate_state" IN ('available', 'indicative')),
  CONSTRAINT "substrate_shadow_reconciliations_reconciliation_status_check"
    CHECK ("reconciliation_status" IN ('match', 'mismatch')),
  CONSTRAINT "substrate_shadow_reconciliations_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_substrate_shadow_reconciliations_fund_observed"
  ON "substrate_shadow_reconciliations" ("fund_id", "observed_at" DESC);
