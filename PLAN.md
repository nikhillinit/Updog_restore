# API-Engine Integration Development Plan

## Executive Summary

This plan provides a complete roadmap for wiring all existing engines to their API endpoints. The codebase contains **9 analytics engines**, of which only **2 are properly wired** (Monte Carlo suite and ConstrainedReserveEngine). The remaining **7 engines require API integration**.

---

## 1. Complete Engine Inventory

### Currently WIRED Engines (No Work Needed)

| Engine | Location | API Endpoint | Status |
|--------|----------|--------------|--------|
| **ConstrainedReserveEngine** | `shared/core/reserves/ConstrainedReserveEngine.ts` | `POST /api/v1/reserves/calculate` | COMPLETE |
| **Monte Carlo Suite** | `server/services/monte-carlo-*.ts` | `/api/monte-carlo/*` | COMPLETE |

### Engines Requiring API Integration

| Engine | Location | Needed Endpoint | Priority |
|--------|----------|-----------------|----------|
| **ReserveEngine** (client) | `client/src/core/reserves/ReserveEngine.ts` | `/api/reserves/:fundId` | HIGH |
| **PacingEngine** | `client/src/core/pacing/PacingEngine.ts` | `/api/pacing/*` | HIGH |
| **CohortEngine** | `client/src/core/cohorts/CohortEngine.ts` | `/api/cohorts/*` | MEDIUM |
| **CapitalAllocationEngine** | `client/src/core/capitalAllocation/CapitalAllocationEngine.ts` | `/api/capital-allocation/*` | HIGH |
| **MOICCalculator** | `client/src/core/moic/MOICCalculator.ts` | `/api/moic/*` | MEDIUM |
| **LiquidityEngine** | `client/src/core/LiquidityEngine.ts` | `/api/liquidity/*` | HIGH |
| **DeterministicReserveEngine** | `shared/core/reserves/DeterministicReserveEngine.ts` | `/api/reserves/optimal` | MEDIUM |

---

## 2. Gap Analysis

### Critical Gaps Identified

1. **Client engines live in `client/src/core/`** - Need server-side equivalents in `shared/core/` for API access
2. **Existing hooks expect endpoints that don't exist** - `useReserveData` and `usePacingData` return 404
3. **No MOIC or Cohort API surface** - These engines are isolated to client
4. **LiquidityEngine not connected** - Cashflow routes return mock/stub data

### Endpoints with Mock/Incomplete Data

| Route File | Endpoints | Issue |
|------------|-----------|-------|
| `server/routes/cashflow.ts` | `/api/cashflow/*` | Serves mock data, not LiquidityEngine |
| `server/routes/scenario-analysis.ts` | `/api/companies/:id/reserves/optimize` | TODO placeholder, not DeterministicReserveEngine |

---

## 3. Architectural Approach

**Strategy: Move engines to `shared/` directory**

- Copy client engines to `shared/core/`
- Server imports from `shared/`, instantiates engine, returns results
- Client can use API or import directly for offline capability
- Follows existing pattern (ConstrainedReserveEngine is already in `shared/core/`)

---

## 4. Implementation Phases

### Phase 1: Critical Fixes (Broken Hooks) - HIGH PRIORITY

#### 1.1 Create Pacing API Routes

**New File**: `server/routes/pacing.ts`

```typescript
import { Router } from 'express';
import { PacingEngine } from '@shared/core/pacing/PacingEngine';
import { validatePacingInput } from '@shared/schemas/pacing';

export const pacingRouter = Router();

pacingRouter.post('/calculate', (req, res) => {
  const input = validatePacingInput(req.body);
  const result = PacingEngine(input);
  res.json(result);
});

pacingRouter.get('/summary/:fundId', async (req, res) => {
  const summary = generatePacingSummary(req.params.fundId);
  res.json(summary);
});
```

**Files to Modify**:
- `server/routes.ts` - Register pacingRouter
- Move `client/src/core/pacing/PacingEngine.ts` to `shared/core/pacing/PacingEngine.ts`

