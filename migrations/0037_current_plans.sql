-- @drift-patch
-- Reason: immutable accepted current-plan versions (fund-config-to-current-plan/1.0.0) per PLAN_61 Task 12.0.

CREATE TABLE IF NOT EXISTS "current_plan_versions" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "version" integer NOT NULL,
  "source_config_id" integer NOT NULL,
  "source_config_version" integer NOT NULL,
  "source_facts_snapshot_id" integer NOT NULL,
  "deployable_capital_usd" numeric(20, 6) NOT NULL,
  "plan_transformation_version" text NOT NULL,
  "allocations" jsonb NOT NULL,
  "pacing_assumptions" jsonb NOT NULL,
  "cohort_assumptions" jsonb NOT NULL,
  "reserve_policy_version" text NOT NULL,
  "assumptions_hash" text NOT NULL,
  "supersedes_version_id" integer,
  "superseded_by_version_id" integer,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "current_plan_versions_fund_idempotency_unique"
    UNIQUE ("fund_id", "idempotency_key"),
  CONSTRAINT "current_plan_versions_fund_version_unique"
    UNIQUE ("fund_id", "version"),
  CONSTRAINT "current_plan_versions_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "current_plan_versions_source_facts_snapshot_id_fk"
    FOREIGN KEY ("source_facts_snapshot_id") REFERENCES "public"."financial_facts_snapshots"("id") ON DELETE cascade,
  CONSTRAINT "current_plan_versions_supersedes_version_id_fk"
    FOREIGN KEY ("supersedes_version_id") REFERENCES "public"."current_plan_versions"("id"),
  CONSTRAINT "current_plan_versions_superseded_by_version_id_fk"
    FOREIGN KEY ("superseded_by_version_id") REFERENCES "public"."current_plan_versions"("id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "current_plan_versions_fund_head_unique"
  ON "current_plan_versions" ("fund_id") WHERE "superseded_by_version_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_current_plan_versions_fund_created"
  ON "current_plan_versions" ("fund_id", "created_at" DESC);
