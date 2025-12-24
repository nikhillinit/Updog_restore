---
title: LP Reporting Dashboard - Quick Reference
status: active
---

# LP Reporting Dashboard - Quick Reference

**Quick links to key components and patterns**

## File Locations

| Component | File | Lines |
|-----------|------|-------|
| Schema | `migrations/001_lp_reporting_schema.sql` | 600+ |
| Indexes | `migrations/002_lp_reporting_indexes.sql` | 300+ |
| Views | `migrations/003_lp_dashboard_materialized_view.sql` | 400+ |
| Queries | `server/services/lp-queries.ts` | 450+ |
| Cache | `server/services/lp-cache.ts` | 400+ |
| Worker | `server/workers/lp-materialized-view-refresh.ts` | 400+ |
| Docs | `docs/lp-reporting-database-optimization.md` | 4500+ |

## Tables at a Glance

```
limited_partners
├─ lp_fund_commitments
│  ├─ capital_activities (immutable log)
│  ├─ lp_capital_accounts (denormalized snapshot)
│  └─ lp_performance_snapshots (timeseries)
├─ lp_reports
└─ fund_nav_snapshots
```

## Query Functions

### 1. getLPSummary(lpId)
```typescript
const summary = await getLPSummary('lp-uuid');
// Returns: {
//   lpId, legalName, fundCount,
//   totalCommitmentCents, totalContributedCents,
//   totalDistributedCents, totalNavCents,
//   latestValuationDate, unfundedCommitmentCents
// }
// Performance: 5-10ms (cached), 50ms (from DB)
// Index: materialized view primary key
```

### 2. getCapitalAccountTransactions(lpId, options)
```typescript
const page = await getCapitalAccountTransactions(
  'lp-uuid',
  {
    fundIds: [1, 2],
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-12-31'),
    limit: 20,
    cursor: 'optional-cursor-from-previous-page'
  }
);
// Returns: {
//   transactions: [...],
//   nextCursor: 'cursor-for-next-page' || null,
//   totalCount: number
// }
// Performance: 50-200ms
// Index: capital_activities_commitment_date_idx
// Cursor pagination: O(limit), not O(offset)
```

### 3. getFundPerformance(lpId, fundId)
```typescript
const perf = await getFundPerformance('lp-uuid', 1);
// Returns: {
//   fundId, fundName, vintage, asOfDate,
//   irrPercent, moic, dpi, rvpi, tvpi,
//   grossIrr, netIrr
// }
// Performance: 10-50ms
// Index: lp_performance_snapshots latest
```

### 4. getProRataHoldings(lpId, fundId)
```typescript
const holdings = await getProRataHoldings('lp-uuid', 1);
// Returns: [
//   {
//     companyId, companyName, fundId,
//     costBasisCents, currentValueCents,
//     ownershipPercent, unrealizedGainCents,
//     unrealizedMultiple, investmentDate
//   },
//   ...
// ]
// Performance: 100-500ms
// Cache TTL: 1 hour (valuations stable)
```

### 5. getPerformanceTimeseries(commitmentId, dateRange, granularity)
```typescript
const timeseries = await getPerformanceTimeseries(
  'commitment-uuid',
  new Date('2022-01-01'),
  new Date('2024-12-31'),
  'quarterly'  // or 'monthly'
);
// Returns: [
//   {
//     date, irrPercent, moic, dpi, rvpi, tvpi,
//     navCents, paidInCents, distributedCents
//   },
//   ...
// ]
// Performance: 50-150ms
// Downsampled to monthly/quarterly
```

## Cache Usage

### Basic Pattern
```typescript
import { createLPCache } from '@server/services/lp-cache';

const cache = createLPCache(redis);

// Wrapping a query
const summary = await cache.getLPSummary(
  lpId,
  () => queries.getLPSummary(lpId)  // Fetch function
);
// Flow: Try cache → miss → call fetch → store in cache → return
```

### Cache Keys
```
lp:{lpId}:summary
lp:{lpId}:capital-activity:{fundIds}:{startDate}:{endDate}
lp:{lpId}:fund:{fundId}:performance
commitment:{commitmentId}:timeseries:{granularity}:{dateRange}
```

