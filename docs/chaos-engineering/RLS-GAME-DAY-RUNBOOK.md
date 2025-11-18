# Multi-Tenant RLS Game Day Runbook

**Event Type**: Chaos Engineering Exercise
**Duration**: 3-4 hours
**Frequency**: Monthly (staging), Quarterly (production)
**Last Updated**: 2025-11-11

## Pre-Game Checklist (T-24h)

### Team Assembly

- [ ] **Incident Commander**: Coordinates exercise, calls shots
- [ ] **Database Engineer**: Executes chaos scenarios, monitors DB health
- [ ] **Backend Engineer**: Monitors application behavior, API responses
- [ ] **Observability Lead**: Watches dashboards, validates alerts
- [ ] **Scribe**: Documents timeline, observations, action items

### Environment Preparation

- [ ] **Backup Validation**
  ```bash
  # Verify recent backup exists
  aws s3 ls s3://updog-backups/staging/ --recursive | tail -5

  # Test restore to ephemeral environment
  ./scripts/test-restore-from-backup.sh
  ```

- [ ] **Monitoring Health Check**
  ```bash
  # Verify Prometheus is scraping
  curl http://prometheus:9090/-/healthy

  # Verify Grafana dashboards are loading
  curl http://grafana:3000/api/health

  # Verify alert manager is up
  curl http://alertmanager:9093/-/healthy
  ```

- [ ] **Baseline Metrics Collection**
  ```sql
  -- Capture baseline performance
  SELECT
    schemaname,
    tablename,
    seq_scan,
    seq_tup_read,
    idx_scan,
    idx_tup_fetch,
    n_tup_ins,
    n_tup_upd,
    n_tup_del
  INTO baseline_stats_$(date +%Y%m%d)
  FROM pg_stat_user_tables;

  -- Capture query performance baseline
  SELECT * FROM pg_stat_statements
  ORDER BY mean_exec_time DESC
  LIMIT 20;
  ```

- [ ] **Slack Channel Setup**
  - Create dedicated channel: `#game-day-rls-YYYYMMDD`
  - Invite all participants
  - Pin runbook link and dashboard links

- [ ] **Rollback Plan Ready**
  ```bash
  # Pre-stage rollback script
  cat migrations/0002_multi_tenant_rls_setup_ROLLBACK.sql

  # Verify rollback is executable
  psql $DATABASE_URL --dry-run -f migrations/0002_multi_tenant_rls_setup_ROLLBACK.sql
  ```

- [ ] **Test Data Seeded**
  ```bash
  # Seed multi-tenant test data
  npm run seed:multi-tenant

  # Verify 2+ organizations exist
  psql $DATABASE_URL -c "SELECT COUNT(*) FROM organizations;"
  ```

- [ ] **Communication Plan**
  - [ ] Notify stakeholders of planned exercise
  - [ ] Update status page (if staging affects demos)
  - [ ] Prepare incident response escalation tree

### Success Criteria Definition

Before starting, agree on what "pass" looks like:

- [ ] **Zero cross-tenant data leakage** across all scenarios
- [ ] **All critical alerts fire** within defined thresholds
- [ ] **MTTR < 5 minutes** for automated recovery scenarios
- [ ] **No production impact** (if running in production)
- [ ] **Rollback completes** in < 10 minutes if needed

---

## Game Day Timeline (3-4 hours)

### Phase 1: Kickoff (T+0min, 15min)

**Incident Commander Actions**:

1. **Open Kickoff Call**
   - Introduce all participants and roles
   - Review objectives and success criteria
   - Confirm backup/rollback readiness
   - Establish communication protocol

2. **Baseline Verification**
   ```bash
   # Check system health
   ./scripts/health-check.sh

   # Verify RLS is enabled
   psql $DATABASE_URL -c "SELECT * FROM verify_rls_setup();"
   ```

3. **Start Recording**
   - Document start time
   - Begin screen recording (optional)
   - Start metrics collection

**Go/No-Go Decision**: All participants confirm readiness

---

### Phase 2: RLS Context Failure Scenarios (T+15min, 45min)

#### Scenario 6: Missing RLS Context (15 minutes)

**Executor**: Backend Engineer

