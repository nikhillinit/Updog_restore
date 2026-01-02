# TypeScript Error Resolution Plan - Final 200 Errors

## Executive Summary

| Metric           | Value       |
| ---------------- | ----------- |
| Baseline Errors  | 200         |
| Current Errors   | 200         |
| Target           | 0           |
| Estimated Effort | 16-20 hours |

**Status**: Ready for systematic fix implementation

## Error Distribution

### By Project

| Project | Errors | % of Total |
| ------- | ------ | ---------- |
| Server  | 170    | 85%        |
| Client  | 28     | 14%        |
| Shared  | 1      | 0.5%       |
| Other   | 1      | 0.5%       |

### By Error Type (Primary Categories)

| Error Code           | Count | Description                           | Fix Strategy                        |
| -------------------- | ----- | ------------------------------------- | ----------------------------------- |
| TS2375/TS2379        | ~50   | exactOptionalPropertyTypes violations | Filter undefined or adjust types    |
| TS18048/TS2532       | ~45   | Possibly undefined access             | Optional chaining, type guards      |
| TS2322/TS2345        | ~40   | Type assignment mismatches            | Guards, assertions, type widening   |
| TS2339/TS2353        | ~35   | Schema/property mismatches            | Align schemas, type transformations |
| TS4111/TS7017/TS7053 | ~15   | Index signature issues                | Bracket notation, add signatures    |
| TS6307/TS7016/TS2307 | ~10   | Config/declaration issues             | Update tsconfig, install @types     |
| TS2683               | ~5    | 'this' implicitly any                 | Add type annotations                |

### By File (Top 10 - 62% of all errors)

| File                                                | Errors | Root Cause                             |
| --------------------------------------------------- | ------ | -------------------------------------- |
| server/services/notion-service.ts                   | 34     | Schema type mismatches with Notion API |
| server/services/performance-prediction.ts           | 14     | Missing FundMetrics schema fields      |
| server/services/projected-metrics-calculator.ts     | 17     | PortfolioCompany type alignment        |
| server/services/streaming-monte-carlo-engine.ts     | 10     | FundBaseline schema mismatches         |
| server/lib/flags.ts                                 | 6      | Drizzle query builder types            |
| server/services/time-travel-analytics.ts            | 5      | Return type mismatches                 |
| server/services/construction-forecast-calculator.ts | 5      | JCurve API parameter mismatch          |
| server/services/actual-metrics-calculator.ts        | 5      | Schema field access                    |
| server/routes/scenario-comparison.ts                | 5      | Type parameter inference               |
| server/middleware/idempotency.ts                    | 3      | exactOptionalPropertyTypes             |

## Root Cause Analysis

### 1. exactOptionalPropertyTypes (tsconfig strict mode)

TypeScript's `exactOptionalPropertyTypes` flag treats these as different:

- `{ prop: string | undefined }` - property exists with undefined value
- `{ prop?: string }` - property may not exist

**Common Pattern**:

```typescript
// ERROR: TS2375
const result = {
  name: getValue(), // returns string | undefined
};
// Not assignable to { name?: string }

// FIX OPTION 1: Filter undefined
const result = {
  ...(getValue() !== undefined && { name: getValue() }),
};

// FIX OPTION 2: Adjust return type explicitly
const result: { name?: string } = {};
if (getValue() !== undefined) {
  result.name = getValue();
}
```

### 2. Schema Divergence

Two schema layers with different field definitions:

- `/schema/src/tables.ts` - Storage layer (Drizzle ORM)
- `/shared/schema.ts` - Application layer (extended with computed fields)

**Example**: `PortfolioCompany` in shared/schema.ts has fields like
`initialInvestment`, `ownershipPercent` that the storage layer may not have.

### 3. Nullable vs Undefined

Services returning `undefined` for missing data, but types expect `null`:

```typescript
// ERROR
return { userId: req.user?.id }; // string | undefined
// Expected: { userId: string | null }
```

## Prioritized Fix Batches

### Batch 1: Quick Wins (35 errors) - LOW RISK

**Time**: ~1 hour

Config changes and mechanical fixes:

```
1. npm install -D @types/node-fetch (1 error - TS7016)
2. tsconfig.server.json - add missing includes (2 errors - TS6307)
3. Bracket notation fixes (4 errors - TS4111):
   - server/lib/locks.ts
   - server/queues/simulation-queue.ts
   - server/routes/__tests__/funds.idempotency.spec.ts
4. 'this' type annotations (2 errors - TS2683):
   - server/core/market/score.ts
5. Simple null checks with optional chaining (~26 errors)
```

