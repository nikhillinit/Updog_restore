-- ============================================================================
-- LP REPORTING DASHBOARD - PERFORMANCE INDEXES
-- ============================================================================
-- Created: 2025-12-23
-- Purpose: Optimized indexes for common LP reporting query patterns
--
-- Index Strategy:
-- 1. Composite indexes on (commitment_id, date DESC) for timeline queries
-- 2. Partial indexes for filtered status conditions
-- 3. JSONB index for report data search
-- 4. Covering indexes to enable index-only scans
--
-- Index Maintenance:
-- - Created CONCURRENTLY to avoid blocking writes
-- - Run during maintenance window if large tables exist
-- ============================================================================

-- Already created in schema migration, but documenting here for completeness

-- ============================================================================
-- CAPITAL ACTIVITIES - TIMELINE QUERIES
-- ============================================================================

-- Already covered in main schema:
-- CREATE INDEX CONCURRENTLY capital_activities_commitment_date_idx
--   ON capital_activities (commitment_id, activity_date DESC);

-- For fund-level capital account queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS capital_activities_fund_activity_idx
  ON capital_activities (fund_id, activity_date DESC)
  INCLUDE (commitment_id, amount_cents, type)
  WHERE status = 'completed';
-- Covering index for completed activities (largest result set)
-- Enables index-only scans for queries like:
-- SELECT commitment_id, amount_cents, type FROM capital_activities
--   WHERE fund_id = $1 AND activity_date BETWEEN $2 AND $3
--   AND status = 'completed'


-- ============================================================================
-- PERFORMANCE SNAPSHOTS - TIMESERIES QUERIES
-- ============================================================================

-- Already covered in main schema:
-- CREATE INDEX CONCURRENTLY lp_perf_snapshots_commitment_date_idx
--   ON lp_performance_snapshots (commitment_id, snapshot_date DESC);

-- For efficient timeseries downsampling
CREATE INDEX CONCURRENTLY IF NOT EXISTS lp_perf_snapshots_commitment_quarterly_idx
  ON lp_performance_snapshots (commitment_id, snapshot_date DESC)
  INCLUDE (irr_percent, moic_percent, dpi_percent, rvpi_percent, tvpi_percent)
  WHERE snapshot_date >= CURRENT_DATE - INTERVAL '3 years';
-- Covering index for recent 3-year performance (typical dashboard view)
-- Enables fast quarterly/monthly downsampling


-- ============================================================================
-- LP FUND COMMITMENTS - ACTIVE FILTER
-- ============================================================================

-- Already covered in main schema:
-- CREATE INDEX CONCURRENTLY lp_commitments_active_idx
--   ON lp_fund_commitments (lp_id, fund_id)
--   WHERE commitment_status = 'active';

-- For LP portfolio composition queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS lp_commitments_status_idx
  ON lp_fund_commitments (lp_id, commitment_status)
  INCLUDE (fund_id, commitment_amount_cents)
  WHERE commitment_status IN ('active', 'inactive');
-- Covering index for LP portfolio queries
-- Queries like: SELECT COUNT(*), SUM(commitment_amount_cents)
--   FROM lp_fund_commitments WHERE lp_id = $1 AND commitment_status = $2


-- ============================================================================
-- LP CAPITAL ACCOUNTS - LATEST SNAPSHOT
-- ============================================================================

-- For efficient "as of" queries (getting latest position)
CREATE INDEX CONCURRENTLY IF NOT EXISTS lp_capital_accounts_commitment_latest_idx
  ON lp_capital_accounts (commitment_id, as_of_date DESC)
  INCLUDE (contributed_capital_cents, distributed_capital_cents,
           current_nav_cents, unfunded_commitment_cents, irr_percent, moic);
-- Covering index for latest capital account snapshot
-- SELECT ... FROM lp_capital_accounts
--   WHERE commitment_id = $1 ORDER BY as_of_date DESC LIMIT 1

CREATE INDEX CONCURRENTLY IF NOT EXISTS lp_capital_accounts_lp_asof_idx
  ON lp_capital_accounts (lp_id, as_of_date DESC)
  INCLUDE (contributed_capital_cents, distributed_capital_cents, current_nav_cents);
