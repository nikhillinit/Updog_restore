# Next Steps Checklist - Unified Metrics Layer
## Immediate Actions to Production-Ready

**Current Status**: Staging-Ready (9.2/10)
**Time Required**: 3-4 hours
**Goal**: Pass 4 validation gates → Deploy to staging → Production rollout

---

## Phase 0: Pre-Staging Validation (2-3 hours)

### ⏳ GATE #1: XIRR Golden Set Validation (30 min)

**Objective**: Verify XIRR calculation accuracy against Excel

**Steps**:
```bash
# 1. Run golden set tests
npm test tests/unit/xirr-golden-set.test.ts

# 2. Check pass rate
# Expected: 15/15 tests pass (100%)
# Minimum: 14/15 tests pass (≥95%)

# 3. Verify critical cases
# - Case 1: Simple 2-flow (20.11% IRR)
# - Case 5: Negative IRR (-10.09% or similar)
# - Case 8: Extreme return (>100% IRR)

# 4. Check Excel parity
# All passing tests should be within ±1e-7 of Excel
```

**Pass Criteria**:
- [ ] ≥95% tests pass (14/15 minimum)
- [ ] Negative IRR test passes (Case 5)
- [ ] All passing tests within ±1e-7 of Excel XIRR
- [ ] No NaN or Infinity results for valid inputs

**If Fails**:
- Review XIRR algorithm in `client/src/lib/finance/xirr.ts`
- Check Brent solver implementation
- Verify date normalization (UTC midnight)
- Compare calculation steps with Excel manually

**Time**: 30 min
**Priority**: CRITICAL (financial correctness)

---

### ⏳ GATE #2: DPI Null Semantics (45 min)

**Objective**: Prevent misleading "0.00x" DPI display

**Files to Modify**:
1. `shared/types/metrics.ts` - Type definition
2. `server/services/actual-metrics-calculator.ts` - Return logic
3. `client/src/components/metrics/MetricsCard.tsx` - UI rendering

**Implementation**:

**Step 1**: Update type definition (5 min)
```typescript
// shared/types/metrics.ts
export interface ActualMetrics {
  // ... existing fields

  /** Distributions to Paid-In Capital (DPI)
   * Calculated as: totalDistributions / totalCalled
   * Returns null when no distributions have been recorded
   * Display as "N/A" in UI to avoid misleading "0.00x"
   */
  dpi: number | null;
}
```

**Step 2**: Update calculator (15 min)
```typescript
// server/services/actual-metrics-calculator.ts
// Around line 90-100 in calculateActualMetrics()

const totalCalled = totalInvested; // Approximation until capital_calls table
const totalDistributions = distributions.reduce(
  (sum, d) => sum.plus(d.amount),
  new Decimal(0)
);

// Return null instead of 0 when no distributions
const dpi = totalCalled.gt(0) && totalDistributions.gt(0)
  ? totalDistributions.div(totalCalled).toNumber()
  : null; // ← KEY CHANGE: null instead of 0

return {
  // ... other metrics
  dpi,
  totalDistributions: totalDistributions.toNumber(),
};
```

**Step 3**: Update UI rendering (25 min)
```typescript
// client/src/components/metrics/MetricsCard.tsx
// Around line 80-120 where DPI is displayed

function MetricsCard({ metrics }: { metrics: UnifiedFundMetrics }) {
  // ... existing code

  const formatDPI = (dpi: number | null): string => {
    if (dpi === null) {
      return "N/A"; // ← Show "N/A" instead of "0.00x"
    }
    return `${dpi.toFixed(2)}x`;
  };

  const getDPITooltip = (dpi: number | null): string => {
    if (dpi === null) {
      return "No distributions have been recorded yet. DPI will be calculated once distributions are tracked.";
    }
    return `Distributions to Paid-In Capital: ${formatCurrency(metrics.actual.totalDistributions)} / ${formatCurrency(metrics.actual.totalInvested)}`;
  };

  return (
    <div className="metric-card">
      {/* ... other metrics */}

      <Tooltip content={getDPITooltip(metrics.actual.dpi)}>
        <div className="metric-value">
          <span className={metrics.actual.dpi === null ? 'text-muted' : ''}>
            {formatDPI(metrics.actual.dpi)}
          </span>
        </div>
      </Tooltip>
    </div>
  );
}
```

**Pass Criteria**:
- [ ] Type changed to `dpi: number | null`
- [ ] Returns `null` when `totalDistributions === 0`
- [ ] UI displays "N/A" (not "0.00x") when null
- [ ] Tooltip explains why "N/A" is shown
- [ ] No TypeScript errors

**Test**:
```bash
# 1. Start dev server
npm run dev

# 2. Navigate to dashboard for fund with no distributions
# Expected: DPI shows "N/A" with explanatory tooltip

# 3. Check console for errors
# Expected: No errors

# 4. Verify in browser network tab
# Expected: API returns {"dpi": null} in response
```

