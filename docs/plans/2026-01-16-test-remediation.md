# Test Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce skipped tests from 113 to <20 using risk-based prioritization.

**Architecture:** 5-tier prioritization (CI blockers → critical path → quick wins → technical debt → permanent quarantine). Each tier processes tests in parallel where possible, with verification gates between tiers.

**Tech Stack:** Vitest, ioredis-mock, Playwright fixtures, GitHub Actions

---

## Tier 1: CI Blocking Tests (Day 1-2)

### Task 1.1: Setup ioredis-mock for Demo CI

**Files:**
- Modify: `tests/setup/node-setup-redis.ts`
- Modify: `package.json` (add dev dependency)

**Step 1: Install ioredis-mock**

```bash
npm install -D ioredis-mock
```

**Step 2: Verify installation**

```bash
npm ls ioredis-mock
```

Expected: `ioredis-mock@x.x.x`

**Step 3: Update Redis setup to use mock in test environment**

Location: `tests/setup/node-setup-redis.ts`

```typescript
// Add at top of file
import RedisMock from 'ioredis-mock';

// Replace or wrap existing Redis initialization
const redis = process.env.NODE_ENV === 'test' || process.env.DEMO_CI
  ? new RedisMock()
  : new Redis(process.env.REDIS_URL);

export { redis };
```

**Step 4: Run a previously skipped Redis test**

```bash
npm test -- tests/middleware/idempotency-dedupe.test.ts
```

Expected: Tests run (may pass or fail, but NOT skip)

**Step 5: Commit**

```bash
git add tests/setup/node-setup-redis.ts package.json package-lock.json
git commit -m "test(infra): add ioredis-mock for CI environment"
```

---

### Task 1.2: Remove Demo CI Skips from Idempotency Tests

**Files:**
- Modify: `tests/middleware/idempotency-dedupe.test.ts:12`

**Step 1: Read current skip pattern**

```bash
grep -n "DEMO_CI" tests/middleware/idempotency-dedupe.test.ts
```

Expected: Line showing `if (process.env.DEMO_CI) test.skip`

**Step 2: Remove the conditional skip**

Location: `tests/middleware/idempotency-dedupe.test.ts:12`

Change:
```typescript
if (process.env.DEMO_CI) test.skip('skipped in demo CI (no Redis)');
```

To:
```typescript
// Redis now mocked via ioredis-mock - no skip needed
```

**Step 3: Run the test**

```bash
npm test -- tests/middleware/idempotency-dedupe.test.ts
```

Expected: PASS (or actionable failure, not skip)

**Step 4: Commit**

```bash
git add tests/middleware/idempotency-dedupe.test.ts
git commit -m "test: enable idempotency-dedupe tests with Redis mock"
```

---

### Task 1.3: Remove Demo CI Skips from Circuit Breaker Tests

**Files:**
- Modify: `tests/integration/circuit-breaker-db.test.ts:15`

**Step 1: Read current skip pattern**

```bash
grep -n "DEMO_CI" tests/integration/circuit-breaker-db.test.ts
```

**Step 2: Remove the conditional skip**

Location: `tests/integration/circuit-breaker-db.test.ts:15`

Remove the skip line, add comment:
```typescript
// Redis now mocked via ioredis-mock
```

**Step 3: Run the test**

```bash
npm test -- tests/integration/circuit-breaker-db.test.ts
```

Expected: PASS or actionable failure

**Step 4: Commit**

```bash
git add tests/integration/circuit-breaker-db.test.ts
git commit -m "test: enable circuit-breaker-db tests with Redis mock"
```

---

### Task 1.4: Remove Demo CI Skips from Chaos Tests

**Files:**
- Modify: `tests/chaos/postgres-latency.test.ts:10`

**Step 1: Read current skip**

```bash
grep -n "DEMO_CI" tests/chaos/postgres-latency.test.ts
```

**Step 2: Remove conditional skip**

**Step 3: Run test**

```bash
npm test -- tests/chaos/postgres-latency.test.ts
```

**Step 4: Commit**

```bash
git add tests/chaos/postgres-latency.test.ts
git commit -m "test: enable postgres-latency chaos tests"
```

---

### Task 1.5: Verify Tier 1 Complete

**Step 1: Count remaining DEMO_CI skips**

```bash
grep -r "DEMO_CI.*skip" tests/ --include="*.ts" | wc -l
```

