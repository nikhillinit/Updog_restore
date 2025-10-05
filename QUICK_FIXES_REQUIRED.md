# 🚨 Quick Fixes Required - Priority Order

These are the critical fixes needed before the Unified Metrics Layer can go to production. Estimated total time: **6-8 hours**.

---

## 🔴 CRITICAL (Must Fix Today)

### 1. Add Authentication to Cache Invalidation (1 hour) ⚡

**File**: `server/routes/fund-metrics.ts` (Line 102)

**Current Code**:
```typescript
router.post('/api/funds/:fundId/metrics/invalidate', async (req, res) => {
  // ❌ NO AUTH!
  await metricsAggregator.invalidateCache(fundId);
});
```

**Fix**:
```typescript
import { requireAuth } from '../middleware/auth'; // Or your auth middleware
import { requireFundAccess } from '../middleware/fund-access'; // If you have it

router.post('/api/funds/:fundId/metrics/invalidate',
  requireAuth,
  requireFundAccess, // Verify user owns this fund
  async (req, res) => {
    const fundIdParam = req.params.fundId;
    const fundId = toNumber(fundIdParam, 'fundId');

    if (fundId <= 0) {
      return res.status(400).json({
        error: 'Invalid fund ID',
        message: `Fund ID must be a positive integer`,
      });
    }

    await metricsAggregator.invalidateCache(fundId);

    return res.json({
      success: true,
      message: `Cache invalidated for fund ${fundId}`,
      fundId,
    });
  }
);
```

**Why Critical**: DoS attack vector - anyone can spam cache invalidation

---

### 2. Fix React Hook Cache Invalidation (5 minutes) ⚡

**File**: `client/src/hooks/useFundMetrics.ts` (Lines 129-148)

**Current Code**:
```typescript
export function useInvalidateMetrics() {
  const { fundId } = useFundContext();

  const invalidateMetrics = async () => {
    if (!fundId) return;
    await fetch(`/api/funds/${fundId}/metrics/invalidate`, { method: 'POST' });
    // ❌ Client cache still stale!
  };

  return { invalidateMetrics };
}
```

**Fix**:
```typescript
import { useQueryClient } from '@tanstack/react-query';

export function useInvalidateMetrics() {
  const { fundId } = useFundContext();
  const queryClient = useQueryClient();

  const invalidateMetrics = async () => {
    if (!fundId) return;

    try {
      // Invalidate server cache
      const response = await fetch(`/api/funds/${fundId}/metrics/invalidate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error('Failed to invalidate server cache:', await response.text());
      }

      // ✅ Invalidate client cache
      await queryClient.invalidateQueries({
        queryKey: ['fund-metrics', fundId]
      });
    } catch (error) {
      console.error('Error invalidating metrics cache:', error);
    }
  };

  return { invalidateMetrics };
}
```

**Why Critical**: Users see stale data after adding investments

---

## 🟡 HIGH PRIORITY (Before Showing to Users)

### 3. Validate XIRR Calculation (2-3 hours)

**Create Test File**: `server/services/__tests__/actual-metrics-calculator.test.ts`

```typescript
import { ActualMetricsCalculator } from '../actual-metrics-calculator';
import Decimal from 'decimal.js';

describe('ActualMetricsCalculator - XIRR', () => {
  const calculator = new ActualMetricsCalculator();

  test('Simple 2-cashflow IRR calculation', async () => {
    // Known test case: -$10M invested, $25M returned after 5 years
    // Expected IRR: 20.11%

    const mockInvestments = [
      { date: new Date('2020-01-01'), amount: 10000000 }
    ];
    const mockDistributions = [];
    const mockNAV = new Decimal(25000000);

    const irr = await calculator['calculateIRR'](
      mockInvestments,
      mockDistributions,
      mockNAV
    );

    // Allow 0.1% tolerance
    expect(irr.toNumber()).toBeCloseTo(0.2011, 3);
  });

  test('Multiple rounds with partial exits', async () => {
    // Seed: -$5M on 2020-01-01
    // Series A: -$10M on 2021-01-01
    // Partial exit: +$5M on 2023-01-01
    // Current NAV: $40M

    const mockInvestments = [
      { date: new Date('2020-01-01'), amount: 5000000 },
      { date: new Date('2021-01-01'), amount: 10000000 }
    ];
    const mockDistributions = [
      { date: new Date('2023-01-01'), amount: 5000000 }
    ];
    const mockNAV = new Decimal(40000000);

    const irr = await calculator['calculateIRR'](
      mockInvestments,
      mockDistributions,
      mockNAV
    );

    // Compare against Excel XIRR
    // TODO: Fill in expected value after Excel calculation
    expect(irr.toNumber()).toBeGreaterThan(0);
  });

  test('Handles edge case: no cashflows', async () => {
    const irr = await calculator['calculateIRR']([], [], new Decimal(0));
    expect(irr.toNumber()).toBe(0);
  });

  test('Handles edge case: single cashflow', async () => {
    const mockInvestments = [{ date: new Date('2020-01-01'), amount: 1000000 }];
    const irr = await calculator['calculateIRR'](mockInvestments, [], new Decimal(0));
    expect(irr.toNumber()).toBe(0);
  });
});
```

**Action Steps**:
1. Create test file above
2. Run tests: `npm test actual-metrics-calculator.test.ts`
3. Compare outputs to Excel XIRR for same cashflows
4. Get finance team approval

---

### 4. Load Test Performance (2 hours)

**Create**: `tests/load/metrics-performance.test.ts`

```typescript
import { performance } from 'perf_hooks';

