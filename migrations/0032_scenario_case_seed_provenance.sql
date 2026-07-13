-- @drift-patch
-- Reason: add immutable scenario-case seed provenance and fund-scoped idempotency without backfilling existing cases.

CREATE TABLE IF NOT EXISTS "scenario_case_seed_provenance" (
  "scenario_case_id" uuid NOT NULL,
  "fund_id" integer NOT NULL,
  "company_id" integer NOT NULL,
  "idempotency_key" text NOT NULL,
  "facts_input_hash" char(64) NOT NULL,
  "facts_as_of_date" date NOT NULL,
  "seeded_at" timestamp with time zone NOT NULL DEFAULT now(),
  "trust_state" varchar(16) NOT NULL,
  "currency_status" varchar(24) NOT NULL,
  "seeded_investment" decimal(15,6) NOT NULL,
  "seeded_follow_ons" decimal(15,6) NOT NULL,
  "seeded_fmv" decimal(15,6),
  "investment_source" varchar(64) NOT NULL,
  "follow_ons_source" varchar(64) NOT NULL,
  "fmv_source" varchar(64),
  "latest_round_valuation_reference" decimal(15,6),
  "latest_round_date_reference" date,
  CONSTRAINT "scenario_case_seed_provenance_pkey" PRIMARY KEY ("scenario_case_id"),
  CONSTRAINT "scenario_case_seed_provenance_scenario_case_id_fkey"
    FOREIGN KEY ("scenario_case_id") REFERENCES "scenario_cases"("id") ON DELETE CASCADE,
  CONSTRAINT "scenario_case_seed_provenance_fund_id_fkey"
    FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE CASCADE,
  CONSTRAINT "scenario_case_seed_provenance_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "portfoliocompanies"("id") ON DELETE CASCADE,
  CONSTRAINT "scenario_case_seed_provenance_fund_idempotency_key_unique"
    UNIQUE ("fund_id", "idempotency_key"),
  CONSTRAINT "scenario_case_seed_provenance_trust_state_check"
    CHECK ("trust_state" IN ('LIVE', 'PARTIAL', 'UNAVAILABLE', 'FAILED')),
  CONSTRAINT "scenario_case_seed_provenance_currency_status_check"
    CHECK ("currency_status" IN ('base_currency', 'mismatch_blocked', 'unknown'))
);
--> statement-breakpoint
ALTER TABLE "scenario_case_seed_provenance" ADD COLUMN IF NOT EXISTS "scenario_case_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "scenario_case_seed_provenance" ADD COLUMN IF NOT EXISTS "fund_id" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "scenario_case_seed_provenance" ADD COLUMN IF NOT EXISTS "company_id" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "scenario_case_seed_provenance" ADD COLUMN IF NOT EXISTS "idempotency_key" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "scenario_case_seed_provenance" ADD COLUMN IF NOT EXISTS "facts_input_hash" char(64) NOT NULL;
--> statement-breakpoint
ALTER TABLE "scenario_case_seed_provenance" ADD COLUMN IF NOT EXISTS "facts_as_of_date" date NOT NULL;
--> statement-breakpoint
ALTER TABLE "scenario_case_seed_provenance" ADD COLUMN IF NOT EXISTS "seeded_at" timestamp with time zone NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE "scenario_case_seed_provenance" ADD COLUMN IF NOT EXISTS "trust_state" varchar(16) NOT NULL;
--> statement-breakpoint
ALTER TABLE "scenario_case_seed_provenance" ADD COLUMN IF NOT EXISTS "currency_status" varchar(24) NOT NULL;
--> statement-breakpoint
ALTER TABLE "scenario_case_seed_provenance" ADD COLUMN IF NOT EXISTS "seeded_investment" decimal(15,6) NOT NULL;
--> statement-breakpoint
ALTER TABLE "scenario_case_seed_provenance" ADD COLUMN IF NOT EXISTS "seeded_follow_ons" decimal(15,6) NOT NULL;
--> statement-breakpoint
ALTER TABLE "scenario_case_seed_provenance" ADD COLUMN IF NOT EXISTS "seeded_fmv" decimal(15,6);
--> statement-breakpoint
ALTER TABLE "scenario_case_seed_provenance" ADD COLUMN IF NOT EXISTS "investment_source" varchar(64) NOT NULL;
--> statement-breakpoint
ALTER TABLE "scenario_case_seed_provenance" ADD COLUMN IF NOT EXISTS "follow_ons_source" varchar(64) NOT NULL;
--> statement-breakpoint
ALTER TABLE "scenario_case_seed_provenance" ADD COLUMN IF NOT EXISTS "fmv_source" varchar(64);
--> statement-breakpoint
ALTER TABLE "scenario_case_seed_provenance" ADD COLUMN IF NOT EXISTS "latest_round_valuation_reference" decimal(15,6);
--> statement-breakpoint
ALTER TABLE "scenario_case_seed_provenance" ADD COLUMN IF NOT EXISTS "latest_round_date_reference" date;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scenario_case_seed_provenance_pkey'
      AND conrelid = 'public.scenario_case_seed_provenance'::regclass
  ) THEN
    ALTER TABLE "scenario_case_seed_provenance"
      ADD CONSTRAINT "scenario_case_seed_provenance_pkey"
      PRIMARY KEY ("scenario_case_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scenario_case_seed_provenance_scenario_case_id_fkey'
      AND conrelid = 'public.scenario_case_seed_provenance'::regclass
  ) THEN
    ALTER TABLE "scenario_case_seed_provenance"
      ADD CONSTRAINT "scenario_case_seed_provenance_scenario_case_id_fkey"
      FOREIGN KEY ("scenario_case_id") REFERENCES "scenario_cases"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scenario_case_seed_provenance_fund_id_fkey'
      AND conrelid = 'public.scenario_case_seed_provenance'::regclass
  ) THEN
    ALTER TABLE "scenario_case_seed_provenance"
      ADD CONSTRAINT "scenario_case_seed_provenance_fund_id_fkey"
      FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scenario_case_seed_provenance_company_id_fkey'
      AND conrelid = 'public.scenario_case_seed_provenance'::regclass
  ) THEN
    ALTER TABLE "scenario_case_seed_provenance"
      ADD CONSTRAINT "scenario_case_seed_provenance_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "portfoliocompanies"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scenario_case_seed_provenance_fund_idempotency_key_unique'
      AND conrelid = 'public.scenario_case_seed_provenance'::regclass
  ) THEN
    ALTER TABLE "scenario_case_seed_provenance"
      ADD CONSTRAINT "scenario_case_seed_provenance_fund_idempotency_key_unique"
      UNIQUE ("fund_id", "idempotency_key");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scenario_case_seed_provenance_trust_state_check'
      AND conrelid = 'public.scenario_case_seed_provenance'::regclass
  ) THEN
    ALTER TABLE "scenario_case_seed_provenance"
      ADD CONSTRAINT "scenario_case_seed_provenance_trust_state_check"
      CHECK ("trust_state" IN ('LIVE', 'PARTIAL', 'UNAVAILABLE', 'FAILED'));
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scenario_case_seed_provenance_currency_status_check'
      AND conrelid = 'public.scenario_case_seed_provenance'::regclass
  ) THEN
    ALTER TABLE "scenario_case_seed_provenance"
      ADD CONSTRAINT "scenario_case_seed_provenance_currency_status_check"
      CHECK ("currency_status" IN ('base_currency', 'mismatch_blocked', 'unknown'));
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scenario_case_seed_provenance_fund_idx"
  ON "scenario_case_seed_provenance" ("fund_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scenario_case_seed_provenance_company_idx"
  ON "scenario_case_seed_provenance" ("company_id");
