-- ============================================================================
-- Create Portfolio Tables (forecast_snapshots, investment_lots, reserve_allocations)
-- Date: 2025-11-17
-- Purpose: Create missing tables required by 0001_portfolio_schema_hardening.sql
-- ============================================================================

-- forecast_snapshots table
CREATE TABLE IF NOT EXISTS "forecast_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source_hash" text,
	"calculated_metrics" jsonb,
	"fund_state" jsonb,
	"portfolio_state" jsonb,
	"metrics_state" jsonb,
	"snapshot_time" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forecast_snapshots_status_check" CHECK ("forecast_snapshots"."status" IN ('pending', 'calculating', 'complete', 'error'))
);

-- investment_lots table
CREATE TABLE IF NOT EXISTS "investment_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investment_id" integer NOT NULL,
	"lot_type" text NOT NULL,
	"share_price_cents" bigint NOT NULL,
	"shares_acquired" numeric(18, 8) NOT NULL,
	"cost_basis_cents" bigint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investment_lots_lot_type_check" CHECK ("investment_lots"."lot_type" IN ('initial', 'follow_on', 'secondary'))
);

-- reserve_allocations table
CREATE TABLE IF NOT EXISTS "reserve_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"company_id" integer NOT NULL,
	"planned_reserve_cents" bigint NOT NULL,
	"allocation_score" numeric(10, 6),
	"priority" integer,
	"rationale" text,
	"version" integer DEFAULT 1 NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Foreign key constraints (if they don't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'forecast_snapshots_fund_id_fk'
  ) THEN
    ALTER TABLE "forecast_snapshots"
      ADD CONSTRAINT "forecast_snapshots_fund_id_fk"
      FOREIGN KEY ("fund_id") REFERENCES "funds"("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'investment_lots_investment_id_fk'
  ) THEN
    ALTER TABLE "investment_lots"
      ADD CONSTRAINT "investment_lots_investment_id_fk"
      FOREIGN KEY ("investment_id") REFERENCES "investments"("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reserve_allocations_snapshot_id_fk'
  ) THEN
    ALTER TABLE "reserve_allocations"
      ADD CONSTRAINT "reserve_allocations_snapshot_id_fk"
      FOREIGN KEY ("snapshot_id") REFERENCES "forecast_snapshots"("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reserve_allocations_company_id_fk'
  ) THEN
    ALTER TABLE "reserve_allocations"
      ADD CONSTRAINT "reserve_allocations_company_id_fk"
      FOREIGN KEY ("company_id") REFERENCES "portfoliocompanies"("id");
  END IF;
END $$;

-- Verify tables were created
DO $$
DECLARE
  v_forecast_exists boolean;
  v_lots_exists boolean;
  v_allocations_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'forecast_snapshots'
  ) INTO v_forecast_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'investment_lots'
  ) INTO v_lots_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'reserve_allocations'
  ) INTO v_allocations_exists;

  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Portfolio Tables Creation Verification';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'forecast_snapshots: %', v_forecast_exists;
  RAISE NOTICE 'investment_lots: %', v_lots_exists;
  RAISE NOTICE 'reserve_allocations: %', v_allocations_exists;
  RAISE NOTICE '============================================================================';

  IF NOT v_forecast_exists OR NOT v_lots_exists OR NOT v_allocations_exists THEN
    RAISE EXCEPTION 'Table creation failed - see NOTICE output above';
  END IF;

  RAISE NOTICE 'SUCCESS: All portfolio tables created successfully';
END $$;