describe('Metrics API Performance', () => {
  test('Handles 100 portfolio companies in < 500ms (p95)', async () => {
    // Setup: Create fund with 100 companies
    const fundId = await createTestFundWithCompanies(100);

    // Run 20 requests and measure p95
    const durations: number[] = [];

    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      const response = await fetch(`/api/funds/${fundId}/metrics`);
      const end = performance.now();

      expect(response.ok).toBe(true);
      durations.push(end - start);
    }

    // Calculate p95
    durations.sort((a, b) => a - b);
    const p95Index = Math.floor(durations.length * 0.95);
    const p95Duration = durations[p95Index];

    console.log('Durations:', durations);
    console.log('p95:', p95Duration);

    expect(p95Duration).toBeLessThan(500); // Target: < 500ms
  });

  test('Cache reduces response time', async () => {
    const fundId = 1;

    // First request (cache miss)
    const start1 = performance.now();
    await fetch(`/api/funds/${fundId}/metrics`);
    const duration1 = performance.now() - start1;

    // Second request (cache hit)
    const start2 = performance.now();
    await fetch(`/api/funds/${fundId}/metrics`);
    const duration2 = performance.now() - start2;

    console.log('Cache miss:', duration1);
    console.log('Cache hit:', duration2);

    // Cache hit should be at least 5x faster
    expect(duration2).toBeLessThan(duration1 / 5);
  });
});
```

**Run**:
```bash
npm test -- metrics-performance.test.ts
```

---

## 🟢 MEDIUM PRIORITY (Before Full Rollout)

### 5. Document Missing Distributions Impact (30 min)

**Create**: User-facing documentation

**File**: `docs/METRICS_LIMITATIONS.md`

```markdown
# Metrics Limitations (MVP)

## DPI Calculation - Known Limitation

**Current Behavior**: DPI (Distributions to Paid-In) will show **0.00x** for all funds.

**Reason**: The distributions table is not yet implemented in the MVP. DPI calculation requires:
- Capital calls (✅ available via investments)
- Distributions to LPs (❌ not tracked yet)

**Impact**:
- Funds with exits will show DPI = 0 (incorrect)
- IRR calculations include only terminal NAV, not interim distributions

**Workaround**:
- Use TVPI (Total Value to Paid-In) instead
- TVPI = (NAV + Distributions) / Capital Called
- Since Distributions = 0, TVPI = NAV / Capital Called

**Planned Fix**: Phase 2 will add distributions table

---

## Target Metrics - Generic Defaults

**Current Behavior**: All funds use the same target metrics:
- Target IRR: 25%
- Target TVPI: 2.5x
- Investment Period: 3 years
- Fund Term: 10 years

**Impact**:
- Variance metrics compare against generic targets
- Custom fund strategies not reflected

**Workaround**: Interpret variance metrics as "vs industry standard"

**Planned Fix**: Phase 2 will enable custom targets per fund
```

---

### 6. Add Monitoring (1 hour)

**File**: `server/services/metrics-aggregator.ts`

**Add Prometheus Metrics**:
```typescript
import { metricsCalculationDuration, metricsCalculationErrors } from '../metrics';

export class MetricsAggregator {
  async getUnifiedMetrics(fundId: number, options = {}) {
    const timer = metricsCalculationDuration.startTimer({
      fund_id: fundId,
      skip_projections: options.skipProjections ? 'true' : 'false'
    });

    try {
      // ... existing code ...
      const unifiedMetrics = await this.calculate(...);

      timer({ status: 'success' });
      return unifiedMetrics;

    } catch (error) {
      timer({ status: 'error' });

      metricsCalculationErrors.inc({
        component: this.getErrorComponent(error),
        error_type: error.code || 'unknown'
      });

      throw error;
    }
  }
}
```

**Add to**: `server/metrics.ts`
```typescript
export const metricsCalculationDuration = new client.Histogram({
  name: 'updog_metrics_calculation_duration_seconds',
  help: 'Time to calculate unified metrics',
  labelNames: ['fund_id', 'skip_projections', 'status'],
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10]
});

export const metricsCalculationErrors = new client.Counter({
  name: 'updog_metrics_calculation_errors_total',
  help: 'Total metrics calculation errors',
  labelNames: ['component', 'error_type']
});
```

---

## ✅ COMPLETION CHECKLIST

Before marking as production-ready:

- [ ] Cache invalidation has authentication
- [ ] React hook invalidates TanStack Query cache
- [ ] XIRR validated against Excel (3+ test cases)
- [ ] Load test shows p95 < 500ms with 100 companies
- [ ] Limitations documented for users
- [ ] Monitoring added (Prometheus metrics)
- [ ] Unit tests written and passing
- [ ] Finance team approves calculation methodology
- [ ] Security review complete

---

## 📋 TESTING COMMANDS

```bash
# Run unit tests
npm test server/services/__tests__/actual-metrics-calculator.test.ts

# Run load tests
npm test tests/load/metrics-performance.test.ts

# Test auth on cache invalidation
curl -X POST http://localhost:5000/api/funds/1/metrics/invalidate
# Should return 401 Unauthorized

# Verify metrics work end-to-end
curl http://localhost:5000/api/funds/1/metrics | jq

# Check cache hit
curl http://localhost:5000/api/funds/1/metrics # First call
curl http://localhost:5000/api/funds/1/metrics # Should be faster
```

---

**Total Estimated Time**: 6-8 hours
**Priority Order**: 1 → 2 → 3 → 4 → 5 → 6

Start with fixes #1 and #2 (security + UX) - these take only 1 hour total and unblock testing.
