---
status: ACTIVE
audience: both
last_updated: 2025-12-29
owner: 'Platform Developer'
review_cadence: P60D
categories: [tech-debt, architecture, financial-calculations]
keywords: [xirr, consolidation, excel-parity, financial-accuracy]
agent_routing:
  priority: 1
  use_cases: [task_execution, capability_discovery]
requires_update_trigger:
  - event: 'xirr_consolidation_complete'
    action: 'Update status to REFERENCE'
related_code:
  - 'client/src/lib/finance/xirr.ts'
  - 'client/src/lib/xirr.ts'
  - 'client/src/core/selectors/xirr.ts'
  - 'server/services/actual-metrics-calculator.ts'
---

# XIRR Consolidation Roadmap

## Executive Summary

**Problem**: 6 XIRR implementations identified across codebase, creating
maintenance burden, inconsistent behavior, and Excel parity drift.

**Solution**: Consolidate to single canonical implementation
(`client/src/lib/finance/xirr.ts`) with safe wrappers for all use cases.

**Impact**:

- Reduce XIRR code from ~1,330 lines to ~400 lines (70% reduction)
- Eliminate 4 duplicate implementations
- Standardize error handling across client and server
- Improve Excel parity consistency

---

## Implementation Inventory

### 1. `client/src/lib/finance/xirr.ts` (306 lines) - CANONICAL ✓

**Status**: KEEP - This is the source of truth

**Key Features**:

- Function:
  `xirrNewtonBisection(flows, guess, tolerance, maxIterations, strategy)`
- Strategy: Hybrid (Newton → Brent → Bisection)
- Error handling: Returns `{ irr: null, converged: false }` on failure
- Return type:
  `XIRRResult { irr: number | null, converged: boolean, iterations: number, method: string }`
- Brent solver integration for pathological cases
- UTC-normalized dates with 365.25 day count (Excel parity)
- Rate clamping: [-99.9999%, +900%]

**Current Callers** (8):

```typescript
// Production code
client/src/workers/analytics.worker.ts:1
client/src/lib/cashflow/generate.ts:1 (type import only)

// Test files
tests/unit/xirr-golden-set.test.ts:18
tests/unit/analytics-xirr.test.ts:2
tests/unit/truth-cases/xirr.test.ts:19-20
tests/unit/truth-cases/runner.test.ts:30-31
server/services/__tests__/xirr-golden-set.test.ts:38

// Debug tooling
scripts/debug-xirr.ts:9
```

---

### 2. `client/src/lib/xirr.ts` (358 lines) - SECONDARY ⚠️

**Status**: DEPRECATE - Merge useful utilities into canonical

**Key Features**:

- Function: `calculateXIRR(cashflows, guess, config)`
- Strategy: Hybrid (Newton → Bisection, NO Brent)
- Error handling: Try-catch returns null
- Return type: `number | null`
- Uses Decimal.js for precision (may cause drift vs canonical)
- Includes `buildCashflowSchedule()` and `calculateIRRFromPeriods()` utilities
- Has `calculateSimpleIRR()` for annual cashflows

**Current Callers** (1):

```typescript
client/src/lib/fund-calc.ts:3
  - Import: calculateIRRFromPeriods
  - Usage: Line 125 in calculateKPIs()
  - Context: Fund model KPI calculation
```

**Behavioral Differences from Canonical**:

1. NO Brent solver fallback (less robust for pathological cases)
2. Uses Decimal.js (different precision model)
3. Different tolerance default (1e-6 vs 1e-7)
4. Different return signature (number vs XIRRResult)
5. Aggregates same-day cashflows by default (canonical does not)

---

### 3. `client/src/core/selectors/xirr.ts` (378 lines) - SELECTOR LAYER ⚠️

**Status**: DEPRECATE - Replace with canonical + safe wrappers

**Key Features**:

- Function: `calculateXIRR(cashflows, config)` throws on error
- Function: `safeCalculateXIRR(cashflows, config)` returns null on error
- Strategy: Newton only (NO fallback to bisection/Brent)
- Error handling: Custom `XIRRCalculationError` class
- Return type:
  `XIRRResult { rate: number, iterations: number, converged: boolean }`
- Has `calculateSimpleIRR()` for annual cashflows
- Has `verifyNPV()` utility
- Already has safe wrappers added (recent addition)

**Current Callers** (3):

```typescript
client/src/core/selectors/fund-kpis.ts:27
  - Import: calculateXIRR, XIRRCalculationError
  - Usage: Line 409 in selectIRR()
  - Context: Fund KPI selector
  - Error handling: Try-catch returns 0 on error

client/src/core/selectors/index.ts:46
  - Re-export: calculateSimpleIRR
  - Context: Public selector API

docs/contracts/selector-contract-readme.md (documentation only)
```

**Behavioral Differences from Canonical**:

1. Newton ONLY (no Bisection or Brent fallback) - LESS ROBUST
2. Throws errors instead of returning null
3. Different field names (rate vs irr)
4. Different error type (XIRRCalculationError vs null)
5. No Brent solver integration

---

### 4. `server/services/actual-metrics-calculator.ts` (288 lines) - SERVER INLINE ⚠️

**Status**: DEPRECATE - Replace with shared canonical import

**Key Features**:

- Function: `xirr(cashflows)` (private method, lines 173-212)
- Strategy: Newton only (NO fallback)
- Error handling: Returns `new Decimal(0)` on error (NEVER null)
- Return type: `Decimal`
- Uses Decimal.js throughout
- Inline implementation (40 lines of XIRR logic embedded in service)

**Current Callers** (2):

```typescript
server/services/metrics-aggregator.ts:18
  - Import: ActualMetricsCalculator
  - Usage: Indirect via calculateIRR() method
  - Context: Actual fund metrics calculation

server/services/__tests__/actual-metrics-calculator.test.ts:13
  - Import: ActualMetricsCalculator
  - Context: Unit tests
```

**Behavioral Differences from Canonical**:

1. Returns 0 instead of null on failure (MASKS errors)
2. Different rate bounds check (< -0.99 or > 10)
3. No converged flag returned
4. No iteration tracking
5. Embedded in class (not standalone function)
6. Uses Decimal.js (different precision)

**Critical Issue**: Returning 0 on error is DANGEROUS - caller cannot
distinguish between:

- True 0% IRR
- Calculation failure
- Invalid inputs

---

### 5. `server/services/fund-metrics-calculator.ts` - CAGR APPROXIMATION ℹ️

**Status**: KEEP - This is NOT a real XIRR implementation

**Key Features**:

- Function:
  `calculateSimpleIRR(totalInvested, totalValue, totalDistributions, years)`
  (private)
- Algorithm: CAGR approximation (NOT Newton-Raphson)
- Formula: `(1 + totalReturn)^(1/years) - 1`
- Return type: `number` (clamped to [-0.5, 2.0])
- Use case: Fast approximation for dashboard display

**Note**: This is intentionally NOT a true XIRR calculation. It's a simple CAGR
approximation for performance reasons. Should be renamed to avoid confusion.

---

### 6. `server/services/performance-calculator.ts` - CAGR APPROXIMATION ℹ️

**Status**: KEEP - Duplicate of #5, but consider deduplication

**Key Features**:

- Function:
  `calculateSimpleIRR(totalInvested, totalValue, totalDistributions, years)`
  (private)
- Identical to #5 - EXACT duplicate code
- Use case: Timeseries interpolation where speed > precision

**Note**: Should share implementation with #5 to avoid drift.

---

## Consolidation Strategy

### Phase 1: Establish Canonical API (Week 1)

**Goal**: Extend canonical implementation with all required utilities

#### 1.1 Add Utilities to `finance/xirr.ts`