**Steps**:
```typescript
// 1. Deploy code with intentional bug (middleware bypass)
git checkout chaos/missing-rls-context

// 2. Restart application
npm run build && pm2 restart api

// 3. Send test request
curl -H "Authorization: Bearer $TEST_TOKEN" \
  http://localhost:5000/api/funds

// Expected: Zero funds returned (fail-closed)
```

**Observers Monitor**:
- [ ] Alert fires: `QueriesWithoutRLSContext`
- [ ] Application logs: "Missing RLS context" warning
- [ ] Database logs: Query with current_org_id() = '00000000-...'
- [ ] Response: Empty array `[]`

**Success Criteria**:
- [ ] No data returned (fail-closed behavior)
- [ ] Alert fired within 2 minutes
- [ ] No cross-tenant data visible

**Rollback**:
```bash
git checkout main
pm2 restart api
```

**Timeline**: 15 minutes (5min execute, 5min observe, 5min document)

---

#### Scenario 8: Transaction Rollback (15 minutes)

**Executor**: Database Engineer

**Steps**:
```typescript
// 1. Inject artificial error mid-request
// tests/chaos/inject-error.ts
app.post('/api/funds', withRLSTransaction(), async (req, res) => {
  await req.pgClient.query("SET LOCAL app.current_org = $1", [req.context.orgId]);

  // Inject error
  throw new Error('CHAOS: Simulated failure');

  // Query below never executes
  const funds = await db.select().from(fundsTable);
  res.json(funds);
});

// 2. Send request
curl -X POST -H "Authorization: Bearer $TEST_TOKEN" \
  http://localhost:5000/api/funds
```

**Observers Monitor**:
- [ ] Middleware logs: "Transaction rolled back"
- [ ] Connection returned to pool
- [ ] Next request succeeds with clean context

**Success Criteria**:
- [ ] Rollback executed automatically
- [ ] No stale context in pool
- [ ] Subsequent requests succeed

**Timeline**: 15 minutes

---

#### Scenario 9: Stale Context in Pool (15 minutes)

**Executor**: Database Engineer

**Steps**:
```bash
# 1. Verify PgBouncer server_reset_query
psql -h pgbouncer -p 6432 -U pgbouncer pgbouncer -c "SHOW CONFIG;"
# Look for: server_reset_query = DISCARD ALL

# 2. Simulate connection reuse
psql -h pgbouncer -p 6432 <<SQL
BEGIN;
SET LOCAL app.current_org = 'org-1';
COMMIT;

-- Connection returns to pool, should reset

BEGIN;
SELECT current_setting('app.current_org', true); -- Should be empty
COMMIT;
SQL
```

**Observers Monitor**:
- [ ] Context cleared after DISCARD ALL
- [ ] PgBouncer stats show connection reuse
- [ ] No session variable leakage

**Success Criteria**:
- [ ] Context reset confirmed
- [ ] No cross-connection pollution

**Timeline**: 15 minutes

---

### Phase 3: Performance Degradation (T+60min, 30min)

#### Scenario 10: RLS Overhead (10 minutes)

**Executor**: Database Engineer

**Steps**:
```bash
# Run performance benchmark
npm test -- tests/chaos/rls-chaos-suite.test.ts -t "Performance Benchmarks"

# Monitor query times
psql $DATABASE_URL <<SQL
SELECT
  query,
  calls,
  mean_exec_time,
  stddev_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE query LIKE '%current_org_id()%'
ORDER BY mean_exec_time DESC
LIMIT 10;
SQL
```

**Observers Monitor**:
- [ ] p95 latency < 5ms for simple queries
- [ ] p95 latency < 20ms for list queries
- [ ] No sequential scans on large tables

**Success Criteria**:
- [ ] All benchmarks pass performance targets
- [ ] Query plans use indexes

**Timeline**: 10 minutes

---

#### Scenario 11: Missing Indexes (20 minutes)

**Executor**: Database Engineer

