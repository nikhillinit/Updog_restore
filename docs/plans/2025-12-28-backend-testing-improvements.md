# Backend & Testing Improvements - Revised Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Register orphaned backend routes, obtain scenario-comparison approval, improve frontend test coverage, and clean up duplicate code.

**Architecture:** Incremental registration with feature flags, test infrastructure fixes before test authoring, and safe deletion of verified dead code.

**Tech Stack:** Express.js, TypeScript, Vitest, React Testing Library, Redis, PostgreSQL

---

## Research Thinking Analysis

<research_thinking>
  <initial_analysis>
    Task: Execute 5 prioritized improvements to backend and testing infrastructure

    Known (Verified):
    - Portfolio-intelligence has 17 routes with 76 response statements (NOT broken)
    - Service layer complete (24 functions with proper Drizzle ORM)
    - Test runner broken (cross-env not found)
    - Feature flag system exists (config/features.ts + database table)
    - 10 actually orphaned routes (not 30+ as initially claimed)

    Constraints:
    - Must not break production
    - Need rollback capability for each phase
    - Test infrastructure must work before test authoring
    - Product approval required for scenario-comparison (external dependency)

    Success Criteria:
    - All production-ready routes registered and functional
    - Test runner operational
    - Frontend test coverage increased measurably
    - Zero dead code in reserves routes
    - Feature flags enable safe rollout/rollback
  </initial_analysis>

  <strategy>
    Approach:
    1. Fix infrastructure first (test runner)
    2. Verify actual state before each phase
    3. Use feature flags for safe registration
    4. Small, reversible commits
    5. Validate at each step

    Order of Operations:
    - Phase 0: Fix test infrastructure (BLOCKER for all else)
    - Phase 1: Register portfolio-intelligence (highest value, verified ready)
    - Phase 2: Document scenario-comparison for product (parallel with Phase 3)
    - Phase 3: Frontend test coverage (long pole)
    - Phase 4: Register metrics routes (quick win)
    - Phase 5: Clean reserves duplication (quick win)

    Validation:
    - Each phase has specific pass/fail criteria
    - Rollback procedure documented for each
    - Feature flags enable instant disable
  </strategy>
</research_thinking>

---

## Pre-Flight Checklist

Before starting ANY phase, verify:

```bash
# 1. Test runner works
npm test -- --help

# 2. Database accessible
npm run db:studio

# 3. Clean git state
git status  # Should show no uncommitted changes

# 4. On correct branch
git branch --show-current  # Should be feature branch
```

---

## Phase 0: Fix Test Infrastructure (BLOCKER)

**Priority:** CRITICAL - Blocks all test-related work
**Effort:** 15-30 minutes
**Risk:** LOW

### Problem

```bash
$ npm test
sh: 1: cross-env: not found
```

### Files

- Modify: `package.json` (if needed)
- Verify: `node_modules/.bin/cross-env`

### Step 0.1: Diagnose the issue

```bash
# Check if cross-env is in dependencies
grep -n "cross-env" package.json

# Check if it's in node_modules
ls -la node_modules/.bin/cross-env 2>/dev/null || echo "NOT FOUND"

# Check sidecar status
npm run doctor:links
```

### Step 0.2: Fix cross-env availability

**Option A - If missing from node_modules:**
```bash
npm install
```

**Option B - If sidecar linking issue:**
```bash
npm run doctor:links
# Follow any repair instructions
```

**Option C - If truly missing:**
```bash
npm install --save-dev cross-env
```

### Step 0.3: Verify fix

```bash
npm test -- --project=server --testPathPattern="health" --run
```

**Expected:** Tests run (pass or fail, but no "command not found")

### Step 0.4: Commit if package.json changed

```bash
git add package.json package-lock.json
git commit -m "fix: restore cross-env for test runner"
```

### Rollback

```bash
git revert HEAD  # If commit was made
```

---

## Phase 1: Register Portfolio-Intelligence Route

**Priority:** HIGH
**Effort:** 1-2 hours (down from 2-3 days)
**Risk:** LOW (routes are complete, just unregistered)

### Pre-Verification

```bash
# Confirm routes have responses
grep -c "res\[.*\](" server/routes/portfolio-intelligence.ts
# Expected: 67+

# Confirm service exists
ls -la server/services/portfolio-intelligence-service.ts
# Expected: File exists

# Run existing tests
npm test -- --project=server --testPathPattern="portfolio-intelligence" --run
```

