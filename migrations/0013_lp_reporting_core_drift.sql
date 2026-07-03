-- @drift-patch
-- Reason: LP reporting core schema drift; closes journal drift for issue #781. Marker added 2026-07-02 (s8.1 slice 4a) so the M4 manifest can reference this file - its LP-core tables are FK dependencies of 0014 that prod lacked.
-- Migration: 0013_lp_reporting_core_drift
-- Purpose: LP reporting core schema drift; closes journal drift for issue #781.
-- Source of truth: drizzle-kit export from shared/schema.ts, shared/schema-lp-reporting.ts, and shared/schema-lp-sprint3.ts.
-- Replay safety: type guards, CREATE TABLE/INDEX IF NOT EXISTS, and FK constraint guards.

CREATE TABLE IF NOT EXISTS "limited_partners" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" varchar(255) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"tax_id" varchar(50),
	"address" text,
	"contact_name" text,
	"contact_email" varchar(255),
	"contact_phone" varchar(50),
	"version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "limited_partners_email_unique" UNIQUE("email"),
	CONSTRAINT "limited_partners_entity_type_check" CHECK ("limited_partners"."entity_type" IN ('individual', 'institution', 'fund_of_funds'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lp_fund_commitments" (
	"id" serial PRIMARY KEY NOT NULL,
	"lp_id" integer NOT NULL,
	"fund_id" integer NOT NULL,
	"commitment_amount_cents" bigint NOT NULL,
	"commitment_date" timestamp with time zone NOT NULL,
	"first_call_date" timestamp with time zone,
	"commitment_percentage" numeric(7, 4),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lp_fund_commitments_lp_id_fund_id_unique" UNIQUE("lp_id","fund_id"),
	CONSTRAINT "lp_fund_commitments_status_check" CHECK ("lp_fund_commitments"."status" IN ('active', 'fulfilled', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "capital_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"commitment_id" integer NOT NULL,
	"activity_type" varchar(20) NOT NULL,
	"amount_cents" bigint NOT NULL,
	"activity_date" timestamp with time zone NOT NULL,
	"effective_date" timestamp with time zone NOT NULL,
	"description" text,
	"reference_number" varchar(100),
	"idempotency_key" varchar(128),
	"fund_id" integer,
	"status" varchar(50) DEFAULT 'completed',
	"version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capital_activities_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "capital_activities_activity_type_check" CHECK ("capital_activities"."activity_type" IN ('capital_call', 'distribution', 'recallable_distribution'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lp_distributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" integer NOT NULL,
	"distribution_type" varchar(30) NOT NULL,
	"amount_cents" bigint NOT NULL,
	"tax_withheld_cents" bigint DEFAULT 0,
	"net_amount_cents" bigint NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lp_distributions_distribution_type_check" CHECK ("lp_distributions"."distribution_type" IN ('income', 'capital_gain', 'return_of_capital'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lp_capital_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"commitment_id" integer NOT NULL,
	"as_of_date" timestamp with time zone NOT NULL,
	"called_capital_cents" bigint NOT NULL,
	"distributed_capital_cents" bigint NOT NULL,
	"nav_cents" bigint NOT NULL,
	"unfunded_commitment_cents" bigint NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lp_capital_accounts_commitment_id_as_of_date_unique" UNIQUE("commitment_id","as_of_date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lp_performance_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"commitment_id" integer NOT NULL,
	"snapshot_date" timestamp with time zone NOT NULL,
	"irr" numeric(10, 6),
	"moic" numeric(10, 4),
	"tvpi" numeric(10, 4),
	"dpi" numeric(10, 4),
	"rvpi" numeric(10, 4),
	"benchmark_irr" numeric(10, 6),
	"gross_irr" numeric(10, 6),
	"net_irr" numeric(10, 6),
	"nav_cents" bigint,
	"paid_in_cents" bigint,
	"distributed_cents" bigint,
	"version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lp_performance_snapshots_commitment_id_snapshot_date_unique" UNIQUE("commitment_id","snapshot_date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lp_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lp_id" integer NOT NULL,
	"report_type" varchar(50) NOT NULL,
	"report_period_start" timestamp with time zone NOT NULL,
	"report_period_end" timestamp with time zone NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"file_url" text,
	"file_size" integer,
	"format" varchar(10) NOT NULL,
	"template_id" integer,
	"generated_at" timestamp with time zone,
	"error_message" text,
	"metadata" jsonb,
	"idempotency_key" varchar(128),
	"version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lp_reports_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "lp_reports_report_type_check" CHECK ("lp_reports"."report_type" IN ('quarterly', 'annual', 'tax_package', 'capital_account')),
	CONSTRAINT "lp_reports_status_check" CHECK ("lp_reports"."status" IN ('pending', 'generating', 'ready', 'error')),
	CONSTRAINT "lp_reports_format_check" CHECK ("lp_reports"."format" IN ('pdf', 'xlsx', 'csv'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"report_type" varchar(50) NOT NULL,
	"description" text,
	"sections" jsonb NOT NULL,
	"default_format" varchar(10) DEFAULT 'pdf' NOT NULL,
	"is_active" boolean DEFAULT true,
	"version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lp_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"lp_id" integer NOT NULL,
	"user_id" integer,
	"action" varchar(50) NOT NULL,
	"resource_type" varchar(50) NOT NULL,
	"resource_id" varchar(255),
	"ip_address" varchar(45),
	"user_agent" text,
	"metadata" jsonb,
	CONSTRAINT "lp_audit_log_action_check" CHECK ("lp_audit_log"."action" IN ('view_profile', 'view_summary', 'view_capital_account', 'view_fund_detail', 'view_holdings', 'view_performance', 'view_performance_benchmark', 'generate_report', 'view_report_list', 'view_report_status', 'download_report', 'update_settings'))
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_fund_commitments') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_fund_commitments'::regclass
         AND conname = 'lp_fund_commitments_lp_id_limited_partners_id_fk'
     ) THEN
    ALTER TABLE "lp_fund_commitments" ADD CONSTRAINT "lp_fund_commitments_lp_id_limited_partners_id_fk" FOREIGN KEY ("lp_id") REFERENCES "public"."limited_partners"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_fund_commitments') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_fund_commitments'::regclass
         AND conname = 'lp_fund_commitments_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "lp_fund_commitments" ADD CONSTRAINT "lp_fund_commitments_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.capital_activities') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.capital_activities'::regclass
         AND conname = 'capital_activities_commitment_id_lp_fund_commitments_id_fk'
     ) THEN
    ALTER TABLE "capital_activities" ADD CONSTRAINT "capital_activities_commitment_id_lp_fund_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."lp_fund_commitments"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.capital_activities') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.capital_activities'::regclass
         AND conname = 'capital_activities_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "capital_activities" ADD CONSTRAINT "capital_activities_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_distributions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_distributions'::regclass
         AND conname = 'lp_distributions_activity_id_capital_activities_id_fk'
     ) THEN
    ALTER TABLE "lp_distributions" ADD CONSTRAINT "lp_distributions_activity_id_capital_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."capital_activities"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_capital_accounts') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_capital_accounts'::regclass
         AND conname = 'lp_capital_accounts_commitment_id_lp_fund_commitments_id_fk'
     ) THEN
    ALTER TABLE "lp_capital_accounts" ADD CONSTRAINT "lp_capital_accounts_commitment_id_lp_fund_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."lp_fund_commitments"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_performance_snapshots') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_performance_snapshots'::regclass
         AND conname = 'lp_performance_snapshots_commitment_id_lp_fund_commitments_id_fk'
     ) THEN
    ALTER TABLE "lp_performance_snapshots" ADD CONSTRAINT "lp_performance_snapshots_commitment_id_lp_fund_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."lp_fund_commitments"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_reports') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_reports'::regclass
         AND conname = 'lp_reports_lp_id_limited_partners_id_fk'
     ) THEN
    ALTER TABLE "lp_reports" ADD CONSTRAINT "lp_reports_lp_id_limited_partners_id_fk" FOREIGN KEY ("lp_id") REFERENCES "public"."limited_partners"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_audit_log') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_audit_log'::regclass
         AND conname = 'lp_audit_log_lp_id_limited_partners_id_fk'
     ) THEN
    ALTER TABLE "lp_audit_log" ADD CONSTRAINT "lp_audit_log_lp_id_limited_partners_id_fk" FOREIGN KEY ("lp_id") REFERENCES "public"."limited_partners"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_fund_commitments_lp_id_idx" ON "lp_fund_commitments" USING btree ("lp_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_fund_commitments_fund_id_idx" ON "lp_fund_commitments" USING btree ("fund_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "capital_activities_commitment_id_idx" ON "capital_activities" USING btree ("commitment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "capital_activities_fund_id_idx" ON "capital_activities" USING btree ("fund_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "capital_activities_activity_date_idx" ON "capital_activities" USING btree ("activity_date" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "capital_activities_cursor_idx" ON "capital_activities" USING btree ("commitment_id","activity_date" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_distributions_activity_id_idx" ON "lp_distributions" USING btree ("activity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_capital_accounts_commitment_id_idx" ON "lp_capital_accounts" USING btree ("commitment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_capital_accounts_as_of_date_idx" ON "lp_capital_accounts" USING btree ("as_of_date" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_capital_accounts_cursor_idx" ON "lp_capital_accounts" USING btree ("commitment_id","as_of_date" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_performance_snapshots_commitment_id_idx" ON "lp_performance_snapshots" USING btree ("commitment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_performance_snapshots_snapshot_date_idx" ON "lp_performance_snapshots" USING btree ("snapshot_date" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_performance_snapshots_cursor_idx" ON "lp_performance_snapshots" USING btree ("commitment_id","snapshot_date" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_reports_lp_id_idx" ON "lp_reports" USING btree ("lp_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_reports_status_idx" ON "lp_reports" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_reports_created_at_idx" ON "lp_reports" USING btree ("created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_templates_report_type_idx" ON "report_templates" USING btree ("report_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_audit_log_timestamp_idx" ON "lp_audit_log" USING btree ("timestamp" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_audit_log_lp_id_idx" ON "lp_audit_log" USING btree ("lp_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_audit_log_user_id_idx" ON "lp_audit_log" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_audit_log_action_idx" ON "lp_audit_log" USING btree ("action");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_audit_log_resource_idx" ON "lp_audit_log" USING btree ("resource_type","resource_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_audit_log_composite_idx" ON "lp_audit_log" USING btree ("lp_id","timestamp" DESC NULLS LAST,"action");
