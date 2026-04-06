---
status: ACTIVE
last_updated: 2026-04-06
---

# PR Merge Verification - Quick Reference

**Purpose:** Ensure accurate PR readiness assessment by comparing to baseline,
not absolute standards

**Core Principle:** Zero NEW regressions > absolute perfection

> **Post-stabilization note (2026-04-06)**: Since Milestone 0A-7 landed and the
> TypeScript baseline was retired, the "compare to stale baseline" frame matters
> less than it did in late 2025. Current main is near-green. The protocol below
> is still useful when a PR touches infrastructure or calculation paths where
> main itself has partial failures — but for typical feature PRs, the
> expectation is **zero failing tests on main**, not "improve the baseline." Use
> this cheatsheet when there IS a documented baseline gap on main; otherwise,
> just run `npm run pre-commit-check`.

---

## CRITICAL: Check Baseline FIRST (if one exists)

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

**Current Baseline (2026-04-05, post-stabilization):**

- **Pass rate:** ~97.8% (3,886/3,972 tests passing, 86 skipped)
- **Failing:** 0 (CI-blocking)
- **TypeScript errors baselined:** 0 (`.tsc-baseline.json` cleared)
- **Lint violations:** tracked by `scripts/guardrails/*.mjs` ratchets; lint is
  `--max-warnings 0` on pre-commit
- **Note:** run `npm test` to get the exact current count; the number above
  drifts as suites are added/removed.

**Historical Baseline (2025-11-17, pre-stabilization) — for archival context
only:**

- Pass rate: 74.7% (998/1,337)
- Failing: 300
- TypeScript errors: 450
- Lint violations: 22,390
- Known categories: variance tracking schema, integration test infra, client
  test globals, lint config migration — all since resolved via Milestones 0A-7.

---

### Step 2: Run Feature Branch Tests

```bash
git checkout <feature-branch>
npm test 2>&1 | tee /tmp/feature-test-output.txt
```

---

### Step 3: Compare (Not Absolute)

**Acceptable Merge Criteria (post-stabilization default):**

| Metric              | Expected       | Acceptable Range        | Status                   |
| ------------------- | -------------- | ----------------------- | ------------------------ |
| Test pass rate      | ~97.8% current | No new failures vs main | Compare                  |
| New regressions     | 0              | = 0 (strict)            | Investigate              |
| TypeScript baseline | 0              | = 0 (no new errors)     | `npm run baseline:check` |
| Lint violations     | ratchet        | Don't increase ratchet  | Track via guardrails     |

> If main itself has known failures on the day you run this, use the historical
> "baseline comparison" table instead (see archived snapshot above) and compare
> PR vs main head-to-head. Do not compare against the 74.7% historical number —
> it reflects pre-stabilization state.

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

| ❌ Wrong Assessment                               | ✅ Correct Assessment                                        |
| ------------------------------------------------- | ------------------------------------------------------------ |
| "299 failing tests = NOT READY"                   | "Feature has 299 fails vs main's 300 = +0.1% improvement"    |
| "Must fix all lint errors before merge"           | "Feature doesn't introduce new lint violations = acceptable" |
| "CI checks failing = blocker"                     | "Are same checks failing on main? If yes, not a regression"  |
| "Creating GitHub issues for preexisting failures" | "Tests are self-documenting, track separately from PR"       |
| "Blocking merge for technical debt cleanup"       | "Separate PR scope from preexisting debt"                    |
| "Claiming NOT READY without baseline comparison"  | "Run tests on both branches, compare evidence"               |

---

## Historical Example: PR #218 (Phase 0A, late 2025)

**Context**: This example is from the pre-stabilization era when main had ~300
failing tests. It illustrates the "compare to baseline" principle, but the
numbers are not current.

**Initial Assessment (WRONG):**

- [FAIL] "299 failing tests = NOT READY TO MERGE"
- [FAIL] "5,722 lint errors = BLOCKER"
- [FAIL] "16/44 CI checks failing = NOT READY"

**Corrected Assessment (RIGHT):**

- [OK] Main baseline at the time: 300 failing tests (74.7% pass rate)
- [OK] Feature branch: 299 failing tests (74.8% pass rate)
- [OK] Net improvement: +1 fewer failure, +3 more passing tests
- [OK] New regressions: 0 (all failures preexisting)
- [OK] **Verdict: READY TO MERGE** (improves test health)

**Lesson:** Always compare to baseline before claiming "NOT READY" — even today,
when a PR touches an area with known main-branch gaps.

---

## When to Update This Guide

Update this cheatsheet when:

- [ ] Current baseline (97.8% as of 2026-04-05) materially changes
- [ ] New systematic test infrastructure issues appear on main
- [ ] The TypeScript baseline re-acquires known-error allowances
- [ ] Post-stabilization posture changes (main no longer near-green)

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

**Last Baseline Update:** 2025-11-17 **Next Review:** 2026-02-17 (quarterly)
**Maintained by:** Claude Code sessions using ADR-014 as source of truth
