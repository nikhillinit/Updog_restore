-- Roll back LP Reporting narrative edit/review lifecycle columns.

ALTER TABLE narrative_runs
  DROP COLUMN IF EXISTS reviewed_at;

ALTER TABLE narrative_runs
  DROP COLUMN IF EXISTS reviewed_by;

ALTER TABLE narrative_runs
  DROP COLUMN IF EXISTS version;