### Batch 2: Server lib/ Null Safety (30 errors) - LOW RISK

**Time**: ~2 hours

Safe null checks and type guards:

| File                              | Errors | Fix Type                           |
| --------------------------------- | ------ | ---------------------------------- |
| server/lib/flags.ts               | 6      | Optional chaining for state access |
| server/lib/locks.ts               | 3      | globalThis access patterns         |
| server/lib/approvals-guard.ts     | 2      | Approval undefined checks          |
| server/lib/http-preconditions.ts  | 2      | exactOptionalPropertyTypes         |
| server/lib/secure-context.ts      | 1      | partnerId filtering                |
| server/lib/tracing.ts             | 2      | parentId, fields filtering         |
| server/lib/logger.ts              | 1      | transport conditional              |
| server/lib/rateLimitStore.ts      | 1      | store undefined handling           |
| server/lib/redis/cluster.ts       | 1      | url undefined check                |
| server/lib/stage-validation-\*.ts | 2      | Module resolution                  |

### Batch 3: Server middleware/ (15 errors) - LOW RISK

**Time**: ~1.5 hours

Isolated middleware fixes:

| File                                      | Errors | Fix Type                  |
| ----------------------------------------- | ------ | ------------------------- |
| server/middleware/idempotency.ts          | 3      | generateKey function type |
| server/middleware/enhanced-audit.ts       | 3      | Schema field alignment    |
| server/middleware/auditLog.ts             | 2      | null vs undefined         |
| server/middleware/dedupe.ts               | 1      | Request key extraction    |
| server/middleware/engine-guards.ts        | 1      | Iterator type guard       |
| server/middleware/rateLimitDetailed.ts    | 1      | Store type                |
| server/middleware/security.ts             | 1      | Request type assertion    |
| server/middleware/with-rls-transaction.ts | 1      | Tuple spread type         |

### Batch 4: Client lib/ (28 errors) - LOW RISK

**Time**: ~2 hours

Client-side null safety (no server impact):

| File                                                   | Errors | Fix Type                 |
| ------------------------------------------------------ | ------ | ------------------------ |
| client/src/core/pacing/PacingEngine.ts                 | 3      | adjustment undefined     |
| client/src/core/reserves/DeterministicReserveEngine.ts | 3      | MOICCalculation guards   |
| client/src/lib/capital-calculations.ts                 | 2      | Object undefined         |
| client/src/lib/fund-calc.ts                            | 2      | Exit type, Decimal       |
| client/src/lib/validation\*.ts                         | 5      | String undefined         |
| client/src/lib/wizard-\*.ts                            | 5      | Machine imports, schemas |
| client/src/lib/xirr.ts                                 | 2      | Date string params       |
| Other client/src/lib files                             | 6      | Various undefined checks |

### Batch 5: Server Services - Schema Alignment (70 errors) - HIGH RISK

**Time**: ~6 hours

**WARNING**: These changes touch core business logic. Requires careful testing.

#### notion-service.ts (34 errors)

Primary issues:

- Notion API response types vs expected types
- Database mapping field mismatches
- Encrypted token type handling

Strategy:

1. Create proper Notion API response types
2. Add runtime validation for API responses
3. Use type guards for database operations

#### performance-prediction.ts (14 errors)

Primary issues:

- FundMetrics field access (missing fields)
- Undefined array access in time series

Strategy:

1. Add proper type guards for metrics access
2. Use optional chaining for array access
3. Add fallback values for missing metrics

#### projected-metrics-calculator.ts (17 errors)

Primary issues:

- PortfolioCompany missing: initialInvestment, ownershipPercent
- Engine input type mismatches

Strategy:

1. Create adapter function to transform Company types
2. Add computed field defaults
3. Validate inputs before engine calls

#### streaming-monte-carlo-engine.ts (10 errors)

Primary issues:

- Map/pool access patterns
- Schema type assertions

Strategy:

1. Add proper Map access guards
2. Type narrow schema responses

#### Other services (22 errors total)

- time-travel-analytics.ts (5)
- construction-forecast-calculator.ts (5)
- actual-metrics-calculator.ts (5)
- metrics-aggregator.ts (4)
- comparison-service.ts, power-law-distribution.ts,
  portfolio-performance-predictor.ts (3)

### Batch 6: Infrastructure (22 errors) - MEDIUM RISK

