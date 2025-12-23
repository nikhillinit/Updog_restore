---
title: LP Reporting Dashboard - Database Optimization Guide
status: active
last_updated: 2025-12-23
categories: [database, performance, architecture]
---

# LP Reporting Dashboard - Database Optimization Guide

**Document Version:** 1.0
**Last Updated:** 2025-12-23
**Owner:** Database Architecture Team

## Executive Summary

This document describes the complete database optimization strategy for the LP Reporting Dashboard, including:

- **Schema Design:** Seven normalized tables with optimized column types and constraints
- **Indexing Strategy:** 15+ indexes targeting common query patterns
- **Materialized Views:** Three pre-aggregated views for dashboard performance
- **Caching Layer:** Redis cache-aside pattern with tag-based invalidation
- **Background Jobs:** BullMQ worker for view refresh and cache management

**Performance Targets:**
- Dashboard load: **< 100ms** (from cache)
- Capital account timeline: **< 200ms** for 1000+ transactions
- Performance timeseries: **< 150ms** for 3-year history
- Materialized view refresh: **< 2 minutes** for 1000 LPs

---

## Part 1: Schema Design

### Overview

The LP Reporting schema consists of 7 core tables plus 3 materialized views:

```
limited_partners (LP master)
├─ lp_fund_commitments (LP-Fund relationships)
│  ├─ capital_activities (Immutable transaction log)
│  ├─ lp_capital_accounts (Denormalized snapshots)
│  └─ lp_performance_snapshots (Time-series metrics)
├─ lp_reports (Generated reports)
└─ fund_nav_snapshots (Reference data)
```

### Core Tables

#### 1. limited_partners

**Purpose:** LP master data

**Key Fields:**
- `id` (UUID) - Primary key
- `legal_name` - Official entity name
- `entity_type` - individual|institutional|family_office|trust|foundation
- `status` - active|inactive|prospect|onboarding
- `preferences` (JSONB) - Flexible preferences (report frequency, format, notifications)

**Indexes:**
- `idx_limited_partners_status` - For LP filtering
- `idx_limited_partners_email` - For LP lookup by email
- `idx_limited_partners_created` - For onboarding tracking

**Constraints:**
- `UNIQUE(primary_contact_email)` - Email uniqueness per LP
- `CHECK(status IN ...)` - Valid status values

**Estimated Rows:** 100-10,000 LPs

---

#### 2. lp_fund_commitments

**Purpose:** LP commitment in specific fund

**Key Fields:**
- `id` (UUID) - Primary key
- `lp_id` (UUID) - References limited_partners
- `fund_id` (INTEGER) - References funds
- `commitment_amount_cents` (BIGINT) - All money in cents for precision
- `commitment_status` - active|inactive|full_redemption|partial_redemption
- `callable_percentage` (DECIMAL) - Can be < 100% in some cases

**Indexes:**
```sql
-- Lookup by LP
idx_lp_fund_commitments_lp ON (lp_id)

-- Lookup by fund
idx_lp_fund_commitments_fund ON (fund_id)

-- Filter by status
idx_lp_fund_commitments_status ON (commitment_status)

-- Most common: active commitments for LP
idx_lp_fund_commitments_active ON (lp_id, fund_id)
  WHERE commitment_status = 'active'
```

**Constraints:**
- `UNIQUE(lp_id, fund_id)` - One commitment per LP-Fund pair
- `commitment_amount_cents > 0` - Positive commitment only
- `callable_percentage BETWEEN 0 AND 1`

**Estimated Rows:** 1-100 per LP = 100,000-1,000,000 total

---

#### 3. capital_activities

**Purpose:** Immutable log of all capital movements

**Key Fields:**
- `id` (UUID) - Primary key
- `commitment_id` (UUID) - Which LP-Fund this activity belongs to
- `type` - capital_call|distribution|return_of_capital|management_fee|carried_interest
- `amount_cents` (BIGINT) - Signed value (positive = capital call, negative = distribution)
- `activity_date` (DATE) - When the activity occurred
- `due_date` (DATE) - When payment was due (capital calls only)
- `status` - pending|completed|failed|reversed
- `payment_date` (DATE) - When payment was made