Expected: 0 (or document remaining)

**Step 2: Run full test suite**

```bash
npm test
```

**Step 3: Update progress.md**

Add to `.taskmaster/docs/progress.md`:
```markdown
### Tier 1 Complete: 2026-01-XX
- Removed: 12 DEMO_CI skips
- Method: ioredis-mock integration
- Remaining skip count: XX
```

---

## Tier 2: Critical Path Tests (Day 3-5)

### Task 2.1: Fix XIRR Newton-Raphson Solver Edge Case

**Files:**
- Modify: `server/analytics/xirr.ts`
- Test: `tests/unit/xirr-golden-set.test.ts:130`

**Step 1: Read the failing test**

```bash
grep -A 20 "extreme high returns" tests/unit/xirr-golden-set.test.ts
```

**Step 2: Understand the failure**

The test at line 130 expects Newton-Raphson to handle 10x returns in 6 months. Current implementation diverges.

**Step 3: Add Brent's method fallback**

Location: `server/analytics/xirr.ts` (find Newton iteration)

```typescript
// After Newton-Raphson attempt fails
if (!converged || !isFinite(rate)) {
  // Fallback to Brent's method for extreme cases
  rate = brentSolver(cashflows, dates, -0.99, 10.0);
}
```

**Step 4: Implement brentSolver function**

```typescript
function brentSolver(
  cashflows: number[],
  dates: Date[],
  lower: number,
  upper: number,
  tolerance: number = 1e-10,
  maxIterations: number = 100
): number {
  // Brent's method implementation
  let a = lower, b = upper;
  let fa = npv(cashflows, dates, a);
  let fb = npv(cashflows, dates, b);

  if (fa * fb > 0) throw new Error('Root not bracketed');

  // ... full Brent implementation
  return result;
}
```

**Step 5: Remove skip from test**

Location: `tests/unit/xirr-golden-set.test.ts:130`

Change `it.skip(` to `it(`

**Step 6: Run test**

```bash
npm test -- tests/unit/xirr-golden-set.test.ts
```

Expected: PASS

**Step 7: Commit**

```bash
git add server/analytics/xirr.ts tests/unit/xirr-golden-set.test.ts
git commit -m "fix(xirr): add Brent's method fallback for extreme returns"
```

---

### Task 2.2: Fix XIRR Bisection Fallback Test

**Files:**
- Modify: `tests/unit/xirr-golden-set.test.ts:284`
- Modify: `tests/unit/analytics-xirr.test.ts:59,88`

**Step 1: Read failing tests**

```bash
grep -B 5 -A 10 "Brent fallback\|bisection fallback" tests/unit/xirr-golden-set.test.ts tests/unit/analytics-xirr.test.ts
```

**Step 2: Verify Brent's method now triggers for these cases**

After Task 2.1, these should now pass.

**Step 3: Remove skips from all 3 tests**

- `tests/unit/xirr-golden-set.test.ts:284`
- `tests/unit/analytics-xirr.test.ts:59`
- `tests/unit/analytics-xirr.test.ts:88`

**Step 4: Run tests**

```bash
npm test -- tests/unit/xirr-golden-set.test.ts tests/unit/analytics-xirr.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add tests/unit/xirr-golden-set.test.ts tests/unit/analytics-xirr.test.ts
git commit -m "test: enable XIRR edge case tests after Brent fallback"
```

---

### Task 2.3: Document Security Middleware Gap

**Files:**
- Modify: `tests/unit/api/portfolio-intelligence.test.ts`

**Step 1: Read the FIXMEs**

```bash
grep -n "FIXME.*security middleware" tests/unit/api/portfolio-intelligence.test.ts
```

**Step 2: Add @quarantine JSDoc (if fix is complex)**

If the security middleware requires significant work, document as Tier 5:

```typescript
/**
 * @quarantine
 * @owner @security-team
 * @reason Security middleware not applied to portfolio-intelligence routes
 * @exitCriteria Complete security audit and middleware application (Issue #XXX)
 * @addedDate 2026-01-16
 */
describe.skip('Security middleware tests', () => { ... });
```

**Step 3: Or fix inline if simple**

If middleware just needs mounting:
```typescript
// In server/routes/portfolio-intelligence.ts
import { authMiddleware, rateLimitMiddleware } from '@/middleware';

router.use(authMiddleware);
router.use(rateLimitMiddleware);
```

