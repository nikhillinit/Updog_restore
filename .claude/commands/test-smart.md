---
description: Intelligent test selection based on file changes - runs only affected tests
---

# Smart Test Runner

Analyze recent code changes and intelligently select which tests to run, focusing on affected areas for fast feedback.

## Workflow

1. **Detect Changes**
   Run `git diff --name-only main...HEAD` to see modified files

2. **Map to Test Files**
   For each changed file, identify related tests:

   **Source File Patterns:**
   - `client/src/components/X.tsx` → Look for `client/src/components/__tests__/X.test.tsx` or `client/src/components/X.test.tsx`
   - `client/src/core/ReserveEngine.ts` → `client/src/core/__tests__/ReserveEngine.test.ts`
   - `client/src/lib/waterfall.ts` → `client/src/lib/__tests__/waterfall.test.ts`
   - `server/routes/X.ts` → `tests/api/X.test.ts`
   - `shared/schemas/X.ts` → Tests in both client and server that import it

3. **Categorize Test Scope**
   - **Unit tests**: Changed file has co-located test
   - **Integration tests**: Changes to API routes, database schema
   - **Component tests**: UI component changes
   - **E2E tests**: Changes to critical user flows

4. **Build Test Command**
   ```bash
   # Single test file
   npm run test -- path/to/test.test.ts

   # Multiple related tests
   npm run test -- --reporter=verbose path1.test.ts path2.test.ts

   # Pattern-based (all waterfall tests)
   npm run test -- waterfall

   # Quick mode (skip API tests)
   npm run test:quick -- <pattern>
   ```

5. **Execute and Report**
   - Run selected tests
   - Report pass/fail status
   - If failures: suggest delegating to test-repair agent
   - If all pass: Suggest running full suite before PR

## Special Cases

**Changed Files → Test Strategy:**

| File Pattern | Test Command |
|--------------|--------------|
| `client/src/lib/waterfall.ts` | `npm run test -- waterfall` (critical domain logic) |
| `shared/db/schema/*` | `npm run test` (full suite - schema affects everything) |
| `package.json` | `npm run test` (dependency changes require full validation) |
| `*.test.ts` only | Run just those test files |
| `vite.config.ts` | `npm run build && npm run test` (build config affects all) |
| `.claude/*` | No tests needed (configuration only) |

**No Changes Detected:**
- Run `npm run test:quick` for fast validation
- Suggest full suite if preparing for deployment

## Examples

**Example 1: Component change**
```
Changed: client/src/components/dashboard/FundCard.tsx
Tests: npm run test -- FundCard.test.tsx
```

**Example 2: Engine logic change**
```
Changed: client/src/core/PacingEngine.ts
Tests: npm run test -- PacingEngine
```

**Example 3: Schema change**
```
Changed: shared/db/schema/funds.ts
Tests: npm run test (full suite - schema impacts many areas)
Alert: Consider running integration tests
```

**Example 4: Multiple related changes**
```
Changed:
  - client/src/lib/waterfall.ts
  - client/src/components/carry/WaterfallConfig.tsx

Tests:
  npm run test -- "waterfall|WaterfallConfig"
```

## Performance Targets

- **Smart selection**: <5 seconds to identify tests
- **Unit test execution**: <30 seconds
- **Quick mode**: <2 minutes
- **Full suite**: <5 minutes (acceptable for pre-commit)

## Integration

This command works with:
- **test-repair agent**: Automatically delegates on failures
- **perf-guard agent**: Checks if test execution time regresses
- **Pre-commit hooks**: Can be configured to run smart tests

## Notes

- Uses Vitest's file filtering capabilities
- Respects `.test.ts` and `.test.tsx` naming conventions
- Skips tests in `node_modules` and `dist`
- Windows-compatible (uses PowerShell-friendly commands)
