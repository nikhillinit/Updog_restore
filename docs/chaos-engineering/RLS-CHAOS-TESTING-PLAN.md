# Multi-Tenant RLS Chaos Engineering Plan

**Status**: Draft
**Target Environment**: Production (after staging validation)
**Risk Level**: CRITICAL - Financial data isolation
**Last Updated**: 2025-11-11

## Executive Summary

This chaos engineering plan validates the resilience of PostgreSQL Row-Level Security (RLS) for multi-tenant isolation in a venture capital fund modeling platform. Given the financial nature of LP data, we enforce **zero tolerance for cross-tenant data leakage**.

### Critical Success Criteria

1. **Zero cross-tenant data leakage** under all failure scenarios
2. **Fail-safe behavior** when RLS context is missing/invalid
3. **Recovery time < 30 seconds** for all automated rollbacks
4. **Performance degradation < 10% p95** with RLS overhead
5. **No customer-visible errors** during controlled chaos

---

## Migration Failure Scenarios

### Scenario 1: Migration Fails at 50% Completion (Mid-Backfill)

**Description**: During organization_id backfill, process crashes after processing 50% of records.

**Reproduction Steps**:
```bash
# Terminal 1: Start migration with artificial delay
psql $DATABASE_URL <<SQL
BEGIN;
UPDATE funds
SET organization_id = 'a1111111-1111-1111-1111-111111111111'::uuid
WHERE organization_id IS NULL
LIMIT (SELECT COUNT(*)/2 FROM funds WHERE organization_id IS NULL);
-- Wait 30 seconds, then kill connection
SELECT pg_sleep(30);
SQL

# Terminal 2: After 5 seconds, kill the connection
psql $DATABASE_URL -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query LIKE '%organization_id%' AND state = 'active';"
```

**Expected Behavior**:
- Transaction rolls back (atomicity preserved)
- No partial backfill state
- Migration can be restarted idempotently

**Detection**:
```sql
-- Check for inconsistent state
SELECT
  'funds' as table_name,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE organization_id IS NULL) as nulls,
  COUNT(*) FILTER (WHERE organization_id IS NOT NULL) as filled
FROM funds;
```

**Recovery Procedure**:
1. Verify no partial writes: `SELECT * FROM migration_progress WHERE status = 'running'`
2. Clear stale progress: `DELETE FROM migration_progress WHERE status = 'running'`
3. Restart migration script: `npm run migrate:rls`
4. **Time to Recovery**: < 2 minutes (script restart)

---

### Scenario 2: Database Connection Drops During Shadow Table Sync

**Description**: Network partition between application and database during gh-ost shadow table sync.

**Note**: This scenario assumes gh-ost usage. If not using gh-ost, adapt to your migration tool.

**Reproduction Steps**:
```bash
# Using Docker network manipulation
docker network disconnect updog_default updog-postgres-1
sleep 15
docker network connect updog_default updog-postgres-1
```

**Expected Behavior**:
- gh-ost detects connection loss
- Automatically pauses replication
- Alerts fire within 30 seconds
- Manual resume after reconnection

**Detection**:
```sql
-- Check replication lag
SELECT
  slot_name,
  active,
  pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) AS lag_bytes
FROM pg_replication_slots;
```

**Recovery Procedure**:
1. Check gh-ost status: `gh-ost --status`
2. Resume if safe: `gh-ost --assume-master-host=localhost --execute`
3. Verify shadow table sync: Compare row counts
4. **Time to Recovery**: < 60 seconds (automated resume)

---

### Scenario 3: PgBouncer Connection Pool Exhaustion

**Description**: Sudden traffic spike exhausts PgBouncer connection pool during migration.

**Reproduction Steps**:
```bash
# Simulate traffic spike with 100 concurrent connections
seq 1 100 | xargs -P100 -I{} psql $DATABASE_URL -c "SELECT pg_sleep(10);" &

# Monitor pool exhaustion
psql $DATABASE_URL -c "SHOW POOL STATS;"
```

