# Option 2: Comprehensive Integration Test Cleanup Plan

**Status**: PLANNED **Created**: 2026-01-13 **Related**: PR
fix/server-startup-and-eslint **Prerequisites**: Option 1 complete (tests
skipped)

## Executive Summary

Comprehensive cleanup of integration test patterns to fix module initialization
order issues and establish proper database cleanup patterns across all 31
integration tests.

## Root Cause Analysis

### Primary Issue: Module Initialization Order

**Problem**: Environment variables set AFTER module imports

```typescript
// WRONG (current pattern in backtesting-api.test.ts):
import { registerRoutes } from '../../server/routes'; // Loads db.ts
import { errorHandler } from '../../server/errors';

process.env.NODE_ENV = 'test'; // TOO LATE!

// RIGHT (fixed pattern):
process.env.NODE_ENV = 'test';
process.env.VITEST = 'true';

import { registerRoutes } from '../../server/routes'; // Now uses mock
```

**Impact**:

- db.ts initializes with production Neon pool instead of database mock
- afterAll hooks don't clean up real connections
- Neon timeout handlers throw "Cannot read properties of null (reading 'close')"

### Secondary Issue: Incomplete Cleanup Patterns

Most integration tests only close HTTP server, not database pools:

```typescript
// Current pattern (incomplete):
afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

// Should be (complete):
afterAll(async () => {
  // Clean up database pool FIRST
  if (pool && typeof pool === 'object' && 'end' in pool) {
    try {
      await (pool as { end: () => Promise<void> }).end();
    } catch (error) {
      console.warn('Pool cleanup warning:', error);
    }
  }

  // Close HTTP server LAST
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});
```

## Affected Files (31 Integration Tests)

```
tests/integration/
├── backtesting-api.test.ts ✓ (FIXED in Option 1 - skipped)
├── testcontainers-smoke.test.ts ✓ (FIXED in Option 1 - skipped)
├── cache-monitoring.integration.test.ts (NEEDS FIX)
├── circuit-breaker-db.test.ts (NEEDS FIX)
├── dev-memory-mode.test.ts (NEEDS FIX)
├── flags-hardened.test.ts (NEEDS FIX)
├── flags-routes.test.ts (NEEDS FIX)
├── fund-calculation.test.ts (NEEDS FIX)
├── lp-api.test.ts (NEEDS FIX)
├── middleware.test.ts (NEEDS FIX)
├── operations-endpoint.test.ts (NEEDS FIX)
├── performance-api.test.ts (NEEDS FIX)
├── report-queue.test.ts (NEEDS FIX)
├── scenario-comparison-mvp.test.ts (NEEDS FIX)
├── scenario-comparison.test.ts (ALREADY SKIPPED)
├── scenarioGeneratorWorker.test.ts (NEEDS FIX)
├── idempotency.test.ts (NEEDS FIX)
├── snapshot-versions.test.ts (NEEDS FIX)
├── approval-guard.test.ts (NEEDS FIX)
├── enforce-gate.test.ts (NEEDS FIX)
├── forbidden-tokens.test.ts (NEEDS FIX)
├── interleaved-thinking.test.ts (NEEDS FIX)
├── ops-webhook.test.ts (NEEDS FIX)
├── reserves-integration.test.ts (NEEDS FIX)
├── rls-middleware.test.ts (NEEDS FIX)
├── ScenarioMatrixCache.integration.test.ts (NEEDS FIX)
├── golden-dataset.test.ts (NEEDS FIX)
└── __tests__/
    ├── ci-workflow-regression.test.ts (NEEDS FIX)
    ├── golden-dataset-regression.test.ts (NEEDS FIX)
    ├── vite-build-regression.test.ts (NEEDS FIX)
    └── phase0-integration.test.ts (NEEDS FIX)
```

**Total**: 31 files (2 fixed, 29 remaining)

## Implementation Strategy

### Phase 1: Create Reusable Cleanup Pattern

**File**: `tests/helpers/integration-test-setup.ts`