```typescript
// Add to client/src/lib/finance/xirr.ts

/**
 * Calculate IRR from period results
 * Builds cashflow schedule from period data and calculates XIRR
 */
export function calculateIRRFromPeriods(
  periodResults: PeriodResult[]
): number | null {
  const cashflows = buildCashflowSchedule(periodResults);
  const result = xirrNewtonBisection(cashflows);
  return result.converged ? result.irr : null;
}

/**
 * Build cashflow schedule from period results
 */
export function buildCashflowSchedule(
  periodResults: PeriodResult[]
): CashFlow[] {
  // Move from lib/xirr.ts (lines 310-345)
  // ... implementation ...
}

/**
 * Calculate simple IRR for annual cashflows (CAGR approximation)
 * For performance-critical paths where precision can be traded for speed
 */
export function calculateSimpleIRR(cashFlows: number[]): number {
  // Move from core/selectors/xirr.ts (lines 261-278)
  // ... implementation ...
}

/**
 * Safe wrapper for UI consumption - never throws
 */
export function safeXIRR(
  flows: CashFlow[],
  config?: Partial<XIRRConfig>
): { irr: number | null; error?: string } {
  try {
    const result = xirrNewtonBisection(flows, config?.guess, config?.tolerance);
    return { irr: result.irr };
  } catch (err) {
    return {
      irr: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
```

**Files Modified**:

- `client/src/lib/finance/xirr.ts` (+80 lines)

**Tests Required**:

- Unit tests for `calculateIRRFromPeriods()`
- Unit tests for `buildCashflowSchedule()`
- Parity tests for `calculateSimpleIRR()` vs existing implementations
- Edge case tests for `safeXIRR()`

**Risk**: LOW - Additive only, no breaking changes

---

### Phase 2: Migrate Client Code (Week 2)

#### 2.1 Migrate `lib/fund-calc.ts`

**Current**:

```typescript
import { calculateIRRFromPeriods } from './xirr';
```

**After**:

```typescript
import { calculateIRRFromPeriods } from './finance/xirr';
```

**Files Modified**:

- `client/src/lib/fund-calc.ts` (line 3)

**Tests Affected**:

- Fund model tests (should pass unchanged)

**Risk**: LOW - Function signature identical

**Validation**:

```bash
npm run test -- client/src/lib/fund-calc.test.ts
```

---

#### 2.2 Migrate `core/selectors/fund-kpis.ts`

**Current**:

```typescript
import { calculateXIRR, XIRRCalculationError } from './xirr';

// Line 409
const result = calculateXIRR(cashFlows);
return result.converged ? result.rate : 0;
```

**After**:

```typescript
import { safeXIRR } from '@/lib/finance/xirr';

// Line 409
const { irr } = safeXIRR(cashFlows);
return irr ?? 0;
```

**Behavioral Change**:

- BEFORE: Newton only (no fallback) → throws on hard cases
- AFTER: Newton → Brent → Bisection → returns null

**Impact**: MORE ROBUST - fewer "N/A" IRRs in UI

**Files Modified**:

- `client/src/core/selectors/fund-kpis.ts` (lines 27, 409-417)

**Tests Affected**:

- `client/src/core/selectors/__tests__/fund-kpis.test.ts`

**Risk**: MEDIUM - Behavioral change in fallback strategy

**Validation**:

```bash
npm run test -- client/src/core/selectors/fund-kpis.test.ts
# Should see MORE cases converge (Brent solver helps)
```

---

#### 2.3 Update Re-exports in `core/selectors/index.ts`

**Current**:

```typescript
export { calculateSimpleIRR } from './xirr';
```

**After**:

```typescript
export { calculateSimpleIRR } from '@/lib/finance/xirr';
```

**Files Modified**:

- `client/src/core/selectors/index.ts` (line 46)

**Tests Affected**: None (re-export only)

**Risk**: LOW

---

### Phase 3: Migrate Server Code (Week 3)

#### 3.1 Replace `actual-metrics-calculator.ts` inline XIRR

**Challenge**: Server code cannot import from `client/src/`

**Solution**: Create shared package or copy canonical to `server/lib/finance/`

**Option A: Shared Package** (RECOMMENDED)