**Expected Behavior**:
- New connections queue (up to reserve_pool_size)
- Requests timeout after query_wait_timeout (120s default)
- No connection leaks
- Graceful error responses to clients

**Detection**:
```bash
# Check PgBouncer stats
psql -h pgbouncer -p 6432 -U pgbouncer pgbouncer -c "SHOW POOLS;"
# Look for: maxwait > 0, sv_active = max_db_connections
```

**Recovery Procedure**:
1. Scale PgBouncer pool: Edit `pgbouncer.ini`, increase `default_pool_size`
2. Reload config: `systemctl reload pgbouncer`
3. Kill long-running queries: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'active' AND now() - query_start > interval '5 minutes';`
4. **Time to Recovery**: < 15 seconds (config reload)

---

### Scenario 4: Disk Space Runs Out During Index Creation

**Description**: CREATE INDEX CONCURRENTLY fails when disk fills up.

**Reproduction Steps**:
```bash
# Pre-fill disk to 95% capacity
dd if=/dev/zero of=/var/lib/postgresql/data/fill.dat bs=1G count=<calculated>

# Attempt index creation
psql $DATABASE_URL <<SQL
CREATE INDEX CONCURRENTLY idx_test_large ON funds(organization_id, created_at);
SQL
```

**Expected Behavior**:
- Index creation fails with ENOSPC error
- CONCURRENTLY ensures no table lock held
- Invalid index left in catalog
- Writes to existing tables still succeed

**Detection**:
```sql
-- Check for invalid indexes
SELECT indexrelid::regclass, indisvalid
FROM pg_index
WHERE NOT indisvalid;

-- Disk space check
SELECT pg_database_size(current_database()) / 1024 / 1024 as db_size_mb;
```

**Recovery Procedure**:
1. Drop invalid index: `DROP INDEX CONCURRENTLY IF EXISTS idx_test_large;`
2. Free disk space: Remove old WAL files, vacuum full
3. Retry index creation with monitoring
4. **Time to Recovery**: < 5 minutes (manual cleanup)

---

### Scenario 5: Replica Lag Exceeds Threshold (gh-ost Auto-Pause)

**Description**: Read replica falls behind by > 1MB, triggering gh-ost safety mechanism.

**Reproduction Steps**:
```bash
# Simulate heavy write load on primary
pgbench -c 50 -j 4 -T 60 $DATABASE_URL

# Monitor replication lag
psql $DATABASE_URL -c "SELECT pg_wal_lsn_diff(sent_lsn, replay_lsn) AS lag FROM pg_stat_replication;"
```

**Expected Behavior**:
- gh-ost pauses when lag > maximum_lag_on_failover (1MB default)
- Alerts fire: "Migration paused due to replication lag"
- Migration resumes when lag drops below threshold
- No data loss or corruption

**Detection**:
```sql
-- Check replication health
SELECT
  client_addr,
  state,
  pg_wal_lsn_diff(sent_lsn, replay_lsn) AS lag_bytes,
  replay_lag
FROM pg_stat_replication;
```

**Recovery Procedure**:
1. Investigate lag cause: Check replica resources (CPU, disk I/O)
2. Temporary fix: Reduce write load or pause non-critical jobs
3. Resume gh-ost: Automatic when lag resolves
4. **Time to Recovery**: Variable (5-30 minutes depending on load)

---

## RLS Context Failure Scenarios

### Scenario 6: app.current_org Context Not Set (Middleware Bug)

**Description**: Request bypasses RLS middleware, leaving context unset.

**Reproduction Steps**:
```typescript
// Simulate bug: Directly query without setting context
import { db } from './db';
import { funds } from '@shared/schema';

// This should return NOTHING due to fail-closed design
const result = await db.select().from(funds);
console.log('Leaked funds:', result.length); // Should be 0
```

**Expected Behavior**:
- RLS policy evaluates to `organization_id = '00000000-0000-0000-0000-000000000000'`
- Zero records returned (fail-closed)
- Database logs warning: "Query executed without RLS context"
- No cross-tenant data leakage

**Detection**:
```sql
-- Monitor queries without context
SELECT
  query,
  calls,
  mean_exec_time
