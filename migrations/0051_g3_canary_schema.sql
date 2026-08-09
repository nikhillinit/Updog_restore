-- @drift-patch
-- Reason: F_1.2.5 Phase 2 schema layer adds canary-principal identity,
-- release-run lifecycle/residue accounting, and fund origin markers.
-- Additive and replay-safe. Drizzle owns the surrounding transaction.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "is_release_canary_principal" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "release_canary_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "release_version" varchar(64) NOT NULL,
  "release_sha" varchar(64) NOT NULL,
  "deployment_id" varchar(128) NOT NULL,
  "worker_deployment_id" varchar(128) NOT NULL,
  "correlation_id" varchar(128) NOT NULL,
  "principal_user_id" integer NOT NULL,
  "status" varchar(16) DEFAULT 'created' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "purged_at" timestamp with time zone,
  "portfolio_company_residue_count" integer DEFAULT 0 NOT NULL,
  "fund_residue_count" integer DEFAULT 0 NOT NULL,
  "fund_config_residue_count" integer DEFAULT 0 NOT NULL,
  "fund_event_residue_count" integer DEFAULT 0 NOT NULL,
  "notification_residue_count" integer DEFAULT 0 NOT NULL,
  "total_residue_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "release_canary_runs_principal_user_id_users_id_fk"
    FOREIGN KEY ("principal_user_id") REFERENCES "users"("id") ON DELETE restrict,
  CONSTRAINT "release_canary_runs_status_check"
    CHECK ("status" IN ('created', 'running', 'completed', 'failed', 'expired', 'purged')),
  CONSTRAINT "release_canary_runs_version_check"
    CHECK ("version" >= 1),
  CONSTRAINT "release_canary_runs_residue_count_check"
    CHECK (
      "portfolio_company_residue_count" >= 0
      AND "fund_residue_count" >= 0
      AND "fund_config_residue_count" >= 0
      AND "fund_event_residue_count" >= 0
      AND "notification_residue_count" >= 0
      AND "total_residue_count" >= 0
    )
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "release_canary_runs_status_idx"
  ON "release_canary_runs" ("status", "expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_canary_runs_principal_idx"
  ON "release_canary_runs" ("principal_user_id");
--> statement-breakpoint

ALTER TABLE "funds"
  ADD COLUMN IF NOT EXISTS "data_origin" varchar(20) DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE "funds"
  ADD COLUMN IF NOT EXISTS "canary_run_id" uuid;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.funds'::regclass
      AND conname = 'funds_data_origin_check'
  ) THEN
    ALTER TABLE "funds"
      ADD CONSTRAINT "funds_data_origin_check"
      CHECK ("data_origin" IN ('production', 'release_canary'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.funds'::regclass
      AND conname = 'funds_canary_run_id_unique'
  ) THEN
    ALTER TABLE "funds"
      ADD CONSTRAINT "funds_canary_run_id_unique" UNIQUE ("canary_run_id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.funds'::regclass
      AND conname = 'funds_canary_origin_coupling_check'
  ) THEN
    ALTER TABLE "funds"
      ADD CONSTRAINT "funds_canary_origin_coupling_check"
      CHECK (
        ("data_origin" = 'production' AND "canary_run_id" IS NULL)
        OR ("data_origin" = 'release_canary' AND "canary_run_id" IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.funds'::regclass
      AND conname = 'funds_canary_run_id_release_canary_runs_id_fk'
  ) THEN
    ALTER TABLE "funds"
      ADD CONSTRAINT "funds_canary_run_id_release_canary_runs_id_fk"
      FOREIGN KEY ("canary_run_id") REFERENCES "release_canary_runs"("id") ON DELETE restrict;
  END IF;
END $$;