```bash
mkdir -p shared/financial
cp client/src/lib/finance/xirr.ts shared/financial/xirr.ts
cp client/src/lib/finance/brent-solver.ts shared/financial/brent-solver.ts
```

**Option B: Server Copy** (Temporary)

```bash
mkdir -p server/lib/financial
cp client/src/lib/finance/xirr.ts server/lib/financial/xirr.ts
cp client/src/lib/finance/brent-solver.ts server/lib/financial/brent-solver.ts
```

**Current Code**:

```typescript
// Lines 173-212: Inline XIRR implementation
private xirr(cashflows: CashFlow[]): Decimal {
  // ... 40 lines of Newton-Raphson ...
  return new Decimal(0); // Returns 0 on failure
}
```

**After**:

```typescript
import { xirrNewtonBisection, type CashFlow } from '@shared/financial/xirr';

private xirr(cashflows: Array<{ date: Date; amount: number }>): Decimal {
  const flows: CashFlow[] = cashflows.map(cf => ({
    date: cf.date,
    amount: cf.amount
  }));

  const result = xirrNewtonBisection(flows);

  if (result.converged && result.irr !== null) {
    return new Decimal(result.irr);
  }

  // CRITICAL: Log failure instead of silently returning 0
  console.warn('[XIRR] Calculation failed for fund metrics', {
    flows: flows.length,
    method: result.method,
    iterations: result.iterations
  });

  return new Decimal(0);
}
```

**Behavioral Changes**:

1. BEFORE: Newton only → returns 0 on failure
2. AFTER: Newton → Brent → Bisection → returns 0 on failure (MORE ROBUST)
3. NEW: Logs when returning 0 (observability)

**Files Modified**:

- `server/services/actual-metrics-calculator.ts` (lines 173-212)
- `shared/financial/xirr.ts` (new file)
- `shared/financial/brent-solver.ts` (new file)

**Tests Affected**:

- `server/services/__tests__/actual-metrics-calculator.test.ts`
- May need to update assertions if more cases now converge

**Risk**: MEDIUM - Server dependency change

**Validation**:

```bash
npm run test -- server/services/__tests__/actual-metrics-calculator.test.ts
# Check: Do previously failing cases now converge?
```

---

#### 3.2 Deduplicate `calculateSimpleIRR()` approximations

**Current**: Two identical implementations in:

- `server/services/fund-metrics-calculator.ts` (lines 56-73)
- `server/services/performance-calculator.ts` (lines 113-126)

**After**: Extract to shared utility

```typescript
// Create: shared/financial/approximations.ts
/**
 * CAGR approximation for IRR
 *
 * WARNING: This is NOT a true XIRR calculation. It uses a simple
 * compound annual growth rate formula for performance reasons.
 *
 * Use only when:
 * - Speed is critical (e.g., timeseries interpolation)
 * - Precision can be sacrificed
 * - Cashflows are approximately annual
 *
 * For accurate IRR: Use xirrNewtonBisection() instead
 */
export function calculateCAGRApproximation(
  totalInvested: number,
  totalValue: number,
  totalDistributions: number,
  years: number
): number {
  if (totalInvested <= 0 || years <= 0) return 0;

  const totalReturn =
    (totalValue + totalDistributions - totalInvested) / totalInvested;
  const annualized = Math.pow(1 + totalReturn, 1 / years) - 1;

  return Math.max(-0.5, Math.min(2.0, annualized));
}
```

**Files Modified**:

- `shared/financial/approximations.ts` (new file)
- `server/services/fund-metrics-calculator.ts` (replace lines 56-73)
- `server/services/performance-calculator.ts` (replace lines 113-126)

**Tests Required**:

- Unit tests for CAGR approximation
- Comparison tests: CAGR vs true XIRR (show when divergence is acceptable)

**Risk**: LOW - Pure refactor, no logic change

---

### Phase 4: Delete Deprecated Code (Week 4)

#### 4.1 Delete `client/src/lib/xirr.ts` (358 lines)

