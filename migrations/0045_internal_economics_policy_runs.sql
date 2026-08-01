-- @drift-patch
-- Reason: Task 16.3 WP-L3 Phase A (ADR-065 items 2/3/6) — internal LP economics
-- persistence tier: immutable capital-envelope versions (Brief 3), immutable
-- economics-policy versions (D3/P-D6), and pure-lineage run rows (P-D4/P-D5),
-- landing dormant ahead of their services (0038/0044 posture). Adds the
-- fund_snapshots (id, type) unique so run rows can pin snapshot TYPE with a
-- composite FK (P-D3), and the repo's first DB-enforced immutability trigger
-- (P-D2): BEFORE UPDATE forbid on the three new tables plus a type-scoped
-- forbid on fund_snapshots INTERNAL_LP_ECONOMICS rows (both OLD and NEW type,
-- so a row cannot be laundered INTO the protected type). Replay-safe by
-- construction: CREATE TABLE/INDEX IF NOT EXISTS, guarded ADD CONSTRAINT,
-- CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS + CREATE TRIGGER.

-- Snapshot TYPE becomes DB-enforced (P-D3). Trivially valid: "id" is the PK.
-- Guarded for replay safety; scoped to fund_snapshots via conrelid.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fund_snapshots_id_type_unique'
      AND conrelid = 'public.fund_snapshots'::regclass
  ) THEN
    ALTER TABLE "fund_snapshots"
      ADD CONSTRAINT "fund_snapshots_id_type_unique" UNIQUE ("id", "type");
  END IF;
END $$;
--> statement-breakpoint

-- Immutable legal capital envelope (Brief 3). Corrections insert child
-- versions via parent_envelope_version_id; rows are never updated (trigger
-- below). Every basis-version FK is ON DELETE restrict (D8, L3-Q2 ruling);
-- version-lineage self-FKs stay NO ACTION (correction-chain, not a basis pin).
CREATE TABLE IF NOT EXISTS "internal_capital_envelope_versions" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "version" integer NOT NULL,
  "main_fund_vehicle_id" integer NOT NULL,
  "lp_commitment_usd" numeric(20,6) NOT NULL,
  "gp_commitment_usd" numeric(20,6) NOT NULL,
  "total_commitment_usd" numeric(20,6) NOT NULL,
  "currency" varchar(3) NOT NULL,
  "effective_at" timestamp with time zone NOT NULL,
  "source_artifact_id" integer NOT NULL,
  "source_config_id" integer NOT NULL,
  "source_config_version" integer NOT NULL,
  "source_config_hash" varchar(64) NOT NULL,
  "attested_by" integer NOT NULL,
  "attested_at" timestamp with time zone NOT NULL,
  "envelope_hash" varchar(64) NOT NULL,
  "parent_envelope_version_id" integer,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "internal_capital_envelope_versions_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "internal_capital_envelope_versions_vehicle_fund_fk"
    FOREIGN KEY ("main_fund_vehicle_id", "fund_id")
    REFERENCES "public"."vehicles"("id", "fund_id") ON DELETE restrict,
  CONSTRAINT "internal_capital_envelope_versions_source_artifact_fund_fk"
    FOREIGN KEY ("source_artifact_id", "fund_id")
    REFERENCES "public"."source_artifacts"("id", "fund_id") ON DELETE restrict,
  CONSTRAINT "internal_capital_envelope_versions_attested_by_fk"
    FOREIGN KEY ("attested_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "internal_capital_envelope_versions_parent_fund_fk"
    FOREIGN KEY ("parent_envelope_version_id", "fund_id")
    REFERENCES "public"."internal_capital_envelope_versions"("id", "fund_id"),
  CONSTRAINT "internal_capital_envelope_versions_id_fund_unique"
    UNIQUE ("id", "fund_id"),
  CONSTRAINT "internal_capital_envelope_versions_fund_version_unique"
    UNIQUE ("fund_id", "version"),
  CONSTRAINT "internal_capital_envelope_versions_fund_idempotency_unique"
    UNIQUE ("fund_id", "idempotency_key"),
  CONSTRAINT "internal_capital_envelope_versions_currency_check"
    CHECK ("currency" = 'USD'),
  CONSTRAINT "internal_capital_envelope_versions_lp_nonnegative_check"
    CHECK ("lp_commitment_usd" >= 0),
  CONSTRAINT "internal_capital_envelope_versions_gp_nonnegative_check"
    CHECK ("gp_commitment_usd" >= 0),
  CONSTRAINT "internal_capital_envelope_versions_total_positive_check"
    CHECK ("total_commitment_usd" > 0),
  CONSTRAINT "internal_capital_envelope_versions_commitment_sum_check"
    CHECK ("lp_commitment_usd" + "gp_commitment_usd" = "total_commitment_usd"),
  CONSTRAINT "internal_capital_envelope_versions_no_self_parent_check"
    CHECK ("parent_envelope_version_id" IS NULL OR "parent_envelope_version_id" <> "id")
);
--> statement-breakpoint

