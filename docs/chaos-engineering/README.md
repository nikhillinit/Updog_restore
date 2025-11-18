# Multi-Tenant RLS Chaos Engineering Documentation

**Status**: Production-Ready
**Owner**: Platform Engineering
**Last Updated**: 2025-11-11

## Overview

This directory contains comprehensive chaos engineering documentation for validating PostgreSQL Row-Level Security (RLS) resilience in our multi-tenant venture capital fund modeling platform.

**Zero-tolerance policy**: Given the financial nature of LP data, we enforce **absolute zero cross-tenant data leakage** under all failure conditions.

---

## Quick Links

| Document | Purpose | Audience |
|----------|---------|----------|
| [RLS-CHAOS-TESTING-PLAN.md](RLS-CHAOS-TESTING-PLAN.md) | 20 failure scenarios with reproduction steps | Engineers, Architects |
| [RLS-GAME-DAY-RUNBOOK.md](RLS-GAME-DAY-RUNBOOK.md) | Structured 3-4 hour chaos exercise | Incident Commander, Team Leads |
| [RLS-MONITORING-SPECS.md](RLS-MONITORING-SPECS.md) | Alerts, metrics, and dashboards | SRE, DevOps, Database Engineers |

---

## Document Structure

### 1. Chaos Testing Plan

**File**: `RLS-CHAOS-TESTING-PLAN.md`

Comprehensive catalog of 20 failure scenarios across 5 categories:

1. **Migration Failure Scenarios** (5 scenarios)
   - Mid-backfill crashes
   - Network partitions during migration
   - Connection pool exhaustion
   - Disk space issues
   - Replication lag

2. **RLS Context Failure Scenarios** (4 scenarios)
   - Missing context (middleware bug)
   - Invalid JWT tokens
   - Transaction rollback context loss
   - Connection pool stale context

3. **Performance Degradation Scenarios** (4 scenarios)
   - RLS overhead exceeding targets
   - Missing compound indexes
   - Query planner suboptimal plans
   - Connection pool saturation

4. **Security Breach Scenarios** (4 scenarios)
   - SQL injection attempts
   - Compromised API keys
   - Direct database access
   - Admin wrong-context errors

5. **Rollback Testing Scenarios** (3 scenarios)
   - Rollback after 1 hour operation
   - Rollback during peak traffic
   - Data corruption detection

**Key Features**:
- Step-by-step reproduction instructions
- Expected vs actual behavior
- Detection mechanisms (SQL, logs, metrics)
- Recovery procedures with MTTR estimates
- Summary matrix with severity and auto-recovery status

**Use Cases**:
- Design new failure scenarios
- Reference detection patterns
- Estimate recovery times
- Plan chaos experiments

---

### 2. Game Day Runbook

**File**: `RLS-GAME-DAY-RUNBOOK.md`

Structured 3-4 hour chaos exercise with detailed timeline:

**Pre-Game Checklist (T-24h)**:
- Team assembly (5 roles: IC, DBA, Backend, Observability, Scribe)
- Environment preparation
- Backup validation
- Monitoring health checks
- Baseline metrics collection
- Communication plan

**Game Day Timeline**:
- **Phase 1**: Kickoff (15min)
- **Phase 2**: RLS Context Failures (45min) - Scenarios 6, 8, 9
- **Phase 3**: Performance Degradation (30min) - Scenarios 10, 11
- **Phase 4**: Security Simulations (30min) - Scenarios 14, 15, 17
- **Phase 5**: Migration Rollback (30min) - Scenario 18
- **Phase 6**: Concurrency Stress (30min)
- **Phase 7**: Wrap-Up & Retrospective (30min)

**Emergency Procedures**:
- Full rollback script
- Traffic stop mechanisms
- Contact escalation tree

**Post-Game Checklist**:
- Health verification
- Results documentation
- GitHub issue creation
- Runbook updates

**Key Features**:
- Detailed role definitions
- Go/No-Go decision gates
- Success criteria for each scenario
- Results report template
- Emergency contact tree

**Use Cases**:
- Coordinate chaos exercises
- Train new team members
- Validate alert delivery
- Practice incident response

---

### 3. Monitoring & Alerting Specifications

**File**: `RLS-MONITORING-SPECS.md`

Production-ready monitoring configuration:

**Alert Categories**:
1. **Critical Alerts** (4 alerts, immediate action)
   - CrossTenantDataLeakage
   - QueriesWithoutRLSContext
   - StaleRLSContext
   - RLSDisabledOnTable

2. **Warning Alerts** (5 alerts, investigate within 1hr)
   - SlowRLSQueries
   - HighSequentialScans
   - ConnectionPoolSaturation
   - HighRollbackRate
   - MissingRLSIndex

3. **Informational Metrics** (5 metrics, trend tracking)
   - RLS query performance trends
   - Organization growth tracking
   - Per-tenant query volume
   - Index usage statistics
   - RLS policy evaluation count

