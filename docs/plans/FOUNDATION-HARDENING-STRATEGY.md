# Foundation Hardening Strategy

**Branch:** `claude/plan-foundation-hardening-TZ75k`
**Created:** 2025-12-24
**Status:** PLANNING

---

## <ultrathink> Strategic Analysis </ultrathink>

### Current State Assessment

**Test Metrics (Snapshot 2025-12-24):**
- Test Files: 6 failed | 83 passed | 22 skipped (111 total)
- Tests: 60 failed | 1742 passed | 415 skipped (2217 total)
- **Current Pass Rate: 78.5%** (1742/2217)
- TypeScript Errors: **0** (baseline was 585 - MAJOR IMPROVEMENT)

**Baseline Reference (2025-12-15):**
- Pass Rate: 72.3% (1275/1762)
- TypeScript Errors: 453

**Progress Since Baseline:**
- Test pass rate improved: 72.3% -> 78.5% (+6.2%)
- TypeScript errors reduced: 453 -> 0 (100% elimination!)
- Test count increased: 1762 -> 2217 (+455 new tests)

**Target State:**
- Test Pass Rate: >= 90% (1995+ passing of 2217)
- TypeScript Errors: 0 (ACHIEVED)
- Required improvement: +253 tests (from 1742 -> 1995)

---

## <ultrathink> Root Cause Analysis </ultrathink>

### Failure Categories (Priority Order)

#### Category A: Integration Test Infrastructure (HIGHEST IMPACT)
**Files affected:** 2 test files, ~20+ test failures
**Root cause:** `StreamingMonteCarloEngine` connection pool initialization fails when `DATABASE_URL` is undefined

**Evidence:**
```
TypeError: Cannot read properties of undefined (reading 'split')
 > ConnectionPoolManager.hashConnectionString server/services/streaming-monte-carlo-engine.ts:125:32
```

**Affected Tests:**
- `tests/integration/lp-api.test.ts`
- `tests/integration/operations-endpoint.test.ts`

**Fix Strategy:**
1. Add null check in `hashConnectionString` method
2. Implement mock for `StreamingMonteCarloEngine` in test setup
3. Guard service initialization with environment check

#### Category B: Portfolio Intelligence API Tests (MEDIUM IMPACT)
**Files affected:** 1 test file, ~35 test failures
**Root cause:** Mixed - rate limiting assertions, security test expectations

**Evidence:**
- Rate limiting test expects 429 status but never triggers
- Security tests expect 201 but get 400 (validation is working correctly!)
- Performance tests get 500 due to missing DB connection

**Fix Strategy:**
1. Update rate limiting test with proper request volume
2. Fix security test expectations (400 is correct for validation)
3. Add proper DB mocking for performance tests

#### Category C: Skipped Tests (INVESTIGATION NEEDED)
**Count:** 22 test files skipped, 415 individual tests skipped
**Root cause:** TBD - need investigation

**Fix Strategy:**
1. Identify why tests are skipped (conditional logic, pending implementations)
2. Enable tests that should be running
3. Document intentionally skipped tests

---

## <ultrathink> Strategy Selection </ultrathink>

### Strategic Options Evaluated

**Option 1: Infrastructure-First (SELECTED)**
- Fix the StreamingMonteCarloEngine connection pool issue first
- This unblocks ~20+ integration tests immediately
- Low risk, high impact
- Estimated time: 2-4 hours

**Option 2: Test-by-Test Repair**
- Use test-repair agent on each failing test file
- More thorough but slower
- Risk of missing systemic issues
- Estimated time: 2-3 days

**Option 3: Full Mock Overhaul**
- Create comprehensive test infrastructure with proper mocking
- Most robust long-term solution
- Highest effort
- Estimated time: 4-5 days

### Decision: Hybrid Approach (Option 1 + targeted Option 2)

1. **Phase 1:** Fix infrastructure blockers (Option 1)
2. **Phase 2:** Targeted test repairs (Option 2 elements)
3. **Phase 3:** Validation and hardening

---

## <ultrathink> Execution Plan </ultrathink>

### Phase 1: Infrastructure Fixes (Target: +40 tests)

**1.1 Fix StreamingMonteCarloEngine Connection Pool (2 hours)**

Location: `server/services/streaming-monte-carlo-engine.ts:125`

```typescript
// Current (broken):
hashConnectionString(connectionString: string): string {
  const parts = connectionString.split('@'); // Fails if undefined
  ...
}

// Fixed:
hashConnectionString(connectionString: string | undefined): string {
  if (!connectionString) {
    return 'test-mock-hash'; // Safe fallback for tests
  }
  const parts = connectionString.split('@');
  ...
}
```

**1.2 Add Test Environment Guard (1 hour)**

Location: Service initialization in test files

```typescript
// Add to vitest.config.ts or test setup
beforeAll(() => {
  vi.mock('../server/services/streaming-monte-carlo-engine', () => ({
    StreamingMonteCarloEngine: vi.fn().mockImplementation(() => ({
      // Mock implementation
    }))
  }));
});
```