-- Immutable authored economics policy (D3 minimum columns + P-D6). The
-- terminal pair lives in dedicated columns, written exclusively via the
-- exported terminal-policy helpers (G11; ADR-065 item 8). The envelope pin is
-- a basis-version FK (restrict); the parent self-FK is lineage (NO ACTION).
CREATE TABLE IF NOT EXISTS "internal_economics_policy_versions" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "version" integer NOT NULL,
  "policy_schema_version" text NOT NULL,
  "policy_body" jsonb NOT NULL,
  "normalization_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "terminal_period_end" date NOT NULL,
  "terminal_resolution_methodology_version" text NOT NULL,
  "capital_envelope_version_id" integer NOT NULL,
  "assumptions_hash" text NOT NULL,
  "source_config_id" integer NOT NULL,
  "source_config_version" integer NOT NULL,
  "parent_policy_version_id" integer,
  "created_by" integer,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "internal_economics_policy_versions_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "internal_economics_policy_versions_envelope_fund_fk"
    FOREIGN KEY ("capital_envelope_version_id", "fund_id")
    REFERENCES "public"."internal_capital_envelope_versions"("id", "fund_id") ON DELETE restrict,
  CONSTRAINT "internal_economics_policy_versions_parent_fund_fk"
    FOREIGN KEY ("parent_policy_version_id", "fund_id")
    REFERENCES "public"."internal_economics_policy_versions"("id", "fund_id"),
  CONSTRAINT "internal_economics_policy_versions_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "internal_economics_policy_versions_id_fund_unique"
    UNIQUE ("id", "fund_id"),
  CONSTRAINT "internal_economics_policy_versions_fund_version_unique"
    UNIQUE ("fund_id", "version"),
  CONSTRAINT "internal_economics_policy_versions_fund_idempotency_unique"
    UNIQUE ("fund_id", "idempotency_key"),
  CONSTRAINT "internal_economics_policy_versions_no_self_parent_check"
    CHECK ("parent_policy_version_id" IS NULL OR "parent_policy_version_id" <> "id")
);
--> statement-breakpoint

-- Pure lineage run rows (ADR-065 item 2 + P-D3/P-D5): FKs + hashes + state,
-- never result values. Result payloads live in fund_snapshots
-- (type = 'INTERNAL_LP_ECONOMICS'), pinned here through the typed composite
-- FK onto fund_snapshots (id, type). The state-coupling CHECK makes a
-- completed run structurally inseparable from exactly one result snapshot and
-- a failed run structurally unable to carry one. result_status admits only
-- 'indicative' | 'unavailable' so 'available' is DB-unreachable until the
-- certification act amends this constraint (D-11 addendum).
CREATE TABLE IF NOT EXISTS "internal_lp_economics_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "policy_version_id" integer NOT NULL,
  "facts_snapshot_id" integer NOT NULL,
  "plan_version_id" integer NOT NULL,
  "forecast_snapshot_id" integer NOT NULL,
  "forecast_snapshot_type" varchar(50) NOT NULL,
  "result_snapshot_id" integer,
  "result_snapshot_type" varchar(50),
  "run_state" varchar(16) NOT NULL,
  "result_status" varchar(16),
  "failure_code" text,
  "failure_context" jsonb,
  "evaluation_clock" timestamp with time zone NOT NULL,
  "terminal_mode" varchar(24) NOT NULL,
  "engine_version" text NOT NULL,
  "methodology_version" text NOT NULL,
  "input_hash" varchar(64) NOT NULL,
  "result_hash" varchar(64),
  "created_by" integer,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "internal_lp_economics_runs_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "internal_lp_economics_runs_policy_version_fund_fk"
    FOREIGN KEY ("policy_version_id", "fund_id")
    REFERENCES "public"."internal_economics_policy_versions"("id", "fund_id") ON DELETE restrict,
  CONSTRAINT "internal_lp_economics_runs_facts_snapshot_fund_fk"
    FOREIGN KEY ("facts_snapshot_id", "fund_id")
    REFERENCES "public"."financial_facts_snapshots"("id", "fund_id") ON DELETE restrict,
  CONSTRAINT "internal_lp_economics_runs_plan_version_fk"
    FOREIGN KEY ("plan_version_id")
    REFERENCES "public"."current_plan_versions"("id") ON DELETE restrict,
  CONSTRAINT "internal_lp_economics_runs_forecast_snapshot_type_fk"
    FOREIGN KEY ("forecast_snapshot_id", "forecast_snapshot_type")
    REFERENCES "public"."fund_snapshots"("id", "type") ON DELETE restrict,
  CONSTRAINT "internal_lp_economics_runs_result_snapshot_type_fk"
    FOREIGN KEY ("result_snapshot_id", "result_snapshot_type")
    REFERENCES "public"."fund_snapshots"("id", "type") ON DELETE restrict,
  CONSTRAINT "internal_lp_economics_runs_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "internal_lp_economics_runs_id_fund_unique"
    UNIQUE ("id", "fund_id"),
  CONSTRAINT "internal_lp_economics_runs_fund_idempotency_unique"
    UNIQUE ("fund_id", "idempotency_key"),
  CONSTRAINT "internal_lp_economics_runs_run_state_check"
    CHECK ("run_state" IN ('completed','failed')),
  CONSTRAINT "internal_lp_economics_runs_result_status_check"
    CHECK ("result_status" IS NULL OR "result_status" IN ('indicative','unavailable')),
  CONSTRAINT "internal_lp_economics_runs_terminal_mode_check"
    CHECK ("terminal_mode" IN ('liquidate_at_horizon','hold_unrealized')),
  CONSTRAINT "internal_lp_economics_runs_forecast_snapshot_type_check"
    CHECK ("forecast_snapshot_type" = 'CURRENT_FORECAST_V2'),
  CONSTRAINT "internal_lp_economics_runs_result_snapshot_type_check"
    CHECK ("result_snapshot_type" IS NULL OR "result_snapshot_type" = 'INTERNAL_LP_ECONOMICS'),
  CONSTRAINT "internal_lp_economics_runs_state_coupling_check"
    CHECK (
      (
        "run_state" = 'completed'
        AND "result_snapshot_id" IS NOT NULL
        AND "result_snapshot_type" IS NOT NULL
        AND "result_status" IS NOT NULL
        AND "result_hash" IS NOT NULL
        AND "failure_code" IS NULL
        AND "failure_context" IS NULL
      )
      OR (
        "run_state" = 'failed'
        AND "result_snapshot_id" IS NULL
        AND "result_snapshot_type" IS NULL
        AND "result_status" IS NULL
        AND "result_hash" IS NULL
        AND "failure_code" IS NOT NULL
        AND "failure_context" IS NOT NULL
      )
    )
);
--> statement-breakpoint

