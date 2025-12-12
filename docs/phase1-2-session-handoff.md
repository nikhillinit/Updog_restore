# Phase 1.2 Session Handoff

**Date:** 2025-12-11 **Session:** Phase 1.2 Systematic Investigation (Partial
Completion) **Branch:** `phoenix/phase0-truth-cases` **Latest Commit:**
`99dd7aa9` - Test 13 fix applied

---

## Session Summary

**Objective:** Investigate 8 failing XIRR tests with systematic approach (Excel
→ Test Data → Solver)

**Status:** **PARTIAL COMPLETION** - 1/8 tests fixed, 7 remaining

**Achievement:** Created comprehensive investigation framework and fixed Test 13
(highest priority, 8625 bps delta)

---

## What Was Accomplished

### 1. Investigation Framework Created ✅

**Tools Built:**

- **[scripts/debug-xirr.ts](../scripts/debug-xirr.ts)** - Full debug harness
  with NPV/dNPV computation, closed-form validation
- **[scripts/export-failing-cases.ts](../scripts/export-failing-cases.ts)** -
  Export failing tests to CSV/JSON for Excel
- **[scripts/investigate-test13.ts](../scripts/investigate-test13.ts)** -
  Deep-dive analysis of Test 13
- **[scripts/investigate-all-failures.ts](../scripts/investigate-all-failures.ts)** -
  Batch investigation framework (ready to use)

**Documentation:**

- **[docs/phase1-2-investigation-summary.md](phase1-2-investigation-summary.md)** -
  Comprehensive findings, methodology, next steps

**Data Exports:**

- **[docs/xirr-failing-cases-export.json](../docs/xirr-failing-cases-export.json)** -
  All 8 failing test cases with cashflows

### 2. Test 13 Investigation & Fix ✅

**Problem Identified:**

- Expected IRR: 4.2843 (428.43%) - **MATHEMATICALLY WRONG**
- Closed-form IRR: 5.1468 (514.68%) - **CORRECT**
- Solver output: 5.1468 (514.68%) - **MATCHES CLOSED-FORM** ✓

**Analysis:**

```
Cashflows:
  2020-02-28: -$10,000,000 (investment)
  2020-03-01: +$10,100,000 (return)

Multiple: 1.01x (1% gain)
Days: 2 (crosses Feb 29 leap day)
Years (365 denominator): 2/365 = 0.005479

Closed-form: (1.01 ^ (365/2)) - 1 = 5.14682311 ✓
NPV at 5.1468: ~0 ✓
NPV at 4.2843: +$8,350 (wrong rate) ✗
```

**Fix Applied:**

- Updated `docs/xirr.truth-cases.json`:
  - `expectedIRR`: 4.284325690000001 → 5.14682311
  - `expected.irr`: 4.284325690000001 → 5.14682311
  - `algorithm`: "Newton" → "newton" (case fix)
  - Added explanation in notes field

**Verification:**

- Test now **PASSES** ✅
- NPV ≈ 0 at new expected value
- Closed-form matches solver exactly

### 3. Pass Rate Improvement ✅

**Before:** 36/51 (70.6%), 15 failures **After:** 37/51 (72.5%), 14 failures
**Improvement:** +1 test, +1.9 percentage points

---

## Remaining Work (7 Tests)

### High-Priority 2-Flow Cases (Likely Truth Bugs)

Based on Test 13 pattern, these are **very likely** truth case bugs:

#### 1. Golden Case 2: Rapid 3x - **LIKELY TRUTH BUG** (Math Check)

- **Symptom:** Expected 0.2988 (30%), Actual 0.4418 (44%), Δ = 1430 bps
- **Math Check:** 3x over 3 years → IRR = (3^(1/3)) - 1 = 44.22% ✓
- **Verdict:** Solver (44.18%) matches closed-form. Expected (29.88%) is wrong.
- **Action:** Run debug harness, update expected IRR to ~0.4418

#### 2. Golden Case 9: Extreme Unicorn - **LIKELY TRUTH BUG** (Math Check)

- **Symptom:** Expected 1.0308 (103%), Actual 1.1529 (115%), Δ = 1221 bps
- **Math Check:** 100x over 6 years → IRR = (100^(1/6)) - 1 = 115.44% ✓
- **Verdict:** Solver (115.29%) matches closed-form. Expected (103.08%) is
  wrong.
- **Action:** Run debug harness, update expected IRR to ~1.1529

### Multi-Flow Cases (Need Excel Validation)

#### 3. Test 21: Typical VC Fund - **LIKELY TRUTH BUG**

- **Symptom:** Expected 0.1846 (18.46%), Actual 0.1641 (16.41%), Δ = 205 bps
- **Analysis:** NPV at expected (-$966k) is far from zero, NPV at solver
  (+$6.2k) ≈ 0
- **Action:** Excel validation required (8 cashflows), likely update to 16.41%

#### 4. Golden Case 3: Multi-Stage Exit

- **Symptom:** Δ = 668 bps
- **Cashflows:** 3 flows
- **Action:** Excel validation required

#### 5. Golden Case 10: Alternating Signs

- **Symptom:** Δ = 473 bps
- **Cashflows:** 3 flows (follow-on investment pattern)
- **Action:** Excel validation required

#### 6. Golden Case 11: Leap Year Precision

- **Symptom:** Δ = 384 bps
- **Cashflows:** 3 flows spanning Feb 29, 2024
- **Pattern:** Similar to Test 13 (leap year date handling)
- **Action:** Likely truth bug, validate in Excel

#### 7. Golden Case 12: Annual Dividends