### TTLs
```typescript
summary: 5 * 60,        // 5 minutes
performance: 10 * 60,   // 10 minutes
holdings: 60 * 60,      // 1 hour
timeseries: 60 * 60,    // 1 hour
```

### Invalidation
```typescript
// After capital call/distribution
await cache.invalidateAfterCapitalActivity(lpId, fundId);
// Clears: lp:${lpId}:*, fund:${fundId}:*

// After performance update
await cache.invalidateAfterPerformanceUpdate(commitmentId, lpId);
// Clears: commitment:${commitmentId}:*, lp:${lpId}:performance:*

// Clear all LP data
await cache.clearLPCache(lpId);
```

## Background Worker

### Setup
```typescript
import { createMaterializedViewRefreshWorker } from '@server/workers/lp-materialized-view-refresh';

const worker = createMaterializedViewRefreshWorker(redis);
await worker.start();  // On app boot

// Cleanup on shutdown
process.on('SIGTERM', async () => {
  await worker.stop();
});
```

### Scheduled Refresh
Runs automatically at 12:00 AM UTC daily

### Event-Triggered Refresh
```typescript
// After capital activity
await worker.triggerAfterCapitalActivity(lpId, fundId);
// Debounced 100ms, queued in BullMQ

// Manual immediate refresh
await worker.refreshImmediately('lp_dashboard_summary');
```

### Metrics
```typescript
const metrics = worker.getMetrics('lp_dashboard_summary');
// Returns: [
//   { duration: 45000, success: true, nextRefreshTime: Date },
//   ...
// ]

const stats = await worker.getQueueStats();
// Returns: { active: 0, waiting: 1, completed: 100, failed: 0, delayed: 0 }
```

## API Integration Pattern

```typescript
import * as queries from '@server/services/lp-queries';
import { createLPCache } from '@server/services/lp-cache';

// Initialize once
const cache = createLPCache(redis);

// In route handler
app.get('/api/lp/:lpId/summary', async (req, res) => {
  try {
    const summary = await cache.getLPSummary(
      req.params.lpId,
      () => queries.getLPSummary(req.params.lpId)
    );

    if (!summary) {
      return res.status(404).json({ error: 'LP not found' });
    }

    res.json({
      data: summary,
      cached: true,  // Optional: indicate if from cache
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Cache Invalidation Hooks

```typescript
// After creating capital activity
const activity = await createCapitalActivity(data);
await cache.invalidateAfterCapitalActivity(activity.lpId, activity.fundId);
worker.triggerAfterCapitalActivity(activity.lpId, activity.fundId);

// After updating performance snapshot
const snapshot = await updatePerformanceSnapshot(data);
await cache.invalidateAfterPerformanceUpdate(
  snapshot.commitmentId,
  snapshot.lpId
);
```

## Performance Targets

| Operation | Cached | From DB | Target |
|-----------|--------|---------|--------|
| LP Summary | 5ms | 50ms | 100ms |
| Capital Timeline | 10ms | 200ms | 200ms |
| Fund Performance | 5ms | 50ms | 50ms |
| Pro-Rata Holdings | 10ms | 500ms | 500ms |
| Timeseries | 10ms | 150ms | 150ms |

## Cursor Pagination

```typescript
// Page 1
const page1 = await getCapitalAccountTransactions(lpId, {
  limit: 20
});
// Returns: { transactions: [...20], nextCursor: 'abc::2024-12-23...' }

// Page 2
const page2 = await getCapitalAccountTransactions(lpId, {
  limit: 20,
  cursor: page1.nextCursor  // Continue from page1 end
});
// Returns: { transactions: [...20], nextCursor: 'xyz::2024-12-20...' }

// Page 3
const page3 = await getCapitalAccountTransactions(lpId, {
  limit: 20,
  cursor: page2.nextCursor  // Continue from page2 end
});
// Returns: { transactions: [...10], nextCursor: null }  // Last page
```

## Index Reference

**Critical Indexes:**
```sql
-- Capital activity timeline (MUST HAVE)
capital_activities_commitment_date_idx ON (commitment_id, activity_date DESC)

-- Performance timeseries (MUST HAVE)
lp_perf_snapshots_commitment_date_idx ON (commitment_id, snapshot_date DESC)

