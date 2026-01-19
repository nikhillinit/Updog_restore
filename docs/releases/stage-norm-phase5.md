---
status: ACTIVE
last_updated: 2026-01-19
---

# Phase 5 Optimized Test Strategy - Stage Normalization

**Date**: 2025-10-30 **Status**: Ready for Implementation **Estimated Time**: 5
hours (reduced from 7 via asset reuse) **Estimated LOC**: ~400 new lines
(avoiding 334 lines of duplication)

---

## Executive Summary

**Critical Insight**: Phase 5 is NOT obsolete—it's a **strategic gap-fill
operation**.

**What Already Exists** (483 LOC):

- ✅ `tests/unit/utils/stage-utils.test.ts` (334 lines) - 48 normalizer
  algorithm tests
- ✅ `tests/stage-validation-allocations.test.ts` (149 lines) - Complete
  coverage of 1/3 endpoints

**What's Missing** (400 LOC):

- ❌ Monte Carlo endpoint integration tests
- ❌ Portfolio Strategies endpoint integration tests
- ❌ Performance regression baseline
- ❌ Cross-endpoint consistency validation

**Strategy**: Clone the proven allocations test pattern to the 2 remaining
endpoints, add performance guards, validate observability.

---

## Asset Inventory & Reuse Plan

### Existing Test Asset #1: Normalizer Algorithm Tests

**File**: `tests/unit/utils/stage-utils.test.ts` (334 lines) **Coverage**: 48+
tests validating `normalizeInvestmentStage()` core logic

- ✅ Canonical stage acceptance (pre-seed → series-c+)
- ✅ Alias normalization (seriesa → series-a, PRE SEED → pre-seed)
- ✅ Fail-closed behavior (invalid stages return errors)
- ✅ Edge cases (series-c+ bug fix, spacing variants)

**Reuse Strategy**: ✅ **DO NOT DUPLICATE** Phase 5 will NOT add normalizer unit
tests—algorithm coverage is complete.

---

### Existing Test Asset #2: Allocations Endpoint Template

**File**: `tests/stage-validation-allocations.test.ts` (149 lines) **Coverage**:
Complete API behavior test for `GET /api/funds/:fundId/companies`

**Test Structure** (proven pattern):

```typescript
describe('Stage Validation in GET /funds/:fundId/companies', () => {
  // Setup with DB mocks
  beforeEach(() => {
    /* mock db.select */
  });
  afterEach(() => {
    /* cleanup env vars */
  });

  // Valid stage tests (3 tests)
  describe('Valid stage normalization', () => {
    it('canonical stage "seed"');
    it('normalize "Seed" to "seed"');
    it('normalize "SERIES A" to "series-a"');
  });

  // Mode behavior tests (3 describe blocks × 1-2 tests each)
  describe('Invalid stage handling', () => {
    describe('enforce mode', () => {
      it('reject with 400 + validStages list');
    });
    describe('warn mode', () => {
      it('allow with x-stage-deprecated-variants header');
    });
    describe('off mode', () => {
      it('allow without headers');
    });
  });

  // Observability (1 test)
  describe('Metrics recording', () => {
    it('record duration + success metrics');
  });
});
```

**Reuse Strategy**: ✅ **CLONE & ADAPT** Copy this structure for Monte Carlo and
Portfolio Strategies endpoints, adjusting request payloads.

---

## Gap Analysis & Implementation Plan

### Gap #1: Monte Carlo Endpoint Integration Tests

**Target**: `tests/integration/stage-validation-monte-carlo.test.ts` (~150
lines) **Missing Coverage**: POST /api/monte-carlo/simulate validation behavior

**Implementation Steps**:

1. Clone allocations test structure
2. Adapt request from query param to body payload:
   ```typescript
   .post('/api/monte-carlo/simulate')
   .send({
     fundId: 1,
     runs: 1000,
     stageDistribution: [
       { stage: 'seed', weight: 0.4 },
       { stage: 'series-a', weight: 0.6 }
     ]
   })
   ```
3. Test invalid stages in array format (vs single query param)
4. Verify error response matches Phase 4 integration:
   ```json
   {
     "error": "INVALID_STAGE_DISTRIBUTION",
     "details": { "invalid": [...], "suggestions": {...} }
   }
   ```

