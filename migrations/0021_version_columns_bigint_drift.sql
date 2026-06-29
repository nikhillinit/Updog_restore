-- @drift-patch
-- Reason: align optimistic-lock version columns with the shared/schema bigint shape source; journal 0001 created them as integer before the shape widened to bigint. Proven by tests/integration/prod-schema-clone.test.ts.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'forecast_snapshots'
      AND column_name = 'version'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE "forecast_snapshots" ALTER COLUMN "version" TYPE bigint;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'investment_lots'
      AND column_name = 'version'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE "investment_lots" ALTER COLUMN "version" TYPE bigint;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reserve_allocations'
      AND column_name = 'version'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE "reserve_allocations" ALTER COLUMN "version" TYPE bigint;
  END IF;
END $$;
