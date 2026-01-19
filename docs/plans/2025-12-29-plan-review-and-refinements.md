---
status: HISTORICAL
last_updated: 2026-01-19
---

# Phoenix Phases 1.4-1.7 Plan Review: Critical Oversights & Refinements

**Review Date:** 2025-12-29
**Original Plan:** `docs/plans/2025-12-29-phoenix-phases-1.4-1.7-completion.md`
**Status:** REQUIRES SIGNIFICANT REVISION

---

## Executive Summary

Critical review of the implementation plan reveals **7 major oversights** that would cause plan failure if not addressed. The plan incorrectly assumes infrastructure must be built from scratch when it already exists, uses wrong file paths, and underestimates semantic complexity in the Capital Allocation module.

---

## Critical Oversights

### 1. Adapters Already Exist (Tasks 1.4.1, 1.5.1 REDUNDANT)

**Plan assumes:** Create new adapters from scratch
**Reality:** Fully implemented adapters already exist

| Adapter | Location | Lines | Status |
|---------|----------|-------|--------|
| `capital-allocation-adapter.ts` | `tests/unit/truth-cases/` | 322 | COMPLETE |
| `exit-recycling-adapter.ts` | `tests/unit/truth-cases/` | 455 | COMPLETE |
| `fee-adapter.ts` | `tests/unit/truth-cases/` | Exists | Reference |
| `waterfall-ledger-adapter.ts` | `tests/unit/truth-cases/` | Exists | Reference |

**Impact:** Tasks 1.4.1 and 1.5.1 can be reduced to "Review existing adapter" (30 min vs 2+ hours).

---

### 2. Capital Allocation Test File Already Exists

**Plan assumes:** Create `tests/truth-cases/capital-allocation.test.ts`
**Reality:** Comprehensive test file exists at `tests/unit/truth-cases/capital-allocation.test.ts` (422 lines)

**Existing features:**
- Skip logic for CA-005 (deferred to Phase 2)
- Pacing model handling for CA-007 through CA-020
- Allocation overrides for semantic discrepancies
- Pass rate summary tracking
- Unit inference and scale handling

**Impact:** Task 1.4.3 becomes "Run existing tests and capture baseline" not "Write new test suite".

---

### 3. Wrong File Paths Throughout Plan

**Plan uses:** `tests/truth-cases/adapters/`
**Correct path:** `tests/unit/truth-cases/`

All code examples and file references in the plan use incorrect paths.

---

### 4. Exit Recycling Test File MISSING

**Plan assumes:** Test file exists or will be created like capital-allocation
**Reality:** No `exit-recycling.test.ts` exists - must be created

The adapter exists but the test runner does not.

**Impact:** Task 1.5.3 requires creating a new test file from scratch (not just running existing).

---

### 5. Semantic Model Complexity Underestimated

**Plan assumes:** 100% TRUTH_CASE_ERROR pattern like XIRR/Fees
**Reality:** Capital Allocation has fundamental semantic discrepancies

**Evidence from existing test file:**

```typescript
// SEMANTIC DISCREPANCY:
// Truth case JSON expects 80M allocation (capacity model: commitment - reserve)
// But engine implements cash model: ending_cash - reserve = 20 - 20 = 0M

const ALLOCATION_OVERRIDES: Record<string, Array<{ cohort: string; amount: number }>> = {
  // CA-001: Truth case expects 80M (capacity model), engine produces 0M (cash model)
  'CA-001': [{ cohort: '2024', amount: 0 }],
};
```

**Two distinct models exist:**
1. **Cash Model** (engine implements): `allocation = ending_cash - reserve`
2. **Capacity Model** (truth cases expect): `allocation = commitment - reserve`

**Affected cases:** CA-001 uses capacity model, CA-002/CA-003 use cash model

**Impact:** May require Phase 1B (bug fix) not Phase 1A (cleanup) for some scenarios.

---

### 6. Period-Loop Architecture Not Addressed

**Plan assumes:** Simple adapter + production function pattern
**Reality:** Two distinct execution engines exist

```typescript
const PACING_MODEL_CASES = new Set([
  'CA-007', 'CA-008', 'CA-009', 'CA-010', 'CA-011',
  'CA-012', 'CA-013', 'CA-014', 'CA-015', 'CA-016',
  'CA-017', 'CA-018', 'CA-019', 'CA-020'
]);

// Use period-loop engine for pacing model cases
if (PACING_MODEL_CASES.has(tc.id)) {
  const periodLoopResult = executePeriodLoop(normalizedInput);
  const result = convertPeriodLoopOutput(normalizedInput, periodLoopResult);
}
```

**Impact:** 14 of 20 cases (70%) use different execution path.

---

### 7. Production Code Functions Wrong

**Plan assumes:** `calculateCapitalAllocation(input)`
**Reality:** Three distinct functions:
- `executeCapitalAllocation(normalizedInput)` - Cash model
- `executePeriodLoop(normalizedInput)` - Pacing model
- `adaptTruthCaseInput(rawInput)` - Input normalization

---

## Revised Task Structure

### Phase 1.4: Capital Allocation (REVISED)

| Original Task | Revised Task | Change |
|---------------|--------------|--------|
| 1.4.1: Create adapter | 1.4.1: Review existing adapter | -2 hours |
| 1.4.2: Map production code | 1.4.2: Document existing mappings | -1 hour |
| 1.4.3: Write test suite | 1.4.0: Run existing tests, capture baseline | Different approach |
| 1.4.4: Triage failures | 1.4.3: Analyze semantic discrepancies | More complex |
| 1.4.5: Fix truth cases | 1.4.4: Decide: fix truth cases OR fix engine | Decision required |
| 1.4.6: Validate 100% | 1.4.5: Validate with documented exceptions | Realistic target |