**Key Differences from Allocations**:

- Array input (stageDistribution) vs single stage
- Uses `parseStageDistribution()` vs `normalizeInvestmentStage()`
- Error code: `INVALID_STAGE_DISTRIBUTION` vs `invalid_query_parameters`

---

### Gap #2: Portfolio Strategies Endpoint Integration Tests

**Target**: `tests/integration/stage-validation-portfolio.test.ts` (~150 lines)
**Missing Coverage**: POST /api/portfolio/strategies validation behavior

**Implementation Steps**:

1. Clone allocations test structure
2. Adapt request payload to object format:
   ```typescript
   .post('/api/portfolio/strategies')
   .send({
     fundId: 1,
     strategyName: 'Test Strategy',
     stageAllocation: {
       'seed': 40,
       'series-a': 60
     }
   })
   ```
3. Test object-to-array conversion logic (route converts to array internally)
4. Verify warn mode headers with multiple invalid stages

**Key Differences from Allocations**:

- Object input (stageAllocation) vs query param
- Internal conversion: `Object.entries()` → array → `parseStageDistribution()`
- Must handle empty/missing stageAllocation gracefully

---

### Gap #3: Performance Regression Tests

**Target**: `tests/perf/stage-normalization-regression.test.ts` (~60 lines)
**Missing Coverage**: Baseline performance validation

**Implementation Approach** (per Phase_5_oc.txt feedback):

```typescript
describe('Stage Validation Performance', () => {
  // Baseline file for comparison
  const BASELINE_FILE = 'tests/perf/stage-validation-baseline.json';

  it('validation overhead <10% of endpoint p95', async () => {
    const timings = [];

    // Warmup
    for (let i = 0; i < 10; i++) {
      await request(app).get('/api/funds/1/companies?stage=seed');
    }

    // Measure
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      await request(app).get('/api/funds/1/companies?stage=seed');
      timings.push(performance.now() - start);
    }

    const p95 = percentile(timings, 95);
    const baseline = loadBaseline();

    // Regression: p95 should not increase >10%
    expect(p95).toBeLessThan(baseline.p95 * 1.1);
  });

  it('single stage normalization p99 < 1ms', () => {
    const timings = [];
    for (let i = 0; i < 1000; i++) {
      const start = performance.now();
      normalizeInvestmentStage('seed');
      timings.push(performance.now() - start);
    }
    const p99 = percentile(timings, 99);
    expect(p99).toBeLessThan(1); // 1ms threshold
  });
});
```

**Baseline Establishment**:

1. Run tests once to establish baseline.json
2. Commit baseline to repo
3. Future runs compare against committed baseline
4. Alert on >10% regression

---

### Gap #4: Cross-Endpoint Consistency Tests

**Target**: `tests/integration/stage-validation-consistency.test.ts` (~40 lines)
**Missing Coverage**: Ensure all endpoints behave identically

**Test Scenarios**:

```typescript
describe('Cross-Endpoint Consistency', () => {
  it('same invalid stage rejected consistently in enforce mode', async () => {
    process.env.STAGE_VALIDATION_MODE = 'enforce';

    const endpoints = [
      {
        method: 'get',
        url: '/api/funds/1/companies',
        query: { stage: 'invalid' },
      },
      {
        method: 'post',
        url: '/api/monte-carlo/simulate',
        body: { stageDistribution: [{ stage: 'invalid', weight: 100 }] },
      },
      {
        method: 'post',
        url: '/api/portfolio/strategies',
        body: { stageAllocation: { invalid: 100 } },
      },
    ];

    for (const endpoint of endpoints) {
      const response = await request(app)
        [endpoint.method](endpoint.url)
        .send(endpoint.body)
        .query(endpoint.query);

      expect(response.status).toBe(400);
      expect(response.body.details.invalid).toContain('invalid');
    }
  });

  it('warn mode sets headers across all endpoints', async () => {
    process.env.STAGE_VALIDATION_MODE = 'warn';
    // Similar structure, verify x-stage-deprecated-variants present
  });
});
```

---

## Metrics Validation Strategy

### Problem with Original Approach