**Time**: ~3 hours

| File                                 | Errors | Fix Type                          |
| ------------------------------------ | ------ | --------------------------------- |
| server/db/pg-circuit.ts              | 3      | Generic constraints, error typing |
| server/db/redis-factory.ts           | 3      | Sentinel config types             |
| server/db.ts                         | 1      | Drizzle config typing             |
| server/db/index.ts                   | 1      | Export resolution                 |
| server/routes/scenario-comparison.ts | 5      | Type inference                    |
| server/routes/flags.ts               | 2      | User type checks                  |
| server/routes/health.ts              | 1      | Storage query typing              |
| server/routes/error-budget.ts        | 1      | String undefined                  |
| server/agents/\*                     | 4      | Error type extensions             |
| server/otel.ts                       | 1      | URL config                        |
| server/observability/sentry.ts       | 1      | ErrorEvent export                 |

## Execution Strategy

### Recommended Order

```
Week 1, Day 1-2:
  - Batch 1: Quick Wins (35 errors)
  - Batch 2: Server lib/ (30 errors)

Week 1, Day 3:
  - Batch 3: Server middleware/ (15 errors)
  - Batch 4: Client lib/ (28 errors)

Week 1, Day 4-5:
  - Batch 5: Server Services (70 errors)

Week 2, Day 1:
  - Batch 6: Infrastructure (22 errors)
  - Final testing and validation
```

### Testing Protocol

After each batch:

1. `npm run baseline:check` - Verify error count reduction
2. `npm test -- --project=server` - Server tests
3. `npm test -- --project=client` - Client tests
4. `npm run build` - Full build verification
5. Manual smoke test of affected endpoints

### Rollback Strategy

If batch introduces runtime errors:

1. `git stash` current changes
2. Revert to last working state
3. Isolate problematic fix
4. Apply more conservative fix

## Existing Utilities (LEVERAGE THESE)

The codebase already has type-safety utilities that can accelerate fixes:

### 1. `shared/utils/type-safety.ts`

```typescript
import {
  optionalProp,
  optionalProps,
  isDefined,
  filterDefined,
  withDefault,
  safeString,
} from '@shared/utils/type-safety';

// For single optional property (TS2375 fix)
return { required: 'value', ...optionalProp('name', maybeValue) };

// For multiple optional properties
return { required: 'value', ...optionalProps({ opt1, opt2, opt3 }) };

// Type guard for undefined checks
if (isDefined(value)) {
  /* value is T, not T | undefined */
}

// Filter undefined from arrays
const clean = filterDefined([item1, item2, maybeItem3]);
```

### 2. `client/src/lib/ts/spreadIfDefined.ts`

```typescript
import { spreadIfDefined } from '@/lib/ts/spreadIfDefined';

// For component props (JSX)
<Input {...spreadIfDefined("error", errorMessage)} />

// For object construction
return { required, ...spreadIfDefined('optional', maybeValue) };
```

### 3. `shared/type-safety-utils.ts`

```typescript
import {
  toSafeNumber,
  isSafeNumber,
  SafeArithmetic,
} from '@shared/type-safety-utils';

// Safe number conversion
const num = toSafeNumber(maybeValue, 0); // returns 0 if invalid

// Type guard for numbers
if (isSafeNumber(value)) {
  /* value is number */
}

// Safe arithmetic with fallbacks
SafeArithmetic.divide(a, b, { allowZero: true });
```

**Recommendation**: Use these utilities instead of writing inline checks. This:

- Reduces code duplication
- Ensures consistent patterns
- Makes future refactoring easier
- Already tested and proven

## Technical Patterns

### Pattern 1: Filtering undefined from objects (USE `optionalProp` UTILITY)

```typescript
// Before (TS2375 error)
return { name: value }; // value is string | undefined

// After - Using existing utility (PREFERRED)
import { optionalProp } from '@shared/utils/type-safety';
return { ...optionalProp('name', value) };

// After - Manual (if utility not importable)
return {
  ...(value !== undefined && { name: value }),
};

// For multiple optional fields - Using utility
import { optionalProps } from '@shared/utils/type-safety';
return { required: 'value', ...optionalProps({ optional1, optional2 }) };
```

### Pattern 2: Type guards for schema access

```typescript
// Before (TS2339 error)
const val = company.initialInvestment; // Property doesn't exist

// After - type guard function
function hasInitialInvestment(
  c: PortfolioCompany
): c is PortfolioCompany & { initialInvestment: number } {
  return 'initialInvestment' in c && typeof c.initialInvestment === 'number';
}

if (hasInitialInvestment(company)) {
  const val = company.initialInvestment; // Now typed
}
```

