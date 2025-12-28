# Implementation Plan: Backend & Testing Improvements

**Created**: 2025-12-28 **Status**: DRAFT - Awaiting Approval **Estimated
Effort**: 3-4 sprints (6-8 weeks)

---

## Executive Summary

This plan addresses 5 prioritized improvements identified during project
evaluation:

| Priority | Task                                | Effort    | Risk   | Dependencies               |
| -------- | ----------------------------------- | --------- | ------ | -------------------------- |
| HIGH     | Register portfolio-intelligence.ts  | 2-3 days  | HIGH   | Fix 12 failing tests first |
| MEDIUM   | Scenario-comparison approval        | External  | LOW    | Product decision           |
| MEDIUM   | Frontend test coverage (2.5% → 20%) | 2-3 weeks | MEDIUM | Test utilities setup       |
| LOW      | Register metrics routes             | 2 hours   | LOW    | None                       |
| LOW      | Clean up reserves duplication       | 4 hours   | LOW    | Verify no consumers        |

---

## Phase 1: HIGH Priority - Portfolio Intelligence Route

### Current State Analysis

**File**: `server/routes/portfolio-intelligence.ts` (1,492 lines)

**Critical Blockers Identified**:

1. **12 failing tests** - POST handlers missing `res.json()` calls
2. **9 incomplete POST routes** - timeout waiting for responses
3. **Mixed persistence strategy** - DB + in-memory + hardcoded stubs
4. **Missing initialization** - `req.app.locals.portfolioStorage` not set up

**Endpoints Defined** (15 total):

- 4 Strategy endpoints: CRUD for portfolio strategies
- 5 Scenario endpoints: Create, list, compare, simulate, forecast
- 3 Reserve optimization endpoints: Optimize, list strategies, backtest
- 3 Performance endpoints: Create forecast, list, validate

### Implementation Strategy

#### Step 1.1: Fix Failing Tests (Day 1)

```
Agent: test-repair
Scope: tests/unit/api/portfolio-intelligence.test.ts
Action: Fix 12 failing tests by adding missing res.json() calls
Validation: npm test -- --project=server --grep="portfolio-intelligence"
```

**Specific Fixes Required**:

```typescript
// Current (broken):
router.post('/api/portfolio/strategies', async (req, res) => {
  const result = await service.create(req.body);
  // Missing response!
});

// Fixed:
router.post('/api/portfolio/strategies', async (req, res) => {
  const result = await service.create(req.body);
  res.status(201).json(result); // ADD THIS
});
```

#### Step 1.2: Standardize Persistence (Day 1-2)

```
Agent: code-reviewer
Scope: All 15 route handlers
Action: Replace in-memory Maps with database-backed service
Decision: Use portfolioIntelligenceService consistently
```

**Persistence Migration**: | Current | Target | Endpoints Affected |
|---------|--------|-------------------| | In-memory Map | PostgreSQL |
scenarios/compare, reserves/backtest, forecasts | | Hardcoded stubs | Real
implementation OR remove | simulate, optimize, validate | | Database | Keep
as-is | strategies, scenarios CRUD |

#### Step 1.3: Initialize Storage (Day 2)

```typescript
// server/app.ts or server/server.ts - Add initialization:
app.locals.portfolioStorage = {
  strategies: new Map(),
  scenarios: new Map(),
  comparisons: new Map(),
  backtests: new Map(),
};
```

#### Step 1.4: Register Route (Day 2)

```typescript
// server/routes.ts - Add registration:
const portfolioIntelligenceRoutes = await import(
  './routes/portfolio-intelligence.js'
);
app.use('/api/portfolio', portfolioIntelligenceRoutes.default);
```

#### Step 1.5: Integration Testing (Day 3)

```
Agent: test-automator
Scope: Create integration tests for all 15 endpoints
Validation: POST/GET cycles with real database
```

### Risk Mitigation

| Risk                         | Mitigation                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database schema missing      | Verify tables exist: fundStrategyModels, portfolioScenarios, reserveAllocationStrategies, performanceForecasts, scenarioComparisons, monteCarloSimulations |
| Breaking existing consumers  | Route path `/api/portfolio/*` is new - no existing consumers                                                                                               |
| MVP stubs misleading clients | Document stub endpoints in OpenAPI spec with "MVP" tag                                                                                                     |
| Memory leaks from Maps       | Add TTL cleanup OR migrate all to Redis/PostgreSQL                                                                                                         |

### Acceptance Criteria

- [ ] All 76+ tests pass (64 existing + 12 fixed)
- [ ] 15 endpoints return valid responses
- [ ] No in-memory storage for production data
- [ ] OpenAPI documentation updated
- [ ] Integration tests covering CRUD operations