**Design Principles:**
- **Append-only:** Never update or delete (audit trail)
- **Immutable:** History of every capital movement
- **Partitionable:** Designed for date-based partitioning

**Indexes (CRITICAL for performance):**

```sql
-- PRIMARY INDEX for capital account timeline
capital_activities_commitment_date_idx ON (commitment_id, activity_date DESC)
  INCLUDE (amount_cents, type, status)
-- Used by: getCapitalAccountTransactions (cursor pagination)
-- Expected queries/sec: 10-100
-- Index size: ~20-50 MB for 1M rows

-- Fund-level activity summary
capital_activities_fund_activity_idx ON (fund_id, activity_date DESC)
  INCLUDE (commitment_id, amount_cents, type)
  WHERE status = 'completed'
-- Used by: Fund-level capital account queries
-- Index size: ~15-30 MB (partial index)

-- Activity type filtering
capital_activities_type_date_idx ON (type, activity_date DESC)
-- Used by: "Show all capital calls" queries
```

**Constraints:**
- `UNIQUE(id)` - Primary key
- `amount_cents != 0` - No zero-value activities
- `Check activity_date <= payment_date` (optional validation)

**Estimated Rows:** 50-500 per commitment per year = 5M-50M total

---

#### 4. lp_capital_accounts

**Purpose:** Denormalized snapshot of capital position per commitment

**Key Fields:**
- `id` (UUID) - Primary key
- `commitment_id` (UUID) - Which commitment
- `as_of_date` (DATE) - When this snapshot was calculated
- `contributed_capital_cents` (BIGINT) - Total capital called to date
- `distributed_capital_cents` (BIGINT) - Total distributions received
- `current_nav_cents` (BIGINT) - Current NAV
- `unfunded_commitment_cents` (BIGINT) = commitment - contributed
- `irr_percent`, `moic` (DECIMAL) - Cached performance metrics

**Design Rationale:**
- **Denormalized:** Sum of all capital_activities pre-calculated
- **Point-in-time:** One row per date per commitment
- **Enables:** Fast "as of" date queries without aggregation

**Indexes:**

```sql
-- Get latest capital account for commitment
idx_lp_capital_accounts_commitment_latest ON (commitment_id, as_of_date DESC)
  INCLUDE (contributed_capital_cents, distributed_capital_cents, current_nav_cents)
-- Used by: getLPSummary, getCapitalAccountSummary
-- Expected queries/sec: 100-1000

-- For LP portfolio aggregation
idx_lp_capital_accounts_lp_asof ON (lp_id, as_of_date DESC)
  INCLUDE (contributed_capital_cents, distributed_capital_cents, current_nav_cents)
```

**Constraints:**
- `UNIQUE(commitment_id, as_of_date)` - One snapshot per day per commitment
- All amounts >= 0 (checked constraints)

**Estimated Rows:** 365 * 500,000 commitments = 182M rows (partitioned by year)

---

#### 5. lp_performance_snapshots

**Purpose:** Time-series performance data for charting

**Key Fields:**
- `commitment_id` (UUID)
- `snapshot_date` (DATE) - When metrics were calculated
- `irr_percent` (DECIMAL) - IRR for the LP's position
- `moic_percent` (DECIMAL) - MOIC for the LP's position
- `dpi_percent`, `rvpi_percent`, `tvpi_percent` (DECIMAL)
- `gross_irr_percent`, `net_irr_percent` (DECIMAL)
- `nav_cents`, `paid_in_cents`, `distributed_cents` (BIGINT)

**Indexes:**

```sql
-- PRIMARY: Timeseries queries for single commitment
idx_lp_perf_snapshots_commitment_date ON (commitment_id, snapshot_date DESC)
  INCLUDE (irr_percent, moic_percent, dpi_percent, rvpi_percent, tvpi_percent)
-- Used by: getPerformanceTimeseries
-- Expected queries/sec: 10-50
-- Size: ~5-10 MB for quarterly data

-- Fund-level aggregation
idx_lp_perf_snapshots_fund_date ON (fund_id, snapshot_date DESC)

-- LP-level aggregation
idx_lp_perf_snapshots_lp_date ON (lp_id, snapshot_date DESC)
  INCLUDE (irr_percent, tvpi_percent)

-- Recent data only (for materialized view)
idx_lp_perf_snapshots_recent ON (snapshot_date DESC)
  WHERE snapshot_date >= CURRENT_DATE - INTERVAL '3 years'
```

