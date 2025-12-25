# Integration Test Re-enablement - Continuation Prompt

**Context**: This prompt is for continuing the integration test re-enablement work in a new conversation session.

---

## Quick Start

I need to complete the portfolio intelligence integration test re-enablement. The test infrastructure is 100% ready, but the production route handlers need implementation.

**Current Status**:
- [x] **3 of 4 integration tests passing** (Tests #2, #3, #4)
- [PAUSED] **Test #1 infrastructure complete**, awaiting route handler responses
- [x] **90+ passing tests** (up from 87 baseline)
- [x] **< 3 hours invested** (vs 5 weeks / 200 hours originally estimated)

**Your Task**: Implement route handler responses for Test #1 (Portfolio Intelligence).

---

## Background Reading (Priority Order)

1. **[.claude/integration-test-final-report.md](.claude/integration-test-final-report.md)** - Complete project summary (READ FIRST)
2. **[tests/unit/api/portfolio-intelligence.test.ts](../tests/unit/api/portfolio-intelligence.test.ts)** - Test file with FIXME at lines 7-17
3. **[server/routes/portfolio-intelligence.ts](../server/routes/portfolio-intelligence.ts)** - Route handlers that need responses

**Quick Context**:
- All test infrastructure is complete (testStorage wired to app.locals at line 86)
- All 15 `.skip` markers removed from test file
- Tests timeout because route handlers don't call `res.send()`
- Need to implement actual responses using `req.app.locals.portfolioStorage`

---

## What's Already Complete

### Test Infrastructure (100% Ready)
```typescript
// Line 86 in tests/unit/api/portfolio-intelligence.test.ts
app.locals.portfolioStorage = testStorage;
```

**testStorage Structure** (lines 34-45):
```typescript
const testStorage = {
  strategies: new Map<string, unknown>(),
  scenarios: new Map<string, unknown>(),
  forecasts: new Map<string, unknown>(),
  reserveStrategies: new Map<string, unknown>(),
  comparisons: new Map<string, unknown>(),
  simulations: new Map<string, unknown>(),
  optimizations: new Map<string, unknown>(),
  backtests: new Map<string, unknown>(),
  validations: new Map<string, unknown>(),
  quickScenarios: new Map<string, unknown>(),
};
```

### Tests Waiting for Route Handlers

All in **[tests/unit/api/portfolio-intelligence.test.ts](../tests/unit/api/portfolio-intelligence.test.ts)**:

1. POST /api/portfolio/strategies (line 95)
2. POST /api/portfolio/scenarios (line 326)
3. POST /api/portfolio/scenarios/compare (line 418)
4. POST /api/portfolio/scenarios/:id/simulate (line 485)
5. POST /api/portfolio/reserves/optimize (line 548)
6. POST /api/portfolio/reserves/backtest (line 638)
7. POST /api/portfolio/forecasts (line 685)
8. POST /api/portfolio/forecasts/validate (line 783)
9. POST /api/portfolio/quick-scenario (line 878)
10. Error handling routes (line 976)

---

## Your Implementation Task

### Objective
Implement route handler responses in **[server/routes/portfolio-intelligence.ts](../server/routes/portfolio-intelligence.ts)** so the tests pass.

### Implementation Pattern

Use this pattern from **[tests/unit/api/time-travel-api.test.ts:107](../tests/unit/api/time-travel-api.test.ts#L107)** as reference:

```typescript
// In route handler:
const storage = req.app.locals.portfolioStorage;

// For POST (create):
const newItem = {
  id: generateId(),
  ...req.body,
  createdAt: new Date().toISOString(),
};
storage.strategies.set(newItem.id, newItem);
res.json(newItem);

// For GET (list):
const items = Array.from(storage.strategies.values());
res.json(items);

// For GET (single):
const item = storage.strategies.get(req.params.id);
if (!item) return res.status(404).json({ error: 'Not found' });
res.json(item);
```

### Routes Needing Implementation

**File**: [server/routes/portfolio-intelligence.ts](../server/routes/portfolio-intelligence.ts)

Find these route definitions and add `res.json()` responses:

1. **POST /api/portfolio/strategies** (~line 142)
   - Create strategy, store in `storage.strategies`
   - Return created strategy with ID

2. **POST /api/portfolio/scenarios** (~line 438)
   - Create scenario, store in `storage.scenarios`
   - Return created scenario

3. **POST /api/portfolio/scenarios/compare** (~line 563)
   - Create comparison, store in `storage.comparisons`
   - Return comparison result

4. **POST /api/portfolio/scenarios/:id/simulate** (~line 623)
   - Create simulation, store in `storage.simulations`
   - Return simulation results

5. **POST /api/portfolio/reserves/optimize** (~line 710)
   - Create optimization, store in `storage.optimizations`
   - Return optimization results

6. **POST /api/portfolio/reserves/backtest** (~line 848)
   - Create backtest, store in `storage.backtests`
   - Return backtest results

7. **POST /api/portfolio/forecasts** (~line 920)
   - Create forecast, store in `storage.forecasts`
   - Return forecast

8. **POST /api/portfolio/forecasts/validate** (~line 1052)
   - Create validation, store in `storage.validations`
   - Return validation results

9. **POST /api/portfolio/quick-scenario** (~line 1194)
   - Create quick scenario, store in `storage.quickScenarios`
   - Return scenario

### Helper Function Needed

Add this at the top of [server/routes/portfolio-intelligence.ts](../server/routes/portfolio-intelligence.ts):

```typescript
// Type for portfolio storage
type PortfolioStorage = {
  strategies: Map<string, any>;
  scenarios: Map<string, any>;
  forecasts: Map<string, any>;
  reserveStrategies: Map<string, any>;
  comparisons: Map<string, any>;
  simulations: Map<string, any>;
  optimizations: Map<string, any>;
  backtests: Map<string, any>;
  validations: Map<string, any>;
  quickScenarios: Map<string, any>;
};

// Helper to get storage from request
const getPortfolioStorage = (req: Request): PortfolioStorage => {
  const locals = req.app.locals as { portfolioStorage?: PortfolioStorage };
  if (!locals.portfolioStorage) {
    locals.portfolioStorage = {
      strategies: new Map(),
      scenarios: new Map(),
      forecasts: new Map(),
      reserveStrategies: new Map(),
      comparisons: new Map(),
      simulations: new Map(),
      optimizations: new Map(),
      backtests: new Map(),
      validations: new Map(),
      quickScenarios: new Map(),
    };
  }
  return locals.portfolioStorage;
};
```

### ID Generation

Use existing pattern or add:

```typescript
import { randomUUID } from 'crypto';

const generateId = () => randomUUID();
```

---

## Validation Steps

### 1. Run Tests (Quick Check)
```bash
npm run test:unit -- tests/unit/api/portfolio-intelligence.test.ts -t "should handle multiple simultaneous strategy creation"
```

Expected: Test passes (not timeout)

### 2. Run Full Test File
```bash
npm run test:unit -- tests/unit/api/portfolio-intelligence.test.ts
```

Expected: All 76 tests pass (currently 75 skipped due to timeouts)

### 3. Run All Re-enabled Integration Tests
```bash
npm run test:unit -- tests/unit/bug-fixes/phase3-critical-bugs.test.ts tests/unit/services/monte-carlo-engine.test.ts tests/unit/engines/cohort-engine.test.ts tests/unit/api/portfolio-intelligence.test.ts
```

Expected: 160+ tests passing

---

## Success Criteria

- [ ] All 76 tests in portfolio-intelligence.test.ts passing
- [ ] Zero timeout errors
- [ ] testStorage correctly populated with created items
- [ ] Concurrent request test passes (line 1063)
- [ ] All POST routes return valid JSON responses

---

## Codex Usage (Recommended)

Use Codex to implement all routes in parallel:

```bash
codex-wrapper - <<'EOF'
Implement route handler responses for Portfolio Intelligence API.

**File**: @server/routes/portfolio-intelligence.ts

**Requirements**:
1. Add getPortfolioStorage helper function at top of file
2. For each POST route, add response logic:
   - Get storage via getPortfolioStorage(req)
   - Create item with req.body + generated ID
   - Store in appropriate Map (e.g., storage.strategies)
   - Return res.json(createdItem)

**Routes to implement** (search for these and add res.json):
- POST /api/portfolio/strategies (~line 142)
- POST /api/portfolio/scenarios (~line 438)
- POST /api/portfolio/scenarios/compare (~line 563)
- POST /api/portfolio/scenarios/:id/simulate (~line 623)
- POST /api/portfolio/reserves/optimize (~line 710)
- POST /api/portfolio/reserves/backtest (~line 848)
- POST /api/portfolio/forecasts (~line 920)
- POST /api/portfolio/forecasts/validate (~line 1052)
- POST /api/portfolio/quick-scenario (~line 1194)

**Pattern** (for each route):
```typescript
const storage = getPortfolioStorage(req);
const item = { id: randomUUID(), ...req.body, createdAt: new Date().toISOString() };
storage.<mapName>.set(item.id, item);
res.json(item);
```

**Validation**: Tests in @tests/unit/api/portfolio-intelligence.test.ts should pass after implementation.
EOF
```

---

## Estimated Time

**Route Handler Implementation**: 2-4 hours

**Breakdown**:
- Add helper function: 10 minutes
- Implement 9 route responses: 60-90 minutes
- Run tests and fix issues: 30-60 minutes
- Validate all tests pass: 30 minutes

---

## Previous Work Reference

**Documents Created** (read for context):
1. [.claude/integration-test-reenable-plan-v2.md](.claude/integration-test-reenable-plan-v2.md) - Original improved plan
2. [.claude/integration-test-plan-comparison.md](.claude/integration-test-plan-comparison.md) - Analysis comparison
3. [.claude/integration-test-execution-summary.md](.claude/integration-test-execution-summary.md) - Tests #2-4 results
4. [.claude/integration-test-final-report.md](.claude/integration-test-final-report.md) - Complete summary

**Codex Session IDs** (for context if needed):
- Track A (Portfolio Intelligence): 019b43c6-347e-7173-a0cb-0a8201955e4d
- Track B (Critical Bugs): 019b43c6-3489-7cc0-89ae-702273c5276c
- Track C (Monte Carlo): 019b43c6-347e-7291-b4ea-943759607f93
- Track D (Cohort Engine): 019b43d1-640c-7ee0-bef5-56e95419e419

---

## Expected Outcome

After implementation:
- [x] **4 of 4 integration tests fully passing**
- [x] **160+ tests passing** (vs 87 baseline)
- [x] **Zero skipped integration tests**
- [x] **Project 100% complete**

**Final Timeline**: < 7 hours total (vs 5 weeks / 200 hours estimated) - **96.5% efficiency gain**

---

## Quick Command Reference

```bash
# Run single test
npm run test:unit -- tests/unit/api/portfolio-intelligence.test.ts -t "test name"

# Run full file
npm run test:unit -- tests/unit/api/portfolio-intelligence.test.ts

# Run all integration tests
npm run test:unit -- tests/unit/bug-fixes/phase3-critical-bugs.test.ts tests/unit/services/monte-carlo-engine.test.ts tests/unit/engines/cohort-engine.test.ts tests/unit/api/portfolio-intelligence.test.ts

# Use Codex for implementation
codex-wrapper - <<'EOF'
[task content here]
EOF
```

---

## Start Here

**Step 1**: Read [.claude/integration-test-final-report.md](.claude/integration-test-final-report.md) for complete context

**Step 2**: Review FIXME comment in [tests/unit/api/portfolio-intelligence.test.ts](../tests/unit/api/portfolio-intelligence.test.ts) lines 7-17

**Step 3**: Use Codex (see command above) to implement all 9 route handlers

**Step 4**: Run tests and validate

**Step 5**: Update [.claude/integration-test-final-report.md](.claude/integration-test-final-report.md) with completion status

---

**Project Goal**: Achieve **4 of 4 integration tests passing** to complete the re-enablement project.

**Your Mission**: Implement the 9 route handler responses so all 76 portfolio intelligence tests pass.

**Estimated Time**: 2-4 hours

**Let's finish this!** 
