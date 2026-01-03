# TypeScript Error Elimination Plan (Revised)

## Summary

- **Total Errors**: 37
- **Strategy**: Pattern-based fixes respecting `exactOptionalPropertyTypes`
- **Priority**: Fix in order of dependency (config → imports → usage patterns)

## Critical Corrections from Agent Review

The original plan had several misdiagnoses. Key findings:

1. **Types are already correct** - `perRound`, `rateLimitStore`,
   `months_to_exit` are ALREADY optional
2. **Root cause is `exactOptionalPropertyTypes: true`** - Cannot assign
   `undefined` to optional props directly
3. **Default values risk silent failures** - `?? 0` and `?? ''` can corrupt data
   or mask errors
4. **Import path issues** - storage.ts imports from old schema location

---

## Phase 0: Baseline Snapshot (NEW)

Before making any changes:

```bash
# Capture current state
npm run check > .baselines/pre-fix-typescript-errors.txt
npm test -- --project=server > .baselines/pre-fix-tests.txt 2>&1

# Verify baseline
cat .tsc-baseline.json | jq '.totalErrors'  # Should be 37
```

---

## Phase 1: Config-Level Fixes (5 errors)

### 1.1 Update tsconfig.server.json includes

**Errors**: TS6307 x 3

Add missing directories:

```json
"include": [
  // ... existing
  "client/src/machines/**/*",
  "client/src/adapters/**/*",
  "tools/ai-review/**/*"
]
```

### 1.2 Fix module exports

**Error**: TS2459 in `server/db/index.ts`

```typescript
// In server/db/pool.ts - add export
export type { NodePgDatabase } from 'drizzle-orm/node-postgres';
```

**Error**: TS2307 in `server/lib/stage-validation-startup.ts`

This needs deeper investigation - `sql` is not exported from any db module.
Options:

1. Import `sql` from neon/serverless directly
2. Use `db` instead of raw SQL template
3. Export `sql` from db-serverless.ts

### Verification

```bash
npm run check  # Should show 32-34 errors remaining
```

---

## Phase 2: exactOptionalPropertyTypes Fixes (6 errors)

### IMPORTANT: Do NOT make types optional - they already are!

The issue is assigning `value | undefined` to optional properties under strict
mode.

### 2.1 ReservePrediction (TS2375 x 2)

**Files**: `adapter.ts:289`, `mlClient.ts:137`

**WRONG** (original plan):

```typescript
perRound?: Record<string, number>;  // Already optional!
```

**CORRECT** (conditional spread):

```typescript
// In server/core/reserves/adapter.ts:289
const prediction: ReservePrediction = {
  recommendedReserve: result.recommendedReserve,
  ...(result.perRound !== undefined && { perRound: result.perRound }),
  ...(result.confidence !== undefined && { confidence: result.confidence }),
  notes: result.notes ?? [],
};
```

### 2.2 Providers (TS2375)

**File**: `server/providers.ts:85`

**WRONG**: Make rateLimitStore optional (already is)

**CORRECT**: Use conditional spread

```typescript
return {
  mode,
  cache,
  ...(rateLimitStore !== undefined && { rateLimitStore }),
  queue,
  sessions,
  teardown,
};
```

### 2.3 WeightedSummarySnapshot (TS2375)

**File**: `server/services/comparison-service.ts:228`

**CRITICAL**: Do NOT use `months_to_exit ?? 0` - this corrupts financial data!

**CORRECT** (matches existing pattern in scenario-math.ts:106):

```typescript
return {
  moic: summary.moic,
  investment: summary.investment,
  follow_ons: summary.follow_ons,
  exit_proceeds: summary.exit_proceeds,
  exit_valuation: summary.exit_valuation,
  ...(summary.months_to_exit !== undefined && {
    months_to_exit: summary.months_to_exit,
  }),
};
```

### Verification

```bash
npm run check  # Should show 26-28 errors remaining
```

---

## Phase 3: Null Safety Fixes (14 errors)

### Philosophy (in order of preference)

1. **Early return guards** - most explicit, fail fast
2. **Optional chaining** - safe navigation
3. **Nullish coalescing** - ONLY when default is semantically correct
4. **Non-null assertions** - LAST RESORT with justification comment

### 3.1 Route Parameter Guards (HIGH PRIORITY)

**File**: `server/agents/stream.ts:89`

**WRONG**: `runId!`

**CORRECT**:

```typescript
export async function stream(req: Request, res: Response) {
  const { runId } = req.params;

  if (!runId) {
    logger.error('Stream endpoint called without runId', { path: req.path });
    res.status(400).json({ error: 'Missing runId parameter' });
    return;
  }

  // runId is now narrowed to string
  // ... rest of function
}
```

**File**: `server/routes/error-budget.ts:24`

**CORRECT**:

```typescript
const { slo } = req.params;
if (!slo) {
  res.status(400).json({ error: 'Missing SLO parameter' });
  return;
}
```

### 3.2 Redis URL Validation (CRITICAL)

**File**: `server/db/redis-factory.ts:356`

**WRONG**: `url ?? ''` (silent Redis DB mismatch risk)

**CORRECT**:

```typescript
const dbMatch = url.pathname?.match(/^\/(\d+)$/);
if (dbMatch) {
  options.db = parseInt(dbMatch[1], 10);
} else if (url.pathname === undefined) {
  logger.error('Redis URL missing pathname', { url: url.toString() });
  throw new Error('Invalid Redis URL: missing pathname');
}
```

### 3.3 Null Guards (Medium Priority)

