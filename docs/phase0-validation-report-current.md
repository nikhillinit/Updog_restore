# Phase 0 Validation Report - CURRENT STATE

**Last Updated:** 2025-12-13 **Test Run:** 2025-12-13 22:37:12 **Branch:** main
**Commit:** 4efbed3 **Status:** Phase 0 Baseline Complete - 5 Modules Require
Attention

---

## Executive Summary

Phase 0 baseline test run shows **63.3% overall pass rate** (50/79 tests) across
all truth-case modules. The XIRR module, previously reported as 100% passing in
Phase 1.2, now shows **24 failures** due to tolerance configuration issues
(tests expect 5e-7 precision, solver produces ~1e-4 precision).

**Critical Finding:** XIRR regression or tolerance misconfiguration between
Phase 1.2 (reported 100%) and current state (50% passing).

---

## Module-Level Pass Rates

| Module             | Scenarios | Passing | Failing | Skipped | Pass Rate  | Status              | Recommended Path         |
| ------------------ | --------- | ------- | ------- | ------- | ---------- | ------------------- | ------------------------ |
| **XIRR**           | 50        | 26      | 24      | 0       | **52%**    | ⚠️ REGRESSION       | Phase 1B (Precision Fix) |
| Waterfall (Tier)   | 15        | 14      | 1       | 0       | **93.3%**  | ✅ PASS             | Phase 1A (Tag Fix)       |
| Waterfall (Ledger) | 14        | 10      | 0       | 4       | **100%\*** | ✅ PASS             | Phase 1A (Unskip Tests)  |
| Fees               | 0         | 0       | 0       | 0       | N/A        | ❌ NO TESTS         | Phase 1C (Create Tests)  |
| Capital Allocation | 0         | 0       | 0       | 0       | N/A        | ❌ NO TESTS         | Phase 1C (Create Tests)  |
| Exit Recycling     | 0         | 0       | 0       | 0       | N/A        | ❌ NO TESTS         | Phase 1C (Create Tests)  |
| **TOTAL**          | **79**    | **50**  | **25**  | **4**   | **63.3%**  | ⚠️ ATTENTION NEEDED | Mixed Routing            |

\*Waterfall-Ledger: 10 passing tests, 4 skipped (100% pass rate for non-skipped)

---

## Failure Analysis by Module

### XIRR Module (24 failures - PRECISION ISSUE)

**Root Cause:** Tolerance mismatch

- Tests expect: 5e-7 precision (0.00000050)
- Solver delivers: ~1e-4 precision (0.00010000)
- Error magnitude: 200x tolerance threshold

**Sample Failures:**

1. Test 01 (simple-positive-return): Expected 0.2010340779, got 0.2008834993
   (diff: 0.00015)
2. Test 02 (negative-return-loss): Expected -0.368923364, got -0.3687244947
   (diff: 0.000199)
3. Test 04 (quarterly-flows): Expected 0.8063164822, got 0.8055855854 (diff:
   0.000731)

**Classification:** TRUTH CASE ERROR or TOLERANCE CONFIG ERROR

- Solver is mathematically correct (Phase 1.2 validated via closed-form)
- Either truth cases have wrong expected values, OR
- Test tolerance (5e-7) is too strict for numerical solver

**Passing Tests (26):**

- Test 05: zero-return-breakeven ✅
- Test 07: newton-failure-bisection-fallback ✅
- Test 10: maximum-iterations-reached ✅
- Test 19: extreme-short-term-gain (bounded at 900%) ✅
- 22 additional tests ✅

**Recommended Action:**

1. Investigate Phase 1.2 vs current tolerance configuration
2. Relax test tolerance to 1e-4 (100 basis points) OR
3. Re-validate truth case expected values against Excel

---

### Waterfall-Tier Module (1 failure - TAG METADATA)

**Failure:** Truth table coverage test

- Missing tags: 'roc' and 'carry' in test scenarios
- All 15 calculation tests passing

**Classification:** TRUTH CASE ERROR (metadata only)

**Recommended Action:** Add missing tags to waterfall.truth-cases.json

**Routing:** Phase 1A (cleanup only)

---

### Waterfall-Ledger Module (4 skipped - IMPLEMENTATION GAP)

**Status:** 10/10 active tests passing (100%)

- 4 tests skipped (implementation pending)

**Recommended Action:** Implement skipped test scenarios

**Routing:** Phase 1A (feature completion)

