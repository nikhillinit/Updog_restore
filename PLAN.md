# API-Engine Integration Project (Revised Plan)

## Executive Summary

This plan corrects significant oversights in the original API-Engine Integration proposal. The primary finding is that **three routes already exist** with boundary violations (ESLint disabled), and the real work involves fixing these violations plus creating only **four new routes**.

**Corrected Scope:**
- Fix 3 existing routes with boundary violations (not create from scratch)
- Create 4 genuinely missing routes
- Migrate 4 utility files to shared as prerequisites
- Migrate engines in dependency order (easy to hard)
- Add full middleware stack to all routes
- Migrate 13 test files alongside engines

**Not In Scope (from original plan):**
- Creating `/api/reserves/:fundId` - already exists at server/routes.ts:604
- Creating `/api/pacing/summary` - already exists at server/routes.ts:680
- Creating `/api/cohorts/analysis` - already exists at server/routes.ts:718

---

## Current State Analysis

### Existing Routes with Boundary Violations

The following routes exist in `server/routes.ts` but import directly from client code with ESLint disabled:

```typescript
// Lines 16-23 in server/routes.ts
// TODO: Issue #309 - Move core engines to shared package
// eslint-disable-next-line no-restricted-imports
import { generateReserveSummary } from '../client/src/core/reserves/ReserveEngine.js';
// eslint-disable-next-line no-restricted-imports
import { generatePacingSummary } from '../client/src/core/pacing/PacingEngine.js';
// eslint-disable-next-line no-restricted-imports
import { generateCohortSummary } from '../client/src/core/cohorts/CohortEngine.js';
```

**Route Locations:**

| Route | Line | Current State |
|-------|------|---------------|
| `GET /api/reserves/:fundId` | 604 | Imports from client, loads fixture data |
| `GET /api/pacing/summary` | 680 | Imports from client, uses query params |
| `GET /api/cohorts/analysis` | 718 | Imports from client, scaffold with defaults |

### Missing Middleware on Existing Routes

Current routes lack production-grade middleware:
- No authentication (`requireAuth()`)
- No authorization (`requireFundAccess()`)
- No rate limiting (tiered configs available in `server/middleware/rateLimits.ts`)
- No request validation beyond basic type coercion
- No caching (Redis + memory fallback available in `server/cache/index.ts`)
- No idempotency (available in `server/middleware/idempotency.ts`)

### Routes That Are Actually Missing

Only these four routes need to be created:

| Route | Engine | Priority |
|-------|--------|----------|
| `POST /api/moic/calculate` | MOICCalculator | HIGH |
| `GET /api/liquidity/forecast/:fundId` | LiquidityEngine | HIGH |
| `POST /api/capital-allocation/calculate` | CapitalAllocationEngine | HIGH |
| `POST /api/graduation/project` | GraduationRateEngine | MEDIUM |

### Duplicate Engine Issue

Two DeterministicReserveEngine implementations exist:
- `client/src/core/reserves/DeterministicReserveEngine.ts` (960 lines)
- `shared/core/reserves/DeterministicReserveEngine.ts` (copy)

**Decision:** Use shared version and deprecate client version.

---

## Phase 0: Prerequisites (Utility Extraction)

Before any engine migration, these utilities MUST move to `shared/`:

### 0.1 Array Safety Utilities

**Source:** `client/src/utils/array-safety.ts`
**Target:** `shared/utils/array-safety.ts`
**Used By:** CohortEngine, PacingEngine, ReserveEngine

```typescript
// Functions to migrate
export const safeArray = <T>(arr?: T[] | null): T[] => ...
export const forEach = <T>(...) => ...
export const map = <T, U>(...) => ...
export const filter = <T>(...) => ...
export const reduce = <T, U>(...) => ...
```

### 0.2 isDefined Type Guard

**Source:** `client/src/lib/isDefined.ts`
**Target:** `shared/utils/isDefined.ts`
**Used By:** LiquidityEngine

```typescript
export function isDefined<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined;
}
```

### 0.3 Environment-Aware Logger

**Source:** `client/src/lib/logger.ts`
**Issue:** Browser-specific (uses `import.meta.env`, `window.location`)
**Used By:** DeterministicReserveEngine
**Solution:** Create isomorphic version in `shared/utils/logger.ts`

### 0.4 Performance Monitor Abstraction

**Source:** `client/src/lib/performance-monitor.ts`
**Issue:** Browser-specific (uses `PerformanceObserver`, `navigator.sendBeacon`)
**Used By:** DeterministicReserveEngine
**Solution:** Create abstract interface in `shared/utils/performance-monitor.ts`

