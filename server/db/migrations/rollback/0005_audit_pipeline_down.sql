-- Rollback 0005: Audit Pipeline
-- Complete DOWN migration for 0005_audit_pipeline.sql

-- Drop function
DROP FUNCTION IF EXISTS process_audit_outbox(INTEGER) CASCADE;

-- Drop approval signatures
DROP INDEX IF EXISTS idx_approval_signatures_partner;
DROP INDEX IF EXISTS idx_approval_signatures_approval;
DROP TABLE IF EXISTS approval_signatures CASCADE;

-- Drop reserve approvals
DROP INDEX IF EXISTS idx_reserve_approvals_org;
DROP INDEX IF EXISTS idx_reserve_approvals_expiry;
DROP INDEX IF EXISTS idx_reserve_approvals_status;
DROP TABLE IF EXISTS reserve_approvals CASCADE;

-- Drop approval audit
DROP INDEX IF EXISTS idx_approval_audit_actor;
DROP INDEX IF EXISTS idx_approval_audit_approval;
DROP TABLE IF EXISTS approval_audit CASCADE;

-- Drop audit outbox
DROP INDEX IF EXISTS idx_audit_outbox_message_id;
DROP INDEX IF EXISTS idx_audit_outbox_retry;
DROP INDEX IF EXISTS idx_audit_outbox_pending;
DROP TABLE IF EXISTS audit_outbox CASCADE;

-- Drop audit events
DROP INDEX IF EXISTS idx_audit_events_compliance;
DROP INDEX IF EXISTS idx_audit_events_entity;
DROP INDEX IF EXISTS idx_audit_events_lookup;
DROP TABLE IF EXISTS audit_events CASCADE;

-- Drop calculation audit
DROP INDEX IF EXISTS idx_calc_audit_approval;
DROP INDEX IF EXISTS idx_calc_audit_actor;
DROP INDEX IF EXISTS idx_calc_audit_org;
DROP INDEX IF EXISTS idx_calc_audit_fund;
DROP TABLE IF EXISTS calc_audit CASCADE;