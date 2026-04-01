-- Phase 0 runtime alignment
-- Keeps the root migration stream compatible with the storage layer used by
-- calc-run completion and attributed fund-metrics persistence.

ALTER TABLE "funds" ADD COLUMN IF NOT EXISTS "engine_results" jsonb;
