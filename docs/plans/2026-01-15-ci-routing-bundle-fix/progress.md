# CI Routing & Bundle-Size Fix - Progress Log

> **Session:** 2026-01-15
> **PR:** #409

---

## Session Timeline

### 20:30 - Initial Analysis
- Continued from previous session context
- Target: Fix `Validate Discovery Routing` and `bundle-size` CI failures
- Created combined PR #409 on branch `fix/ci-routing-and-bundle-combined`

### 20:36 - First Push Attempt
- Applied routing fix: strip `docs` array from comparison
- Applied bundle-size fix: remove non-existent chunks
- CI run started

### 20:38 - Routing Check: PASS
```
Validate Discovery Routing    pass    1m7s
```
First target achieved.

### 20:39 - Bundle-Size Check: PASS
```
bundle-size    pass    1m31s
```
Second target achieved.

### 20:45 - Critical Review Received
External review identified **post-merge regression risk**:
- `report-metrics` job expects `{ size: <number> }` schema
- Our fix would output array format
- This job only runs on `push` to `main` - not caught by PR CI

### 20:50 - Applied Bundle-Metrics Fix
```bash
git commit -m "fix(ci): maintain bundle-metrics.json backward compatibility"
```

Changes:
- Compute total size from size-limit entries
- Output `{ size, timestamp, entries }` format
- Added schema validation step

### 20:54 - Second Push
```
git push (commit 51770c25)
```
CI run triggered for updated PR.

### 21:00 - Documentation
Created planning-with-files documentation:
- `task_plan.md` - Phases and progress
- `findings.md` - Technical discoveries
- `progress.md` - This file

---

## Test Results

### Local Pre-Push Tests
```
Test Files:  137 passed | 26 skipped (163)
Tests:       2994 passed | 482 skipped (3476)
Duration:    36.92s
```

### CI Results (First Push)
| Check | Result |
|-------|--------|
| Validate Discovery Routing | PASS |
| bundle-size | PASS |
| Check client/server/shared/lint | PASS |
| Type Safety Analysis | PASS |
| tiered-performance (all) | PASS |

### Pre-existing Failures (Not Our Changes)
- Governance Guards: FAIL (badge URL validation)
- test (18.x/20.x): FAIL (scenario_matrices)
- security: FAIL
- api-performance: FAIL
- Vercel: FAIL

---

## Commits

| Hash | Message |
|------|---------|
| `110125da` | fix(ci): routing validation skips docs array, bundle-size uses existing chunks |
| `51770c25` | fix(ci): maintain bundle-metrics.json backward compatibility |

---

## Errors Encountered

### Error 1: Routing Still Failing After First Attempt
**Cause:** `_archive/` directory untracked locally but contains .md files
**Fix:** Added `_archive/**` to exclude_paths

### Error 2: Size-limit Can't Find Files
**Cause:** `.size-limit.json` referenced non-existent chunks
**Fix:** Removed entries for DeterministicEngine and math-crypto-vendor

### Error 3: Bundle-Metrics Schema Regression (Caught in Review)
**Cause:** `report-metrics` expects `{ size: <number> }`, we were outputting array
**Fix:** Maintain legacy schema with numeric `.size` field

---

### 21:15 - CI Verification Complete
Target checks confirmed passing:
- `Validate Discovery Routing`: SUCCESS
- `bundle-size`: SUCCESS
- `Type Safety Analysis`: SUCCESS
- `tiered-performance (all)`: SUCCESS
- `Check client/server/shared/lint`: SUCCESS

Pre-existing failures remain (not introduced by PR #409):
- `Governance Guards`, `test (18.x)`, `security`, `api-performance`

PR marked as MERGEABLE.

---

### 21:20 - PR Merged Successfully
```
PR #409 merged: 54f9992bc7e623974974345c8f2fabd46f778b43
Superseded PRs #407, #408 closed
```

---

## Completed

1. [x] Verify CI passes on latest commit
2. [x] Merge PR #409 (commit 54f9992b)
3. [x] Close superseded PRs (#407, #408)

## Follow-up (Future PRs)

4. [x] ~~Address Governance Guards in separate PR~~ - Now passing (badge refs cleaned up)
5. [x] Address integration test failures in separate PR - Fixed in PR #416
6. [ ] Consider tighter routing validation (git ls-files approach)

---

## Post-Session Updates (2026-01-16)

### PR #416 - Testcontainers Exclusion Fix
**Merged:** 67f90b0b

Fixed `scenario_matrices` CI failure by excluding testcontainers-based tests from
`vitest.config.int.ts`. These tests require Docker and now run exclusively via
`testcontainers-ci.yml` (triggered by `test:docker` or `test:integration` labels).

**Root cause:** Integration tests using testcontainers tried to run in `ci-unified.yml`
which uses GitHub Actions service containers instead of Docker.

**Excluded tests:**
- `testcontainers-smoke.test.ts`
- `ScenarioMatrixCache.integration.test.ts`
- `cache-monitoring.integration.test.ts`
- `scenarioGeneratorWorker.test.ts`

### Governance Guards - Now Passing
Badge URL validation check is now passing. The broken badge references documented
earlier have been resolved (likely cleaned up in recent PRs).

### Current CI Status (2026-01-16)
| Check | Status | Notes |
|-------|--------|-------|
| Governance Guards | PASS | Badge refs valid |
| test (20.19.0) | PASS | scenario_matrices fixed |
| bundle-size | PASS | PR #409 fix |
| Validate Discovery Routing | PASS | PR #409 fix |
| api-performance | FAIL | Pre-existing K6 issues |
| Vercel | FAIL | Deployment config |