**Step 4: Run tests**

```bash
npm test -- tests/unit/api/portfolio-intelligence.test.ts
```

**Step 5: Commit**

```bash
git add tests/unit/api/portfolio-intelligence.test.ts
git commit -m "test: document or fix portfolio-intelligence security middleware"
```

---

## Tier 3: Quick Wins (Week 2)

### Task 3.1: Create Fix Patterns Cheatsheet

**Files:**
- Create: `cheatsheets/test-fix-patterns.md`

**Step 1: Create the file**

```markdown
# Test Fix Patterns

Quick reference for common test remediation patterns.

## Redis Mocking

```typescript
// tests/setup/node-setup-redis.ts
import RedisMock from 'ioredis-mock';

const redis = process.env.NODE_ENV === 'test'
  ? new RedisMock()
  : new Redis(process.env.REDIS_URL);
```

## E2E Auth Fixture

```typescript
// tests/e2e/fixtures/auth.ts
import { test as base } from '@playwright/test';

export const test = base.extend({
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'testpassword');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
    await use(page);
  },
});
```

## Condition-Based Waiting (Anti-Flake)

```typescript
// Instead of: await new Promise(r => setTimeout(r, 1000));
// Use:
await expect(async () => {
  const result = await fetchData();
  expect(result.status).toBe('ready');
}).toPass({ timeout: 5000 });
```

## Seeded PRNG for Monte Carlo

```typescript
import seedrandom from 'seedrandom';

const rng = seedrandom('test-seed-123');
const randomValue = rng(); // Deterministic
```

## @quarantine JSDoc Template

```typescript
/**
 * @quarantine
 * @owner @username
 * @reason Brief explanation
 * @exitCriteria What needs to happen to enable
 * @addedDate YYYY-MM-DD
 */
describe.skip('Test name', () => { ... });
```
```

**Step 2: Commit**

```bash
git add cheatsheets/test-fix-patterns.md
git commit -m "docs: add test fix patterns cheatsheet"
```

---

### Task 3.2: Add @quarantine Docs to Monte Carlo Stochastic Tests

**Files:**
- Modify: `tests/unit/engines/monte-carlo-orchestrator.test.ts`

**Step 1: Read current skips**

```bash
grep -n "describe.skip\|it.skip" tests/unit/engines/monte-carlo-orchestrator.test.ts | head -15
```

**Step 2: Add @quarantine JSDoc to the describe block**

```typescript
/**
 * @quarantine
 * @owner @phoenix-team
 * @reason Stochastic mode tests require Phase 2 Monte Carlo completion
 * @exitCriteria Phase 2 Monte Carlo merged (tracking: phoenix-phase2-planning.md)
 * @addedDate 2026-01-16
 */
describe.skip('Monte Carlo Orchestrator - Stochastic Mode', () => {
  // 13 tests
});
```

**Step 3: Move file to quarantine directory (optional)**

```bash
mv tests/unit/engines/monte-carlo-orchestrator.test.ts tests/quarantine/
```

**Step 4: Commit**

```bash
git add tests/unit/engines/monte-carlo-orchestrator.test.ts
git commit -m "test: document Monte Carlo stochastic tests as quarantined"
```

---

### Task 3.3: Fix E2E Fund Setup Precondition

**Files:**
- Modify: `tests/e2e/utils/setup.ts` or equivalent
- Modify: `tests/e2e/portfolio-management.spec.ts:22`

**Step 1: Identify the skip reason**

```bash
grep -B 5 -A 5 "Fund setup not complete" tests/e2e/portfolio-management.spec.ts
```

**Step 2: Add fund setup to test fixture**

```typescript
// tests/e2e/fixtures/fund.ts
export const test = base.extend({
  fundConfiguredPage: async ({ page }, use) => {
    // Ensure fund exists via API or seed
    await seedTestFund();
    await page.goto('/dashboard');
    await use(page);
  },
});
```

**Step 3: Update test to use fixture**

```typescript
import { test } from './fixtures/fund';

test('portfolio management', async ({ fundConfiguredPage }) => {
  // Test now has fund precondition met
});
```

**Step 4: Remove skip**

**Step 5: Run test**

```bash
npx playwright test tests/e2e/portfolio-management.spec.ts
```

**Step 6: Commit**

```bash
git add tests/e2e/
git commit -m "test(e2e): add fund fixture, enable portfolio-management tests"
```

