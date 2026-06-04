-- Migration: 0010_fund_scenario_sets
-- Purpose: Create fund_scenario_sets and fund_scenario_variants tables.
--
-- Context: The journaled migration stream (0000-0009) never created these
-- tables, so a migration-built DB throws `relation "fund_scenario_sets"
-- does not exist` when fund-results-read-service.ts executes
-- loadScenariosSection() -> fund-scenario-calculation-service.ts ~694.
-- With the tables present but empty the service returns the correct
-- SCENARIOS_NONE_EXIST path instead of SCENARIOS_LOAD_FAILED.
--
-- Source of truth: shared/schema/fund.ts (fundScenarioSets, ~170-209;
-- fundScenarioVariants, ~211-239). No CHECK constraints are emitted
-- because the schema uses TypeScript-only $type<> casts with no .check()
-- calls; prod was built by db:push which also omits them.
--
-- Replay safety: CREATE TABLE IF NOT EXISTS, CREATE [UNIQUE] INDEX IF
-- NOT EXISTS, FK ALTER TABLEs inside DO $$ IF NOT EXISTS pg_constraint $$
-- blocks, unique constraint via DO $$ ADD CONSTRAINT IF NOT EXISTS $$ --
-- all are safe no-ops against a db:push-built production DB.
--
-- FK targets verified in journaled stream:
--   funds       : created in 0000_quick_vivisector.sql (serial PK)
--   fundconfigs : created in 0000_quick_vivisector.sql (serial PK)
--   users       : created in 0000_quick_vivisector.sql (serial PK)

CREATE TABLE IF NOT EXISTS "fund_scenario_sets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fund_id" integer NOT NULL,
  "name" varchar(120) NOT NULL,
  "description" text,
  "source_config_id" integer NOT NULL,
  "source_config_version" integer NOT NULL,
  "created_by_user_id" integer,
  "created_by_label" text,
  "updated_by_user_id" integer,
  "updated_by_label" text,
  "archived_at" timestamp with time zone,
  "archived_by_user_id" integer,
  "archived_by_label" text,
  "idempotency_key" varchar(128),
  "idempotency_request_hash" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fund_scenario_sets_fund_id_funds_id_fk'
  ) THEN
    ALTER TABLE "fund_scenario_sets"
      ADD CONSTRAINT "fund_scenario_sets_fund_id_funds_id_fk"
      FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fund_scenario_sets_source_config_id_fundconfigs_id_fk'
  ) THEN
    ALTER TABLE "fund_scenario_sets"
      ADD CONSTRAINT "fund_scenario_sets_source_config_id_fundconfigs_id_fk"
      FOREIGN KEY ("source_config_id") REFERENCES "public"."fundconfigs"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fund_scenario_sets_created_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "fund_scenario_sets"
      ADD CONSTRAINT "fund_scenario_sets_created_by_user_id_users_id_fk"
      FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fund_scenario_sets_updated_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "fund_scenario_sets"
      ADD CONSTRAINT "fund_scenario_sets_updated_by_user_id_users_id_fk"
      FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fund_scenario_sets_archived_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "fund_scenario_sets"
      ADD CONSTRAINT "fund_scenario_sets_archived_by_user_id_users_id_fk"
      FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fund_scenario_sets_fund_active_updated_idx"
  ON "fund_scenario_sets" ("fund_id", "updated_at" DESC, "id" DESC)
  WHERE "archived_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fund_scenario_sets_fund_name_active_unique"
  ON "fund_scenario_sets" ("fund_id", lower("name"))
  WHERE "archived_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fund_scenario_sets_fund_idempotency_unique"
  ON "fund_scenario_sets" ("fund_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fund_scenario_variants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scenario_set_id" uuid NOT NULL,
  "name" varchar(120) NOT NULL,
  "description" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "override_type" varchar(32) NOT NULL,
  "override_payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fund_scenario_variants_scenario_set_id_fund_scenario_sets_id_fk'
  ) THEN
    ALTER TABLE "fund_scenario_variants"
      ADD CONSTRAINT "fund_scenario_variants_scenario_set_id_fund_scenario_sets_id_fk"
      FOREIGN KEY ("scenario_set_id") REFERENCES "public"."fund_scenario_sets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fund_scenario_variants_set_order_unique'
  ) THEN
    ALTER TABLE "fund_scenario_variants"
      ADD CONSTRAINT "fund_scenario_variants_set_order_unique"
      UNIQUE ("scenario_set_id", "sort_order");
  END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fund_scenario_variants_set_order_idx"
  ON "fund_scenario_variants" ("scenario_set_id", "sort_order", "id");
