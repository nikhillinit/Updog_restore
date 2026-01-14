# Option 2: Integration Test Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Eliminate import-time DB pool creation and standardize integration
test patterns to achieve 100% pass rate with zero connection leaks.

**Architecture:** Three-layer fix: (1) Dynamic imports to prevent ESM
import-time side effects, (2) Global teardown for singleton pool cleanup instead
of per-file afterAll, (3) RollbackToken pattern for true transaction isolation
in tests.

**Tech Stack:** Vitest, Express.js, Drizzle ORM, PostgreSQL (Neon serverless),
Redis, pg Pool, Testcontainers

---

## Phase 0: Ban Top-Level DB Imports in Skipped Files

**Priority:** CRITICAL (highest leverage, must complete first)

**Why:** In ESM, `import` executes before any `process.env` line. Skipped suites
still create real pools just by importing modules.

---

### Task 0.1: Fix allocations.test.ts - Remove Top-Level Pool Import

**Files:**

- Modify: `tests/api/allocations.test.ts:14-20`

**Step 1: Read the current file to understand context**

Run: `head -30 tests/api/allocations.test.ts` Expected: See
`import { pool } from '../../server/db/pg-circuit'` at line 17

**Step 2: Replace static import with dynamic import pattern**

Replace lines 14-20:

```typescript
// BEFORE (lines 14-20):
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { makeApp } from '../../server/app';
import { pool } from '../../server/db/pg-circuit';
import type { Express } from 'express';

describe.skip('Fund Allocation Management API', () => {
```

With:

```typescript
// AFTER:
import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { Pool } from 'pg';

// Conditional describe - only run when ENABLE_PHASE4_TESTS is set
const describeMaybe = process.env.ENABLE_PHASE4_TESTS === 'true' ? describe : describe.skip;

describeMaybe('Fund Allocation Management API', () => {
  // Dynamic imports - only load when suite actually runs
  let pool: Pool;
  let makeApp: typeof import('../../server/app').makeApp;

  beforeAll(async () => {
    // Dynamic import prevents pool creation when suite is skipped
    const dbModule = await import('../../server/db/pg-circuit');
    pool = dbModule.pool;
    const appModule = await import('../../server/app');
    makeApp = appModule.makeApp;
  });
```

**Step 3: Run tests to verify no regressions**

Run: `npm test -- --project=server --run tests/api/allocations.test.ts`
Expected: Test file loads without creating DB connections (since suite is
skipped)

**Step 4: Commit**

```bash
git add tests/api/allocations.test.ts
git commit -m "fix(tests): Use dynamic imports in allocations.test.ts to prevent import-time pool creation"
```

---

### Task 0.2: Fix circuit-breaker-db.test.ts - Remove Top-Level DB Imports

**Files:**

- Modify: `tests/integration/circuit-breaker-db.test.ts:10-26`

**Step 1: Read the current file**

Run: `head -50 tests/integration/circuit-breaker-db.test.ts` Expected: See
multiple imports from `../../server/db` at lines 11-21

**Step 2: Replace static imports with dynamic import pattern**

Replace lines 10-26:

```typescript
// BEFORE (lines 10-26):
import { describe, it, expect, beforeAll, afterAll, vi, test } from 'vitest';
import {
  q,
  query,
  queryWithRetry,
  pgPool,
  redisGet,
  redisSet,
  cache,
  checkDatabaseHealth,
  shutdownDatabases,
} from '../../server/db';
import { breakerRegistry } from '../../server/infra/circuit-breaker/breaker-registry';

if (process.env.DEMO_CI) test.skip('skipped in demo CI (no Redis)', () => {});

describe.skip('Database Circuit Breakers', () => {
```

With:

```typescript
// AFTER:
import { describe, it, expect, beforeAll, afterAll, vi, test } from 'vitest';

// Type imports only - no runtime side effects
import type { Pool as PgPoolType } from 'pg';

if (process.env.DEMO_CI) test.skip('skipped in demo CI (no Redis)', () => {});

// Conditional describe - only run when DATABASE_URL is available
const describeMaybe = process.env.DATABASE_URL ? describe : describe.skip;

describeMaybe('Database Circuit Breakers', () => {
  // Dynamic imports - loaded only when suite runs
  let q: (sql: string, params?: unknown[]) => Promise<unknown[]>;
  let query: (sql: string, params?: unknown[]) => Promise<unknown>;
  let queryWithRetry: typeof import('../../server/db').queryWithRetry;
  let pgPool: PgPoolType;
  let redisGet: typeof import('../../server/db').redisGet;
  let redisSet: typeof import('../../server/db').redisSet;
  let cache: typeof import('../../server/db').cache;
  let checkDatabaseHealth: typeof import('../../server/db').checkDatabaseHealth;
  let shutdownDatabases: typeof import('../../server/db').shutdownDatabases;
  let breakerRegistry: typeof import('../../server/infra/circuit-breaker/breaker-registry').breakerRegistry;

  beforeAll(async () => {
    // Dynamic imports - only execute when suite actually runs
    const dbModule = await import('../../server/db');
    q = dbModule.q;
    query = dbModule.query;
    queryWithRetry = dbModule.queryWithRetry;
    pgPool = dbModule.pgPool;
    redisGet = dbModule.redisGet;
    redisSet = dbModule.redisSet;
    cache = dbModule.cache;
    checkDatabaseHealth = dbModule.checkDatabaseHealth;
    shutdownDatabases = dbModule.shutdownDatabases;

    const breakerModule = await import('../../server/infra/circuit-breaker/breaker-registry');
    breakerRegistry = breakerModule.breakerRegistry;

    // Enable circuit breakers for tests
    process.env.CB_DB_ENABLED = 'true';
    process.env.CB_CACHE_ENABLED = 'true';
  });
```

**Step 3: Remove the old skipInCI logic from beforeAll (now handled by
describeMaybe)**

Find and remove:

```typescript
const skipInCI = process.env.CI && !process.env.DATABASE_URL;

beforeAll(() => {
  if (skipInCI) {
    console.log('Skipping database tests in CI without DATABASE_URL');
    return;
  }
  // ...
});
```

**Step 4: Update afterAll to NOT call shutdownDatabases (globalTeardown will
handle)**

Replace existing afterAll:

```typescript
afterAll(async () => {
  // NOTE: Pool cleanup handled by globalTeardown, not here
  // This prevents "singleton suicide" in parallel test runs
  vi.clearAllMocks();
});
```

**Step 5: Run tests to verify no regressions**

Run:
`npm test -- --project=server --run tests/integration/circuit-breaker-db.test.ts`
Expected: Test file loads without creating DB connections (since DATABASE_URL
not set)

**Step 6: Commit**

```bash
git add tests/integration/circuit-breaker-db.test.ts
git commit -m "fix(tests): Use dynamic imports in circuit-breaker-db.test.ts"
```

---

### Task 0.3: Fix backtesting-api.test.ts - Remove Top-Level Pool Import

**Files:**

- Modify: `tests/integration/backtesting-api.test.ts:20-35`

**Step 1: Read the current file**

Run: `head -40 tests/integration/backtesting-api.test.ts` Expected: See
`import { pool } from '../../server/db'` and `describe.skip`

**Step 2: Replace static import with dynamic import pattern**

The file already sets NODE_ENV before imports (lines 17-18), but this doesn't
work due to ESM hoisting. Replace:

```typescript
// BEFORE:
import { pool } from '../../server/db';

describe.skip('Backtesting API', () => {
```

With:

```typescript
// AFTER:
// NOTE: pool import moved to dynamic import inside beforeAll
import type { Pool } from 'pg';

// Conditional describe - re-enable when cleanup complete
const describeMaybe = process.env.ENABLE_BACKTESTING_TESTS === 'true' ? describe : describe.skip;

describeMaybe('Backtesting API', () => {
  // TODO: Fix database pool cleanup issue (Option 2)
  // Issue: Neon serverless pool not properly cleaned up in afterAll
  // Root cause: Module initialization order - pool created before NODE_ENV set
  // Solution: Dynamic imports + globalTeardown

  let pool: Pool | null = null;

  beforeAll(async () => {
    // Dynamic import prevents pool creation when suite is skipped
    const dbModule = await import('../../server/db');
    pool = dbModule.pgPool;
  });
```

**Step 3: Update afterAll to NOT close the pool**

Replace existing afterAll:

```typescript
afterAll(async () => {
  // NOTE: Pool cleanup handled by globalTeardown, not here
  // This prevents "singleton suicide" in parallel test runs
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});
```

**Step 4: Run tests to verify no regressions**

Run:
`npm test -- --project=server --run tests/integration/backtesting-api.test.ts`
Expected: Test file loads without creating DB connections (suite skipped)

**Step 5: Commit**

```bash
git add tests/integration/backtesting-api.test.ts
git commit -m "fix(tests): Use dynamic imports in backtesting-api.test.ts"
```

---

### Task 0.4: Fix scenario-comparison-mvp.test.ts - Remove Top-Level DB Import