---

## Phase 2: MEDIUM Priority - Scenario Comparison Approval

### Current State

**File**: `server/routes/scenario-comparison.ts` (283 lines) **Status**: Code
complete, commented out in `routes.ts:767-769`

**Actual Blocker** (from test file comments):

```typescript
// TODO: Re-enable after database migration
// Required tables: scenarios, scenario_cases (EXIST in schema)
// Migration: npm run db:push (requires product approval)
// Blocked by: Feature not yet released to production
```

### Action Required

This is a **business decision**, not a technical task:

#### Option A: Push Migration (Recommended)

1. **Stakeholder Review**: Present feature to product team
2. **Schema Verification**: Tables exist in `shared/schema.ts`
3. **Migration Execution**: `npm run db:push`
4. **Uncomment Route**: Remove comments from `routes.ts:767-769`
5. **Enable Tests**: Remove `describe.skip` from test files

#### Option B: Defer Feature

1. **Document Decision**: Add ADR explaining deferral
2. **Remove Dead Code**: Delete scenario-comparison.ts if not shipping
3. **Update Tests**: Remove skipped tests

### Deliverable

Create decision document for product team:

```markdown
# Scenario Comparison Feature - Release Decision

## Feature Summary

Enables side-by-side comparison of portfolio scenarios with:

- Ephemeral comparisons (Redis cached, 5-min TTL)
- Delta calculations between scenarios
- Visual comparison charts

## Technical Readiness

- [x] Route implementation complete
- [x] Service layer implemented
- [x] Database schema defined
- [ ] Database migration pushed
- [ ] Production testing

## Required Approval

- Product Owner: ****\_\_\_****
- Engineering Lead: ****\_\_\_****
- Date: ****\_\_\_****
```

---

## Phase 3: MEDIUM Priority - Frontend Test Coverage

### Current State

| Metric          | Value |
| --------------- | ----- |
| Total TSX files | 364   |
| Test files      | 9     |
| Coverage        | 2.5%  |
| Test cases      | 94    |

### Target State (per Test Pyramid skill)

| Level             | Current  | Target     | Delta  |
| ----------------- | -------- | ---------- | ------ |
| Unit (components) | 94 tests | 300+ tests | +206   |
| Integration       | 0        | 50 tests   | +50    |
| E2E               | 23       | 30 tests   | +7     |
| Coverage %        | 2.5%     | 20%        | +17.5% |

### Implementation Strategy

#### Step 3.1: Establish Test Infrastructure (Week 1)

**Create shared test utilities**:

```typescript
// tests/unit/test-utils.tsx
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Reusable query client for tests
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

// Wrapper with all providers
export function renderWithProviders(
  ui: React.ReactElement,
  options?: RenderOptions & {
    fundId?: number;
    initialRoute?: string;
  }
) {
  const queryClient = createTestQueryClient();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <FundContext.Provider value={{ fundId: options?.fundId ?? 1 }}>
          {children}
        </FundContext.Provider>
      </QueryClientProvider>
    );
  }

  return { ...render(ui, { wrapper: Wrapper, ...options }), queryClient };
}

// Mock data factories
export const mockFundFactory = (overrides?: Partial<Fund>) => ({
  id: 1,
  name: 'Test Fund I',
  size: 100_000_000,
  vintage: 2024,
  ...overrides,
});

export const mockInvestmentFactory = (overrides?: Partial<Investment>) => ({
  id: 1,
  companyName: 'Test Company',
  stage: 'Series A',
  amount: 5_000_000,
  ...overrides,
});
```

#### Step 3.2: Priority Component Tests (Weeks 2-3)

**Top 10 Components to Test** (from agent analysis):

| Priority | Component            | Est. Tests | Complexity | Week |
| -------- | -------------------- | ---------- | ---------- | ---- |
| 1        | FundBasicsStep       | 15-20      | HIGH       | 2    |
| 2        | InvestmentRoundsStep | 15-20      | HIGH       | 2    |
| 3        | CapitalStructureStep | 15-20      | HIGH       | 2    |
| 4        | investment-editor    | 20-25      | HIGH       | 2-3  |
| 5        | portfolio-table      | 15-20      | MEDIUM     | 3    |
| 6        | ExecutiveDashboard   | 12-15      | MEDIUM     | 3    |
| 7        | ModelingWizard       | 12-15      | MEDIUM     | 3    |
| 8        | ExitRecyclingStep    | 15-20      | HIGH       | 3    |
| 9        | ScenarioComparison   | 12-15      | MEDIUM     | 3    |
| 10       | ReservesTable        | 12-15      | MEDIUM     | 3    |

