# Quarantine Test Issue Resolution

## Issue Summary

**Issue Date:** 2025-09-30  
**Issue:** Quarantine nightly tests failed due to npm ci failure  
**Root Cause:** Incompatible husky prepare script with Husky v9

## Problem Details

The quarantine test workflow failed during the `npm ci` step with this error:

```
TypeError: require(...).install is not a function
    at [eval]:1:24
```

This occurred because the package.json had an old husky prepare script that was
incompatible with Husky v9.x:

**Old Script (commit 927a0c3):**

```json
"prepare": "node -e \"try { require('husky').install() } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e }\""
```

This pattern was used in Husky v4-v8 but was removed in Husky v9.

## Resolution

The issue has been **resolved** with the following fix already in place:

**Current Script (in package.json):**

```json
"prepare": "husky || true"
```

This is the correct pattern for Husky v9.x, which:

1. Simply runs the `husky` command during npm install
2. Uses `|| true` to ensure it doesn't fail if husky is not yet installed
3. Is compatible with Husky v9.1.7 (current version in package.json)

## Verification

✅ **npm ci** - Completes successfully  
✅ **Quarantine tests can run** - Tests execute (some may fail as expected for
quarantined tests)  
✅ **No old husky patterns** - Confirmed no other references to
`require('husky').install()`

## Testing Results

Ran the complete workflow simulation:

- npm ci: SUCCESS ✅
- Quarantine tests execution: SUCCESS ✅ (tests run, some fail as expected)
- Workflow would complete: YES ✅

## Next Steps

1. The issue from 2025-09-30 is resolved
2. The next nightly run should complete the `npm ci` step successfully
3. Any test failures in quarantine are expected and are being tracked separately
4. No code changes needed - the fix is already in place

## Notes on Quarantined Tests

The quarantine suite contains flaky tests that are expected to fail
intermittently. Current quarantined tests:

- `tests/unit/inflight-capacity.quarantine.test.ts` - Tests with timing
  dependencies
- `tests/unit/inflight-simple.quarantine.test.ts` - Simple inflight tracking
  tests
- `tests/quarantine/fund-setup.smoke.quarantine.test.tsx` - Browser environment
  tests (skipped)

These tests are quarantined because they:

- Have timing-related flakiness
- Require specific environment conditions
- Are being monitored for stability before graduation to main test suite
