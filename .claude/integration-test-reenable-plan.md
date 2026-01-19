---
status: ACTIVE
last_updated: 2026-01-19
---

# Integration Test Re-enablement Plan

**Status**: Planning Phase
**Created**: 2025-12-21
**Context**: Follow-up to test failure elimination (PR #298)

## Overview

During Phase 3A-3G of test failure elimination, we identified and skipped 4 integration tests that require live infrastructure. These tests are properly tagged with `@group integration` and are ready for systematic re-enablement once infrastructure mocking is in place.

## Skipped Integration Tests

### 1. Portfolio Intelligence - Concurrent Strategy Creation

**File**: [tests/unit/api/portfolio-intelligence.test.ts](tests/unit/api/portfolio-intelligence.test.ts)

**Test**: `should handle multiple simultaneous strategy creation requests`

**Why Skipped**: Requires concurrent API request handling with live PostgreSQL transaction management

**Re-enablement Requirements**:
- Mock PostgreSQL transaction isolation
- Mock concurrent request handling infrastructure
- Verify transaction rollback/commit behavior
- Test race condition handling

**Estimated Effort**: 4-6 hours

---

### 2. Phase 3 Critical Bugs - Risk-Based Cash Buffer

**File**: [tests/unit/bug-fixes/phase3-critical-bugs.test.ts](tests/unit/bug-fixes/phase3-critical-bugs.test.ts)

**Tests**:
- `should use risk-based cash buffer calculation`
- `should maintain backward compatibility with existing calculations`

**Why Skipped**: Requires live calculation engine with full reserve allocation logic

**Re-enablement Requirements**:
- Mock reserve calculation engine components
- Mock risk assessment calculation infrastructure
- Verify calculation accuracy against known baselines
- Test backward compatibility with legacy data

**Estimated Effort**: 6-8 hours

---

### 3. Monte Carlo Engine - Reserve Optimization

**File**: [tests/unit/services/monte-carlo-engine.test.ts](tests/unit/services/monte-carlo-engine.test.ts)

**Test**: `should find optimal reserve allocation`

**Why Skipped**: Requires live Monte Carlo simulation infrastructure with optimization algorithms

**Re-enablement Requirements**:
- Mock Monte Carlo simulation engine
- Mock optimization algorithm infrastructure
- Verify convergence behavior
- Test performance under different portfolio sizes

**Estimated Effort**: 8-10 hours

---

### 4. Cohort Engine - Multiple Cohort Calculations

**File**: [tests/unit/engines/cohort-engine.test.ts](tests/unit/engines/cohort-engine.test.ts)

**Test**: `should calculate average Multiple across cohorts`

**Why Skipped**: Requires live cohort data aggregation infrastructure

**Re-enablement Requirements**:
- Mock cohort data aggregation infrastructure
- Mock cohort classification logic
- Verify statistical calculations
- Test edge cases (empty cohorts, single-company cohorts)

**Estimated Effort**: 4-6 hours

---

## Re-enablement Strategy

### Phase 1: Infrastructure Mocking Foundation (Week 1-2)

1. **Create Mock Infrastructure Layer**
   - Design mock factories for Redis/PostgreSQL
   - Implement mock transaction management
   - Create mock calculation engine interfaces

2. **Validate Mock Behavior**
   - Ensure mocks match production behavior
   - Add mock verification utilities
   - Document mock usage patterns

### Phase 2: Test-by-Test Re-enablement (Week 3-4)

1. **Portfolio Intelligence Test** (Priority: High)
   - Re-enable with mocked concurrency infrastructure
   - Verify transaction isolation behavior
   - Add performance benchmarks

2. **Cohort Engine Test** (Priority: Medium)
   - Re-enable with mocked cohort data
   - Verify statistical accuracy
   - Add edge case coverage

3. **Phase 3 Critical Bugs Tests** (Priority: Medium)
   - Re-enable with mocked calculation engine
   - Verify backward compatibility
   - Add regression test coverage

4. **Monte Carlo Engine Test** (Priority: Low)
   - Re-enable with mocked simulation infrastructure
   - Verify optimization convergence
   - Add performance monitoring

### Phase 3: Validation & Documentation (Week 5)

1. **Full Suite Validation**
   - Run complete test suite with re-enabled tests
   - Verify zero regressions
   - Update test coverage metrics

2. **Documentation Updates**
   - Update test documentation
   - Document mock infrastructure patterns
   - Create runbooks for future integration test development

---

## Success Criteria

- [ ] All 4 integration tests re-enabled and passing
- [ ] Zero test failures maintained
- [ ] Mock infrastructure documented and reusable
- [ ] Test execution time < 5 minutes (total suite)
- [ ] Code coverage maintained or improved
- [ ] No production code changes required

---

## Risk Assessment

**Low Risk**: All test changes are isolated to test infrastructure with no production impact.

**Potential Blockers**:
- Complex calculation engine behavior difficult to mock
- Performance degradation from mock overhead
- Missing infrastructure interfaces for mocking

**Mitigation**:
- Start with simplest tests (Cohort Engine)
- Add mock performance monitoring
- Create reusable mock patterns for future tests

---

## Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1 | 2 weeks | Mock infrastructure foundation |
| Phase 2 | 2 weeks | All 4 tests re-enabled |
| Phase 3 | 1 week | Documentation & validation |
| **Total** | **5 weeks** | **Complete integration test suite** |

---

## Next Actions

1. Create GitHub issue for integration test re-enablement
2. Schedule infrastructure mocking design review
3. Assign ownership for each test category
4. Set up monitoring for re-enabled test performance

---

**Note**: This plan assumes no changes to production code. If calculation engine interfaces need modification, timeline may extend by 1-2 weeks.
