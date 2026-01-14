# Option 2: Comprehensive Integration Test Cleanup - Task Plan

**Created**: 2026-01-13 **Revised**: 2026-01-13 (ultrathink analysis applied)
**Status**: [PLANNED] Architecture Validated **Estimated Duration**: 4-5 hours
**Prerequisites**: Option 1 complete, test suite passing

---

## CRITICAL ARCHITECTURE CORRECTIONS

Three "stop ship" defects were identified in the original plan. These MUST be
addressed or the test suite will fail catastrophically in CI.

### Defect 1: Singleton Suicide (Parallel Execution Bug)

**Problem**: Calling `pool.end()` in per-file `afterAll` kills shared singleton
for parallel tests.

- TestFile_A finishes → calls `afterAll` → closes the pool
- TestFile_B (running in parallel) tries to query → crashes with "Client has
  been closed"

**Fix**: Never close shared singleton pool in per-file `afterAll`. Use Vitest's
`globalTeardown` configuration.

### Defect 2: Fake Transaction Isolation

**Problem**: Drizzle auto-commits transactions if callback executes
successfully. `databaseMock.reset()` does NOT rollback SQL transactions.

**Fix**: Use "Rollback Exception" pattern - throw an error at transaction end to
force database to discard changes.

### Defect 3: Static Import Race Condition

**Problem**: `import { db } from '@/server/db'` executes BEFORE `beforeAll`
runs. ESM imports are hoisted and execute immediately on file load.

**Fix**: Use dynamic imports inside `beforeAll`:

```typescript
let db: any;
beforeAll(async () => {
  ({ db } = await import('../../server/db/index.js'));
});
```

---

## Objective

Fix module initialization order issues and standardize database cleanup patterns
across all 12 affected integration test files, avoiding the three critical
architectural defects.

---

## Context from Option 1

**Root Cause Identified**:

- Environment variables set AFTER module imports (ESM hoisting)
- db.ts initializes with production Neon pool before NODE_ENV='test' is set
- afterAll hooks fail to cleanup real pools

**Quick Fix Applied**:

- Skipped 2 tests with documentation
- Test suite now passing (86.0%)

**This Plan (Corrected)**:

- Phase 0: Eliminate import-time DB pool creation
- Corrected helper architecture (no singleton suicide)
- True transaction isolation (rollback pattern)
- Dynamic imports to avoid race conditions

---

## Scope

**Files Affected**: 12 integration tests

- 2 already skipped (backtesting-api, testcontainers-smoke)
- 4 need migration (allocations, rls-middleware, reserves, circuit-breaker)
- 3 additional offenders identified (scenario-comparison-mvp)
- 6 already compliant (no changes needed)

**Anti-Patterns to Fix**:

- AP-TEST-DB-01: Missing pool.end() in afterAll (BUT: use globalTeardown, not
  per-file)
- AP-TEST-DB-02: Inconsistent Testcontainer usage
- AP-TEST-DB-03: Per-test pool creation
- AP-TEST-DB-04: Skipped tests with no migration plan
- AP-TEST-DB-05: [NEW] Top-level DB imports in skipped files
- AP-TEST-DB-06: [NEW] Static imports causing race conditions

---

## Phases

### Phase 0: Ban Top-Level DB Imports in Skipped Files [CRITICAL]

**Duration**: 1 hour **Priority**: 0 (blocking, highest leverage)

**Why First**: In ESM, `import` executes before any `process.env...` line.
Skipped suites still create real pools just by importing modules.

**Key Offenders Identified** (5 critical files):

- `tests/integration/scenario-comparison-mvp.test.ts` - imports `db` at
  top-level even though `describe.skip`
- `tests/api/allocations.test.ts` - imports `pool` at top-level even though
  `describe.skip`
- `tests/integration/circuit-breaker-db.test.ts` - imports `../../server/db` at
  top-level even though `describe.skip`
- `tests/integration/backtesting-api.test.ts` - imports `pool` at top-level
- `tests/api/deal-pipeline.test.ts` - imports `pool` at top-level even though
  `describe.skip` [NEW - discovered via brainstorming]

**Unit Test Files for Phase 2** (8 files, lower priority):

- `tests/unit/services/backtesting-service.test.ts`
- `tests/unit/services/monte-carlo-engine.test.ts`
- `tests/unit/services/performance-prediction.test.ts`
- `tests/unit/services/variance-tracking.test.ts`
- `tests/unit/api/time-travel-api.test.ts`
- `tests/unit/engines/monte-carlo.test.ts`
- `tests/unit/reallocation-api.test.ts`
- `tests/unit/redis-factory.test.ts`

