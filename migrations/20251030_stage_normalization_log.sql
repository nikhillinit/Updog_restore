-- Migration: Stage Normalization Audit Log Table
-- Date: 2025-10-30
-- Purpose: Track all stage normalization operations for audit and rollback capability
-- ADR-011 Reference: https://github.com/press-on-ventures/updog/blob/main/docs/adr/ADR-011-stage-normalization-v2.md

-- Create action enum for type safety (P0 fix: replaced TEXT with ENUM)
-- NOTE: PostgreSQL CREATE TYPE does not support IF NOT EXISTS, so we use DO block
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stage_normalization_action') THEN
    CREATE TYPE stage_normalization_action AS ENUM('normalize', 'validate', 'force_through');
  END IF;
END $$;

-- Create audit log table with comprehensive constraints (P0/P1 fixes applied)
CREATE TABLE IF NOT EXISTS stage_normalization_log (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL CHECK (table_name IN ('portfoliocompanies', 'deal_opportunities')),
  row_id TEXT NOT NULL, -- Stringified PK supporting INTEGER, UUID, or BIGINT types
  stage_before TEXT NOT NULL, -- Original non-canonical value
  stage_after TEXT NOT NULL CHECK (
    stage_after IN ('pre-seed', 'seed', 'series-a', 'series-b', 'series-c', 'series-c+')
  ), -- Canonical value only
  action stage_normalization_action NOT NULL,
  run_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

  -- P0 fix: Prevent logging no-op changes
  CONSTRAINT stage_changed CHECK (stage_before IS DISTINCT FROM stage_after)
);

-- Create indexes for efficient querying
-- Index 1: Lookup all changes for a specific row (primary query pattern)
CREATE INDEX IF NOT EXISTS idx_stage_normalization_log_table_row
  ON stage_normalization_log(table_name, row_id);

-- Index 2: Time-range queries (rollback scenarios)
CREATE INDEX IF NOT EXISTS idx_stage_normalization_log_run_at
  ON stage_normalization_log(table_name, run_at DESC);

-- Index 3: P1 fix - Prevent duplicate logging of same change
CREATE UNIQUE INDEX IF NOT EXISTS idx_stage_normalization_log_unique_change
  ON stage_normalization_log(table_name, row_id, stage_before, stage_after, run_at);

-- Add comprehensive comments for documentation (P3 fix: expanded notes)
COMMENT ON TABLE stage_normalization_log IS
  'Audit log for stage normalization migrations. Records all stage value changes for traceability and rollback capability.

  Retention: Keep indefinitely for compliance/audit. Table is write-once during migrations only.
  Performance: Optimized for batch INSERTs during migration runs; queries are rare (debugging/rollback only).
  Related: Used by scripts/normalize-stages.ts during database migrations.

  Example rollback query:
    SELECT row_id, stage_before
    FROM stage_normalization_log
    WHERE table_name = ''portfoliocompanies''
      AND run_at > ''2025-10-30 00:00:00+00''
    ORDER BY run_at DESC;';

COMMENT ON COLUMN stage_normalization_log.table_name IS
  'The table where the stage was normalized (validated: portfoliocompanies, deal_opportunities)';

COMMENT ON COLUMN stage_normalization_log.row_id IS
  'The primary key of the row that was updated (stored as TEXT to support INTEGER, UUID, and BIGINT types)';

COMMENT ON COLUMN stage_normalization_log.stage_before IS
  'The original (non-canonical) stage value before normalization - may contain typos, alternate casings, or deprecated aliases';

COMMENT ON COLUMN stage_normalization_log.stage_after IS
  'The canonical stage value after normalization (validated: pre-seed, seed, series-a, series-b, series-c, series-c+)';

COMMENT ON COLUMN stage_normalization_log.action IS
  'The action performed: normalize (routine migration), validate (dry-run check), force_through (override validation)';

COMMENT ON COLUMN stage_normalization_log.run_at IS
  'Timestamp of the normalization operation (UTC) - used to group related changes in a single migration run';

COMMENT ON TYPE stage_normalization_action IS
  'Valid actions: normalize (standard migration), validate (dry-run), force_through (bypass validation gates)';