---

### Task 3.4 - 3.20: Apply Pattern to Remaining E2E Tests

Repeat Task 3.3 pattern for each E2E file with precondition skips:
- `tests/e2e/navigation-and-routing.spec.ts` (3 skips)
- `tests/e2e/performance.spec.ts` (8 skips)
- `tests/e2e/accessibility.spec.ts` (7 skips)
- `tests/e2e/user-authentication.spec.ts` (2 skips)
- `tests/e2e/dashboard-functionality.spec.ts` (1 skip)
- etc.

**Pattern for each:**
1. Identify skip reason
2. Add appropriate fixture (auth, fund, or both)
3. Remove skip
4. Run test
5. Commit

---

## Tier 4: Technical Debt (Week 3)

### Task 4.1: Refactor Time-Travel Middleware for DI

**Files:**
- Modify: `server/middleware/time-travel.ts`
- Modify: `tests/unit/api/time-travel-api.test.ts`

**Step 1: Read current middleware**

```bash
head -50 server/middleware/time-travel.ts
```

**Step 2: Extract dependencies to injectable interface**

```typescript
// server/middleware/time-travel.ts
export interface TimeTravelDependencies {
  snapshotService: SnapshotService;
  dateParser: DateParser;
}

export function createTimeTravelMiddleware(deps: TimeTravelDependencies) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Use deps.snapshotService instead of direct import
  };
}
```

**Step 3: Update tests to inject mocks**

```typescript
// tests/unit/api/time-travel-api.test.ts
import { createTimeTravelMiddleware } from '@/middleware/time-travel';

const mockDeps = {
  snapshotService: {
    getSnapshot: vi.fn().mockResolvedValue({ data: 'mocked' }),
  },
  dateParser: {
    parse: vi.fn().mockReturnValue(new Date('2025-01-01')),
  },
};

const middleware = createTimeTravelMiddleware(mockDeps);
```

**Step 4: Remove skips from time-travel tests (13 tests)**

**Step 5: Run tests**

```bash
npm test -- tests/unit/api/time-travel-api.test.ts
```

**Step 6: Commit**

```bash
git add server/middleware/time-travel.ts tests/unit/api/time-travel-api.test.ts
git commit -m "refactor(middleware): add DI to time-travel, enable 13 tests"
```

---

### Task 4.2: Seed Monte Carlo PRNG for Determinism

**Files:**
- Modify: `server/engines/monte-carlo.ts`
- Modify: `tests/unit/services/monte-carlo-power-law-validation.test.ts`

**Step 1: Install seedrandom**

```bash
npm install seedrandom
npm install -D @types/seedrandom
```

**Step 2: Add seed parameter to Monte Carlo engine**

```typescript
// server/engines/monte-carlo.ts
import seedrandom from 'seedrandom';

export function runSimulation(config: MonteCarloConfig, seed?: string) {
  const rng = seed ? seedrandom(seed) : Math.random;
  // Use rng() instead of Math.random() throughout
}
```

**Step 3: Update tests to use seed**

```typescript
// tests/unit/services/monte-carlo-power-law-validation.test.ts
it('produces consistent results with seed', () => {
  const result1 = runSimulation(config, 'test-seed');
  const result2 = runSimulation(config, 'test-seed');
  expect(result1).toEqual(result2);
});
```

**Step 4: Remove @flaky tag and skip**

**Step 5: Run tests**

```bash
npm test -- tests/unit/services/monte-carlo-power-law-validation.test.ts
```

**Step 6: Commit**

```bash
git add server/engines/monte-carlo.ts tests/unit/services/monte-carlo-power-law-validation.test.ts package.json
git commit -m "feat(monte-carlo): add seedable PRNG, enable deterministic tests"
```

---

## Tier 5: Long-Term Quarantine (Week 4)

### Task 5.1: Create Quarantine Protocol Document

**Files:**
- Create: `tests/quarantine/PROTOCOL.md`

**Step 1: Write the protocol**

```markdown
# Test Quarantine Protocol

## Purpose

Tests in this directory are intentionally skipped due to external dependencies or blocked features. Each must have documented exit criteria.

## Requirements

Every quarantined test MUST have:

1. `@quarantine` JSDoc tag
2. `@owner` - GitHub username responsible
3. `@reason` - Why it cannot run
4. `@exitCriteria` - What must happen to enable
5. `@addedDate` - When quarantined

## Example

```typescript
/**
 * @quarantine
 * @owner @devops-team
 * @reason Requires Docker-in-Docker not available in GitHub Actions
 * @exitCriteria GitHub Actions supports DinD OR we migrate to self-hosted runners
 * @addedDate 2026-01-16
 */
