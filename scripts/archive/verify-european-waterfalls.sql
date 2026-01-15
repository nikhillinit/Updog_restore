-- Phase 2B: European Waterfall Database Verification
-- Safe read-only queries to check for European waterfall data
-- Run with: psql $DATABASE_URL -f scripts/verify-european-waterfalls.sql

BEGIN;
SET TRANSACTION READ ONLY;

-- Query 1: Check fund_models.waterfall column
SELECT
    'fund_models' as table_name,
    COUNT(*) as european_count,
    array_agg(id ORDER BY created_at DESC) FILTER (WHERE waterfall = 'european') as fund_ids
FROM fund_models
WHERE waterfall = 'european';

-- Query 2: Check JSONB state column for European references
SELECT
    'fund_models_jsonb_state' as table_name,
    COUNT(*) as european_count,
    array_agg(id) as fund_ids
FROM fund_models
WHERE state::text ILIKE '%european%'
   OR state::text ILIKE '%EUROPEAN%';

-- Query 3: Check fundconfigs table
SELECT
    'fundconfigs' as table_name,
    COUNT(*) as european_count,
    array_agg(fund_id) as fund_ids
FROM fundconfigs
WHERE config::text ILIKE '%european%'
   OR config::text ILIKE '%EUROPEAN%';

-- Query 4: Comprehensive search across all JSONB columns
SELECT 'COMPREHENSIVE SEARCH RESULTS' as summary;

SELECT
    'fund_models_state' as source,
    id::text as record_id,
    substring(state::text, 1, 100) as sample_content
FROM fund_models
WHERE state::text ILIKE '%european%'
LIMIT 5

UNION ALL

SELECT
    'fundconfigs_config' as source,
    id::text as record_id,
    substring(config::text, 1, 100) as sample_content
FROM fundconfigs
WHERE config::text ILIKE '%european%'
LIMIT 5;

-- Summary
SELECT
    'VERIFICATION COMPLETE' as status,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM fund_models WHERE waterfall = 'european'
            UNION ALL
            SELECT 1 FROM fund_models WHERE state::text ILIKE '%european%'
            UNION ALL
            SELECT 1 FROM fundconfigs WHERE config::text ILIKE '%european%'
        ) THEN 'EUROPEAN DATA FOUND - HALT REMOVAL'
        ELSE 'NO EUROPEAN DATA - SAFE TO PROCEED'
    END as recommendation;

ROLLBACK;