-- For LP-level aggregation queries


-- ============================================================================
-- LIMITED PARTNERS - BULK OPERATIONS
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS limited_partners_onboarded_idx
  ON limited_partners (onboarded_at DESC)
  WHERE status = 'active'
  INCLUDE (legal_name, entity_type);
-- For LP activation date tracking


-- ============================================================================
-- LP REPORTS - QUERY OPTIMIZATION
-- ============================================================================

-- Already covered in main schema:
-- CREATE INDEX CONCURRENTLY lp_reports_data_gin_idx
--   ON lp_reports USING GIN (report_data);

-- For report generation queue
CREATE INDEX CONCURRENTLY IF NOT EXISTS lp_reports_status_requested_idx
  ON lp_reports (status, requested_at DESC)
  WHERE status IN ('pending', 'processing')
  INCLUDE (lp_id, format);
-- Covering index for report generation queue
-- Efficient filtering of pending/processing reports


-- ============================================================================
-- MATERIALIZED VIEW REFRESH SUPPORT
-- ============================================================================

-- Index to support efficient view refresh
CREATE INDEX CONCURRENTLY IF NOT EXISTS lp_capital_accounts_refresh_idx
  ON lp_capital_accounts (lp_id, as_of_date DESC)
  WHERE as_of_date >= CURRENT_DATE - INTERVAL '1 day';
-- Used by view refresh job to identify recently-updated accounts


-- ============================================================================
-- STATISTICS & QUERY PLANNING
-- ============================================================================

-- Analyze indexes to update query planner statistics
-- Run after index creation or periodic maintenance
-- ANALYZE lp_fund_commitments;
-- ANALYZE capital_activities;
-- ANALYZE lp_performance_snapshots;
-- ANALYZE lp_capital_accounts;
-- ANALYZE lp_reports;


-- ============================================================================
-- INDEX USAGE MONITORING
-- ============================================================================

-- Query to check index usage:
-- SELECT
--   schemaname,
--   tablename,
--   indexname,
--   idx_scan,
--   idx_tup_read,
--   idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY idx_scan DESC;

-- Query to find unused indexes:
-- SELECT
--   schemaname,
--   tablename,
--   indexname,
--   idx_scan
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public' AND idx_scan = 0
-- ORDER BY pg_relation_size(indexrelid) DESC;


-- ============================================================================
-- PERFORMANCE BASELINE QUERIES
-- ============================================================================

-- Run these EXPLAIN ANALYZE queries to verify index usage:

-- 1. Capital Activity Timeline Query
-- EXPLAIN ANALYZE
-- SELECT ca.id, ca.activity_date, ca.amount_cents, ca.type
-- FROM capital_activities ca
-- WHERE ca.commitment_id = '...'
-- ORDER BY ca.activity_date DESC
-- LIMIT 20;
-- Expected: Index Scan on capital_activities_commitment_date_idx

-- 2. Performance Timeseries Query
-- EXPLAIN ANALYZE
-- SELECT snapshot_date, irr_percent, moic_percent, dpi_percent
-- FROM lp_performance_snapshots
-- WHERE commitment_id = '...'
--   AND snapshot_date BETWEEN '2024-01-01' AND '2024-12-31'
-- ORDER BY snapshot_date DESC;
-- Expected: Index Scan on lp_perf_snapshots_commitment_date_idx

-- 3. LP Portfolio Aggregation
-- EXPLAIN ANALYZE
-- SELECT COUNT(*), SUM(commitment_amount_cents)
-- FROM lp_fund_commitments
-- WHERE lp_id = '...' AND commitment_status = 'active';
-- Expected: Index Scan on lp_commitments_status_idx or bitmap scan

-- 4. Latest Capital Account
-- EXPLAIN ANALYZE
-- SELECT contributed_capital_cents, distributed_capital_cents, current_nav_cents
-- FROM lp_capital_accounts
-- WHERE commitment_id = '...'
-- ORDER BY as_of_date DESC LIMIT 1;
-- Expected: Index Scan on lp_capital_accounts_commitment_latest_idx

-- End of migration