**Estimated Rows:** ~12-52 per commitment per year (monthly/quarterly) = 500K-2M total

---

#### 6. lp_reports

**Purpose:** Track generated PDF/Excel reports

**Key Fields:**
- `lp_id` (UUID) - Which LP
- `report_type` - quarterly|annual|ad_hoc
- `format` - pdf|excel|both
- `status` - pending|processing|completed|failed
- `file_path` (TEXT) - S3 or local path
- `report_data` (JSONB) - Computed totals, summaries
- `expires_at` - When download link expires

**Indexes:**

```sql
-- For report generation queue
idx_lp_reports_status_requested ON (status, requested_at DESC)
  WHERE status IN ('pending', 'processing')
  INCLUDE (lp_id, format)

-- Full-text search in report data
idx_lp_reports_data_gin ON lp_reports USING GIN (report_data)
```

**Estimated Rows:** 10-100 per LP per year = 1M-10M total

---

#### 7. fund_nav_snapshots

**Purpose:** Fund-level NAV history for reference

**Key Fields:**
- `fund_id` (INTEGER)
- `snapshot_date` (DATE)
- `gross_nav_cents`, `net_nav_cents` (BIGINT)
- `committed_capital_cents`, `called_capital_cents`, `distributed_capital_cents` (BIGINT)
- `moic`, `dpi`, `rvpi` (DECIMAL)

**Estimated Rows:** 12-52 per fund per year = 50K-100K total

---

## Part 2: Indexing Strategy

### Index Types & Usage

#### Composite Indexes (for range queries)

```sql
-- Pattern: (Partition Key, Sort Key)
CREATE INDEX capital_activities_commitment_date_idx
  ON capital_activities (commitment_id, activity_date DESC)
  INCLUDE (amount_cents, type, status);

-- Query Plan (expected):
-- EXPLAIN SELECT * FROM capital_activities
--   WHERE commitment_id = $1 AND activity_date BETWEEN $2 AND $3
--   ORDER BY activity_date DESC LIMIT 20;
--
-- Index Scan on capital_activities_commitment_date_idx
--   Index Cond: (commitment_id = $1 AND activity_date BETWEEN $3 AND $2)
--   (20 rows, 2ms)
```

#### Partial Indexes (for filtered conditions)

```sql
-- Only index active commitments (most common query)
CREATE INDEX idx_lp_commitments_active
  ON lp_fund_commitments (lp_id, fund_id)
  WHERE commitment_status = 'active';

-- Uses less space, faster inserts, faster queries for "active" filter
-- Size: ~30% of full index
```

#### Covering Indexes (for index-only scans)

```sql
-- INCLUDE columns enables index-only scans (no table access)
CREATE INDEX capital_activities_fund_activity_idx
  ON capital_activities (fund_id, activity_date DESC)
  INCLUDE (commitment_id, amount_cents, type)
  WHERE status = 'completed';

-- Query Plan (index-only scan):
-- EXPLAIN SELECT commitment_id, amount_cents, type
--   FROM capital_activities
--   WHERE fund_id = $1 AND status = 'completed'
--   ORDER BY activity_date DESC;
--
-- Index Only Scan on capital_activities_fund_activity_idx
--   (uses cached index pages, 0 table access)
```

#### JSONB Indexes (for preferences/report_data)

```sql
-- For flexible document search
CREATE INDEX idx_lp_reports_data_gin
  ON lp_reports USING GIN (report_data);

-- Enables queries like:
-- SELECT * FROM lp_reports
--   WHERE report_data @> '{"included_holdings": true}'
```

### Index Maintenance

#### Monitor Index Usage