**Files:**

- Modify: `tests/integration/scenario-comparison-mvp.test.ts:11-20`

**Step 1: Read the current file**

Run: `head -30 tests/integration/scenario-comparison-mvp.test.ts` Expected: See
`import { db } from '../../server/db/index.js'` at line 16

**Step 2: Replace static import with dynamic import pattern**

Replace lines 11-20:

```typescript
// BEFORE (lines 11-20):
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { registerRoutes } from '../../server/routes.js';
import { errorHandler } from '../../server/errors.js';
import { db } from '../../server/db/index.js';
import { scenarios, scenarioCases } from '@shared/schema';
import { v4 as uuid } from 'uuid';

describe.skip('Scenario Comparison MVP API', () => {
```

With:

```typescript
// AFTER:
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuid } from 'uuid';

// Type-only imports - no runtime side effects
import type { scenarios, scenarioCases } from '@shared/schema';

// Conditional describe - only run when ENABLE_PHASE4_TESTS is set
const describeMaybe = process.env.ENABLE_PHASE4_TESTS === 'true' ? describe : describe.skip;

describeMaybe('Scenario Comparison MVP API', () => {
  // Dynamic imports - only load when suite actually runs
  let db: Awaited<typeof import('../../server/db/index.js')>['db'];
  let registerRoutes: typeof import('../../server/routes.js').registerRoutes;
  let errorHandler: typeof import('../../server/errors.js').errorHandler;

  beforeAll(async () => {
    // Dynamic imports prevent DB connection when suite is skipped
    const dbModule = await import('../../server/db/index.js');
    db = dbModule.db;
    const routesModule = await import('../../server/routes.js');
    registerRoutes = routesModule.registerRoutes;
    const errorsModule = await import('../../server/errors.js');
    errorHandler = errorsModule.errorHandler;
  });
```

**Step 3: Run tests to verify no regressions**

Run:
`npm test -- --project=server --run tests/integration/scenario-comparison-mvp.test.ts`
Expected: Test file loads without creating DB connections (suite is skipped)

**Step 4: Commit**

```bash
git add tests/integration/scenario-comparison-mvp.test.ts
git commit -m "fix(tests): Use dynamic imports in scenario-comparison-mvp.test.ts"
```

---

### Task 0.5: Fix deal-pipeline.test.ts - Remove Top-Level Pool Import

**Files:**

- Modify: `tests/api/deal-pipeline.test.ts:17-23`

**Step 1: Read the current file**

Run: `head -35 tests/api/deal-pipeline.test.ts` Expected: See
`import { pool } from '../../server/db/pg-circuit'` at line 20

**Step 2: Replace static import with dynamic import pattern**

Replace lines 17-23:

```typescript
// BEFORE (lines 17-23):
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { makeApp } from '../../server/app';
import { pool } from '../../server/db/pg-circuit';
import type { Express } from 'express';

describe.skip('Deal Pipeline API', () => {
```

With:

```typescript
// AFTER:
import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { Pool } from 'pg';

// Conditional describe - only run when ENABLE_PHASE4_TESTS is set
const describeMaybe = process.env.ENABLE_PHASE4_TESTS === 'true' ? describe : describe.skip;

describeMaybe('Deal Pipeline API', () => {
  // Dynamic imports - only load when suite actually runs
  let pool: Pool;
  let makeApp: typeof import('../../server/app').makeApp;

  beforeAll(async () => {
    // Dynamic import prevents pool creation when suite is skipped
    const dbModule = await import('../../server/db/pg-circuit');
    pool = dbModule.pool;
    const appModule = await import('../../server/app');
    makeApp = appModule.makeApp;
  });
```

**Step 3: Run tests to verify no regressions**

Run: `npm test -- --project=server --run tests/api/deal-pipeline.test.ts`
Expected: Test file loads without creating DB connections (suite is skipped)

**Step 4: Commit**

```bash
git add tests/api/deal-pipeline.test.ts
git commit -m "fix(tests): Use dynamic imports in deal-pipeline.test.ts"
```

---

## Phase 1: Create Corrected Helper Pattern

**Priority:** HIGH (blocking for remaining fixes)

---

### Task 1.1: Create Global Teardown File

**Files:**

- Create: `tests/setup/global-teardown.ts`

**Step 1: Create the global teardown file**