describe.skip('Testcontainers Integration', () => { ... });
```

## Monthly Review

On the 1st of each month:
1. Run `npm run quarantine:report`
2. Check if any exit criteria are now met
3. Enable tests where possible
4. Update report in REPORT.md
```

**Step 2: Commit**

```bash
git add tests/quarantine/PROTOCOL.md
git commit -m "docs: add quarantine protocol for long-term test skips"
```

---

### Task 5.2: Document Testcontainers as Permanent Quarantine

**Files:**
- Modify: `tests/integration/testcontainers-smoke.test.ts`

**Step 1: Add @quarantine JSDoc**

```typescript
/**
 * @quarantine
 * @owner @devops-team
 * @reason Requires Docker which is not available in GitHub Actions free tier
 * @exitCriteria Migrate to self-hosted runners OR GitHub adds Docker support
 * @addedDate 2026-01-16
 */
describe.skip('Testcontainers Infrastructure', () => { ... });
```

**Step 2: Move to quarantine directory**

```bash
mv tests/integration/testcontainers-smoke.test.ts tests/quarantine/
```

**Step 3: Commit**

```bash
git add tests/integration/ tests/quarantine/
git commit -m "test: quarantine testcontainers tests (requires Docker)"
```

---

### Task 5.3: Setup CI Skip Counter

**Files:**
- Create: `.github/workflows/skip-counter.yml`

**Step 1: Create workflow file**

```yaml
name: Skip Counter

on:
  pull_request:
    paths:
      - 'tests/**'
      - '*.config.ts'

jobs:
  count-skips:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Count skipped tests
        id: count
        run: |
          SKIP_COUNT=$(grep -rE "\.(skip|todo)\(|describe\.skip|it\.skip|test\.skip" tests/ --include="*.ts" --include="*.tsx" | wc -l)
          echo "count=$SKIP_COUNT" >> $GITHUB_OUTPUT
          echo "::notice::Current skip count: $SKIP_COUNT"

      - name: Check threshold
        env:
          THRESHOLD: 20
        run: |
          if [ ${{ steps.count.outputs.count }} -gt $THRESHOLD ]; then
            echo "::error::Skip count (${{ steps.count.outputs.count }}) exceeds threshold ($THRESHOLD)"
            exit 1
          fi
          echo "::notice::Skip count within threshold"
```

**Step 2: Commit**

```bash
git add .github/workflows/skip-counter.yml
git commit -m "ci: add skip counter workflow with threshold enforcement"
```

---

## Final Verification

### Task 6.1: Run Full Test Suite

**Step 1: Run all tests**

```bash
npm test
```

**Step 2: Count final skips**

```bash
grep -rE "\.(skip|todo)\(|describe\.skip|it\.skip|test\.skip" tests/ --include="*.ts" --include="*.tsx" | wc -l
```

Expected: <20

**Step 3: Generate quarantine report**

```bash
npm run quarantine:report
```

**Step 4: Update progress.md with final status**

---

### Task 6.2: Update findings.md with Results

**Step 1: Update `.taskmaster/docs/findings.md`**

Add final section:
```markdown
## Remediation Results (2026-01-XX)

| Metric | Before | After |
|--------|--------|-------|
| Total skips | 113 | XX |
| Documented | 5 | XX |
| Undocumented | 54 | 0 |

### Permanent Quarantines (Documented)
- Testcontainers (Docker dependency)
- Phase 2 Monte Carlo (feature incomplete)
- [List others...]
```

**Step 2: Commit**

```bash
git add .taskmaster/docs/
git commit -m "docs: update findings with remediation results"
```

---

## Execution Handoff

**Plan complete and saved to `docs/plans/2026-01-16-test-remediation.md`.**

**Two execution options:**

**1. Subagent-Driven (this session)**
- I dispatch fresh subagent per task
- Review between tasks
- Fast iteration with oversight

**2. Parallel Session (separate)**
- Open new Claude Code session
- Use executing-plans skill
- Batch execution with checkpoints

**Which approach would you like?**