**Grafana Dashboards**:
- RLS Context Health panel
- Query Performance by Organization
- RLS Policy Violations heatmap
- Connection Pool Utilization
- Index Usage vs Sequential Scans

**Custom Exporters**:
- Python-based RLS exporter (port 9200)
- Collects RLS-specific metrics
- Systemd service configuration
- Prometheus scrape config

**Alert Fatigue Prevention**:
- Dynamic thresholds (3-sigma deviation)
- Alert grouping by organization/table
- Time-based routing (business hours vs off-hours)
- Auto-resolution for transient issues
- Maintenance window suppression

**Key Features**:
- Complete Prometheus queries
- AlertManager routing rules
- Slack/PagerDuty integration
- Escalation policy matrix
- Alert priority matrix

**Use Cases**:
- Deploy monitoring infrastructure
- Configure alert routing
- Test alert delivery
- Reduce false positives
- Track performance trends

---

## Automated Test Suite

**File**: `tests/chaos/rls-chaos-suite.test.ts`

Vitest-based test suite with automated failure injection:

**Test Suites**:
1. **RLS Context Failures** (3 tests)
   - Missing context returns zero rows
   - Empty string context uses fail-closed UUID
   - NULL context prevents cross-tenant access

2. **Transaction Rollback** (2 tests)
   - Context lost after explicit rollback
   - No context leak across transactions

3. **Connection Pool Stale Context** (2 tests)
   - DISCARD ALL resets context
   - No leak between pool connections

4. **RLS Performance** (2 tests)
   - Simple query < 5ms p95
   - Index scan used for org-filtered queries

5. **SQL Injection** (2 tests)
   - Invalid UUID format rejected
   - Parameterized queries enforced

6. **Data Integrity** (2 tests)
   - Data preserved after RLS disable
   - Foreign key consistency verified

7. **Data Corruption Detection** (3 tests)
   - No NULL organization_id values
   - RLS enabled on all tables
   - RLS policies exist

**Performance Benchmarks**:
- Simple SELECT by ID (1000 iterations)
- Org-filtered list query (100 iterations)
- Complex join query (50 iterations)

**Concurrency Stress Tests**:
- 50 concurrent queries (no context leakage)
- Connection pool saturation (graceful degradation)

**Usage**:
```bash
# Run full chaos suite
npm test -- tests/chaos/rls-chaos-suite.test.ts

# Run specific suite
npm test -- tests/chaos/rls-chaos-suite.test.ts -t "Performance"

# Run with coverage
npm test -- tests/chaos/rls-chaos-suite.test.ts --coverage
```

**Key Features**:
- Realistic failure reproduction
- Automated verification
- Performance benchmarking
- Concurrency stress testing
- PostgreSQL connection management

**Use Cases**:
- CI/CD integration
- Pre-deployment validation
- Regression testing
- Performance baselines

---

## Getting Started

### Step 1: Review Documentation (30 minutes)

```bash
# Read in order:
1. RLS-CHAOS-TESTING-PLAN.md    # Understand failure scenarios
2. RLS-GAME-DAY-RUNBOOK.md      # Learn exercise structure
3. RLS-MONITORING-SPECS.md      # Deploy monitoring
```

### Step 2: Run Automated Tests (15 minutes)

```bash
# Ensure database is running
docker compose up -d postgres

# Run chaos test suite
npm test -- tests/chaos/rls-chaos-suite.test.ts

# Expected: All tests pass (PASS status)
```

### Step 3: Deploy Monitoring (1 hour)

```bash
# 1. Deploy custom RLS exporter
sudo cp scripts/exporters/rls-exporter.py /opt/updog/scripts/exporters/
sudo cp scripts/exporters/rls-exporter.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start rls-exporter
sudo systemctl enable rls-exporter

# 2. Update Prometheus config
sudo nano /etc/prometheus/prometheus.yml
# Add scrape config from RLS-MONITORING-SPECS.md
sudo systemctl reload prometheus

# 3. Import Grafana dashboard
curl -X POST http://admin:admin@localhost:3000/api/dashboards/db \
  -H "Content-Type: application/json" \
  -d @dashboards/rls-monitoring.json

# 4. Configure AlertManager
sudo nano /etc/alertmanager/alertmanager.yml
# Add routing rules from RLS-MONITORING-SPECS.md
sudo systemctl reload alertmanager
```

### Step 4: Schedule First Game Day (1 week out)

```bash
# 1. Create Slack channel
# 2. Invite team (IC, DBA, Backend, Observability, Scribe)
# 3. Share RLS-GAME-DAY-RUNBOOK.md
# 4. Assign roles
# 5. Confirm date/time (3-4 hour block)
# 6. Send calendar invites with Zoom link
```

---

## Integration with CI/CD

### Pre-Deployment Validation

Add to `.github/workflows/deploy.yml`:

```yaml
- name: Run RLS Chaos Tests
  run: npm test -- tests/chaos/rls-chaos-suite.test.ts
  env:
    DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}

- name: Performance Benchmarks
  run: npm test -- tests/chaos/rls-chaos-suite.test.ts -t "Performance"

- name: Verify RLS Configuration
  run: |
    psql $DATABASE_URL -c "SELECT * FROM verify_rls_setup();"
```

### Post-Deployment Smoke Tests

```yaml
- name: RLS Smoke Tests
  run: |
    # Verify RLS enabled
    psql $DATABASE_URL -c "SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'funds';"

    # Check for missing indexes
    psql $DATABASE_URL -c "SELECT tablename FROM pg_indexes WHERE indexname LIKE 'idx_%_org_id';"

    # Validate alert firing
    curl http://alertmanager:9093/api/v2/alerts | jq '.[] | select(.labels.severity == "critical")'
```

---

## Frequency Recommendations

| Activity | Staging | Production | Duration |
|----------|---------|------------|----------|
| Automated Tests | Every PR | Every deploy | 5 min |
| Game Day Exercise | Monthly | Quarterly | 3-4 hours |
| Alert Review | Weekly | Weekly | 30 min |
| Dashboard Review | Daily | Daily | 10 min |
| Runbook Updates | After each Game Day | After each Game Day | 1 hour |

---

## Success Metrics

Track these KPIs over time:

1. **Security**:
   - Cross-tenant leakage incidents: **Target: 0**
   - RLS policy violations: **Target: 0**
   - Failed injection attempts blocked: **Target: 100%**

2. **Performance**:
   - RLS query p95 latency: **Target: < 10ms**
   - Index usage ratio: **Target: > 95%**
   - Connection pool utilization: **Target: < 80%**

3. **Resilience**:
   - MTTR for automated scenarios: **Target: < 5 min**
   - Manual recovery MTTR: **Target: < 10 min**
   - Alert accuracy: **Target: > 95%**

4. **Team Readiness**:
   - Game Day completion rate: **Target: 100%**
   - Action items closed within sprint: **Target: > 80%**
   - Team confidence score (1-5): **Target: > 4.0**

---

## Contributing

### Adding New Scenarios

1. **Document in Chaos Testing Plan**:
   ```markdown
   ### Scenario X: [Title]
   **Description**: [What fails]
   **Reproduction Steps**: [How to reproduce]
   **Expected Behavior**: [What should happen]
   **Detection**: [How to detect]
   **Recovery**: [How to fix]
   **MTTR**: [Time estimate]
   ```

2. **Add to Automated Test Suite**:
   ```typescript
   describe('Scenario X: [Title]', () => {
     it('should [expected behavior]', async () => {
       // Setup
       // Execute failure
       // Assert expected behavior
       // Cleanup
     });
   });
   ```

3. **Update Game Day Runbook**:
   - Add to appropriate phase
   - Define timeline (10-15 min)
   - Specify observers and success criteria

4. **Configure Alerts** (if needed):
   - Add Prometheus query
   - Define alert rule
   - Update monitoring specs

### Updating Runbooks

After each Game Day:

1. **Document surprises** in "Lessons Learned" section
2. **Update timelines** based on actual duration
3. **Add new commands** discovered during exercise
4. **Revise success criteria** if needed
5. **File GitHub issues** for improvements

---

## FAQ

**Q: How often should we run chaos experiments?**
A: Monthly in staging (automated + Game Day), quarterly in production (Game Day only).

**Q: What if we find a critical vulnerability during Game Day?**
A: Stop exercise, execute emergency rollback, initiate security incident response.

**Q: Can we run chaos tests in production?**
A: Only after 3 successful staging Game Days. Use blast radius controls (1% traffic, canary org).

**Q: How do we know if RLS is working correctly?**
A: Run automated test suite + verify zero cross-tenant leakage in logs + check alerts.

**Q: What's the rollback time if RLS fails?**
A: < 10 minutes for full rollback to pre-RLS state (automated via migration script).

**Q: How do we test without affecting customers?**
A: Use dedicated test organizations, feature flags, and staged rollout (staging → canary → production).

---

## Support

- **Slack**: #platform-engineering
- **On-Call**: @platform-oncall
- **Documentation**: https://wiki.updog.com/rls-chaos
- **Runbooks**: https://wiki.updog.com/runbooks/

---

## References

- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Principles of Chaos Engineering](https://principlesofchaos.org/)
- [Google SRE Book - Testing for Reliability](https://sre.google/sre-book/testing-reliability/)
- [Netflix Chaos Monkey](https://netflix.github.io/chaosmonkey/)
- [Project Documentation](../RLS-DEVELOPMENT-GUIDE.md)
- [Database Infrastructure](../database/MULTI-TENANT-RLS-INFRASTRUCTURE.md)

---

**Last Updated**: 2025-11-11
**Version**: 1.0.0
**Status**: Production-Ready