```typescript
/**
 * Global teardown for Vitest
 *
 * Runs ONCE after all test files complete.
 * Handles singleton pool cleanup to prevent "Client has been closed" errors
 * in parallel test runs.
 *
 * @see docs/plans/option2-session-logs/task_plan.md - Defect 1: Singleton Suicide
 */

export default async function globalTeardown() {
  console.log('[globalTeardown] Cleaning up database connections...');

  try {
    // Dynamic import to avoid side effects during setup phase
    const { shutdownDatabases } = await import('../../server/db/index.js');

    if (typeof shutdownDatabases === 'function') {
      await shutdownDatabases();
      console.log('[globalTeardown] Database connections closed');
    }
  } catch (error) {
    // Swallow errors - teardown should be idempotent
    // Pool might already be closed or never created
    console.warn('[globalTeardown] Cleanup warning:', error);
  }
}
```

**Step 2: Verify file was created**

Run: `cat tests/setup/global-teardown.ts` Expected: See the globalTeardown
function

**Step 3: Commit**

```bash
git add tests/setup/global-teardown.ts
git commit -m "feat(tests): Add global-teardown.ts for singleton pool cleanup"
```

---

### Task 1.2: Create Integration Test Helper with RollbackToken

**Files:**

- Create: `tests/helpers/integration-test-setup.ts`

**Step 1: Create the integration test helper**

````typescript
/**
 * Integration Test Setup Helper
 *
 * Provides:
 * - setupIntegrationTest(): Clears mocks after each test (NO pool cleanup here)
 * - withTransaction(): True isolation via RollbackToken pattern
 *
 * @see docs/plans/option2-session-logs/task_plan.md - Defect 2: Fake Transaction Isolation
 */

import { afterEach, vi } from 'vitest';

/**
 * Setup function for integration tests
 * NOTE: Pool cleanup is handled by global-teardown.ts, NOT here
 */
export function setupIntegrationTest() {
  afterEach(() => {
    vi.clearAllMocks();
  });
}

/**
 * Sentinel error for forced transaction rollback
 * Not a real error - caught and swallowed in withTransaction
 */
class RollbackToken extends Error {
  constructor() {
    super('RollbackToken: Intentional rollback for test isolation');
    this.name = 'RollbackToken';
  }
}

/**
 * Execute callback within a transaction that ALWAYS rolls back
 *
 * This provides true test isolation - no data persists to the database.
 * Uses the "Rollback Exception" pattern: throw an error to force rollback.
 *
 * @example
 * ```typescript
 * await withTransaction(async (tx) => {
 *   await tx.insert(users).values({ name: 'test' });
 *   const result = await tx.select().from(users);
 *   expect(result).toHaveLength(1);
 * });
 * // Data is NOT persisted - transaction was rolled back
 * ```
 */
export async function withTransaction<T>(
  callback: (tx: unknown) => Promise<T>
): Promise<T | undefined> {
  // Dynamic import to avoid import-time side effects
  const { db } = await import('../../server/db/index.js');

  let result: T | undefined;

  try {
    await db.transaction(async (tx: unknown) => {
      result = await callback(tx);
      // FORCE rollback - this is intentional, not an error
      throw new RollbackToken();
    });
  } catch (error) {
    // Swallow our sentinel error, re-throw real errors
    if (!(error instanceof RollbackToken)) {
      throw error;
    }
  }

  return result;
}

/**
 * Check if a pool has waiting connections (leak indicator)
 *
 * @param pool - pg Pool instance
 * @returns true if connections are waiting (potential leak)
 */
export function hasWaitingConnections(pool: unknown): boolean {
  if (!pool || typeof pool !== 'object') return false;
  const p = pool as { waitingCount?: number };
  return typeof p.waitingCount === 'number' && p.waitingCount > 0;
}
````

**Step 2: Verify file was created**

Run: `cat tests/helpers/integration-test-setup.ts` Expected: See
setupIntegrationTest, RollbackToken, and withTransaction

**Step 3: Create a test for the helper**

Create file `tests/helpers/integration-test-setup.test.ts`:

```typescript
/**
 * Tests for integration-test-setup helper
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('integration-test-setup', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('should export setupIntegrationTest function', async () => {
    const { setupIntegrationTest } = await import('./integration-test-setup');
    expect(typeof setupIntegrationTest).toBe('function');
  });

  it('should export withTransaction function', async () => {
    const { withTransaction } = await import('./integration-test-setup');
    expect(typeof withTransaction).toBe('function');
  });

  it('should export hasWaitingConnections function', async () => {
    const { hasWaitingConnections } = await import('./integration-test-setup');
    expect(typeof hasWaitingConnections).toBe('function');
  });

  it('hasWaitingConnections should return false for null', async () => {
    const { hasWaitingConnections } = await import('./integration-test-setup');
    expect(hasWaitingConnections(null)).toBe(false);
  });

  it('hasWaitingConnections should return false for pool with 0 waiting', async () => {
    const { hasWaitingConnections } = await import('./integration-test-setup');
    expect(hasWaitingConnections({ waitingCount: 0 })).toBe(false);
  });

  it('hasWaitingConnections should return true for pool with waiting connections', async () => {
    const { hasWaitingConnections } = await import('./integration-test-setup');
    expect(hasWaitingConnections({ waitingCount: 5 })).toBe(true);
  });
});
```

