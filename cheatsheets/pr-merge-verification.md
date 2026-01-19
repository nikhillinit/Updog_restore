---
status: ACTIVE
last_updated: 2026-01-19
---

# PR Merge Verification - Quick Reference

**Purpose:** Ensure accurate PR readiness assessment by comparing to baseline, not absolute standards

**Core Principle:** Zero NEW regressions > absolute perfection

---

## CRITICAL: Check Baseline FIRST

Before assessing ANY PR as "NOT READY", run this verification protocol.

### Step 1: Establish Main Branch Baseline

```bash
git checkout main
npm test 2>&1 | tee /tmp/main-test-output.txt
```

**Record:**
- Pass rate percentage
- Total tests
- Failing test count
- Known failure categories

**Baseline Snapshot (2025-11-17):**
- **Pass rate:** 74.7% (998/1,337 tests passing)
- **Failing:** 300 tests
- **TypeScript errors:** 450
- **Lint violations:** 22,390

**Known Failure Categories:**
1. Variance tracking schema (27 tests)
2. Integration test infrastructure (31 tests)
3. Client test globals (9+ files)
4. Lint configuration migration

---

### Step 2: Run Feature Branch Tests

```bash
git checkout <feature-branch>
npm test 2>&1 | tee /tmp/feature-test-output.txt
```

---

### Step 3: Compare (Not Absolute)

**Acceptable Merge Criteria:**

| Metric | Baseline | Acceptable Range | Status |
|--------|----------|------------------|--------|
| Test pass rate | 74.7% | >= 73.7% (baseline - 1%) | Compare |
| New regressions | N/A | = 0 (strict) | Investigate |
| TypeScript errors | 450 | <= 450 | Compare |
| Lint violations | 22,390 | Don't introduce new | Track |

**NOT Acceptable Criteria:**
- ❌ "Must have 100% pass rate"
- ❌ "Must have 0 lint errors"
- ❌ "Must fix all preexisting failures"
- ❌ "CI checks must all pass" (without checking if same on main)

---

### Step 4: Categorize Failures

For each failing test on feature branch:

```bash
# Find new failures (on feature but not on main)
comm -13 <(grep "FAIL" /tmp/main-test-output.txt | sort) \
         <(grep "FAIL" /tmp/feature-test-output.txt | sort)
```

**Decision Matrix:**
- **In known preexisting categories?** → BYPASS
- **New failure not on main?** → INVESTIGATE (potential blocker)
- **Test count different?** → Check if new tests added (acceptable)
- **Pass rate improved?** → POSITIVE signal

---

## Known Preexisting Failure Categories

### 1. Variance Tracking Schema (27 tests)

**File:** `tests/unit/database/variance-tracking-schema.test.ts`

**Issue:** Database constraint enforcement not working
- Enum constraints bypassed (promises resolve instead of reject)
- Check constraints not enforced (period_end > period_start)
- JSONB field handling broken
- Database indexes missing
- Views returning empty results
- Triggers not firing

**Status:** Preexisting since initial implementation

**Bypass for PR merge?** ✅ YES

---

### 2. Integration Test Infrastructure (31 tests)

**Files:**
- `tests/integration/flags-hardened.test.ts` (14 tests)
- `tests/integration/flags-routes.test.ts` (17 tests)
- `tests/integration/reserve-alerts.test.ts`
- `tests/integration/variance-tracking-api.test.ts`
- `tests/integration/flags-rbac.test.ts`

**Issue:** Test server/request setup problems
- Error: "Cannot read properties of undefined (reading 'status')"
- Root cause: Server initialization or request mock setup

**Status:** Preexisting on main branch

**Bypass for PR merge?** ✅ YES

---

### 3. Client Test Globals (9+ files)

**Error:** `ReferenceError: expect is not defined`

**Affected Files:**
- `tests/pages/PortfolioReallocationPage.test.tsx`
- `tests/components/FundSetup.test.tsx`
- `tests/unit/capital-allocation-step.test.tsx`
- `tests/unit/fund-setup-basic.test.tsx`
- `tests/unit/waterfall-step.test.tsx`
- `tests/unit/components/ai-enhanced-components.test.tsx`
- And more...

**Issue:** jsdom setup missing test globals (expect, describe, it)

**Status:** Preexisting configuration issue

**Bypass for PR merge?** ✅ YES

---

### 4. Lint Baseline (22,390 violations)

**Issues:**
- `.eslintignore` deprecated (ESLintIgnoreWarning)
- "Default Parameters" directory not in `tsconfig.eslint.json`
- 5,722 errors, 16,668 warnings
- 1,378 fixable with `--fix`

**Status:** Preexisting configuration migration needed

**Bypass for PR merge?** ✅ YES (track separately)

---

## Decision Tree

