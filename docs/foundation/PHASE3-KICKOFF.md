# Phase 3 Kickoff: HTTP/Middleware Harness Implementation

**Date**: 2025-12-26 **Status**: Ready to Execute **Estimated Duration**: 3-4
days **Complexity**: Medium

---

## Quick Context

You are continuing the Foundation Test Enablement roadmap. Phase 2 is complete
with 3 tests enabled (+6 net passing). You are now starting Phase 3:
HTTP/Middleware Harness.

### What Was Just Completed (Phase 2)

**Metrics**:

- Tests passing: 1,881 (baseline: 1,875, +6)
- Tests skipped: 430 (baseline: 436, -6)
- Pass rate: 81.40% (baseline: 81.14%, +0.26%)
- Zero regressions

**Key Changes**:

- LiquidityEngine: Zero-cash guard implemented
- LotService: Cursor pagination working with mock DB
- DatabaseMock: Enhanced WHERE filtering with cursor support

**Commits**:

- ffd19ab9 - Phase 2 implementation
- 4197fd9d - PHASE-STATUS.json update

---

## Phase 3 Objective

Enable ~40 tests requiring HTTP/middleware infrastructure with lightweight
in-process test server.

**Target Files** (4 files, ~40 tests):

1. `tests/integration/flags-routes.test.ts` - Feature flag API routes
2. `tests/integration/flags-hardened.test.ts` - Flag security tests
3. `tests/integration/middleware.test.ts` - Middleware composition
4. `tests/integration/portfolio-intelligence.test.ts` - Rate limiting/security

---

## Technical Approach

### 1. Test Harness Design

Create `tests/helpers/http-harness.ts`:

```typescript
class TestHttpServer {
  constructor(routes: RouteConfig[]);
  async start(): Promise<void>;
  async stop(): Promise<void>;
  request(): SupertestAgent;
}
```

**Requirements**:

- Lightweight (startup < 100ms)
- In-process (no network overhead)
- Graceful cleanup (no port leaks)
- Middleware stack support

### 2. Middleware Stack Support

**Required Middleware**:

- express-session (memory store for tests)
- cookie-parser (signed cookies for auth)
- Authentication middleware (toggle)
- Feature flags middleware
- Rate limiting middleware
- Circuit breaker middleware

### 3. Mock Dependencies

- **Database**: Use existing `tests/helpers/database-mock.ts` (Phase 0/1)
- **Redis**: In-memory stub (ioredis-mock)
- **External APIs**: Nock interceptors

---

## Execution Steps

### Step 1: Analyze Existing Test Structure (30 min)

```bash
# Read the target test files
cat tests/integration/flags-routes.test.ts
cat tests/integration/flags-hardened.test.ts
cat tests/integration/middleware.test.ts
cat tests/integration/portfolio-intelligence.test.ts

# Identify common patterns
grep -n "describe\|it\|test" tests/integration/flags-*.test.ts
```

**Questions to Answer**:

- What HTTP methods are being tested?
- What middleware is required?
- What are the common setup/teardown patterns?
- Are there existing harness attempts?

### Step 2: Create HTTP Harness (2-3 hours)

**Implementation Checklist**:

- [ ] Create `tests/helpers/http-harness.ts`
- [ ] Implement TestHttpServer class
- [ ] Add Express app creation with middleware stack
- [ ] Add supertest integration
- [ ] Add graceful startup/shutdown
- [ ] Add dynamic port allocation (avoid conflicts)

**Key Design Decisions**:

- Use ephemeral ports (0) for parallel test safety
- Support middleware injection (testable middleware composition)
- Clean shutdown with connection draining

### Step 3: Integrate with Test Files (2 hours)

**Pattern to Follow**:

```typescript
// Before (skipped)
describe.skip('Feature flag routes', () => {
  it('should get flags', async () => {
    // No HTTP harness available
  });
});

// After (enabled)
describe('Feature flag routes', () => {
  let server: TestHttpServer;

  beforeAll(async () => {
    server = new TestHttpServer([flagRoutes]);
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('should get flags', async () => {
    const res = await server.request().get('/api/flags');
    expect(res.status).toBe(200);
  });
});
```

**Files to Update**:

1. `tests/integration/flags-routes.test.ts` - Un-skip, add harness
2. `tests/integration/flags-hardened.test.ts` - Un-skip, add harness
3. `tests/integration/middleware.test.ts` - Un-skip, add harness
4. `tests/integration/portfolio-intelligence.test.ts` - Un-skip rate limit tests