### Files

- Modify: `server/routes.ts` (add registration)
- Modify: `server/config/features.ts` (add feature flag)
- Test: `tests/integration/portfolio-intelligence.test.ts`

### Step 1.1: Add feature flag

**Location:** `server/config/features.ts`

```typescript
// Add to existing features object:
export const features = {
  // ... existing flags ...
  portfolioIntelligence: flag(process.env['ENABLE_PORTFOLIO_INTELLIGENCE'], false),
};
```

### Step 1.2: Register route with feature flag guard

**Location:** `server/routes.ts` (near line 770, after other route registrations)

```typescript
// Portfolio Intelligence routes (feature-flagged)
import { features } from './config/features.js';

if (features.portfolioIntelligence) {
  const portfolioIntelligenceRoutes = await import('./routes/portfolio-intelligence.js');
  app.use(portfolioIntelligenceRoutes.default);
  console.log('[routes] Portfolio Intelligence routes registered');
}
```

### Step 1.3: Run tests to verify no breakage

```bash
npm test -- --project=server --run
```

**Expected:** All previously passing tests still pass

### Step 1.4: Enable flag and smoke test

```bash
# Start server with flag enabled
ENABLE_PORTFOLIO_INTELLIGENCE=true npm run dev:api

# In another terminal, test an endpoint
curl -X GET http://localhost:5000/api/portfolio/strategies/1 \
  -H "Content-Type: application/json"
```

**Expected:** 200 OK with strategies array (may be empty) OR 401 if auth required

### Step 1.5: Commit

```bash
git add server/routes.ts server/config/features.ts
git commit -m "feat(routes): register portfolio-intelligence with feature flag

- Add ENABLE_PORTFOLIO_INTELLIGENCE feature flag (default: off)
- Register 17 portfolio management endpoints
- Routes include: strategies, scenarios, reserves, forecasts
- Safe rollout: flag must be explicitly enabled"
```

### Rollback

```bash
# Immediate: Set flag to false (no deploy needed if flag is env-based)
export ENABLE_PORTFOLIO_INTELLIGENCE=false

# If needed: Revert commit
git revert HEAD
```

### Success Criteria

- [ ] Feature flag added to config/features.ts
- [ ] Route registered in routes.ts (guarded)
- [ ] No test regressions
- [ ] Endpoints respond when flag enabled
- [ ] Endpoints 404 when flag disabled

---

## Phase 2: Scenario-Comparison Product Approval

**Priority:** MEDIUM
**Effort:** 1 hour documentation + EXTERNAL approval
**Risk:** LOW (no code changes until approved)

### Context

The scenario-comparison feature is **code complete** but commented out due to:
- Database migration not pushed to production
- Feature not yet released (requires product approval)

### Files

- Create: `docs/decisions/2025-12-28-scenario-comparison-release.md`
- Reference: `server/routes/scenario-comparison.ts`
- Reference: `tests/integration/scenario-comparison-mvp.test.ts`

### Step 2.1: Create decision document

**Location:** `docs/decisions/2025-12-28-scenario-comparison-release.md`

```markdown
# ADR: Scenario Comparison Feature Release

**Status:** PENDING APPROVAL
**Date:** 2025-12-28
**Deciders:** [Product Owner], [Engineering Lead]

## Context

The scenario comparison feature enables side-by-side analysis of portfolio
scenarios with:
- Ephemeral comparisons (Redis cached, 5-min TTL)
- Delta calculations between base and comparison scenarios
- Support for 2-5 scenarios per comparison

## Technical Readiness

| Component | Status | Notes |
|-----------|--------|-------|
| Route implementation | COMPLETE | 283 lines, server/routes/scenario-comparison.ts |
| Service layer | COMPLETE | server/services/comparison-service.ts |
| Database schema | DEFINED | scenarios, scenario_cases tables in shared/schema.ts |
| Database migration | NOT PUSHED | Requires `npm run db:push` |
| Frontend integration | PARTIAL | client/src/pages/ScenarioComparison.tsx exists |
| Tests | SKIPPED | Awaiting route activation |

## Decision Required

Should we:
1. **APPROVE** - Push migration and enable feature
2. **DEFER** - Keep disabled, document timeline
3. **REMOVE** - Delete code if feature cancelled

## Risks

| Risk | Mitigation |
|------|------------|
| Schema migration issues | Test in staging first |
| Performance with large scenarios | Redis caching + TTL |
| User confusion | Documentation + UI guidance |

## If Approved

1. Push database migration: `npm run db:push`
2. Uncomment route in server/routes.ts:767-769
3. Enable tests in scenario-comparison-mvp.test.ts
4. Deploy to staging for validation
5. Production release

## Signatures

- Product Owner: _________________ Date: _______
- Engineering Lead: ______________ Date: _______
```