### Pattern 3: Bracket notation for index signatures

```typescript
// Before (TS4111 error)
const val = obj.property; // Property comes from index signature

// After
const val = obj['property'];
```

### Pattern 4: Optional chaining cascade

```typescript
// Before (TS18048 error)
const val = state.flags.enabled; // state possibly undefined

// After
const val = state?.flags?.enabled ?? false;
```

## Success Criteria

| Metric          | Requirement            |
| --------------- | ---------------------- |
| Baseline Errors | 0                      |
| Test Suite      | All pass               |
| Build           | Success                |
| Runtime Errors  | None introduced        |
| Type Coverage   | Maintained or improved |

## Commands Reference

```bash
# Check current error state
npm run baseline:check

# Save baseline after fixes
npm run baseline:save

# Run all tests
npm test

# Run server tests only
npm test -- --project=server

# Run client tests only
npm test -- --project=client

# Type check only (raw tsc)
npx tsc --noEmit -p tsconfig.server.json

# Build verification
npm run build
```

## Optimization Opportunities

### Parallel Fix Execution

Files within the same batch can be fixed in parallel since they have no
dependencies:

| Parallel Group | Files                                                     | Estimated Speedup |
| -------------- | --------------------------------------------------------- | ----------------- |
| lib-group-1    | flags.ts, locks.ts, logger.ts                             | 3x                |
| lib-group-2    | tracing.ts, secure-context.ts, rateLimitStore.ts          | 3x                |
| middleware-all | idempotency.ts, enhanced-audit.ts, dedupe.ts, security.ts | 4x                |
| client-core    | PacingEngine.ts, DeterministicReserveEngine.ts            | 2x                |
| client-lib     | All client/src/lib files                                  | 10x               |

### High-Impact Single Fixes

These single changes could resolve multiple errors:

1. **Add `@types/node-fetch`** (1 change, 2 errors fixed)

   ```bash
   npm install -D @types/node-fetch
   ```

2. **Create shared `PortfolioCompanyWithComputed` type** (1 type, ~15 errors
   fixed)
   - Fixes projected-metrics-calculator.ts property errors
   - Fixes actual-metrics-calculator.ts property errors
   - Add to `shared/types/portfolio.ts`

3. **Update `shared/utils/type-safety.ts` exports** (1 change, ~50 errors
   easier)
   - Re-export from `@shared/` for easier imports
   - All exactOptionalPropertyTypes fixes become one-liners

### Schema Alignment Strategy

Instead of fixing 35 schema-related errors individually, consider:

1. **Create adapter types** in `shared/types/adapters.ts`:

   ```typescript
   // Transform storage layer to application layer
   export type PortfolioCompanyApp = PortfolioCompanyStorage & {
     initialInvestment: number;
     ownershipPercent: number;
   };

   export function toAppCompany(
     storage: PortfolioCompanyStorage
   ): PortfolioCompanyApp;
   ```

2. **Centralize transformation** in service layer
3. **Fix once, apply everywhere**

### Time Estimate Refinement

With utilities and parallelization:

| Batch     | Original       | Optimized      | Savings |
| --------- | -------------- | -------------- | ------- |
| 1         | 1 hour         | 30 min         | 50%     |
| 2         | 2 hours        | 1 hour         | 50%     |
| 3         | 1.5 hours      | 45 min         | 50%     |
| 4         | 2 hours        | 1 hour         | 50%     |
| 5         | 6 hours        | 4 hours        | 33%     |
| 6         | 3 hours        | 2 hours        | 33%     |
| **Total** | **15.5 hours** | **9.25 hours** | **40%** |

## Appendix: Full Error List by File

<details>
<summary>Server Errors (170)</summary>

### server/lib/ (18 errors)

- flags.ts: 6 (TS18048)
- locks.ts: 3 (TS2412, TS7017)
- approvals-guard.ts: 2 (TS18048, TS2375)
- http-preconditions.ts: 2 (TS2412)
- tracing.ts: 2 (TS2375, TS2379)
- logger.ts: 1 (TS2769)
- rateLimitStore.ts: 1 (TS2375)
- redis/cluster.ts: 1 (TS2379)
- secure-context.ts: 1 (TS2375)
- stage-validation-mode.ts: 1 (TS2322)
- stage-validation-startup.ts: 1 (TS2307)

