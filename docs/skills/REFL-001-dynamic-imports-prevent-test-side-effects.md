---
type: reflection
id: REFL-001
title: Dynamic Imports Prevent Test Side Effects
status: VERIFIED
date: 2026-01-18
version: 1
severity: medium
wizard_steps: []
error_codes: [ERR_MODULE_NOT_FOUND, ECONNREFUSED, SQLITE_ERROR]
components: [tests, server, integration]
keywords: [dynamic-import, beforeAll, side-effects, vitest, integration-tests]
test_file: tests/regressions/REFL-001.test.ts
superseded_by: null
---

# Reflection: Dynamic Imports Prevent Test Side Effects

## 1. The Anti-Pattern (The Trap)

**Context:** Integration tests that import server modules at the top level cause initialization side effects before the test environment is ready.

**How to Recognize This Trap:**
1.  **Error Signal:** Tests fail with `ECONNREFUSED`, `ERR_MODULE_NOT_FOUND`, or database connection errors even when test infrastructure appears correct.
2.  **Code Pattern:** Static imports of server modules at file top level:
    ```typescript
    // ANTI-PATTERN
    import { makeApp } from '../../server/app';
    import { storage } from '../../server/storage';
    ```
3.  **Mental Model:** Assuming ES modules can be imported without side effects, like pure functions. In reality, server modules often initialize database connections, Redis clients, or environment bindings at import time.

**Financial Impact:** Flaky tests that pass locally but fail in CI create false confidence. Engineers may skip integration tests entirely, allowing calculation bugs into production.

> **DANGER:** Do NOT use static imports for server modules in integration test files.

## 2. The Verified Fix (The Principle)

**Principle:** Defer server module initialization until test setup completes using dynamic imports in `beforeAll`.

**Implementation Pattern:**
1.  Use static imports ONLY for types and vitest
2.  Declare module variables without initialization
3.  Use dynamic imports inside `beforeAll`
4.  Ensure test environment is configured before imports execute

```typescript
// VERIFIED IMPLEMENTATION

// Type imports are static (no runtime side effects)
import type { Express } from 'express';
import type { IStorage } from '../../server/storage';

// Vitest imports are static
import { describe, it, expect, beforeAll } from 'vitest';

// Function types declared WITHOUT initialization
let makeApp: typeof import('../../server/app').makeApp;
let storage: IStorage;

describe('Integration Test Suite', () => {
  beforeAll(async () => {
    // Environment is ready NOW - safe to import server modules
    const appModule = await import('../../server/app');
    makeApp = appModule.makeApp;

    const storageModule = await import('../../server/storage');
    storage = storageModule.storage;
  });

  it('should use server modules safely', async () => {
    const app = makeApp();
    // Test logic here
  });
});
```

**Key Learnings from Integration:**
1. Some files may already be fixed - check before modifying
2. Not all tests need dynamic imports - pure function tests can use static imports
3. Client-side imports (`@/lib/`) don't have server-side initialization issues
4. Process.env settings in test files are OK - they're test configuration

## 3. Evidence

*   **Test Coverage:** `tests/regressions/REFL-001.test.ts` verifies the pattern works
*   **Source Session:** `docs/plans/integration-test-phase0/findings.md` (2026-01-15)
*   **Files Fixed:** 3 integration test files using this pattern
*   **Pass Rate Improvement:** Reduced skipped files from 13 to 10
