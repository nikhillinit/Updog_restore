ALTER TABLE lp_metric_runs
  DROP COLUMN IF EXISTS locked_by,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS version;
