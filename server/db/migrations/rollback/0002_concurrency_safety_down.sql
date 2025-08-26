-- Rollback 0002: Concurrency Safety
-- Complete DOWN migration for 0002_concurrency_safety.sql

-- Drop advisory lock tracking
DROP TABLE IF EXISTS advisory_lock_log CASCADE;

-- Drop function
DROP FUNCTION IF EXISTS cleanup_expired_idempotency_keys() CASCADE;

-- Drop idempotency keys table and indexes
DROP INDEX IF EXISTS idx_idempotency_keys_expiry;
DROP INDEX IF EXISTS idx_idempotency_keys_lookup;
DROP TABLE IF EXISTS idempotency_keys CASCADE;

-- Remove concurrency control columns from fund_configs
DROP INDEX IF EXISTS idx_fund_configs_row_version;
ALTER TABLE fund_configs 
  DROP COLUMN IF EXISTS row_version,
  DROP COLUMN IF EXISTS locked_by,
  DROP COLUMN IF EXISTS locked_at,
  DROP COLUMN IF EXISTS lock_reason;