-- Phase 1A.1c baseline snapshot expansion
-- Persist full company snapshots on fund baselines so variance reports can
-- classify matched/added/removed companies against a stable baseline source.

ALTER TABLE "fund_baselines"
ADD COLUMN IF NOT EXISTS "company_snapshots" jsonb;