### Step 2.2: Commit documentation

```bash
git add docs/decisions/2025-12-28-scenario-comparison-release.md
git commit -m "docs: add ADR for scenario-comparison release decision

Documenting technical readiness and requesting product approval.
Feature is code-complete but requires:
- Database migration push
- Product sign-off

See: docs/decisions/2025-12-28-scenario-comparison-release.md"
```

### Step 2.3: Notify stakeholders

Create ticket/issue with link to ADR and request review.

### Success Criteria

- [ ] ADR document created
- [ ] Stakeholders notified
- [ ] Decision timeline established
- [ ] No code changes until approved

---

## Phase 3: Frontend Test Coverage

**Priority:** MEDIUM
**Effort:** 4-6 weeks (realistic estimate)
**Risk:** MEDIUM (requires sustained effort)

### Current State

| Metric | Value |
|--------|-------|
| Total TSX files | 364 |
| Test files | 9 |
| Coverage | 2.5% (by file count) |
| Test cases | 94 |

### Target State

| Metric | Target |
|--------|--------|
| Test files | 20+ |
| Coverage | 10%+ (by file count) |
| Test cases | 200+ |
| Critical path | 100% covered |

### Week 1: Test Infrastructure

#### Step 3.1.1: Create shared test utilities

**Location:** `tests/unit/test-utils.tsx`

```typescript
import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';

// Reusable query client - no retries, immediate GC
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

// Standard providers wrapper
interface ProvidersProps {
  children: React.ReactNode;
}

function AllProviders({ children }: ProvidersProps) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

// Custom render with all providers
export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return {
    user: userEvent.setup(),
    ...render(ui, { wrapper: AllProviders, ...options }),
  };
}

// Re-export everything from testing-library
export * from '@testing-library/react';
export { userEvent };
```

#### Step 3.1.2: Create mock data factories

**Location:** `tests/unit/factories.ts`

```typescript
import { v4 as uuid } from 'uuid';

export const mockFundFactory = (overrides?: Partial<Fund>): Fund => ({
  id: 1,
  name: 'Test Fund I',
  size: 100_000_000,
  vintage: 2024,
  status: 'active',
  createdAt: new Date().toISOString(),
  ...overrides,
});

export const mockInvestmentFactory = (overrides?: Partial<Investment>): Investment => ({
  id: uuid(),
  companyName: 'Test Company Inc',
  stage: 'Series A',
  amount: 5_000_000,
  ownership: 0.15,
  status: 'active',
  ...overrides,
});

export const mockScenarioFactory = (overrides?: Partial<Scenario>): Scenario => ({
  id: uuid(),
  name: 'Base Case',
  type: 'base_case',
  fundId: 1,
  ...overrides,
});
```

#### Step 3.1.3: Validate infrastructure with one test

**Location:** `tests/unit/components/test-utils.test.tsx`

```typescript
import { describe, it, expect } from 'vitest';
import { renderWithProviders, screen } from '../test-utils';

// Simple component for testing the test infrastructure
function TestComponent() {
  return <div data-testid="test-component">Hello Test</div>;
}

describe('Test Infrastructure', () => {
  it('renderWithProviders works correctly', () => {
    renderWithProviders(<TestComponent />);
    expect(screen.getByTestId('test-component')).toBeInTheDocument();
  });
});
```

#### Step 3.1.4: Run and verify

```bash
npm test -- tests/unit/components/test-utils.test.tsx --run
```

**Expected:** PASS

#### Step 3.1.5: Commit infrastructure

```bash
git add tests/unit/test-utils.tsx tests/unit/factories.ts tests/unit/components/test-utils.test.tsx
git commit -m "test: add shared test utilities and mock factories

- renderWithProviders with QueryClient
- Mock factories for Fund, Investment, Scenario
- Validation test to ensure setup works"
```

### Weeks 2-4: Priority Component Tests

Test these components in order (highest impact first):