FROM pg_stat_statements
WHERE query LIKE '%current_org_id()%'
AND mean_exec_time < 0.1; -- Suspiciously fast (no rows matched)
```

**Monitoring Alert**:
```yaml
- alert: QueriesWithoutRLSContext
  expr: rate(queries_without_rls_context[5m]) > 0.01
  for: 2m
  severity: critical
  annotations:
    summary: "Queries executed without RLS context"
```

**Recovery Procedure**:
1. **IMMEDIATE**: Revoke application database access
2. Investigate middleware bypass: Review recent code changes
3. Add assertion to all routes: `if (!req.context) throw new Error('Missing RLS context')`
4. **Time to Recovery**: < 30 seconds (circuit breaker)

---

### Scenario 7: Invalid organization_id in JWT Token

**Description**: Attacker modifies JWT to inject different org_id.

**Reproduction Steps**:
```typescript
// Malicious JWT with wrong org_id
const maliciousToken = jwt.sign(
  { sub: 'user123', orgId: 'victim-org-id' },
  'wrong-secret' // Will fail signature verification
);

// Send request
fetch('/api/funds', {
  headers: { 'Authorization': `Bearer ${maliciousToken}` }
});
```

**Expected Behavior**:
- JWT verification fails (signature mismatch)
- Request rejected with 401 Unauthorized
- Audit log entry: "Invalid JWT signature"
- No database query executed

**Detection**:
```typescript
// JWT middleware
try {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
} catch (err) {
  logger.warn('Invalid JWT signature', { error: err.message });
  return res.status(401).json({ error: 'invalid_token' });
}
```

**Monitoring Alert**:
```yaml
- alert: HighInvalidJWTRate
  expr: rate(http_requests{status="401", reason="invalid_token"}[5m]) > 10
  for: 1m
  severity: warning
  annotations:
    summary: "Potential JWT attack detected"
```

**Recovery Procedure**:
1. Already mitigated by JWT verification
2. Rate limit offending IP: `iptables -A INPUT -s <ip> -j DROP`
3. Rotate JWT secret if compromise suspected
4. **Time to Recovery**: N/A (attack blocked)

---

### Scenario 8: Transaction Rolled Back After SET LOCAL (Context Lost)

**Description**: Error in route handler causes rollback, losing RLS context mid-request.

**Reproduction Steps**:
```typescript
// Express route with intentional error
app.get('/api/funds', withRLSTransaction(), async (req, res) => {
  // Context set successfully
  await req.pgClient.query("SET LOCAL app.current_org = $1", [req.context.orgId]);

  // Intentional error
  throw new Error('Simulated failure');

  // This query would run without context if transaction not handled
  const funds = await db.select().from(fundsTable);
  res.json(funds);
});
```

**Expected Behavior**:
- Error thrown inside transaction
- Middleware auto-rollback: `client.query('ROLLBACK')`
- Connection released to pool
- Next request gets fresh connection with no stale context
- Client receives 500 error

**Detection**:
```typescript
// Middleware logging
res.on('close', () => {
  if (!transactionCompleted) {
    logger.error('Transaction not completed on close', {
      path: req.path,
      statusCode: res.statusCode
    });
  }
});
```

**Monitoring Alert**:
```yaml
- alert: HighRollbackRate
  expr: rate(pg_stat_database_xact_rollback[5m]) / rate(pg_stat_database_xact_commit[5m]) > 0.1
  for: 5m
  severity: warning
```

**Recovery Procedure**:
1. Already handled by middleware rollback logic
2. Investigate root cause of error
3. Fix application bug
4. **Time to Recovery**: Immediate (auto-rollback)

---

### Scenario 9: Connection Pool Reuse with Stale Context

**Description**: PgBouncer in transaction pooling mode doesn't reset session variables.

**Reproduction Steps**:
```bash
# Configure PgBouncer with transaction pooling
# /etc/pgbouncer/pgbouncer.ini
pool_mode = transaction
server_reset_query = DISCARD ALL

