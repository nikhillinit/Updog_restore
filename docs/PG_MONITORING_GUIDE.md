# PostgreSQL Monitoring Guide

This guide explains how to monitor and optimize PostgreSQL performance using the built-in metrics and slow query tracking.

## Overview

The enhanced PostgreSQL client provides:
- Query execution time metrics
- Slow query detection and logging
- Connection pool monitoring
- Statement timeout enforcement
- Error categorization and tracking

## Quick Start

### Environment Variables

Configure monitoring thresholds:

```bash
# Pool configuration
DB_POOL_MAX=20                    # Maximum connections
DB_POOL_MIN=2                     # Minimum connections

# Timeout configuration
SLOW_QUERY_MS=1000               # Slow query threshold (ms)
STATEMENT_TIMEOUT_MS=5000        # Query timeout (ms)
LOCK_TIMEOUT_MS=3000             # Lock acquisition timeout (ms)
IDLE_TRANSACTION_TIMEOUT_MS=10000 # Idle transaction timeout (ms)

# Circuit breaker (optional)
CB_DB_ENABLED=true               # Enable circuit breaker
```

### Basic Usage

```typescript
import { query, getPoolStats } from './server/db/pg';

// Execute query with automatic monitoring
const result = await query('SELECT * FROM funds WHERE size > $1', [10000000]);

// Check pool statistics
const stats = getPoolStats();
console.log(`Active connections: ${stats.active}/${stats.max}`);
```

## Metrics

### Prometheus Metrics

The following metrics are automatically collected:

| Metric | Type | Description |
|--------|------|-------------|
| `pg_query_duration_seconds` | Histogram | Query execution time by type |
| `pg_slow_queries_total` | Counter | Count of slow queries |
| `pg_pool_connections_active` | Gauge | Active database connections |
| `pg_pool_connections_idle` | Gauge | Idle database connections |
| `pg_pool_clients_waiting` | Gauge | Clients waiting for connection |
| `pg_query_errors_total` | Counter | Query errors by type |

### Accessing Metrics

```typescript
// Prometheus endpoint
GET /metrics

// Custom stats endpoint
GET /api/admin/db/stats
```

## Slow Query Detection

### Automatic Logging

Queries exceeding the threshold are automatically logged:

```
[PG] Slow query detected: {
  duration_ms: 1234,
  query: "SELECT * FROM large_table WHERE...",
  type: "SELECT",
  threshold_ms: 1000
}
```

### Finding Slow Queries

Using pg_stat_statements:

```sql
-- Top 10 slowest queries
SELECT 
  query,
  calls,
  mean_exec_time,
  max_exec_time,
  total_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 1000
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### Analyzing Query Performance

```sql
-- Explain query plan
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM funds WHERE size > 10000000;

-- Check index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan;
```

## Connection Pool Management

### Pool Configuration

```typescript
// Optimal pool size calculation
const optimalPoolSize = Math.ceil(
  (avgQueryTime * requestsPerSecond) / 1000
);

// Configure in environment
DB_POOL_MAX = optimalPoolSize + buffer;
DB_POOL_MIN = Math.max(2, optimalPoolSize / 4);
```

### Monitoring Pool Health

```typescript
import { getPoolStats } from './server/db/pg';

// Check pool status
const stats = getPoolStats();

if (stats.waiting > 0) {
  console.warn(`${stats.waiting} clients waiting for connection`);
}

if (stats.active === stats.max) {
  console.error('Connection pool exhausted');
}
```

### Pool Metrics Dashboard

```javascript
// Grafana query for pool utilization
(pg_pool_connections_active / pg_pool_connections_active + pg_pool_connections_idle) * 100
```

## Timeout Configuration

### Statement Timeout

Prevents long-running queries from blocking resources:

```sql
-- Set per connection
SET statement_timeout = 5000; -- 5 seconds

-- Set for specific query
SET LOCAL statement_timeout = 10000; -- 10 seconds
SELECT complex_aggregation();
```

### Lock Timeout

Prevents queries from waiting indefinitely for locks:

```sql
-- Fail fast on lock contention
SET lock_timeout = 3000; -- 3 seconds

-- Check current locks
SELECT * FROM pg_locks WHERE NOT granted;
```

### Idle Transaction Timeout

Prevents idle transactions from holding locks:

```sql
-- Auto-rollback idle transactions
SET idle_in_transaction_session_timeout = 10000; -- 10 seconds
```

## Error Handling

### Error Categories

Errors are automatically categorized:

| Error Code | Category | Description |
|------------|----------|-------------|
| 57014 | timeout | Query canceled due to timeout |
| 40001 | serialization | Serialization failure |
| 23505 | unique_violation | Duplicate key violation |
| 23503 | foreign_key | Foreign key violation |
| 53300 | too_many_connections | Connection limit reached |

### Monitoring Errors

```typescript
// Prometheus query for error rate
rate(pg_query_errors_total[5m])