**Step 4: Run the helper tests**

Run:
`npm test -- --project=server --run tests/helpers/integration-test-setup.test.ts`
Expected: All 6 tests pass

**Step 5: Commit**

```bash
git add tests/helpers/integration-test-setup.ts tests/helpers/integration-test-setup.test.ts
git commit -m "feat(tests): Add integration-test-setup helper with RollbackToken pattern"
```

---

### Task 1.3: Update Vitest Config with Global Teardown

**Files:**

- Modify: `vitest.config.ts`

**Step 1: Read current config structure**

Run: `head -60 vitest.config.ts` Expected: See defineConfig with test.projects

**Step 2: Add globalTeardown to the server project**

Find the server project configuration (around line 86-100) and add
globalTeardown:

```typescript
// Find this block:
{
  resolve: { alias },
  esbuild: {
    jsxInject: "import React from 'react'",
  },
  test: {
    name: 'server',
    environment: 'node',
    // ... other config
  },
},

// Add globalTeardown after the test block:
{
  resolve: { alias },
  esbuild: {
    jsxInject: "import React from 'react'",
  },
  test: {
    name: 'server',
    environment: 'node',
    globalTeardown: './tests/setup/global-teardown.ts', // ADD THIS LINE
    // ... other config
  },
},
```

**Step 3: Verify the env block includes NODE_ENV**

Check that the test.env block (or define block) sets NODE_ENV to 'test'. This
should already be handled by vitest.setup.ts, but verify.

**Step 4: Run tests to verify config is valid**

Run:
`npm test -- --project=server --run tests/helpers/integration-test-setup.test.ts`
Expected: Tests pass, globalTeardown message appears at end

**Step 5: Commit**

```bash
git add vitest.config.ts
git commit -m "feat(tests): Add globalTeardown to vitest server project config"
```

---

### Task 1.4: Verify Phase 0 + Phase 1 Together

**Files:** None (validation only)

**Step 1: Run the full server test suite**

Run: `npm test -- --project=server --run` Expected: All tests pass, no DB
connection errors

**Step 2: Check for pool closure message**

Look for: `[globalTeardown] Database connections closed` at end of test run

**Step 3: Run tests without ENABLE_PHASE4_TESTS to verify no pool creation**

Run: `unset ENABLE_PHASE4_TESTS && npm test -- --project=server --run` Expected:
No Neon/pg connection attempts for skipped suites

**Step 4: Commit summary**

```bash
git add -A
git commit -m "feat(tests): Complete Phase 0 + Phase 1 integration test cleanup

- Ban top-level DB imports in skipped files (AP-TEST-DB-05)
- Add global-teardown.ts for singleton pool cleanup
- Add integration-test-setup.ts with RollbackToken pattern
- Update vitest.config.ts with globalTeardown

Fixes: Singleton Suicide, Fake Transaction Isolation, Static Import Race Condition"
```

---

## Validation Checklist

After completing all tasks, verify:

- [ ] `npm test -- --project=server --run` passes
- [ ] No "Cannot read properties of null (reading 'close')" errors
- [ ] No "Client has been closed" errors in parallel runs
- [ ] `[globalTeardown]` message appears at end of test run
- [ ] All 5 critical files converted to dynamic imports:
  - [ ] allocations.test.ts
  - [ ] backtesting-api.test.ts
  - [ ] circuit-breaker-db.test.ts
  - [ ] scenario-comparison-mvp.test.ts
  - [ ] deal-pipeline.test.ts
- [ ] Skipped suites do not create DB connections
- [ ] RollbackToken pattern tested and working

---

## Next Phases (See task_plan.md)

- **Phase 2:** Fix remaining critical files (rls-middleware.test.ts,
  reserves-integration.test.ts)
- **Phase 3:** Re-enable skipped tests
- **Phase 4:** Add connection monitoring
- **Phase 5:** Regression prevention gates
- **Phase 6:** Documentation

---

**Plan saved to:** `docs/plans/2026-01-13-integration-test-cleanup.md`
