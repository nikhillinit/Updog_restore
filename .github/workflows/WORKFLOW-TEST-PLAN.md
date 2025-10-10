# Workflow Testing & Validation Plan

## Overview

This document outlines the testing strategy for the new reusable CI workflow
architecture.

## Pre-Deployment Validation

### ✅ Completed Checks

1. **YAML Syntax Validation**
   - ✅ `reusable-ci-core.yml` - Valid
   - ✅ `ci-reserves-v11.yml` - Valid
   - Tool: `npx js-yaml`

2. **Structural Validation**
   - ✅ Concurrency properly configured at top-level
   - ✅ Permissions explicitly set
   - ✅ Job outputs correctly mapped through steps
   - ✅ No workspace artifact upload/download (using npm cache only)
   - ✅ Integration tests use `start-server-and-test`

3. **Antipattern Check**
   - ✅ No nested `needs` dependencies
   - ✅ No excessive conditional nesting
   - ✅ No hardcoded secrets
   - ✅ Checkout + npm ci in each job (5 occurrences each)

4. **Path Filter Coverage**
   - ✅ Client code: `client/src/lib/reserves-v11.ts`
   - ✅ Client adapters: `client/src/adapters/reserves-adapter.ts`
   - ✅ Client schemas: `client/src/schemas/reserves-schema.ts`
   - ✅ Client components: `client/src/components/wizard/ReserveStep.tsx`
   - ✅ Shared types: `shared/types/reserves-v11.ts`
   - ✅ Shared schemas: `shared/schemas/reserves-schemas.ts`
   - ✅ Shared lib: `shared/lib/reserves-v11.ts`
   - ✅ Test files: `tests/unit/reserves-v11.test.ts`,
     `tests/integration/reserves-integration.test.ts`
   - ✅ Workflow files themselves
   - ✅ Build config: `vite.config.ts`, `package.json`, `package-lock.json`

5. **Test File Verification**
   - ✅ Unit test exists: `tests/unit/reserves-v11.test.ts`
   - ✅ Integration test exists:
     `tests/integration/reserves-integration.test.ts`
   - ✅ Performance test exists: `tests/perf/reserves-budget.mjs`
   - ✅ E2E test exists: `tests/e2e/reserves-demo.spec.ts`

## Testing Strategy

### Phase 1: Dry Run (No PR Required)

```bash
# Validate workflow can be parsed by GitHub Actions
gh workflow view "CI – Reserves v1.1" --yaml

# Check workflow file is tracked
git ls-files .github/workflows/reusable-ci-core.yml
git ls-files .github/workflows/ci-reserves-v11.yml
```

### Phase 2: Test Commit

Create a minimal change to trigger the workflow:

```bash
# Make a trivial change to a reserves file
echo "// Test comment" >> client/src/lib/reserves-v11.ts

# Commit and push to feature branch
git add .github/workflows/
git commit -m "test: validate new CI workflow architecture"
git push -u origin chore/ci-workflow-refactor
```

### Phase 3: Monitor First Run

Watch for:

1. ✅ Workflow triggers on push
2. ✅ All jobs appear in GitHub Actions UI
3. ✅ Jobs run in correct order (setup → parallel tests → report)
4. ✅ No "invalid workflow" errors
5. ✅ Outputs are correctly passed to report job

### Phase 4: Bundle Analysis Verification

The bundle guard should:

1. ✅ Build successfully
2. ✅ Check `dist/assets/index-*.js` does NOT contain `xlsx` or `papaparse`
3. ✅ Verify vendor chunk exists (if Vite creates one)
4. ✅ Confirm `xlsx`/`papaparse` in vendor chunk OR nowhere (tree-shaken)

**Note**: With `manualChunks: undefined` in vite.config.ts, Vite uses automatic
chunking. The important invariant is: **export libs must NOT be in the main
entry chunk**.

### Phase 5: PR Comment Validation

When opened as PR:

1. ✅ PR comment appears with test results
2. ✅ Status emoji correct (✅ for success, ❌ for failure)
3. ✅ Job summary appears in Actions run page
4. ✅ Skipped jobs show as "skipped" not "failed"

## Expected Workflow Behavior

### Trigger Scenarios

| Scenario                              | Expected Behavior                               |
| ------------------------------------- | ----------------------------------------------- |
| PR to `main` touching reserves files  | ✅ Full CI runs                                 |
| PR to `main` touching unrelated files | ⏭️ Workflow skipped (path filter)               |
| Push to `main` branch                 | ✅ Full CI runs                                 |
| Push to `feat/reserves-v11`           | ✅ Full CI runs                                 |
| Manual trigger (`workflow_dispatch`)  | ✅ Full CI runs                                 |
| PR with `visual-test` label           | 🎨 Visual regression enabled (when uncommented) |

### Job Execution Matrix

| Job                 | Depends On    | Duration (est) | Can Fail?              |
| ------------------- | ------------- | -------------- | ---------------------- |
| `setup`             | -             | 30s            | ❌ (blocks all)        |
| `unit-tests`        | setup         | 45s            | ✅                     |
| `bundle-analysis`   | setup         | 90s            | ✅                     |
| `integration-tests` | setup         | 60s            | ✅                     |
| `visual-regression` | setup         | 120s           | ✅ (if enabled)        |
| `report`            | all test jobs | 10s            | ⚠️ (only if API fails) |

### Success Criteria

A successful workflow run must:

1. ✅ Complete all enabled jobs
2. ✅ Post PR comment (on PRs)
3. ✅ Write job summary
4. ✅ Upload artifacts (coverage, bundle stats)
5. ✅ Complete in < 5 minutes total

## Known Limitations

1. **No actionlint available** - Manual review required for best practices
2. **Vite chunking strategy** - With `manualChunks: undefined`, Vite decides
   chunk strategy
   - Bundle guard focuses on "NOT in entry chunk" (primary goal)
   - Secondary check warns if vendor chunk doesn't contain libs (informational)

## Rollback Plan

If workflow fails:

```bash
# Revert to previous workflow
git revert <commit-sha>
git push origin chore/ci-workflow-refactor

# Or restore old version
git checkout origin/main -- .github/workflows/ci-reserves-v11.yml
git commit -m "revert: restore original reserves CI workflow"
```

## Next Steps After Validation

Once Phase 1-5 pass:

1. [ ] Merge to main
2. [ ] Create additional feature workflows (pacing, cohorts, etc.)
3. [ ] Add optional enhancements:
   - [ ] Bundle size tracking baseline
   - [ ] Matrix Node version testing
   - [ ] Flaky test detection
   - [ ] Performance regression detection
   - [ ] Visual regression (uncomment when ready)

## Monitoring & Alerts

### Metrics to Track

- Workflow duration (target: < 5min)
- Job success rate (target: > 95%)
- Cache hit rate (npm, Playwright)
- Artifact upload/download times

### Warning Signs

- ⚠️ Jobs taking > 10min
- ⚠️ Cache misses on every run
- ⚠️ PR comments failing to post
- ⚠️ Bundle size increasing unexpectedly

---

**Test Plan Status**: ✅ Ready for Phase 2 (Test Commit) **Last Updated**:
2025-10-10 **Validator**: Claude Code CI Refactor