| File                                         | Line          | Fix                                     |
| -------------------------------------------- | ------------- | --------------------------------------- |
| `compass/routes.ts`                          | 52            | Guard + 400 response (mock endpoint)    |
| `examples/streaming-monte-carlo-examples.ts` | 146, 499, 502 | `if (!value) return` guards             |
| `infra/circuit-breaker/CircuitBreaker.ts`    | 128           | Optional chaining: `arr[0] ?? Infinity` |
| `lib/approvals-guard.ts`                     | 348           | `if (!approval) continue`               |

### 3.4 exactOptionalPropertyTypes with Stores

**Files**: `lib/redis/cluster.ts:94`, `middleware/rateLimitDetailed.ts:17`,
`server.ts:210`

These are caused by passing `store | undefined` where library expects `store?`.

**FIX**: Filter undefined before passing:

```typescript
// WRONG
const options = { store: maybeStore };

// CORRECT
const options = {
  ...(maybeStore !== undefined && { store: maybeStore }),
};
```

### 3.5 Type Coercion

**File**: `middleware/security.ts:196`

Extract path instead of casting:

```typescript
const path = typeof req === 'string' ? req : (req.path ?? '');
```

**File**: `middleware/with-rls-transaction.ts:88`

Use explicit spread with type guard:

```typescript
const args = Array.isArray(input) ? input : [input];
res.write(...(args as [unknown, BufferEncoding?, (() => void)?]));
```

### Verification

```bash
npm run check  # Should show 12-14 errors remaining
```

---

## Phase 4: Schema Alignment (8 errors)

### 4.1 Fix Storage Import (ROOT CAUSE)

**Discovery**: `server/storage.ts` imports from old schema location!

**File**: `server/storage.ts:6-11`

**WRONG**:

```typescript
import { funds, companies, ... } from "../schema/src/index.js";
```

**CORRECT**:

```typescript
import { funds, companies, ... } from "@shared/schema";
```

This should fix multiple `isActive`/`establishmentDate` errors in
metrics-aggregator.ts.

### 4.2 Metrics Aggregator (TS2339, TS2345 x 3)

After fixing the import, verify the query includes all fields:

```typescript
const fundData = await db
  .select({
    id: funds.id,
    name: funds.name,
    // ... other fields
    isActive: funds.isActive,
    establishmentDate: funds.establishmentDate,
  })
  .from(funds);
```

### 4.3 Actual Metrics Calculator (TS2345)

**File**: `server/services/actual-metrics-calculator.ts:59`

Expand query or create explicit type mapping for the subset of fields needed.

### 4.4 Index Signature Fixes (TS7053 x 2)

**File**: `server/metrics/lpBusinessMetrics.ts`

```typescript
// WRONG - indexing with string into typed object
const value = tierMap[key];

// CORRECT - type-safe access
const tierMap: Record<string, number> = {
  enterprise: 1,
  growth: 2,
  startup: 3,
};
// or
const value = tierMap[key as keyof typeof tierMap];
```

### 4.5 Enhanced Audit (TS2769)

**File**: `server/middleware/enhanced-audit.ts:436`

Align insert object with schema columns - remove extra properties not in schema.

### 4.6 Engine Guards (TS2488)

**File**: `server/middleware/engine-guards.ts:140`

Add undefined check before destructuring:

```typescript
const entry = Object.entries(obj)[0];
if (!entry) return;
const [key, value] = entry;
```

### Verification

```bash
npm run check  # Should show 4-6 errors remaining
```

---

## Phase 5: Library/External Type Fixes (4 errors)

### 5.1 Sentry ErrorEvent (TS2694)

**File**: `server/observability/sentry.ts:23`

```typescript
// WRONG - ErrorEvent no longer exported
import type { ErrorEvent } from '@sentry/node';

// CORRECT
import type { Event } from '@sentry/types';
```

### 5.2 stream.ts Logger (TS2353)

**File**: `server/agents/stream.ts:98`

```typescript
// WRONG - runId doesn't exist on Error
logger.error('SSE write error', { runId, error });

// CORRECT
logger.error('SSE write error', {
  runId,
  error: error instanceof Error ? error.message : String(error),
});
```

### Final Verification

```bash
npm run check  # Should show 0 errors
npm run baseline:save
npm test -- --project=server
```

---

## Execution Checklist

- [ ] Phase 0: Create baseline snapshot
- [ ] Phase 1: Config fixes (verify: 32-34 errors)
- [ ] Phase 2: exactOptionalPropertyTypes (verify: 26-28 errors)
- [ ] Phase 3: Null safety (verify: 12-14 errors)
- [ ] Phase 4: Schema alignment (verify: 4-6 errors)
- [ ] Phase 5: External types (verify: 0 errors)
- [ ] Final: `npm run baseline:save && npm test`

---

## Risk Summary

| Category                   | Count | Risk Level                                |
| -------------------------- | ----- | ----------------------------------------- |
| Config fixes               | 5     | LOW                                       |
| exactOptionalPropertyTypes | 6     | MEDIUM (careful with conditional spreads) |
| Null safety                | 14    | MEDIUM-HIGH (avoid silent failures)       |
| Schema alignment           | 8     | MEDIUM (verify imports)                   |
| External types             | 4     | LOW                                       |

## Files NOT to Modify (Types Already Correct)

- `shared/schemas/reserves-schemas.ts` - perRound is already optional
- Providers interface - rateLimitStore is already optional
- WeightedSummarySnapshot - months_to_exit is already optional

---

## Review Sign-off

- [x] code-reviewer: APPROVED WITH REVISIONS (confidence 75/100)
- [x] type-design-analyzer: Types correct, fix usage patterns (3/10 original
      plan)
- [x] silent-failure-hunter: 3 CRITICAL risks identified, corrected above
- [x] Explore agent: Verified actual root causes differ from original plan