- **Symptom:** Δ = 342 bps
- **Cashflows:** 6 flows (annual dividend pattern)
- **Action:** Excel validation required

---

## Quick Start for Next Session

### Step 1: Run Batch Investigation (5 minutes)

```bash
# This will analyze all 8 cases automatically
npx tsx scripts/investigate-all-failures.ts

# Review results in docs/phase1-2-investigation-results.json
```

**Expected Output:**

- Truth bugs identified: 5-7 cases (based on closed-form matches)
- Needs Excel: 1-3 cases (multi-flow scenarios)

### Step 2: Update Truth Cases (10 minutes)

For each confirmed truth bug:

1. Open `docs/xirr.truth-cases.json`
2. Find test by ID (search for test name)
3. Update BOTH fields:
   - `expectedIRR`: {old value} → {solver IRR}
   - `expected.irr`: {old value} → {solver IRR}
4. Update notes to document correction

**Example (Golden Case 2):**

```json
"expectedIRR": 0.4418,  // was 0.2988
"expected": {
  "irr": 0.4418,       // was 0.2988
  ...
}
```

### Step 3: Excel Validation for Multi-Flow Cases (15-30 minutes)

For cases flagged as "NEEDS_EXCEL":

1. Open Excel
2. Copy cashflows from `docs/xirr-failing-cases-export.csv`
3. Formula: `=XIRR(amounts, dates)`
4. Compare Excel result to:
   - Solver output (from investigation script)
   - Expected value (from JSON)
5. If Excel ≈ solver: Update JSON
6. If Excel ≈ expected: Investigate solver bug (unlikely)

### Step 4: Verify Fixes (5 minutes)

```bash
# Run test suite
npx vitest run tests/unit/truth-cases/xirr.test.ts --reporter=basic

# Check pass rate (target: 43-46/51 = 84-90%)
```

### Step 5: Generate Final Baseline (2 minutes)

```bash
# Save results
npx vitest run tests/unit/truth-cases/xirr.test.ts --reporter=json > docs/phase1-xirr-baseline-1.2-final.json

# Generate heatmap
node scripts/generate-xirr-heatmap.cjs

# Review docs/phase1-xirr-baseline-heatmap.md
```

---

## Files to Use

### Investigation Tools (Ready to Run)

- `scripts/investigate-all-failures.ts` - Batch analysis (RUN THIS FIRST)
- `scripts/debug-xirr.ts` - Manual deep-dive if needed
- `docs/xirr-failing-cases-export.json` - Test data

### Files to Modify

- `docs/xirr.truth-cases.json` - Update expected IRR values

### Files to Create/Update

- `docs/phase1-2-investigation-results.json` - Auto-generated by batch script
- `docs/phase1-xirr-baseline-1.2-final.json` - Final test results
- `docs/phase1-xirr-baseline-heatmap.md` - Final heatmap
- `docs/phase1-2-completion-report.md` - Final summary document

---

## Expected Outcomes

### Conservative Estimate (5 truth bugs)

- Pass rate: 42/51 (82.4%)
- Failures: 9 (3 convergence + 6 other)

### Optimistic Estimate (7 truth bugs)

- Pass rate: 44/51 (86.3%)
- Failures: 7 (3 convergence + 4 other)

### Target (All 7 + tolerance)

- Pass rate: 46/51 (90.2%)
- Failures: 5 (3 convergence + 2 acceptable precision)

---

## Key Insights

### Pattern Confirmed

All 2-flow scenarios investigated show **truth case bugs**, not solver bugs:

- Test 13: Expected off by 8625 bps ✓ FIXED
- Golden 2: Expected likely off by 1430 bps (3x math doesn't match)
- Golden 9: Expected likely off by 1221 bps (100x math doesn't match)

### Solver Validation

- NPV calculations **CORRECT** at all solver outputs
- Closed-form matches solver for 2-flow cases
- Date arithmetic (Actual/365) **CONFIRMED CORRECT**
- No solver bugs found

### Root Cause Hypothesis

Truth cases were bulk-generated in "Phoenix v2.32 Phase 0" with incorrect
expected values. Likely causes:

1. Excel validation was NOT actually performed
2. Wrong date convention used (366 or 365.25 instead of 365)
3. Copy-paste errors between Excel and JSON

---

## Commit Reference

**Commit:** `99dd7aa9` **Message:** "feat(xirr): Phase 1.2 truth case
investigation + Test 13 fix" **Files Changed:**

- `docs/xirr.truth-cases.json` (Test 13 expected IRR updated)
- `docs/phase1-2-investigation-summary.md` (comprehensive analysis)
- `scripts/debug-xirr.ts` (debug harness)
- `scripts/export-failing-cases.ts` (CSV export)
- `scripts/investigate-test13.ts` (Test 13 deep-dive)
- `scripts/investigate-all-failures.ts` (batch framework)
- `docs/xirr-failing-cases-export.json` (test data)

---

## Next Session Checklist

- [ ] Run `scripts/investigate-all-failures.ts` to analyze all 8 cases
- [ ] Update `xirr.truth-cases.json` for confirmed truth bugs (likely 5-7 cases)
- [ ] Perform Excel validation for multi-flow cases (1-3 cases)
- [ ] Re-run test suite to verify fixes
- [ ] Generate final Phase 1.2 baseline and heatmap
- [ ] Create Phase 1.2 completion report
- [ ] Commit all changes
- [ ] Consider Phase 1.3 (tolerance tightening) if pass rate > 90%

---

**Estimated Time to Complete:** 30-60 minutes

**Confidence Level:** **HIGH** that remaining cases follow same pattern (truth
bugs, not solver bugs)

---

**END OF HANDOFF**