| Priority | Component | File | Est. Tests |
|----------|-----------|------|------------|
| 1 | FundBasicsStep | pages/FundBasicsStep.tsx | 15 |
| 2 | InvestmentRoundsStep | pages/InvestmentRoundsStep.tsx | 15 |
| 3 | investment-editor | components/investments/investment-editor.tsx | 20 |
| 4 | CapitalStructureStep | pages/CapitalStructureStep.tsx | 15 |
| 5 | ExecutiveDashboard | components/dashboard/ExecutiveDashboard.tsx | 12 |

#### Example: FundBasicsStep Tests

**Location:** `client/src/pages/__tests__/FundBasicsStep.test.tsx`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@tests/unit/test-utils';
import { mockFundFactory } from '@tests/unit/factories';
import FundBasicsStep from '../FundBasicsStep';

// Mock wouter
vi.mock('wouter', () => ({
  useLocation: () => ['/', vi.fn()],
  useParams: () => ({ fundId: '1' }),
}));

describe('FundBasicsStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders fund name input', () => {
      renderWithProviders(<FundBasicsStep />);
      expect(screen.getByLabelText(/fund name/i)).toBeInTheDocument();
    });

    it('renders fund size input with currency formatting', () => {
      renderWithProviders(<FundBasicsStep />);
      expect(screen.getByLabelText(/fund size/i)).toBeInTheDocument();
    });

    it('renders vintage year selector', () => {
      renderWithProviders(<FundBasicsStep />);
      expect(screen.getByLabelText(/vintage/i)).toBeInTheDocument();
    });
  });

  describe('Validation', () => {
    it('shows error when fund name is empty', async () => {
      const { user } = renderWithProviders(<FundBasicsStep />);

      const nameInput = screen.getByLabelText(/fund name/i);
      await user.clear(nameInput);
      await user.tab(); // Trigger blur validation

      await waitFor(() => {
        expect(screen.getByText(/name is required/i)).toBeInTheDocument();
      });
    });

    it('shows error when fund size is negative', async () => {
      const { user } = renderWithProviders(<FundBasicsStep />);

      const sizeInput = screen.getByLabelText(/fund size/i);
      await user.clear(sizeInput);
      await user.type(sizeInput, '-1000000');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText(/must be positive/i)).toBeInTheDocument();
      });
    });
  });

  describe('Interactions', () => {
    it('updates form state on input change', async () => {
      const { user } = renderWithProviders(<FundBasicsStep />);

      const nameInput = screen.getByLabelText(/fund name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'New Fund Name');

      expect(nameInput).toHaveValue('New Fund Name');
    });
  });
});
```

### Week 5-6: Integration & Polish

- Add integration tests for multi-step workflows
- Fix any flaky tests
- Add CI integration for coverage reporting
- Document testing patterns

### Success Criteria

- [ ] Test utilities created and working
- [ ] Mock factories for common entities
- [ ] Top 5 components have tests
- [ ] All new tests pass in CI
- [ ] Coverage > 10% by file count

---

## Phase 4: Register Metrics Routes

**Priority:** LOW
**Effort:** 1-2 hours
**Risk:** LOW (operational routes, not user-facing)

### Pre-Verification

```bash
# Check which metrics files exist
ls -la server/routes/metrics*.ts server/routes/readiness.ts server/routes/error-budget.ts 2>/dev/null
```

### Files

- Modify: `server/routes.ts`
- Test: Manual curl verification

### Step 4.1: Add conditional registration

**Location:** `server/routes.ts` (near end of registerRoutes function)

```typescript
// Metrics & Observability routes (enabled by default in dev/staging)
const enableMetrics = process.env['ENABLE_METRICS'] !== 'false';
if (enableMetrics) {
  try {
    // Prometheus metrics endpoint
    const metricsEndpoint = await import('./routes/metrics-endpoint.js');
    app.use(metricsEndpoint.default);

    // Readiness probe for Kubernetes
    const readinessRoutes = await import('./routes/readiness.js');
    app.use(readinessRoutes.default);

    // Error budget tracking
    const errorBudgetRoutes = await import('./routes/error-budget.js');
    app.use('/api/error-budget', errorBudgetRoutes.default);

    console.log('[routes] Metrics & observability routes registered');
  } catch (err) {
    console.warn('[routes] Some metrics routes failed to load:', err);
  }
}
```

### Step 4.2: Verify endpoints work

```bash
npm run dev:api &

# Test metrics endpoint
curl http://localhost:5000/metrics | head -10

# Test readiness
curl http://localhost:5000/ready

