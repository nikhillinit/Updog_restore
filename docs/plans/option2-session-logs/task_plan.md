# Option 2: Comprehensive Integration Test Cleanup - Task Plan

**Created**: 2026-01-13 **Status**: [PLANNED] Not Started **Estimated
Duration**: 4-5 hours (or 2 hours with agent parallelization) **Prerequisites**:
Option 1 complete, test suite passing

---

## Objective

Fix module initialization order issues and standardize database cleanup patterns
across all 12 affected integration test files.

---

## Context from Option 1

**Root Cause Identified**:

- Environment variables set AFTER module imports
- db.ts initializes with production Neon pool before NODE_ENV='test' is set
- afterAll hooks fail to cleanup real pools

**Quick Fix Applied**:

- Skipped 2 tests with documentation
- Test suite now passing (86.0%)

**This Plan**:

- Comprehensive architectural fix for all affected files
- Reusable patterns for future tests
- Re-enable skipped tests

---

## Scope

**Files Affected**: 12 integration tests

- 2 already skipped (backtesting-api, testcontainers-smoke)
- 4 need migration (allocations, rls-middleware, reserves, circuit-breaker)
- 6 already compliant (no changes needed)

**Anti-Patterns to Fix**:

- AP-TEST-DB-01: Missing pool.end() in afterAll
- AP-TEST-DB-02: Inconsistent Testcontainer usage
- AP-TEST-DB-03: Per-test pool creation
- AP-TEST-DB-04: Skipped tests with no migration plan

---

## Phases

### Phase 1: Create Reusable Helper Pattern [PENDING]

**Duration**: 30 minutes **Priority**: 1 (blocking)

- [ ] Create `tests/helpers/integration-test-setup.ts`
  - [ ] `setupIntegrationTest()` function
  - [ ] `teardownIntegrationTest()` function
  - [ ] Environment variable enforcement (NODE_ENV before imports)
  - [ ] Shared pool cleanup logic
  - [ ] Error handling with try-catch

- [ ] Add `closePool()` export to `server/db.ts`
  - [ ] Graceful shutdown function
  - [ ] Null-safe implementation
  - [ ] Called from teardown helper

**Success Criteria**:

- Helper compiles without errors
- Pattern documented with JSDoc
- Example usage in comments

---

### Phase 2: Fix Critical Files (Priority 1) [PENDING]

**Duration**: 4 hours **Priority**: 1 (critical connection leaks)

#### Task 2.1: Fix allocations.test.ts

**Duration**: 2 hours

- [ ] Move NODE_ENV to top of file (before imports)
- [ ] Convert to Testcontainer helper pattern
- [ ] Replace direct pool import with helper
- [ ] Add `withTransaction` for test isolation
- [ ] Remove `describe.skip`
- [ ] Verify tests pass

**Current Issue**: Skipped, missing pool cleanup **Files**:
`tests/api/allocations.test.ts`

#### Task 2.2: Fix rls-middleware.test.ts

**Duration**: 1 hour

- [ ] Fix JWT_SECRET configuration (already done in vitest.config.ts)
- [ ] Replace mock pool with real Testcontainer pool
- [ ] Add teardown helper
- [ ] Remove `describe.skip`
- [ ] Verify middleware tests pass

**Current Issue**: Skipped, JWT config + mock pool **Files**:
`tests/integration/rls-middleware.test.ts`

#### Task 2.3: Fix reserves-integration.test.ts

**Duration**: 30 minutes (when engine ready)

- [ ] Wait for Reserves v1.1 engine implementation
- [ ] Add database connection cleanup to existing afterAll
- [ ] Extend cache cleanup pattern to include DB
- [ ] Remove `describe.skip`
- [ ] Verify reserve tests pass

**Current Issue**: Skipped, missing Reserves v1.1 engine **Files**:
`tests/integration/reserves-integration.test.ts` **Blocker**: Engine
implementation not complete

#### Task 2.4: Fix circuit-breaker-db.test.ts

**Duration**: 30 minutes

- [ ] Fix missing imports from `../../server/db`
- [ ] Verify `shutdownDatabases()` closes all pools
- [ ] Remove `describe.skip`
- [ ] Verify circuit breaker tests pass

**Current Issue**: Skipped, missing database imports **Files**:
`tests/integration/circuit-breaker-db.test.ts`

---

### Phase 3: Optimize Existing Patterns [PENDING]

**Duration**: 30 minutes **Priority**: 2 (optimization)

#### Task 3.1: testcontainers-smoke.test.ts

- [ ] Replace per-test Pool creation with shared pool
- [ ] Use `withTransaction` helper for isolation
- [ ] Keep existing `cleanupTestContainers()` pattern
- [ ] Measure performance improvement

**Current Issue**: Creates new Pool per test (inefficient) **Files**:
`tests/integration/testcontainers-smoke.test.ts`

---

### Phase 4: Re-enable Skipped Tests [PENDING]

**Duration**: 1 hour **Priority**: 1 (remove technical debt)

- [ ] Re-enable backtesting-api.test.ts
  - [ ] Convert to helper pattern
  - [ ] Add proper cleanup
  - [ ] Remove `describe.skip`

- [ ] Re-enable testcontainers-smoke.test.ts
  - [ ] Document Docker requirement in README
  - [ ] Add CI check for Docker availability
  - [ ] Conditional skip if Docker unavailable

**Success Criteria**:

- Both tests passing when Docker available
- Clear error message when Docker missing
- CI handles Docker unavailability gracefully

---