**Tasks**:

- [ ] Audit all test files for top-level DB imports
- [ ] Move DB imports into `beforeAll` using dynamic import pattern:

```typescript
const describeMaybe =
  process.env.ENABLE_PHASE4_TESTS === 'true' ? describe : describe.skip;

describeMaybe('Suite Name', () => {
  let db: any;

  beforeAll(async () => {
    ({ db } = await import('../../server/db/index.js'));
  });
});
```

- [ ] Remove in-test-file env hacks (`process.env.NODE_ENV = 'test'`)
- [ ] Verify skipped suites no longer create DB connections

**Success Criteria**:

- Running tests WITHOUT `ENABLE_PHASE4_TESTS` creates zero DB connections
- No hangs/timeouts from pools created during import

---

### Phase 1: Create Corrected Helper Pattern [PENDING]

**Duration**: 45 minutes **Priority**: 1 (blocking)

**Architecture**: Separate Lifecycle Management (Global) from Test Isolation
(Per-Test)

#### Task 1.1: Create Global Teardown

**File**: `tests/setup/global-teardown.ts`

```typescript
// Pool cleanup happens ONCE after entire suite, not per-file
export default async function globalTeardown() {
  const { shutdownDatabases } = await import('../../server/db/index.js');
  if (shutdownDatabases) {
    await shutdownDatabases();
  }
}
```

- [ ] Create `tests/setup/global-teardown.ts`
- [ ] Add to `vitest.config.ts` globalTeardown
- [ ] Verify pool closed after entire suite completes

#### Task 1.2: Create Integration Test Helper

**File**: `tests/helpers/integration-test-setup.ts`

```typescript
import { afterEach, vi } from 'vitest';

// NOTE: Pool cleanup handled by global-teardown.ts, NOT here
export const setupIntegrationTest = () => {
  afterEach(() => {
    vi.clearAllMocks();
  });
};

/**
 * True Isolation via Rollback
 * Forces transaction rollback so no data persists
 */
class RollbackToken extends Error {}

export const withTransaction = async <T>(
  callback: (tx: typeof db) => Promise<T>
) => {
  const { db } = await import('../../server/db/index.js');

  try {
    await db.transaction(async (tx) => {
      await callback(tx);
      throw new RollbackToken('Rollback'); // FORCE rollback
    });
  } catch (e) {
    if (!(e instanceof RollbackToken)) {
      throw e; // Re-throw real errors
    }
  }
};
```

- [ ] Create `tests/helpers/integration-test-setup.ts`
- [ ] Implement `RollbackToken` pattern for true isolation
- [ ] Use dynamic imports to avoid race conditions
- [ ] Document pattern with JSDoc

#### Task 1.3: Update Vitest Config

- [ ] Hardcode `process.env.NODE_ENV = 'test'` in `vitest.config.ts` env block
- [ ] Add globalSetup for Testcontainers (conditional on ENABLE_PHASE4_TESTS)
- [ ] Add globalTeardown for pool cleanup
- [ ] Set testTimeout: 30000 for Docker-based tests

**Success Criteria**:

- Helper compiles without errors
- No pool.end() calls in per-file afterAll
- RollbackToken pattern verified with test

---

### Phase 2: Fix Critical Files (Priority 1) [PENDING]

**Duration**: 2 hours **Priority**: 1 (critical connection leaks)

#### Task 2.1: Fix allocations.test.ts

- [ ] Remove top-level `pool` import
- [ ] Add dynamic import in `beforeAll`
- [ ] Use `withTransaction` for test isolation (RollbackToken pattern)
- [ ] Remove `describe.skip` (or convert to conditional)
- [ ] Verify tests pass

**Current Issue**: Imports `pool` at top-level even when skipped **Files**:
`tests/api/allocations.test.ts`

#### Task 2.2: Fix rls-middleware.test.ts

- [ ] Remove `vi.mock()` inside `beforeAll` (not reliably hoisted)
- [ ] Use JWT_SECRET from vitest.config.ts (already configured)
- [ ] Convert to dynamic imports
- [ ] Remove `describe.skip`
- [ ] Verify middleware tests pass

**Current Issue**: Uses vi.mock() in beforeAll, short JWT_SECRET **Files**:
`tests/integration/rls-middleware.test.ts`

**WARNING**: Do NOT use `vi.resetModules()` repeatedly - creates new pool per
reset, exhausts max_connections

#### Task 2.3: Fix circuit-breaker-db.test.ts

