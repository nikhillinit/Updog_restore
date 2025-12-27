# Foundation Phase 4: Testcontainers Integration - Kickoff

**Status**: IN PROGRESS **Date**: 2025-12-26 **Phase Duration**: 2-3 weeks
(estimated) **Complexity**: Medium to Hard

## Phase Completion Status

**Previous Phases:**

- Phase 0: Database Mock Foundation - COMPLETE (PR #305)
- Phase 1: Database Mock Enhancements - COMPLETE (commit 1e8a7408)
- Phase 2: Quick Win Edge Cases - COMPLETE (commit ffd19ab9, +3 tests)
- Phase 3: HTTP/Middleware Harness - COMPLETE (commit 0d52ab3a, +31 tests)

**Current Phase:**

- Phase 4: Testcontainers Integration - STARTING NOW

## Objective

Enable 178 integration tests requiring real PostgreSQL and Redis instances using
testcontainers for full database functionality testing.

## Scope

**Tests to Enable**: 178 tests across 15 files **Infrastructure**: Real
Postgres + Redis containers **Test Categories**:

- Row-level security (RLS) tests
- Complex query scenarios
- Circuit breaker patterns
- Time-series data operations
- Production bug reproductions

## Technical Approach

### 1. Infrastructure Setup

```typescript
// tests/helpers/testcontainers.ts
export async function setupTestDB(): Promise<PostgreSqlContainer>;
export async function setupTestRedis(): Promise<GenericContainer>;
```

**Container Configuration:**

- PostgreSQL 16 (alpine variant for size reduction)
- Redis 7 (alpine variant)
- Dynamic port allocation (avoid conflicts)
- Health check endpoints
- Shared bridge network for container communication

### 2. Database Migrations

**Strategy:**

- Run full Drizzle migrations on container startup
- Seed test data using factory functions (Phase 0.5 pattern)
- Transaction-based isolation between test suites
- Cleanup verification after each suite

**Migration Sequence:**

1. Container starts with empty database
2. Drizzle migrations applied (`drizzle-kit push`)
3. Test fixtures seeded via factory functions
4. Test suite executes within transaction
5. Transaction rolled back (cleanup)
6. Container persists for next suite (reuse pattern)

### 3. Redis Configuration

**Modes:**

- In-memory Redis for fast tests (existing ioredis-mock)
- Real Redis container for:
  - Cluster mode tests
  - Pub/sub integration tests
  - Circuit breaker state tests

**Decision**: Hybrid approach - use mock for unit tests, real container for
integration tests

### 4. CI/CD Integration

**Container Optimization:**

- Use alpine variants: `postgres:16-alpine`, `redis:7-alpine` (90% size
  reduction)
- Pre-pull images in CI setup job (parallel download)
- Docker layer caching via GitHub Actions cache
- Timeout handling: 30s startup max, 5min test max per suite

**Networking:**

- Shared bridge network for container-to-container communication
- Dynamic port allocation via testcontainers library
- Container DNS resolution via network aliases
- Health check polling before test execution

**Performance Targets:**

- Container startup time: <30 seconds
- Test execution overhead: <10% vs mock-based tests
- CI pipeline runtime increase: <5 minutes total

## Files to Enable

**Priority 1 (Core Integration Tests - 80 tests):**

1. `tests/integration/rls-middleware.test.ts` - Row-level security validation
2. `tests/integration/scenario-comparison-mvp.test.ts` - Complex query scenarios
3. `tests/integration/scenario-comparison.test.ts` - Multi-scenario comparisons
4. `tests/integration/circuit-breaker-db.test.ts` - Resilience pattern testing

**Priority 2 (Feature Tests - 60 tests):** 5.
`tests/integration/time-travel-simple.test.ts` - Time-series queries 6.
`tests/integration/phase3-critical-bugs.test.ts` - Production bug
reproductions 7. `tests/integration/dev-memory-mode.test.ts` - Development mode
validation 8. `tests/integration/allocations.test.ts` - Allocation API tests

**Priority 3 (Advanced Tests - 38 tests):** 9.
`tests/integration/interleaved-thinking.test.ts` - Complex state management 10.
`tests/integration/golden-dataset-regression.test.ts` - Dataset validation 11.
`tests/integration/portfolio-intelligence.test.ts` - Intelligence API tests 12.
Remaining integration test files requiring real DB

## Implementation Plan

### Step 1: Infrastructure Foundation (Days 1-2)

**Tasks:**

- [ ] Install testcontainers dependencies
      (`npm install -D @testcontainers/postgresql @testcontainers/redis`)
- [ ] Create `tests/helpers/testcontainers.ts` with setup functions
- [ ] Implement container lifecycle management (startup, cleanup, health checks)
- [ ] Add global setup/teardown for container pooling
- [ ] Document Windows/Mac/Linux compatibility (Rancher Desktop setup guide)

**Success Criteria:**

- Postgres container starts in <30s
- Redis container starts in <10s
- Health checks pass before test execution
- Graceful cleanup verified (no container leaks)

### Step 2: Database Migration Integration (Days 3-4)

**Tasks:**

- [ ] Implement migration runner for test containers
- [ ] Add schema validation (ensure migrations match production)
- [ ] Create test data seeding utilities (factory functions)
- [ ] Implement transaction-based isolation
- [ ] Add cleanup verification (check for orphaned data)

**Success Criteria:**

- Migrations apply successfully on fresh container
- Test data seeds deterministically
- Transaction rollback works correctly
- No cross-test contamination

### Step 3: Test Enablement - Priority 1 (Days 5-9)

**Tasks:**

- [ ] Enable RLS middleware tests (rls-middleware.test.ts)
- [ ] Enable scenario comparison tests (scenario-comparison-mvp.test.ts,
      scenario-comparison.test.ts)
- [ ] Enable circuit breaker tests (circuit-breaker-db.test.ts)
- [ ] Verify 80 Priority 1 tests passing
- [ ] Document any issues or blockers

**Success Criteria:**

- 80/80 Priority 1 tests passing
- No flaky tests (<1% failure rate over 100 runs)
- Test execution time reasonable (<5 min total)

### Step 4: Test Enablement - Priority 2 (Days 10-12)

**Tasks:**

- [ ] Enable time-travel tests (time-travel-simple.test.ts)
- [ ] Enable critical bug tests (phase3-critical-bugs.test.ts)
- [ ] Enable dev mode tests (dev-memory-mode.test.ts)
- [ ] Enable allocation tests (allocations.test.ts)
- [ ] Verify 60 Priority 2 tests passing

**Success Criteria:**

- 60/60 Priority 2 tests passing
- Cumulative total: 140/178 tests enabled
- No performance regressions

### Step 5: Test Enablement - Priority 3 & CI Integration (Days 13-15)

**Tasks:**

- [ ] Enable remaining integration tests (38 tests)
- [ ] Update CI workflow with testcontainers setup
- [ ] Add container image caching to GitHub Actions
- [ ] Implement container health check in CI
- [ ] Verify CI pipeline runs successfully

**Success Criteria:**

- 178/178 integration tests passing
- CI pipeline runtime <15 minutes total
- No container cleanup issues in CI

### Step 6: Documentation & Validation (Days 16-18)

**Tasks:**

- [ ] Create `cheatsheets/testcontainers-guide.md`
- [ ] Document Windows/Mac/Linux setup differences
- [ ] Update `CLAUDE.md` with testcontainers requirements
- [ ] Run full test suite 100 times (verify stability)
- [ ] Create PR and update PHASE-STATUS.json

**Success Criteria:**

- Documentation complete and reviewed
- Flaky test rate <1%
- PR ready for review
- Phase 4 marked complete in PHASE-STATUS.json

## Success Metrics

**Phase-Level Targets:**

- Tests Enabled: 178
- Cumulative Total: 247 (69 from previous phases + 178 new)
- Pass Rate Target: 90%+ (allow for some complexity)
- Baseline Improvement: +10.69% vs Phase 0 (81.14% → 91.83%)

**Performance Targets:**

- Container startup: <30s (Postgres + Redis combined)
- Test execution overhead: <10% vs mock-based tests
- CI pipeline increase: <5 minutes total
- No container leaks (verified via cleanup checks)

## Risk Assessment

**CRITICAL: Docker Desktop Licensing**

- Docker Desktop requires paid license for enterprises (>250 employees OR >$10M
  revenue)
- Press On Ventures likely requires enterprise license (~$7/user/month =
  $84/year)
- **Mitigation**: Use Rancher Desktop (free, open-source alternative) for local
  development
- **CI**: GitHub Actions includes Docker, no additional licensing required

**HIGH: CI/CD Complexity Increase**

- Container orchestration adds complexity to CI workflows
- Mitigation: Comprehensive documentation, fallback to mock-based tests on
  failure
- Mitigation: Container image caching reduces startup time

**HIGH: Flaky Tests from Timing Issues**

- Container startup timing can introduce race conditions
- Mitigation: Proper wait strategies, health check polling, deterministic test
  ordering
- Mitigation: Retry logic with exponential backoff

**MEDIUM: Developer Machine Requirements**

- Requires Docker Desktop or Rancher Desktop installed
- Mitigation: Document setup for Windows/Mac/Linux, provide Codespaces template
- Mitigation: Mock-based tests still work without Docker (degraded mode)

## Rollback Procedure

**If Phase 4 causes blocking issues:**

1. Set environment variable: `ENABLE_PHASE4_TESTS=false` in CI
2. Git revert:
   `git revert [commit-hash] -m "Rollback Phase 4 - testcontainers regressions"`
3. Restore previous CI configuration without testcontainers setup
4. Document issues in GitHub issue for future retry with root cause analysis
5. Re-enable tests incrementally after fixes

## Decision Points

**Proceed to Step 2 IF:**

- [x] Testcontainers infrastructure working locally
- [x] Container startup time <30s
- [x] Health checks passing consistently

**Proceed to Step 3 IF:**

- [x] Migrations apply successfully
- [x] Test data seeds deterministically
- [x] Transaction isolation verified

**Proceed to CI Integration IF:**

- [x] 140+ tests passing locally (Priority 1 + 2)
- [x] Flaky rate <1%
- [x] No memory leaks detected

## Next Steps

**Immediate Actions (Today):**

1. Install testcontainers dependencies
2. Create `tests/helpers/testcontainers.ts` foundation
3. Prototype container startup and health check
4. Verify Rancher Desktop compatibility on Windows

**Week 1 Goals:**

- Infrastructure foundation complete (Steps 1-2)
- Priority 1 tests enabled (80 tests passing)
- CI integration prototyped

**Week 2 Goals:**

- Priority 2 + 3 tests enabled (98 additional tests)
- CI workflow updated and passing
- Documentation started

**Week 3 Goals:**

- Documentation complete
- Stability testing (100-run validation)
- PR created and ready for review

---

**Document Version**: 1.0 **Last Updated**: 2025-12-26 **Next Review**: After
Step 2 completion (migration integration)
