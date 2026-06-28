-- @drift-patch
-- Migration: 0012_sector_variance_drift
-- Purpose: Sector, cohort, and variance schema drift; closes journal drift for issue #781.
-- Source of truth: drizzle-kit export from shared/schema.ts, shared/schema-lp-reporting.ts, and shared/schema-lp-sprint3.ts.
-- Replay safety: type guards, CREATE TABLE/INDEX IF NOT EXISTS, and FK constraint guards.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mapping_source') THEN
    CREATE TYPE "public"."mapping_source" AS ENUM('seed_identity', 'manual', 'suggested', 'imported');
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vintage_granularity') THEN
    CREATE TYPE "public"."vintage_granularity" AS ENUM('year', 'quarter');
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cohort_unit') THEN
    CREATE TYPE "public"."cohort_unit" AS ENUM('company', 'investment');
  END IF;
END
$$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sector_taxonomy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer NOT NULL,
	"taxonomy_version" varchar(20) DEFAULT 'v1' NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"parent_sector_id" uuid,
	"sort_order" integer DEFAULT 0,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" integer,
	CONSTRAINT "sector_taxonomy_fund_version_slug_unique" UNIQUE("fund_id","taxonomy_version","slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sector_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer NOT NULL,
	"taxonomy_version" varchar(20) DEFAULT 'v1' NOT NULL,
	"raw_value" varchar(255) NOT NULL,
	"raw_value_normalized" varchar(255) NOT NULL,
	"canonical_sector_id" uuid NOT NULL,
	"confidence_score" numeric(3, 2) DEFAULT '1.00' NOT NULL,
	"source" "mapping_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" integer,
	CONSTRAINT "sector_mappings_fund_version_normalized_unique" UNIQUE("fund_id","taxonomy_version","raw_value_normalized")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer NOT NULL,
	"taxonomy_version" varchar(20) DEFAULT 'v1' NOT NULL,
	"company_id" integer NOT NULL,
	"canonical_sector_id" uuid,
	"exclude_from_cohorts" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" integer,
	CONSTRAINT "company_overrides_fund_version_company_unique" UNIQUE("fund_id","taxonomy_version","company_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "investment_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer NOT NULL,
	"investment_id" integer NOT NULL,
	"exclude_from_cohorts" boolean DEFAULT false NOT NULL,
	"vintage_year" integer,
	"vintage_quarter" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" integer,
	CONSTRAINT "investment_overrides_fund_investment_unique" UNIQUE("fund_id","investment_id"),
	CONSTRAINT "investment_overrides_vintage_quarter_check" CHECK ("investment_overrides"."vintage_quarter" IS NULL OR ("investment_overrides"."vintage_quarter" >= 1 AND "investment_overrides"."vintage_quarter" <= 4)),
	CONSTRAINT "investment_overrides_vintage_year_check" CHECK ("investment_overrides"."vintage_year" IS NULL OR ("investment_overrides"."vintage_year" >= 1990 AND "investment_overrides"."vintage_year" <= 2100))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cohort_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"vintage_granularity" "vintage_granularity" DEFAULT 'year' NOT NULL,
	"sector_taxonomy_version" varchar(20) DEFAULT 'v1' NOT NULL,
	"unit" "cohort_unit" DEFAULT 'company' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" integer,
	CONSTRAINT "cohort_definitions_fund_name_unique" UNIQUE("fund_id","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "variance_planner_leader" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"instance_id" varchar(255) NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_expires_at" timestamp with time zone NOT NULL,
	"last_renewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.sector_taxonomy') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.sector_taxonomy'::regclass
         AND conname = 'sector_taxonomy_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "sector_taxonomy" ADD CONSTRAINT "sector_taxonomy_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.sector_taxonomy') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.sector_taxonomy'::regclass
         AND conname = 'sector_taxonomy_parent_sector_id_sector_taxonomy_id_fk'
     ) THEN
    ALTER TABLE "sector_taxonomy" ADD CONSTRAINT "sector_taxonomy_parent_sector_id_sector_taxonomy_id_fk" FOREIGN KEY ("parent_sector_id") REFERENCES "public"."sector_taxonomy"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.sector_taxonomy') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.sector_taxonomy'::regclass
         AND conname = 'sector_taxonomy_created_by_user_id_users_id_fk'
     ) THEN
    ALTER TABLE "sector_taxonomy" ADD CONSTRAINT "sector_taxonomy_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.sector_taxonomy') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.sector_taxonomy'::regclass
         AND conname = 'sector_taxonomy_updated_by_user_id_users_id_fk'
     ) THEN
    ALTER TABLE "sector_taxonomy" ADD CONSTRAINT "sector_taxonomy_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.sector_mappings') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.sector_mappings'::regclass
         AND conname = 'sector_mappings_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "sector_mappings" ADD CONSTRAINT "sector_mappings_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.sector_mappings') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.sector_mappings'::regclass
         AND conname = 'sector_mappings_canonical_sector_id_sector_taxonomy_id_fk'
     ) THEN
    ALTER TABLE "sector_mappings" ADD CONSTRAINT "sector_mappings_canonical_sector_id_sector_taxonomy_id_fk" FOREIGN KEY ("canonical_sector_id") REFERENCES "public"."sector_taxonomy"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.sector_mappings') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.sector_mappings'::regclass
         AND conname = 'sector_mappings_created_by_user_id_users_id_fk'
     ) THEN
    ALTER TABLE "sector_mappings" ADD CONSTRAINT "sector_mappings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.sector_mappings') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.sector_mappings'::regclass
         AND conname = 'sector_mappings_updated_by_user_id_users_id_fk'
     ) THEN
    ALTER TABLE "sector_mappings" ADD CONSTRAINT "sector_mappings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.company_overrides') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.company_overrides'::regclass
         AND conname = 'company_overrides_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "company_overrides" ADD CONSTRAINT "company_overrides_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.company_overrides') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.company_overrides'::regclass
         AND conname = 'company_overrides_company_id_portfoliocompanies_id_fk'
     ) THEN
    ALTER TABLE "company_overrides" ADD CONSTRAINT "company_overrides_company_id_portfoliocompanies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."portfoliocompanies"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.company_overrides') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.company_overrides'::regclass
         AND conname = 'company_overrides_canonical_sector_id_sector_taxonomy_id_fk'
     ) THEN
    ALTER TABLE "company_overrides" ADD CONSTRAINT "company_overrides_canonical_sector_id_sector_taxonomy_id_fk" FOREIGN KEY ("canonical_sector_id") REFERENCES "public"."sector_taxonomy"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.company_overrides') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.company_overrides'::regclass
         AND conname = 'company_overrides_created_by_user_id_users_id_fk'
     ) THEN
    ALTER TABLE "company_overrides" ADD CONSTRAINT "company_overrides_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.company_overrides') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.company_overrides'::regclass
         AND conname = 'company_overrides_updated_by_user_id_users_id_fk'
     ) THEN
    ALTER TABLE "company_overrides" ADD CONSTRAINT "company_overrides_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.investment_overrides') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.investment_overrides'::regclass
         AND conname = 'investment_overrides_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "investment_overrides" ADD CONSTRAINT "investment_overrides_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.investment_overrides') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.investment_overrides'::regclass
         AND conname = 'investment_overrides_investment_id_investments_id_fk'
     ) THEN
    ALTER TABLE "investment_overrides" ADD CONSTRAINT "investment_overrides_investment_id_investments_id_fk" FOREIGN KEY ("investment_id") REFERENCES "public"."investments"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.investment_overrides') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.investment_overrides'::regclass
         AND conname = 'investment_overrides_created_by_user_id_users_id_fk'
     ) THEN
    ALTER TABLE "investment_overrides" ADD CONSTRAINT "investment_overrides_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.investment_overrides') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.investment_overrides'::regclass
         AND conname = 'investment_overrides_updated_by_user_id_users_id_fk'
     ) THEN
    ALTER TABLE "investment_overrides" ADD CONSTRAINT "investment_overrides_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.cohort_definitions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.cohort_definitions'::regclass
         AND conname = 'cohort_definitions_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "cohort_definitions" ADD CONSTRAINT "cohort_definitions_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.cohort_definitions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.cohort_definitions'::regclass
         AND conname = 'cohort_definitions_created_by_user_id_users_id_fk'
     ) THEN
    ALTER TABLE "cohort_definitions" ADD CONSTRAINT "cohort_definitions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.cohort_definitions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.cohort_definitions'::regclass
         AND conname = 'cohort_definitions_updated_by_user_id_users_id_fk'
     ) THEN
    ALTER TABLE "cohort_definitions" ADD CONSTRAINT "cohort_definitions_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sector_taxonomy_fund_version_idx" ON "sector_taxonomy" USING btree ("fund_id","taxonomy_version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sector_taxonomy_parent_idx" ON "sector_taxonomy" USING btree ("parent_sector_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sector_mappings_fund_version_idx" ON "sector_mappings" USING btree ("fund_id","taxonomy_version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sector_mappings_canonical_sector_idx" ON "sector_mappings" USING btree ("fund_id","taxonomy_version","canonical_sector_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_overrides_fund_version_idx" ON "company_overrides" USING btree ("fund_id","taxonomy_version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_overrides_company_idx" ON "company_overrides" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investment_overrides_fund_idx" ON "investment_overrides" USING btree ("fund_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investment_overrides_investment_idx" ON "investment_overrides" USING btree ("investment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cohort_definitions_fund_idx" ON "cohort_definitions" USING btree ("fund_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cohort_definitions_default_idx" ON "cohort_definitions" USING btree ("fund_id","is_default") WHERE "cohort_definitions"."is_default" = true AND "cohort_definitions"."archived_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_variance_planner_leader_lease_expires" ON "variance_planner_leader" USING btree ("lease_expires_at");