**Steps**:
```sql
-- 1. Drop index to simulate missing optimization
DROP INDEX CONCURRENTLY idx_funds_org_id;

-- 2. Run query and observe performance
EXPLAIN ANALYZE
SELECT * FROM funds
WHERE organization_id = current_org_id()
LIMIT 50;

-- 3. Observe sequential scan
-- 4. Recreate index
CREATE INDEX CONCURRENTLY idx_funds_org_id ON funds(organization_id, id);

-- 5. Re-run query
EXPLAIN ANALYZE
SELECT * FROM funds
WHERE organization_id = current_org_id()
LIMIT 50;
```

**Observers Monitor**:
- [ ] Alert fires: `HighSequentialScans`
- [ ] Query time increases significantly
- [ ] After index: Query uses index scan

**Success Criteria**:
- [ ] Performance degrades without index
- [ ] Alert fires within 10 minutes
- [ ] Performance restored after index creation

**Timeline**: 20 minutes

---

### Phase 4: Security Breach Simulations (T+90min, 30min)

#### Scenario 14: SQL Injection Attempt (10 minutes)

**Executor**: Backend Engineer

**Steps**:
```bash
# 1. Send malicious request
curl -X GET \
  -H "X-Org-ID: '; DROP TABLE funds; --" \
  http://localhost:5000/api/funds

# Expected: 400 Bad Request (invalid UUID)
```

**Observers Monitor**:
- [ ] Request rejected with 400
- [ ] Audit log entry: "SQL injection attempt"
- [ ] No database changes

**Success Criteria**:
- [ ] Attack blocked by input validation
- [ ] Database integrity preserved

**Timeline**: 10 minutes

---

#### Scenario 15: Org Override Attempt (10 minutes)

**Executor**: Backend Engineer

**Steps**:
```bash
# 1. Attempt to override org context
curl -X GET \
  -H "Authorization: Bearer $ORG_A_TOKEN" \
  -H "X-Org-Override: org-b-id" \
  http://localhost:5000/api/funds

# Expected: See only org-a funds (override ignored)
```

**Observers Monitor**:
- [ ] Override header ignored
- [ ] RLS context derived from token only
- [ ] Audit log: "Org override attempt"

**Success Criteria**:
- [ ] No cross-tenant access
- [ ] Override attempt logged

**Timeline**: 10 minutes

---

#### Scenario 17: Admin Wrong Context (10 minutes)

**Executor**: Database Engineer

**Steps**:
```bash
# 1. Admin sets context to org-a
psql $DATABASE_URL <<SQL
SELECT switch_tenant('tech-ventures');

-- 2. Accidentally run bulk update
UPDATE funds SET status = 'archived' WHERE vintage_year < 2020;

-- 3. Check impact (should only affect tech-ventures)
SELECT organization_id, COUNT(*) FROM funds WHERE status = 'archived' GROUP BY 1;
SQL
```

**Observers Monitor**:
- [ ] Update only affects tech-ventures org
- [ ] Other orgs unaffected
- [ ] Audit log shows update with org context

**Success Criteria**:
- [ ] RLS prevented cross-org update
- [ ] Only intended org modified

**Timeline**: 10 minutes

---

### Phase 5: Migration Rollback (T+120min, 30min)

#### Scenario 18: RLS Rollback (30 minutes)

**Executor**: Database Engineer

**Steps**:
```bash
# 1. Capture pre-rollback state
psql $DATABASE_URL <<SQL
SELECT COUNT(*) FROM funds;
SELECT COUNT(*) FROM portfoliocompanies;
SELECT COUNT(*) FROM investments;

-- Save to file
\o /tmp/pre-rollback-counts.txt
SELECT 'funds', COUNT(*) FROM funds UNION ALL
SELECT 'portfoliocompanies', COUNT(*) FROM portfoliocompanies UNION ALL
SELECT 'investments', COUNT(*) FROM investments;
\o
SQL

# 2. Execute rollback
time psql $DATABASE_URL -f migrations/0002_multi_tenant_rls_setup_ROLLBACK.sql

# 3. Verify data integrity
psql $DATABASE_URL <<SQL
-- Check row counts unchanged
SELECT 'funds', COUNT(*) FROM funds UNION ALL
SELECT 'portfoliocompanies', COUNT(*) FROM portfoliocompanies UNION ALL
SELECT 'investments', COUNT(*) FROM investments;

-- Check for orphaned records
SELECT COUNT(*) FROM portfoliocompanies pc
LEFT JOIN funds f ON pc.fund_id = f.id
WHERE f.id IS NULL;
SQL

# 4. Run application smoke tests
npm run test:smoke

# 5. Re-apply RLS migration
psql $DATABASE_URL -f migrations/0002_multi_tenant_rls_setup.sql
```

