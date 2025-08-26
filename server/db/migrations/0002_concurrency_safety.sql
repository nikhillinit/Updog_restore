-- Migration 0002: Concurrency Safety (Step 2)
-- Reversible migration for optimistic locking, idempotency, and advisory locks

-- ============================================================
-- UP MIGRATION
-- ============================================================

-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- Add row version for optimistic concurrency control
ALTER TABLE fund_configs 
ADD COLUMN IF NOT EXISTS row_version UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS locked_by UUID,
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS lock_reason TEXT;

-- Create unique index for row version lookups (prevents duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_fund_configs_row_version ON fund_configs(id, row_version);

-- Idempotency tracking for calculations
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(255) NOT NULL,
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  params_hash VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')),
  response_hash VARCHAR(64),
  response JSONB,
  error_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (key, fund_id)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_fund_created ON idempotency_keys(fund_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expiry ON idempotency_keys(expires_at) WHERE status = 'succeeded';
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_status ON idempotency_keys(status, created_at) WHERE status != 'succeeded';

-- Function to clean expired idempotency keys
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys() RETURNS void AS $$
BEGIN
  DELETE FROM idempotency_keys 
  WHERE expires_at < NOW() AND status = 'succeeded';
END;
$$ LANGUAGE plpgsql;

-- Advisory lock tracking (for monitoring/debugging)
CREATE TABLE IF NOT EXISTS advisory_lock_log (
  id SERIAL PRIMARY KEY,
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  lock_hash BIGINT NOT NULL,
  acquired BOOLEAN NOT NULL,
  session_id VARCHAR(100),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  request_source VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_advisory_lock_active ON advisory_lock_log(fund_id, released_at) 
WHERE released_at IS NULL;

-- ============================================================
-- DOWN MIGRATION
-- ============================================================

-- To rollback, run:
-- DROP TABLE IF EXISTS advisory_lock_log;
-- DROP FUNCTION IF EXISTS cleanup_expired_idempotency_keys();
-- DROP TABLE IF EXISTS idempotency_keys;
-- ALTER TABLE fund_configs 
--   DROP COLUMN IF EXISTS row_version,
--   DROP COLUMN IF EXISTS locked_by,
--   DROP COLUMN IF EXISTS locked_at,
--   DROP COLUMN IF EXISTS lock_reason;