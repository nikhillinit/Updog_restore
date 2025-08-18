# Database Circuit Breaker Migration Guide

This guide helps migrate existing database code to use circuit breaker-protected operations.

## Quick Start

### PostgreSQL Migration

**Before (direct pool usage):**
```typescript
import { pool } from './db/pool';

const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
const users = result.rows;
```

**After (circuit breaker protected):**
```typescript
import { q } from './server/db';

const users = await q('SELECT * FROM users WHERE id = $1', [userId]);
```

### Redis Migration

**Before (direct Redis client):**
```typescript
import redis from './redis-client';

await redis.set('key', 'value');
const value = await redis.get('key');
```

**After (circuit breaker + fallback):**
```typescript
import { redisSet, redisGet } from './server/db';

await redisSet('key', 'value', 60); // With TTL
const value = await redisGet('key'); // Falls back to memory if Redis down
```

## API Reference

### PostgreSQL Functions

```typescript
// Simple query returning rows
const rows = await q<User>('SELECT * FROM users');

// Full query result with metadata
const result = await query<User>('SELECT * FROM users');
console.log(result.rowCount);

// Get single row
const user = await queryOne<User>('SELECT * FROM users WHERE id = $1', [id]);

// Get single value
const count = await queryScalar<number>('SELECT COUNT(*) FROM users');

// Transaction with automatic rollback
const result = await transactionWithBreaker(async (client) => {
  await client.query('INSERT INTO users (name) VALUES ($1)', [name]);
  await client.query('INSERT INTO logs (action) VALUES ($1)', ['user_created']);
  return { success: true };
});

// Query with automatic retry
const data = await queryWithRetry('SELECT * FROM important_data', [], {
  maxRetries: 5,
  initialDelay: 100,
});
```

### Redis Functions

```typescript
// Basic operations
await redisSet('key', 'value', 60); // TTL in seconds
const value = await redisGet('key');
await redisDel('key');

// JSON operations
await redisSetJSON('user:1', { id: 1, name: 'John' }, 3600);
const user = await redisGetJSON<User>('user:1');

// Counter operations
const count = await redisIncr('page:views');

// Set expiry
await redisExpire('session:123', 1800); // 30 minutes
```

## Configuration

Add these environment variables to control circuit breaker behavior:

```bash
# PostgreSQL Circuit Breaker
CB_DB_ENABLED=true                  # Enable/disable circuit breaker
CB_DB_FAILURE_THRESHOLD=5           # Failures before opening
CB_DB_RESET_TIMEOUT_MS=30000        # Time before attempting reset (30s)
CB_DB_OP_TIMEOUT_MS=10000           # Operation timeout (10s)
CB_DB_SUCCESS_TO_CLOSE=3            # Successes needed to close
CB_DB_HALF_OPEN_MAX_CONC=2          # Max concurrent requests in half-open

# Redis Circuit Breaker
CB_CACHE_ENABLED=true               # Enable/disable circuit breaker
CB_CACHE_FAILURE_THRESHOLD=5        # Failures before opening
CB_CACHE_RESET_TIMEOUT_MS=30000     # Time before attempting reset (30s)
CB_CACHE_OP_TIMEOUT_MS=2000         # Operation timeout (2s)
CB_CACHE_SUCCESS_TO_CLOSE=3         # Successes needed to close
CB_CACHE_HALF_OPEN_MAX_CONC=2       # Max concurrent requests in half-open

# Connection Pools
PG_POOL_MAX=20                      # Max PostgreSQL connections
PG_IDLE_TIMEOUT=30000               # Idle connection timeout
PG_CONNECT_TIMEOUT=2000             # Connection timeout
PG_STATEMENT_TIMEOUT=10000          # Statement timeout
PG_QUERY_TIMEOUT=10000              # Query timeout

# Redis Connection
REDIS_URL=redis://localhost:6379    # Redis connection URL
REDIS_HOST=localhost                # Redis host (if not using URL)
REDIS_PORT=6379                     # Redis port
REDIS_DB=0                          # Redis database number
```

## Migration Checklist

### Phase 1: Preparation
- [ ] Review existing database queries for performance
- [ ] Identify critical vs non-critical operations
- [ ] Set up monitoring dashboards
- [ ] Configure environment variables

