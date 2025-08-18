-- Unschedule the audit log cleanup job
-- Use this for maintenance or when decommissioning

-- Show current job details before removal
SELECT 
    jobid, 
    jobname, 
    schedule, 
    command,
    active
FROM cron.job 
WHERE jobname = 'cleanup-audit';

-- Unschedule the job
SELECT cron.unschedule((
    SELECT jobid 
    FROM cron.job 
    WHERE jobname = 'cleanup-audit'
));

-- Verify removal
SELECT COUNT(*) as remaining_jobs
FROM cron.job 
WHERE jobname = 'cleanup-audit';

-- Show recent run history (will remain for reference)
SELECT 
    jobid,
    runid,
    status,
    return_message,
    start_time,
    end_time
FROM cron.job_run_details 
WHERE jobid IN (
    SELECT jobid 
    FROM cron.job 
    WHERE jobname = 'cleanup-audit'
)
ORDER BY start_time DESC 
LIMIT 5;