### Phase 5: Add Connection Monitoring [PENDING]

**Duration**: 1 hour **Priority**: 3 (observability)

- [ ] Add connection leak detection to `tests/setup/test-infrastructure.ts`
- [ ] Add pool stats logging to `afterAll` in all integration tests
- [ ] Create `npm run test:integration:leaks` command
- [ ] Add CI check for connection leaks (fail if pool.totalCount > 0)
- [ ] Create monitoring dashboard (optional)

**Success Criteria**:

- Leak detection script passes
- Pool stats show 0 connections after tests
- CI fails if leaks detected

---

### Phase 6: Documentation & Cleanup [PENDING]

**Duration**: 1 hour **Priority**: 3 (knowledge sharing)

- [ ] Update `cheatsheets/testing.md` with connection cleanup patterns
- [ ] Update `cheatsheets/service-testing-patterns.md` with pool best practices
- [ ] Create `cheatsheets/integration-test-cleanup.md` (detailed guide)
- [ ] Add cleanup checklist to `cheatsheets/anti-pattern-prevention.md`
- [ ] Update CHANGELOG.md with improvements
- [ ] Create ADR for cleanup pattern in DECISIONS.md

**Success Criteria**:

- New developers can follow patterns from cheatsheets
- Anti-pattern checklist includes AP-TEST-DB-01 through 04
- ADR explains why we chose helper pattern

---

## Implementation Strategy

### Incremental Rollout (Recommended)

**PR 1: Infrastructure** (1 hour)

- Phase 1: Create helper pattern
- Phase 5: Add monitoring
- Risk: Low, no test changes

**PR 2: Critical Fixes** (2-3 hours)

- Phase 2: Fix allocations + rls-middleware
- Re-enable 2 tests
- Risk: Medium, behavior changes

**PR 3: Remaining Fixes** (1 hour)

- Phase 2: Fix reserves + circuit-breaker (when ready)
- Phase 3: Optimize testcontainers-smoke
- Risk: Low, mostly cleanup

**PR 4: Documentation** (1 hour)

- Phase 6: All documentation updates
- Risk: None, docs only

### Agent-Driven Execution (Faster)

**Use /dev agent for parallel implementation**:

```bash
/dev Implement Option 2 Phase 1: Create integration-test-setup helper
# Agent executes Phase 1 while you review

/dev Implement Option 2 Phase 2.1: Fix allocations.test.ts
# Agent executes Phase 2.1 in parallel

# Continue with remaining phases
```

**Benefit**: ~2 hours total vs 4-5 hours sequential

---

## Validation Protocol

### Pre-Implementation

- [ ] Baseline: Run current test suite, record pass rate
- [ ] Identify: List all tests with database connections
- [ ] Verify: No connection leaks in compliant tests (baseline)

### Post-Phase Validation

- [ ] After each phase: Run affected tests
- [ ] Check pool stats: `totalCount: 0` after cleanup
- [ ] Verify no unhandled exceptions
- [ ] Measure performance: Duration <= baseline

### Final Validation

- [ ] Run full integration test suite:
      `npm test -- --project=server --grep="integration"`
- [ ] Run leak detection: `npm run test:integration:leaks`
- [ ] Verify all skipped tests re-enabled (or documented why not)
- [ ] Check CI passes on clean branch

---

## Success Criteria

- [ ] All integration tests pass
- [ ] No connection leaks (pool.totalCount === 0)
- [ ] No unhandled exceptions
- [ ] Test duration <= 35s (current baseline: 34.17s)
- [ ] All skipped tests re-enabled or documented with blocker
- [ ] Reusable pattern documented in cheatsheets
- [ ] CI checks enforce connection cleanup

---

## Risk Mitigation

### Low Risk (Safe)

- Adding afterAll cleanup to existing tests
- Using withTransaction for isolation
- Adding monitoring

### Medium Risk (Test First)

- Converting to Testcontainer helper (behavior changes)
- Re-enabling skipped tests (may expose other issues)
- Modifying shared pool config

### High Risk (Defer)

- Changing describe.skip to conditional execution
- Disabling test isolation
- Modifying Neon pool internals

**Mitigation**:

- Run each test individually before bulk changes
- Keep PR size small (5-10 files max)
- Rollback plan: Revert to skip pattern if issues arise

---

## Metrics to Track

**Before**:

- Pass Rate: 86.0% (2960/3444)
- Skipped Tests: 28 (2 Option 1 + 26 existing)
- Integration Test Duration: 34.17s

**Target**:

- Pass Rate: 90%+ (re-enable 4 tests)
- Skipped Tests: 24 (re-enable 4 Option 1 tests)
- Integration Test Duration: ≤ 35s
- Connection Leaks: 0

---

## Related Documentation

- **Option 1 Findings**: `docs/plans/option1-session-logs/findings.md`
- **Comprehensive Plan**: `docs/plans/OPTION2-INTEGRATION-TEST-CLEANUP.md`
- **Anti-Patterns**: `cheatsheets/anti-pattern-prevention.md`
- **Testcontainers**: `cheatsheets/testcontainers-guide.md`

---

## Session Log (To Be Updated During Implementation)

_This section will be populated as work progresses. Each session will add:_

- Date/time
- Phase worked on
- Changes made
- Test results
- Issues encountered
- Learnings

**See**: `docs/plans/option2-session-logs/progress.md` (to be created when work
starts)

---

**Plan Status**: READY FOR EXECUTION **Next Action**: Start Phase 1 (create
helper pattern) or delegate to /dev agent