# Simulate stale context
psql -h pgbouncer -p 6432 <<SQL
BEGIN;
SET LOCAL app.current_org = 'org-1';
COMMIT; -- Connection returns to pool

-- New transaction reuses connection
BEGIN;
SELECT current_setting('app.current_org', true); -- Should be empty/null
SQL
```

**Expected Behavior**:
- `DISCARD ALL` clears all session state
- New transaction starts with clean context
- RLS policies evaluate to fail-closed UUID
- Zero records returned without explicit context set

**Detection**:
```sql
-- Check if session variables persist
SELECT
  datname,
  usename,
  application_name,
  current_setting('app.current_org', true) as stale_org
FROM pg_stat_activity
WHERE current_setting('app.current_org', true) IS NOT NULL
AND state = 'idle';
```

**Monitoring Alert**:
```yaml
- alert: StaleRLSContext
  expr: count(pg_stat_activity{state="idle", has_rls_context="true"}) > 0
  for: 30s
  severity: critical
```

**Recovery Procedure**:
1. Verify `server_reset_query = DISCARD ALL` in pgbouncer.ini
2. Reload PgBouncer: `systemctl reload pgbouncer`
3. Test context isolation: Run automated test suite
4. **Time to Recovery**: < 10 seconds (config reload)

---

## Performance Degradation Scenarios

### Scenario 10: RLS Overhead Exceeds 10ms (p95)

**Description**: RLS policy evaluation adds unexpected latency.

**Reproduction Steps**:
```sql
-- Baseline without RLS
ALTER TABLE funds DISABLE ROW LEVEL SECURITY;
SELECT * FROM funds WHERE id = 1; -- Measure timing

-- Enable RLS
ALTER TABLE funds ENABLE ROW LEVEL SECURITY;
SELECT * FROM funds WHERE id = 1; -- Measure timing difference
```

**Expected Performance**:
- Simple SELECT by ID: < 5ms p95
- Fund list query: < 20ms p95
- Complex joins: < 50ms p95

**Detection**:
```sql
-- Monitor slow queries
SELECT
  query,
  mean_exec_time,
  stddev_exec_time,
  calls
FROM pg_stat_statements
WHERE query LIKE '%funds%'
AND mean_exec_time > 10
ORDER BY mean_exec_time DESC
LIMIT 10;
```

**Monitoring Alert**:
```yaml
- alert: SlowRLSQueries
  expr: histogram_quantile(0.95, rate(pg_query_duration_seconds_bucket{table="funds"}[5m])) > 0.010
  for: 5m
  severity: warning
```

**Recovery Procedure**:
1. Run EXPLAIN ANALYZE to identify bottleneck
2. Check missing indexes: `SELECT * FROM pg_indexes WHERE tablename = 'funds' AND indexname LIKE '%org%'`
3. Add missing index: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_funds_org_id ON funds(organization_id, id)`
4. Update statistics: `ANALYZE funds`
5. **Time to Recovery**: 2-5 minutes (index creation)

---

### Scenario 11: Missing Compound Indexes (Sequential Scans)

**Description**: Query planner chooses sequential scan instead of index due to missing compound index.

**Reproduction Steps**:
```sql
-- Query that should use index
EXPLAIN ANALYZE
SELECT * FROM portfoliocompanies
WHERE organization_id = 'a1111111-1111-1111-1111-111111111111'
AND status = 'active'
ORDER BY created_at DESC
LIMIT 10;

-- Look for "Seq Scan" in plan
```

**Expected Behavior**:
- Index scan with organization_id as leading column
- Execution time < 20ms
- No sequential scans on large tables

**Detection**:
```sql
-- Find sequential scans
SELECT
  schemaname,
  tablename,
  seq_scan,
  seq_tup_read,
  idx_scan,
  idx_tup_fetch,
  CASE
    WHEN seq_scan > 0 THEN seq_tup_read::float / seq_scan
    ELSE 0
  END as avg_seq_read
FROM pg_stat_user_tables
WHERE seq_scan > idx_scan
ORDER BY seq_tup_read DESC;
```

