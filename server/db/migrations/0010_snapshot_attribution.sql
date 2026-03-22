-- 0010_snapshot_attribution.sql
-- Phase 2A Item 8: Add runId/configId/configVersion to fund_snapshots
-- Nullable for existing rows (legacy compat)

BEGIN;

ALTER TABLE fund_snapshots
  ADD COLUMN IF NOT EXISTS run_id          INTEGER,
  ADD COLUMN IF NOT EXISTS config_id       INTEGER,
  ADD COLUMN IF NOT EXISTS config_version  INTEGER;

COMMIT;