```typescript
/**
 * Standard integration test setup with proper cleanup
 *
 * Features:
 * - Environment variables set before imports
 * - HTTP server lifecycle management
 * - Database pool cleanup
 * - Graceful error handling
 */

import type { Express } from 'express';
import type { Server } from 'http';
import { pool } from '../../server/db';

export interface IntegrationTestContext {
  server: Server;
  app: Express;
  baseUrl: string;
}

export async function setupIntegrationTest(
  registerRoutes: (app: Express) => Promise<Server>
): Promise<IntegrationTestContext> {
  const express = (await import('express')).default;
  const app = express();

  app.set('trust proxy', false);
  app.use(express.json({ limit: '1mb' }));

  const server = await registerRoutes(app);

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const address = server.address();
  const baseUrl =
    typeof address === 'object' && address !== null
      ? `http://localhost:${address.port}`
      : 'http://localhost:0';

  return { server, app, baseUrl };
}

export async function teardownIntegrationTest(server: Server): Promise<void> {
  // Clean up database pool FIRST (before server close)
  // This prevents Neon serverless timeout errors
  if (pool && typeof pool === 'object' && 'end' in pool) {
    try {
      await (pool as { end: () => Promise<void> }).end();
    } catch (error) {
      // Ignore pool cleanup errors - pool might already be closed
      console.warn(
        'Pool cleanup warning:',
        error instanceof Error ? error.message : 'Unknown'
      );
    }
  }

  // Close HTTP server LAST
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}
```

### Phase 2: Update All Integration Tests

**Pattern to apply** (example for lp-api.test.ts):

```typescript
/**
 * IMPORTANT: Set test environment variables before ANY imports
 * to ensure db.ts uses mocked database instead of real Neon pool
 */
process.env.NODE_ENV = 'test';
process.env.VITEST = 'true';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
} from '../helpers/integration-test-setup';
import { registerRoutes } from '../../server/routes';
import { errorHandler } from '../../server/errors';

describe('LP API', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const context = await setupIntegrationTest(registerRoutes);
    server = context.server;
    baseUrl = context.baseUrl;
  });

  afterAll(async () => {
    await teardownIntegrationTest(server);
  });

  // ... tests ...
});
```

### Phase 3: Connection Pooling Best Practices

**File**: `server/db.ts` (enhancement)

Add explicit cleanup export:

```typescript
export async function closePool(): Promise<void> {
  if (pool && typeof pool === 'object' && 'end' in pool) {
    await (pool as { end: () => Promise<void> }).end();
  }
}
```

### Phase 4: Validation

1. **Run all integration tests**: `npm test -- tests/integration/`
2. **Check for Neon errors**: No "Cannot read properties of null" errors
3. **Verify cleanup**: No hanging connections after tests
4. **Performance check**: Test suite duration unchanged or improved

## Implementation Checklist

- [ ] Create `tests/helpers/integration-test-setup.ts` with reusable patterns
- [ ] Add `closePool()` export to `server/db.ts`
- [ ] Update 29 remaining integration test files with new pattern
  - [ ] Move NODE_ENV/VITEST to top of each file
  - [ ] Replace manual setup/teardown with helper functions
  - [ ] Add pool cleanup to afterAll hooks
- [ ] Test each file individually: `npm test -- <file>`
- [ ] Run full integration test suite
- [ ] Document pattern in `cheatsheets/integration-testing-patterns.md`
- [ ] Update CHANGELOG.md with improvements
- [ ] Update DECISIONS.md with ADR for cleanup pattern

## Success Criteria

✅ All integration tests pass ✅ No Neon timeout errors ✅ No unhandled
exceptions during cleanup ✅ Test duration ≤ current baseline (34s) ✅ Pattern
documented for future tests

## Estimated Effort

- **Setup (Phase 1)**: 30 minutes
- **Individual file updates (Phase 2)**: 15 minutes × 29 files = ~7 hours
  - _Can be parallelized with /dev workflow or multiple sessions_
- **Validation (Phase 4)**: 1 hour
- **Documentation**: 30 minutes

**Total**: ~9 hours (or ~2 hours if parallelized with agents)

## Rollout Strategy

**Recommended**: Incremental PR approach

1. PR 1: Create helper + update 5 files → verify
2. PR 2: Update 10 files → verify
3. PR 3: Update 10 files → verify
4. PR 4: Update remaining 4 files + documentation

**Benefit**: Easier to review, bisect issues, rollback if needed

## Related Work

- **Option 1**: ✓ COMPLETE - Skipped unstable tests
- **Baseline**: 86.7% pass rate (2960/3444 tests)
- **Branch**: fix/server-startup-and-eslint