**Monitoring Alert**:
```yaml
- alert: HighSequentialScans
  expr: rate(pg_stat_user_tables_seq_scan[5m]) > 100
  for: 10m
  severity: warning
```

**Recovery Procedure**:
1. Identify missing indexes from EXPLAIN plans
2. Create compound indexes:
   ```sql
   CREATE INDEX CONCURRENTLY idx_portfoliocompanies_org_status
   ON portfoliocompanies(organization_id, status)
   WHERE status = 'active';
   ```
3. Update statistics: `ANALYZE portfoliocompanies`
4. **Time to Recovery**: 5-10 minutes (index creation)

---

### Scenario 12: Query Planner Chooses Wrong Plan

**Description**: PostgreSQL query planner selects suboptimal execution plan for RLS-filtered query.

**Reproduction Steps**:
```sql
-- Force bad plan for testing
SET enable_indexscan = off;
SET enable_bitmapscan = off;

EXPLAIN ANALYZE
SELECT f.*, COUNT(pc.id) as company_count
FROM funds f
LEFT JOIN portfoliocompanies pc ON pc.fund_id = f.id
WHERE f.organization_id = current_org_id()
GROUP BY f.id;
```

**Expected Behavior**:
- Nested loop join with index scans
- RLS predicate pushed down early
- Execution time < 100ms for typical org

**Detection**:
```sql
-- Compare actual vs estimated rows (plan quality)
-- If ratio > 10, planner is badly wrong
SELECT
  query,
  calls,
  mean_exec_time,
  plans
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC;
```

**Monitoring Alert**:
```yaml
- alert: SuboptimalQueryPlans
  expr: pg_stat_statements_mean_exec_time_seconds{query_type="join"} > 0.100
  for: 10m
  severity: warning
```

**Recovery Procedure**:
1. Collect better statistics: `ALTER TABLE funds ALTER COLUMN organization_id SET STATISTICS 1000; ANALYZE funds;`
2. Update planner settings:
   ```sql
   ALTER SYSTEM SET random_page_cost = 1.1; -- SSD optimized
   ALTER SYSTEM SET effective_cache_size = '4GB';
   SELECT pg_reload_conf();
   ```
3. Consider plan hints (last resort)
4. **Time to Recovery**: < 1 minute (settings reload)

---

### Scenario 13: Connection Pool Exhaustion Under Load

**Description**: High traffic depletes connection pool, causing request queuing.

**Reproduction Steps**:
```bash
# Load test with Apache Bench
ab -n 10000 -c 200 -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/funds

# Monitor pool saturation
psql $DATABASE_URL -c "SELECT state, COUNT(*) FROM pg_stat_activity GROUP BY state;"
```

**Expected Behavior**:
- Pool reaches max_connections (100)
- New requests queue up to reserve_pool_size
- Requests timeout after connectionTimeoutMillis (10s)
- 503 errors returned to clients

**Detection**:
```sql
-- Check active connections
SELECT
  state,
  COUNT(*) as count,
  (SELECT setting FROM pg_settings WHERE name = 'max_connections') as max
FROM pg_stat_activity
GROUP BY state;
```

**Monitoring Alert**:
```yaml
- alert: ConnectionPoolExhausted
  expr: pg_stat_activity_count / pg_settings_max_connections > 0.9
  for: 2m
  severity: critical
```

**Recovery Procedure**:
1. Scale horizontally: Add more application instances
2. Scale pool: Increase `max_connections` in postgresql.conf
3. Optimize queries: Add indexes to reduce query time
4. Add connection retry logic with exponential backoff
5. **Time to Recovery**: 1-2 minutes (horizontal scaling)

---

## Security Breach Scenarios

### Scenario 14: SQL Injection Attempt to Bypass RLS

**Description**: Attacker tries SQL injection to manipulate RLS context.

**Reproduction Steps**:
```typescript
// Malicious input
const maliciousOrgId = "'; DROP TABLE funds; --";

// Vulnerable code (if parameterization not used)
await db.execute(sql`SET LOCAL app.current_org = '${maliciousOrgId}'`);
```

