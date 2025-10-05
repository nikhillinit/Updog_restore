# Unified Metrics Layer - Code Review Checklist

## Pre-Production Review Checklist for Multi-AI Consensus

This document provides a structured review guide for the Unified Metrics Layer implementation. Use this checklist with Codex or multi-AI review tools to validate production readiness.

---

## 🔴 CRITICAL ITEMS (Must Fix Before Production)

### 1. Financial Calculation Accuracy

**File**: `server/services/actual-metrics-calculator.ts` (Lines 139-185)

**XIRR Algorithm Review**:
```typescript
// Lines 156-162: NPV and derivative calculation
for (const cf of cashflows) {
  const years = this.yearsBetween(baseDate, cf.date);
  const factor = rate.plus(1).pow(years);
  npv = npv.plus(new Decimal(cf.amount).div(factor));
  dnpv = dnpv.minus(new Decimal(cf.amount).mul(years).div(factor.mul(rate.plus(1))));
}
```

**Review Questions**:
- [ ] Is the derivative formula `dnpv = -cf.amount * years / (factor * (rate + 1))` mathematically correct?
- [ ] Does this handle negative cashflows (investments) correctly?
- [ ] Will this converge for typical VC cashflow patterns (heavy early outflows, later inflows)?
- [ ] Are the edge cases handled (< 2 cashflows, all positive/negative flows)?

**Test Cases Needed**:
```typescript
// Test 1: Known IRR scenario
const testCashflows = [
  { date: '2020-01-01', amount: -10000000 },  // Investment
  { date: '2025-01-01', amount: 25000000 }    // Exit
];
// Expected IRR ≈ 20.11%

// Test 2: Multiple rounds
const testCashflows2 = [
  { date: '2020-01-01', amount: -5000000 },   // Seed
  { date: '2021-01-01', amount: -10000000 },  // Series A
  { date: '2023-01-01', amount: 5000000 },    // Partial exit
  { date: '2025-01-01', amount: 40000000 }    // Final exit
];

// Test 3: J-curve (early losses)
// Test 4: Compare against Excel XIRR function
```

**Action**: Compare calculator output against Excel XIRR with same data

---

### 2. Missing Database Tables

**File**: `server/services/actual-metrics-calculator.ts` (Lines 245-270)

**Issue**: TODOs indicate missing tables:
```typescript
// Line 245: getInvestments() - TODO: query investments table
// Line 259: getCapitalCalls() - TODO: query capital_calls table
// Line 268: getDistributions() - TODO: query distributions table
```

**Current Workaround**: Deriving from portfolio_companies table (imprecise)

**Questions**:
- [ ] Do these tables exist in the database schema?
- [ ] If not, is the workaround sufficient for MVP?
- [ ] What's the accuracy impact of using portfolio_companies.initialInvestment?
- [ ] Will this cause IRR calculations to be wrong?

**Action Items**:
1. Check if tables exist: `npm run db:studio` → verify schema
2. If missing: Add to `shared/schema.ts`
3. Update storage interface: `server/storage.ts`
4. Migrate existing data

---

### 3. Hardcoded Configuration Values

**File**: `server/services/metrics-aggregator.ts` (Lines 151-171)

**Issue**: Fund configuration uses hardcoded defaults:
```typescript
return {
  targetIRR: 0.25,        // Hardcoded 25%
  targetTVPI: 2.5,        // Hardcoded 2.5x
  investmentPeriodYears: 3,  // Hardcoded
  fundTermYears: 10,      // Hardcoded
  reserveRatio: 0.5,      // Hardcoded 50%
};
```

**Questions**:
- [ ] Is there a fund_configs table in the schema?
- [ ] Should each fund have custom targets?
- [ ] Are these reasonable defaults for all funds?
- [ ] What happens when actual fund has different targets?

**Action**:
1. Check if `fund_configs` table exists
2. If yes: Implement `storage.getFundConfig(fundId)`
3. If no: Add table to schema or accept hardcoded defaults for MVP

---

### 4. Cache Invalidation Security

**File**: `server/routes/fund-metrics.ts` (Lines 97-133)

