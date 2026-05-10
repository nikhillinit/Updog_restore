-- LP Reporting narrative edit/review lifecycle.
-- Adds optimistic locking plus review audit fields for narrative lifecycle transitions.

ALTER TABLE narrative_runs
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE narrative_runs
  ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id);

ALTER TABLE narrative_runs
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;