### Phase 0 Verification

```bash
npm run build        # Verify shared exports correctly
npm test -- --project=server  # Verify server can import from shared
npm test -- --project=client  # Verify client still works
```

---

## Phase 1: Fix Existing Routes (Boundary Violations + Middleware)

### 1.1 Migrate ReserveEngine to Shared

**Current Location:** `client/src/core/reserves/ReserveEngine.ts`
**Target Location:** `shared/core/reserves/ReserveEngine.ts`
**Lines:** 190

**Dependencies to Update:**
```typescript
// Before (client)
import { map, reduce } from '@/utils/array-safety';

// After (shared)
import { map, reduce } from '../../utils/array-safety';
```

### 1.2 Update Reserve Route with Full Middleware Stack

**File:** `server/routes.ts` line 604

**Before:**
```typescript
// eslint-disable-next-line no-restricted-imports
import { generateReserveSummary } from '../client/src/core/reserves/ReserveEngine.js';

app.get('/api/reserves/:fundId', async (req, res) => {
  // No auth, no validation, loads fixture data
});
```

**After:**
```typescript
import { generateReserveSummary } from '@shared/core/reserves/ReserveEngine';
import { requireAuth, requireFundAccess } from './lib/auth/jwt';
import { validateRequest } from './middleware/validation';
import { rateLimiters } from './middleware/rateLimits';
import { getCache } from './cache';

const ReserveParamsSchema = z.object({
  fundId: z.string().regex(/^\d+$/).transform(Number),
});

app.get('/api/reserves/:fundId',
  rateLimiters.api,
  requireAuth(),
  requireFundAccess,
  validateRequest({ params: ReserveParamsSchema }),
  async (req, res, next) => {
    try {
      const { fundId } = req.params;
      const cache = await getCache();
      const cacheKey = `reserves:${fundId}`;

      const cached = await cache.get(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }

      const portfolio = await storage.getPortfolioForReserves(fundId);
      const summary = generateReserveSummary(fundId, portfolio);

      await cache.set(cacheKey, JSON.stringify(summary), 300);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  }
);
```

### 1.3 Migrate PacingEngine and Update Route

**Current Location:** `client/src/core/pacing/PacingEngine.ts`
**Target Location:** `shared/core/pacing/PacingEngine.ts`
**Lines:** 162

### 1.4 Migrate CohortEngine and Update Route

**Current Location:** `client/src/core/cohorts/CohortEngine.ts`
**Target Location:** `shared/core/cohorts/CohortEngine.ts`
**Lines:** 252

---

## Phase 2: Easy Engine Migrations

Engines with minimal dependencies, ordered by complexity:

### 2.1 MOICCalculator (Complexity: 2/10)

**Source:** `client/src/core/moic/MOICCalculator.ts`
**Target:** `shared/core/moic/MOICCalculator.ts`
**Lines:** 522
**Dependencies:** Only `decimal.js` (already in server dependencies)

**Characteristics:**
- Pure static methods
- No client-specific dependencies
- Ideal first migration candidate

**New Route:**
```typescript
app.post('/api/moic/calculate',
  rateLimiters.api,
  requireAuth(),
  validateRequest({ body: MOICInputSchema }),
  async (req, res, next) => {
    const { investments } = req.body;
    const result = MOICCalculator.generatePortfolioSummary(investments);
    res.json(result);
  }
);
```

### 2.2 GraduationRateEngine (Complexity: 3/10)

**Source:** `client/src/core/graduation/GraduationRateEngine.ts`
**Target:** `shared/core/graduation/GraduationRateEngine.ts`
**Lines:** 493
**Dependencies:** `@shared/utils/prng` (already in shared)

**New Route:**
```typescript
app.post('/api/graduation/project',
  rateLimiters.api,
  requireAuth(),
  validateRequest({ body: GraduationInputSchema }),
  async (req, res, next) => {
    const { config, initialCompanies, horizonQuarters } = req.body;
    const engine = new GraduationRateEngine(config);
    const summary = engine.getSummary(initialCompanies, horizonQuarters);
    res.json(summary);
  }
);
```

---

## Phase 3: Create Missing Routes

### 3.1 Liquidity Forecast Route