**Expected Behavior**:
- Parameterized queries prevent injection
- Input validation rejects invalid UUID format
- RLS context remains unchanged
- Audit log entry: "SQL injection attempt detected"

**Detection**:
```typescript
// Input validation
if (!isValidUUID(orgId)) {
  logger.warn('Invalid org_id format', { orgId, userId });
  return res.status(400).json({ error: 'invalid_org_id' });
}
```

**Monitoring Alert**:
```yaml
- alert: SQLInjectionAttempt
  expr: rate(http_requests{status="400", error="invalid_org_id"}[5m]) > 5
  for: 1m
  severity: critical
```

**Recovery Procedure**:
1. Already mitigated by parameterized queries
2. Rate limit offending IP
3. Review all query construction for SQL injection
4. **Time to Recovery**: N/A (attack blocked)

---

### Scenario 15: Compromised API Key with Wrong org_id Claim

**Description**: Stolen API key with valid signature but attacker tries to modify org_id.

**Reproduction Steps**:
```typescript
// Legitimate API key
const legitimateKey = 'sk_live_abc123';

// Attacker intercepts and tries to use for different org
fetch('/api/funds', {
  headers: {
    'X-API-Key': legitimateKey,
    'X-Org-Override': 'victim-org-id' // Attempt to override
  }
});
```

**Expected Behavior**:
- API key is tied to specific organization
- Org override header is ignored
- RLS context derived from API key mapping only
- Request succeeds but only returns attacker's own data

**Detection**:
```typescript
// Middleware
const apiKeyOrg = await lookupOrgForApiKey(apiKey);
const requestedOrg = req.headers['x-org-override'];

if (requestedOrg && requestedOrg !== apiKeyOrg) {
  logger.warn('Org override attempt', { apiKey, requestedOrg, actualOrg: apiKeyOrg });
}

// Always use API key mapping
req.context.orgId = apiKeyOrg;
```

**Monitoring Alert**:
```yaml
- alert: OrgOverrideAttempt
  expr: rate(api_key_org_mismatch[5m]) > 1
  for: 1m
  severity: warning
```

**Recovery Procedure**:
1. Already mitigated by ignoring override header
2. Revoke compromised API key: `DELETE FROM api_keys WHERE key = ?`
3. Notify customer of potential compromise
4. **Time to Recovery**: < 1 minute (key revocation)

---

### Scenario 16: Direct Database Access Bypassing Middleware

**Description**: Admin with direct psql access queries database without RLS context.

**Reproduction Steps**:
```bash
# Direct database access
psql $DATABASE_URL <<SQL
-- No RLS context set
SELECT * FROM funds;
-- Returns ALL funds across ALL orgs (admin role has BYPASSRLS)
SQL
```

**Expected Behavior**:
- If admin role has BYPASSRLS: Sees all data (expected)
- If application role: Sees zero rows (fail-closed)
- Audit log entry: "Direct database access detected"

**Detection**:
```sql
-- Check for connections outside application
SELECT
  usename,
  application_name,
  client_addr,
  state,
  query
FROM pg_stat_activity
WHERE usename = 'updog_app'
AND application_name NOT LIKE 'updog-api%'
AND query NOT LIKE 'SET LOCAL%';
```

**Monitoring Alert**:
```yaml
- alert: DirectDatabaseAccess
  expr: pg_stat_activity{user="updog_app", app!="updog-api"} > 0
  for: 30s
  severity: warning
```

**Recovery Procedure**:
1. Verify if access was legitimate (admin debugging)
2. If unauthorized: Rotate database credentials
3. Enforce VPN + bastion host for direct access
4. **Time to Recovery**: N/A (detection alert)

---

### Scenario 17: Admin Accidentally Runs Query in Wrong Tenant Context

**Description**: Admin forgets to reset tenant context, runs bulk update in wrong org.

**Reproduction Steps**:
```bash
psql $DATABASE_URL <<SQL
-- Set context to org A
SELECT switch_tenant('tech-ventures');

-- Do some work...

-- Forget to reset, accidentally update org A data
UPDATE funds SET status = 'archived' WHERE vintage_year < 2020;
-- This only affects tech-ventures due to RLS!
SQL
```

