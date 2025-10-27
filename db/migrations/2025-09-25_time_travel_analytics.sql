-- Time-Travel Analytics Migration
-- Created: 2025-09-25
-- Description: Add comprehensive time-travel analytics infrastructure for fund state snapshots and restoration
-- NOTE: This migration MUST run BEFORE 2025-09-26_variance_tracking.sql which references fund_state_snapshots

BEGIN;

-- ============================================================================
-- PREREQUISITES
-- This migration requires:
--   1. pgcrypto extension (for gen_random_uuid())
--   2. funds table (from Drizzle schema)
--   3. users table (from Drizzle schema)
-- ============================================================================

-- Enable UUID generation (required for gen_random_uuid())
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- FUND STATE SNAPSHOTS
-- Core snapshot storage for point-in-time fund state capture
-- ============================================================================

CREATE TABLE IF NOT EXISTS fund_state_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,

  -- Snapshot identification
  snapshot_name TEXT NOT NULL,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('quarterly', 'annual', 'milestone', 'adhoc', 'checkpoint')),
  trigger_event TEXT NOT NULL CHECK (trigger_event IN ('scheduled', 'manual', 'threshold_breach', 'milestone', 'year_end')),

  -- Capture timing
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- State data (JSONB for flexible schema)
  portfolio_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  fund_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Additional state components
  fund_state JSONB DEFAULT '{}'::jsonb,
  metrics_state JSONB DEFAULT '{}'::jsonb,
  reserve_state JSONB DEFAULT '{}'::jsonb,
  pacing_state JSONB DEFAULT '{}'::jsonb,

  -- Data quality and validation
  data_integrity_score DECIMAL(3,2) DEFAULT 1.00 CHECK (data_integrity_score >= 0.00 AND data_integrity_score <= 1.00),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'processing', 'failed')),

  -- Tags for organization
  tags TEXT[] DEFAULT '{}',

  -- User tracking
  created_by INTEGER NOT NULL REFERENCES users(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for fund_state_snapshots
CREATE INDEX fund_state_snapshots_fund_idx ON fund_state_snapshots (fund_id);
CREATE INDEX fund_state_snapshots_captured_idx ON fund_state_snapshots (captured_at DESC);
CREATE INDEX fund_state_snapshots_type_idx ON fund_state_snapshots (snapshot_type);
CREATE INDEX fund_state_snapshots_status_idx ON fund_state_snapshots (status);

-- GIN indexes for JSONB containment queries
CREATE INDEX fund_state_snapshots_portfolio_state_gin ON fund_state_snapshots USING gin (portfolio_state jsonb_path_ops);
CREATE INDEX fund_state_snapshots_fund_metrics_gin ON fund_state_snapshots USING gin (fund_metrics jsonb_path_ops);
CREATE INDEX fund_state_snapshots_metadata_gin ON fund_state_snapshots USING gin (metadata jsonb_path_ops);
CREATE INDEX fund_state_snapshots_tags_gin ON fund_state_snapshots USING gin (tags);

-- ============================================================================
-- SNAPSHOT COMPARISONS
-- Compare two snapshots to analyze changes over time
-- ============================================================================

CREATE TABLE IF NOT EXISTS snapshot_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Snapshot references (must be different snapshots)
  base_snapshot_id UUID NOT NULL REFERENCES fund_state_snapshots(id) ON DELETE CASCADE,
  compare_snapshot_id UUID NOT NULL REFERENCES fund_state_snapshots(id) ON DELETE CASCADE,

  -- Comparison metadata
  comparison_name TEXT NOT NULL,
  comparison_type TEXT NOT NULL CHECK (comparison_type IN ('period_over_period', 'baseline_comparison', 'peer_analysis', 'scenario_analysis')),

  -- Comparison results (JSONB for flexible analysis)
  value_changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  portfolio_changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  insights JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Additional comparison data
  differences JSONB DEFAULT '{}'::jsonb,
  summary JSONB DEFAULT '{}'::jsonb,
  metrics_comparison JSONB DEFAULT '{}'::jsonb,

  -- Quality metrics
  confidence_score DECIMAL(3,2) DEFAULT 1.00 CHECK (confidence_score >= 0.00 AND confidence_score <= 1.00),

  -- User tracking
  created_by INTEGER NOT NULL REFERENCES users(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT snapshot_comparisons_different_snapshots CHECK (base_snapshot_id != compare_snapshot_id)
);

-- Create indexes for snapshot_comparisons
CREATE INDEX snapshot_comparisons_base_idx ON snapshot_comparisons (base_snapshot_id);
CREATE INDEX snapshot_comparisons_compare_idx ON snapshot_comparisons (compare_snapshot_id);
CREATE INDEX snapshot_comparisons_type_idx ON snapshot_comparisons (comparison_type);

-- GIN indexes for JSONB queries
CREATE INDEX snapshot_comparisons_value_changes_gin ON snapshot_comparisons USING gin (value_changes jsonb_path_ops);
CREATE INDEX snapshot_comparisons_insights_gin ON snapshot_comparisons USING gin (insights jsonb_path_ops);

-- Unique constraint to prevent duplicate comparisons
CREATE UNIQUE INDEX snapshot_comparisons_unique_pair ON snapshot_comparisons (
  LEAST(base_snapshot_id, compare_snapshot_id),
  GREATEST(base_snapshot_id, compare_snapshot_id)
);

-- ============================================================================
-- TIMELINE EVENTS
-- Track significant events in fund history
-- ============================================================================

CREATE TABLE IF NOT EXISTS timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event context
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  snapshot_id UUID REFERENCES fund_state_snapshots(id) ON DELETE SET NULL,

  -- Event classification
  event_type TEXT NOT NULL CHECK (event_type IN ('investment', 'exit', 'valuation_change', 'follow_on', 'write_off', 'dividend')),
  event_title TEXT NOT NULL,
  event_description TEXT,

  -- Event timing
  event_date TIMESTAMPTZ NOT NULL,

  -- Event data (JSONB for flexible schema)
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  impact_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Event severity
  severity TEXT DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  -- User tracking
  created_by INTEGER NOT NULL REFERENCES users(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for timeline_events
CREATE INDEX timeline_events_fund_idx ON timeline_events (fund_id, event_date DESC);
CREATE INDEX timeline_events_snapshot_idx ON timeline_events (snapshot_id);
CREATE INDEX timeline_events_date_idx ON timeline_events (event_date DESC);
CREATE INDEX timeline_events_type_idx ON timeline_events (event_type);
CREATE INDEX timeline_events_severity_idx ON timeline_events (severity);

-- GIN indexes for JSONB queries
CREATE INDEX timeline_events_event_data_gin ON timeline_events USING gin (event_data jsonb_path_ops);
CREATE INDEX timeline_events_impact_metrics_gin ON timeline_events USING gin (impact_metrics jsonb_path_ops);

-- ============================================================================
-- STATE RESTORATION LOGS
-- Track state restoration operations for audit and debugging
-- ============================================================================

CREATE TABLE IF NOT EXISTS state_restoration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Restoration context
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  snapshot_id UUID NOT NULL REFERENCES fund_state_snapshots(id) ON DELETE CASCADE,

  -- Restoration details
  restoration_type TEXT NOT NULL CHECK (restoration_type IN ('full', 'partial', 'metrics_only', 'portfolio_only')),
  reason TEXT NOT NULL,

  -- State changes (JSONB for flexible tracking)
  changes_applied JSONB NOT NULL DEFAULT '[]'::jsonb,
  before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  affected_entities JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Performance metrics
  restoration_duration_ms INTEGER CHECK (restoration_duration_ms >= 0),

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  error_message TEXT,

  -- User tracking
  initiated_by INTEGER NOT NULL REFERENCES users(id),

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for state_restoration_logs
CREATE INDEX state_restoration_logs_fund_idx ON state_restoration_logs (fund_id, started_at DESC);
CREATE INDEX state_restoration_logs_snapshot_idx ON state_restoration_logs (snapshot_id);
CREATE INDEX state_restoration_logs_status_idx ON state_restoration_logs (status);
CREATE INDEX state_restoration_logs_type_idx ON state_restoration_logs (restoration_type);

-- GIN indexes for JSONB queries
CREATE INDEX state_restoration_logs_changes_gin ON state_restoration_logs USING gin (changes_applied jsonb_path_ops);
CREATE INDEX state_restoration_logs_affected_gin ON state_restoration_logs USING gin (affected_entities jsonb_path_ops);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Add updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Add updated_at triggers for all time-travel tables (idempotent)
DROP TRIGGER IF EXISTS update_fund_state_snapshots_updated_at ON fund_state_snapshots;
CREATE TRIGGER update_fund_state_snapshots_updated_at
  BEFORE UPDATE ON fund_state_snapshots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_snapshot_comparisons_updated_at ON snapshot_comparisons;
CREATE TRIGGER update_snapshot_comparisons_updated_at
  BEFORE UPDATE ON snapshot_comparisons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_timeline_events_updated_at ON timeline_events;
CREATE TRIGGER update_timeline_events_updated_at
  BEFORE UPDATE ON timeline_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_state_restoration_logs_updated_at ON state_restoration_logs;
CREATE TRIGGER update_state_restoration_logs_updated_at
  BEFORE UPDATE ON state_restoration_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- UTILITY VIEWS
-- ============================================================================

-- Active snapshots with fund information
CREATE OR REPLACE VIEW active_snapshots AS
SELECT
  fs.*,
  f.name as fund_name,
  u.username as created_by_name,
  (SELECT COUNT(*) FROM snapshot_comparisons sc
   WHERE sc.base_snapshot_id = fs.id OR sc.compare_snapshot_id = fs.id) as comparison_count,
  (SELECT COUNT(*) FROM timeline_events te
   WHERE te.snapshot_id = fs.id) as event_count
FROM fund_state_snapshots fs
JOIN funds f ON fs.fund_id = f.id
JOIN users u ON fs.created_by = u.id
WHERE fs.status = 'active'
ORDER BY fs.fund_id, fs.captured_at DESC;

-- Recent timeline events
CREATE OR REPLACE VIEW recent_timeline_events AS
SELECT
  te.*,
  f.name as fund_name,
  fs.snapshot_name,
  u.username as created_by_name
FROM timeline_events te
JOIN funds f ON te.fund_id = f.id
LEFT JOIN fund_state_snapshots fs ON te.snapshot_id = fs.id
JOIN users u ON te.created_by = u.id
ORDER BY te.event_date DESC
LIMIT 100;

-- State restoration history
CREATE OR REPLACE VIEW restoration_history AS
SELECT
  srl.*,
  f.name as fund_name,
  fs.snapshot_name,
  u.username as initiated_by_name,
  EXTRACT(EPOCH FROM (srl.completed_at - srl.started_at)) as duration_seconds
FROM state_restoration_logs srl
JOIN funds f ON srl.fund_id = f.id
JOIN fund_state_snapshots fs ON srl.snapshot_id = fs.id
JOIN users u ON srl.initiated_by = u.id
ORDER BY srl.started_at DESC;

COMMIT;

-- ============================================================================
-- TABLE COMMENTS
-- ============================================================================

COMMENT ON TABLE fund_state_snapshots IS 'Point-in-time snapshots of fund state for time-travel analytics and historical comparison';
COMMENT ON TABLE snapshot_comparisons IS 'Analytical comparisons between different fund state snapshots over time';
COMMENT ON TABLE timeline_events IS 'Significant events in fund history linked to state snapshots';
COMMENT ON TABLE state_restoration_logs IS 'Audit trail of state restoration operations for debugging and compliance';

-- Migration completed successfully
-- Tables created: 4 time-travel analytics tables
-- Indexes created: 25+ indexes including GIN indexes for JSONB queries
-- Views created: 3 analytical views for common queries
-- Note: This migration creates tables referenced by 2025-09-26_variance_tracking.sql
