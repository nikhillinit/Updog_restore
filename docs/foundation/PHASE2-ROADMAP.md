# Foundation Phase 2: Test Enablement Roadmap

**Status**: DRAFT **Author**: Claude Code **Date**: 2025-12-25 **Phase 1
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

## Phase 1 Recap: Database Mock Foundation

**Completed**: 2025-12-XX via PR #305

**Achievements**:

- Implemented complete Drizzle ORM query builder in database mock
- Fixed orderBy with multiple columns and mixed ASC/DESC
- Added offset/limit support for pagination
- Enhanced where clause handling for complex queries
- All foundational database mock tests passing (100%)

**Foundation Established**: Phase 2 can now build on reliable mock
infrastructure

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
- [ ] Mock performance within 10% of Phase 1 baseline

**Dependencies**: None (builds on Phase 1 foundation)

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
   - Docker-in-Docker for GitHub Actions
   - Container caching to reduce startup time
   - Timeout handling for slow environments

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

**Dependencies**: Phase 3 complete (harness supports DB injection)

**Risks**:

- HIGH: CI/CD complexity increase
- Mitigation: Local Docker Compose fallback, container image caching
- HIGH: Flaky tests from timing issues
- Mitigation: Proper wait strategies, health checks
- MEDIUM: Developer machine requirements (Docker Desktop)
- Mitigation: Documentation, optional local execution

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

3. **CI Configuration**:

   ```yaml
   # .github/workflows/regression.yml
   jobs:
     build-regression:
       runs-on: ubuntu-latest
       steps:
         - Build production artifacts
         - Run build validation tests

     golden-dataset:
       runs-on: ubuntu-latest
       steps:
         - Load golden dataset fixtures
         - Run calculation regression tests
   ```

**Success Criteria**:

- [ ] Build regression tests isolated from unit/integration suite
- [ ] Golden dataset comparison automated
- [ ] Regression failures block PR merge
- [ ] CI runtime optimized (parallel execution)

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

**Success Criteria**:

- [ ] All feature epic tests passing or documented as blocked
- [ ] Flaky test failure rate < 1% (verified by 1000-run suite)
- [ ] Feature completion roadmap for blocked tests
- [ ] Quarantine list with root cause analysis

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
- [ ] Code review approved
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

| Phase | Tests Enabled | Cumulative Total | Pass Rate Target          |
| ----- | ------------- | ---------------- | ------------------------- |
| 1     | 19            | 19               | 100%                      |
| 2     | 10            | 29               | 100%                      |
| 3     | 40            | 69               | 95%+                      |
| 4     | 178           | 247              | 90%+                      |
| 5     | 15            | 262              | 100%                      |
| 6     | 183           | 445              | 85%+ (quarantine allowed) |

### Quality Metrics

- **Test Stability**: Flaky failure rate < 1% (measured over 1000 runs)
- **CI Performance**: Total suite runtime < 15 minutes (with parallelization)
- **Coverage Impact**: Code coverage increase by 15-20 percentage points
- **Developer Experience**: Test feedback time < 5 minutes for unit/integration

---

## Next Steps

### Immediate Actions (Week 1)

1. **Finalize Roadmap** - Team review and approval
2. **Phase 1 Kickoff** - Assign database mock enhancement tasks
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

### Communication Plan

- **Weekly Updates**: Post phase progress to team channel
- **Blocker Escalation**: Red light conditions reported within 24 hours
- **Phase Completion**: Demo to stakeholders with metrics

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