**Prerequisite**: All callers migrated to `finance/xirr.ts`

**Files Deleted**:

- `client/src/lib/xirr.ts`

**Verification**:

```bash
git grep -n "from.*lib/xirr" client/
# Should return ZERO results
```

**Risk**: HIGH if any callers remain

---

#### 4.2 Delete `client/src/core/selectors/xirr.ts` (378 lines)

**Prerequisite**: All callers migrated to `finance/xirr.ts`

**Files Deleted**:

- `client/src/core/selectors/xirr.ts`

**Verification**:

```bash
git grep -n "from.*selectors/xirr" client/
# Should return ZERO results
```

**Risk**: HIGH if any callers remain

---

## Caller Migration Matrix

| Caller File                                    | Current Import       | New Import                         | Risk   | Validation         |
| ---------------------------------------------- | -------------------- | ---------------------------------- | ------ | ------------------ |
| `client/src/lib/fund-calc.ts`                  | `./xirr`             | `./finance/xirr`                   | LOW    | Fund model tests   |
| `client/src/core/selectors/fund-kpis.ts`       | `./xirr`             | `@/lib/finance/xirr`               | MEDIUM | KPI selector tests |
| `client/src/core/selectors/index.ts`           | `./xirr`             | `@/lib/finance/xirr`               | LOW    | Re-export only     |
| `client/src/workers/analytics.worker.ts`       | `@/lib/finance/xirr` | NO CHANGE                          | NONE   | Already canonical  |
| `server/services/actual-metrics-calculator.ts` | Inline code          | `@shared/financial/xirr`           | MEDIUM | Metrics tests      |
| `server/services/fund-metrics-calculator.ts`   | Inline code          | `@shared/financial/approximations` | LOW    | Metrics tests      |
| `server/services/performance-calculator.ts`    | Inline code          | `@shared/financial/approximations` | LOW    | Performance tests  |

---

## Risk Assessment

### High Risk Areas

#### 1. Server Import Path Changes

**Issue**: Server code may not have access to `@/` alias or `client/src/`

**Mitigation**:

- Create `shared/financial/` package accessible to both client and server
- Update tsconfig.json for server to include shared path
- Add to path aliases: `@shared/financial` → `shared/financial`

**Verification**:

```bash
npm run build:server
# Should compile without "Cannot find module" errors
```

---

#### 2. Behavioral Changes in IRR Calculation

**Issue**: Canonical has Brent solver; deprecated versions do not

**Impact**: More cases will converge (GOOD), but results may differ slightly

**Mitigation**:

- Add comparison tests: Before vs After for known edge cases
- Set tolerance threshold: Differences < 1 bp acceptable
- Document expected changes in migration notes

**Verification**:

```bash
npm run test:xirr-parity
# Compare: Old implementation vs New for 100+ test cases
```

---

#### 3. Error Handling Differences

**Issue**: Different error semantics across implementations

- `finance/xirr.ts`: Returns null
- `lib/xirr.ts`: Returns null (via try-catch)
- `selectors/xirr.ts`: Throws error OR returns null (safe wrapper)
- `actual-metrics-calculator.ts`: Returns 0 (DANGEROUS)

**Impact**: Callers expecting 0 will break if they now get null

**Mitigation**:

- Audit all IRR consumers for null handling
- Add linting rule: "XIRR result must be null-checked"
- Update documentation: "0 is a valid IRR; use null for failure"

**Callers to Audit**:

```typescript
// BEFORE (actual-metrics-calculator.ts)
const irr = this.xirr(cashflows); // Returns 0 on failure
return { irr: irr.toNumber() }; // 0 returned to client

// AFTER (canonical)
const result = xirrNewtonBisection(cashflows);
return { irr: result.irr ?? 0 }; // Explicit null coalescing
```

---

### Medium Risk Areas

#### 1. Decimal.js Precision Differences

**Issue**: Some implementations use Decimal.js; canonical uses native number

**Impact**: Results may differ beyond Excel tolerance (1e-7)