```
PR Ready to Merge?
│
├─ [STEP 1] Run tests on main → Get baseline pass rate (X%)
│
├─ [STEP 2] Run tests on feature → Get feature pass rate (Y%)
│
├─ [STEP 3] Compare: Y >= X - 1%?
│  │
│  ├─ YES → Check for new regressions
│  │  │
│  │  ├─ [STEP 4] New regressions = 0?
│  │  │  ├─ YES → ✅ READY TO MERGE
│  │  │  └─ NO  → Document new failures
│  │  │          ├─ Severity assessment
│  │  │          ├─ Root cause analysis
│  │  │          └─ Decide: blocker or acceptable
│  │  │
│  │  └─ Feature has +N tests (expanded coverage)?
│  │     └─ Acceptable if new tests don't fail
│  │
│  └─ NO → Y < X - 1% (degradation)
│     └─ ❌ INVESTIGATE BLOCKER
│        └─ Why did pass rate drop?
│
└─ [STEP 5] TypeScript errors: Feature <= Baseline?
   ├─ YES → ✅ Acceptable
   └─ NO  → ❌ BLOCKER (new errors introduced, must fix)
```

---

## Quick Commands

### Compare Test Outputs

```bash
# Side-by-side comparison
diff /tmp/main-test-output.txt /tmp/feature-test-output.txt

# Extract pass rates
grep "Tests.*passed" /tmp/main-test-output.txt
grep "Tests.*passed" /tmp/feature-test-output.txt

# Count failures
grep -c "FAIL" /tmp/main-test-output.txt
grep -c "FAIL" /tmp/feature-test-output.txt
```

### Find New Failures

```bash
# Tests failing on feature but passing on main
comm -13 <(grep "FAIL" /tmp/main-test-output.txt | sort) \
         <(grep "FAIL" /tmp/feature-test-output.txt | sort)
```

### Find Fixed Tests

```bash
# Tests that were failing on main but now pass on feature
comm -23 <(grep "FAIL" /tmp/main-test-output.txt | sort) \
         <(grep "FAIL" /tmp/feature-test-output.txt | sort)
```

### TypeScript Error Comparison

```bash
# Main branch
git checkout main
npm run check 2>&1 | tee /tmp/main-tsc-output.txt

# Feature branch
git checkout <feature-branch>
npm run check 2>&1 | tee /tmp/feature-tsc-output.txt

# Compare error counts
grep "Found.*error" /tmp/main-tsc-output.txt
grep "Found.*error" /tmp/feature-tsc-output.txt
```

---

## Red Flags (Don't Do This)

| ❌ Wrong Assessment | ✅ Correct Assessment |
|---------------------|----------------------|
| "299 failing tests = NOT READY" | "Feature has 299 fails vs main's 300 = +0.1% improvement" |
| "Must fix all lint errors before merge" | "Feature doesn't introduce new lint violations = acceptable" |
| "CI checks failing = blocker" | "Are same checks failing on main? If yes, not a regression" |
| "Creating GitHub issues for preexisting failures" | "Tests are self-documenting, track separately from PR" |
| "Blocking merge for technical debt cleanup" | "Separate PR scope from preexisting debt" |
| "Claiming NOT READY without baseline comparison" | "Run tests on both branches, compare evidence" |

---

## Example: PR #218 (Phase 0A)

**Initial Assessment (WRONG):**
- ❌ "299 failing tests = NOT READY TO MERGE"
- ❌ "5,722 lint errors = BLOCKER"
- ❌ "16/44 CI checks failing = NOT READY"

**Corrected Assessment (RIGHT):**
- ✅ Main baseline: 300 failing tests (74.7% pass rate)
- ✅ Feature branch: 299 failing tests (74.8% pass rate)
- ✅ Net improvement: +1 fewer failure, +3 more passing tests
- ✅ New regressions: 0 (all failures preexisting)
- ✅ **Verdict: READY TO MERGE** (improves test health)

**Lesson:** Always compare to baseline before claiming "NOT READY"

---

## When to Update This Guide

Update this cheatsheet when:

- [ ] Main branch baseline improves >5% (e.g., 74.7% → 79%+)
- [ ] Preexisting failure categories are fixed
- [ ] New systematic test infrastructure issues appear
- [ ] Quarterly baseline review (see ADR-014)

**Update Process:**
1. Re-run baseline verification on main branch
2. Update snapshot numbers in this file
3. Update ADR-014 in DECISIONS.md
4. Update CLAUDE.md baseline reference
5. Document change in CHANGELOG.md

---

## Related Documentation

- **ADR-014:** Test Baseline & PR Merge Criteria (DECISIONS.md)
- **ADR-012:** Mandatory Evidence-Based Document Reviews
- **ADR-011:** Anti-Pattern Prevention Strategy
- **CLAUDE.md:** PR verification section in Essential Commands
- **PROJECT-UNDERSTANDING.md:** Source of Truth Hierarchy

---

## Verification-Before-Completion Compliance

This workflow follows the `verification-before-completion` skill:

**NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE**

Before claiming:
- ✅ "Tests pass" → Run `npm test`, check exit code, count failures
- ✅ "No regressions" → Run on both branches, compare output
- ✅ "Ready to merge" → Complete all verification steps above

Never claim:
- ❌ "Should pass now" (run the command)
- ❌ "Looks correct" (verify with evidence)
- ❌ "Probably ready" (execute verification protocol)

---

**Last Baseline Update:** 2025-11-17
**Next Review:** 2026-02-17 (quarterly)
**Maintained by:** Claude Code sessions using ADR-014 as source of truth
