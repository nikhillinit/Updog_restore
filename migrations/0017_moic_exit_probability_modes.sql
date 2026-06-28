-- @drift-patch
-- Migration: 0017_moic_exit_probability_modes
-- Purpose: Add source-backed MOIC exit probability inputs and fund-scoped mode state.
-- Replay safety: guarded ALTERs, CREATE TABLE IF NOT EXISTS, guarded constraints/indexes.

ALTER TABLE "portfoliocompanies"
  ADD COLUMN IF NOT EXISTS "exit_probability" numeric(7,6);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.portfoliocompanies') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.portfoliocompanies'::regclass
         AND conname = 'portfoliocompanies_exit_probability_check'
     ) THEN
    ALTER TABLE "portfoliocompanies"
      ADD CONSTRAINT "portfoliocompanies_exit_probability_check"
      CHECK ("exit_probability" IS NULL OR ("exit_probability" >= 0 AND "exit_probability" <= 1));
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.reconciliation_runs') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.reconciliation_runs'::regclass
         AND conname = 'reconciliation_runs_idempotency_key_unique'
     ) THEN
    ALTER TABLE "reconciliation_runs"
      DROP CONSTRAINT "reconciliation_runs_idempotency_key_unique";
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.reconciliation_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.reconciliation_runs'::regclass
         AND conname = 'reconciliation_runs_fund_id_idempotency_key_unique'
     ) THEN
    ALTER TABLE "reconciliation_runs"
      ADD CONSTRAINT "reconciliation_runs_fund_id_idempotency_key_unique"
      UNIQUE ("fund_id", "idempotency_key");
  END IF;
END
$$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fund_calculation_modes" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "calculation_key" text NOT NULL,
  "configured_mode" varchar(16) DEFAULT 'off' NOT NULL,
  "kill_switch_active" boolean DEFAULT false NOT NULL,
  "shadow_started_at" timestamptz,
  "last_reconciliation_run_id" integer,
  "last_moic_source_input_hash" text,
  "last_candidate_output_hash" text,
  "version" integer DEFAULT 1 NOT NULL,
  "updated_by" integer,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "fund_calculation_modes_fund_calculation_key_unique" UNIQUE ("fund_id", "calculation_key"),
  CONSTRAINT "fund_calculation_modes_configured_mode_check" CHECK ("configured_mode" IN ('off','shadow','on')),
  CONSTRAINT "fund_calculation_modes_version_check" CHECK ("version" >= 1)
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.fund_calculation_modes') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.fund_calculation_modes'::regclass
         AND conname = 'fund_calculation_modes_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "fund_calculation_modes"
      ADD CONSTRAINT "fund_calculation_modes_fund_id_funds_id_fk"
      FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.fund_calculation_modes') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.fund_calculation_modes'::regclass
         AND conname = 'fund_calculation_modes_last_reconciliation_run_id_reconciliation_runs_id_fk'
     ) THEN
    ALTER TABLE "fund_calculation_modes"
      ADD CONSTRAINT "fund_calculation_modes_last_reconciliation_run_id_reconciliation_runs_id_fk"
      FOREIGN KEY ("last_reconciliation_run_id") REFERENCES "public"."reconciliation_runs"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.fund_calculation_modes') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.fund_calculation_modes'::regclass
         AND conname = 'fund_calculation_modes_updated_by_users_id_fk'
     ) THEN
    ALTER TABLE "fund_calculation_modes"
      ADD CONSTRAINT "fund_calculation_modes_updated_by_users_id_fk"
      FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fund_calculation_modes_fund_updated"
  ON "fund_calculation_modes" USING btree ("fund_id", "updated_at" DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fund_calculation_mode_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "calculation_key" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_hash" text NOT NULL,
  "response_status" integer,
  "response_body" jsonb,
  "created_by" integer,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  CONSTRAINT "fund_calculation_mode_requests_scope_unique" UNIQUE ("fund_id", "calculation_key", "idempotency_key"),
  CONSTRAINT "fund_calculation_mode_requests_status_check" CHECK ("status" IN ('pending','completed'))
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.fund_calculation_mode_requests') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.fund_calculation_mode_requests'::regclass
         AND conname = 'fund_calculation_mode_requests_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "fund_calculation_mode_requests"
      ADD CONSTRAINT "fund_calculation_mode_requests_fund_id_funds_id_fk"
      FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.fund_calculation_mode_requests') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.fund_calculation_mode_requests'::regclass
         AND conname = 'fund_calculation_mode_requests_created_by_users_id_fk'
     ) THEN
    ALTER TABLE "fund_calculation_mode_requests"
      ADD CONSTRAINT "fund_calculation_mode_requests_created_by_users_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fund_calculation_mode_requests_fund_created"
  ON "fund_calculation_mode_requests" USING btree ("fund_id", "created_at" DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fund_moic_input_update_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "company_id" integer NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_hash" text NOT NULL,
  "response_status" integer,
  "response_body" jsonb,
  "created_by" integer,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  CONSTRAINT "fund_moic_input_update_requests_scope_unique" UNIQUE ("fund_id", "company_id", "idempotency_key"),
  CONSTRAINT "fund_moic_input_update_requests_status_check" CHECK ("status" IN ('pending','completed'))
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.fund_moic_input_update_requests') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.fund_moic_input_update_requests'::regclass
         AND conname = 'fund_moic_input_update_requests_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "fund_moic_input_update_requests"
      ADD CONSTRAINT "fund_moic_input_update_requests_fund_id_funds_id_fk"
      FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.fund_moic_input_update_requests') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.fund_moic_input_update_requests'::regclass
         AND conname = 'fund_moic_input_update_requests_company_id_portfoliocompanies_id_fk'
     ) THEN
    ALTER TABLE "fund_moic_input_update_requests"
      ADD CONSTRAINT "fund_moic_input_update_requests_company_id_portfoliocompanies_id_fk"
      FOREIGN KEY ("company_id") REFERENCES "public"."portfoliocompanies"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.fund_moic_input_update_requests') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.fund_moic_input_update_requests'::regclass
         AND conname = 'fund_moic_input_update_requests_created_by_users_id_fk'
     ) THEN
    ALTER TABLE "fund_moic_input_update_requests"
      ADD CONSTRAINT "fund_moic_input_update_requests_created_by_users_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fund_moic_input_update_requests_fund_company_created"
  ON "fund_moic_input_update_requests" USING btree ("fund_id", "company_id", "created_at" DESC);