**New Task 1.4.0: Run Existing Tests and Capture Baseline**

```bash
npm test -- tests/unit/truth-cases/capital-allocation.test.ts --run --reporter=verbose
```

Capture:
- Current pass rate (expect 15-50% based on code comments)
- Specific failure categories
- Semantic model classification per case

---

### Phase 1.5: Exit Recycling (REVISED)

| Original Task | Revised Task | Change |
|---------------|--------------|--------|
| 1.5.1: Create adapter | 1.5.1: Review existing adapter | -2 hours |
| 1.5.2: Map production code | 1.5.2: Verify existing mappings | Already done in adapter |
| 1.5.3: Write test suite | 1.5.3: CREATE test runner (file doesn't exist) | Required work |

**New Task 1.5.0: Create exit-recycling.test.ts**

Must create new test file following pattern from `capital-allocation.test.ts`:

```typescript
// tests/unit/truth-cases/exit-recycling.test.ts
import { describe, it, expect } from 'vitest';
import {
  adaptExitRecyclingTruthCase,
  executeExitRecyclingTruthCase,
  validateExitRecyclingResult,
  type ExitRecyclingTruthCase,
} from './exit-recycling-adapter';
import exitCases from '../../../docs/exit-recycling.truth-cases.json';

describe('Exit Recycling Truth Cases', () => {
  const cases = exitCases as ExitRecyclingTruthCase[];

  cases.forEach((tc) => {
    it(`${tc.id}: ${tc.description}`, () => {
      const result = executeExitRecyclingTruthCase(tc);
      const validation = validateExitRecyclingResult(result, tc);

      if (!validation.pass) {
        console.log(`Failures: ${validation.failures.join(', ')}`);
      }
      expect(validation.pass).toBe(true);
    });
  });
});
```

---

## Revised Time Estimates

| Phase | Original Estimate | Revised Estimate | Change |
|-------|-------------------|------------------|--------|
| 1.4 (CA) | 3-4 hours | 4-6 hours | +2 hrs (semantic complexity) |
| 1.5 (ER) | 3-4 hours | 2-3 hours | -1 hr (adapter exists) |
| 1.6 (Precision) | 2 hours | 2 hours | No change |
| 1.7 (Final) | 1-2 hours | 1-2 hours | No change |
| **TOTAL** | **9-12 hours** | **9-13 hours** | Slight increase |

---

## Risk Reassessment

### NEW Risk: Semantic Model Divergence

**Probability:** HIGH (evidence in code)
**Impact:** MEDIUM-HIGH

The Capital Allocation module has fundamental discrepancies between:
- Truth case expectations (capacity model)
- Engine implementation (cash model)

**Mitigation options:**
1. **Document and accept** - Use ALLOCATION_OVERRIDES pattern, document in ADR
2. **Fix truth cases** - Change expected values to match cash model
3. **Fix engine** - Add capacity model support (Phase 1B work)

**Recommendation:** Option 1 for Phase 1.4, defer engine changes to Phase 2.

---

### NEW Risk: Period-Loop Coverage

**Probability:** HIGH
**Impact:** MEDIUM

14 of 20 CA cases require period-loop engine, which may have different validation patterns.

**Mitigation:** Test period-loop cases separately, document edge cases.

---

## Recommended Plan Changes

### Immediate (Before Execution)

1. **Update all file paths** from `tests/truth-cases/` to `tests/unit/truth-cases/`

2. **Add Task 1.4.0**: Run existing capital-allocation.test.ts first
   ```bash
   npm test -- tests/unit/truth-cases/capital-allocation.test.ts --run
   ```

3. **Create exit-recycling.test.ts** as Task 1.5.0 (test file missing)

4. **Add semantic analysis step** before triage to classify discrepancy types

5. **Update success criteria**:
   - CA: 19/20 realistic (CA-005 deferred, semantic discrepancies documented)
   - ER: 20/20 target (simpler validation pattern)

### Documentation Updates

1. **Create CA-SEMANTIC-MODEL-ADR.md** documenting capacity vs cash model decision
2. **Update phase0-validation-report.md** with semantic discrepancy section
3. **Add ALLOCATION_OVERRIDES rationale** to validation report

---

## Corrected Quick Start

```bash
# Step 1: Run existing CA tests to get baseline
npm test -- tests/unit/truth-cases/capital-allocation.test.ts --run --reporter=verbose

# Step 2: Create ER test file (adapter exists, test runner doesn't)
# See template above

# Step 3: Run ER tests
npm test -- tests/unit/truth-cases/exit-recycling.test.ts --run --reporter=verbose

# Step 4: Analyze semantic discrepancies
# Review ALLOCATION_OVERRIDES in capital-allocation.test.ts
# Decide: fix truth cases vs document exceptions

# Step 5: Run full truth case suite
npm test -- tests/unit/truth-cases/ --run
```

---

## Conclusion

The original plan made reasonable assumptions but missed that:
1. **Infrastructure already exists** (adapters, test files)
2. **Semantic complexity is higher than XIRR/Fees** (two execution models)
3. **Exit Recycling test runner must be created** (adapter exists, tests don't)

With these refinements, Phase 1.4-1.7 remains achievable but requires more nuanced handling of Capital Allocation semantic discrepancies.

**Revised Confidence:** MEDIUM-HIGH (was HIGH)
**Primary Risk:** Semantic model divergence requiring Phase 1B work

---

**Review Author:** Claude Code (using extended-thinking-framework skill)
**Review Status:** COMPLETE - Plan requires updates before execution
