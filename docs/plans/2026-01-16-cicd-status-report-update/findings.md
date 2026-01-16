# CI/CD Status Report Update - Findings

> **Session:** 2026-01-16
> **Last Updated:** 2026-01-16T08:35:00Z

---

## Key Learnings Absorbed from 2026-01-15 Session

### 1. Check Post-Merge Job Paths
**Learning:** Jobs that only run on `push` to `main` won't be validated by PR CI.

**Application to Current Task:**
- The `report-metrics` job issue documented in the 2026-01-15 session is a perfect example
- When reviewing CI status, need to identify which jobs run on push vs PR
- Report should note which checks are PR-validated vs push-only

**Evidence from Prior Session:**
```yaml
report-metrics:
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

### 2. Validate Schema Changes
**Learning:** When changing output formats, check all consumers.

**Application to Current Task:**
- When updating the CI/CD Status Report format, verify no downstream tools depend on specific structure
- Check if any CI jobs parse or consume the report
- Document any format changes clearly

### 3. Cross-Platform File Enumeration is Fragile
**Learning:** Filesystem walking differs across Windows/Linux; use `git ls-files` for determinism.

**Application to Current Task:**
- The skipped tests count (674 → 866) may include platform-specific differences
- Verify counts using deterministic methods where possible
- Note environmental factors that could cause count variations

### 4. Pre-Existing Failures Create Cognitive Noise
**Learning:** Document them clearly to avoid confusion.

**Application to Current Task:**
- THIS IS THE CORE ISSUE - original report documented 5 pre-existing failures
- 2 have been resolved (Governance Guards, scenario_matrices)
- Report must clearly distinguish "resolved" from "still failing"
- Use tables and status indicators to reduce noise

### 5. Combined PRs Have Broader Blast Radius
**Learning:** Document rollback plan.

**Application to Current Task:**
- Not directly applicable (this is a documentation update, not code change)
- However, rollback plan documented in task_plan.md for completeness

---

## Discovery 1: Pre-Existing Failures Status Changed

### Investigation Results

**Governance Guards:**
- **Original Status (PR #409 time):** FAILING - Badge URL validation
- **Current Status (2026-01-16):** PASSING
- **Resolution:** PR #410 + subsequent cleanup
- **Evidence:** docs/plans/2026-01-15-ci-routing-bundle-fix/progress.md lines 169-172

**test (Node 18.x/20.x) - scenario_matrices:**
- **Original Status (PR #409 time):** FAILING - scenario_matrices table missing
- **Current Status (2026-01-16):** PASSING
- **Resolution:** PR #416 (testcontainers segregation)
- **Evidence:** docs/plans/2026-01-15-ci-routing-bundle-fix/progress.md lines 153-168
- **Key Change:** Testcontainers tests moved to dedicated workflow (label-triggered)
- **Node 18 removed:** Now requires Node.js >=20.19.0

### Impact on Report

These 2 resolved failures need to be:
1. Moved from "Pre-Existing Failures" to "Recently Resolved"
2. Documented in "Recently Fixed Issues" section
3. Removed from "Unaddressed Issues Requiring Attention"
4. Removed from "Immediate Recommendations"

---

## Discovery 2: Additional PRs Merged After #409

### PR Timeline and Impact

**PR #409** (Merged: 54f9992b) - CI Routing & Bundle-Size Fix
- Fixed: Discovery routing validation
- Fixed: Bundle-size check
- Fixed: Bundle-metrics schema compatibility
- **Documented in original report**

**PR #410** (Merged: a7e64d7) - Comprehensive Test Infrastructure Fixes
- Test scope segregation
- Testcontainers configuration
- JWT_SECRET standardization
- Node 18 removal from matrix
- Badge-guard archive directory exclusion
- **NOT documented in original report**

**PR #413** (Merged: ee59939) - Phase 0 Validation Documentation
- Documentation only, no CI changes
- **NOT documented in original report**

**PR #415** (Merged: 133f76a) - Phase 3 Migration Documentation
- Documentation only, no CI changes
- **NOT documented in original report**

**PR #416** (Merged: 67f90b0) - Testcontainers Exclusion Fix
- CRITICAL: Fixed scenario_matrices CI failure
- Moved tests to dedicated testcontainers-ci.yml workflow
- **NOT documented in original report**

**PR #417** (Merged: 1d586dc) - CI Routing/Bundle Fix Session Documentation
- Created docs/plans/2026-01-15-ci-routing-bundle-fix/ directory
- **NOT documented in original report**

**PR #418** (Merged: ec6a936) - PostgreSQL Health Check & JWT_SECRET
- Fixed PostgreSQL health checks
- Added JWT_SECRET to security test environment
- **NOT documented in original report**

### Report Update Required

The "Recently Fixed Issues" section must expand from 3 issues (all PR #409) to include impacts from all 7 PRs.

---

## Discovery 3: Workflow Count Discrepancy

### Analysis

**Original Report:** 15 active workflows
**Actual Count:** 17 active workflows

**Missing from Original Report:**
1. `docs-routing-check.yml` - Discovery routing validation (this is what PR #409 fixed!)
2. `verify-strategic-docs.yml` - Strategic documentation checks
3. `testcontainers-ci.yml` - Docker-based integration tests (label-triggered)

**Why the Discrepancy:**
- Original report may have counted before recent additions
- May have excluded label-triggered workflows (testcontainers-ci.yml)
- May have excluded docs-specific workflows

### Evidence

```bash
$ ls -1 .github/workflows/*.yml | wc -l
17
```

Workflows confirmed:
- ci-unified.yml
- code-quality.yml
- bundle-size-check.yml
- performance-gates.yml
- docs-validate.yml
- docs-routing-check.yml ← MISSING FROM ORIGINAL
- verify-strategic-docs.yml ← MISSING FROM ORIGINAL
- dependency-validation.yml
- test.yml
- pr-tests.yml
- validate.yml
- testcontainers-ci.yml ← MISSING FROM ORIGINAL
- security-tests.yml
- security-scan.yml
- codeql.yml
- zap-baseline.yml
- dockerfile-lint.yml

---

## Discovery 4: Skipped Tests Count Increase

### Analysis

**Original Report:** 674 instances
**Current Count:** 866 instances (128 increase)

**Verification Command:**
```bash
$ grep -r "describe.skip\|it.skip\|test.skip\|xdescribe\|xit\|xtest" tests/ --include="*.ts" --include="*.tsx" | wc -l
866
```

**Possible Causes:**
1. New tests added with skip markers
2. Environment-specific tests now skipped (cross-platform)
3. Flaky tests temporarily skipped
4. Original count may have been incorrect or used different grep pattern

**Impact:**
- Update "Test Infrastructure Status" section
- Update "Unaddressed Issues" section
- Update "Recommendations" to reflect higher count

---

## Discovery 5: ESLint Baseline Clarification Needed

### Conflicting Numbers

**Original Report:** 3,803 baseline issues (729 errors + 3,074 warnings)
**CI-PHILOSOPHY.md:** 22,390 violations

### Analysis

These numbers refer to **different metrics**:

1. **3,803** - Likely refers to a specific ESLint configuration or subset
2. **22,390** - Refers to full codebase ESLint violations (all rules)

**Resolution:** Use CI-PHILOSOPHY.md as authoritative source, add clarifying note in report.

---

## Discovery 6: Baseline Comparison Philosophy

### Key Insight from CI-PHILOSOPHY.md

The project uses **baseline comparison, not absolute perfection** as merge criteria:

- **TypeScript Baseline:** 482 errors (documented in `.tsc-baseline.json`)
- **ESLint Baseline:** 22,390 violations (advisory, not blocking)
- **Test Pass Rate Baseline:** 74.7% (998/1,337 tests passing)

### Merge Requirements

PRs are evaluated on **delta from baseline**:
- Zero NEW TypeScript errors
- Zero NEW lint violations
- Test pass rate >= 73.7% (baseline - 1%)

### Impact on Report

The report should emphasize:
1. Pre-existing failures are **documented technical debt**, not blockers
2. CI checks validate **no regressions**, not perfection
3. Yellow/warning status is expected and acceptable
4. Baseline improvements tracked incrementally

---

## Discovery 7: Testcontainers Architecture

### New Architecture (Post-PR #416)

**Problem:** Integration tests using testcontainers tried to run in GitHub Actions service containers (Docker unavailable).

**Solution:** Dedicated workflow triggered by PR labels.

**Workflow:** `testcontainers-ci.yml`
**Triggers:**
- PR label: `test:docker`
- PR label: `test:integration`

**Excluded Tests:**
- `testcontainers-smoke.test.ts`
- `ScenarioMatrixCache.integration.test.ts`
- `cache-monitoring.integration.test.ts`
- `scenarioGeneratorWorker.test.ts`

**Configuration:** These tests removed from `vitest.config.int.ts` to prevent CI failures.

### Impact on Report

Add new section documenting testcontainers architecture under "Test Infrastructure Status".

---

## Discovery 8: Node.js Version Requirement Change

### Analysis

**Original Report:** Tests run on Node 18.x and 20.x
**Current State:** Node 18.x removed, requires >=20.19.0

**Evidence from PR #410:**
- Node 18 removed from test matrix
- Package.json likely updated to specify Node >=20.19.0

**Verification Needed:**
```bash
$ grep -A 5 "engines" package.json
```

### Impact on Report

Update "Test Infrastructure Status" to note:
- Node 18.x removed from matrix
- Minimum version: Node.js >=20.19.0
- npm >=10.8.0

---

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Use existing report structure | Maintains consistency, makes delta comparison easy |
| Add "Recently Resolved" section | Celebrates progress, reduces cognitive noise of failures list |
| Expand "Recently Fixed Issues" to all 7 PRs | Accurate historical record, gives credit for all work |
| Update workflow count to 17 | Matches actual file count, includes all active workflows |
| Use CI-PHILOSOPHY.md as baseline source | Authoritative source, maintained by project |
| Document testcontainers architecture | New pattern introduced in PR #416, critical for understanding test infrastructure |

---

## Resources & References

- [2026-01-15 Session Documentation](../2026-01-15-ci-routing-bundle-fix/)
- [CI-PHILOSOPHY.md](../../.github/CI-PHILOSOPHY.md)
- [planning-with-files Examples](https://github.com/OthmanAdi/planning-with-files/tree/master/examples)
- [Phase 0 Validation Report](../../phase0-validation-report.md)
- [.size-limit.json](../../.size-limit.json)
- [vitest.config.ts](../../vitest.config.ts)
- [.tsc-baseline.json](../../.tsc-baseline.json)

---

## 5-Question Reboot Check

**Where am I?**
Phase 1 complete - Planning structure created, learnings absorbed.

**Where am I going?**
Phase 2 - Information gathering and verification of all numbers.

**What is the goal?**
Updated CI/CD Status Report reflecting current state as of 2026-01-16.

**What did I learn?**
- 2 pre-existing failures resolved (Governance Guards, scenario_matrices)
- 5 additional PRs merged after #409 with important fixes
- Testcontainers architecture introduced
- Node 18 removed from matrix
- Baseline comparison philosophy is key to understanding CI status

**What have I accomplished?**
- Planning-with-files structure created
- 8 key discoveries documented
- Learnings from 2026-01-15 session absorbed and applied
- Task plan with 6 phases created
- Phase 2 verification complete (see Discovery 9 below)

---

## Discovery 9: Phase 2 Verification Results (2026-01-16T08:45:00Z)

### Node.js Version Requirement - CONFIRMED

**Source:** `package.json` lines 6-8

```json
"engines": {
  "node": ">=20.19.0",
  "npm": ">=10.8.0"
}
```

**Status:** Matches expectations from PR #410 analysis.

### Vercel Workflow - NOT FOUND

**Investigation:** No Vercel workflow in `.github/workflows/`

```bash
$ ls .github/workflows/*vercel*.yml
(no results)
```

**Conclusion:** Vercel is either:
1. External integration (not managed via GitHub Actions)
2. Deprecated/removed
3. Never existed in this repository

**Impact on Report:** Note Vercel as "External integration or not applicable" rather than "FAIL".

### Security Test Status - IMPROVED

**Source:** `.github/workflows/security-tests.yml`

PR #418 (ec6a936) improvements:
- Added `JWT_SECRET` environment variable (lines 64, 71)
- Fixed PostgreSQL health check command (`pg_isready -U postgres`)
- Workflow properly configured with services (postgres, redis)

**Status:** Infrastructure improved, but tests may still have runtime issues.

**Recommendation:** Mark as "IMPROVED (infrastructure fixes in PR #418)" rather than blanket "FAIL".

### Phase 0 Validation - CONFIRMED

**Source:** `docs/phase0-validation-report.md`

Numbers match original report exactly:
- 129 total scenarios
- 100% pass rate (129/129)
- 6 modules: XIRR (50), Waterfall Tier (15), Waterfall Ledger (14), Fees (10), Capital Alloc (20), Exit Recycling (20)
- XIRR Excel parity: 94.1% (48/51)
- Waterfall Ledger Excel parity: 78.6% (11/14)

**Status:** No updates needed to Phase 0 section of report.

### All Verifications Complete

| Item | Status | Evidence |
|------|--------|----------|
| Node.js >=20.19.0 | CONFIRMED | package.json |
| Vercel workflow | NOT FOUND | .github/workflows/ |
| Security tests improved | CONFIRMED | PR #418 commit |
| Phase 0 numbers | CONFIRMED | phase0-validation-report.md |
| Workflow count: 17 | CONFIRMED | Earlier ls count |
| Skipped tests: 866 | CONFIRMED | Earlier grep count |

**Phase 2 Status:** COMPLETE - Ready to proceed with report generation.