- [ ] Remove top-level `../../server/db` import
- [ ] Add dynamic import in `beforeAll`
- [ ] Use conditional describe pattern
- [ ] Verify `shutdownDatabases()` only called in globalTeardown
- [ ] Remove `describe.skip`

**Current Issue**: Top-level DB import even when skipped **Files**:
`tests/integration/circuit-breaker-db.test.ts`

#### Task 2.4: Fix scenario-comparison-mvp.test.ts

- [ ] Remove top-level `db` import (line 16)
- [ ] Add dynamic import in `beforeAll`
- [ ] Use conditional describe pattern
- [ ] Verify tests pass

**Current Issue**: Imports `db` at top-level even when skipped **Files**:
`tests/integration/scenario-comparison-mvp.test.ts`

#### Task 2.5: Fix deal-pipeline.test.ts [NEW]

- [ ] Remove top-level `pool` import (line 20)
- [ ] Add dynamic import in `beforeAll`
- [ ] Use conditional describe pattern
- [ ] Verify tests pass

**Current Issue**: Imports `pool` at top-level even when skipped **Files**:
`tests/api/deal-pipeline.test.ts`

---

### Phase 3: Re-enable Skipped Tests [PENDING]

**Duration**: 1 hour **Priority**: 1 (remove technical debt)

#### Task 3.1: Re-enable backtesting-api.test.ts

- [ ] Remove top-level `pool` import
- [ ] Convert to dynamic import pattern
- [ ] Use integration test helper
- [ ] Remove `describe.skip`
- [ ] Run 10x repeat for stability

**Files**: `tests/integration/backtesting-api.test.ts`

#### Task 3.2: Re-enable testcontainers-smoke.test.ts

- [ ] Use conditional describe based on Docker availability
- [ ] Document Docker requirement
- [ ] Add graceful skip message when Docker missing
- [ ] Run with ENABLE_PHASE4_TESTS=true

**Files**: `tests/integration/testcontainers-smoke.test.ts`

**Success Criteria**:

- Both tests passing when Docker available
- Clear skip message when Docker missing
- 10x repeat shows no flakiness

---

### Phase 4: Add Connection Monitoring & Leak Detection [PENDING]

**Duration**: 30 minutes **Priority**: 2 (observability)

- [ ] Add leak check in globalTeardown: fail if `waitingCount > 0`
- [ ] Add `afterEach` assertion: `expect(pool.waitingCount).toBe(0)`
- [ ] Create `npm run test:integration:leaks` command
- [ ] Add CI gate for connection leaks

**Success Criteria**:

- Leak detection catches real leaks
- Zero false positives
- CI fails if leaks detected

---

### Phase 5: Regression Prevention Gates [PENDING]

**Duration**: 45 minutes **Priority**: 2 (prevent future issues)

#### Task 5.1: Create ESLint Rule for DB Imports in Skipped Files

**File**: `eslint-rules/no-db-import-in-skipped-tests.cjs`

```javascript
/**
 * ESLint rule: no-db-import-in-skipped-tests
 * Flags describe.skip files that import from server/db
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow top-level DB imports in skipped test files',
      category: 'Best Practices',
    },
    messages: {
      noDbImportInSkipped:
        'Top-level DB import in skipped test creates pool at import time. Use dynamic import inside beforeAll.',
    },
  },
  create(context) {
    let hasDescribeSkip = false;
    let dbImports = [];

    return {
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.name === 'describe' &&
          node.callee.property.name === 'skip'
        ) {
          hasDescribeSkip = true;
        }
      },
      ImportDeclaration(node) {
        if (node.source.value.includes('server/db')) {
          dbImports.push(node);
        }
      },
      'Program:exit'() {
        if (hasDescribeSkip && dbImports.length > 0) {
          dbImports.forEach((node) => {
            context.report({ node, messageId: 'noDbImportInSkipped' });
          });
        }
      },
    };
  },
};
```

- [ ] Create ESLint rule file
- [ ] Add to `.eslintrc.cjs` local rules
- [ ] Test rule catches known offenders
- [ ] Document in cheatsheets

#### Task 5.2: Add CI Grep Gate (Backup)

**File**: `.github/workflows/test.yml` (or CI config)

```yaml
- name: Check for DB imports in skipped tests
  run: |
    # Find files with describe.skip AND server/db imports
    OFFENDERS=$(grep -rl "describe\.skip" tests/ --include="*.test.ts" | \
      xargs grep -l "from.*server/db" 2>/dev/null || true)
    if [ -n "$OFFENDERS" ]; then
      echo "ERROR: Found DB imports in skipped test files:"
      echo "$OFFENDERS"
      echo "Use dynamic imports inside beforeAll instead."
      exit 1
    fi
```

