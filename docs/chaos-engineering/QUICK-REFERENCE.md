# RLS Chaos Engineering Quick Reference Card

**Print this page and keep it handy during Game Days**

---

## Emergency Contacts

| Role | Contact | Phone |
|------|---------|-------|
| On-Call Engineer | @oncall | +1-XXX-XXX-XXXX |
| Database Lead | @db-lead | +1-XXX-XXX-XXXX |
| Security Lead | @security-lead | +1-XXX-XXX-XXXX |
| Engineering Manager | @eng-manager | +1-XXX-XXX-XXXX |

---

## Critical Commands

### Stop Everything (Emergency Brake)

```bash
# 1. Block all API traffic
iptables -A INPUT -p tcp --dport 5000 -j DROP

# 2. Revoke database access
psql $DATABASE_URL <<SQL
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM updog_app;
SQL

# 3. Stop application
pm2 stop api
```

### Health Check (30 seconds)

```bash
# Quick health verification
./scripts/health-check.sh

# Or manual checks:
psql $DATABASE_URL -c "SELECT * FROM verify_rls_setup();"
psql $DATABASE_URL -c "SELECT state, COUNT(*) FROM pg_stat_activity GROUP BY state;"
curl http://localhost:5000/health
```

### RLS Context Verification

```sql
-- Check current RLS context
SELECT
  current_setting('app.current_org', true) as org,
  current_setting('app.current_user', true) as user,
  current_setting('app.current_role', true) as role;

-- Check for stale context
SELECT pid, state, current_setting('app.current_org', true) as org
FROM pg_stat_activity
WHERE state = 'idle'
AND current_setting('app.current_org', true) IS NOT NULL;
```

### Full Rollback (2 minutes)

```bash
# Backup first
pg_dump $DATABASE_URL > /tmp/emergency-backup-$(date +%Y%m%d_%H%M%S).sql

# Execute rollback
time psql $DATABASE_URL -f migrations/0002_multi_tenant_rls_setup_ROLLBACK.sql

# Verify
psql $DATABASE_URL -c "SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'funds';"

# Restart app
pm2 restart api
```

---

## Common Failure Patterns

### Pattern 1: No Data Returned

**Symptom**: Queries return empty arrays
**Likely Cause**: Missing RLS context
**Check**: `SELECT current_setting('app.current_org', true);`
**Fix**: Verify middleware execution order

### Pattern 2: Slow Queries

**Symptom**: Queries taking > 10ms
**Likely Cause**: Missing index or sequential scan
**Check**: `EXPLAIN ANALYZE SELECT * FROM funds WHERE organization_id = current_org_id();`
**Fix**: Create index: `CREATE INDEX CONCURRENTLY idx_funds_org_id ON funds(organization_id);`

### Pattern 3: Connection Timeouts

**Symptom**: 503 errors, "Connection timeout"
**Likely Cause**: Pool exhaustion
**Check**: `psql $DATABASE_URL -c "SELECT state, COUNT(*) FROM pg_stat_activity GROUP BY state;"`
**Fix**: Scale horizontally (add app instances) or increase pool size

### Pattern 4: Context Leakage

**Symptom**: User sees another org's data
**Likely Cause**: Stale context or DISCARD ALL not working
**Check**: Look for idle connections with RLS context set
**Fix**: Reload PgBouncer, verify `server_reset_query = DISCARD ALL`

---

## Alert Triage Matrix

| Alert | First Action | MTTR Target | Escalate If |
|-------|--------------|-------------|-------------|
| CrossTenantDataLeakage | Revoke DB access | 30s | Immediately (P0) |
| QueriesWithoutRLSContext | Check middleware | 2min | > 5min unresolved |
| StaleRLSContext | Reload PgBouncer | 30s | > 2min unresolved |
| RLSDisabledOnTable | Re-enable RLS | 10s | Immediately (P0) |
| SlowRLSQueries | Run EXPLAIN ANALYZE | 1hr | p95 > 50ms |
| ConnectionPoolSaturation | Scale horizontally | 5min | Pool at 100% |

---

## Performance Targets

| Query Type | p50 | p95 | p99 |
|------------|-----|-----|-----|
| Simple SELECT by ID | 1ms | 5ms | 10ms |
| Org-filtered list | 5ms | 20ms | 50ms |
| Complex join | 20ms | 100ms | 200ms |
| Bulk INSERT (100 rows) | 50ms | 100ms | 200ms |

---

## Test Suite Quick Run

```bash
# Full chaos suite (5 minutes)
npm test -- tests/chaos/rls-chaos-suite.test.ts

# Just context failures (1 minute)
npm test -- tests/chaos/rls-chaos-suite.test.ts -t "Context"

# Just performance (2 minutes)
npm test -- tests/chaos/rls-chaos-suite.test.ts -t "Performance"

# Concurrency stress (3 minutes)
npm test -- tests/chaos/rls-chaos-suite.test.ts -t "Concurrency"
```

---

## Monitoring URLs

- **Grafana RLS Dashboard**: http://grafana:3000/d/rls-dashboard
- **Prometheus Alerts**: http://prometheus:9090/alerts
- **AlertManager**: http://alertmanager:9093
- **PgBouncer Stats**: `psql -h pgbouncer -p 6432 -U pgbouncer pgbouncer -c "SHOW STATS;"`

