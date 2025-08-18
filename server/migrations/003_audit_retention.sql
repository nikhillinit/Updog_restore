-- Audit log and pg_cron retention migration
-- Generated: 2025-08-18

-- 1) Create audit_log table for comprehensive activity tracking
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    changes JSONB,
    ip_address INET,
    user_agent TEXT,
    correlation_id VARCHAR(36),
    session_id VARCHAR(64),
    request_path TEXT,
    http_method VARCHAR(10),
    status_code INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- Automatically calculate retention until (7 years from creation)
    retention_until TIMESTAMPTZ GENERATED ALWAYS AS (created_at + INTERVAL '7 years') STORED
);

-- 2) Create index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_audit_retention ON audit_log (retention_until);
CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit_log (correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_user_action ON audit_log (user_id, action, created_at DESC);

-- 3) Maintenance schema for operational procedures
CREATE SCHEMA IF NOT EXISTS maintenance;

-- 4) Chunked, safe cleanup procedure with timeouts and limits
CREATE OR REPLACE PROCEDURE maintenance.cleanup_audit(
    p_cutoff TIMESTAMPTZ DEFAULT NOW(),
    p_limit INTEGER DEFAULT 10000,
    p_sleep INTERVAL DEFAULT '50 milliseconds'
)
LANGUAGE plpgsql
AS $$
DECLARE 
    v_batch INTEGER;
    v_deleted INTEGER := 0;
    v_start_time TIMESTAMPTZ := NOW();
    v_max_runtime INTERVAL := '10 minutes';
BEGIN
    -- Safety: avoid blocking / being blocked
    PERFORM set_config('lock_timeout', '1s', true);
    PERFORM set_config('statement_timeout', '5min', true);
    
    -- Log procedure start
    RAISE NOTICE 'cleanup_audit started at % with cutoff % and limit %', v_start_time, p_cutoff, p_limit;

    LOOP
        -- Exit if we've been running too long
        IF NOW() - v_start_time > v_max_runtime THEN
            RAISE NOTICE 'cleanup_audit stopped after % due to max runtime, deleted % rows', NOW() - v_start_time, v_deleted;
            EXIT;
        END IF;

        -- Delete a batch of expired records
        WITH cte AS (
            SELECT id 
            FROM audit_log
            WHERE retention_until < p_cutoff
            ORDER BY retention_until
            LIMIT p_limit
        )
        DELETE FROM audit_log a 
        USING cte
        WHERE a.id = cte.id;
        
        GET DIAGNOSTICS v_batch = ROW_COUNT;
        
        -- Exit if no more rows to delete
        EXIT WHEN v_batch = 0;
        
        v_deleted := v_deleted + v_batch;
        
        -- Brief pause to yield to foreground traffic
        PERFORM pg_sleep(EXTRACT(EPOCH FROM p_sleep));
    END LOOP;

    RAISE NOTICE 'cleanup_audit completed, deleted % rows in %', v_deleted, NOW() - v_start_time;
END;
$$;

-- 5) Least-privilege role for scheduled jobs
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'job_runner') THEN
        CREATE ROLE job_runner LOGIN;
    END IF;
END$$;

GRANT USAGE ON SCHEMA maintenance TO job_runner;
GRANT EXECUTE ON PROCEDURE maintenance.cleanup_audit(TIMESTAMPTZ, INTEGER, INTERVAL) TO job_runner;
GRANT DELETE ON audit_log TO job_runner;

-- 6) Status monitoring function for operational visibility
CREATE OR REPLACE FUNCTION maintenance.audit_cleanup_status()
RETURNS TABLE(
    total_records BIGINT,
    expired_records BIGINT,
    retention_days INTEGER,
    oldest_record TIMESTAMPTZ,
    newest_record TIMESTAMPTZ,
    table_size_mb NUMERIC
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM audit_log) as total_records,
        (SELECT COUNT(*) FROM audit_log WHERE retention_until < NOW()) as expired_records,
        (SELECT EXTRACT(days FROM INTERVAL '7 years'))::INTEGER as retention_days,
        (SELECT MIN(created_at) FROM audit_log) as oldest_record,
        (SELECT MAX(created_at) FROM audit_log) as newest_record,
        (SELECT 
            ROUND(
                (pg_total_relation_size('audit_log'::regclass) / (1024^2))::NUMERIC, 
                2
            )
        ) as table_size_mb;
END;
$$;

GRANT EXECUTE ON FUNCTION maintenance.audit_cleanup_status() TO job_runner;

-- 7) Optional: Create pg_cron extension if not exists (requires superuser)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 8) Sample usage for manual verification
-- To manually run cleanup: CALL maintenance.cleanup_audit(NOW(), 1000, '10 milliseconds');
-- To check status: SELECT * FROM maintenance.audit_cleanup_status();

COMMENT ON TABLE audit_log IS 'Comprehensive audit trail with automatic 7-year retention';
COMMENT ON COLUMN audit_log.retention_until IS 'Automatically calculated expiration date (created_at + 7 years)';
COMMENT ON PROCEDURE maintenance.cleanup_audit IS 'Safely delete expired audit records in batches with timeouts';
COMMENT ON FUNCTION maintenance.audit_cleanup_status IS 'Monitor audit log retention and cleanup status';