#### 1.2 Create Reserve Summary Route

**New File**: `server/routes/reserves-summary.ts`

```typescript
import { Router } from 'express';

export const reserveSummaryRouter = Router();

reserveSummaryRouter.get('/:fundId', async (req, res) => {
  const portfolio = await fetchPortfolio(req.params.fundId);
  const summary = generateReserveSummary(req.params.fundId, portfolio);
  res.json(summary);
});
```

---

### Phase 2: High-Value Integrations

#### 2.1 Wire LiquidityEngine to Cashflow Routes

**File to Modify**: `server/routes/cashflow.ts`

Replace mock implementations with actual LiquidityEngine calls:

```typescript
// Before (current mock)
router.get('/forecast/:fundId', (req, res) => {
  res.json({ /* mock */ });
});

// After (wired to engine)
router.get('/forecast/:fundId', async (req, res) => {
  const { fundId } = req.params;
  const fund = await getFund(fundId);
  const engine = new LiquidityEngine(fundId, fund.size);
  const forecast = engine.generateLiquidityForecast(position, transactions, expenses);
  res.json(forecast);
});
```

#### 2.2 Create Capital Allocation API

**New File**: `server/routes/capital-allocation.ts`

```typescript
import { Router } from 'express';
import { calculateCapitalAllocation } from '@shared/core/capitalAllocation/CapitalAllocationEngine';

export const capitalAllocationRouter = Router();

capitalAllocationRouter.post('/calculate', async (req, res) => {
  const normalized = adaptInputFormat(req.body);
  const result = calculateCapitalAllocation(normalized);
  res.json(result);
});
```

#### 2.3 Wire DeterministicReserveEngine

**File to Modify**: `server/routes/scenario-analysis.ts` (lines 533-587)

Replace TODO placeholder with actual engine call:

```typescript
const engine = new DeterministicReserveEngine();
const result = await engine.calculateOptimalReserveAllocation({
  portfolio: companies,
  graduationMatrix: fetchGraduationMatrix(),
  stageStrategies: fetchStageStrategies(),
  availableReserves: fund.reserves,
});
res.json(result);
```

---

### Phase 3: Medium-Priority Engines

#### 3.1 Create MOIC API Routes

**New File**: `server/routes/moic.ts`

```typescript
import { Router } from 'express';
import { MOICCalculator } from '@shared/core/moic/MOICCalculator';

export const moicRouter = Router();

moicRouter.post('/calculate', (req, res) => {
  const { investments } = req.body;
  const summary = MOICCalculator.generatePortfolioSummary(investments);
  res.json(summary);
});

moicRouter.post('/rank', (req, res) => {
  const { investments } = req.body;
  const ranked = MOICCalculator.rankByReservesMOIC(investments);
  res.json(ranked);
});
```

#### 3.2 Create Cohort API Routes

**New File**: `server/routes/cohorts.ts`

```typescript
import { Router } from 'express';
import { generateCohortSummary, compareCohorts } from '@shared/core/cohorts/CohortEngine';

export const cohortRouter = Router();

cohortRouter.post('/analyze', (req, res) => {
  const input = validateCohortInput(req.body);
  const summary = generateCohortSummary(input);
  res.json(summary);
});

cohortRouter.post('/compare', (req, res) => {
  const { cohorts } = req.body;
  const comparison = compareCohorts(cohorts);
  res.json(comparison);
});
```

---

## 5. Complete File Manifest

### New Files to Create

| File | Purpose |
|------|---------|
| `server/routes/pacing.ts` | Pacing engine API |
| `server/routes/cohorts.ts` | Cohort engine API |
| `server/routes/moic.ts` | MOIC calculator API |
| `server/routes/capital-allocation.ts` | Capital Allocation engine API |
| `server/routes/liquidity.ts` | Liquidity engine API |
| `shared/core/pacing/PacingEngine.ts` | Move from client |
| `shared/core/cohorts/CohortEngine.ts` | Move from client |
| `shared/core/moic/MOICCalculator.ts` | Move from client |
| `shared/core/liquidity/LiquidityEngine.ts` | Move from client |

