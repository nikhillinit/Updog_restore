-- Migration 006: Persist full company snapshots on fund baselines
-- Supports richer variance analysis without depending only on top performers.

ALTER TABLE fund_baselines
ADD COLUMN IF NOT EXISTS company_snapshots jsonb;