**Mitigation**:

- Run golden set tests: Compare Decimal.js vs native for all 100+ cases
- If drift > 1e-7: Keep Decimal.js in canonical (breaking change to improve
  parity)
- Document: "Native number precision sufficient for Excel parity"

**Verification**:

```bash
npm run test:golden-set
# Check: Max deviation across all test cases
```

---

#### 2. Same-Day Cashflow Aggregation

**Issue**: `lib/xirr.ts` aggregates same-day cashflows by default; canonical
does not

**Impact**: Results may differ if multiple cashflows on same date

**Mitigation**:

- Add optional `aggregateSameDay` flag to canonical
- Default: false (canonical behavior)
- Migration guide: "If you relied on same-day aggregation, pass config flag"

**Affected Callers**:

- `client/src/lib/fund-calc.ts` (check if period results can have same-day CFs)

---

## Test Coverage Requirements

### Unit Tests (New)

```typescript
// tests/unit/xirr-consolidation.test.ts
describe('XIRR Consolidation', () => {
  it('calculateIRRFromPeriods matches old lib/xirr implementation', () => {
    // Compare outputs for 50+ period result datasets
  });

  it('safeXIRR never throws, always returns null on error', () => {
    // Pathological inputs: all positive, all negative, invalid dates
  });

  it('buildCashflowSchedule matches old implementation', () => {
    // Compare cashflow schedules for 20+ period configurations
  });

  it('canonical handles Decimal.js edge cases', () => {
    // Test: Large numbers, high precision, rounding
  });
});
```

### Integration Tests (Existing - Should Pass Unchanged)

- `tests/unit/xirr-golden-set.test.ts` (100+ Excel-validated cases)
- `tests/unit/truth-cases/xirr.test.ts` (Truth case validation)
- `client/src/lib/__tests__/fund-calc.test.ts` (Fund model tests)
- `client/src/core/selectors/__tests__/fund-kpis.test.ts` (KPI tests)
- `server/services/__tests__/actual-metrics-calculator.test.ts` (Server tests)

### Regression Tests (New)

```bash
# Create baseline before migration
npm run test:xirr > baseline-before.txt

# Run after each phase
npm run test:xirr > baseline-phase1.txt
diff baseline-before.txt baseline-phase1.txt
# Expect: Only new tests added, no failures
```

---

## Deprecation Timeline

### Week 1: Preparation

- [ ] Extend canonical with utilities (Phase 1)
- [ ] Create `shared/financial/` package
- [ ] Add deprecation warnings to old implementations
- [ ] Write migration guide

### Week 2: Client Migration

- [ ] Migrate `lib/fund-calc.ts` (Phase 2.1)
- [ ] Migrate `core/selectors/fund-kpis.ts` (Phase 2.2)
- [ ] Update re-exports (Phase 2.3)
- [ ] Run full client test suite

### Week 3: Server Migration

- [ ] Replace `actual-metrics-calculator.ts` inline XIRR (Phase 3.1)
- [ ] Deduplicate `calculateSimpleIRR()` (Phase 3.2)
- [ ] Run full server test suite
- [ ] Integration testing (client + server)

### Week 4: Cleanup

- [ ] Delete `client/src/lib/xirr.ts` (Phase 4.1)
- [ ] Delete `client/src/core/selectors/xirr.ts` (Phase 4.2)
- [ ] Update documentation
- [ ] Remove deprecation warnings from canonical

### Week 5: Validation

- [ ] Run full test suite (100% pass rate)
- [ ] Excel parity validation (golden set)
- [ ] Performance benchmarks (ensure no regression)
- [ ] Documentation review

---

## Success Metrics

### Code Quality

- [ ] Lines of XIRR code reduced by 70% (1,330 → ~400)
- [ ] Test coverage maintained at 100% for XIRR functions
- [ ] Zero linting warnings in migrated code

### Excel Parity

- [ ] All 100+ golden set tests pass (tolerance: 1e-7)
- [ ] No regressions in truth case validation
- [ ] Deviation report: Max < 1bp across all test cases

