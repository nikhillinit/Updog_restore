-- Migration: 0009_fund_snapshots_scenario_set_id
-- Purpose: Add scenario_set_id column and dedup index to fund_snapshots.
--
-- Context: The Drizzle schema (shared/schema/fund.ts) declares
-- scenario_set_id uuid on fund_snapshots and a partial unique index
-- (fund_snapshots_scenarios_dedup_idx) but neither was ever captured
-- in the migration stream. The column is required by:
--   1. Drizzle's no-arg .returning() which expands to the full schema
--      column list (including scenario_set_id) -- this causes a 42703
--      error in reserve/pacing INSERT paths against a migration-built DB.
--   2. Raw SQL in fund-scenario-calculation-service.ts which explicitly
--      names scenario_set_id in its INSERT column list.
--   3. Test queries in fund-lifecycle-db.test.ts that filter on
--      fs.scenario_set_id IS NULL.
--
-- Prod-replay safety: both statements are guarded with IF NOT EXISTS /
-- ADD COLUMN IF NOT EXISTS so they are no-ops against any db:push-built
-- production DB that already has the column and index.

ALTER TABLE "fund_snapshots" ADD COLUMN IF NOT EXISTS "scenario_set_id" uuid;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fund_snapshots_scenarios_dedup_idx"
  ON "fund_snapshots" ("fund_id", "scenario_set_id", "config_id", "config_version", "state_hash")
  WHERE "type" = 'SCENARIOS'
    AND "scenario_set_id" IS NOT NULL
    AND "config_id" IS NOT NULL
    AND "config_version" IS NOT NULL
    AND "state_hash" IS NOT NULL;
