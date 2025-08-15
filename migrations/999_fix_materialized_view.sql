
-- Fix materialized view refresh trigger (was refreshing on EVERY write)
DROP TRIGGER IF EXISTS refresh_fund_stats_trigger ON funds;
DROP FUNCTION IF EXISTS refresh_fund_stats();

-- Create queue table for async refresh
CREATE TABLE IF NOT EXISTS materialized_view_refresh_queue (
  view_name TEXT PRIMARY KEY,
  requested_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP
);

-- Queue refresh instead of immediate execution
CREATE OR REPLACE FUNCTION queue_fund_stats_refresh()
RETURNS trigger AS $$
BEGIN
  INSERT INTO materialized_view_refresh_queue (view_name, requested_at)
  VALUES ('fund_stats', NOW())
  ON CONFLICT (view_name) 
  DO UPDATE SET requested_at = NOW();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Only queue the refresh, don't execute
CREATE TRIGGER queue_fund_stats_refresh
AFTER INSERT OR UPDATE OR DELETE ON funds
FOR EACH STATEMENT
EXECUTE FUNCTION queue_fund_stats_refresh();

-- Separate function to process queued refreshes
CREATE OR REPLACE FUNCTION process_materialized_view_refreshes()
RETURNS void AS $$
DECLARE
  view_record RECORD;
BEGIN
  FOR view_record IN 
    SELECT view_name 
    FROM materialized_view_refresh_queue 
    WHERE processed_at IS NULL 
      OR processed_at < requested_at - INTERVAL '5 minutes'
  LOOP
    BEGIN
      EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY %I', view_record.view_name);
      
      UPDATE materialized_view_refresh_queue 
      SET processed_at = NOW() 
      WHERE view_name = view_record.view_name;
      
      RAISE NOTICE 'Refreshed materialized view: %', view_record.view_name;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to refresh %: %', view_record.view_name, SQLERRM;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_mv_refresh_queue_processed 
ON materialized_view_refresh_queue(processed_at) 
WHERE processed_at IS NULL;
