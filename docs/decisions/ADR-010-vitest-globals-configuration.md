# ADR-010: Vitest Globals Configuration

**Status:** Accepted
**Date:** 2025-10-26
**Author:** Claude (with human guidance)

## Context

During test infrastructure maintenance, we encountered a critical issue where Vitest would report "No test suite found in file" for any test that imported helper modules, while simple tests without imports worked fine. This was blocking test execution across the codebase.

### Investigation Findings

1. The root cause was a conflict between:
   - `globals: true` configuration in Vitest
   - Explicit imports of test functions (`describe`, `it`, `expect`) from 'vitest'

2. When both are present, Vitest's test collection phase fails with a naming conflict

3. The issue only manifested when tests imported from helper modules, making it initially appear to be a module resolution problem

## Decision

We will standardize on using **`globals: true`** for all Vitest test projects and prohibit importing test functions from 'vitest'.

### Implementation Details

1. **Configuration:** All test projects must have `globals: true` enabled:
   ```typescript
   projects: [
     {
       test: {
         name: 'server',
         globals: true,  // Required
         environment: 'node',
         // ...
       },
     },
   ]
   ```

2. **Test Files:** Must not import test functions:
   ```typescript
   // ❌ Prohibited
   import { describe, it, expect } from 'vitest';

   // ✅ Correct (globals are available)
   // Note: globals: true is enabled, so describe/it/expect are global
   ```

3. **Setup Files:** Cannot use test hooks (beforeAll/afterAll) as they may execute before runner initialization

## Consequences

### Positive
- Consistent test discovery across all test files
- Simplified test file boilerplate (no imports needed)
- Aligns with Jest-style globals that many developers are familiar with
- Prevents subtle test discovery bugs

### Negative
- Loss of explicit imports may reduce type safety in IDEs without proper configuration
- Developers coming from explicit import patterns may be confused initially
- Global namespace pollution (mitigated by test isolation)

### Neutral
- Requires ESLint rule to enforce the pattern
- Documentation and onboarding materials need to emphasize this convention

## Alternatives Considered

1. **Explicit imports everywhere (`globals: false`)**
   - Pros: More explicit, better type safety
   - Cons: Would require refactoring all existing tests
   - Rejected: Too much migration effort for minimal benefit

2. **Mixed approach (some globals, some imports)**
   - Pros: Flexibility
   - Cons: Inconsistent, prone to errors
   - Rejected: Consistency is more important

3. **Custom test runner wrapper**
   - Pros: Could handle both patterns
   - Cons: Adds complexity, maintenance burden
   - Rejected: Solving a Vitest issue with more abstraction is overkill

## Implementation Checklist

- [x] Update vitest.config.ts with `globals: true` for all projects
- [x] Remove vitest imports from affected test files
- [x] Create node-setup-fixed.ts without test hooks
- [x] Document in cheatsheets/vitest-test-discovery-fix.md
- [ ] Add ESLint rule to prevent test function imports
- [ ] Update onboarding documentation
- [ ] Scan all test files for remaining vitest imports

## References
- [Vitest Globals Documentation](https://vitest.dev/config/#globals)
- [Issue Discussion](tests/unit/database/time-travel-schema.test.ts)
- [Cheatsheet](cheatsheets/vitest-test-discovery-fix.md)