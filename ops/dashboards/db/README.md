# Database Performance Dashboard

This dashboard monitors PostgreSQL performance metrics including query latency, slow queries, connection pool health, and error rates.

## Key Metrics

### Query Performance
- **Query Duration (p50, p95, p99)**: Histogram of query execution times
- **Slow Query Count**: Queries exceeding 1 second threshold
- **Query Types**: Breakdown by SELECT, INSERT, UPDATE, DELETE
- **Error Rate**: Query failures by error type

### Connection Pool
- **Active Connections**: Currently executing queries
- **Idle Connections**: Available connections in pool
- **Waiting Clients**: Clients waiting for available connection
- **Total Connections**: Current pool size

### Database Health
- **Statement Timeouts**: Queries killed by timeout
- **Lock Contention**: Queries waiting on locks
- **Transaction Rollbacks**: Failed transactions
- **Connection Errors**: Failed connection attempts

## Grafana Panel Configuration

### Query Duration Histogram
```promql
histogram_quantile(0.95,
  sum(rate(pg_query_duration_seconds_bucket[5m])) by (le, query_type)
)
```

### Slow Query Rate
```promql
rate(pg_slow_queries_total[5m])
```

### Connection Pool Status
```promql
pg_pool_connections_active
pg_pool_connections_idle
pg_pool_clients_waiting
```

### Error Rate by Type
```promql
rate(pg_query_errors_total[5m]) by (error_type)
```

## Alert Rules

### High Query Latency
```yaml
alert: HighQueryLatency
expr: histogram_quantile(0.95, rate(pg_query_duration_seconds_bucket[5m])) > 1
for: 5m
labels:
  severity: warning
annotations:
  summary: "Database query p95 latency > 1s"
```

### Connection Pool Exhaustion
```yaml
alert: ConnectionPoolExhausted
expr: pg_pool_clients_waiting > 5
for: 2m
labels:
  severity: critical
annotations:
  summary: "{{ $value }} clients waiting for database connection"
```

### High Error Rate
```yaml
alert: HighDatabaseErrorRate
expr: rate(pg_query_errors_total[5m]) > 0.05
for: 5m
labels:
  severity: warning
annotations:
  summary: "Database error rate > 5%"
```

## Dashboard JSON

Import this JSON into Grafana to create the dashboard:

```json
{
  "dashboard": {
    "title": "PostgreSQL Performance",
    "panels": [
      {
        "title": "Query Duration P95",
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0},
        "targets": [{
          "expr": "histogram_quantile(0.95, sum(rate(pg_query_duration_seconds_bucket[5m])) by (le, query_type))"
        }]
      },
      {
        "title": "Slow Queries/min",
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": 0},
        "targets": [{
          "expr": "rate(pg_slow_queries_total[1m]) * 60"
        }]
      },
      {
        "title": "Connection Pool",
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": 8},
        "targets": [
          {"expr": "pg_pool_connections_active", "legendFormat": "Active"},
          {"expr": "pg_pool_connections_idle", "legendFormat": "Idle"},
          {"expr": "pg_pool_clients_waiting", "legendFormat": "Waiting"}
        ]
      },
      {
        "title": "Query Errors",
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": 8},
        "targets": [{
          "expr": "rate(pg_query_errors_total[5m])"
        }]
      }
    ]
  }
}
```

## Tuning Guidelines

### Pool Size
- **Formula**: `max_connections = (num_workers * avg_connections_per_worker) + buffer`
- **Default**: 20 connections (suitable for 2-4 Node.js workers)
- **Monitor**: Watch for waiting clients, adjust if > 0 consistently

### Statement Timeout
- **Default**: 5 seconds
- **Long queries**: Use dedicated read replica with higher timeout
- **Background jobs**: Disable timeout for batch operations

### Slow Query Threshold
- **Default**: 1000ms
- **OLTP**: Lower to 100-500ms
- **Analytics**: Raise to 5-10s

### Lock Timeout
- **Default**: 3 seconds
- **High contention**: Lower to fail fast
- **Migrations**: Disable during schema changes

## Performance Optimization

### Index Analysis
```sql
-- Find missing indexes
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname = 'public'
  AND n_distinct > 100
  AND correlation < 0.1
ORDER BY n_distinct DESC;
```

### Slow Query Analysis
```sql
-- Requires pg_stat_statements extension
SELECT query, calls, mean_exec_time, max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 1000
ORDER BY mean_exec_time DESC
LIMIT 20;
```

### Connection Pool Monitoring
```sql
-- Active connections by state
SELECT state, count(*)
FROM pg_stat_activity
GROUP BY state;
```

### Lock Monitoring
```sql
-- Current locks
SELECT 
  pg_locks.pid,
  pg_stat_activity.query,
  pg_locks.mode,
  pg_locks.granted
FROM pg_locks
JOIN pg_stat_activity ON pg_locks.pid = pg_stat_activity.pid
WHERE pg_locks.granted = false;
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_POOL_MAX` | 20 | Maximum pool size |
| `DB_POOL_MIN` | 2 | Minimum pool size |
| `SLOW_QUERY_MS` | 1000 | Slow query threshold (ms) |
| `STATEMENT_TIMEOUT_MS` | 5000 | Query timeout (ms) |
| `LOCK_TIMEOUT_MS` | 3000 | Lock acquisition timeout (ms) |
| `IDLE_TRANSACTION_TIMEOUT_MS` | 10000 | Idle transaction timeout (ms) |

## Troubleshooting

### High Latency
1. Check slow query log
2. Review query plans with `EXPLAIN ANALYZE`
3. Verify indexes are being used
4. Check for lock contention
5. Monitor disk I/O

### Connection Exhaustion
1. Increase pool max size
2. Reduce query execution time
3. Check for connection leaks
4. Enable connection pooling (pgBouncer)

### Timeout Errors
1. Optimize slow queries
2. Add appropriate indexes
3. Increase timeout for specific operations
4. Use read replicas for analytics

## References
- [PostgreSQL Performance Tuning](https://www.postgresql.org/docs/current/performance-tips.html)
- [pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html)
- [Connection Pooling](https://www.postgresql.org/docs/current/runtime-config-connection.html)
- [Monitoring Statistics](https://www.postgresql.org/docs/current/monitoring-stats.html)