❌ **Original**: Scrape `http://localhost:9090/metrics` endpoint ❌ **Issue**:
Couples tests to Prometheus deployment, adds network dependency

### Optimized Approach (per Phase_5_oc.txt)

✅ **Use Test Registry Pattern**:

```typescript
import { Registry } from 'prom-client';
import {
  stageValidationDuration,
  stageNormalizationUnknownTotal,
} from '../server/observability/stage-metrics';

describe('Metrics Emission', () => {
  it('increments unknown stage counter', async () => {
    const registry = new Registry();
    // Register metrics with test registry
    registry.registerMetric(stageNormalizationUnknownTotal);

    const before = await registry.getSingleMetricAsString(
      'stage_normalization_unknown_total'
    );

    await request(app).get('/api/funds/1/companies?stage=invalid').expect(200);

    const after = await registry.getSingleMetricAsString(
      'stage_normalization_unknown_total'
    );
    expect(after).toMatch(/stage_normalization_unknown_total{.*} (\d+)/);
    // Verify count increased
  });
});
```

**Benefit**: Tests metrics logic without requiring Prometheus server.

---

## Implementation Sequencing

### Phase 5A: Monte Carlo Tests (2 hours)

**File**: `tests/integration/stage-validation-monte-carlo.test.ts`

1. Create file with allocations test as template
2. Adapt to POST body with stageDistribution array
3. Test all 3 modes (off/warn/enforce)
4. Verify error structure matches Phase 4 integration
5. Add metrics spying test

**Success Criteria**: 10-12 tests passing, pattern matches allocations.test.ts

---

### Phase 5B: Portfolio Strategies Tests (2 hours)

**File**: `tests/integration/stage-validation-portfolio.test.ts`

1. Create file with allocations test as template
2. Adapt to POST body with stageAllocation object
3. Test object-to-array conversion edge cases
4. Test all 3 modes with multiple invalid stages
5. Add metrics spying test

**Success Criteria**: 10-12 tests passing, covers object input format

---

### Phase 5C: Performance & Consistency (1 hour)

**Files**:

- `tests/perf/stage-normalization-regression.test.ts` (60 lines)
- `tests/integration/stage-validation-consistency.test.ts` (40 lines)

1. Establish performance baseline
2. Add regression guard tests
3. Add cross-endpoint consistency validation
4. Commit baseline.json to repo

**Success Criteria**: Performance tests pass with <10% variance, consistency
verified

---

## Test Execution Plan

### Run Tests in Isolation

```bash
# Unit tests (normalizer already exists, no new ones)
npm test -- tests/unit/utils/stage-utils.test.ts

# Integration tests (3 endpoints)
npm test -- tests/stage-validation-allocations.test.ts
npm test -- tests/integration/stage-validation-monte-carlo.test.ts
npm test -- tests/integration/stage-validation-portfolio.test.ts

# Consistency
npm test -- tests/integration/stage-validation-consistency.test.ts

# Performance (serial execution to avoid flake)
npm test -- --no-threads tests/perf/stage-normalization-regression.test.ts
```

### Full Suite Validation

```bash
# All stage validation tests
npm test -- --grep "stage"

# Verify no regressions
npm test
```

---

## Success Criteria

### Phase 5 Complete When:

✅ Monte Carlo endpoint: 10-12 tests passing (all modes, headers, metrics) ✅
Portfolio Strategies endpoint: 10-12 tests passing (object input, conversion) ✅
Performance baseline established and regression guards passing ✅ Cross-endpoint
consistency validated ✅ Total test count: ~883 LOC (483 existing + 400 new) ✅
No duplicate normalizer tests (avoid 334-line duplication) ✅ All tests pass in
CI with 100% success rate

---

## Risk Mitigation

### Avoiding Duplication Risk

**Risk**: Accidentally re-test normalizer algorithm **Mitigation**: Before
writing any test, check if `tests/unit/utils/stage-utils.test.ts` already covers
it

### Flaky Performance Tests

**Risk**: Performance tests fail on slow CI runners **Mitigation**: Use
regression comparison (current vs baseline) instead of absolute thresholds

### Environment Coupling

**Risk**: Tests fail if STAGE_VALIDATION_MODE set globally **Mitigation**: Every
test sets/clears `process.env.STAGE_VALIDATION_MODE` in beforeEach/afterEach

