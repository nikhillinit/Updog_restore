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

**Context:** Adding test files to new directories that aren't covered by
vitest's include patterns causes tests to silently not run - no error, just
missing coverage.

**How to Recognize This Trap:**

1.  **Error Signal:** New tests never appear in test output; "0 tests" for new
    files; test count doesn't increase after adding tests
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
3.  **Mental Model:** "If I name it \*.test.ts, Vitest will find it." In
    reality, Vitest only searches directories matching include patterns.

**Financial Impact:** Tests that don't run provide false confidence. Bugs slip
through because developers believe they're tested.

> **DANGER:** Do NOT add test files without verifying they're discovered by the
> test runner.

## 2. The Verified Fix (The Principle)

**Principle:** Always verify new test files are discovered, and use broad
include patterns.

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
  testFiles.forEach((f) => console.log(`  - ${f}`));

  // Run vitest --list to compare
  console.log('\nRun: npx vitest --list to verify all are discovered');
}
```

**Verification Checklist:**

1. After adding tests: `npm test -- --list | grep "new-file"`
2. Check include patterns cover new directory
3. Watch for "0 tests" output

## 2a. Variant: `test.projects` mode with per-project extension restrictions

**Added 2026-04-06** during sensitivity-refactor-and-polish red-team review.

**Context:** When `vitest.config.ts` uses `test.projects: [...]` to define
multiple project environments (e.g., separate `client` jsdom and `server` node
projects), EACH project has its OWN `include` glob. A file in a directory
covered by ONE project's glob can still be silently skipped if its filename
extension doesn't match THAT project's glob.

**The trap:** This repo's `vitest.config.ts:134` (the client jsdom project)
uses:

```typescript
test: {
  projects: [
    {
      test: {
        environment: 'jsdom',
        include: ['tests/unit/**/*.test.tsx'],   // <-- .tsx ONLY
      },
    },
    // ...
  ],
  include: ['tests/unit/**/*.{test,spec}.ts?(x)', ...],  // <-- top-level catches both
}
```

A file at `tests/unit/components/sensitivity/_shared/formatters.test.ts` would
be matched by the **top-level** include but the client jsdom **project**'s
include requires `.test.tsx`. Result: the file is loaded by Vitest but assigned
to a project that expects `jsdom` (because of the path), and either runs in the
wrong environment, fails to import client-side modules, or is silently skipped
depending on Vitest's resolution. The contract gate ("formatters tests pass")
would report "0 passed, 0 failed" — false-positive green.

**Detection in this case:** Caught during red-team review of the babysitter
process file BEFORE the agent ran, by reading `vitest.config.ts:134` and
comparing the planned filename. The `.test.ts` plan was changed to `.test.tsx`
in the process file before execution. Cost of catching at planning time: zero.
Cost of NOT catching it: false-positive green gate, undetected silent skip,
discovery only when a TwoWayPanel test breaks something the formatter test
should have caught.

**How to apply:**

1.  When adding new test files under a directory covered by `test.projects`,
    look up the SPECIFIC project's `include` glob and match its extension
    exactly.
2.  Even when a file contains no JSX, prefer `.test.tsx` for client-side tests
    in this repo (the extension is harmless and matches the project glob).
3.  After adding a new test file, run the targeted file alone:
    `npx vitest run path/to/new-file.test.tsx --reporter=verbose` If it reports
    "0 tests" or "no test files found," the include glob doesn't match — fix the
    filename or the config before assuming the test runs.
4.  Verification gates that count tests passing should also fail if the test
    file's count is 0 (can't tell "all passed" from "didn't run").

**Why this variant matters even though the parent pattern is documented:** The
generic REFL-016 advice ("use broad include patterns like `**/*.test.{ts,tsx}`")
doesn't apply when the project chooses per-project restrictions on purpose
(e.g., the client jsdom project intentionally excludes `.ts` files because they
shouldn't run in jsdom). The fix in `test.projects` mode is to match the per-
project glob, NOT to broaden it.

## 3. Evidence

- **Test Coverage:** `tests/regressions/REFL-016.test.ts` verifies pattern
  matching
- **Source Sessions:**
  - Jan 8-18 2026 - Reflection test setup (original entry)
  - 2026-04-06 - sensitivity-refactor-and-polish red-team review (variant added)
- **Related Files:** `vitest.config.ts`
- **Related Memory:** `memory/feedback_pre_push_warmer_than_cold_full_suite.md`
  documents the related "false-positive green from a non-running test" risk
  class.