### Robustness

- [ ] Convergence rate improves (Brent solver helps hard cases)
- [ ] Zero instances of "returns 0 on error" pattern
- [ ] All IRR consumers have explicit null handling

### Performance

- [ ] XIRR calculation time < 5ms (p95) for typical cases
- [ ] Monte Carlo simulations maintain current throughput
- [ ] Server metrics endpoints meet SLA (< 200ms p95)

---

## Rollback Plan

### If Migration Fails

**Phase 1 Rollback**: Delete new utilities, revert imports

- Risk: LOW - No breaking changes yet

**Phase 2 Rollback**: Revert client imports to old paths

```bash
git checkout HEAD~1 -- client/src/lib/fund-calc.ts
git checkout HEAD~1 -- client/src/core/selectors/fund-kpis.ts
```

**Phase 3 Rollback**: Revert server code

```bash
git checkout HEAD~1 -- server/services/actual-metrics-calculator.ts
```

**Phase 4 Rollback**: Restore deleted files

```bash
git checkout HEAD~1 -- client/src/lib/xirr.ts
git checkout HEAD~1 -- client/src/core/selectors/xirr.ts
```

---

## Open Questions

1. **Should we keep Decimal.js in canonical?**
   - Pros: May improve precision for edge cases
   - Cons: Adds dependency, slower than native number
   - Decision: Run golden set comparison first

2. **Should `calculateSimpleIRR()` be renamed to `calculateCAGR()`?**
   - Pros: Clearer intent (not true IRR)
   - Cons: Breaking change for existing callers
   - Decision: Rename in Phase 3.2

3. **Should we add TypeScript strict null checks?**
   - Pros: Catches null handling bugs at compile time
   - Cons: May require extensive refactoring
   - Decision: Separate effort after consolidation

4. **Should server and client share same XIRR code?**
   - Pros: Single source of truth
   - Cons: Server may need different optimizations
   - Decision: Share initially, fork if performance issues arise

---

## Next Steps

1. **Review this roadmap** with team (30 min)
2. **Run baseline tests** to establish current behavior
3. **Create feature branch**: `xirr-consolidation`
4. **Start Phase 1**: Extend canonical with utilities
5. **Daily standup**: Migration status + blockers

---

## Appendix: Code Snippets

### A. Canonical XIRR Interface

```typescript
// client/src/lib/finance/xirr.ts

export interface CashFlow {
  date: Date;
  amount: number;
}

export interface XIRRResult {
  irr: number | null;
  converged: boolean;
  iterations: number;
  method: 'newton' | 'bisection' | 'brent' | 'none';
}

export function xirrNewtonBisection(
  flows: CashFlow[],
  guess?: number,
  tolerance?: number,
  maxIterations?: number,
  strategy?: 'hybrid' | 'newton' | 'bisection'
): XIRRResult;
```

### B. Safe Wrapper Pattern

```typescript
// For UI components that should never crash
import { safeXIRR } from '@/lib/finance/xirr';

const { irr, error } = safeXIRR(cashFlows);

if (irr !== null) {
  displayIRR(irr);
} else {
  console.warn('IRR calculation failed:', error);
  displayPlaceholder('N/A');
}
```

### C. Server Import Pattern

```typescript
// server/services/my-service.ts
import { xirrNewtonBisection, type CashFlow } from '@shared/financial/xirr';

const result = xirrNewtonBisection(flows);

if (result.converged && result.irr !== null) {
  return result.irr;
} else {
  logger.warn('XIRR failed to converge', {
    method: result.method,
    iterations: result.iterations,
  });
  return null; // Explicit null, NOT 0
}
```

---

## References

- ADR-005: XIRR Excel Parity
- Golden Set Test Cases: `tests/unit/xirr-golden-set.test.ts`
- Truth Cases: `tests/unit/truth-cases/xirr.test.ts`
- Brent Solver: `client/src/lib/finance/brent-solver.ts`
