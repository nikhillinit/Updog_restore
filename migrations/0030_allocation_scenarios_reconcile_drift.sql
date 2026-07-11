-- @drift-patch
-- Reason: restate 0025 allocation-scenario tables as an additive, replay-safe drift patch that creates missing tables and repairs partial tables without modifying data.
-- Purpose: idempotent reconcile-covered restatement of 0025; create-if-absent plus guarded column repair, constraints, and indexes.

CREATE TABLE IF NOT EXISTS "allocation_scenarios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fund_id" integer NOT NULL,
  "name" varchar(120) NOT NULL,
  "notes" text,
  "source_allocation_version" integer,
  "company_count" integer NOT NULL DEFAULT 0,
  "total_planned_cents" bigint NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_applied_at" timestamp with time zone,
  "last_applied_by" text,
  "last_applied_allocation_version" integer,
  "last_synced_at" timestamp with time zone,
  "last_synced_by" text
);
--> statement-breakpoint
ALTER TABLE "allocation_scenarios" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE "allocation_scenarios" ADD COLUMN IF NOT EXISTS "fund_id" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "allocation_scenarios" ADD COLUMN IF NOT EXISTS "name" varchar(120) NOT NULL;
--> statement-breakpoint
ALTER TABLE "allocation_scenarios" ADD COLUMN IF NOT EXISTS "notes" text;
--> statement-breakpoint
ALTER TABLE "allocation_scenarios" ADD COLUMN IF NOT EXISTS "source_allocation_version" integer;
--> statement-breakpoint
ALTER TABLE "allocation_scenarios" ADD COLUMN IF NOT EXISTS "company_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "allocation_scenarios" ADD COLUMN IF NOT EXISTS "total_planned_cents" bigint NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "allocation_scenarios" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE "allocation_scenarios" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE "allocation_scenarios" ADD COLUMN IF NOT EXISTS "last_applied_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "allocation_scenarios" ADD COLUMN IF NOT EXISTS "last_applied_by" text;
--> statement-breakpoint
ALTER TABLE "allocation_scenarios" ADD COLUMN IF NOT EXISTS "last_applied_allocation_version" integer;
--> statement-breakpoint
ALTER TABLE "allocation_scenarios" ADD COLUMN IF NOT EXISTS "last_synced_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "allocation_scenarios" ADD COLUMN IF NOT EXISTS "last_synced_by" text;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.allocation_scenarios') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.allocation_scenarios'::regclass
         AND conname = 'allocation_scenarios_fund_id_fkey'
     ) THEN
    ALTER TABLE "allocation_scenarios"
      ADD CONSTRAINT "allocation_scenarios_fund_id_fkey"
      FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE CASCADE;
  END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "allocation_scenarios_fund_updated_idx" ON "allocation_scenarios" ("fund_id", "updated_at" DESC, "id" DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "allocation_scenario_items" (
  "scenario_id" uuid NOT NULL,
  "company_id" integer NOT NULL,
  "planned_reserves_cents" bigint NOT NULL DEFAULT 0,
  "allocation_cap_cents" bigint,
  "allocation_reason" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("scenario_id", "company_id")
);
--> statement-breakpoint
ALTER TABLE "allocation_scenario_items" ADD COLUMN IF NOT EXISTS "scenario_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_items" ADD COLUMN IF NOT EXISTS "company_id" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_items" ADD COLUMN IF NOT EXISTS "planned_reserves_cents" bigint NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_items" ADD COLUMN IF NOT EXISTS "allocation_cap_cents" bigint;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_items" ADD COLUMN IF NOT EXISTS "allocation_reason" text;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_items" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE "allocation_scenario_items" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now();
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.allocation_scenario_items') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.allocation_scenario_items'::regclass
         AND conname = 'allocation_scenario_items_scenario_id_fkey'
     ) THEN
    ALTER TABLE "allocation_scenario_items"
      ADD CONSTRAINT "allocation_scenario_items_scenario_id_fkey"
      FOREIGN KEY ("scenario_id") REFERENCES "allocation_scenarios"("id") ON DELETE CASCADE;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.allocation_scenario_items') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.allocation_scenario_items'::regclass
         AND conname = 'allocation_scenario_items_company_id_fkey'
     ) THEN
    ALTER TABLE "allocation_scenario_items"
      ADD CONSTRAINT "allocation_scenario_items_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "portfoliocompanies"("id") ON DELETE CASCADE;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.allocation_scenario_items') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.allocation_scenario_items'::regclass
         AND conname = 'allocation_scenario_items_non_negative_planned'
     ) THEN
    ALTER TABLE "allocation_scenario_items"
      ADD CONSTRAINT "allocation_scenario_items_non_negative_planned"
      CHECK ("planned_reserves_cents" >= 0);
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.allocation_scenario_items') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.allocation_scenario_items'::regclass
         AND conname = 'allocation_scenario_items_non_negative_cap'
     ) THEN
    ALTER TABLE "allocation_scenario_items"
      ADD CONSTRAINT "allocation_scenario_items_non_negative_cap"
      CHECK ("allocation_cap_cents" IS NULL OR "allocation_cap_cents" >= 0);
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.allocation_scenario_items') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.allocation_scenario_items'::regclass
         AND conname = 'allocation_scenario_items_cap_gte_planned'
     ) THEN
    ALTER TABLE "allocation_scenario_items"
      ADD CONSTRAINT "allocation_scenario_items_cap_gte_planned"
      CHECK ("allocation_cap_cents" IS NULL OR "allocation_cap_cents" >= "planned_reserves_cents");
  END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "allocation_scenario_items_scenario_idx" ON "allocation_scenario_items" ("scenario_id", "company_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "allocation_scenario_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scenario_id" uuid NOT NULL,
  "fund_id" integer NOT NULL,
  "event_type" varchar(32) NOT NULL,
  "actor_user_id" integer,
  "actor_label" text,
  "note" text,
  "source_allocation_version" integer,
  "resulting_allocation_version" integer,
  "change_summary_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "allocation_scenario_events" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE "allocation_scenario_events" ADD COLUMN IF NOT EXISTS "scenario_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_events" ADD COLUMN IF NOT EXISTS "fund_id" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_events" ADD COLUMN IF NOT EXISTS "event_type" varchar(32) NOT NULL;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_events" ADD COLUMN IF NOT EXISTS "actor_user_id" integer;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_events" ADD COLUMN IF NOT EXISTS "actor_label" text;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_events" ADD COLUMN IF NOT EXISTS "note" text;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_events" ADD COLUMN IF NOT EXISTS "source_allocation_version" integer;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_events" ADD COLUMN IF NOT EXISTS "resulting_allocation_version" integer;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_events" ADD COLUMN IF NOT EXISTS "change_summary_json" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_events" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone NOT NULL DEFAULT now();
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.allocation_scenario_events') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.allocation_scenario_events'::regclass
         AND conname = 'allocation_scenario_events_scenario_id_fkey'
     ) THEN
    ALTER TABLE "allocation_scenario_events"
      ADD CONSTRAINT "allocation_scenario_events_scenario_id_fkey"
      FOREIGN KEY ("scenario_id") REFERENCES "allocation_scenarios"("id") ON DELETE CASCADE;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.allocation_scenario_events') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.allocation_scenario_events'::regclass
         AND conname = 'allocation_scenario_events_fund_id_fkey'
     ) THEN
    ALTER TABLE "allocation_scenario_events"
      ADD CONSTRAINT "allocation_scenario_events_fund_id_fkey"
      FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE CASCADE;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.allocation_scenario_events') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.allocation_scenario_events'::regclass
         AND conname = 'allocation_scenario_events_actor_user_id_fkey'
     ) THEN
    ALTER TABLE "allocation_scenario_events"
      ADD CONSTRAINT "allocation_scenario_events_actor_user_id_fkey"
      FOREIGN KEY ("actor_user_id") REFERENCES "users"("id");
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.allocation_scenario_events') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.allocation_scenario_events'::regclass
         AND conname = 'allocation_scenario_events_type_check'
     ) THEN
    ALTER TABLE "allocation_scenario_events"
      ADD CONSTRAINT "allocation_scenario_events_type_check"
      CHECK ("event_type" IN ('applied', 'synced'));
  END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "allocation_scenario_events_scenario_created_idx" ON "allocation_scenario_events" ("scenario_id", "created_at" DESC, "id" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "allocation_scenario_events_fund_created_idx" ON "allocation_scenario_events" ("fund_id", "created_at" DESC, "id" DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "allocation_scenario_ic_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scenario_id" uuid NOT NULL,
  "fund_id" integer NOT NULL,
  "company_id" integer NOT NULL,
  "decision_type" varchar(32) NOT NULL,
  "decision_status" varchar(32) NOT NULL DEFAULT 'draft',
  "rationale" text NOT NULL,
  "proposed_planned_reserves_cents" bigint,
  "final_planned_reserves_cents" bigint,
  "decided_by_user_id" integer,
  "decided_by_label" text,
  "decided_at" timestamp with time zone,
  "source_allocation_version" integer,
  "live_allocation_version" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "allocation_scenario_ic_decisions" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE "allocation_scenario_ic_decisions" ADD COLUMN IF NOT EXISTS "scenario_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_ic_decisions" ADD COLUMN IF NOT EXISTS "fund_id" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_ic_decisions" ADD COLUMN IF NOT EXISTS "company_id" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_ic_decisions" ADD COLUMN IF NOT EXISTS "decision_type" varchar(32) NOT NULL;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_ic_decisions" ADD COLUMN IF NOT EXISTS "decision_status" varchar(32) NOT NULL DEFAULT 'draft';
--> statement-breakpoint
ALTER TABLE "allocation_scenario_ic_decisions" ADD COLUMN IF NOT EXISTS "rationale" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_ic_decisions" ADD COLUMN IF NOT EXISTS "proposed_planned_reserves_cents" bigint;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_ic_decisions" ADD COLUMN IF NOT EXISTS "final_planned_reserves_cents" bigint;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_ic_decisions" ADD COLUMN IF NOT EXISTS "decided_by_user_id" integer;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_ic_decisions" ADD COLUMN IF NOT EXISTS "decided_by_label" text;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_ic_decisions" ADD COLUMN IF NOT EXISTS "decided_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_ic_decisions" ADD COLUMN IF NOT EXISTS "source_allocation_version" integer;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_ic_decisions" ADD COLUMN IF NOT EXISTS "live_allocation_version" integer;
--> statement-breakpoint
ALTER TABLE "allocation_scenario_ic_decisions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE "allocation_scenario_ic_decisions" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now();
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.allocation_scenario_ic_decisions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.allocation_scenario_ic_decisions'::regclass
         AND conname = 'allocation_scenario_ic_decisions_scenario_id_fkey'
     ) THEN
    ALTER TABLE "allocation_scenario_ic_decisions"
      ADD CONSTRAINT "allocation_scenario_ic_decisions_scenario_id_fkey"
      FOREIGN KEY ("scenario_id") REFERENCES "allocation_scenarios"("id") ON DELETE CASCADE;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.allocation_scenario_ic_decisions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.allocation_scenario_ic_decisions'::regclass
         AND conname = 'allocation_scenario_ic_decisions_fund_id_fkey'
     ) THEN
    ALTER TABLE "allocation_scenario_ic_decisions"
      ADD CONSTRAINT "allocation_scenario_ic_decisions_fund_id_fkey"
      FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE CASCADE;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.allocation_scenario_ic_decisions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.allocation_scenario_ic_decisions'::regclass
         AND conname = 'allocation_scenario_ic_decisions_company_id_fkey'
     ) THEN
    ALTER TABLE "allocation_scenario_ic_decisions"
      ADD CONSTRAINT "allocation_scenario_ic_decisions_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "portfoliocompanies"("id") ON DELETE CASCADE;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.allocation_scenario_ic_decisions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.allocation_scenario_ic_decisions'::regclass
         AND conname = 'allocation_scenario_ic_decisions_decided_by_user_id_fkey'
     ) THEN
    ALTER TABLE "allocation_scenario_ic_decisions"
      ADD CONSTRAINT "allocation_scenario_ic_decisions_decided_by_user_id_fkey"
      FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id");
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.allocation_scenario_ic_decisions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.allocation_scenario_ic_decisions'::regclass
         AND conname = 'allocation_scenario_ic_decisions_unique_company'
     ) THEN
    ALTER TABLE "allocation_scenario_ic_decisions"
      ADD CONSTRAINT "allocation_scenario_ic_decisions_unique_company"
      UNIQUE ("scenario_id", "company_id");
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.allocation_scenario_ic_decisions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.allocation_scenario_ic_decisions'::regclass
         AND conname = 'allocation_scenario_ic_decisions_type_check'
     ) THEN
    ALTER TABLE "allocation_scenario_ic_decisions"
      ADD CONSTRAINT "allocation_scenario_ic_decisions_type_check"
      CHECK ("decision_type" IN ('follow_on', 'defer', 'cut_reserve', 'no_action'));
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.allocation_scenario_ic_decisions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.allocation_scenario_ic_decisions'::regclass
         AND conname = 'allocation_scenario_ic_decisions_status_check'
     ) THEN
    ALTER TABLE "allocation_scenario_ic_decisions"
      ADD CONSTRAINT "allocation_scenario_ic_decisions_status_check"
      CHECK ("decision_status" IN ('draft', 'proposed', 'approved', 'rejected'));
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.allocation_scenario_ic_decisions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.allocation_scenario_ic_decisions'::regclass
         AND conname = 'allocation_scenario_ic_decisions_proposed_non_negative'
     ) THEN
    ALTER TABLE "allocation_scenario_ic_decisions"
      ADD CONSTRAINT "allocation_scenario_ic_decisions_proposed_non_negative"
      CHECK ("proposed_planned_reserves_cents" IS NULL OR "proposed_planned_reserves_cents" >= 0);
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.allocation_scenario_ic_decisions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.allocation_scenario_ic_decisions'::regclass
         AND conname = 'allocation_scenario_ic_decisions_final_non_negative'
     ) THEN
    ALTER TABLE "allocation_scenario_ic_decisions"
      ADD CONSTRAINT "allocation_scenario_ic_decisions_final_non_negative"
      CHECK ("final_planned_reserves_cents" IS NULL OR "final_planned_reserves_cents" >= 0);
  END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "allocation_scenario_ic_decisions_scenario_idx" ON "allocation_scenario_ic_decisions" ("scenario_id", "company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "allocation_scenario_ic_decisions_fund_idx" ON "allocation_scenario_ic_decisions" ("fund_id", "scenario_id", "updated_at" DESC, "id" DESC);
