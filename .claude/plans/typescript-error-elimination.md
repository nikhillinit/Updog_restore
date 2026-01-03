# TypeScript Error Elimination Plan

## Summary

- **Total Errors**: 37
- **Strategy**: Pattern-based fixes with minimal code changes
- **Priority**: Fix in order of dependency (config → types → implementations)

---

## Phase 1: Config-Level Fixes (5 errors)

### 1.1 Update tsconfig.server.json includes

**Errors**: TS6307 × 3

- `wizard-calculations.ts` imports `@/machines/modeling-wizard.machine.ts`
- `wizard-reserve-bridge.ts` imports `@/adapters/reserves-adapter.ts`
- `ai-orchestrator.ts` imports `tools/ai-review/OrchestratorAdapter.ts`

**Fix**: Add missing directories to `include`:

```json
"include": [
  // ... existing
  "client/src/machines/**/*",
  "client/src/adapters/**/*",
  "tools/ai-review/**/*"
]
```

### 1.2 Fix module exports

**Error**: TS2459 in `server/db/index.ts` - NodePgDatabase not exported **Fix**:
Check pool.ts and ensure proper export

**Error**: TS2307 in `server/lib/stage-validation-startup.ts` - Cannot find
module './db' **Fix**: Correct the import path

---

## Phase 2: Type Definition Updates (6 errors)

### 2.1 ReservePrediction type (TS2375 × 2)

**Files**: `adapter.ts:289`, `mlClient.ts:137` **Issue**: `perRound` assigned
`undefined` but type expects `Record<string, number>`

**Fix Option A** (preferred): Make type optional

```typescript
// In shared/schemas/reserves-schemas.ts or type definition
interface ReservePrediction {
  recommendedReserve: number;
  perRound?: Record<string, number>; // Add ?
  confidence?: { low: number; high: number };
  notes: string[];
}
```

**Fix Option B**: Use empty object fallback

```typescript
perRound: body.prediction.perRound ?? {};
```

### 2.2 Providers type (TS2375)

**File**: `server/providers.ts:85` **Issue**: `rateLimitStore` is
`Store | undefined` but type expects `Store`

**Fix**: Update Providers type to allow undefined

```typescript
interface Providers {
  rateLimitStore?: Store; // Add ?
  // ...
}
```

### 2.3 WeightedSummarySnapshot type (TS2375)

**File**: `server/services/comparison-service.ts:228` **Issue**:
`months_to_exit` is `number | undefined` but expects `number`

**Fix**: Update type or provide default

```typescript
months_to_exit: data.months_to_exit ?? 0;
```

---

## Phase 3: Null Safety Fixes (14 errors)

### 3.1 Add non-null assertions or guards

| File                                         | Line          | Fix                                  |
| -------------------------------------------- | ------------- | ------------------------------------ |
| `agents/stream.ts`                           | 89            | `runId!` or guard at function start  |
| `compass/routes.ts`                          | 52            | `value ?? ''`                        |
| `db/redis-factory.ts`                        | 356           | `url ?? ''`                          |
| `examples/streaming-monte-carlo-examples.ts` | 146, 499, 502 | Add `if (!value) return` guards      |
| `infra/circuit-breaker/CircuitBreaker.ts`    | 128           | `array[index]!` or optional chaining |
| `lib/approvals-guard.ts`                     | 348           | `if (!approval) continue`            |
| `routes/error-budget.ts`                     | 24            | `param ?? ''`                        |

### 3.2 exactOptionalPropertyTypes fixes

| File                              | Line | Fix                             |
| --------------------------------- | ---- | ------------------------------- |
| `lib/redis/cluster.ts`            | 94   | Filter undefined before passing |
| `middleware/rateLimitDetailed.ts` | 17   | `store: store ?? defaultStore`  |
| `server.ts`                       | 210  | Same pattern                    |

### 3.3 Type coercion fixes

| File                                 | Line | Issue            | Fix                  |
| ------------------------------------ | ---- | ---------------- | -------------------- |
| `middleware/security.ts`             | 196  | Request → string | Cast or extract path |
| `middleware/with-rls-transaction.ts` | 88   | Array spread     | Type assertion       |

---

## Phase 4: Schema Alignment (8 errors)

### 4.1 Metrics Aggregator (TS2339, TS2345 × 3)

**File**: `server/services/metrics-aggregator.ts` **Issue**: Query result
missing `isActive`, `establishmentDate`

**Fix**: Update query to include all required fields:

```typescript
const funds = await db
  .select({
    // existing fields...
    isActive: funds.isActive,
    establishmentDate: funds.establishmentDate,
  })
  .from(funds);
```

### 4.2 Actual Metrics Calculator (TS2345)

**File**: `server/services/actual-metrics-calculator.ts:59` **Issue**: Type
mismatch - 12 missing properties

**Fix**: Either expand query or adjust expected type

### 4.3 Index Signature Fixes (TS7053 × 2)

**File**: `server/metrics/lpBusinessMetrics.ts` **Issue**: Indexing with string
into typed object

**Fix**: Use type-safe access:

```typescript
const value = obj[key as keyof typeof obj];
// or
const tierMap: Record<string, number> = {
  enterprise: 1,
  growth: 2,
  startup: 3,
};
```

### 4.4 Enhanced Audit (TS2769)

**File**: `server/middleware/enhanced-audit.ts:436` **Issue**: Object has extra
properties not in schema

**Fix**: Align insert object with schema columns

### 4.5 Engine Guards (TS2488)

**File**: `server/middleware/engine-guards.ts:140` **Issue**: Type needs
`[Symbol.iterator]()`

**Fix**: Add undefined check before destructuring

---

## Phase 5: Library/External Type Fixes (2 errors)

### 5.1 Sentry ErrorEvent (TS2694)

**File**: `server/observability/sentry.ts:23` **Issue**: `ErrorEvent` no longer
exported from Sentry

**Fix**: Import from correct path or use alternative type

```typescript
import type { Event } from '@sentry/types';
```

### 5.2 stream.ts error object (TS2353)

**File**: `server/agents/stream.ts:98` **Issue**: `runId` doesn't exist on Error

**Fix**: This is a logger call, not an Error property - restructure:

```typescript
logger.error('SSE write error', {
  runId,
  error: error instanceof Error ? error.message : error,
});
```

---

## Execution Order

1. **Phase 1** first - unblocks other files
2. **Phase 2** - type changes enable Phase 3
3. **Phase 3** - bulk of fixes, can be parallelized
4. **Phase 4** - database/schema alignment
5. **Phase 5** - external library updates

## Estimated Impact

- Lines changed: ~100-150
- Files modified: ~25
- Time estimate: Can be done in systematic batches
