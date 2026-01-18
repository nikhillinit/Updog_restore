---
type: reflection
id: REFL-016
title: Vitest Include Patterns Miss New Test Directories
status: DRAFT
date: 2026-01-18
version: 1
severity: medium
wizard_steps: []
error_codes: []
components: [tests, vitest, configuration]
keywords: [vitest, include, glob, test-discovery, silent-failure, config]
test_file: tests/regressions/REFL-016.test.ts
superseded_by: null
---

# Reflection: Vitest Include Patterns Miss New Test Directories

## 1. The Anti-Pattern (The Trap)

**Context:** Adding test files to new directories that aren't covered by vitest's include patterns causes tests to silently not run - no error, just missing coverage.

**How to Recognize This Trap:**
1.  **Error Signal:** New tests never appear in test output; "0 tests" for new files; test count doesn't increase after adding tests
2.  **Code Pattern:** Restrictive include patterns in vitest config:
    ```typescript
    // vitest.config.ts - ANTI-PATTERN
    export default defineConfig({
      test: {
        include: [
          'tests/**/*.test.ts',
          'client/src/**/*.test.ts',
          // New tests in tests/regressions/ won't run!
        ],
      },
    });
    ```
3.  **Mental Model:** "If I name it *.test.ts, Vitest will find it." In reality, Vitest only searches directories matching include patterns.

**Financial Impact:** Tests that don't run provide false confidence. Bugs slip through because developers believe they're tested.

> **DANGER:** Do NOT add test files without verifying they're discovered by the test runner.

## 2. The Verified Fix (The Principle)

**Principle:** Always verify new test files are discovered, and use broad include patterns.

**Implementation Pattern:**
1.  Check `vitest.config.ts` include patterns before adding new test directories
2.  Run `npm test -- --reporter=verbose` to verify new tests appear
3.  Use broad glob patterns that cover common test locations

```typescript
// VERIFIED IMPLEMENTATION

// vitest.config.ts - comprehensive patterns
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      // Broad patterns that catch most conventions
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      // Or explicitly list all test directories
      'tests/**/*.{test,spec}.{ts,tsx}',
      'client/src/**/*.{test,spec}.{ts,tsx}',
      'server/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],
  },
});

// Verification script: scripts/verify-test-discovery.ts
import { glob } from 'glob';

async function verifyTestDiscovery() {
  const testFiles = await glob('**/*.test.{ts,tsx}', {
    ignore: ['node_modules/**', 'dist/**'],
  });

  console.log(`Found ${testFiles.length} test files:`);
  testFiles.forEach(f => console.log(`  - ${f}`));

  // Run vitest --list to compare
  console.log('\nRun: npx vitest --list to verify all are discovered');
}
```

**Verification Checklist:**
1. After adding tests: `npm test -- --list | grep "new-file"`
2. Check include patterns cover new directory
3. Watch for "0 tests" output

## 3. Evidence

*   **Test Coverage:** `tests/regressions/REFL-016.test.ts` verifies pattern matching
*   **Source Session:** Jan 8-18 2026 - Reflection test setup
*   **Related Files:** `vitest.config.ts`
