# Stage Validation v3 Enhancements

**Supplement to**: `docs/runbooks/stage-validation.md` **Version**: 3.0
**Date**: 2025-10-30 **Status**: Implementation Complete

This document describes the v3 enhancements to the stage validation rollout
strategy, including new phases, feature flags, shadow mode, and adaptive
alerting.

---

## Quick Reference: New Phases

| Phase   | Mode                       | Duration       | Key Feature                       |
| ------- | -------------------------- | -------------- | --------------------------------- |
| **2.1** | warn                       | 24-48h staging | Baseline bootstrap                |
| **2.4** | warn                       | 1-2h           | Index creation                    |
| **2.5** | warn reads, enforce writes | 2-4 days       | DB migration + write enforcement  |
| **2.7** | warn + DRY-RUN             | 24-48h         | Shadow enforcement (blast radius) |
| **3**   | enforce @ 10%→100%         | 7-10 days      | Gradual percentage rollout        |
| **4**   | enforce @ 100%             | Ongoing        | Full enforcement                  |

---

## Feature Flag Configuration

### Environment Variables

```bash
# Core mode (legacy, still supported)
STAGE_VALIDATION_MODE=off|warn|enforce

# Phase 2.5: Enforce writes only during migration
ENFORCE_WRITE_ONLY=true

# Phase 3: Gradual percentage rollout
ENFORCEMENT_PERCENT=10  # 0-100

# Phase 2.7: Shadow mode (measure blast radius)
STAGE_VALIDATION_DRY_RUN=true
```

### Configuration File

**Location**: `server/lib/stage-validation-config.ts`

```typescript
export const PRODUCTION_CONFIG: StageValidationConfig = {
  defaultMode: 'warn',

  // Per-endpoint overrides
  endpointMode: {
    '/api/portfolio/strategies': 'enforce', // Phase 3
    '/api/monte-carlo/simulate': 'warn', // Phase 4
  },

  // Phase 2.5: Enforce writes, warn reads
  enforceWriteOnly: true, // Toggle via ENFORCE_WRITE_ONLY env

  // Phase 3: Gradual rollout
  enforcementPercent: 10, // 10% → 25% → 50% → 100%

  // Phase 2.7: Shadow mode
  dryRun: false, // Toggle via STAGE_VALIDATION_DRY_RUN env
};
```

### Write vs Read Classification

| Endpoint                       | Method         | Classification | Reason                           |
| ------------------------------ | -------------- | -------------- | -------------------------------- |
| `/api/portfolio/strategies`    | POST/PUT/PATCH | **WRITE**      | Persists to database             |
| `/api/monte-carlo/simulate`    | POST           | **READ**       | Pure computation, no persistence |
| `/api/funds/:fundId/companies` | GET            | **READ**       | Query only                       |
| `/api/allocations`             | POST/PUT/PATCH | **WRITE**      | Mutates database                 |

**Phase 2.5 Behavior**:

- WRITE operations: `enforce` mode (reject invalid stages)
- READ operations: `warn` mode (allow with headers)

---

## Phase 2.1: Baseline Bootstrap (NEW)

**Duration**: 24-48h in staging

**Objective**: Establish baseline metrics before production rollout

**Procedure**:

1. Deploy to staging with `STAGE_VALIDATION_MODE=warn`
2. Generate realistic traffic for 24-48 hours
3. Compute baseline from staging metrics:

   ```promql
   # Capture baseline error rate
   avg_over_time(job:stage_validation_error_ratio:rate5m[24h])

   # Capture baseline p99 latency
   avg_over_time(job:stage_normalization_p99_seconds:rate5m[24h])
   ```

4. Export baselines for production alert thresholds
5. Identify any invalid stages in staging data

**Success Criteria**:

- ✅ 24h of clean metrics collected
- ✅ Baseline error rate <1%
- ✅ Baseline p99 latency <5ms
- ✅ No service degradation

**Exit Gate**: Baseline established and exported

---

## Phase 2.4: Index Creation (NEW)

**Duration**: 1-2 hours

**Objective**: Create indexes before migration to optimize batch performance

**Procedure**:

```sql
-- 1. Create index on stage column for efficient batch filtering
CREATE INDEX CONCURRENTLY idx_portfolios_stage_unnormalized
  ON portfolios(stage)
  WHERE stage NOT IN ('pre-seed', 'seed', 'series-a', 'series-b', 'series-c', 'series-c+');

-- 2. If multi-tenant, create composite index
CREATE INDEX CONCURRENTLY idx_portfolios_fund_stage
  ON portfolios(fund_id, stage);

-- 3. Verify indexes created
SELECT
  schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE indexname LIKE '%stage%';
```

**Success Criteria**:

- ✅ Indexes created without errors
- ✅ No performance impact on production queries
- ✅ Index size reasonable (<10% of table size)

**Exit Gate**: Indexes ready for migration

---

## Phase 2.5: Database Migration + Write Enforcement (ENHANCED)

**Duration**: 2-4 days (data-gated)

**Objective**: Normalize historical data AND prevent new invalid writes

### Configuration

```bash
# Enable write-time enforcement
export ENFORCE_WRITE_ONLY=true
export STAGE_VALIDATION_MODE=warn  # Reads stay in warn
```

### Migration Script

```bash
# 1. Dry-run first (preview changes)
npx tsx scripts/normalize-stages-v2.ts --dry-run

# 2. Run migration with progress tracking
npx tsx scripts/normalize-stages-v2.ts \
  --batch-size 5000 \
  --sleep-ms 100 \
  --table portfolios

# 3. Monitor progress
psql $DATABASE_URL -c "SELECT * FROM stage_migration_progress;"

# 4. Verify integrity
npx tsx scripts/verify-migration-integrity.ts --output report.json
```

### Progress Monitoring

```sql
-- Real-time progress
SELECT * FROM stage_migration_progress;

-- Per-fund breakdown (if multi-tenant)
SELECT * FROM stage_migration_progress_by_fund;

-- Failed batches (for retry)
SELECT * FROM stage_migration_failures;
```

### Success Criteria

- ✅ 100% of batches completed successfully
- ✅ Zero data loss (pre/post row counts match)
- ✅ All stages in canonical set (verified)
- ✅ Weight sums unchanged (`|1 - sum| ≤ 1e-6`)
- ✅ No new invalid writes entering system (enforced)

**Exit Gate**: Migration verified + no new invalid writes for 24h

---

## Phase 2.7: Shadow Enforcement (NEW)

**Duration**: 24-48h (data-gated)

**Objective**: Measure enforcement blast radius without rejecting requests

### Configuration

```bash
# Enable shadow mode
export STAGE_VALIDATION_DRY_RUN=true
export STAGE_VALIDATION_MODE=warn
```

### Behavior