```typescript
app.get('/api/liquidity/forecast/:fundId',
  rateLimiters.api,
  requireAuth(),
  requireFundAccess,
  validateRequest({
    params: FundIdSchema,
    query: LiquidityQuerySchema
  }),
  async (req, res, next) => {
    const { fundId } = req.params;
    const { months = 12 } = req.query;

    const fund = await storage.getFund(fundId);
    const engine = new LiquidityEngine(fundId, fund.size);

    const position = await storage.getCashPosition(fundId);
    const transactions = await storage.getTransactions(fundId);
    const expenses = await storage.getRecurringExpenses(fundId);

    const forecast = engine.generateLiquidityForecast(
      position, transactions, expenses, months
    );

    res.json(forecast);
  }
);
```

### 3.2 Capital Allocation Calculate Route

```typescript
app.post('/api/capital-allocation/calculate',
  rateLimiters.api,
  requireAuth(),
  validateRequest({ body: CapitalAllocationInputSchema }),
  idempotency({ ttl: 3600 }),
  async (req, res, next) => {
    const normalized = adaptTruthCaseInput(req.body);
    const result = calculateCapitalAllocation(normalized);
    res.json(result);
  }
);
```

---

## Phase 4: Complex Engine Migrations

### 4.1 LiquidityEngine (Complexity: 7/10)

**Source:** `client/src/core/LiquidityEngine.ts`
**Target:** `shared/core/liquidity/LiquidityEngine.ts`
**Lines:** 1007

**Challenges:**
- Large file (900+ lines)
- Many internal types (should extract to separate types file)
- Complex cash flow calculations

**Recommended Refactoring:**
1. Extract types to `shared/types/liquidity.ts`
2. Split into smaller modules:
   - `LiquidityEngine.ts` (main class)
   - `cashflow-analysis.ts` (grouping functions)
   - `stress-testing.ts` (stress test methods)
   - `capital-call-optimization.ts` (optimization logic)

### 4.2 CapitalAllocationEngine (Complexity: 6/10)

**Source Directory:** `client/src/core/capitalAllocation/`
**Target Directory:** `shared/core/capitalAllocation/`

**All Files Must Move Together (14 files):**

| File | Purpose |
|------|---------|
| `CapitalAllocationEngine.ts` | Main engine |
| `adapter.ts` | Input normalization |
| `allocateLRM.ts` | Largest Remainder Method |
| `cohorts.ts` | Cohort handling |
| `invariants.ts` | Conservation checks |
| `pacing.ts` | Pacing integration |
| `periodLoop.ts` | Period iteration |
| `periodLoopEngine.ts` | Engine wrapper |
| `periods.ts` | Period utilities |
| `rounding.ts` | Cent rounding |
| `sorting.ts` | Canonical ordering |
| `types.ts` | Type definitions |
| `units.ts` | Unit conversions |
| `index.ts` | Exports |

### 4.3 DeterministicReserveEngine (Complexity: 8/10)

**Status:** Already exists in `shared/core/reserves/DeterministicReserveEngine.ts`
**Action:** Update to use shared logger/monitor, deprecate client version

---

## Phase 5: Worker Integration for Expensive Operations

### 5.1 Identify Expensive Operations

Operations requiring background processing:
1. **Monte Carlo Simulations** - Already uses `server/queues/simulation-queue.ts`
2. **Large Capital Allocation** - Cohort calculations with many periods
3. **Liquidity Stress Tests** - Multiple scenario calculations
4. **Batch Reserve Calculations** - Portfolio-wide reserve rebalancing

### 5.2 Async Queue Pattern

```typescript
app.post('/api/capital-allocation/async',
  rateLimiters.simulation,
  requireAuth(),
  validateRequest({ body: CapitalAllocationInputSchema }),
  idempotency(),
  async (req, res) => {
    const { jobId, estimatedWaitMs } = await enqueueCapitalAllocation({
      fundId: req.body.fundId,
      input: adaptTruthCaseInput(req.body),
      userId: req.user.id,
      requestId: req.requestId,
    });

    res.status(202).json({
      jobId,
      statusUrl: `/api/operations/${jobId}`,
      estimatedWaitMs,
    });
  }
);
```

### 5.3 SSE Progress Streaming

```typescript
app.get('/api/operations/:jobId/stream',
  requireAuth(),
  async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');

    const unsubscribe = subscribeToJob(req.params.jobId, {
      onProgress: (event) => res.write(`data: ${JSON.stringify(event)}\n\n`),
      onComplete: (event) => { res.write(`data: ${JSON.stringify(event)}\n\n`); res.end(); },
      onFailed: (event) => { res.write(`data: ${JSON.stringify(event)}\n\n`); res.end(); },
    });

    req.on('close', unsubscribe);
  }
);
```

