# Quarantine Test Failure Analysis - Issue #95

## Executive Summary

The quarantine test failure reported on **2025-09-28** (Issue #95) was caused by
a Husky installation error during `npm ci`, not by the tests themselves. This
issue has been **resolved** by subsequent updates to the repository.

## Root Cause

### Original Failure (2025-09-28)

- **Workflow Run**:
  [18068920040](https://github.com/nikhillinit/Updog_restore/actions/runs/18068920040)
- **Failed Step**: `npm ci` installation
- **Error**: `TypeError: require(...).install is not a function`
- **Cause**: Outdated Husky prepare script using deprecated API

### Error Details

```
> rest-express@1.3.2 prepare
> node -e "try { require('husky').install() } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e }"

TypeError: require(...).install is not a function
```

The package.json had a prepare script that called `husky.install()`, which was
removed in Husky v9+.

## Resolution

The issue was resolved by:

1. **Husky Upgrade**: Updated to Husky v9.1.7
2. **Prepare Script Update**: Changed from `husky install` to just `husky`
   ```json
   "prepare": "chmod +x scripts/verify-docs-and-env.sh || true && husky || true"
   ```
3. **Test Fixes**: PR #130 (merged 2025-10-10) also fixed timer-related issues
   in quarantine tests

## Current Test Status

✅ **All quarantine tests passing** (verified 2025-10-10):

- `tests/unit/inflight-simple.quarantine.test.ts`: 7 tests ✓
- `tests/unit/inflight-capacity.quarantine.test.ts`: 7 tests ✓
- `tests/quarantine/fund-setup.smoke.quarantine.test.tsx`: 5 tests
  (intentionally skipped)

**Total**: 14 passed, 5 skipped (by design)

## Test Details

### Passing Tests

1. **inflight-simple.quarantine.test.ts**
   - Tracks requests while in-flight
   - Deduplicates identical requests
   - Allows different requests concurrently
   - Enforces capacity limits
   - Clears all requests
   - Handles concurrent additions
   - Handles race conditions during cleanup

2. **inflight-capacity.quarantine.test.ts**
   - Tracks in-flight requests
   - Deduplicates concurrent identical requests
   - Allows different requests concurrently
   - Supports manual cancellation
   - Respects dedupe=false option
   - Includes environment namespace in hash
   - Capacity limit test skipped (by design - waits instead of throwing)

### Skipped Tests

The `fund-setup.smoke.quarantine.test.tsx` tests are intentionally skipped
because:

- They require a real browser environment (not JSDOM/happy-dom)
- They've been ported to Playwright E2E tests at `tests/e2e/fund-setup.spec.ts`
- The file is kept for reference only

## Recommendations

### Immediate Actions

1. ✅ Verify tests pass on current main branch
2. ✅ Document findings in issue #95
3. ⏭️ Close issue #95 as resolved

### Future Improvements

1. **CI Workflow Enhancement**: Consider adding a pre-check step to validate
   package.json scripts before running tests
2. **Test Graduation**: Once the active quarantine tests pass 10/10 times in
   nightly runs, consider graduating them to the main test suite
3. **Monitoring**: Continue monitoring nightly quarantine runs to catch
   regressions early

## Timeline

- **2025-09-28**: Issue #95 created - npm ci failed due to Husky error
- **2025-10-07**: Issue #128 created - different quarantine test failures
  (timeout)
- **2025-10-10**: PR #130 merged - fixed timer issues + Husky already updated
- **2025-10-10**: Current analysis - all tests passing

## Conclusion

Issue #95 is **resolved**. The quarantine tests are now stable and passing. The
original failure was an infrastructure issue (Husky installation), not a test
quality issue. No further action required beyond closing the issue.