**Time**: 45 min
**Priority**: HIGH (UX correctness)

---

### ⏳ GATE #3: Performance Validation (1 hour, in staging)

**Objective**: Verify p95 latency meets SLAs

**NOTE**: Run AFTER deploying to staging (more realistic than local)

**Steps**:
```bash
# 1. Deploy to staging
npm run build
# ... deploy to staging environment

# 2. Run performance tests
npm test -- metrics-performance.test.ts

# 3. Check results
# Expected:
# - Cold cache: p95 < 500ms
# - Warm cache: p95 < 200ms
# - Cache hit ratio: >80%

# 4. Monitor in staging
# - Open staging metrics dashboard
# - Watch p95 latency for 15 min
# - Check cache hit ratio

# 5. Manual load test (optional)
# Run 50 concurrent requests, measure p95
ab -n 50 -c 10 https://staging.app.com/api/funds/1/metrics
```

**Pass Criteria**:
- [ ] Cold cache p95 < 500ms
- [ ] Warm cache p95 < 200ms
- [ ] Cache hit ratio > 80% in steady state
- [ ] No timeouts or 500 errors under load

**If Fails**:
- Check for N+1 queries (enable query logging)
- Optimize slow database queries
- Adjust cache TTL if needed
- Consider `skipProjections=true` flag

**Time**: 1 hour (including deploy)
**Priority**: MEDIUM (performance SLA)

---

### ⏳ GATE #4: Status Field Verification (30 min)

**Objective**: Ensure `_status` field exists and is documented

**Steps**:

**Step 1**: Check API response (10 min)
```bash
# 1. Start dev server
npm run dev

# 2. Call metrics API
curl http://localhost:5000/api/funds/1/metrics | jq '._status'

# Expected output:
# {
#   "quality": "complete",
#   "engines": {
#     "actual": "success",
#     "projected": "success",
#     "target": "success",
#     "variance": "success"
#   },
#   "warnings": [],
#   "computeTimeMs": 245
# }

# 3. If null/missing, check server/services/metrics-aggregator.ts
# Verify _status is added to return payload
```

**Step 2**: Verify UI badge (15 min)
```typescript
// client/src/components/metrics/MetricsCard.tsx
// Add status badge at top of card

import { Badge } from '@/components/ui/badge';

function MetricsCard({ metrics }: { metrics: UnifiedFundMetrics }) {
  const getStatusBadge = (status: MetricsStatus) => {
    if (status.quality === 'complete') {
      return <Badge variant="success">Calculated</Badge>;
    }
    if (status.quality === 'partial') {
      return <Badge variant="warning">Partial</Badge>;
    }
    return <Badge variant="destructive">Fallback</Badge>;
  };

  return (
    <div className="metric-card">
      <div className="flex justify-between items-center">
        <h3>Fund Metrics</h3>
        {getStatusBadge(metrics._status)}
      </div>
      {/* ... rest of card */}
    </div>
  );
}
```

**Step 3**: Update Operator Runbook (5 min)
```markdown
# docs/METRICS_OPERATOR_RUNBOOK.md

## Understanding Metric Status

The `_status` field indicates calculation quality:

- **Complete**: All engines succeeded, no warnings
- **Partial**: Some engines failed, fallback values used
- **Fallback**: All projected metrics are defaults

Check `_status.warnings` array for details.
```

**Pass Criteria**:
- [ ] API response includes `_status` field
- [ ] UI shows status badge (green/yellow/orange)
- [ ] Operator Runbook documents interpretation
- [ ] Warnings array populated on failures

**Test**:
```bash
# 1. Normal case (all engines work)
curl localhost:5000/api/funds/1/metrics | jq '._status.quality'
# Expected: "complete"

# 2. Force engine failure (mock error)
# Verify: quality = "partial", warnings array has entry

# 3. Check UI
# Expected: Badge shows "Calculated" (green)
```

**Time**: 30 min
**Priority**: MEDIUM (observability)

---

## Phase 1: Staging Deployment (15 min)

### Deploy to Staging

**Steps**:
```bash
# 1. Ensure all Phase 0 gates passed
# Required: Gates #1, #2, #4 complete

# 2. Build production bundle
npm run build

# 3. Run type check
npm run check
# Expected: No TypeScript errors

# 4. Run linter
npm run lint
# Expected: No errors (warnings ok)

# 5. Deploy to staging
# ... your deployment process
# Example: git push staging main

# 6. Smoke test
curl https://staging.app.com/api/funds/1/metrics
# Expected: 200 response with metrics

# 7. Check logs
# Expected: No errors, XIRR calculations succeed

# 8. Test auth
curl -X POST https://staging.app.com/api/funds/1/metrics/invalidate
# Expected: 401 Unauthorized

# 9. NOW run Gate #3 (performance tests)
```

**Checklist**:
- [ ] Build succeeds
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Deployment successful
- [ ] Health check passes
- [ ] Auth works (401 without token)
- [ ] API returns valid metrics

---