**Issue**: Cache invalidation endpoint has NO authentication:
```typescript
router.post('/api/funds/:fundId/metrics/invalidate', async (req, res) => {
  // ❌ No auth check!
  await metricsAggregator.invalidateCache(fundId);
});
```

**Risk**: Anyone can invalidate cache → potential DoS attack

**Questions**:
- [ ] Should this be admin-only?
- [ ] Should it require fund ownership?
- [ ] Is there existing auth middleware to add?

**Action**: Add authentication before production

---

### 5. Decimal Precision Configuration

**File**: `server/services/actual-metrics-calculator.ts` (Line 18)

```typescript
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });
```

**Questions**:
- [ ] Is 28 digits sufficient for VC fund calculations?
- [ ] Is ROUND_HALF_UP correct for financial rounding?
- [ ] Should this be ROUND_HALF_EVEN (banker's rounding)?
- [ ] Are there regulatory requirements for rounding?

**Action**: Verify with finance/compliance team

---

## 🟡 WARNINGS (Should Fix Before Production)

### 6. Performance - N+1 Query Risk

**File**: `server/services/metrics-aggregator.ts` (Lines 95-109)

**Issue**: Sequential database calls in parallel:
```typescript
const [fund, companies, config] = await Promise.all([
  storage.getFund(fundId),           // Query 1
  storage.getPortfolioCompanies(fundId), // Query 2 + N sub-queries?
  this.getFundConfig(fundId),        // Query 3
]);
```

**Questions**:
- [ ] Does `getPortfolioCompanies()` use JOIN or N+1 queries?
- [ ] With 100 companies, how many DB round-trips?
- [ ] Can this be optimized with a single query?

**Test**: Load test with 100 portfolio companies, measure query count

---

### 7. Error Handling - Partial Failures

**File**: `server/services/projected-metrics-calculator.ts` (Lines 53-80)

**Issue**: If one engine fails, returns null but continues:
```typescript
const [reserveResults, pacingResults, cohortResults] = await Promise.all([
  this.calculateReserves(...),  // Returns null on error
  this.calculatePacing(...),    // Returns null on error
  this.calculateCohorts(...),   // Returns null on error
]);
```

**Questions**:
- [ ] Should API return partial data or fail completely?
- [ ] How should UI handle missing projected metrics?
- [ ] Should there be a status field indicating partial data?

**Recommendation**: Add `projectedMetricsStatus` field to response:
```typescript
interface UnifiedFundMetrics {
  // ...
  projectedMetricsStatus: {
    reserves: 'success' | 'failed' | 'partial';
    pacing: 'success' | 'failed' | 'partial';
    cohorts: 'success' | 'failed' | 'partial';
  };
}
```

---

### 8. Cache Strategy - Stale Data Risk

**File**: `server/services/metrics-aggregator.ts` (Line 111)

**Issue**: 5-minute cache + 1-minute client cache = up to 6 minutes stale data

**Scenario**:
1. User adds $10M investment at 2:00:00 PM
2. Dashboard loaded at 2:00:01 PM (shows old data from 1:55 cache)
3. User won't see new investment until 2:06:00 PM

**Questions**:
- [ ] Is 6 minutes acceptable for financial dashboards?
- [ ] Should investment creation auto-invalidate cache?
- [ ] Should UI show "Last updated: X minutes ago"?

**Recommendation**:
1. Add cache invalidation calls to investment/valuation update endpoints
2. Display `lastUpdated` timestamp in UI
3. Add manual refresh button

---

### 9. React Hook - Missing Query Invalidation

**File**: `client/src/hooks/useFundMetrics.ts` (Lines 129-148)

**Issue**: `useInvalidateMetrics()` calls API but doesn't invalidate TanStack Query cache:
```typescript
export function useInvalidateMetrics() {
  const invalidateMetrics = async () => {
    await fetch(`/api/funds/${fundId}/metrics/invalidate`, { method: 'POST' });
    // ❌ Doesn't invalidate TanStack Query cache!
  };
}
```

**Fix**:
```typescript
import { useQueryClient } from '@tanstack/react-query';

export function useInvalidateMetrics() {
  const { fundId } = useFundContext();
  const queryClient = useQueryClient();

  const invalidateMetrics = async () => {
    await fetch(`/api/funds/${fundId}/metrics/invalidate`, { method: 'POST' });
    // ✅ Invalidate client cache too
    await queryClient.invalidateQueries(['fund-metrics', fundId]);
  };
}
```

---

### 10. ESLint Rule - Potential False Positives

**File**: `eslint-rules/no-hardcoded-fund-metrics.js` (Lines 158-179)

**Issue**: `looksLikeFinancialValue()` heuristic may flag valid code:
```typescript
function looksLikeFinancialValue(value) {
  const num = value.value;
  return (
    Math.abs(num) > 1_000_000 ||  // ❌ Could flag non-financial constants
    (num >= 0 && num <= 10 && num % 1 !== 0)  // ❌ Could flag any decimal
  );
}
```

**False Positive Examples**:
```typescript
const CACHE_TTL = 5_000_000;  // 5M milliseconds, not dollars!
const VERSION = 1.5;           // Not a multiple!
const PI = 3.14159;            // Not IRR!
```

**Recommendation**: Refine heuristic or add more allowlist patterns

---

## 🟢 SUGGESTIONS (Nice-to-Have Improvements)

### 11. Code Duplication

**Files**:
- `client/src/components/metrics/MetricsCard.tsx` (Lines 142-170)
- `client/src/components/metrics/VarianceBadge.tsx` (Lines 78-95)

**Issue**: `formatValue()` function duplicated in both files

**Fix**: Extract to shared utility:
```typescript
// client/src/lib/format-metrics.ts
export function formatValue(value: number, format: 'currency' | 'percentage' | 'multiple' | 'number'): string {
  // ... implementation
}
```

---

### 12. Accessibility

**File**: `client/src/components/metrics/MetricsCard.tsx`

**Missing**:
- ARIA labels for variance badges
- Screen reader text for icons
- Keyboard navigation for tooltips

**Add**:
```tsx
<Badge aria-label={`Variance: ${percentDeviation}% ${effectivelyPositive ? 'above' : 'below'} target`}>
  <Icon aria-hidden="true" />
  <span>{formattedDeviation}%</span>
</Badge>
```

---

### 13. Monitoring & Observability

**Missing**: Metrics calculation timing/failure tracking

**Add to MetricsAggregator**:
```typescript
import { metricsCalculationDuration, metricsCalculationErrors } from '../metrics';

async getUnifiedMetrics(fundId) {
  const timer = metricsCalculationDuration.startTimer();
  try {
    const metrics = await this.calculate(...);
    timer({ status: 'success' });
    return metrics;
  } catch (error) {
    timer({ status: 'error' });
    metricsCalculationErrors.inc({ component: 'aggregator' });
    throw error;
  }
}
```

---

### 14. Type Safety Improvements

**File**: `server/services/actual-metrics-calculator.ts` (Lines 245-270)

**Issue**: Return types use `any`:
```typescript
private async getInvestments(fundId: number): Promise<Array<{ date: Date; amount: number }>> {
  // ... but returns `any[]` from storage
}
```

**Recommendation**: Define proper return types in storage interface

---

### 15. Documentation

**Missing**:
- API documentation (OpenAPI/Swagger)
- Architecture diagram in code comments
- Examples in JSDoc comments

**Add**: OpenAPI spec for metrics endpoint:
```yaml
/api/funds/{fundId}/metrics:
  get:
    summary: Get unified fund metrics
    parameters:
      - name: fundId
        in: path
        required: true
        schema:
          type: integer
      - name: skipCache
        in: query
        schema:
          type: boolean
    responses:
      200:
        description: Unified metrics
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UnifiedFundMetrics'
```

---

## 📊 TESTING REQUIREMENTS

### Unit Tests Needed

1. **ActualMetricsCalculator**:
   - [ ] XIRR calculation accuracy (vs Excel)
   - [ ] Edge cases (no cashflows, single cashflow, all negative)
   - [ ] NAV calculation correctness
   - [ ] Decimal precision

2. **ProjectedMetricsCalculator**:
   - [ ] Engine integration (mock engines)
   - [ ] Fallback value logic
   - [ ] Parallel execution

3. **VarianceCalculator**:
   - [ ] Status determination logic
   - [ ] Edge cases (zero values, NaN)
   - [ ] Tolerance thresholds

4. **MetricsAggregator**:
   - [ ] Caching behavior
   - [ ] Cache invalidation
   - [ ] Error aggregation

---

### Integration Tests Needed

1. **End-to-End API**:
   - [ ] GET /api/funds/:id/metrics returns valid response
   - [ ] Cache headers correct
   - [ ] Error responses correct
   - [ ] Performance (p95 < 500ms)

2. **Database Integration**:
   - [ ] Calculator queries correct data
   - [ ] No N+1 queries
   - [ ] Handles missing data gracefully

---

### E2E Tests Needed

1. **Consistency Check**:
```typescript
test('Dashboard and Portfolio show identical IRR', async ({ page }) => {
  await page.goto('/dashboard');
  const dashboardIRR = await page.locator('[data-testid="metric-irr"]').textContent();

  await page.goto('/portfolio');
  const portfolioIRR = await page.locator('[data-testid="metric-irr"]').textContent();

  expect(dashboardIRR).toBe(portfolioIRR);
});
```

2. **Cache Invalidation**:
```typescript
test('Metrics update after adding investment', async ({ page }) => {
  const initialValue = await getMetricValue('totalDeployed');
  await createInvestment({ amount: 1000000 });
  await invalidateCache();
  const newValue = await getMetricValue('totalDeployed');
  expect(newValue).toBe(initialValue + 1000000);
});
```

---

## 🎯 PRODUCTION READINESS ASSESSMENT

### Scoring (1-10 scale)

| Category | Score | Notes |
|----------|-------|-------|
| Financial Accuracy | 7/10 | XIRR needs validation; missing DB tables |
| Data Consistency | 9/10 | Architecture solves the core problem |
| Performance | 6/10 | Need load testing; potential N+1 queries |
| Security | 5/10 | Missing auth on cache invalidation |
| Error Handling | 7/10 | Good coverage, partial failure handling unclear |
| Code Quality | 8/10 | Well-structured, minor duplication |
| Type Safety | 9/10 | Comprehensive types, minor gaps |
| Testing | 3/10 | No tests yet (critical gap) |

**Overall**: **7/10** - Good foundation, needs testing + critical fixes

---

## 🚨 TOP 3 BLOCKERS

1. **Validate XIRR Algorithm**
   - Compare against Excel XIRR with test data
   - Add unit tests with known IRR scenarios
   - Get finance team sign-off

2. **Resolve Missing Database Tables**
   - Verify capital_calls, distributions tables exist
   - If missing: Add to schema or accept workaround
   - Document accuracy implications

3. **Add Security to Cache Invalidation**
   - Add authentication middleware
   - Restrict to fund owners or admins
   - Rate limit to prevent DoS

---

## 🎯 RECOMMENDED ROLLOUT PLAN

### Phase 1: Validation (Week 2)
- [ ] Add unit tests for XIRR
- [ ] Compare calculator output vs Excel
- [ ] Load test with 100 companies
- [ ] Fix security issues
- [ ] Stakeholder review of calculation accuracy

### Phase 2: Controlled Rollout (Week 3)
- [ ] Enable for single fund (internal testing)
- [ ] Monitor performance metrics
- [ ] Collect user feedback
- [ ] Fix any issues

### Phase 3: Full Deployment (Week 4)
- [ ] Enable for all funds
- [ ] Document runbook
- [ ] Train support team
- [ ] Monitor for 1 week

---

## ✅ SIGN-OFF CHECKLIST

Before merging to production:

- [ ] XIRR calculation validated by finance team
- [ ] All critical blockers resolved
- [ ] Unit tests written and passing (>80% coverage)
- [ ] Integration tests passing
- [ ] E2E consistency tests passing
- [ ] Performance benchmarks met (p95 < 500ms)
- [ ] Security review complete
- [ ] Documentation updated
- [ ] Runbook created for operations
- [ ] Stakeholder sign-off obtained

---

**Review Date**: _____________
**Reviewers**: _____________
**Production Ready**: ☐ Yes  ☐ No  ☐ Conditional
**Conditions**: _____________