**Observers Monitor**:
- [ ] Rollback completes in < 10 minutes
- [ ] Row counts preserved
- [ ] No foreign key violations
- [ ] Application continues to function
- [ ] Re-apply succeeds

**Success Criteria**:
- [ ] Rollback time < 10 minutes
- [ ] Zero data loss
- [ ] Zero integrity violations
- [ ] Re-migration succeeds

**Timeline**: 30 minutes

---

### Phase 6: Concurrency Stress Test (T+150min, 30min)

**Executor**: Backend Engineer + Database Engineer

**Steps**:
```bash
# 1. Generate concurrent load
npm test -- tests/chaos/rls-chaos-suite.test.ts -t "Concurrency"

# 2. Monitor connection pool
watch -n 1 'psql $DATABASE_URL -c "SELECT state, COUNT(*) FROM pg_stat_activity GROUP BY state;"'

# 3. Check for context leakage
psql $DATABASE_URL <<SQL
-- Monitor for stale RLS context
SELECT
  pid,
  usename,
  state,
  current_setting('app.current_org', true) as org_context
FROM pg_stat_activity
WHERE state = 'idle'
AND current_setting('app.current_org', true) IS NOT NULL;
SQL
```

**Observers Monitor**:
- [ ] No context leakage across connections
- [ ] Connection pool saturation handled gracefully
- [ ] Error rate remains < 0.1%

**Success Criteria**:
- [ ] 50 concurrent queries succeed
- [ ] No cross-tenant data access
- [ ] Pool exhaustion handled properly

**Timeline**: 30 minutes

---

### Phase 7: Wrap-Up (T+180min, 30min)

**Incident Commander Actions**:

1. **Verify System Health**
   ```bash
   # Run full health check
   ./scripts/health-check.sh

   # Verify no lingering issues
   psql $DATABASE_URL -c "SELECT * FROM verify_rls_setup();"

   # Check for stale connections
   psql $DATABASE_URL -c "SELECT state, COUNT(*) FROM pg_stat_activity GROUP BY state;"
   ```

2. **Collect Metrics**
   - Export Grafana dashboard screenshots
   - Save Prometheus query results
   - Archive logs from exercise

3. **Team Retrospective** (20 minutes)
   - What worked well?
   - What surprised us?
   - What should we improve?
   - New risks discovered?
   - Action items for next sprint

4. **Document Outcomes**
   - Update `CHAOS-GAME-DAY-RESULTS-YYYYMMDD.md`
   - File GitHub issues for improvements
   - Update this runbook with lessons learned

---

## Success Metrics Report Template

```markdown
# RLS Game Day Results - YYYY-MM-DD

## Executive Summary
- **Environment**: Staging / Production
- **Duration**: X hours
- **Scenarios Tested**: X of 20
- **Success Rate**: X%
- **Critical Issues Found**: X
- **Action Items Created**: X

## Test Results

| Scenario | Result | MTTR | Notes |
|----------|--------|------|-------|
| 6. Missing Context | PASS | 0s | Fail-closed as expected |
| 8. Rollback | PASS | Immediate | Middleware handled correctly |
| 9. Stale Context | PASS | 0s | DISCARD ALL working |
| 10. RLS Overhead | PASS | N/A | p95 < 5ms |
| 11. Missing Index | PASS | 3min | Alert fired, index created |
| 14. SQL Injection | PASS | 0s | Blocked by validation |
| 15. Org Override | PASS | 0s | Override ignored |
| 17. Wrong Context | PASS | 0s | RLS prevented cross-org |
| 18. Rollback | PASS | 8min | Data integrity preserved |
| Concurrency | PASS | N/A | No context leakage |

## Alert Performance

| Alert | Expected | Actual | Status |
|-------|----------|--------|--------|
| QueriesWithoutRLSContext | 2min | 1.5min | PASS |
| StaleRLSContext | 30s | 25s | PASS |
| SlowRLSQueries | 5min | 7min | NEEDS TUNING |
| HighSequentialScans | 10min | 8min | PASS |

## Critical Findings

1. [Finding description]
   - **Severity**: Critical/High/Medium/Low
   - **Impact**: [Description]
   - **Mitigation**: [Action taken]
   - **Follow-up**: [GitHub issue link]

## Action Items

- [ ] Issue #XXX: Tune SlowRLSQueries alert threshold
- [ ] Issue #XXX: Add automated index verification to CI
- [ ] Issue #XXX: Improve stale context detection
- [ ] Update runbook with new scenario: [description]

## Team Feedback

**What Went Well**:
- Automated rollback worked perfectly
- Team coordination was excellent
- Monitoring caught all failures

**What Needs Improvement**:
- Alert tuning (false positives on X)
- Documentation of Y scenario
- Need better automated recovery for Z

## Recommendations

1. [Recommendation 1]
2. [Recommendation 2]
3. [Recommendation 3]

---

**Next Game Day**: YYYY-MM-DD
**Signed**: [Incident Commander Name]
```