- [ ] Add CI check step
- [ ] Verify it catches known offenders
- [ ] Document bypass procedure (if intentional)

#### Task 5.3: Enforce "env owned by vitest setup"

- [ ] Ban `process.env.NODE_ENV = ...` in test files (ESLint rule)
- [ ] Document: env MUST come from vitest.config.ts

#### Task 5.4: Require withTransaction for DB tests

- [ ] Document: all DB-touching tests MUST use withTransaction
- [ ] Add to PR checklist

---

### Phase 6: Documentation & Cleanup [PENDING]

**Duration**: 30 minutes **Priority**: 3 (knowledge sharing)

- [ ] Update `cheatsheets/testing.md` with corrected patterns
- [ ] Add "Stop Ship" defects to `cheatsheets/anti-pattern-prevention.md`
- [ ] Document RollbackToken pattern
- [ ] Create ADR for helper architecture in DECISIONS.md
- [ ] Update CHANGELOG.md

---

## Corrected Implementation Strategy

### PR 1: Phase 0 + Phase 1 (Infrastructure)

**Duration**: 2 hours **Risk**: Low

- Ban top-level DB imports in skipped files
- Create corrected helper pattern
- Add globalTeardown
- Update vitest.config.ts

### PR 2: Phase 2 (Critical Fixes - 5 files)

**Duration**: 2.5 hours **Risk**: Medium

- Fix 5 critical files with dynamic imports (allocations, circuit-breaker-db,
  scenario-comparison-mvp, deal-pipeline, rls-middleware)
- Use RollbackToken pattern

### PR 2B: Phase 2B (Unit Test Conversions - 8 files) [DEFERRED]

**Duration**: 2 hours **Risk**: Low

- Convert 8 unit test files to dynamic imports
- Lower priority - these tests aren't skipped, so side effects are intentional
- Can be done in separate sprint

### PR 3: Phase 3 (Re-enable Tests)

**Duration**: 1 hour **Risk**: Medium

- Re-enable backtesting-api.test.ts
- Re-enable testcontainers-smoke.test.ts
- Stability testing (10x repeat)

### PR 4: Phase 4-6 (Monitoring + Docs)

**Duration**: 1 hour **Risk**: Low

- Add leak detection
- Regression prevention gates
- Documentation updates

---

## Validation Protocol (Corrected)

### "No Accidental DB Connections" Validation

- [ ] Run test suite WITHOUT `ENABLE_PHASE4_TESTS`
- [ ] Success: No connection attempts to localhost Postgres/Redis
- [ ] Success: No hangs/timeouts from pools created during import

### Leak Validation

- [ ] Assert `waitingCount === 0` after each test
- [ ] Assert `totalCount === 0` after globalTeardown
- [ ] `shutdownDatabases()` called exactly once (in globalTeardown)

### Stability Validation

- [ ] Run each fixed test 10x consecutively
- [ ] Zero failures = stable
- [ ] Any failures = investigate before merging

---

## Success Criteria (Revised)

- [ ] All integration tests pass
- [ ] No connection leaks (pool.waitingCount === 0)
- [ ] No unhandled exceptions
- [ ] Test duration <= 35s
- [ ] All skipped tests re-enabled or documented with blocker
- [ ] No pool.end() in per-file afterAll (only globalTeardown)
- [ ] RollbackToken pattern used for transaction isolation
- [ ] CI gates prevent regression

**Target**: 100% pass rate (not 90% - no broken windows)

---

## Key Insight

The biggest win is **eliminating import-time DB pool creation** in test files
and skipped suites. Once you enforce "no DB imports at top-level unless suite is
enabled," most Neon/local Postgres timeouts disappear, and the testcontainers
lane becomes deterministic.

---

## Related Documentation

- **Option 1 Findings**: `docs/plans/option1-session-logs/findings.md`
- **Ultrathink Analysis**: Applied 2026-01-13
- **Anti-Patterns**: `cheatsheets/anti-pattern-prevention.md`
- **Testcontainers**: `cheatsheets/testcontainers-guide.md`

---

## Session Log

### 2026-01-13: Ultrathink Analysis Applied

- Identified 3 "stop ship" defects in original architecture
- Added Phase 0 (ban top-level DB imports)
- Corrected helper pattern with RollbackToken
- Changed from per-file afterAll to globalTeardown
- Changed target from 90% to 100% pass rate
- Added regression prevention gates

---

**Plan Status**: ARCHITECTURE VALIDATED - Ready for execution **Next Action**:
Start Phase 0 (audit top-level DB imports)