```sql
-- Find unused indexes (candidates for deletion)
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
  AND pg_relation_size(indexrelid) > 1000000
ORDER BY pg_relation_size(indexrelid) DESC;

-- Find hot indexes (high maintenance cost)
SELECT
  schemaname,
  tablename,
  indexname,
  idx_blks_read + idx_blks_hit AS total_reads,
  idx_blks_hit / (idx_blks_hit + idx_blks_read)::FLOAT AS cache_hit_ratio
FROM pg_stat_user_indexes
WHERE (idx_blks_read + idx_blks_hit) > 10000
ORDER BY idx_blks_read DESC;
```

#### Rebuild Indexes (maintenance)

```bash
# Rebuild bloated index during maintenance window
REINDEX INDEX CONCURRENTLY capital_activities_commitment_date_idx;

# Or analyze to update statistics
ANALYZE capital_activities;
```

---

## Part 3: Materialized Views

### View 1: lp_dashboard_summary

**Purpose:** Pre-aggregated metrics for LP dashboard

**Query Logic:**
```sql
SELECT
  lp.id, lp.legal_name, lp.status,
  COUNT(DISTINCT lfc.fund_id) AS fund_count,
  SUM(lfc.commitment_amount_cents) AS total_commitment_cents,
  SUM(lca.contributed_capital_cents) AS total_contributed_cents,
  SUM(lca.distributed_capital_cents) AS total_distributed_cents,
  SUM(lca.current_nav_cents) AS total_nav_cents,
  MAX(lca.as_of_date) AS latest_valuation_date
FROM limited_partners lp
LEFT JOIN lp_fund_commitments lfc ON lp.id = lfc.lp_id
LEFT JOIN lp_capital_accounts lca ON lfc.id = lca.commitment_id
GROUP BY lp.id, lp.legal_name, lp.status
```

**Performance:**
- **Without View:** 200-500ms (5 JOINs + aggregations on 1M+ rows)
- **With View:** 5-10ms (single row lookup)
- **Improvement:** 40-100x faster

**Refresh Strategy:**
- **Scheduled:** Daily 12:00 AM UTC (nightly refresh)
- **Event-Triggered:** After capital call/distribution (debounced 100ms)
- **Refresh Time:** < 2 minutes for 1000 LPs

**Refresh SQL:**
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY lp_dashboard_summary;
-- CONCURRENTLY allows reads during refresh (requires unique index)
```

---

### View 2: fund_lp_summary

**Purpose:** Aggregated LP metrics per fund

**Used by:** Fund-level performance dashboards, LP portfolio composition

---

### View 3: lp_performance_latest

**Purpose:** Latest performance snapshot per commitment

**Used by:** Performance comparison, trend identification

---

## Part 4: Caching Layer

### Architecture: Cache-Aside Pattern

```
User Request
    ↓
Check Redis Cache
    ├─ Hit: Return data (5-10ms) ✓
    └─ Miss:
        ↓
    Query Database
        ↓
    Store in Redis (with TTL)
        ↓
    Return data (200ms) ✓
