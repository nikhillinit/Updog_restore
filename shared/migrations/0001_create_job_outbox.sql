-- Migration: 0001_create_job_outbox.sql
-- Created: 2026-01-04
-- Purpose: Transactional outbox pattern for exactly-once job semantics
-- See: docs/plans/2026-01-04-phase1-implementation-plan.md (Task 1)
-- See: docs/plans/2026-01-04-critical-corrections.md (Corrections #3, #6, #7, #8)

CREATE TABLE IF NOT EXISTS job_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 0,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  scheduled_for TIMESTAMPTZ,
  processing_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Correction #6: Composite index with ORDER BY (next_run_at, created_at) for CTE claiming
-- Used by: SELECT ... WHERE status='pending' AND next_run_at <= NOW() ORDER BY next_run_at, created_at FOR UPDATE SKIP LOCKED
CREATE INDEX idx_job_outbox_claim
  ON job_outbox (next_run_at ASC, created_at ASC)
  WHERE status = 'pending';

-- Correction #6: Index for priority-based job selection with DESC ordering
CREATE INDEX idx_job_outbox_pending_priority
  ON job_outbox (status, priority DESC, created_at ASC)
  WHERE status = 'pending';

-- Correction #7: Partial index without NOW() in predicate (invalid in Postgres)
-- Used by stuck job reaper: WHERE status='processing' AND processing_at < NOW() - make_interval(secs => 300)
CREATE INDEX idx_job_outbox_processing
  ON job_outbox (processing_at ASC)
  WHERE status = 'processing';

-- Index for job type filtering (duplicate detection, metrics)
CREATE INDEX idx_job_outbox_job_type
  ON job_outbox (job_type);

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_job_outbox_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER job_outbox_updated_at
  BEFORE UPDATE ON job_outbox
  FOR EACH ROW
  EXECUTE FUNCTION update_job_outbox_updated_at();

-- Comments
COMMENT ON TABLE job_outbox IS 'Transactional outbox pattern for exactly-once BullMQ job semantics';
COMMENT ON COLUMN job_outbox.next_run_at IS 'Correction #3: Used with make_interval(secs => $n) for parameterized backoff';
COMMENT ON INDEX idx_job_outbox_claim IS 'Correction #6: Composite index matches ORDER BY (next_run_at, created_at) for CTE claiming';
COMMENT ON INDEX idx_job_outbox_processing IS 'Correction #7: No NOW() in partial index predicate - query filters separately';
