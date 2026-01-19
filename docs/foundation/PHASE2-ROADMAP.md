---
status: ACTIVE
last_updated: 2026-01-19
---

# Foundation Phase 2: Test Enablement Roadmap

**Status**: DRAFT **Author**: Claude Code **Date**: 2025-12-25 **Phase 0
Baseline**: PR #305 merged - Database mock orderBy/offset/limit complete

---

## Executive Summary

**Objective**: Enable 436 currently skipped tests across the codebase through
systematic infrastructure improvements and feature completion.

**Impact**:

- Increase test coverage from current baseline to comprehensive validation
- Reduce manual testing burden through automation
- Catch regressions earlier in development cycle
- Unlock blocked features awaiting test infrastructure

**Approach**: 6-phase incremental rollout prioritizing quick wins and
foundational improvements before tackling complex integration scenarios.

**Timeline**: Estimated 6-8 weeks for complete rollout (phases can overlap after
Phase 3)

---

## Phase 0: Pre-Phase 2 Baseline

**Measurement Date**: 2025-12-25 (after PR #305 merge)

### Test Metrics

- **Total Tests**: 2,311 tests
- **Passing**: 1,875 tests (81.14%)
- **Skipped**: 436 tests (18.86%)
- **Flaky Failure Rate**: <1% (measured via quarantined test tracking)

### Performance Metrics

- **CI Runtime**: ~1m40s (setup & build) + ~2m test execution = ~3m20s total
- **Test Suite Runtime** (local): 24.08s (transform 15.46s, setup 14.84s, tests
  39.52s)
- **Code Coverage**: Baseline measurement pending (coverage instrumentation adds
  overhead)

### Infrastructure

- **Database Mock**: Complete Drizzle ORM query builder
  (orderBy/offset/limit/where)
- **Test Fixtures**: 7 fixture files in `tests/fixtures/` (inventory needed)
- **CI Workflows**: 3 workflows (`test.yml`, `pr-tests.yml`, `ci-unified.yml`)

**Baseline Established**: All metrics above will be compared against Phase 2-7
progress.

---

## Phase 0 Foundation: Database Mock (COMPLETE)

**Completed**: 2025-12-XX via PR #305

**Achievements**:

- Implemented complete Drizzle ORM query builder in database mock
- Fixed orderBy with multiple columns and mixed ASC/DESC
- Added offset/limit support for pagination
- Enhanced where clause handling for complex queries
- All foundational database mock tests passing (100%)

**Foundation Established**: Phase 1-6 can now build on reliable mock
infrastructure

---

## Phase 0.5: Test Data Infrastructure (PREREQUISITE)

**Status**: TO BE EXECUTED BEFORE PHASE 1 **Effort**: 2-3 days **Complexity**:
Medium

**Objective**: Establish test data management foundation to support 178
integration tests in Phase 4.

### Technical Approach

1. **Fixture Audit**:
   - Inventory existing 7 fixture files in `tests/fixtures/`
   - Document fixture dependencies and usage patterns
   - Identify gaps for Phase 4 integration tests

2. **Seeding Strategy Selection**:

   **Option A: SQL Seed Files** (fast, brittle)
   - Pros: Fastest execution (<100ms), direct SQL control
   - Cons: Schema coupling, manual maintenance, no type safety

   **Option B: Drizzle Migrations** (slow, maintainable)
   - Pros: Type-safe, schema versioned, easy rollback
   - Cons: Slower execution (~500ms), migration overhead

   **Option C: Factory Functions** (RECOMMENDED)
   - Pros: Type-safe, flexible, good performance (~200ms), reusable
   - Cons: Requires factory library (e.g., fishery, factory.ts)
   - **Decision**: Use factory functions with Drizzle inserts

3. **Isolation Strategy**:
   - **Unit Tests**: In-memory database mock (existing, fast)
   - **Integration Tests** (Phase 4):
     - Option 1: Transaction rollback per test (fastest, limited isolation)
     - Option 2: Database per test suite (testcontainers, full isolation)
     - **Recommended**: Hybrid - transaction rollback for simple tests,
       container per suite for complex

4. **Golden Dataset Governance**:
   - **Storage**: Git LFS for large datasets (>10MB)
   - **Versioning**: Tag with schema version (e.g., `v1.2-golden-dataset`)
   - **Refresh Schedule**: Quarterly (Jan/Apr/Jul/Oct)
   - **Drift Detection**: Automated tolerance check (>5% deviation alerts)

### Success Criteria

- [ ] Fixture inventory documented with dependency graph
- [ ] Factory function library selected and prototyped
- [ ] Isolation strategy chosen and validated with 10-test sample
- [ ] Golden dataset versioning implemented
- [ ] Cleanup verified (zero test pollution between runs)

### Dependencies

None - This is a prerequisite for all subsequent phases

### Risks

- MEDIUM: Factory function learning curve
- Mitigation: Create examples and templates, reference existing patterns
- LOW: Golden dataset storage costs (Git LFS)
- Mitigation: Budget $5/month for Git LFS, compress datasets

---

## Current State: 436 Skipped Tests

**Static Analysis**: 424 tests with explicit `.skip()` across 41 files **Runner
Count**: 436 tests (delta due to conditional `.skipIf()` and parameterized
tests)

### Breakdown by Category

| Category               | Count   | Complexity  | Files  |
| ---------------------- | ------- | ----------- | ------ |
| Database Mock Gaps     | 19      | Easy/Medium | 3      |
| Integration Tests      | 178     | Medium/Hard | 15     |
| Feature Incomplete     | 156     | Medium/Hard | 19     |
| Flaky/Broken           | 27      | Hard        | 2      |
| Performance Tests      | 12      | Medium      | 2      |
| Other (ESM, templates) | 32      | Varies      | 3      |
| **Total**              | **424** | -           | **41** |

**Note**: 12-test delta (424 vs 436) attributed to dynamic skips not captured by
static analysis

---

## 6-Phase Implementation Plan

### Phase 1: Database Mock Enhancements

**Scope**: 19 tests across 3 files **Effort**: 1-2 days **Complexity**: Easy to
Medium

**Objective**: Close remaining gaps in database mock capabilities

**Technical Approach**:

1. **Unique Constraints** - Implement constraint validation in mock
   - File: `tests/integration/variance-tracking-schema.test.ts:154`
   - Validation: Unique default baseline per fund constraint
   - **Error Format Matching**: Postgres-compatible error codes
     - Code 23505: Unique constraint violation
     - Code 23503: Foreign key constraint violation
   - **Test Coverage**: Verify `error.code`, `error.constraint`, `error.table`
     match Postgres exactly

2. **View Support** - Add materialized view mocking
   - File: `tests/integration/variance-tracking-schema.test.ts:886`
   - View: `active_baselines` query support

3. **SQL Matcher Enhancements** - Improve query parameter matching
   - File: `tests/integration/performance-prediction.test.ts:726,737`
   - Gap: Query parameter type coercion

4. **Confidence Bounds Validation**
   - File: `tests/integration/variance-tracking-schema.test.ts:182`
   - Schema: Confidence interval boundaries

**Success Criteria**:

- [ ] All 19 database mock tests passing
- [ ] No new mock limitations introduced
- [ ] Mock performance within 10% of Phase 0 baseline

**Rollback Procedure**:

- [ ] Set environment variable: `ENABLE_PHASE1_TESTS=false` in CI
- [ ] Git revert:
      `git revert [commit-hash] -m "Rollback Phase 1 - DB mock regressions"`
- [ ] Restore previous database-mock.ts from Phase 0
- [ ] Document issues in GitHub issue for future retry with root cause analysis

**Dependencies**: None (builds on Phase 0 foundation)

**Risks**:

- LOW: Well-understood mock extensions
- Mitigation: Incremental implementation with test-per-feature

---

### Phase 2: Quick Win Edge Cases

**Scope**: 10 tests across 6 files **Effort**: 1 day **Complexity**: Easy

**Objective**: Enable tests with trivial fixes (missing guards, edge case
handling)

**Test Breakdown**:

1. **Liquidity Engine** - Zero cash guard
   - File: `tests/unit/core/liquidity-engine.test.ts:535`
   - Fix: Add zero balance validation

2. **Lot Service** - Edge cases
   - File: `tests/unit/services/lot-service.test.ts:92,283,312`
   - Fixes: Empty array handling, cursor edge, idempotency upsert

3. **Portfolio Intelligence** - Rate limiting toggle
   - File: `tests/integration/portfolio-intelligence.test.ts:1099`
   - Fix: Security middleware feature flag support

4. **Performance Prediction** - Metadata alignment
   - File: `tests/integration/performance-prediction.test.ts:737`
   - Fix: Schema field mapping

**Success Criteria**:

- [ ] All 10 quick win tests passing
- [ ] No production code regressions
- [ ] Test execution time < 50ms per test

**Rollback Procedure**:

- [ ] Set environment variable: `ENABLE_PHASE2_TESTS=false` in CI
- [ ] Git revert:
      `git revert [commit-hash] -m "Rollback Phase 2 - edge case regressions"`
- [ ] Restore previous guards and edge-case handling from Phase 1
- [ ] Document issues in GitHub issue for future retry with root cause analysis

**Dependencies**: Phase 1 complete

**Risks**:

- LOW: Isolated, well-defined fixes
- Mitigation: Each fix committed separately for easy rollback

---

### Phase 3: HTTP/Middleware Harness

**Scope**: ~40 tests across 4 files **Effort**: 3-4 days **Complexity**: Medium

**Objective**: Enable route and middleware tests with lightweight in-process
server

**Technical Approach**:

1. **Test Harness Design**:

   ```typescript
   // tests/helpers/http-harness.ts
   class TestHttpServer {
     constructor(routes: RouteConfig[]);
     async start(): Promise<void>;
     async stop(): Promise<void>;
     request(): SupertestAgent;
   }
   ```

2. **Middleware Stack**:
   - **Session Management**: express-session with memory store (test mode)
   - **Cookie Parser**: Parse signed cookies for auth tests
   - Authentication middleware toggle
   - Feature flag middleware
   - Rate limiting middleware
   - Circuit breaker middleware

3. **Mock Dependencies**:
   - Database: Use existing mock from Phase 1
   - Redis: In-memory stub (ioredis-mock)
   - External APIs: Nock interceptors

**Files Unlocked**:

- `tests/integration/flags-routes.test.ts` - Feature flag API routes
- `tests/integration/flags-hardened.test.ts` - Flag security tests
- `tests/integration/middleware.test.ts` - Middleware composition
- `tests/integration/portfolio-intelligence.test.ts` - Rate limiting/security

**Success Criteria**:

- [ ] HTTP harness supports Express middleware stack
- [ ] ~40 route/middleware tests passing
- [ ] Harness startup time < 100ms
- [ ] Graceful cleanup (no port conflicts)

**Rollback Procedure**:

- [ ] Set environment variable: `ENABLE_PHASE3_TESTS=false` in CI
- [ ] Git revert:
      `git revert [commit-hash] -m "Rollback Phase 3 - http harness regressions"`
- [ ] Restore previous middleware wiring without the test harness
- [ ] Document issues in GitHub issue for future retry with root cause analysis

**Dependencies**: Phases 1-2 complete

**Risks**:

- MEDIUM: Port conflicts in parallel test execution
- Mitigation: Dynamic port allocation, cleanup hooks
- MEDIUM: Middleware ordering bugs
- Mitigation: Test middleware in isolation first

---

### Phase 4: Testcontainers Integration

**Scope**: 178 tests across 15 files **Effort**: 2-3 weeks **Complexity**:
Medium to Hard

**Objective**: Enable integration tests requiring real Postgres/Redis instances

**Technical Approach**:

1. **Infrastructure Setup**:

   ```typescript
   // tests/helpers/testcontainers.ts
   export async function setupTestDB(): Promise<PostgreSqlContainer>;
   export async function setupTestRedis(): Promise<GenericContainer>;
   ```

2. **Database Migrations**:
   - Run full Drizzle migrations on container startup
   - Seed test data with isolated transactions
   - Cleanup between test suites

3. **Redis Configuration**:
   - In-memory Redis for fast tests
   - Cluster mode support for advanced tests

4. **CI/CD Integration**:

   **Container Optimization**:
   - Use alpine variants: `postgres:16-alpine`, `redis:7-alpine` (90% size
     reduction)
   - Pre-pull images in CI setup job (parallel download)
   - Docker layer caching via GitHub Actions cache

   **Networking**:
   - Shared bridge network for container-to-container communication
   - Dynamic port allocation (avoid conflicts in parallel runs)
   - Container DNS resolution via network aliases
   - Health check endpoints for startup verification

   **Performance**:
   - Parallel container startup (db + redis simultaneously)
   - Timeout handling: 30s startup max, 5min test max
   - Graceful shutdown with cleanup verification

**Files Unlocked** (subset - 15 files total):

- `tests/integration/rls-middleware.test.ts` - Row-level security
- `tests/integration/scenario-comparison*.test.ts` - Complex queries
- `tests/integration/circuit-breaker-db.test.ts` - Resilience patterns
- `tests/integration/time-travel-simple.test.ts` - Time-series data
- `tests/integration/phase3-critical-bugs.test.ts` - Production bugs

**Success Criteria**:

- [ ] Testcontainers setup time < 30 seconds
- [ ] All 178 integration tests passing
- [ ] CI pipeline runtime increase < 5 minutes
- [ ] No container leaks (cleanup verified)

**Rollback Procedure**:

- [ ] Set environment variable: `ENABLE_PHASE4_TESTS=false` in CI
- [ ] Git revert:
      `git revert [commit-hash] -m "Rollback Phase 4 - testcontainers regressions"`
- [ ] Restore previous CI configuration without Testcontainers setup
- [ ] Document issues in GitHub issue for future retry with root cause analysis

**Dependencies**: Phase 3 complete (harness supports DB injection)

**Risks**:

- **CRITICAL: Docker Desktop Licensing for Commercial Use**
  - Docker Desktop requires paid license for enterprises (>250 employees
    OR >$10M revenue)
  - Press On Ventures likely requires enterprise license (~$7/user/month =
    $84/year)
  - **Mitigation Options**:
    1. **Rancher Desktop** (free, open-source alternative) - RECOMMENDED for
       local dev
    2. Budget for Docker Desktop Team license (if Windows-only workflow
       preferred)
    3. GitHub Codespaces for integration tests (Docker included, $0.18/hour)
  - **Decision**: Use Rancher Desktop to avoid licensing costs

- HIGH: CI/CD complexity increase
  - Mitigation: Local Docker Compose fallback, container image caching

- HIGH: Flaky tests from timing issues
  - Mitigation: Proper wait strategies, health checks, deterministic test
    ordering

- MEDIUM: Developer machine requirements (Docker Desktop or alternative)
  - Mitigation: Document Rancher Desktop setup for Windows/Mac/Linux, provide
    Codespaces template

**Decision Point**: Evaluate parallel execution with Phase 5 if resources allow

---

### Phase 5: Build/Golden Dataset CI Lane

**Scope**: ~15 tests across 2 files **Effort**: 1 week **Complexity**: Medium

**Objective**: Separate build regression and golden dataset tests into dedicated
CI job

**Technical Approach**:

1. **Build Regression Pipeline**:
   - File: `tests/integration/vite-build-regression.test.ts`
   - Validate production build artifacts
   - Check bundle size thresholds
   - Verify tree-shaking effectiveness

2. **Golden Dataset Runner**:
   - File: `tests/integration/golden-dataset-regression.test.ts`
   - Load baseline calculation snapshots
   - Compare current vs. golden outputs
   - Diff reporting for failures

3. **CI Workflow Integration** (DO NOT create new workflow):

   **Integration Strategy**: Add to existing `ci-unified.yml` as separate job,
   not new workflow.

   **Rationale**: Already have 3 test workflows - adding 4th creates confusion.
   Instead, extend `ci-unified.yml`.

   ```yaml
   # Add to .github/workflows/ci-unified.yml
   jobs:
     # ... existing jobs ...

     regression-tests:
       name: Build & Golden Dataset Regression
       runs-on: ubuntu-latest
       needs: [unit-tests, integration-tests] # Run after main tests
       steps:
         - uses: actions/checkout@v4
         - name: Build production artifacts
           run: npm run build
         - name: Validate build
           run: npm run test:build-regression
         - name: Load golden datasets
           run: npm run test:golden-dataset

       # Non-blocking - failures create issue but don't block PR
       continue-on-error: true
   ```

   **CI Workflow Integration Matrix**:

   | Workflow       | Trigger           | Phase 5 Tests    | Blocks Merge? | Runtime |
   | -------------- | ----------------- | ---------------- | ------------- | ------- |
   | test.yml       | Push to main      | All tests        | N/A           | ~12 min |
   | pr-tests.yml   | PR opened/updated | Smart selection  | YES           | ~8 min  |
   | ci-unified.yml | PR + main         | All + regression | NO (advisory) | ~15 min |

   **Failure Handling**:
   - Build regression failure -> Auto-create GitHub issue with build diff
   - Golden dataset deviation >5% -> Slack alert + advisory comment on PR
   - Does NOT block PR merge (advisory only)

**Success Criteria**:

- [ ] Build regression tests isolated from unit/integration suite
- [ ] Golden dataset comparison automated
- [ ] Regression failures create advisory feedback (non-blocking)
- [ ] CI runtime optimized (parallel execution)

**Rollback Procedure**:

- [ ] Set environment variable: `ENABLE_PHASE5_TESTS=false` in CI
- [ ] Git revert:
      `git revert [commit-hash] -m "Rollback Phase 5 - regression lane issues"`
- [ ] Restore previous `ci-unified.yml` without regression job
- [ ] Document issues in GitHub issue for future retry with root cause analysis

**Dependencies**: None (can run in parallel with Phase 4)

**Risks**:

- LOW: Golden dataset drift over time
- Mitigation: Quarterly golden dataset refresh process
- LOW: Build test environment mismatches
- Mitigation: Pin Node/build tool versions

---

### Phase 6: Feature Epics + Flaky Stabilization

**Scope**: 183 tests across 21 files (156 feature + 27 flaky) **Effort**: 3-4
weeks **Complexity**: Medium to Hard

**Objective**: Complete unfinished features and stabilize Monte Carlo validation
tests

**Sub-Phase 6A: Feature Completion** (156 tests)

**Feature Epics**:

1. **Snapshot Service** (tests/unit/services/snapshot-service.test.ts)
   - State: 80% implemented, missing restoration logic
   - Tests: 23 skipped
   - Effort: 1 week

2. **Reserves Engine** (tests/integration/reserves-api.test.ts,
   reserves-integration.test.ts)
   - State: API stubbed, calculation logic incomplete
   - Tests: 37 skipped
   - Effort: 2 weeks

3. **Time Travel API** (tests/integration/time-travel-api.test.ts)
   - State: Database schema ready, API routes missing
   - Tests: 18 skipped
   - Effort: 1 week

4. **Monte Carlo Engine** (tests/unit/core/monte-carlo-engine.test.ts)
   - State: Core logic complete, power-law integration pending
   - Tests: 28 skipped
   - Effort: 1 week

5. **UI Components** (portfolio-constructor, ai-enhanced-components,
   waterfall-step)
   - State: Various - missing data hooks, incomplete forms
   - Tests: 50 skipped
   - Effort: 1 week

**Sub-Phase 6B: Flaky Test Stabilization** (27 tests)

**Flaky Tests**:

- `tests/integration/monte-carlo-2025-validation-core.test.ts` (15 tests)
- `tests/integration/monte-carlo-power-law-validation.test.ts` (12 tests)

**Root Causes**:

1. **Non-deterministic random seeds** - Fix: Explicit seed control
2. **Floating-point precision** - Fix: Tolerance-based assertions
3. **Race conditions in async validation** - Fix: Proper await chains
4. **Statistical test brittleness** - Fix: Increase sample sizes

**Stabilization Approach**:

1. Run each test 100 times locally to identify failure patterns
2. Add debug logging for failure scenarios
3. Implement fixes with deterministic seeds and proper async handling
4. Quarantine if unfixable, revisit in Phase 7

**Quarantine Mechanism** (for unfixable flaky tests):

1. **File Organization**:
   - Move to `tests/quarantine/` directory
   - Preserve original file structure (e.g.,
     `tests/quarantine/integration/monte-carlo-2025-validation-core.test.ts`)

2. **Metadata** (add to each quarantined test):

   ```typescript
   /**
    * @quarantine-reason Non-deterministic random seed causing 15% failure rate
    * @quarantine-date 2025-12-25
    * @quarantine-owner @github-username
    * @quarantine-issue #123
    */
   test.skip('Monte Carlo validation', () => { ... });
   ```

3. **CI Isolation**:
   - Separate optional job: `test-quarantine` (non-blocking)
   - Runs nightly to track stability trends
   - Reports to dedicated Slack channel

4. **Review Cadence**:
   - Weekly review of quarantine status
   - Monthly retry ALL quarantined tests (batch un-skip)
   - Quarterly purge (delete if >90 days with no progress)

**Success Criteria**:

- [ ] All feature epic tests passing or documented as blocked
- [ ] Flaky test failure rate < 1% (verified by 1000-run suite)
- [ ] Feature completion roadmap for blocked tests
- [ ] Quarantine list with root cause analysis

**Rollback Procedure**:

- [ ] Set environment variable: `ENABLE_PHASE6_TESTS=false` in CI
- [ ] Git revert:
      `git revert [commit-hash] -m "Rollback Phase 6 - feature/flaky regressions"`
- [ ] Re-skip unstable tests and restore previous feature flags
- [ ] Document issues in GitHub issue for future retry with root cause analysis

**Dependencies**: Phases 1-5 complete (stable foundation required)

**Risks**:

- HIGH: Feature scope creep delaying completion
- Mitigation: Strict scope definition, defer non-critical features
- HIGH: Flaky tests remain unstable
- Mitigation: Quarantine mechanism, separate flaky test suite
- MEDIUM: Resource allocation for feature work
- Mitigation: Prioritize based on customer impact

---

## Risk Assessment Matrix

| Phase | Risk Level | Primary Risks                   | Mitigation Strategy                          |
| ----- | ---------- | ------------------------------- | -------------------------------------------- |
| 1     | LOW        | Mock behavior drift             | Incremental implementation, test coverage    |
| 2     | LOW        | Production regressions          | Per-fix commits, isolated changes            |
| 3     | MEDIUM     | Port conflicts, middleware bugs | Dynamic ports, isolation testing             |
| 4     | HIGH       | CI complexity, flakiness        | Container caching, wait strategies, fallback |
| 5     | LOW        | Golden dataset drift            | Quarterly refresh, versioning                |
| 6     | HIGH       | Scope creep, flaky instability  | Strict scope, quarantine process             |

**Overall Risk**: MEDIUM - Phases 4 and 6 introduce complexity, but incremental
approach mitigates

---

## Decision Framework

### When to Proceed to Next Phase

**Green Light Criteria**:

- [ ] All tests in current phase passing (or documented exceptions)
- [ ] No performance regressions (< 10% CI runtime increase)
- [ ] Documentation updated

**Yellow Light (Proceed with Caution)**:

- [ ] 90%+ tests passing, known issues documented
- [ ] Performance regression justified and accepted
- [ ] Workarounds documented for blocking issues

**Red Light (Block Next Phase)**:

- [ ] < 80% test pass rate
- [ ] Critical production bug introduced
- [ ] CI/CD pipeline broken

### Parallel Execution Decision Points

**Phase 4 + Phase 5 Parallelization**:

- **Condition**: If Phase 3 completes successfully and resources available
- **Benefit**: Reduce overall timeline by 1 week
- **Risk**: Increased complexity, harder rollback
- **Decision**: Evaluate after Phase 3 completion

---

## Success Metrics

### Phase-Level Metrics

| Phase | Tests Enabled | Cumulative Total | Pass Rate Target          | vs. Baseline (81.14%) |
| ----- | ------------- | ---------------- | ------------------------- | --------------------- |
| 0.5   | 0             | 0                | N/A (infrastructure)      | No change             |
| 1     | 19            | 19               | 100%                      | +0.82%                |
| 2     | 10            | 29               | 100%                      | +1.25%                |
| 3     | 40            | 69               | 95%+                      | +2.99%                |
| 4     | 178           | 247              | 90%+                      | +10.69%               |
| 5     | 15            | 262              | 100%                      | +11.34%               |
| 6     | 183           | 445              | 85%+ (quarantine allowed) | +19.26%               |

**Target Final Pass Rate**: 100.40% (2,311 total tests, 445 newly enabled, all
passing)

### Quality Metrics

- **Test Stability**: Flaky failure rate < 1% (measured over 1000 runs)
- **CI Performance**: Total suite runtime < 15 minutes (with parallelization)
- **Coverage Impact**: Code coverage increase by 15-20 percentage points
- **Developer Experience**: Test feedback time < 5 minutes for unit/integration

---

## Next Steps

### Immediate Actions (Week 1)

1. **Phase 0.5 Execution** - Test data infrastructure prerequisites
2. **Phase 1 Kickoff** - Database mock enhancement tasks
3. **Testcontainers Spike** - Validate Docker-in-Docker in CI (parallel
   investigation)
4. **Documentation** - Update testing guide with new patterns

### Phase 1 Execution Checklist

- [ ] Create feature branch: `foundation/phase2-dbmock-enhancements`
- [ ] Implement unique constraint validation
- [ ] Add materialized view support
- [ ] Enhance SQL matcher for query parameters
- [ ] Add confidence bounds validation
- [ ] Run full test suite (verify no regressions)
- [ ] Update `tests/helpers/database-mock.ts` documentation
- [ ] Create PR with Phase 1 changes
- [ ] Merge to main after approval

### Progress Tracking

- **Weekly Updates**: Document phase progress in CHANGELOG.md
- **Blocker Escalation**: Red light conditions documented in GitHub issues
  immediately
- **Phase Completion**: Update roadmap with actual metrics vs. baseline

---

## Documentation Deliverables

### Phase 1: Database Mock Enhancements

- [ ] Update `tests/helpers/database-mock.ts` JSDoc with constraint validation
      examples
- [ ] Add "Constraint Validation" section to `cheatsheets/testing-guide.md`

### Phase 2: Quick Win Edge Cases

- [ ] No new docs (trivial fixes)

### Phase 3: HTTP/Middleware Harness

- [ ] Create `cheatsheets/http-harness-guide.md` with middleware testing
      patterns
- [ ] Update service testing examples in `cheatsheets/testing-guide.md`

### Phase 4: Testcontainers Integration

- [ ] Create `cheatsheets/testcontainers-guide.md` with setup instructions
- [ ] Document Windows/Mac/Linux testcontainers setup differences
- [ ] Add "Debugging Testcontainers" section to `SIDECAR_GUIDE.md`
- [ ] Update `CLAUDE.md` with testcontainers developer requirements

### Phase 5: Build/Golden Dataset CI Lane

- [ ] Update `.github/workflows/README.md` with regression job documentation
- [ ] Create `cheatsheets/golden-dataset-refresh-runbook.md`

### Phase 6: Feature Epics + Flaky Stabilization

- [ ] Create `cheatsheets/quarantine-review-process.md`
- [ ] Update `CAPABILITIES.md` with new test infrastructure capabilities
- [ ] Add "Test Infrastructure" section to onboarding docs

---

## Appendix A: File Inventory

### Database Mock Candidates (19 tests, 3 files)

1. `tests/integration/variance-tracking-schema.test.ts` - Lines 154, 182, 886
2. `tests/integration/reallocation-api.test.ts` - Constraint validation
3. `tests/integration/performance-prediction.test.ts` - Lines 726, 737

### Integration Tests (178 tests, 15 files)

1. `tests/integration/allocations.test.ts`
2. `tests/integration/flags-routes.test.ts`
3. `tests/integration/flags-hardened.test.ts`
4. `tests/integration/dev-memory-mode.test.ts`
5. `tests/integration/circuit-breaker-db.test.ts`
6. `tests/integration/interleaved-thinking.test.ts`
7. `tests/integration/rls-middleware.test.ts`
8. `tests/integration/scenario-comparison-mvp.test.ts`
9. `tests/integration/scenario-comparison.test.ts`
10. `tests/integration/golden-dataset-regression.test.ts`
11. `tests/integration/vite-build-regression.test.ts`
12. `tests/integration/time-travel-simple.test.ts`
13. `tests/integration/middleware.test.ts`
14. `tests/integration/phase3-critical-bugs.test.ts`
15. `tests/integration/portfolio-intelligence.test.ts`

### Feature Incomplete (156 tests, 19 files)

1. `tests/unit/analytics/analytics-xirr.test.ts`
2. `tests/integration/xirr-golden-set.test.ts`
3. `tests/integration/reserves-api.test.ts`
4. `tests/integration/time-travel-api.test.ts`
5. `tests/unit/components/ai-enhanced-components.test.tsx`
6. `tests/unit/components/general-info-step.test.tsx`
7. `tests/unit/components/modeling-wizard-persistence.test.tsx`
8. `tests/unit/components/portfolio-constructor.test.tsx`
9. `tests/unit/services/lot-service.test.ts`
10. `tests/unit/core/monte-carlo-engine.test.ts`
11. `tests/integration/performance-prediction.test.ts`
12. `tests/unit/services/snapshot-service.test.ts`
13. `tests/unit/core/cohort-engine.test.ts`
14. `tests/unit/core/liquidity-engine.test.ts`
15. `tests/unit/core/deterministic-reserve-engine.test.ts`
16. `tests/unit/components/waterfall-step.test.tsx`
17. `tests/unit/guards/approval-guard.test.ts`
18. `tests/integration/reserves-integration.test.ts`
19. `tests/integration/monte-carlo-power-law-integration.test.ts`

### Flaky/Broken (27 tests, 2 files)

1. `tests/integration/monte-carlo-2025-validation-core.test.ts` - 15 tests
2. `tests/integration/monte-carlo-power-law-validation.test.ts` - 12 tests

### Performance Tests (12 tests, 2 files)

1. `tests/performance/validator.microbench.test.ts`
2. `tests/unit/hooks/watch-debounce.test.tsx`

### Other (32 tests, 3 files)

1. `tests/template/portfolio-route.template.test.ts` - Template file
2. `tests/integration/ops-webhook.test.ts` - ESM compatibility issues
3. `tests/unit/services/capital-allocation.test.ts` - Various gaps

---

## Appendix B: References

- **Phase 1 PR**: #305 - Database mock orderBy/offset/limit implementation
- **Test Analysis**: Codex agent report (2025-12-25)
- **Database Mock**: `tests/helpers/database-mock.ts`
- **Testing Guide**: `cheatsheets/testing-guide.md`
- **CI Configuration**: `.github/workflows/test.yml`

---

**Document Version**: 1.0 **Last Updated**: 2025-12-25 **Next Review**: After
Phase 1 completion