---

## Complete File Manifest

### Phase 0: Utilities to Create/Move

| Source | Target | Action |
|--------|--------|--------|
| `client/src/utils/array-safety.ts` | `shared/utils/array-safety.ts` | Move |
| `client/src/lib/isDefined.ts` | `shared/utils/isDefined.ts` | Move |
| `client/src/lib/logger.ts` | `shared/utils/logger.ts` | Create isomorphic |
| `client/src/lib/performance-monitor.ts` | `shared/utils/performance-monitor.ts` | Create abstract |

### Phase 1: Engines to Move (Existing Routes)

| Source | Target | Lines |
|--------|--------|-------|
| `client/src/core/reserves/ReserveEngine.ts` | `shared/core/reserves/ReserveEngine.ts` | 190 |
| `client/src/core/pacing/PacingEngine.ts` | `shared/core/pacing/PacingEngine.ts` | 162 |
| `client/src/core/cohorts/CohortEngine.ts` | `shared/core/cohorts/CohortEngine.ts` | 252 |

### Phase 2: Easy Engines to Move (New Routes)

| Source | Target | Lines |
|--------|--------|-------|
| `client/src/core/moic/MOICCalculator.ts` | `shared/core/moic/MOICCalculator.ts` | 522 |
| `client/src/core/graduation/GraduationRateEngine.ts` | `shared/core/graduation/GraduationRateEngine.ts` | 493 |

### Phase 4: Complex Engines

| Source | Target | Files |
|--------|--------|-------|
| `client/src/core/capitalAllocation/*` | `shared/core/capitalAllocation/*` | 14 |
| `client/src/core/LiquidityEngine.ts` | `shared/core/liquidity/LiquidityEngine.ts` | 1 (split to 4) |

### Routes to Modify

| Route | File | Line | Action |
|-------|------|------|--------|
| `GET /api/reserves/:fundId` | `server/routes.ts` | 604 | Fix import + add middleware |
| `GET /api/pacing/summary` | `server/routes.ts` | 680 | Fix import + add middleware |
| `GET /api/cohorts/analysis` | `server/routes.ts` | 718 | Fix import + add middleware |

### Routes to Create

| Route | Method | Handler |
|-------|--------|---------|
| `/api/moic/calculate` | POST | MOICCalculator.generatePortfolioSummary |
| `/api/graduation/project` | POST | GraduationRateEngine.getSummary |
| `/api/liquidity/forecast/:fundId` | GET | LiquidityEngine.generateLiquidityForecast |
| `/api/capital-allocation/calculate` | POST | calculateCapitalAllocation |

---

## Testing Strategy

### Test Files to Migrate (13 Total)

**Capital Allocation Tests (8 files):**
- `client/src/core/capitalAllocation/__tests__/CapitalAllocationEngine.test.ts`
- `client/src/core/capitalAllocation/__tests__/adapter.test.ts`
- `client/src/core/capitalAllocation/__tests__/allocateLRM.test.ts`
- `client/src/core/capitalAllocation/__tests__/invariants.test.ts`
- `client/src/core/capitalAllocation/__tests__/rounding.test.ts`
- `client/src/core/capitalAllocation/__tests__/sorting.test.ts`
- `client/src/core/capitalAllocation/__tests__/truthCaseRunner.test.ts`
- `client/src/core/capitalAllocation/__tests__/units.test.ts`

**Reserves Tests (3 files):**
- `client/src/core/reserves/__tests__/reserves.spec.ts`
- `client/src/core/reserves/__tests__/reserves.property.test.ts`
- `client/src/core/reserves/adapter/__tests__/finalizePayload.spec.ts`

**Selectors Tests (2 files):**
- `client/src/core/selectors/__tests__/fund-kpis.test.ts`
- `client/src/core/selectors/__tests__/fundKpis.test.ts`

### API Integration Tests to Create

```
tests/api/
  reserves.api.test.ts
  pacing.api.test.ts
  cohorts.api.test.ts
  moic.api.test.ts
  graduation.api.test.ts
  liquidity.api.test.ts
  capital-allocation.api.test.ts
```

---

## Middleware Patterns Reference

### Authentication

```typescript
import { requireAuth, requireRole, requireFundAccess } from './lib/auth/jwt';

// Authenticated route
app.get('/api/funds', requireAuth(), ...);

// Role-restricted route
app.post('/api/admin/settings', requireAuth(), requireRole('admin'), ...);

// Fund-scoped route
app.get('/api/reserves/:fundId', requireAuth(), requireFundAccess, ...);
```