---

## Agent Utilization Plan

### Agent: code-reviewer (Post-Implementation)

**When**: After completing each test file **Purpose**: Validate test structure,
assertion patterns, error handling **Invocation**:
`Task(subagent_type="code-reviewer", prompt="Review tests/integration/stage-validation-monte-carlo.test.ts")`

### Agent: pr-test-analyzer (Before PR)

**When**: After all Phase 5 tests complete **Purpose**: Analyze coverage gaps,
suggest additional edge cases **Invocation**:
`Task(subagent_type="pr-test-analyzer")`

### Agent: silent-failure-hunter (Quality Gate)

**When**: Before marking Phase 5 complete **Purpose**: Ensure no silent failures
in error paths **Invocation**: `Task(subagent_type="silent-failure-hunter")`

### Agent: perf-guard (Baseline Validation)

**When**: After performance tests written **Purpose**: Validate baseline
methodology, suggest improvements **Invocation**: `SlashCommand("/perf-guard")`

---

## Alignment with Phase_5_oc.txt Feedback

### ✅ Corrections Applied:

1. **No normalizer duplication**: Phase 5 adds ZERO normalizer unit tests (334
   lines avoided)
2. **Correct endpoint path**: `GET /api/funds/:fundId/companies` (not
   /api/allocations)
3. **Correct header names**: `X-Stage-Deprecated-Variants` (suggestions in 400
   body only)
4. **Test Registry pattern**: Metrics validated via Registry, not HTTP scraping
5. **Regression testing**: Performance uses baseline comparison, not absolute
   thresholds
6. **Scope reduction**: 5 hours (vs 7), focused on API behavior + observability

### ✅ Strategic Alignment:

- **Internal tool**: No email deprecation program, rely on in-band headers
- **API surfaces**: Test the 3 integrated endpoints + observability
- **Pattern reuse**: Clone proven allocations test structure
- **Fail-fast**: Read route files to confirm integration before writing tests

---

## File Summary (Complete Test Infrastructure)

| File                                                     | Phase   | Status    | LOC  | Purpose                         |
| -------------------------------------------------------- | ------- | --------- | ---- | ------------------------------- |
| `tests/unit/utils/stage-utils.test.ts`                   | ADR-011 | ✅ Exists | 334  | Normalizer algorithm (48 tests) |
| `tests/stage-validation-allocations.test.ts`             | Phase 4 | ✅ Exists | 149  | Allocations endpoint (complete) |
| `tests/integration/stage-validation-monte-carlo.test.ts` | 5A      | 🔲 New    | ~150 | Monte Carlo endpoint            |
| `tests/integration/stage-validation-portfolio.test.ts`   | 5B      | 🔲 New    | ~150 | Portfolio endpoint              |
| `tests/integration/stage-validation-consistency.test.ts` | 5C      | 🔲 New    | ~40  | Cross-endpoint validation       |
| `tests/perf/stage-normalization-regression.test.ts`      | 5C      | 🔲 New    | ~60  | Performance guards              |
| `tests/perf/stage-validation-baseline.json`              | 5C      | 🔲 New    | N/A  | Baseline data                   |

**Total**: 883 LOC | **Existing**: 483 LOC | **New**: 400 LOC | **Avoided
Duplication**: 334 LOC

---

## Next Actions (Immediate)

1. ✅ Mark "Create optimized Phase 5 test strategy" as completed
2. 🔲 Start Phase 5A: Implement Monte Carlo integration tests
3. 🔲 Use code-reviewer agent after Monte Carlo tests complete
4. 🔲 Continue to Phase 5B: Portfolio Strategies tests
5. 🔲 Continue to Phase 5C: Performance + consistency tests
6. 🔲 Run full test suite validation
7. 🔲 Update Phase 4 handoff memo with Phase 5 completion status

---

**Generated**: 2025-10-30 **Estimated Completion**: Day 3-4 of 9-day rollout
**Blocked By**: None (Phase 4 complete, routes validated) **Blocks**: Phase 6
(observability & docs) **Risk Level**: 🟢 LOW (proven pattern, asset reuse, no
duplication)