---

## Game Day Phases (3 hours)

| Phase | Duration | Scenarios | Success Criteria |
|-------|----------|-----------|------------------|
| 1. Kickoff | 15min | Baseline checks | All green |
| 2. Context Failures | 45min | 6, 8, 9 | Fail-closed, alerts fire |
| 3. Performance | 30min | 10, 11 | p95 < 10ms, alerts fire |
| 4. Security | 30min | 14, 15, 17 | Attacks blocked |
| 5. Rollback | 30min | 18 | MTTR < 10min, zero data loss |
| 6. Concurrency | 30min | Stress test | No context leakage |
| 7. Wrap-Up | 30min | Retrospective | Action items created |

---

## Pre-Game Checklist (Print This)

- [ ] Team assembled (IC, DBA, Backend, Observability, Scribe)
- [ ] Backup verified (< 24h old)
- [ ] Monitoring healthy (Prometheus, Grafana, AlertManager)
- [ ] Baseline metrics collected
- [ ] Slack channel created (#game-day-rls-YYYYMMDD)
- [ ] Rollback script ready (`migrations/0002_..._ROLLBACK.sql`)
- [ ] Test data seeded (`npm run seed:multi-tenant`)
- [ ] Communication plan confirmed
- [ ] Success criteria agreed upon

---

## Post-Game Checklist (Print This)

- [ ] All chaos scenarios reverted
- [ ] System health verified (green dashboards)
- [ ] Temporary test data cleaned up
- [ ] Results document published
- [ ] GitHub issues created for action items
- [ ] Team retrospective complete
- [ ] Runbook updated with learnings
- [ ] Next game day scheduled

---

## SQL Snippets for Quick Debugging

```sql
-- Check RLS status on all tables
SELECT
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  COUNT(p.policyname) as policy_count
FROM pg_class c
LEFT JOIN pg_policies p ON p.tablename = c.relname
WHERE c.relname IN ('funds', 'portfoliocompanies', 'investments')
GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity;

-- Check for missing indexes
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname LIKE 'idx_%_org%';

-- Top 10 slowest queries
SELECT
  query,
  calls,
  mean_exec_time,
  max_exec_time,
  stddev_exec_time
FROM pg_stat_statements
WHERE query LIKE '%current_org_id()%'
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check for orphaned records (data integrity)
SELECT
  'Orphaned portfoliocompanies' as check_name,
  COUNT(*) as count
FROM portfoliocompanies pc
LEFT JOIN funds f ON pc.fund_id = f.id
WHERE f.id IS NULL
UNION ALL
SELECT
  'Org mismatch portfoliocompanies',
  COUNT(*)
FROM portfoliocompanies pc
JOIN funds f ON pc.fund_id = f.id
WHERE pc.organization_id != f.organization_id;
```

---

## Common Prometheus Queries

```promql
# RLS context missing rate
rate(rls_context_missing_total[5m])

# Query latency p95
histogram_quantile(0.95, rate(pg_query_duration_seconds_bucket[5m]))

# Connection pool utilization
pgbouncer_pools_client_active / pgbouncer_pools_client_maxwait

# Stale RLS context count
pg_stat_activity_stale_rls_context

# Alert firing count
ALERTS{severity="critical"}
```

---

## Decision Trees

### Is this a security incident?

```
Data visible across orgs?
  YES → P0 INCIDENT
    1. Revoke DB access
    2. Page security lead
    3. Initiate incident response
  NO → Continue investigation
```

### Should I rollback?

```
Can reproduce bug reliably?
  YES → How severe?
    CRITICAL (data leak) → Rollback immediately
    HIGH (performance) → Try fix first, rollback if no progress in 15min
    MEDIUM → Fix in place
  NO → Investigate more, don't rollback yet
```

### Is this alert real or false positive?

```
Check metric in Grafana over last 7 days
  Spike is abnormal → Real alert, investigate
  Spike is normal → False positive, tune threshold
  Can't tell → Escalate to on-call
```

---

## Key Files

| File | Purpose | Location |
|------|---------|----------|
| Chaos Plan | 20 failure scenarios | `docs/chaos-engineering/RLS-CHAOS-TESTING-PLAN.md` |
| Game Day Runbook | 3-4 hour exercise | `docs/chaos-engineering/RLS-GAME-DAY-RUNBOOK.md` |
| Monitoring Specs | Alerts & dashboards | `docs/chaos-engineering/RLS-MONITORING-SPECS.md` |
| Test Suite | Automated tests | `tests/chaos/rls-chaos-suite.test.ts` |
| Rollback Script | Disable RLS | `migrations/0002_multi_tenant_rls_setup_ROLLBACK.sql` |
| Migration Script | Enable RLS | `migrations/0002_multi_tenant_rls_setup.sql` |

---

## Remember

1. **Safety First**: Always have rollback ready before chaos experiment
2. **Fail Closed**: System should return zero data if context missing
3. **Zero Tolerance**: Any cross-tenant leak is P0 incident
4. **Document Everything**: Scribe records timeline, observations, decisions
5. **Learn and Improve**: Every Game Day should yield action items

---

**Keep Calm and Test Chaos**

*For full documentation, see: `docs/chaos-engineering/README.md`*
