-- Migration: 0007_snapshot_versioning.sql
-- Description: Add snapshot version history with auto-pruning support
-- Author: Claude Code
-- Date: 2026-01-04

-- ============================================================================
-- UP MIGRATION
-- ============================================================================

CREATE TABLE snapshot_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES forecast_snapshots(id) ON DELETE CASCADE,

  -- Version tracking (simple sequential numbering)
  version_number INTEGER NOT NULL,
  parent_version_id UUID REFERENCES snapshot_versions(id),

  -- Named version support (optional label for what-if scenarios)
  version_name VARCHAR(100),
  is_current BOOLEAN DEFAULT false,

  -- State capture (immutable after creation)
  state_snapshot JSONB NOT NULL,
  calculated_metrics JSONB,
  source_hash VARCHAR(64) NOT NULL,

  -- Metadata
  description TEXT,
  created_by UUID,
  tags TEXT[],

  -- Retention policy
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),
  is_pinned BOOLEAN DEFAULT false,  -- Pinned versions are not auto-pruned

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT snapshot_versions_unique_version
    UNIQUE (snapshot_id, version_number)
);

-- Indexes for efficient queries
CREATE INDEX idx_snapshot_versions_snapshot_id
  ON snapshot_versions(snapshot_id, version_number DESC);

CREATE INDEX idx_snapshot_versions_current
  ON snapshot_versions(snapshot_id)
  WHERE is_current = true;

CREATE INDEX idx_snapshot_versions_parent
  ON snapshot_versions(parent_version_id);

CREATE INDEX idx_snapshot_versions_source_hash
  ON snapshot_versions(source_hash);

CREATE INDEX idx_snapshot_versions_expires
  ON snapshot_versions(expires_at)
  WHERE is_pinned = false;

-- Function to ensure only one current version per snapshot
CREATE OR REPLACE FUNCTION ensure_single_current()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_current = true THEN
    UPDATE snapshot_versions
    SET is_current = false
    WHERE snapshot_id = NEW.snapshot_id
      AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER snapshot_versions_current_trigger
BEFORE INSERT OR UPDATE ON snapshot_versions
FOR EACH ROW EXECUTE FUNCTION ensure_single_current();

-- Function to auto-prune expired versions (run via cron/scheduler)
CREATE OR REPLACE FUNCTION prune_expired_versions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM snapshot_versions
  WHERE expires_at < NOW()
    AND is_pinned = false;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- DOWN MIGRATION
-- ============================================================================

-- DROP TRIGGER snapshot_versions_current_trigger ON snapshot_versions;
-- DROP FUNCTION ensure_single_current();
-- DROP FUNCTION prune_expired_versions();
-- DROP TABLE snapshot_versions;
