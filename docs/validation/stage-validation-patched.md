# Stage Validation Operational Runbook

## Overview

This runbook covers stage validation observability, alerting, and
troubleshooting for the investment stage normalization system across 3 API
endpoints.

### Affected Endpoints

- `GET /api/funds/:fundId/companies` (query param input)
- `POST /api/monte-carlo/simulate` (array input)
- `POST /api/portfolio/strategies` (object input)

### Validation Modes

- `off`: Log metrics only, allow all stages
- `warn` (DEFAULT): Set deprecation headers, allow all stages
- `enforce`: Reject invalid stages with 400 error

---

## Prerequisites

### Environment Configuration

```bash
# Validation mode (default: warn)
STAGE_VALIDATION_MODE=off|warn|enforce

# Server port for integration tests
PORT=3333

# Health check endpoint
GET /healthz  # Must return 200 OK
```

### Canonical Stages

```
pre-seed, seed, series-a, series-b, series-c, series-c+
```

**Critical**: `series-c+` includes the plus sign

---

## Metrics & Monitoring

### Prometheus Metrics

#### 1. `stage_validation_duration_seconds` (Histogram)

Measures validation latency

**Labels**:

- `endpoint`: Template route (no IDs)
- `mode`: off|warn|enforce
- `input_type`: query|array|object
- `cardinality`: Bucketed stage count ('1'|'2-5'|'6-10'|'11+'|'unknown')

**Buckets**: [0.0001, 0.0005, 0.001, 0.005, 0.01] seconds

**Query (p99)**:

```promql
histogram_quantile(0.99,
  sum by (endpoint, le) (
    rate(stage_validation_duration_seconds_bucket[5m])
  )
)
```

#### 2. `stage_validation_validations_total` (Counter)

Tracks validation attempts with classification

**Labels**:

- `endpoint`: API route
- `mode`: validation mode
- `input_type`: query|array|object
- `result`: ok|warn|reject

**Query (error ratio)**:

```promql
sum(rate(stage_validation_errors_total[5m]))
/
clamp_min(sum(rate(stage_validation_validations_total[5m])), 1)
```

#### 3. `stage_validation_errors_total` (Counter)

Counts validation errors by type

**Labels**:

- `endpoint`: API route
- `mode`: validation mode
- `error_code`: INVALID_STAGE_DISTRIBUTION|INVALID_STAGE

**Query (error breakdown)**:

```promql
sum(rate(stage_validation_errors_total[5m])) by (error_code)
```

#### 4. `stage_deprecation_header_emitted_total` (Counter)

Tracks deprecation header emissions

**Labels**:

- `endpoint`: API route
- `mode`: warn (should always be warn when incrementing)
- `input_type`: query|array|object

**Query (header integrity)**:

```promql
sum(rate(stage_deprecation_header_emitted_total[10m]))
/
clamp_min(
  sum(rate(stage_validation_validations_total{mode="warn", result="warn"}[10m])),
  1
)
```

#### 5. `stage_validation_mode` (Gauge)

Current validation mode (0=off, 1=warn, 2=enforce)

---

## Alert Triage Playbooks

### Alert: StageValidationHighErrorRate

**Condition**: Error ratio >1% for 15 minutes

**When**: Production requests are being rejected due to invalid stages

**Impact**: Users experiencing 400 errors, functionality degraded

#### Debugging Steps

1. **Check error code distribution**

```promql
sum(rate(stage_validation_errors_total[5m])) by (error_code)
```

Common codes:

- `INVALID_STAGE_DISTRIBUTION`: Array input (Monte Carlo)
- `INVALID_STAGE`: Object input (Portfolio Strategies)

2. **Identify affected endpoints**

```promql
sum(rate(stage_validation_errors_total[5m])) by (endpoint)
```

3. **Sample failing requests**

- Check logs for `correlationId` (Monte Carlo endpoint includes this)
- Look for pattern in invalid stage values
- Grep logs: `grep "INVALID_STAGE" /var/log/app.log | tail -20`