### server/middleware/ (13 errors)

- idempotency.ts: 3 (TS2345, TS2379)
- enhanced-audit.ts: 3 (TS2322, TS2769)
- auditLog.ts: 2 (TS2322)
- dedupe.ts: 1 (TS2345)
- engine-guards.ts: 1 (TS2488)
- rateLimitDetailed.ts: 1 (TS2379)
- security.ts: 1 (TS2345)
- with-rls-transaction.ts: 1 (TS2345)

### server/services/ (86 errors)

- notion-service.ts: 34 (TS18046, TS2322, TS2339, TS2353, TS2379, TS2551,
  TS2552, TS2769)
- projected-metrics-calculator.ts: 17 (TS2322, TS2339, TS2353, TS2554)
- performance-prediction.ts: 14 (TS18048, TS2345, TS2375, TS2532, TS2769)
- streaming-monte-carlo-engine.ts: 10 (TS18048, TS2564)
- time-travel-analytics.ts: 5 (TS2322, TS2375)
- actual-metrics-calculator.ts: 5 (TS2339, TS2345)
- construction-forecast-calculator.ts: 5 (TS2322, TS2339, TS2554)
- metrics-aggregator.ts: 4 (TS2339, TS2345)
- ai-orchestrator.ts: 1 (TS6307)
- comparison-service.ts: 1 (TS2375)
- power-law-distribution.ts: 2 (TS2322, TS2412)
- portfolio-performance-predictor.ts: 1 (TS2375)

### server/db/ (8 errors)

- pg-circuit.ts: 3 (TS2344, TS2379, TS2538)
- redis-factory.ts: 3 (TS2345, TS2375)
- db.ts: 1 (TS2345)
- index.ts: 1 (TS2459)

### server/routes/ (11 errors)

- scenario-comparison.ts: 5 (TS2345, TS7006)
- flags.ts: 2 (TS18048, TS2345)
- health.ts: 1 (TS7053)
- error-budget.ts: 1 (TS2345)
- compass/routes.ts: 1 (TS2322)

### server/other (34 errors)

- agents/cancel.ts: 2 (TS2353)
- agents/stream.ts: 2 (TS2345, TS2353)
- core/market/score.ts: 2 (TS2683)
- core/reserves/adapter.ts: 1 (TS2375)
- core/reserves/mlClient.ts: 2 (TS7016, TS2375)
- examples/streaming-monte-carlo-examples.ts: 3 (TS2345, TS2532)
- infra/circuit-breaker/CircuitBreaker.ts: 1 (TS2532)
- metrics/lpBusinessMetrics.ts: 2 (TS7053)
- observability/sentry.ts: 1 (TS2694)
- otel.ts: 1 (TS2379)
- providers.ts: 1 (TS2375)
- queues/simulation-queue.ts: 3 (TS4111)
- routes/**tests**/funds.idempotency.spec.ts: 1 (TS4111)
- server.ts: 1 (TS2379)
- websocket/portfolio-metrics.ts: 2 (TS18046, TS2339)

</details>

<details>
<summary>Client Errors (28)</summary>

### client/src/core/ (6 errors)

- pacing/PacingEngine.ts: 3 (TS18048)
- reserves/DeterministicReserveEngine.ts: 3 (TS18048, TS2345)

### client/src/lib/ (20 errors)

- capital-calculations.ts: 2 (TS2532)
- fund-calc.ts: 2 (TS2322)
- validation.ts: 2 (TS2322, TS2538)
- validation-helpers.ts: 2 (TS2322)
- wizard-calculations.ts: 1 (TS6307)
- wizard-reserve-bridge.ts: 1 (TS6307)
- wizard-schemas.ts: 1 (TS2769)
- wizard-types.ts: 1 (TS2322)
- xirr.ts: 2 (TS2345)
- capital-first.ts: 1 (TS2322)
- demo-data.ts: 1 (TS2322)
- inflight.ts: 1 (TS2322)
- nav.ts: 1 (TS2532)
- rollout-orchestrator.ts: 1 (TS2345)
- schema-adapter.ts: 1 (TS2532)

### client/src/other (2 errors)

- **tests**/type-guards.spec.ts: 1 (TS2532)
- utils/array-safety-enhanced.ts: 1 (TS2345)

</details>

<details>
<summary>Other Errors (2)</summary>

- shared/schemas/parse-stage-distribution.ts: 1 (TS2345)
- vite.config.ts: 1 (TS7006)

</details>