```

### Cache TTLs

```typescript
export const DEFAULT_CACHE_CONFIG = {
  ttlSeconds: {
    summary: 5 * 60,          // 5 minutes - frequently accessed
    performance: 10 * 60,      // 10 minutes - less volatile
    holdings: 60 * 60,         // 1 hour - valuation updates infrequently
    timeseries: 60 * 60,       // 1 hour - historical data stable
    capitalActivity: 10 * 60,  // 10 minutes - recent transactions
  },
};
```

### Cache Key Structure

```
lp:{lpId}:summary
lp:{lpId}:capital-activity:{fundIds}:{startDate}:{endDate}
lp:{lpId}:fund:{fundId}:performance
commitment:{commitmentId}:timeseries:{granularity}:{dateRange}
```

### Tag-Based Invalidation

**Scenario:** Capital call on LP occurs

**Before:** Manual cache deletion
```typescript
// ❌ Inefficient - must know all cached keys
redis.del(`lp:${lpId}:summary`);
redis.del(`lp:${lpId}:capital-activity:*`);
redis.del(`lp:${lpId}:performance:*`);
```

**After:** Tag-based invalidation
```typescript
// ✓ Efficient - pattern matching
await cache.invalidateByTag(`lp:${lpId}:*`);
// Automatically clears:
// - lp:${lpId}:summary
// - lp:${lpId}:capital-activity:*
// - lp:${lpId}:fund:${fundId}:performance
// - etc.
```

### Cache Invalidation Triggers

| Event | Invalidate Pattern | Rationale |
|-------|-------------------|-----------|
| Capital Call | `lp:{lpId}:*`, `fund:{fundId}:*` | Affects all LP data and fund totals |
| Distribution | Same | Same |
| Performance Update | `commitment:{commitmentId}:*`, `lp:{lpId}:performance:*` | Affects timeseries and aggregate |
| Daily Refresh | All caches | Refresh all after materialized view update |

---

## Part 5: Query Functions

### 1. getLPSummary(lpId)

**Purpose:** Dashboard summary for single LP

**Query Path:**
1. Check Redis `lp:{lpId}:summary`
2. If miss, query materialized view `lp_dashboard_summary`
3. Cache result for 5 minutes

**Expected Performance:** 5-10ms (from cache)

**Index Used:** `lp_dashboard_summary_pk` (unique index on lp_id)

---

### 2. getCapitalAccountTransactions(lpId, options)

**Purpose:** Timeline of capital calls/distributions with pagination

**Query Path:**
1. Check Redis `lp:{lpId}:capital-activity:{filters}`
2. If miss, query `capital_activities` with cursor pagination
3. Cache for 10 minutes

**SQL (optimized):**
```sql
SELECT ca.id, ca.activity_date, ca.amount_cents, ca.type, ca.status
FROM capital_activities ca
WHERE ca.commitment_id IN (
  SELECT id FROM lp_fund_commitments
  WHERE lp_id = $1 AND commitment_status = 'active'
)
  AND ca.activity_date BETWEEN $2 AND $3
  AND ca.activity_date < $4  -- Cursor condition
ORDER BY ca.activity_date DESC
LIMIT 21  -- +1 to detect more results
```

**Expected Performance:** 50-200ms (depending on transaction count)

**Index Used:** `capital_activities_commitment_date_idx`

**Cursor Pagination Benefits:**
- ✓ Can resume from any position
- ✓ No offset recalculation (O(1) not O(n))
- ✓ Handles concurrent updates
- ✓ Works with streaming APIs

---

### 3. getFundPerformance(lpId, fundId)

**Purpose:** Latest performance metrics for specific fund

**Query Path:**
1. Check Redis `lp:{lpId}:fund:{fundId}:performance`
2. If miss, query `lp_performance_snapshots` for latest
3. Cache for 10 minutes

**Expected Performance:** 10-50ms

**Index Used:** `lp_perf_snapshots_commitment_date_idx`

---

### 4. getProRataHoldings(lpId, fundId)

**Purpose:** LP's pro-rata portfolio company holdings

**Calculation:**
```
For each company in fund:
  lp_cost_basis = company_total_investment * (lp_commitment / total_commitments)
  lp_value = company_current_valuation * (lp_commitment / total_commitments)
  lp_ownership = company_ownership * (lp_commitment / total_commitments)
```

**Expected Performance:** 100-500ms (100+ companies)

**Cache TTL:** 1 hour (valuations update less frequently)

---

### 5. getPerformanceTimeseries(commitmentId, dateRange, granularity)

**Purpose:** Historical performance for trend charts

**Features:**
- Supports monthly/quarterly downsampling
- Returns last snapshot per period
- Handles 3+ years of data efficiently

**Query Path:**
```sql
SELECT snapshot_date, irr_percent, moic_percent, dpi_percent, tvpi_percent
FROM lp_performance_snapshots
WHERE commitment_id = $1
  AND snapshot_date BETWEEN $2 AND $3
