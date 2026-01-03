---
status: ACTIVE
audience: both
last_updated: 2025-12-29
owner: 'Platform Developer'
review_cadence: P90D
categories: [tech-debt, architecture, documentation]
keywords: [xirr, executive-summary, consolidation]
agent_routing:
  priority: 1
  use_cases: [capability_discovery]
related_code:
  - 'client/src/lib/finance/xirr.ts'
---

# XIRR Consolidation Analysis - Executive Summary

**Analysis Date**: 2025-12-29 **Analysis Scope**: Complete XIRR implementation
inventory across client and server code

---

## Quick Facts

- **Total Implementations Found**: 6
- **Lines of Code**: 1,330 lines (across all implementations)
- **Target After Consolidation**: ~400 lines (70% reduction)
- **Duplicate Implementations**: 4 (to be eliminated)
- **Production Callers**: 8 files
- **Test Dependencies**: 7 test suites

---

## Implementation Summary

| #   | File                                           | LOC | Type                   | Status        | Callers  |
| --- | ---------------------------------------------- | --- | ---------------------- | ------------- | -------- |
| 1   | `client/src/lib/finance/xirr.ts`               | 306 | Newton→Brent→Bisection | CANONICAL ✓   | 8        |
| 2   | `client/src/lib/xirr.ts`                       | 358 | Newton→Bisection       | DEPRECATE     | 1        |
| 3   | `client/src/core/selectors/xirr.ts`            | 378 | Newton only            | DEPRECATE     | 3        |
| 4   | `server/services/actual-metrics-calculator.ts` | 40  | Newton only (inline)   | DEPRECATE     | 2        |
| 5   | `server/services/fund-metrics-calculator.ts`   | ~18 | CAGR approx            | KEEP (rename) | Internal |
| 6   | `server/services/performance-calculator.ts`    | ~14 | CAGR approx            | DEDUPLICATE   | Internal |

**Note**: Implementations #5 and #6 are NOT true XIRR calculations - they are
CAGR approximations for performance reasons.

---

## Critical Findings

### 1. Dangerous Error Handling Pattern

**File**: `server/services/actual-metrics-calculator.ts` **Issue**: Returns `0`
on error instead of `null` **Risk**: Cannot distinguish between:

- True 0% IRR (valid result)
- Calculation failure
- Invalid inputs

**Impact**: Metrics may report 0% IRR when they should report "N/A"

---

### 2. Inconsistent Fallback Strategies

| Implementation            | Strategy                   | Robustness |
| ------------------------- | -------------------------- | ---------- |
| Canonical                 | Newton → Brent → Bisection | HIGH       |
| lib/xirr.ts               | Newton → Bisection         | MEDIUM     |
| selectors/xirr.ts         | Newton only                | LOW        |
| actual-metrics-calculator | Newton only                | LOW        |

**Impact**: Different implementations may succeed/fail on same inputs

---

### 3. Precision Drift Risk

**Issue**: Some implementations use Decimal.js, others use native number

**Affected**:

- `lib/xirr.ts` (uses Decimal.js)
- `actual-metrics-calculator.ts` (uses Decimal.js)
- Canonical (uses native number)

**Risk**: Results may differ beyond Excel tolerance (1e-7)

**Mitigation Required**: Run golden set comparison tests

---

## Migration Complexity

### Low Risk (Can migrate immediately)

- `client/src/lib/fund-calc.ts` - Single import change
- `client/src/core/selectors/index.ts` - Re-export update
- `server/services/fund-metrics-calculator.ts` - Extract to shared utility

### Medium Risk (Requires testing)

- `client/src/core/selectors/fund-kpis.ts` - Behavioral change (more robust
  fallback)
- `server/services/actual-metrics-calculator.ts` - Error handling change (0 →
  null)

### High Risk (Requires infrastructure)

- Server code migration - Needs `shared/financial/` package setup

---

## Recommended Approach

### Phase 1: Extend Canonical (1 week)

Add utilities to canonical implementation:

- `calculateIRRFromPeriods()` - From lib/xirr.ts
- `buildCashflowSchedule()` - From lib/xirr.ts
- `calculateSimpleIRR()` - From selectors/xirr.ts
- `safeXIRR()` - New safe wrapper

**Risk**: LOW (additive only)

### Phase 2: Migrate Client (1 week)

Update imports to use canonical:

- fund-calc.ts
- fund-kpis.ts
- index.ts (re-exports)

**Risk**: LOW-MEDIUM (behavioral improvements expected)

### Phase 3: Migrate Server (1 week)

Create shared package and migrate:

- actual-metrics-calculator.ts (replace inline XIRR)
- fund-metrics-calculator.ts (extract CAGR to shared)
- performance-calculator.ts (use shared CAGR)

**Risk**: MEDIUM (infrastructure setup required)

### Phase 4: Cleanup (1 week)

Delete deprecated implementations:

- lib/xirr.ts
- selectors/xirr.ts

**Risk**: HIGH if any callers remain (verification critical)

---

## Expected Benefits

### Code Quality

- 70% reduction in XIRR code (1,330 → ~400 lines)
- Single source of truth for XIRR logic
- Standardized error handling

### Robustness

- Brent solver available for all callers (handles pathological cases)
- Fewer "N/A" IRRs in UI (better convergence)
- Explicit null handling (no silent 0% returns)

### Maintainability

- Excel parity maintained in one place
- Easier to add optimizations (benefits all callers)
- Reduced testing burden (one implementation to validate)

---

## Test Requirements

### Must Pass (Existing)

- Golden set: 100+ Excel-validated cases (tolerance: 1e-7)
- Truth cases: XIRR validation suite
- Fund model tests: KPI calculations
- Server metrics tests: Actual metrics calculator

### Must Create (New)

- Consolidation regression tests (before vs after)
- CAGR approximation comparison (vs true XIRR)
- Null handling edge cases (safe wrapper validation)
- Decimal.js precision comparison (drift analysis)

---

## Decision Points

### 1. Decimal.js in Canonical?

**Question**: Should canonical implementation use Decimal.js for precision?

**Pros**:

- May improve edge case precision
- Matches some existing implementations

**Cons**:

- Adds dependency
- Slower than native number
- Current golden set passes without it

**Recommendation**: Run comparison tests first; only add if drift > 1e-7

---

### 2. CAGR Function Naming

**Question**: Rename `calculateSimpleIRR()` to `calculateCAGR()`?

**Pros**:

- Clearer intent (NOT true IRR)
- Reduces confusion

**Cons**:

- Breaking change for callers
- More code churn

**Recommendation**: Rename in Phase 3 as part of shared utility extraction

---

### 3. Shared Package Location

**Question**: Where should shared XIRR code live?

**Options**: A. `shared/financial/` - New package (RECOMMENDED) B.
`server/lib/financial/` - Server copy C. `client/src/lib/finance/` - Make
accessible to server

**Recommendation**: Option A - Clean separation, accessible to both

---

## Risk Mitigation

### High Risk: Server Import Failures

**Mitigation**:

- Create `shared/financial/` package first
- Update tsconfig for both client and server
- Verify build before migrating code

### Medium Risk: Behavioral Changes

**Mitigation**:

- Add comparison tests (before vs after)
- Document expected improvements (Brent solver)
- Set tolerance threshold (< 1bp acceptable)

### Low Risk: Test Failures

**Mitigation**:

- Run full test suite after each phase
- Create baseline before starting
- Rollback plan ready for each phase

---

## Success Criteria

1. All 100+ golden set tests pass (tolerance: 1e-7)
2. Zero instances of "returns 0 on error" pattern
3. All IRR consumers have explicit null handling
4. 70% reduction in XIRR code achieved
5. Full test coverage maintained

---

## Timeline

- **Week 1**: Extend canonical + create shared package
- **Week 2**: Migrate client code
- **Week 3**: Migrate server code
- **Week 4**: Delete deprecated implementations
- **Week 5**: Final validation + documentation

**Total Duration**: 5 weeks **Effort Estimate**: ~3-4 days (spread across 5
weeks for thorough testing)

---

## Next Actions

1. Review roadmap with team (30 min meeting)
2. Get approval for `shared/financial/` package creation
3. Run baseline tests to establish current behavior
4. Create feature branch: `xirr-consolidation`
5. Start Phase 1: Extend canonical implementation

---

## Files for Review

- **Full Roadmap**:
  `/home/user/Updog_restore/docs/xirr-consolidation-roadmap.md`
- **Current Implementations**:
  - `/home/user/Updog_restore/client/src/lib/finance/xirr.ts` (CANONICAL)
  - `/home/user/Updog_restore/client/src/lib/xirr.ts` (to deprecate)
  - `/home/user/Updog_restore/client/src/core/selectors/xirr.ts` (to deprecate)
  - `/home/user/Updog_restore/server/services/actual-metrics-calculator.ts`
    (lines 173-212)
- **Key Test Suites**:
  - `/home/user/Updog_restore/tests/unit/xirr-golden-set.test.ts`
  - `/home/user/Updog_restore/tests/unit/truth-cases/xirr.test.ts`

---

**Analysis Complete** - Ready for team review and implementation planning.
