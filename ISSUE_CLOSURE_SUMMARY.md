# Quarantine Test Failures - Issue Closure Summary

## Status: ✅ RESOLVED

All quarantine test failures from September-October 2025 have been resolved. The
issues were caused by two separate problems that have both been fixed.

## Issue #94 (Sept 27, 2025) - Root Cause

The workflow failed during `npm ci` with this error:

```
TypeError: require(...).install is not a function
    at [eval]:1:24
```

**Why it happened:**

- The repository upgraded to Husky v9, which removed the `.install()` method
- The package.json prepare script was still using the old Husky v8 pattern
- This caused npm installation to fail before tests could even run

**How it was fixed:**

- Package.json updated to use Husky v9 compatible pattern: `husky || true`
- The prepare script now gracefully handles Husky installation

## Issues #95-#100 - Subsequent Failures

These issues (Sept 28 - Oct 2) had a different cause:

- Global fake timers from test setup files were blocking async operations
- Tests waiting for real timeouts while using fake timers
- This caused tests to hang and timeout

**How it was fixed (Commit 14ec821):**

- Added `vi.useRealTimers()` to affected tests
- Fixed abort signal handling in mocks
- All tests now complete successfully

## Current Status

✅ **All 14 quarantine tests passing**

```
✓  quarantine  tests/unit/inflight-simple.quarantine.test.ts (7 tests)
✓  quarantine  tests/unit/inflight-capacity.quarantine.test.ts (7 tests)
↓  quarantine  tests/quarantine/fund-setup.smoke.quarantine.test.tsx (5 skipped)

Test Files  2 passed | 1 skipped (3)
Tests  14 passed | 5 skipped (19)
Duration  1.68s
```

Note: The 5 skipped tests in `fund-setup.smoke.quarantine.test.tsx` are
intentionally skipped because they require a real browser environment (they've
been moved to E2E tests).

## Workflow Improvements (This PR)

To prevent similar issues in the future, we've improved the workflow:

### 1. Better Error Handling

- npm install step now has `continue-on-error: true`
- Tests only run if installation succeeds
- Artifacts are uploaded even on failure

### 2. Enhanced Issue Reporting

Future failure issues will include:

- **Failure reason**: Distinguishes between installation and test failures
- **Installation status**: Shows if npm ci succeeded or failed
- **Test exit code**: Captures actual test failure code
- **Tailored next steps**: Better guidance based on failure type

### Example of improved issue format:

```markdown
## Quarantine Tests Failed - 2025-10-10

- **Failure reason:** **Installation failed** - Check workflow logs for npm ci
  errors
- **Installation status:** failure
- **Test exit code:** N/A
- **Workflow run:** [View run](...)
```

## Documentation

Comprehensive documentation has been added:

- `docs/quarantine-test-resolution.md` - Full analysis and resolution details
- Workflow file updated with better error handling

## Recommendation

**All related issues (#94-#100) should be closed as resolved.**

The underlying problems have been fixed, and the workflow has been improved to
handle similar failures better in the future.

---

For detailed technical analysis, see:
[`docs/quarantine-test-resolution.md`](../docs/quarantine-test-resolution.md)