ORDER BY snapshot_date ASC
```

**Post-processing:** Downsample to granularity

**Expected Performance:** 50-150ms

**Index Used:** `lp_perf_snapshots_commitment_date_idx` with `INCLUDE` columns

---

## Part 6: Background Jobs (BullMQ)

### Scheduled Refresh Job

**Timing:** Daily at 12:00 AM UTC

**Actions:**
1. Refresh `lp_dashboard_summary` view
2. Refresh `fund_lp_summary` view
3. Refresh `lp_performance_latest` view
4. Record metrics (duration, rows affected)
5. Clear cache tags `*:daily-refresh`

**Expected Duration:** < 2 minutes for 1000 LPs

**Retry Strategy:** 3 attempts with exponential backoff (5s, 25s, 125s)

---

### Event-Triggered Refresh Job

**Trigger:** After capital call/distribution

**Conditions:**
- Debounced for 100ms (avoid excessive refreshes)
- Only specific LP-Fund pair refreshed (not full view)

**Actions:**
1. Queue partial view refresh
2. Invalidate cache: `lp:{lpId}:*`, `fund:{fundId}:*`

**Expected Latency:** < 500ms (within debounce window)

---

## Part 7: Performance Benchmarks

### Query Latency Targets

| Query | Target | Cached | From DB |
|-------|--------|--------|---------|
| getLPSummary | 10ms | 5ms | 50ms |
| getCapitalActivity (1K txns) | 200ms | 10ms | 200ms |
| getFundPerformance | 50ms | 5ms | 50ms |
| getProRataHoldings | 500ms | 10ms | 500ms |
| getPerformanceTimeseries | 150ms | 10ms | 150ms |

### Index Storage

| Index | Estimated Size | Rows | Purpose |
|-------|---|---|---|
| `capital_activities_commitment_date` | 50 MB | 1M | Timeline queries |
| `lp_perf_snapshots_commitment_date` | 10 MB | 500K | Timeseries queries |
| `lp_commitments_active` | 30 MB | 500K | Active filter |
| Other indexes | 50 MB | - | Supporting queries |
| **Total** | **~150 MB** | **~2M** | All tables |

### Cache Hit Rates (Expected)

| Cache Key | Hit Rate | Rationale |
|-----------|----------|-----------|
| LP Summary | 80-90% | Accessed repeatedly per session |
| Capital Activity | 60-70% | Date ranges vary |
| Performance | 70-80% | Common dashboard view |
| Holdings | 50-60% | Less frequently viewed |

---

## Part 8: Monitoring & Operations

### Key Metrics

```sql
-- Cache performance
SELECT
  COUNT(*) as total_queries,
  COUNT(*) FILTER (WHERE cached) as cache_hits,
  100.0 * COUNT(*) FILTER (WHERE cached) / COUNT(*) as hit_rate
FROM query_logs
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY cache_key_pattern;

-- Index usage
SELECT
  indexname,
  idx_scan,
  idx_tup_read,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Query performance
SELECT
  query,
  COUNT(*) as count,
  AVG(execution_time_ms) as avg_ms,
  MAX(execution_time_ms) as max_ms,
  STDDEV(execution_time_ms) as stddev_ms
FROM slow_queries
WHERE execution_time_ms > 100
GROUP BY query
ORDER BY count DESC;
```

### Alerting

```
- Dashboard load > 500ms (P95)
- Cache hit rate < 50%
- Materialized view refresh > 5 minutes
- Index bloat > 30%
- Database CPU > 80%
```

### Maintenance Schedule

| Task | Frequency | Time | Duration |
|------|-----------|------|----------|
| Update statistics | Weekly | Sunday 02:00 | 30 min |
| Reindex hot indexes | Monthly | First Sunday | 1-2 hrs |
| Analyze bloat | Monthly | First Sunday | 1 hr |
| Review slow queries | Daily | 06:00 | 15 min |
| Backup | Daily | 23:00 | 2-4 hrs |

---

## Part 9: Disaster Recovery

### Backup Strategy

**Type:** Continuous WAL archiving + daily snapshots

```bash
# Daily backup at 23:00 UTC
pg_dump --format=directory --jobs=4 \
  postgresql://user:pass@localhost/updog_lp > /backups/lp-db-$(date +%Y%m%d).dir