### Validation

```typescript
import { validateRequest } from './middleware/validation';

const Schema = z.object({
  body: z.object({ name: z.string().min(1) }),
  params: z.object({ id: z.string().uuid() }),
});

app.post('/api/resource/:id', validateRequest(Schema), handler);
```

### Rate Limiting

```typescript
import { rateLimiters, costBasedRateLimit } from './middleware/rateLimits';

// Standard (100/min)
app.get('/api/funds', rateLimiters.api, ...);

// Simulation (10/hour)
app.post('/api/simulations', rateLimiters.simulation, ...);

// Cost-based
app.post('/api/expensive', costBasedRateLimit(req => req.body.items.length), ...);
```

### Caching

```typescript
import { getCache } from './cache';

const cache = await getCache();
const cached = await cache.get(cacheKey);
if (cached) return res.json(JSON.parse(cached));

const result = await compute();
await cache.set(cacheKey, JSON.stringify(result), 300); // 5 min TTL
```

### Idempotency

```typescript
import { idempotency } from './middleware/idempotency';

app.post('/api/mutations', idempotency({ ttl: 300 }), handler);
// Client sends: Idempotency-Key: abc123
```

---

## Risk Assessment

### High Risk

| Risk | Mitigation |
|------|------------|
| Breaking existing routes during migration | Feature flag: `ENABLE_SHARED_ENGINES=false` to fall back |
| Test failures from path changes | Run tests after each file move, not batch |
| Cache invalidation issues | Clear cache on deploy, monitor cache hit rates |

### Medium Risk

| Risk | Mitigation |
|------|------------|
| Performance regression from shared imports | Benchmark before/after, lazy load heavy modules |
| Type mismatches between client/server | Shared types are source of truth |
| Logger/monitor not isomorphic | Extensive testing in both environments |

### Low Risk

| Risk | Mitigation |
|------|------------|
| Missing auth on new routes | ESLint rule requiring auth middleware |
| Rate limit bypass | Integration tests for rate limiting |
| Queue job failures | Dead letter queue, retry with backoff |

---

## Success Criteria

### Phase 0 Complete When:
- [ ] All 4 utility files exist in `shared/utils/`
- [ ] `npm run build` succeeds with no errors
- [ ] `npm test` passes in both server and client projects

### Phase 1 Complete When:
- [ ] No `eslint-disable` comments for boundary violations in routes.ts
- [ ] All 3 existing routes have full middleware stack
- [ ] All 3 existing routes load data from database (not fixtures)
- [ ] Cache hit/miss headers present on responses

### Phase 2 Complete When:
- [ ] MOICCalculator available at `@shared/core/moic/`
- [ ] GraduationRateEngine available at `@shared/core/graduation/`
- [ ] Both new routes respond correctly
- [ ] Rate limiting active on new routes

### Phase 3 Complete When:
- [ ] All 4 new routes implemented and documented
- [ ] OpenAPI spec updated with new endpoints
- [ ] Integration tests pass for all routes

### Phase 4 Complete When:
- [ ] CapitalAllocationEngine migrated (14 files)
- [ ] LiquidityEngine migrated and refactored
- [ ] Client DeterministicReserveEngine deprecated
- [ ] All 13 test files migrated and passing

### Phase 5 Complete When:
- [ ] Expensive operations use queue pattern
- [ ] SSE progress streaming works for async operations
- [ ] Job status polling endpoint functional

### Overall Project Complete When:
- [ ] Zero ESLint boundary violations
- [ ] All routes have auth + validation + rate limiting
- [ ] Cache layer active for read operations
- [ ] Idempotency active for mutations
- [ ] Test coverage >= 80% for all engines
- [ ] Type checking passes (`npm run check`)
- [ ] All tests pass (`npm test`)
- [ ] Lint passes (`npm run lint`)

---

## Critical Files for Implementation

1. **`server/routes.ts`** - Contains all 3 existing routes with boundary violations (lines 19-23, 604, 680, 718)

2. **`client/src/utils/array-safety.ts`** - Must move to shared first; blocks CohortEngine, PacingEngine, ReserveEngine migrations

3. **`server/middleware/validation.ts`** - Pattern to follow for request validation

4. **`server/lib/auth/jwt.ts`** - Authentication middleware required for all routes

5. **`client/src/core/capitalAllocation/CapitalAllocationEngine.ts`** - Most complex engine (14 files must move together)

---

**Awaiting approval to proceed with Phase 0 implementation.**