- Validates as if in `enforce` mode
- Emits `result="would_reject"` metric
- Sets `X-Stage-Would-Reject: true` header
- Still returns 200/201 (doesn't reject)

### Monitoring Blast Radius

```promql
# Overall would-reject rate (target: <0.5%)
sum(rate(stage_validation_validations_total{result="would_reject"}[5m]))
  / clamp_min(sum(rate(stage_validation_validations_total[5m])), 1)

# Break down by endpoint
sum(rate(stage_validation_validations_total{result="would_reject"}[5m])) by (endpoint)

# Identify problematic clients (via logs)
# grep "X-Stage-Would-Reject: true" /var/log/nginx/access.log | awk '{print $1}' | sort | uniq -c
```

### Decision Gate

**Proceed to Phase 3 if**:

- Would-reject rate <0.5% sustained for 48 hours
- No unexpected endpoints showing high rates
- Affected clients identified and contacted

**Extend Phase 2.7 if**:

- Would-reject rate >0.5%
- Large number of affected clients
- Need more time for client updates

### Example Response Headers

```http
HTTP/1.1 200 OK
X-Stage-Would-Reject: true
X-Stage-Deprecated-Variants: late-stage,growth
X-Stage-Recommendation: Fix these stages before enforcement begins. See X-Stage-Docs for migration guide.
X-Stage-Docs: https://api.your.app/docs/stage-normalization
```

---

## Phase 3: Gradual Percentage Rollout (ENHANCED)

**Duration**: 7-10 days (data-gated)

**Objective**: Enforce on increasing percentage of traffic (10% → 100%)

### Configuration Progression

```bash
# Week 1: 10% enforcement
export ENFORCEMENT_PERCENT=10

# Week 2: 25% enforcement (if <1% error rate)
export ENFORCEMENT_PERCENT=25

# Week 3: 50% enforcement (if sustained low errors)
export ENFORCEMENT_PERCENT=50

# Week 4: 100% enforcement
export ENFORCEMENT_PERCENT=100
```

### Consistent Hashing

Uses SHA-256 hash of request ID for stable routing:

- Same request ID always gets same decision
- Even distribution across traffic
- No bias toward specific users

### Canary Gate Criteria (30-Minute Promotion Window)

**Required conditions before increasing percentage:**

1. **Latency Budget**: p99 < 1ms sustained for 30 minutes

   ```promql
   histogram_quantile(0.99,
     sum by (le) (rate(stage_validation_duration_seconds_bucket[5m]))
   ) < 0.001
   ```

2. **Error Rate**: < 0.1% sustained for 30 minutes

   ```promql
   (sum(rate(stage_validation_errors_total[5m]))
     / sum(rate(stage_validation_validations_total[5m]))) < 0.001
   ```

3. **Unknown Stage Rate**: < 0.5% sustained for 30 minutes

   ```promql
   (sum(rate(stage_warn_unknown_total[5m]))
     / sum(rate(http_requests_total[5m]))) < 0.005
   ```

4. **No Active Alerts**:
   - `StageValidatorLatencyRegression` - resolved
   - `EnforceGateUnknownRateHigh` - resolved
   - `RedisModeFetchFailing` - resolved

5. **Team Approval**: Manual sign-off required before each percentage increase

**Promotion Window**: If all 5 conditions are met, you may increase percentage.
If conditions degrade within 30 minutes of increase, rollback to previous
percentage.

### Monitoring Per Percentage

```promql
# Error rate at current percentage
sum(rate(stage_validation_errors_total[5m]))
  / clamp_min(sum(rate(stage_validation_validations_total[5m])), 1)

# Enforcement coverage (what % actually enforced)
sum(rate(stage_validation_validations_total{mode="enforce"}[5m]))
  / clamp_min(sum(rate(stage_validation_validations_total[5m])), 1)
```

### Increase Criteria

**Increase percentage if**:

- Error rate <1% sustained for 48h
- No spike in support tickets
- Latency p99 stable (<5ms)
- No alert fires

**Hold/rollback if**:

- Error rate >5%
- Alert `StageValidationHighErrorRate` fires
- Latency spikes >50ms
- Customer complaints

---

## Adaptive Alerting

### Baseline Recording Rules

```promql
# Baseline error rate (24h average)
job:stage_validation_error_ratio:baseline24h =
  avg_over_time(job:stage_validation_error_ratio:rate5m[24h])

# Baseline p99 latency (24h average)
job:stage_normalization_p99_seconds:baseline24h =
  avg_over_time(job:stage_normalization_p99_seconds:rate5m[24h])
```

### Adaptive Alert Thresholds

**Formula**: `current > max(min_threshold, baseline * multiplier)`

**Example: High Error Rate**

```promql
# Alert if current > max(1%, baseline * 2)
job:stage_validation_error_ratio:rate5m
  >
  (job:stage_validation_error_ratio:baseline24h * 2) or vector(0.01)
```

**Benefits**:

- Prevents false pages from expected behavior
- Adapts to natural baseline shifts
- Still catches 2x regressions
- Minimum threshold (1%) prevents always-off

---

## New Alert: Shadow Mode Blast Radius

**Alert**: `ShadowModeBlastRadiusTooHigh`

**Condition**: `would_reject_rate > 0.5%` for 30 minutes

**Gates**: Phase 3 enforcement (must be <0.5% to proceed)

**PromQL**:

```promql
job:stage_validation_would_reject_ratio:rate5m > 0.005
```

**Response**:

1. Identify affected endpoints
2. Review X-Stage-Would-Reject headers in logs
3. Contact clients with invalid stages
4. Extend Phase 2.7 until <0.5%
5. Do NOT proceed to Phase 3

---

## Migration Rollback Procedures

### Rollback Scenarios

**Scenario 1: Migration Failed Mid-Batch**

```bash
# 1. Check last completed batch
psql $DATABASE_URL -c "SELECT * FROM stage_migration_batches WHERE status='completed' ORDER BY batch_id DESC LIMIT 1;"

# 2. Resume from next batch
npx tsx scripts/normalize-stages-v2.ts --resume

# 3. Or restore from snapshot (if catastrophic)
pg_restore -d $DATABASE_URL snapshot.dump
```

**Scenario 2: Write Enforcement Too Aggressive**

```bash
# Toggle off write enforcement, keep reads in warn
export ENFORCE_WRITE_ONLY=false

# Restart services
kubectl rollout restart deployment/api-server

# Verify mode
curl http://prometheus:9090/api/v1/query?query=stage_validation_mode
```

**Scenario 3: Full Rollback to Warn**

```bash
# Disable all enforcement
export STAGE_VALIDATION_MODE=warn
export ENFORCE_WRITE_ONLY=false
export ENFORCEMENT_PERCENT=0

# Restart
kubectl rollout restart deployment/api-server
```

---

## Quick Command Reference

### Check Current Configuration

```bash
# Via API
curl http://localhost:3333/api/deprecations | jq '.items[0].current_mode'

# Via Prometheus
curl http://prometheus:9090/api/v1/query?query=stage_validation_mode
```

### Test Shadow Mode Locally

```bash
# Set DRY-RUN mode
export STAGE_VALIDATION_DRY_RUN=true

# Send request with invalid stage
curl -i -X POST "http://localhost:3333/api/monte-carlo/simulate" \
  -H "Content-Type: application/json" \
  -d '{
    "fundId": 1,
    "runs": 1000,
    "stageDistribution": [{"stage": "invalid", "weight": 1.0}]
  }'

# Should see:
# - X-Stage-Would-Reject: true
# - Status: 200 OK (not rejected)
```

### Monitor Migration Progress

```bash
# Progress overview
psql $DATABASE_URL -c "SELECT * FROM stage_migration_progress;"

# Per-fund progress (if multi-tenant)
psql $DATABASE_URL -c "SELECT * FROM stage_migration_progress_by_fund;"

# Failed batches
psql $DATABASE_URL -c "SELECT * FROM stage_migration_failures;"
```

### Query Blast Radius

```bash
# Via Prometheus
curl "http://prometheus:9090/api/v1/query?query=job:stage_validation_would_reject_ratio:rate5m"

# Via Grafana dashboard
# → Stage Validation → Shadow Mode panel
```

---

## Success Criteria Summary

### Phase 2.1 (Baseline Bootstrap)

- [x] 24h of staging metrics collected
- [x] Baseline error rate <1%
- [x] Baseline p99 latency <5ms

### Phase 2.4 (Index Creation)

- [x] Indexes created without errors
- [x] No production impact

### Phase 2.5 (Migration + Write Enforcement)

- [x] 100% batches completed
- [x] Zero data loss verified
- [x] All stages canonical
- [x] No new invalid writes for 24h

### Phase 2.7 (Shadow Mode)

- [x] Would-reject rate <0.5% for 48h
- [x] Affected clients identified
- [x] No unexpected endpoint issues

### Phase 3 (Gradual Enforcement)

- [x] Error rate <1% at each percentage step
- [x] No alert fires
- [x] Latency stable

### Phase 4 (Full Enforcement)

- [x] Sustained error <0.5%
- [x] No regression in latency
- [x] Client adoption of canonical stages

---

## Related Documentation

- Main Runbook: `docs/runbooks/stage-validation.md`
- Migration Scripts: `scripts/normalize-stages-v2.ts`,
  `scripts/verify-migration-integrity.ts`
- Feature Flags: `server/lib/stage-validation-config.ts`
- Metrics: `server/observability/stage-metrics.ts`
- Alerts: `observability/prometheus/alerts/stage-normalization.yml`
- ADR: `docs/adr/ADR-011-stage-normalization-v2.md`

---

**Last Updated**: 2025-10-30 **Owner**: Platform Team **Review Cycle**:
Quarterly