**Expected Behavior**:
- RLS enforces context even for admin queries
- Update only affects current org (tech-ventures)
- Other orgs unaffected
- Audit log shows update with org context

**Detection**:
```sql
-- Check recent bulk updates
SELECT
  query,
  calls,
  rows
FROM pg_stat_statements
WHERE query LIKE 'UPDATE funds%'
AND rows > 10
ORDER BY queryid DESC
LIMIT 5;
```

**Monitoring Alert**:
```yaml
- alert: BulkUpdateDetected
  expr: rate(pg_stat_statements_rows{query_type="UPDATE"}[1m]) > 100
  for: 10s
  severity: warning
```

**Recovery Procedure**:
1. Identify affected records from audit_events
2. Rollback update: `UPDATE funds SET status = 'active' WHERE id IN (...)`
3. Verify restore from backup if needed
4. **Time to Recovery**: 2-5 minutes (manual rollback)

---

## Rollback Testing Scenarios

### Scenario 18: Rollback After 1 Hour of RLS Operation

**Description**: Discover critical bug 1 hour after RLS migration, need to rollback.

**Reproduction Steps**:
```bash
# 1. Enable RLS
psql $DATABASE_URL -f migrations/0002_multi_tenant_rls_setup.sql

# 2. Run application for 1 hour
# Generate traffic, mutations, etc.

# 3. Execute rollback
psql $DATABASE_URL -f migrations/0002_multi_tenant_rls_setup_ROLLBACK.sql
```

**Expected Behavior**:
- RLS policies dropped
- organization_id columns remain (data preserved)
- Application continues to work (queries ignore org_id)
- No data loss

**Data Consistency Checks**:
```sql
-- Verify row counts unchanged
SELECT 'funds' as table, COUNT(*) FROM funds
UNION ALL
SELECT 'portfoliocompanies', COUNT(*) FROM portfoliocompanies
UNION ALL
SELECT 'investments', COUNT(*) FROM investments;

-- Check for orphaned records
SELECT
  pc.id,
  pc.organization_id,
  f.organization_id as fund_org
FROM portfoliocompanies pc
JOIN funds f ON pc.fund_id = f.id
WHERE pc.organization_id != f.organization_id;
```

**Recovery Procedure**:
1. Execute rollback script
2. Verify data integrity checks pass
3. Run regression test suite
4. Notify users of temporary outage
5. **Time to Recovery**: 5-10 minutes (rollback + validation)

---

### Scenario 19: Rollback During Peak Traffic

**Description**: Rollback RLS migration while handling 1000 req/sec.

**Reproduction Steps**:
```bash
# Terminal 1: Generate load
ab -n 100000 -c 100 -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/funds &

# Terminal 2: Execute rollback
psql $DATABASE_URL -f migrations/0002_multi_tenant_rls_setup_ROLLBACK.sql
```

**Expected Behavior**:
- DDL operations acquire locks briefly
- Some requests may timeout during policy drops
- Connection pool drains and refills
- Errors returned as 503 (retry-able)
- No data corruption

**Detection**:
```sql
-- Monitor active queries during rollback
SELECT
  pid,
  state,
  wait_event_type,
  wait_event,
  query
FROM pg_stat_activity
WHERE state = 'active'
AND query NOT LIKE 'SELECT%';
```

**Monitoring Alert**:
```yaml
- alert: HighErrorRateDuringRollback
  expr: rate(http_requests{status=~"5.."}[1m]) > 100
  for: 30s
  severity: critical
```