---

## Emergency Procedures

### Full Rollback (Last Resort)

```bash
#!/bin/bash
# emergency-rls-rollback.sh

set -e

echo "EMERGENCY RLS ROLLBACK - This will disable RLS"
read -p "Type 'ROLLBACK' to confirm: " confirm
if [ "$confirm" != "ROLLBACK" ]; then
  echo "Aborted"
  exit 1
fi

# 1. Backup current state
pg_dump $DATABASE_URL > /tmp/emergency-backup-$(date +%Y%m%d_%H%M%S).sql

# 2. Execute rollback
psql $DATABASE_URL -f migrations/0002_multi_tenant_rls_setup_ROLLBACK.sql

# 3. Restart application (clear connection pool)
pm2 restart api

# 4. Verify health
./scripts/health-check.sh

echo "Rollback complete. Review /tmp/emergency-backup-*.sql"
```

### Stop All Traffic

```bash
# Option 1: HAProxy drain
echo "set server api_backend/server1 state drain" | \
  socat stdio /var/run/haproxy.sock

# Option 2: Firewall block
iptables -A INPUT -p tcp --dport 5000 -j DROP

# Option 3: Application shutdown
pm2 stop api
```

### Contact Tree

1. **On-Call Engineer** → Slack: @oncall, Phone: +1-XXX-XXX-XXXX
2. **Database Lead** → Slack: @db-lead, Phone: +1-XXX-XXX-XXXX
3. **Engineering Manager** → Slack: @eng-manager, Phone: +1-XXX-XXX-XXXX
4. **CTO** → (only if P0 data breach) Phone: +1-XXX-XXX-XXXX

---

## Post-Game Checklist

- [ ] All chaos scenarios reverted
- [ ] System health verified (green dashboards)
- [ ] Temporary test data cleaned up
- [ ] Slack channel archived
- [ ] Results document published
- [ ] GitHub issues created for action items
- [ ] Team retrospective complete
- [ ] Runbook updated with learnings
- [ ] Next game day scheduled

---

## Appendix: Quick Reference Commands

### Health Checks

```bash
# RLS status
psql $DATABASE_URL -c "SELECT * FROM verify_rls_setup();"

# Connection pool
psql $DATABASE_URL -c "SELECT state, COUNT(*) FROM pg_stat_activity GROUP BY state;"

# Query performance
psql $DATABASE_URL -c "SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"

# Index usage
psql $DATABASE_URL -c "SELECT schemaname, tablename, indexname, idx_scan FROM pg_stat_user_indexes WHERE schemaname = 'public' ORDER BY idx_scan;"
```

### Monitoring URLs

- Grafana: http://grafana:3000/d/rls-dashboard
- Prometheus: http://prometheus:9090/alerts
- AlertManager: http://alertmanager:9093

### Log Locations

- Application: `/var/log/updog/api.log`
- PostgreSQL: `/var/log/postgresql/postgresql-14-main.log`
- PgBouncer: `/var/log/pgbouncer/pgbouncer.log`
