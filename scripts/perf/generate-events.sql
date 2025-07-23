-- Generate 100k realistic fund events for performance testing
-- Usage: psql -d $DATABASE_URL -f generate-events.sql

-- Create helper function for random event generation
CREATE OR REPLACE FUNCTION generate_fund_events(fund_id INT, event_count INT)
RETURNS void AS $$
DECLARE
  i INT;
  event_types TEXT[] := ARRAY['COMPANY_ADDED', 'INVESTMENT_MADE', 'VALUATION_UPDATED', 'EXIT_COMPLETED', 'RESERVE_ALLOCATED'];
  operations TEXT[] := ARRAY['INSERT', 'UPDATE'];
  entity_types TEXT[] := ARRAY['portfolio_companies', 'investments', 'valuations', 'reserves'];
  base_time TIMESTAMP := NOW() - INTERVAL '2 years';
BEGIN
  FOR i IN 1..event_count LOOP
    INSERT INTO fund_events (
      fund_id,
      event_type,
      event_time,
      operation,
      entity_type,
      entity_id,
      old_values,
      new_values,
      metadata,
      checksum
    ) VALUES (
      fund_id,
      event_types[1 + floor(random() * array_length(event_types, 1))::int],
      base_time + (i * INTERVAL '10 minutes'),
      operations[1 + floor(random() * array_length(operations, 1))::int],
      entity_types[1 + floor(random() * array_length(entity_types, 1))::int],
      floor(random() * 1000)::int,
      CASE 
        WHEN random() > 0.5 THEN 
          jsonb_build_object(
            'amount', floor(random() * 10000000),
            'valuation', floor(random() * 100000000),
            'ownership', random() * 0.3
          )
        ELSE NULL
      END,
      jsonb_build_object(
        'amount', floor(random() * 10000000),
        'valuation', floor(random() * 100000000),
        'ownership', random() * 0.3,
        'status', CASE WHEN random() > 0.5 THEN 'active' ELSE 'exited' END
      ),
      jsonb_build_object(
        'user_id', floor(random() * 100),
        'source', 'perf_test',
        'batch', i / 1000
      ),
      md5(random()::text)
    );
    
    -- Create snapshots every 100 events
    IF i % 100 = 0 THEN
      INSERT INTO fund_snapshots (
        fund_id,
        snapshot_time,
        event_id_start,
        event_id_end,
        event_count,
        state,
        state_hash,
        metadata
      ) VALUES (
        fund_id,
        base_time + (i * INTERVAL '10 minutes'),
        (i - 99) * fund_id,
        i * fund_id,
        100,
        jsonb_build_object(
          'companies', floor(random() * 50),
          'total_invested', floor(random() * 50000000),
          'total_value', floor(random() * 100000000),
          'irr', random() * 0.5
        ),
        md5(random()::text),
        jsonb_build_object('type', 'auto', 'batch', i / 100)
      );
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Generate events for multiple funds
DO $$
DECLARE
  fund_id INT;
BEGIN
  -- Generate for 10 funds, 10k events each = 100k total
  FOR fund_id IN 1..10 LOOP
    PERFORM generate_fund_events(fund_id, 10000);
    RAISE NOTICE 'Generated events for fund %', fund_id;
  END LOOP;
END $$;

-- Verify event distribution
SELECT 
  fund_id,
  COUNT(*) as event_count,
  MIN(event_time) as earliest,
  MAX(event_time) as latest,
  COUNT(DISTINCT event_type) as event_types
FROM fund_events
GROUP BY fund_id
ORDER BY fund_id;

-- Verify snapshot distribution
SELECT 
  fund_id,
  COUNT(*) as snapshot_count,
  AVG(event_count) as avg_events_per_snapshot
FROM fund_snapshots
GROUP BY fund_id
ORDER BY fund_id;

-- Analyze tables for query planner
ANALYZE fund_events;
ANALYZE fund_snapshots;