-- Active commitments filter
lp_commitments_active_idx ON (lp_id, fund_id)
  WHERE commitment_status = 'active'
```

**Verify indexes are created:**
```sql
SELECT indexname FROM pg_stat_user_indexes
  WHERE tablename IN (
    'capital_activities',
    'lp_performance_snapshots',
    'lp_fund_commitments'
  );
```

## Materialized Views

**Views maintained automatically:**
1. `lp_dashboard_summary` - LP-level aggregation
2. `fund_lp_summary` - Fund-level LP aggregation
3. `lp_performance_latest` - Latest metrics per commitment

**Manual refresh (if needed):**
```typescript
const result = await worker.refreshImmediately();
// or
const result = await worker.refreshImmediately('lp_dashboard_summary');
```

**Verify view is fresh:**
```sql
SELECT
  'lp_dashboard_summary' as view_name,
  CURRENT_TIMESTAMP - MAX(view_created_at) as age
FROM lp_dashboard_summary
GROUP BY view_name;

-- Expect: age < 24 hours
```

## Troubleshooting

### Slow Queries
```sql
-- Check index usage
EXPLAIN ANALYZE
SELECT * FROM capital_activities
  WHERE commitment_id = 'id' AND activity_date > '2024-01-01'
  ORDER BY activity_date DESC LIMIT 20;

-- Should show:
-- Index Scan on capital_activities_commitment_date_idx (NOT Seq Scan)
```

### Low Cache Hit Rate
```typescript
const stats = await cache.getStats();
console.log(`Cache has ${stats.estimatedItemCount} items`);
console.log(`Memory: ${stats.memoryUsage}`);

// If hit rate < 50%, consider:
// - Longer TTLs
// - More selective invalidation
// - Pre-warming cache on startup
```

### Slow Materialized View Refresh
```typescript
const metrics = worker.getMetrics();
const latest = metrics[metrics.length - 1];
console.log(`Last refresh: ${latest.duration}ms`);

// If > 2 minutes, consider:
// - Partial refresh strategy
// - Read replica for refresh
// - Partitioning capital_activities
```

## Common Patterns

### Dashboard Load
```typescript
// Get all data for LP dashboard
const [summary, performance] = await Promise.all([
  cache.getLPSummary(lpId, () => queries.getLPSummary(lpId)),
  cache.getAggregatePerformance(lpId, () => {
    // Aggregate from all fund performances
  })
]);

res.json({ summary, performance });
```

### Activity Feed with Pagination
```typescript
let cursor = undefined;
const allActivities = [];

while (true) {
  const page = await getCapitalAccountTransactions(lpId, {
    limit: 100,
    cursor,
    startDate: new Date('2024-01-01')
  });

  allActivities.push(...page.transactions);

  if (!page.nextCursor) break;
  cursor = page.nextCursor;
}
```

### Fund Comparison
```typescript
const fundIds = [1, 2, 3];

const performances = await Promise.all(
  fundIds.map(fundId =>
    cache.getFundPerformance(lpId, fundId, () =>
      queries.getFundPerformance(lpId, fundId)
    )
  )
);

// Compare IRRs, MOICs, etc.
const irrs = performances.map(p => p.irrPercent);
const avgIrr = irrs.reduce((a, b) => a + b) / irrs.length;
```

## Documentation

**Full documentation:** `docs/lp-reporting-database-optimization.md`

**Sections:**
- Schema Design (Part 1)
- Indexing Strategy (Part 2)
- Materialized Views (Part 3)
- Caching Layer (Part 4)
- Query Functions (Part 5)
- Background Jobs (Part 6)
- Performance Benchmarks (Part 7)
- Monitoring & Operations (Part 8)
- Disaster Recovery (Part 9)
- Migration Path (Part 10)

---

**Quick Links:**
- [Full Schema](../migrations/001_lp_reporting_schema.sql)
- [Query Service](../server/services/lp-queries.ts)
- [Cache Service](../server/services/lp-cache.ts)
- [Refresh Worker](../server/workers/lp-materialized-view-refresh.ts)
- [Complete Guide](../docs/lp-reporting-database-optimization.md)