### Phase 2: Migration
- [ ] Replace direct pool imports with circuit breaker functions
- [ ] Update transaction code to use `transactionWithBreaker`
- [ ] Replace Redis client calls with wrapped functions
- [ ] Add retry logic for critical operations

### Phase 3: Testing
- [ ] Run integration tests
- [ ] Perform chaos testing (kill database connections)
- [ ] Validate fallback behavior
- [ ] Check metrics and monitoring

### Phase 4: Deployment
- [ ] Deploy with circuit breakers disabled (`CB_*_ENABLED=false`)
- [ ] Monitor baseline metrics
- [ ] Enable circuit breakers gradually
- [ ] Adjust thresholds based on production behavior

## Common Patterns

### 1. Cached Database Query
```typescript
async function getUserWithCache(userId: string) {
  // Try cache first
  const cached = await redisGetJSON<User>(`user:${userId}`);
  if (cached) return cached;
  
  // Fallback to database
  const user = await queryOne<User>(
    'SELECT * FROM users WHERE id = $1',
    [userId]
  );
  
  // Cache for next time (fire and forget)
  if (user) {
    redisSetJSON(`user:${userId}`, user, 300).catch(() => {});
  }
  
  return user;
}
```

### 2. Bulk Operations with Batching
```typescript
async function bulkInsert(items: Item[]) {
  const BATCH_SIZE = 100;
  
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    
    await transactionWithBreaker(async (client) => {
      for (const item of batch) {
        await client.query(
          'INSERT INTO items (name, value) VALUES ($1, $2)',
          [item.name, item.value]
        );
      }
    });
  }
}
```

### 3. Health Check Endpoint
```typescript
app.get('/health/db', async (req, res) => {
  const health = await checkDatabaseHealth();
  
  if (health.healthy) {
    res.json({ status: 'ok', ...health });
  } else {
    res.status(503).json({ status: 'unhealthy', ...health });
  }
});
```

## Monitoring

### Key Metrics to Track

1. **Circuit Breaker State**
   - Monitor transitions between CLOSED, HALF_OPEN, OPEN
   - Alert on breakers staying OPEN > 5 minutes

2. **Query Performance**
   - Track slow queries (> 1 second)
   - Monitor average query duration
   - Track query error rates

3. **Cache Performance**
   - Cache hit rate (target > 80%)
   - Fallback usage (should be rare)
   - Memory cache size

4. **Connection Pool**
   - Active connections
   - Waiting requests
   - Connection timeouts

### Grafana Dashboard Queries

```promql
# Circuit breaker state
updog_circuit_breaker_state{breaker_name="postgres"}

# Query latency P95
histogram_quantile(0.95, 
  rate(pg_query_duration_seconds_bucket[5m])
)

# Cache hit rate
rate(redis_cache_hits_total[5m]) / 
rate(redis_cache_requests_total[5m])

# Connection pool utilization
pg_pool_connections_active / pg_pool_connections_max
```

## Troubleshooting

### Circuit Breaker Stuck Open
**Symptom:** All database queries failing immediately
**Solution:** 
1. Check database health manually
2. Review error logs for root cause
3. Temporarily disable circuit breaker: `CB_DB_ENABLED=false`
4. Adjust thresholds if too sensitive

### High Memory Cache Usage
**Symptom:** Memory cache filling up quickly
**Solution:**
1. Reduce cache TTL for large objects
2. Implement cache eviction strategy
3. Clear cache manually: `clearMemoryCache()`

### Slow Query Performance
**Symptom:** Queries timing out frequently
**Solution:**
1. Review and optimize SQL queries
2. Add database indexes
3. Increase timeout: `CB_DB_OP_TIMEOUT_MS=15000`
4. Implement query result caching

## Best Practices

1. **Always Handle Failures Gracefully**
   - Provide meaningful fallbacks
   - Log errors for debugging
   - Return degraded but functional responses

2. **Configure Appropriate Timeouts**
   - Database operations: 10-15 seconds
   - Cache operations: 1-2 seconds
   - Adjust based on your SLAs

3. **Monitor Everything**
   - Set up alerts for circuit breaker state changes
   - Track performance metrics
   - Review logs regularly

4. **Test Failure Scenarios**
   - Regular chaos testing
   - Validate fallback behavior
   - Ensure graceful degradation

5. **Gradual Rollout**
   - Start with circuit breakers disabled
   - Enable for non-critical operations first
   - Adjust thresholds based on production data