**Recovery Procedure**:
1. Complete rollback (don't interrupt)
2. Restart application servers (flush connection pool)
3. Run smoke tests
4. Monitor error rate until stabilized
5. **Time to Recovery**: 2-3 minutes (rollback + restart)

---

### Scenario 20: Rollback Discovers Data Corruption

**Description**: After rollback, integrity checks reveal missing foreign key relationships.

**Reproduction Steps**:
```bash
# Execute rollback
psql $DATABASE_URL -f migrations/0002_multi_tenant_rls_setup_ROLLBACK.sql

# Run integrity checks
psql $DATABASE_URL <<SQL
-- Check for orphaned portfoliocompanies
SELECT COUNT(*) FROM portfoliocompanies pc
LEFT JOIN funds f ON pc.fund_id = f.id
WHERE f.id IS NULL;

-- Check for orphaned investments
SELECT COUNT(*) FROM investments i
LEFT JOIN funds f ON i.fund_id = f.id
WHERE f.id IS NULL;
SQL
```

**Expected Behavior**:
- Zero orphaned records
- All foreign key constraints satisfied
- organization_id values consistent across relationships

**Detection**:
```sql
-- Comprehensive integrity check
CREATE OR REPLACE FUNCTION check_data_integrity()
RETURNS TABLE(check_name TEXT, failed_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 'Orphaned portfoliocompanies'::TEXT, COUNT(*)
  FROM portfoliocompanies pc
  LEFT JOIN funds f ON pc.fund_id = f.id
  WHERE f.id IS NULL
  UNION ALL
  SELECT 'Org mismatch portfoliocompanies'::TEXT, COUNT(*)
  FROM portfoliocompanies pc
  JOIN funds f ON pc.fund_id = f.id
  WHERE pc.organization_id != f.organization_id
  UNION ALL
  SELECT 'Orphaned investments'::TEXT, COUNT(*)
  FROM investments i
  LEFT JOIN funds f ON i.fund_id = f.id
  WHERE f.id IS NULL;
END;
$$ LANGUAGE plpgsql;

SELECT * FROM check_data_integrity() WHERE failed_count > 0;
```

**Recovery Procedure**:
1. **DO NOT PROCEED** if corruption found
2. Restore from last known good backup
3. Re-analyze migration: Identify corruption source
4. Fix migration script
5. Test in staging with full dataset
6. **Time to Recovery**: 30-60 minutes (restore from backup)

---

## Summary Matrix

| Scenario | Severity | MTTR | Customer Impact | Auto-Recoverable |
|----------|----------|------|-----------------|------------------|
| 1. Mid-Backfill Crash | Medium | < 2min | None | Yes |
| 2. Connection Drop | Medium | < 1min | None | Yes |
| 3. Pool Exhaustion | High | < 15s | Timeouts | Yes |
| 4. Disk Full | High | < 5min | Writes fail | No |
| 5. Replica Lag | Medium | 5-30min | None | Yes |
| 6. Missing Context | CRITICAL | < 30s | Zero data | Yes |
| 7. Invalid JWT | Low | N/A | 401 errors | Yes |
| 8. Context Lost | Medium | Immediate | 500 errors | Yes |
| 9. Stale Context | CRITICAL | < 10s | Data leak risk | Yes |
| 10. High Latency | Medium | 2-5min | Slow queries | No |
| 11. Missing Index | Medium | 5-10min | Slow queries | No |
| 12. Bad Query Plan | Medium | < 1min | Slow queries | Yes |
| 13. Pool Exhaustion | High | 1-2min | 503 errors | No |
| 14. SQL Injection | CRITICAL | N/A | Blocked | Yes |
| 15. Org Override | Medium | < 1min | Blocked | Yes |
| 16. Direct Access | Low | N/A | Audit only | N/A |
| 17. Wrong Context | Medium | 2-5min | Partial update | No |
| 18. RLS Rollback | High | 5-10min | Brief outage | No |
| 19. Peak Rollback | High | 2-3min | High errors | No |
| 20. Data Corruption | CRITICAL | 30-60min | Full outage | No |

---

## Next Steps

1. **Build automated test suite** (see `RLS-CHAOS-TEST-SUITE.ts`)
2. **Create Game Day runbook** (see `RLS-GAME-DAY-RUNBOOK.md`)
3. **Configure monitoring** (see `RLS-MONITORING-SPECS.md`)
4. **Schedule chaos exercises**: Monthly in staging, quarterly in production