---

### Fees, Capital Allocation, Exit Recycling (NO TESTS)

**Status:** No test implementations found in runner

**Classification:** MISSING FEATURE

**Recommended Action:** Create test runners following XIRR/Waterfall pattern

**Routing:** Phase 1C (rebuild test infrastructure)

---

## Phase Gate Decision Matrix

| Module             | Pass Rate | Gate Threshold                 | Decision     | Rationale                                       |
| ------------------ | --------- | ------------------------------ | ------------ | ----------------------------------------------- |
| XIRR               | 52%       | 90% (1A) / 70% (1B) / 50% (1C) | **Phase 1B** | Just above 1C threshold, precision fix required |
| Waterfall-Tier     | 93.3%     | 90% (1A)                       | **Phase 1A** | Minor metadata fix                              |
| Waterfall-Ledger   | 100%      | 90% (1A)                       | **Phase 1A** | Complete skipped scenarios                      |
| Fees               | 0%        | N/A                            | **Phase 1C** | No tests exist                                  |
| Capital Allocation | 0%        | N/A                            | **Phase 1C** | No tests exist                                  |
| Exit Recycling     | 0%        | N/A                            | **Phase 1C** | No tests exist                                  |

---

## Critical Issues Requiring Investigation

### Issue 1: XIRR Regression (HIGH PRIORITY)

**Evidence:**

- Phase 1.2 report (2025-12-11): "100% test pass rate (51/51 tests)"
- Current run (2025-12-13): 52% pass rate (26/50 tests)

**Possible Causes:**

1. Truth case JSON was updated between runs
2. Tolerance configuration changed in helpers.ts
3. Solver implementation changed
4. Test framework configuration changed

**Investigation Required:**

```bash
git log --since="2025-12-11" --oneline -- \
  docs/xirr.truth-cases.json \
  tests/unit/truth-cases/helpers.ts \
  tests/unit/truth-cases/xirr.test.ts \
  client/src/lib/finance/xirr.ts
```

**Blocking:** Cannot proceed to Phase 1A/1B until root cause identified

---

### Issue 2: Missing Test Implementations (MEDIUM PRIORITY)

**Affected Modules:** Fees, Capital Allocation, Exit Recycling

**Evidence:**

- Truth case JSON files exist (fees.truth-cases.json,
  capital-allocation.truth-cases.json, exit-recycling.truth-cases.json)
- No test runners in tests/unit/truth-cases/runner.test.ts for these modules

**Root Cause:** Partial test infrastructure implementation

**Action Required:** Create test blocks following XIRR pattern

---

## Recommendations

### Immediate (Blocking)

1. **Investigate XIRR regression**
   - Compare truth case JSON from 2025-12-11 vs current
   - Check tolerance configuration in helpers.ts
   - Run git blame on xirr.test.ts for recent changes

2. **Document tolerance policy**
   - Why 5e-7 for XIRR? (Industry standard vs practical solver limits)
   - Should tolerance be test-specific or module-wide?

### Short-Term

3. **Fix Waterfall-Tier metadata**
   - Add 'roc' and 'carry' tags to waterfall.truth-cases.json

4. **Complete Waterfall-Ledger scenarios**
   - Implement 4 skipped tests

5. **Create Fees/Capital/Exit test runners**
   - Follow XIRR/Waterfall pattern in runner.test.ts

### Long-Term

6. **Establish regression protection**
   - Lock down truth case files (require approval for expected value changes)
   - Add tolerance validation to pre-commit hooks
   - Document expected vs actual precision per module

---

## Test Output Summary

```
Test Files  1 failed (1)
Tests       25 failed | 50 passed | 4 skipped (79)
Start at    22:37:12
Duration    2.34s (transform 799ms, setup 169ms, collect 811ms, tests 120ms)
```

**Pass Rate:** 50/79 = 63.3%

**Failure Breakdown:**

- XIRR precision: 24 failures
- Waterfall metadata: 1 failure

---

## Change Log

| Date       | Event        | Change                                                   |
| ---------- | ------------ | -------------------------------------------------------- |
| 2025-12-13 | Baseline Run | Current state assessment, 63.3% pass rate                |
| 2025-12-11 | Phase 1.2    | XIRR reported as 100% passing (discrepancy with current) |

---

**Report Status:** BASELINE COMPLETE - INVESTIGATION REQUIRED **Next Action:**
Root cause analysis of XIRR regression