# Retention: 30 days
find /backups -name 'lp-db-*.dir' -mtime +30 -delete
```

### Recovery Procedures

**Scenario 1: Corrupted Index**
```sql
-- Reindex
REINDEX INDEX CONCURRENTLY capital_activities_commitment_date_idx;

-- Or rebuild from scratch
DROP INDEX capital_activities_commitment_date_idx;
CREATE INDEX CONCURRENTLY capital_activities_commitment_date_idx
  ON capital_activities (commitment_id, activity_date DESC);
```

**Scenario 2: Stale Materialized View**
```sql
-- Refresh
REFRESH MATERIALIZED VIEW CONCURRENTLY lp_dashboard_summary;

-- If concurrent refresh fails (no unique index):
REFRESH MATERIALIZED VIEW lp_dashboard_summary;
-- (will lock view during refresh)
```

**Scenario 3: Full Database Restore**
```bash
# Restore from backup
pg_restore --format=directory --jobs=4 \
  -d updog_lp /backups/lp-db-20251223.dir

# Verify integrity
psql -d updog_lp -c "SELECT COUNT(*) FROM limited_partners;"
```

---

## Part 10: Migration Path

### Phase 1: Foundation (Week 1)

- [x] Create core schema (`migrations/001_lp_reporting_schema.sql`)
- [x] Add indexes (`migrations/002_lp_reporting_indexes.sql`)
- [x] Create materialized views (`migrations/003_lp_dashboard_materialized_view.sql`)

### Phase 2: Application Layer (Week 2)

- [x] Implement query functions (`server/services/lp-queries.ts`)
- [x] Build caching layer (`server/services/lp-cache.ts`)
- [x] Create refresh worker (`server/workers/lp-materialized-view-refresh.ts`)

### Phase 3: Integration (Week 3)

- [ ] Wire queries into API endpoints
- [ ] Integrate cache invalidation in capital activity handlers
- [ ] Deploy and monitor

### Phase 4: Optimization (Ongoing)

- [ ] Analyze slow queries
- [ ] Adjust index strategy based on metrics
- [ ] Fine-tune cache TTLs
- [ ] Monitor storage growth

---

## Appendix: SQL Reference

### Verify Index Usage

```sql
-- See which indexes are being used
SELECT
  schemaname, tablename, indexname,
  idx_scan, idx_tup_read, idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

### Check Query Plans

```sql
-- Analyze query to understand index usage
EXPLAIN ANALYZE
SELECT * FROM capital_activities ca
WHERE ca.commitment_id = 'abc-123'
  AND ca.activity_date BETWEEN '2024-01-01' AND '2024-12-31'
ORDER BY ca.activity_date DESC
LIMIT 20;

-- Look for:
-- ✓ "Index Scan" = using index
-- ✓ "Seq Scan" = full table scan (may need index)
-- ✓ Low "Actual Rows" = efficient filtering
```

### Monitor Materialized View

```sql
-- Check view age
SELECT
  'lp_dashboard_summary' as view_name,
  MAX(view_created_at) as last_refresh,
  CURRENT_TIMESTAMP - MAX(view_created_at) as age
FROM lp_dashboard_summary
GROUP BY view_name;

-- Find inconsistencies
SELECT lp_id, COUNT(DISTINCT fund_id) as view_funds,
  (SELECT COUNT(DISTINCT fund_id) FROM lp_fund_commitments
   WHERE lp_id = lps.lp_id) as actual_funds
FROM lp_dashboard_summary lps
GROUP BY lp_id
HAVING COUNT(DISTINCT fund_id) !=
  (SELECT COUNT(DISTINCT fund_id) FROM lp_fund_commitments
   WHERE lp_id = lps.lp_id);
```

---

## References

- [PostgreSQL Indexing Documentation](https://www.postgresql.org/docs/current/indexes.html)
- [Materialized Views](https://www.postgresql.org/docs/current/rules-materializedviews.html)
- [Query Planning](https://www.postgresql.org/docs/current/using-explain.html)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Redis Caching Patterns](https://redis.io/docs/manual/client-side-caching/)

---

**End of Document**