**1.3 Verify Integration Tests Pass (1 hour)**
- Run: `npm test -- tests/integration/lp-api.test.ts`
- Run: `npm test -- tests/integration/operations-endpoint.test.ts`
- Expected: All tests pass or have meaningful failures

### Phase 2: Test Assertion Fixes (Target: +30 tests)

**2.1 Portfolio Intelligence Security Tests (2 hours)**

The security tests have **INVERTED EXPECTATIONS** - they expect 201 when validation correctly returns 400.

Files: `tests/unit/api/portfolio-intelligence.test.ts`

```typescript
// Current (incorrect expectation):
.expect(201); // Security test expects success with malicious input

// Fixed:
.expect(400); // Validation correctly rejects malicious input
// OR: Use sanitized input that passes validation
```

**2.2 Rate Limiting Test Fix (1 hour)**

The rate limiting test doesn't trigger enough requests:

```typescript
// Need to increase request count to actually trigger rate limit
const requests = Array(150).fill(null).map(() =>
  request(app).get('/api/portfolio/strategies')
);
```

**2.3 Performance Test DB Mock (1 hour)**

Add proper database mocking for performance tests.

### Phase 3: Skipped Test Investigation (Target: +50 tests)

**3.1 Audit Skipped Tests (2 hours)**
- Generate list of skipped test files
- Categorize: intentional vs accidental skips
- Identify quick-win enablements

**3.2 Enable Valid Skipped Tests (2-4 hours)**
- Remove `.skip` from tests that should run
- Fix any blocking issues
- Update test fixtures if needed

### Phase 4: Phoenix Truth Validation (MANDATORY)

**4.1 Run Truth Case Suite**
```bash
/phoenix-truth focus=all
```

**4.2 Verify No Regressions**
- All XIRR truth cases pass
- All waterfall truth cases pass
- All fee truth cases pass
- All capital allocation truth cases pass

---

## <ultrathink> Risk Assessment </ultrathink>

### Identified Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Infrastructure fix causes regressions | Low | High | Comprehensive test run after each change |
| Security test fixes mask real issues | Medium | High | Review with code-reviewer agent |
| Skipped tests have hidden dependencies | Medium | Medium | Enable incrementally with verification |
| Phoenix truth cases fail | Low | Critical | Run before/after every phase |

### Rollback Plan

```bash
# If any phase introduces regressions:
git stash
git checkout main
npm test  # Verify baseline
```

---

## <ultrathink> Success Criteria </ultrathink>

### MUST ACHIEVE (Definition of Done)

- [ ] Test pass rate >= 90% (1995+ of 2217 tests)
- [ ] TypeScript errors = 0 (maintain current state)
- [ ] ALL Phoenix truth cases passing
- [ ] NO new test failures introduced
- [ ] Integration tests (lp-api, operations-endpoint) passing

### NICE TO HAVE

- [ ] Test pass rate >= 95% (2106+ passing)
- [ ] Reduce skipped tests by 50% (from 415 to <210)
- [ ] All P0 architectural debt items addressed

---

## <ultrathink> Resource Allocation </ultrathink>

### Tool/Agent Usage Plan

| Phase | Primary Tool | Supporting Agents |
|-------|-------------|-------------------|
| 1.1 | Direct code edit | code-reviewer |
| 1.2 | vitest mock config | test-automator |
| 2.x | Direct code edit | test-repair |
| 3.x | Explore agent | test-automator |
| 4.x | /phoenix-truth | phoenix-truth-case-runner |

### Commands to Execute

```bash
# Phase verification commands
npm test                                    # Full suite
npm run check                               # TypeScript (should be 0)
/phoenix-truth focus=all                    # Truth cases

# Targeted test runs
npm test -- tests/integration/lp-api.test.ts
npm test -- tests/integration/operations-endpoint.test.ts
npm test -- tests/unit/api/portfolio-intelligence.test.ts
```

---

## <ultrathink> Timeline Estimate </ultrathink>

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1 | 4-6 hours | None |
| Phase 2 | 4-6 hours | Phase 1 complete |
| Phase 3 | 4-8 hours | Phase 2 complete |
| Phase 4 | 1-2 hours | All phases complete |
| **Total** | **13-22 hours** | |

---

## Immediate Next Steps

1. **START:** Fix StreamingMonteCarloEngine null check (Phase 1.1)
2. **THEN:** Run integration tests to verify fix
3. **CONTINUE:** Phase 2 test assertion fixes
4. **VALIDATE:** Phoenix truth cases after each phase

---

## Related Documentation

- [FOUNDATION-HARDENING-PLAN.md](../../FOUNDATION-HARDENING-PLAN.md) - Original plan
- [ARCHITECTURAL-DEBT.md](../ARCHITECTURAL-DEBT.md) - Debt registry
- [PHOENIX-FOUNDATION-HARDENING-CROSSWALK.md](./PHOENIX-FOUNDATION-HARDENING-CROSSWALK.md) - Phoenix coordination

---

**Author:** Claude (ultrathink planning mode)
**Last Updated:** 2025-12-24
