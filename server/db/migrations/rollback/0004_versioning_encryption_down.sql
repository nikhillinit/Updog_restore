-- Rollback 0004: Versioning & Encryption
-- Complete DOWN migration for 0004_versioning_encryption.sql

-- Drop PII access log
DROP INDEX IF EXISTS idx_pii_access_log_entity;
DROP INDEX IF EXISTS idx_pii_access_log_actor;
DROP TABLE IF EXISTS pii_access_log CASCADE;

-- Drop limited partners
DROP INDEX IF EXISTS idx_limited_partners_org;
DROP INDEX IF EXISTS idx_limited_partners_fund;
DROP TABLE IF EXISTS limited_partners CASCADE;

-- Drop PII fields registry
DROP TABLE IF EXISTS pii_fields CASCADE;

-- Drop encryption keys
DROP INDEX IF EXISTS idx_encryption_keys_org;
DROP TABLE IF EXISTS encryption_keys CASCADE;

-- Drop calculation executions
DROP INDEX IF EXISTS idx_calc_executions_version;
DROP INDEX IF EXISTS idx_calc_executions_fund;
DROP TABLE IF EXISTS calc_executions CASCADE;

-- Drop WASM binaries
DROP INDEX IF EXISTS idx_wasm_binaries_sha;
DROP TABLE IF EXISTS wasm_binaries CASCADE;

-- Drop calculation versions
DROP TABLE IF EXISTS calc_versions CASCADE;