### Files to Modify

| File | Changes |
|------|---------|
| `server/routes.ts` | Register new routers (~5 imports, ~5 app.use() calls) |
| `server/app.ts` | Alternative registration point if routes.ts not used |
| `server/routes/cashflow.ts` | Replace mock with LiquidityEngine calls |
| `server/routes/scenario-analysis.ts` | Wire DeterministicReserveEngine (lines 533-587) |
| `client/src/hooks/use-engine-data.ts` | Verify endpoint URLs match new routes |

---

## 6. Testing Strategy

### New Test Files

```
tests/
  api/
    pacing.test.ts          # Pacing API contract tests
    cohorts.test.ts         # Cohort API contract tests
    moic.test.ts            # MOIC API contract tests
    capital-allocation.test.ts
    liquidity.test.ts
```

### Test Pattern (Follow Existing)

```typescript
describe('Pacing API', () => {
  it('POST /api/pacing/calculate returns valid PacingOutput', async () => {
    const input = {
      fundSize: 100_000_000,
      deploymentQuarter: 1,
      marketCondition: 'neutral'
    };
    const res = await request(app).post('/api/pacing/calculate').send(input);
    expect(res.status).toBe(200);
    expect(res.body).toMatchSchema(PacingOutputSchema);
  });
});
```

### Reference Test Files

- `tests/api/reserves.test.ts` - API test pattern
- `server/services/__tests__/unified-metrics-contract.test.ts` - Contract test pattern

---

## 7. Risk Assessment

### High Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing hooks | Users see 404 errors | Phase 1 priority: Fix useReserveData, usePacingData first |
| Engine behavior differs server vs client | Calculation inconsistencies | Move engines to shared/, single source of truth |
| Performance degradation | Slow API responses | Add caching layer following MetricsAggregator pattern |

### Medium Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Type mismatches | Runtime errors | Use Zod validation at API boundaries |
| Missing error handling | 500 errors exposed | Follow existing error handling patterns |

### Low Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| API versioning issues | Future breaking changes | Use /api/v1/ prefix for new routes |

---

## 8. Implementation Order (Dependency-Aware)

```
Phase 1 (No Dependencies - Start Immediately)
+-- Pacing API routes + move engine to shared/
+-- Reserve Summary API routes

Phase 2 (After Phase 1 patterns established)
+-- Liquidity API (wire to cashflow routes)
+-- Capital Allocation API
+-- DeterministicReserveEngine wiring

Phase 3 (After Phase 2)
+-- MOIC API
+-- Cohort API

Phase 4 (After All APIs)
+-- Comprehensive API tests
+-- Performance testing
+-- Documentation updates
```

---

## 9. Critical Reference Files

1. **`server/routes.ts`** - Central route registration; add new engine routes here
2. **`server/routes/v1/reserves.ts`** - Reference pattern for engine API routes
3. **`client/src/hooks/use-engine-data.ts`** - Contains hooks needing endpoint fixes
4. **`server/routes/cashflow.ts`** - Mock implementations to replace
5. **`server/routes/scenario-analysis.ts`** - TODO placeholder to complete (lines 533-587)

---

## 10. Success Criteria

- [ ] All 7 engines have corresponding API endpoints
- [ ] `useReserveData` and `usePacingData` hooks return 200 status
- [ ] No mock data in production routes
- [ ] All new endpoints have Zod input validation
- [ ] All new endpoints have test coverage
- [ ] Type checking passes (`npm run check`)
- [ ] All tests pass (`npm test`)
- [ ] Lint passes (`npm run lint`)

---

## Approval Required

This plan will create approximately:
- 5 new route files
- 4 engine migrations (client -> shared)
- 5 new test files
- Modifications to 4 existing files

Estimated scope: ~2,000-3,000 lines of new/modified code.

**Awaiting approval to proceed with Phase 1 implementation.**