## Phase 2: Production Rollout (3-5 days)

### Day 1: Limited Release

**Actions**:
```bash
# 1. Enable feature flag for 1-2 users
# Example: Set in database or environment variable
UPDATE user_features SET unified_metrics = true WHERE user_id IN (1, 2);

# 2. Monitor error rate
# Check logs, Sentry, or monitoring dashboard
# Target: <0.1% error rate

# 3. Monitor performance
# Check p95 latency: target <500ms
# Check cache hit ratio: target >80%

# 4. Collect feedback
# Slack message: "Please test new metrics and report issues"
```

**Checklist**:
- [ ] 1-2 users enabled
- [ ] No errors reported
- [ ] Performance within SLAs
- [ ] Positive user feedback

---

### Day 3-5: Full Rollout

**Actions**:
```bash
# 1. Enable for all users
UPDATE user_features SET unified_metrics = true;

# 2. Continue monitoring
# Watch for 24-48 hours

# 3. Get finance sign-off
# Email: "XIRR methodology validated, ready for LP reporting?"

# 4. Document any issues
# Create tickets for Phase 2 enhancements
```

**Checklist**:
- [ ] All users (<5) enabled
- [ ] No incidents
- [ ] Finance approval received
- [ ] Lessons learned documented

---

## Rollback Plan (If Needed)

### Trigger Conditions
- Error rate >1% for >5 min
- p95 latency >2s for >5 min
- User reports incorrect calculations
- Security incident

### Rollback Steps
```bash
# 1. Disable feature flag (immediate)
UPDATE user_features SET unified_metrics = false;

# 2. Revert API endpoint (5 min)
# Deploy previous version or use feature flag

# 3. Notify users
# Slack: "Metrics temporarily reverted, investigating issue"

# 4. Investigate
# Check logs, reproduce issue, identify root cause

# 5. Fix and re-deploy
# Follow Phase 0 gates again
```

---

## Quick Reference

### Command Summary
```bash
# Phase 0
npm test tests/unit/xirr-golden-set.test.ts        # Gate #1
# (manual implementation)                           # Gate #2
npm test -- metrics-performance.test.ts            # Gate #3 (in staging)
curl localhost:5000/api/funds/1/metrics | jq      # Gate #4

# Phase 1
npm run build && npm run check && npm run lint
# ... deploy to staging

# Phase 2
# ... gradual rollout with monitoring
```

### Time Estimates
- **Phase 0 (Pre-Staging)**: 2-3 hours
  - Gate #1: 30 min
  - Gate #2: 45 min
  - Gate #4: 30 min
  - Buffer: 30 min

- **Phase 1 (Staging)**: 1 hour
  - Deploy: 15 min
  - Gate #3: 45 min

- **Phase 2 (Production)**: 3-5 days
  - Day 1: Limited (2 hours setup + monitoring)
  - Day 3-5: Full rollout (ongoing monitoring)

**Total Active Work**: 3-4 hours
**Total Calendar Time**: 1 week

---

## Success Criteria

### Phase 0 Complete When:
- [ ] All 4 gates passed
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Local testing successful

### Phase 1 Complete When:
- [ ] Staging deployment successful
- [ ] Performance SLAs met
- [ ] No critical bugs found
- [ ] Smoke tests pass

### Phase 2 Complete When:
- [ ] All users enabled
- [ ] No production incidents
- [ ] Finance approval received
- [ ] Monitoring confirms stability

---

## Who Does What

### Engineering (You)
- Execute Phase 0 gates (2-3 hours)
- Deploy to staging
- Run performance tests
- Monitor production rollout

### Finance Team
- Review XIRR test results (after Gate #1)
- Sign off on methodology
- Approve for LP reporting

### Product/Business
- Approve production rollout
- Communicate to users
- Collect feedback

---

## Files to Check

### Implementation
- `shared/types/metrics.ts` - DPI type definition
- `server/services/actual-metrics-calculator.ts` - DPI calculation
- `client/src/components/metrics/MetricsCard.tsx` - UI rendering
- `server/services/metrics-aggregator.ts` - `_status` field

### Testing
- `tests/unit/xirr-golden-set.test.ts` - XIRR validation
- `tests/load/metrics-performance.test.ts` - Performance tests

### Documentation
- `docs/METRICS_OPERATOR_RUNBOOK.md` - Operations guide
- `IMPLEMENTATION_SYNTHESIS.md` - Full analysis
- `SYNTHESIS_EXECUTIVE_SUMMARY.md` - Quick reference

---

**Ready to Start?**
1. Review this checklist
2. Execute Gate #1 (30 min)
3. Execute Gate #2 (45 min)
4. Execute Gate #4 (30 min)
5. Deploy to staging (15 min)
6. Execute Gate #3 (45 min)
7. Production rollout (gradual, monitored)

**Questions?** See [IMPLEMENTATION_SYNTHESIS.md](IMPLEMENTATION_SYNTHESIS.md) for full details.