### Step 4: Run Tests and Fix Issues (2-3 hours)

```bash
# Run each file individually first
npm test -- flags-routes.test.ts
npm test -- flags-hardened.test.ts
npm test -- middleware.test.ts
npm test -- portfolio-intelligence.test.ts

# Then run all together
npm test -- --run integration/flags
```

**Common Issues to Watch For**:

- Port conflicts (use dynamic allocation)
- Middleware ordering bugs (test in isolation first)
- Async cleanup (ensure all connections closed)
- Database mock state pollution (reset between tests)

### Step 5: Verify No Regressions (30 min)

```bash
# Run full test suite
npm test

# Check metrics
# Expected: ~40 tests enabled, 0 regressions
# Target pass rate: ~82% (from 81.40%)
```

---

## Success Criteria

- [ ] HTTP harness supports Express middleware stack
- [ ] ~40 route/middleware tests passing
- [ ] Harness startup time < 100ms
- [ ] Graceful cleanup (no port conflicts)
- [ ] Zero regressions in existing tests
- [ ] Pass rate increase: 81.40% → ~82.5%

---

## Dependencies

**Phase 1 & 2 Complete**:

- Database mock with cursor support (Phase 0/1)
- Edge case fixes (Phase 2)

**No Blockers**: All infrastructure ready.

---

## Rollback Procedure

If Phase 3 introduces regressions:

1. Set environment variable: `ENABLE_PHASE3_TESTS=false` in CI
2. Git revert:
   `git revert [commit-hash] -m "Rollback Phase 3 - http harness regressions"`
3. Restore previous middleware wiring without test harness
4. Document issues in GitHub issue for future retry with root cause analysis

---

## Risk Assessment

| Risk                                | Level  | Mitigation                                 |
| ----------------------------------- | ------ | ------------------------------------------ |
| Port conflicts in parallel tests    | MEDIUM | Dynamic port allocation                    |
| Middleware ordering bugs            | MEDIUM | Test middleware in isolation first         |
| Cleanup issues (leaked connections) | LOW    | Proper teardown hooks, connection tracking |

---

## Quick Start Command

```bash
# Recommended: Use Codex for implementation
codex-wrapper - "C:\dev\Updog_restore" <<'EOF'
Implement Phase 3: HTTP/Middleware Harness for test enablement.

Context: Foundation Phase 2 complete (+6 tests). Now enabling ~40 HTTP/middleware tests.

Tasks:
1. Analyze @tests/integration/flags-routes.test.ts and related files
2. Create @tests/helpers/http-harness.ts with TestHttpServer class
3. Integrate harness into 4 test files (flags-routes, flags-hardened, middleware, portfolio-intelligence)
4. Un-skip tests and verify they pass
5. Run full test suite to check for regressions

Reference:
- @docs/foundation/PHASE3-KICKOFF.md (this file)
- @docs/foundation/PHASE2-ROADMAP.md (Phase 3 section)
- @tests/helpers/database-mock.ts (existing mock pattern)

Target: ~40 tests enabled, 0 regressions, pass rate: 81.40% → ~82.5%
EOF
```

---

## Expected Output

**Commits**:

1. `feat(foundation): Phase 3 - HTTP/Middleware Harness (~40 tests enabled)`
2. `docs(foundation): update Phase 3 completion status`

**Files Modified**:

- `tests/helpers/http-harness.ts` (new file)
- `tests/integration/flags-routes.test.ts` (un-skip tests)
- `tests/integration/flags-hardened.test.ts` (un-skip tests)
- `tests/integration/middleware.test.ts` (un-skip tests)
- `tests/integration/portfolio-intelligence.test.ts` (un-skip rate limit tests)
- `docs/PHASE-STATUS.json` (Phase 3 entry)

**Metrics Update**:

- Tests passing: 1,881 → ~1,920 (+39 net)
- Tests skipped: 430 → ~390 (-40)
- Pass rate: 81.40% → ~83.10% (+1.70%)

---

## Next Phase Preview

After Phase 3, you will proceed to:

**Phase 4: Testcontainers Integration** (178 tests, 2-3 weeks)

- Real Postgres/Redis instances
- Complex integration tests
- CI/CD Docker configuration

But focus on Phase 3 first. One phase at a time.

---

**Ready to Execute**: All prerequisites met. Start with Step 1.