**Test Pattern for Each Component**:

```typescript
// Example: FundBasicsStep.test.tsx
describe('FundBasicsStep', () => {
  // Rendering tests
  it('renders fund name input');
  it('renders fund size input with currency formatting');
  it('renders vintage year selector');

  // Validation tests
  it('shows error when fund name is empty');
  it('shows error when fund size is negative');
  it('validates vintage year is within range');

  // Interaction tests
  it('updates form state on input change');
  it('calls onNext when form is valid');
  it('disables submit during save');

  // Edge cases
  it('handles network error gracefully');
  it('preserves data on navigation back');
  it('autosaves after debounce period');
});
```

#### Step 3.3: Integration Tests (Week 4)

**Critical Workflows to Test**:

1. Fund Setup Wizard (all steps)
2. Investment CRUD cycle
3. Portfolio filtering and sorting
4. Scenario creation and comparison
5. Reserve allocation workflow

#### Step 3.4: Metrics Dashboard

**Track Progress**:

```bash
# Add to CI pipeline
npm run test:coverage -- --reporter=json > coverage.json
node scripts/check-coverage-threshold.js --min=20
```

### Agent Assignments

| Agent                    | Responsibility                       |
| ------------------------ | ------------------------------------ |
| `test-automator`         | Generate test scaffolding for Top 10 |
| `pr-test-analyzer`       | Review coverage in each PR           |
| `code-reviewer`          | Ensure test quality standards        |
| `playwright-test-author` | E2E tests for critical flows         |

---

## Phase 4: LOW Priority - Metrics Routes

### Current State

**Unregistered metrics routes** (operational, not user-facing):

| File                  | Lines | Purpose               |
| --------------------- | ----- | --------------------- |
| `metrics.ts`          | ~100  | Prometheus metrics    |
| `metrics-endpoint.ts` | ~50   | /metrics endpoint     |
| `metrics-rum.ts`      | ~100  | Real User Monitoring  |
| `metrics-rum-v2.ts`   | ~100  | RUM v2                |
| `readiness.ts`        | ~50   | Kubernetes readiness  |
| `error-budget.ts`     | ~80   | Error budget tracking |

### Implementation

**Simple registration** (2 hours):

```typescript
// server/routes.ts - Add at end of registerRoutes():

// Metrics & Observability (operational routes)
if (process.env.ENABLE_METRICS !== 'false') {
  const metricsRoutes = await import('./routes/metrics.js');
  app.use('/metrics', metricsRoutes.default);

  const metricsEndpoint = await import('./routes/metrics-endpoint.js');
  app.use(metricsEndpoint.default);

  const rumRoutes = await import('./routes/metrics-rum-v2.js');
  app.use('/api/rum', rumRoutes.default);

  const readinessRoutes = await import('./routes/readiness.js');
  app.use(readinessRoutes.default);

  const errorBudgetRoutes = await import('./routes/error-budget.js');
  app.use('/api/error-budget', errorBudgetRoutes.default);
}
```

### Validation

```bash
# After registration:
curl http://localhost:5000/metrics           # Prometheus metrics
curl http://localhost:5000/health/ready      # Kubernetes readiness
curl http://localhost:5000/api/error-budget  # Error budget stats
```

---

## Phase 5: LOW Priority - Reserves Route Cleanup

### Current State

| File              | Lines | Status                | Action   |
| ----------------- | ----- | --------------------- | -------- |
| `reserves.ts`     | 133   | Dead code             | DELETE   |
| `reserves-api.ts` | 668   | Dead code (has tests) | EVALUATE |
| `v1/reserves.ts`  | 111   | ACTIVE                | KEEP     |

### Analysis

- **v1/reserves.ts** is the only active route (registered in `app.ts`)
- **reserves.ts** is a simpler duplicate - safe to delete
- **reserves-api.ts** has better features (auth, approval guards, rate limiting)
  but uses mock engine

### Implementation

#### Option A: Simple Cleanup (Recommended)

```bash
# Delete dead code
rm server/routes/reserves.ts
rm server/routes/reserves-api.ts

# Update any imports
grep -r "reserves.ts\|reserves-api.ts" server/ --include="*.ts"

# Verify tests still pass
npm test -- --project=server --grep="reserves"
```

#### Option B: Feature Migration

If `reserves-api.ts` features are needed:

1. Extract approval guard middleware
2. Extract rate limiting configuration
3. Apply to `v1/reserves.ts`
4. Delete `reserves-api.ts`

### Pre-Cleanup Verification

```bash
# Ensure no imports reference dead files
grep -r "from.*reserves\.ts\|from.*reserves-api\.ts" server/ --include="*.ts"

# Check for API consumers (should be none)
grep -r "/api/reserves" client/src/ --include="*.ts" --include="*.tsx"
```