-- Exactly one run may pin a given result snapshot (P-D4 one-to-one linkage;
-- partial uniques cannot be UNIQUE constraints in PG, and nothing FKs this
-- index, so the 42830 unique()-not-uniqueIndex lesson does not apply here).
CREATE UNIQUE INDEX IF NOT EXISTS "internal_lp_economics_runs_result_snapshot_unique"
  ON "internal_lp_economics_runs" ("result_snapshot_id")
  WHERE "result_snapshot_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_internal_lp_economics_runs_fund_created"
  ON "internal_lp_economics_runs" ("fund_id", "created_at" DESC);
--> statement-breakpoint

-- P-D2: one shared BEFORE UPDATE forbid function. Whole-row: every UPDATE is
-- forbidden (strictly contains ADR-065 item 2's "immutability of body, hash,
-- and provenance"). DELETE is deliberately NOT trigger-blocked: direct deletes
-- of referenced rows already fail via the restrict FK web, and DB-enforced
-- immutability only ever meant no-UPDATE.
CREATE OR REPLACE FUNCTION "internal_economics_forbid_update"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'immutable_row_update_forbidden: %', TG_TABLE_NAME;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "internal_capital_envelope_versions_forbid_update_trigger"
  ON "internal_capital_envelope_versions";
--> statement-breakpoint
CREATE TRIGGER "internal_capital_envelope_versions_forbid_update_trigger"
  BEFORE UPDATE ON "internal_capital_envelope_versions"
  FOR EACH ROW EXECUTE FUNCTION "internal_economics_forbid_update"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "internal_economics_policy_versions_forbid_update_trigger"
  ON "internal_economics_policy_versions";
--> statement-breakpoint
CREATE TRIGGER "internal_economics_policy_versions_forbid_update_trigger"
  BEFORE UPDATE ON "internal_economics_policy_versions"
  FOR EACH ROW EXECUTE FUNCTION "internal_economics_forbid_update"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "internal_lp_economics_runs_forbid_update_trigger"
  ON "internal_lp_economics_runs";
--> statement-breakpoint
CREATE TRIGGER "internal_lp_economics_runs_forbid_update_trigger"
  BEFORE UPDATE ON "internal_lp_economics_runs"
  FOR EACH ROW EXECUTE FUNCTION "internal_economics_forbid_update"();
--> statement-breakpoint

-- Type-scoped fourth trigger (P-D2 R1/R3 amendments): the result VALUE payload
-- lives in fund_snapshots, which has a live in-place UPDATE code path for
-- other snapshot types. The WHEN clause covers BOTH directions — updating a
-- protected row AND laundering another row INTO the protected type — while
-- leaving every other snapshot type's existing mutability untouched.
DROP TRIGGER IF EXISTS "fund_snapshots_internal_economics_forbid_update_trigger"
  ON "fund_snapshots";
--> statement-breakpoint
CREATE TRIGGER "fund_snapshots_internal_economics_forbid_update_trigger"
  BEFORE UPDATE ON "fund_snapshots"
  FOR EACH ROW
  WHEN (OLD."type" = 'INTERNAL_LP_ECONOMICS' OR NEW."type" = 'INTERNAL_LP_ECONOMICS')
  EXECUTE FUNCTION "internal_economics_forbid_update"();