# Test error budget
curl http://localhost:5000/api/error-budget
```

### Step 4.3: Commit

```bash
git add server/routes.ts
git commit -m "feat(routes): register metrics and observability endpoints

- /metrics - Prometheus metrics
- /ready - Kubernetes readiness probe
- /api/error-budget - Error budget tracking

Controlled by ENABLE_METRICS env var (default: true)"
```

### Rollback

```bash
export ENABLE_METRICS=false
# Or: git revert HEAD
```

---

## Phase 5: Clean Up Reserves Duplication

**Priority:** LOW
**Effort:** 30 minutes
**Risk:** LOW (verified dead code)

### Pre-Verification

```bash
# Confirm v1/reserves.ts is the only registered route
grep -n "reserves" server/app.ts server/routes.ts | grep -v "node_modules"

# Confirm no imports of legacy files
grep -rn "from.*reserves\.ts\|from.*reserves-api\.ts" server/ --include="*.ts" | grep -v "node_modules"
```

**Expected:** Only v1/reserves.ts should be imported

### Files

- Delete: `server/routes/reserves.ts` (133 lines, dead)
- Delete: `server/routes/reserves-api.ts` (668 lines, dead)
- Keep: `server/routes/v1/reserves.ts` (111 lines, active)

### Step 5.1: Final verification

```bash
# Double-check no dynamic imports
grep -rn "reserves\.ts\|reserves-api" server/ --include="*.ts"
# Should return empty or only comments
```

### Step 5.2: Delete dead files

```bash
rm server/routes/reserves.ts
rm server/routes/reserves-api.ts
```

### Step 5.3: Run tests to verify no breakage

```bash
npm test -- --project=server --run
```

**Expected:** All tests pass (no test depended on deleted files)

### Step 5.4: Commit

```bash
git add -A
git commit -m "chore: remove duplicate reserves route files

Delete legacy reserves routes that were never registered:
- server/routes/reserves.ts (133 lines)
- server/routes/reserves-api.ts (668 lines)

Active route remains: server/routes/v1/reserves.ts
Total dead code removed: 801 lines"
```

### Rollback

```bash
git revert HEAD
```

---

## Rollback Procedures Summary

| Phase | Immediate Rollback | Full Rollback |
|-------|-------------------|---------------|
| 0 | N/A (fix only) | `git revert HEAD` |
| 1 | `ENABLE_PORTFOLIO_INTELLIGENCE=false` | `git revert HEAD` |
| 2 | N/A (docs only) | `git revert HEAD` |
| 3 | Skip tests in CI | `git revert HEAD~N` |
| 4 | `ENABLE_METRICS=false` | `git revert HEAD` |
| 5 | `git revert HEAD` | `git revert HEAD` |

---

## Success Metrics

| Metric | Before | After | Measurement |
|--------|--------|-------|-------------|
| Test runner | Broken | Working | `npm test` exits 0 |
| Portfolio endpoints | 0 | 17 | `curl` responses |
| Scenario comparison | Blocked | Documented | ADR exists |
| Frontend tests | 9 files | 15+ files | `find` count |
| Dead code | 801 lines | 0 lines | File deletion |
| Feature flags | None | 2 new | Config inspection |

---

## Timeline

| Week | Phase | Deliverables |
|------|-------|--------------|
| 1 | 0, 1, 4, 5 | Test runner fixed, portfolio registered, metrics registered, reserves cleaned |
| 1 | 2 | ADR created, stakeholders notified |
| 2 | 3.1 | Test utilities and factories |
| 3-4 | 3.2 | Top 5 component tests |
| 5-6 | 3.3 | Integration tests, polish |

---

## Appendix: Verification Commands

```bash
# Phase 0: Test runner
npm test -- --help

# Phase 1: Portfolio routes
curl http://localhost:5000/api/portfolio/strategies/1

# Phase 2: ADR exists
cat docs/decisions/2025-12-28-scenario-comparison-release.md

# Phase 3: Test count
find tests/unit -name "*.test.tsx" | wc -l

# Phase 4: Metrics endpoint
curl http://localhost:5000/metrics | head -5

# Phase 5: Dead code removed
ls server/routes/reserves*.ts  # Should only show v1 path
```

---

**Plan complete. Ready for execution?**

Two execution options:
1. **Subagent-Driven** - I dispatch tasks one at a time with review between
2. **Sequential** - Execute all tasks in order, commit after each phase

Which approach would you prefer?