4. **Verify validation mode**

```promql
stage_validation_mode
```

- 0 = off (shouldn't reject anything)
- 1 = warn (shouldn't reject anything)
- 2 = enforce (expected to reject)

#### Likely Causes

**High rejection rate in enforce mode (expected)**:

- New client integration using wrong stage names
- Typos in stage inputs (common: "seriesa" instead of "series-a")
- Client using outdated stage list

**High rejection rate in warn/off mode (unexpected)**:

- Bug in validation logic
- Recent deploy changed stage definitions
- Mode misconfigured (thinks it's enforce)

#### Resolution

**If client error**:

1. Identify client via API logs/auth tokens
2. Point to documentation: `X-Stage-Docs` header value
3. Use `suggestions` field from error response to guide fix
4. Consider temporary mode switch to `warn` for specific client

**If validation bug**:

1. Roll back to previous version
2. Verify stage definitions in `shared/schemas/investment-stages.ts`
3. Check recent commits to normalization logic
4. Hotfix and redeploy

**Emergency**: Flip to `warn` mode temporarily

```bash
export STAGE_VALIDATION_MODE=warn
# Redeploy or restart services
```

---

### Alert: StageNormalizationLatencyRegressed

**Condition**: p99 latency >5ms for 10 minutes

**When**: Validation function is slower than baseline

**Impact**: Increased API response times, potential timeout issues

#### Debugging Steps

1. **Identify slow endpoint**

```promql
histogram_quantile(0.99,
  sum by (endpoint, le) (
    rate(stage_validation_duration_seconds_bucket[5m])
  )
)
```

2. **Check cardinality distribution**

```promql
histogram_quantile(0.99,
  sum by (cardinality, le) (
    rate(stage_validation_duration_seconds_bucket[5m])
  )
)
```

Higher cardinality (11+) naturally slower - check if traffic pattern changed

3. **Review recent deploys**

```bash
git log --oneline --since="2 hours ago" -- server/utils/stage-utils.ts shared/schemas/
```

4. **Check system resources**

- CPU throttling?
- Memory pressure?
- Database slow?

#### Likely Causes

**Traffic pattern change**:

- More requests with 11+ stages
- More unknown stages requiring Levenshtein distance calculations

**Code regression**:

- Recent change to normalization algorithm
- Inefficient loop or regex added
- Synchronous operation blocking event loop

**Infrastructure**:

- CPU throttling in container
- Node.js GC pauses
- Network latency to dependencies

#### Resolution

**If traffic pattern**:

1. Confirm via cardinality metric breakdown
2. Document as new baseline if sustained
3. Consider caching for repeated stage normalizations

**If code regression**:

1. Roll back offending commit
2. Profile normalization function: `node --prof app.js`
3. Optimize hot path (canonical stage check should be <0.1ms)

**If infrastructure**:

1. Check container resource limits
2. Verify CPU/memory allocation
3. Scale horizontally if needed

---

### Alert: DeprecationHeaderMissingInWarnMode

**Condition**: Header emission ratio <99% for 15 minutes

**When**: System in warn mode but not setting deprecation headers

**Impact**: Clients not receiving deprecation warnings, unprepared for enforce
mode

#### Debugging Steps

1. **Verify current mode**

```promql
stage_validation_mode  # Should be 1 for warn
```

2. **Check header emission by endpoint**

```promql
rate(stage_deprecation_header_emitted_total[10m])
/
rate(stage_validation_validations_total{mode="warn", result="warn"}[10m])
```

3. **Look for early returns in code**

```bash
grep -n "return res" server/routes/monte-carlo.ts | head -20
```

Check if any paths skip `setStageWarningHeaders()` call

4. **Verify middleware order**

```bash
grep -A5 "app.use.*deprecation" server/app.ts
```

Deprecation middleware must run before response sent

5. **Check function calls**

```bash
grep "recordDeprecationHeaderEmitted" server/routes/*.ts
```

Should be called after `setStageWarningHeaders()`

#### Likely Causes

**Middleware not invoked**:

- Header middleware not registered
- Middleware registered after routes
- Conditional skipping middleware

**Logic error**:

- Mode check incorrect (thinks mode != 'warn')
- Early return bypassing header setting
- Exception thrown before header call

**Metric issue**:

- `recordDeprecationHeaderEmitted()` not called
- Called with wrong labels (mode != 'warn')

#### Resolution

**If middleware issue**:

1. Verify registration: `app.use(deprecationHeaders)` exists
2. Check order: middleware before routes
3. Restart service to apply changes

**If logic error**:

1. Review route handlers for early returns
2. Add header calls in all warn-mode code paths
3. Ensure headers set before response sent

**Test locally**:

```bash
curl -i -X POST "http://localhost:3333/api/monte-carlo/simulate" \
  -d '{"fundId":1,"runs":1000,"stageDistribution":[{"stage":"invalid","weight":1.0}]}'

# Should see X-Stage-Deprecated-Variants header in warn mode
```

---

## Verification Checklist

### Pre-Deployment

- [ ] Mode set to `warn` in staging environment
- [ ] `/metrics` endpoint accessible
- [ ] All 5 metric series present in output:
  - `stage_validation_duration_seconds_bucket`
  - `stage_validation_validations_total`
  - `stage_validation_errors_total`
  - `stage_deprecation_header_emitted_total`
  - stage_validation_mode (gauge)
- [ ] Prometheus alerts loaded without errors
- [ ] Cross-endpoint smoke test passes:
  - Invalid typo (e.g., "seriesa") consistent across all 3 endpoints
  - Canonical stage (e.g., "series-a") works in all modes

### Post-Deployment

- [ ] Header emission ratio ≥99% in warn mode (10-30 min)
- [ ] Error ratio <1% across all endpoints
- [ ] Latency p99 within baseline (<5ms)
- [ ] No unexpected 400 errors in access logs
- [ ] `stage_validation_mode` gauge shows correct value

---

## Rollout Phases

### Phase 1: Staging - WARN Mode

**Duration**: 24-48 hours

**Config**:

```bash
export STAGE_VALIDATION_MODE=warn
```

**Success Criteria**:

- Error ratio <1%
- Header emission ratio ≥99%
- p99 latency ≤5ms @ 10-stage cardinality
- No service degradation

### Phase 2: Production Canary - WARN Mode

### Phase 2.5: Database Migration (still in WARN)

**Objective**  
Normalize historical stage data before any enforcement to prevent false rejects.

**Procedure**

- Take a snapshot/backup and document the restore command.
- Run `normalize-stages.ts` in idempotent batches (e.g., 5–10k rows).
- Log per-batch: start/end PKs, rows updated, mismatches, runtime.
- Verification: pre/post counts; per-stage tallies; sample diffs; invariants
  (e.g., `|1 − sum(distribution)| ≤ 1e-6`) hold.
- Cutover reads to normalized values (or finalize in place); retain snapshot for
  a quiet period.

**Success Criteria**

- Verification clean; no drift in per-stage counts.
- Application reads normalized values (or cutover plan documented).
- Remains in `warn` until enforcement phasing begins.

**Duration**: 24-48 hours

**Target**: 10% of production traffic

**Success Criteria**:

- Same as staging
- No customer complaints
- Deprecation headers visible in client logs

### Phase 3: Production - ENFORCE (Single Endpoint)

**Duration**: 24 hours

**Target**: `POST /api/portfolio/strategies` only

**Config**:

```bash
export STAGE_VALIDATION_MODE=enforce
```

**Monitor**:

- 400 error rate (expect some legitimate rejections)
- Error code distribution (should be `INVALID_STAGE`)
- Customer support tickets

### Phase 4: Production - ENFORCE (All Endpoints)

**Duration**: Ongoing

**Target**: All 3 endpoints

**Monitor**:

- Sustained error rate <0.5%
- No regression in latency
- Client adoption of canonical stages

---

## Recovery Procedures

### Rollback to WARN Mode

**When**: Error rate >5% or customer-impacting issues

**Steps**:

```bash
# 1. Set mode to warn
export STAGE_VALIDATION_MODE=warn

# 2. Redeploy or restart services
kubectl rollout restart deployment/api-server

# 3. Verify mode change
curl http://localhost:9090/api/v1/query?query=stage_validation_mode
# Should return 1

# 4. Monitor for 15 minutes
# - Headers should appear
# - 400 errors should stop
# - Requests should succeed

# 5. Notify stakeholders
# Post to #incidents channel with details
```

### Emergency Disable

**When**: Validation causing cascading failures

**Steps**:

```bash
# 1. Set mode to off
export STAGE_VALIDATION_MODE=off

# 2. Restart immediately
kubectl rollout restart deployment/api-server

# 3. Verify disabled
curl http://localhost:9090/api/v1/query?query=stage_validation_mode
# Should return 0

# 4. Incident postmortem
# Document what went wrong and how to prevent
```

---

## Quick Reference

### Curl Examples

**WARN Mode (should succeed with headers)**:

```bash
curl -i -X POST "http://localhost:3333/api/portfolio/strategies?fundId=1" \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{
    "strategyName": "Test",
    "modelType": "conservative",
    "stageAllocation": {"early": 30, "late": 70}
  }'

# Expected: 201 Created
# Headers: X-Stage-Deprecated-Variants, X-Stage-Sunset, X-Stage-Docs
```

**ENFORCE Mode (should reject with 400)**:

```bash
curl -i -X POST "http://localhost:3333/api/monte-carlo/simulate" \
  -H "Content-Type: application/json" \
  -d '{
    "fundId": 1,
    "runs": 1000,
    "stageDistribution": [{"stage": "unknown-stage", "weight": 1.0}]
  }'

# Expected: 400 Bad Request
# Body: error="INVALID_STAGE_DISTRIBUTION", details.validStages includes "series-c+"
```

### Endpoint Summary

| Endpoint                         | Input Type  | Error Code                                            | Correlation ID |
| -------------------------------- | ----------- | ----------------------------------------------------- | -------------- |
| GET /api/funds/:fundId/companies | Query param | N/A                                                   | ❌ No          |
| POST /api/monte-carlo/simulate   | Array       | INVALID_STAGE_DISTRIBUTION                            | ✅ Yes         |
| POST /api/portfolio/strategies   | Object      | Invalid stage allocation (details.code=INVALID_STAGE) | ❌ No          |

### Mode Behavior Matrix

| Mode    | Invalid Stage | Status Code | Headers        | Metrics   |
| ------- | ------------- | ----------- | -------------- | --------- |
| off     | "seriesa"     | 200/201     | ❌ No          | ✅ Logged |
| warn    | "seriesa"     | 200/201     | ✅ Deprecation | ✅ Logged |
| enforce | "seriesa"     | 400         | ❌ No (error)  | ✅ Logged |

---

## Escalation Path

### First Occurrence

- **Action**: Check this runbook
- **Timeout**: 15 minutes
- **Contact**: Self-service

### Persistent Issues (>3 alerts in 1 hour)

- **Action**: Page on-call engineer
- **Contact**: PagerDuty escalation
- **Include**: Alert name, affected endpoints, error rate

### Critical Impact (>10% error rate)

- **Action**: Escalate to platform lead
- **Contact**: Slack #incidents + PagerDuty
- **Include**: Customer impact assessment, rollback ETA

---

## Related Documentation

- OpenAPI Spec: `/docs/openapi.yaml` (headers + error schemas)
- Prometheus Alerts: `/observability/prometheus/alerts/stage-normalization.yml`
- Metrics Code: `/server/observability/stage-metrics.ts`
- Test Coverage: `/tests/integration/stage-validation-*.test.ts`

---

**Last Updated**: 2025-10-30 (Phase 6 completion) **Owner**: Platform Team
**Review Cycle**: Quarterly
