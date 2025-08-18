-- Schedule pg_cron job for audit log cleanup
-- Run this after ensuring pg_cron extension is enabled

-- Create the extension if it doesn't exist (requires superuser privileges)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule nightly cleanup at 02:00 UTC
-- Uses chunked deletion with 10k records per batch and 50ms pause between batches
SELECT cron.schedule(
    job_name => 'cleanup-audit',
    schedule => 'CRON_TZ=UTC 0 2 * * *',
    command  => $cmd$CALL maintenance.cleanup_audit(NOW(), 10000, '50 milliseconds');$cmd$
);

-- Verify the job was scheduled
SELECT 
    jobid, 
    jobname, 
    schedule, 
    command,
    nodename,
    nodeport,
    database,
    username,
    active
FROM cron.job 
WHERE jobname = 'cleanup-audit';

-- Show job run history (if any)
SELECT 
    jobid,
    runid,
    job_pid,
    database,
    username,
    command,
    status,
    return_message,
    start_time,
    end_time
FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'cleanup-audit')
ORDER BY start_time DESC 
LIMIT 10;