// Alert on high error rate
alert: HighDatabaseErrorRate
expr: rate(pg_query_errors_total[5m]) > 0.05
```

## Performance Optimization

### Index Optimization

```sql
-- Find missing indexes
SELECT 
  schemaname,
  tablename,
  attname,
  n_distinct,
  correlation
FROM pg_stats
WHERE schemaname = 'public'
  AND n_distinct > 100
  AND correlation < 0.1
ORDER BY n_distinct DESC;

-- Create covering index
CREATE INDEX CONCURRENTLY idx_funds_search 
ON funds (size, status) 
INCLUDE (name, created_at);
```

### Query Optimization

```sql
-- Enable query timing
SET track_io_timing = ON;

-- Analyze query performance
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT * FROM funds f
JOIN investments i ON f.id = i.fund_id
WHERE f.size > 10000000;

-- Update statistics
ANALYZE funds;
```

### Connection Optimization

```sql
-- Check connection states
SELECT state, count(*)
FROM pg_stat_activity
GROUP BY state;

-- Kill idle connections
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
  AND state_change < NOW() - INTERVAL '10 minutes';
```

## Grafana Dashboard

### Import Dashboard

1. Open Grafana
2. Go to Dashboards → Import
3. Upload `ops/dashboards/db/dashboard.json`
4. Select Prometheus data source
5. Click Import

### Key Panels

1. **Query Duration P95**: 95th percentile query time
2. **Slow Queries/min**: Rate of slow queries
3. **Connection Pool**: Active, idle, waiting connections
4. **Error Rate**: Query failures by type
5. **Query Types**: Breakdown by SELECT, INSERT, UPDATE, DELETE
6. **Lock Contention**: Queries waiting on locks

## Alerting

### Prometheus Alerts

```yaml
groups:
  - name: database
    rules:
      - alert: SlowQueries
        expr: rate(pg_slow_queries_total[5m]) > 0.1
        for: 5m
        annotations:
          summary: "High rate of slow database queries"
      
      - alert: ConnectionPoolExhausted
        expr: pg_pool_clients_waiting > 5
        for: 2m
        annotations:
          summary: "{{ $value }} clients waiting for connection"
      
      - alert: DatabaseErrors
        expr: rate(pg_query_errors_total[5m]) > 0.05
        for: 5m
        annotations:
          summary: "Database error rate > 5%"
```

## Troubleshooting

### High Query Latency

1. Check slow query log
2. Run EXPLAIN ANALYZE on slow queries
3. Verify indexes are being used
4. Check for lock contention
5. Monitor disk I/O

### Connection Pool Exhaustion

1. Increase DB_POOL_MAX
2. Reduce query execution time
3. Check for connection leaks
4. Enable pgBouncer for connection pooling

### Timeout Errors

1. Optimize slow queries
2. Add appropriate indexes
3. Increase timeout for specific operations
4. Use read replicas for analytics

### Lock Contention

1. Identify blocking queries:
```sql
SELECT 
  blocking.pid AS blocking_pid,
  blocking.query AS blocking_query,
  blocked.pid AS blocked_pid,
  blocked.query AS blocked_query
FROM pg_stat_activity AS blocked
JOIN pg_stat_activity AS blocking 
  ON blocking.pid = ANY(pg_blocking_pids(blocked.pid));
```

2. Kill blocking query if necessary:
```sql
SELECT pg_cancel_backend(pid);
-- or
SELECT pg_terminate_backend(pid);
```

## Best Practices

### Development
- Use EXPLAIN ANALYZE before deploying new queries
- Add indexes for frequent WHERE/JOIN conditions
- Avoid SELECT * in production code
- Use prepared statements for repeated queries

### Production
- Monitor p95 query latency
- Set appropriate timeouts
- Use read replicas for analytics
- Regular VACUUM and ANALYZE
- Monitor connection pool utilization

### Maintenance
- Weekly slow query review
- Monthly index usage analysis
- Quarterly schema optimization
- Annual capacity planning

## References

- [PostgreSQL Performance](https://www.postgresql.org/docs/current/performance-tips.html)
- [pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html)
- [Connection Pooling](https://wiki.postgresql.org/wiki/Connection_Pooling)
- [Monitoring](https://www.postgresql.org/docs/current/monitoring.html)