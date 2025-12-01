# Test Infrastructure Baseline Fix: jest-dom Import Issue

**Status**: Open
**Priority**: P2 (Affects test execution, but workaround available)
**Assignee**: TBD
**Created**: 2025-11-30
**Labels**: `test-infrastructure`, `baseline-issue`, `vitest`, `testing-library`

## Problem Statement

All client-side tests fail to execute due to a pre-existing baseline issue in the test setup. The `@testing-library/jest-dom` library is imported before Vitest's `expect` is fully initialized, causing a "ReferenceError: expect is not defined" error.

## Error Details

```
ReferenceError: expect is not defined
 ❯ node_modules/@testing-library/jest-dom/dist/index.mjs:9:1
 ❯ tests/setup/jsdom-setup.ts:2:31
```

**Root Cause**: Line 6 of `tests/setup/jsdom-setup.ts` imports `@testing-library/jest-dom` synchronously at module load time, before Vitest has set up the global `expect` function.

## Impact

- **ALL client tests blocked**: No client-side tests can execute (*.test.tsx files)
- **Test coverage**: Cannot verify new implementations (e.g., FeesExpensesStep auto-save)
- **CI/CD**: Pre-existing issue, not a regression from recent work
- **Workaround**: Manual browser testing for feature validation

## Affected Files

- `tests/setup/jsdom-setup.ts` (line 6)
- All tests matching pattern: `tests/unit/**/*.test.tsx`
- Vitest config: Project `client` in `vitest.config.ts`

## Reproduction Steps

1. Run any client test:
   ```bash
   npx vitest run --project=client tests/unit/fees-expenses-step.test.tsx
   ```
2. Observe error: `ReferenceError: expect is not defined`
3. Error originates from `tests/setup/jsdom-setup.ts:6`

## Proposed Solution

### Option 1: Use Vitest Entry Point (Recommended)

Replace the jest-dom import with the Vitest-specific entry point:

```typescript
// tests/setup/jsdom-setup.ts
// Before (line 6):
import '@testing-library/jest-dom';

// After:
import '@testing-library/jest-dom/vitest';
```

**Pros**:
- Simple one-line fix
- Official Vitest integration
- Maintains all jest-dom matchers

**Cons**:
- Requires `@testing-library/jest-dom` v6.0.0+ (check current version)

### Option 2: Lazy Import

Import jest-dom inside a `beforeAll` hook after Vitest initialization:

```typescript
// tests/setup/jsdom-setup.ts
import { vi, beforeAll, afterAll } from 'vitest';
import { configure } from '@testing-library/react';

// Remove top-level import
// import '@testing-library/jest-dom';

beforeAll(async () => {
  // Import after Vitest globals are set up
  await import('@testing-library/jest-dom/vitest');
});
```

**Pros**:
- Works with any version
- Ensures correct initialization order

**Cons**:
- Slightly more complex
- Async import (minor performance impact)

### Option 3: Move to setupFiles Array

Use Vitest's `setupFiles` option to control load order:

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    projects: [
      {
        name: 'client',
        setupFiles: [
          './tests/setup/jsdom-setup.ts',
          '@testing-library/jest-dom/vitest' // Load after setup
        ]
      }
    ]
  }
});
```

**Pros**:
- Clean separation of concerns
- Explicit load order

**Cons**:
- Requires vitest.config.ts changes
- Two-step setup

## Recommended Fix

**Use Option 1** (Vitest entry point) for simplicity:

1. Check installed version of `@testing-library/jest-dom`
2. If v6.0.0+: Change import to `/vitest` entry point
3. If < v6.0.0: Upgrade package OR use Option 2 (lazy import)

## Testing Verification

After implementing fix, verify:

1. Client tests execute without "expect is not defined" error:
   ```bash
   npx vitest run --project=client tests/unit/fees-expenses-step.test.tsx
   ```

2. All jest-dom matchers work correctly:
   ```typescript
   expect(element).toBeInTheDocument();
   expect(input).toHaveValue(2.5);
   ```

3. Test baseline maintained or improved:
   ```bash
   npm run baseline:check
   # Target: Pass rate >= 74.2%
   ```

## Acceptance Criteria

- [ ] Client tests execute without "expect is not defined" error
- [ ] All 15 FeesExpensesStep tests pass (8 baseline + 7 edge cases)
- [ ] No new TypeScript errors introduced
- [ ] Test baseline pass rate >= 74.2% (no regressions)
- [ ] Jest-dom matchers (toBeInTheDocument, toHaveValue, etc.) work correctly
- [ ] Documentation updated (CHANGELOG.md)

## Related Work

- **Phoenix Phase 1 Track 2**: Wizard auto-save implementation (blocked by this issue)
- **Test files affected**: All tests in `tests/unit/**/*.test.tsx`
- **Known baseline**: Pre-existing issue, not a regression

## References

- Testing Library jest-dom docs: https://github.com/testing-library/jest-dom
- Vitest setup files: https://vitest.dev/config/#setupfiles
- React Testing Library with Vitest: https://vitest.dev/guide/ui.html#testing-library