---

## Dependency Graph

```
Phase 1 (Portfolio Intelligence)
    ├── Fix 12 failing tests
    ├── Standardize persistence
    ├── Initialize storage
    └── Register route
            ↓
Phase 3 (Frontend Tests) ←────────────────┐
    ├── Test utilities setup              │
    ├── Top 10 component tests            │
    └── Integration tests                 │
            ↓                             │
Phase 2 (Scenario Comparison) ────────────┤ (Can run in parallel)
    └── Product approval (external)       │
            ↓                             │
Phase 4 (Metrics Routes) ─────────────────┤
    └── Simple registration               │
            ↓                             │
Phase 5 (Reserves Cleanup) ───────────────┘
    └── Delete dead code
```

---

## Success Metrics

| Metric                 | Current   | Target    | Measurement                   |
| ---------------------- | --------- | --------- | ----------------------------- |
| Registered routes      | 75%       | 95%       | `grep -c "app.use" routes.ts` |
| Frontend test coverage | 2.5%      | 20%       | `npm run test:coverage`       |
| Dead code (reserves)   | 801 lines | 0 lines   | File deletion                 |
| Portfolio endpoints    | 0 active  | 15 active | API inventory                 |
| Failing tests          | 12        | 0         | `npm test`                    |

---

## Risk Register

| Risk                                     | Probability | Impact | Mitigation                     |
| ---------------------------------------- | ----------- | ------ | ------------------------------ |
| Portfolio-intelligence breaks production | LOW         | HIGH   | Feature flag, staged rollout   |
| Scenario-comparison approval delayed     | MEDIUM      | LOW    | Continue with other phases     |
| Test coverage goal not met               | MEDIUM      | MEDIUM | Prioritize critical paths only |
| Reserves cleanup breaks consumers        | LOW         | LOW    | Verify no imports first        |
| Metrics routes expose sensitive data     | LOW         | MEDIUM | Secure /metrics endpoint       |

---

## Appendix A: Agent & Skill Usage

### Agents to Invoke

| Phase | Agent                    | Purpose                                     |
| ----- | ------------------------ | ------------------------------------------- |
| 1     | `test-repair`            | Fix 12 failing portfolio-intelligence tests |
| 1     | `code-reviewer`          | Review persistence standardization          |
| 1     | `schema-drift-checker`   | Verify database tables exist                |
| 3     | `test-automator`         | Generate test scaffolding                   |
| 3     | `pr-test-analyzer`       | Review coverage per PR                      |
| 3     | `playwright-test-author` | Critical E2E flows                          |
| 5     | `code-reviewer`          | Validate cleanup safety                     |

### Skills to Apply

| Phase | Skill                    | Application                    |
| ----- | ------------------------ | ------------------------------ |
| 1     | `api-design-principles`  | Route registration patterns    |
| 1     | `architecture-patterns`  | Clean persistence layer        |
| 3     | `test-pyramid`           | Coverage distribution strategy |
| 3     | `test-fixture-generator` | Mock data factories            |
| All   | `systematic-debugging`   | Issue investigation            |

---

## Appendix B: File References

```
HIGH Priority:
  /server/routes/portfolio-intelligence.ts (unregistered)
  /server/services/portfolio-intelligence-service.ts
  /tests/unit/api/portfolio-intelligence.test.ts
  /server/routes.ts (registration point)

MEDIUM Priority (Scenario):
  /server/routes/scenario-comparison.ts (commented out)
  /tests/integration/scenario-comparison-mvp.test.ts
  /shared/schema.ts (scenarios, scenarioCases tables)

MEDIUM Priority (Tests):
  /client/src/pages/FundBasicsStep.tsx (priority 1)
  /client/src/pages/InvestmentRoundsStep.tsx (priority 2)
  /client/src/pages/CapitalStructureStep.tsx (priority 3)
  /client/src/components/investments/investment-editor.tsx (priority 4)

LOW Priority (Metrics):
  /server/routes/metrics.ts
  /server/routes/metrics-endpoint.ts
  /server/routes/metrics-rum-v2.ts
  /server/routes/readiness.ts
  /server/routes/error-budget.ts

LOW Priority (Cleanup):
  /server/routes/reserves.ts (DELETE)
  /server/routes/reserves-api.ts (DELETE)
  /server/routes/v1/reserves.ts (KEEP)
```

---

## Approval

| Role             | Name | Date | Signature |
| ---------------- | ---- | ---- | --------- |
| Engineering Lead |      |      |           |
| Product Owner    |      |      |           |
| QA Lead          |      |      |           |
