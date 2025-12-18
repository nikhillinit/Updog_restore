# Plan: Database Mock Bug Fix (Optimal Build Plan v2)

## Critical Analysis of Proposals

### Proposal A: "Single Source of Truth" (CJS with `require('vitest')`)
**Rejected** - Has a fatal flaw:
- `require('vitest')` in CJS creates hidden coupling
- Would fail if file is accidentally loaded outside Vitest context
- Adds complexity without benefit

### Proposal B: Pure CJS with `createSpy()` (No Dependencies)
**Selected** - Superior approach:
- Zero external dependencies
- Self-contained spy implementation
- Truly portable CJS

### Key Discovery: Tests Don't Share State

Analysis of test patterns reveals:
```
setupDatabaseMock() usage:     0 tests (function exists but unused)
vi.mock('server/db') inline:  10+ tests (each defines own mock)
```

**Implication**: The CJS mock is a **fallback** for initial module loading, not a shared state container. Tests use inline `vi.mock()` definitions. This simplifies the fix significantly.

---

## Root Cause Analysis

### Bug 1: Loader Boundary (7 suites blocked)

**Crash sequence**:
1. Test imports route → route imports `server/db`
2. `server/db.ts` top-level code runs (before vi.mock() can intercept)
3. `isTest=true` → `require('../tests/helpers/database-mock')`
4. Node resolves to `.ts` file → **CRASH** (TypeScript syntax in require context)

**Fix**: Create proper `.cjs` that Node can load without transformation.

### Bug 2: Check Constraint Logic (15+ failures)

**Current code** (`database-mock.ts:552-558`):
```typescript
for (const [checkName, checkFn] of Object.entries(constraints.checks)) {
  // All check functions now receive the entire row
  if (!(checkFn as Function)(row)) {  // Always passes row
```

**But check functions are inconsistent**:
| Function | Expects | Gets | Result |
|----------|---------|------|--------|
| `data_integrity_score` | `value` | `row` | `parseFloat(row)` = NaN → false |
| `confidence_score` | `value` | `row` | `parseFloat(row)` = NaN → false |
| `self_comparison` | `row` | `row` | Works correctly |
| `period_ordering` | `row` | `row` | Works correctly |

**Fix**: Smart heuristic - if `row[checkName]` exists, pass value; else pass row.

---

## Optimal Implementation

### Step 1: Create `tests/helpers/database-mock.cjs`

```javascript
'use strict';

/**
 * Pure CommonJS DB mock for server/db.ts test initialization.
 * MUST NOT require TS/ESM modules or vitest.
 *
 * This is a FALLBACK - tests use vi.mock() with their own definitions.
 */

function createSpy(fn) {
  const spy = (...args) => {
    spy.calls.push(args);
    return fn(...args);
  };
  spy.calls = [];
  spy.mockClear = () => { spy.calls = []; };
  return spy;
}

function createDatabaseMock() {
  const db = {};

  // Raw SQL interface
  db.execute = createSpy(async () => []);
  db.query = db.execute;
  db.run = db.execute;

  // Transaction
  db.transaction = createSpy(async (cb) => cb(db));

  // Drizzle-style builders (chainable stubs)
  db.select = createSpy(() => ({
    from: createSpy(() => ({
      where: createSpy(() => ({
        limit: createSpy(() => Promise.resolve([])),
        execute: createSpy(() => Promise.resolve([])),
      })),
      limit: createSpy(() => Promise.resolve([])),
      execute: createSpy(() => Promise.resolve([])),
    })),
  }));

  db.insert = createSpy(() => ({
    values: createSpy((data) => {
      const result = { id: `mock-${Date.now()}`, ...data };
      const chain = {
        returning: createSpy(() => Promise.resolve([result])),
        execute: createSpy(() => Promise.resolve([result])),
      };
      return { ...chain, onConflictDoUpdate: createSpy(() => chain) };
    }),
    execute: createSpy(() => Promise.resolve([{ id: `mock-${Date.now()}` }])),
  }));

  db.update = createSpy(() => ({
    set: createSpy(() => ({
      where: createSpy(() => ({
        returning: createSpy(() => Promise.resolve([])),
        execute: createSpy(() => Promise.resolve([])),
      })),
      execute: createSpy(() => Promise.resolve([])),
    })),
  }));

  db.delete = createSpy(() => ({
    from: createSpy(() => ({
      where: createSpy(() => ({
        execute: createSpy(() => Promise.resolve({ affectedRows: 1 })),
      })),
      execute: createSpy(() => Promise.resolve({ affectedRows: 1 })),
    })),
  }));

  db.close = createSpy(async () => {});

  db.__reset = () => {
    Object.values(db).forEach(v => {
      if (v && typeof v.mockClear === 'function') v.mockClear();
    });
  };

  return db;
}

const databaseMock = createDatabaseMock();

module.exports = { databaseMock, createDatabaseMock };
```

**Why this is optimal**:
- Zero dependencies (no `require('vitest')`)
- `createSpy()` provides `.calls` + `.mockClear()` (covers 90% of spy needs)
- Chainable builders match Drizzle interface
- `__reset()` for cleanup between tests

### Step 2: Update `server/db.ts:25`

```typescript
// Before
const { databaseMock } = require('../tests/helpers/database-mock');

// After
const { databaseMock } = require('../tests/helpers/database-mock.cjs');
```

Explicit `.cjs` ensures Node loads the CommonJS file without transformation.

### Step 3: Fix `validateConstraints()` with Smart Heuristic

In `database-mock.ts`, replace lines 551-558:

```typescript
// Validate check constraints
if (constraints.checks) {
  for (const [checkName, checkFn] of Object.entries(constraints.checks)) {
    // Smart heuristic: pass value if field exists, else pass row
    const hasField = Object.prototype.hasOwnProperty.call(row, checkName);
    const arg = hasField ? row[checkName] : row;

    if (!(checkFn as Function)(arg)) {
      throw new Error(`Check constraint '${checkName}' failed`);
    }
  }
}
```

**Why this is elegant**:
- No changes to check function signatures
- Value-style checks (`data_integrity_score`) get `row.data_integrity_score`
- Row-style checks (`period_ordering`) get full row
- Backward compatible

### Step 4: Add SQL-Compliant Null Handling

SQL CHECK constraints pass when expression is TRUE **or NULL**. Update value-checks:

```typescript
// data_integrity_score (line 43)
data_integrity_score: (value: any) => {
  if (value === undefined || value === null || value === '') return true;
  const score = Number(value);
  return Number.isFinite(score) && score >= 0.0 && score <= 1.0;
},

// confidence_score (line 56)
confidence_score: (value: any) => {
  if (value === undefined || value === null || value === '') return true;
  const score = Number(value);
  return Number.isFinite(score) && score >= 0.0 && score <= 1.0;
},

// restoration_duration_ms (line 81)
restoration_duration_ms: (value: any) => {
  if (value === undefined || value === null) return true;
  const val = Number(value);
  return Number.isFinite(val) && val >= 0;
},
```

**Why `Number.isFinite()` over `parseFloat()`**:
- `parseFloat("123abc")` returns 123 (partial parse)
- `Number("123abc")` returns NaN (strict)
- `Number.isFinite()` catches NaN and Infinity

---

## Execution Order

```
1. CREATE database-mock.cjs        (fixes loader crash)
2. EDIT server/db.ts:25            (explicit .cjs path)
3. RUN validation:
   npx vitest run tests/integration/interleaved-thinking.test.ts

4. EDIT validateConstraints()      (smart heuristic)
5. EDIT check functions            (null handling)
6. RUN baseline:
   npm run baseline:test:check

7. COMMIT with exact metrics from artifacts/test-summary.json
```

---

## Verification Commands

```bash
# Step 1-2: Confirm loader fix (suite should LOAD, may have test failures)
npx vitest run tests/integration/interleaved-thinking.test.ts

# Step 4-5: Confirm constraint fix
npm run baseline:test:check

# Exact metrics (REQUIRED before commit)
cat artifacts/test-summary.json | jq '.counts, .gate'
```

---

## Expected Outcomes

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| suiteFailures | 17 | 10 | -7 (loader fix) |
| Check constraint errors | ~15 | ~0 | -15 (heuristic + null) |

---

## Files Modified

| File | Action | Lines |
|------|--------|-------|
| `tests/helpers/database-mock.cjs` | CREATE | ~70 |
| `server/db.ts` | EDIT | 1 (line 25) |
| `tests/helpers/database-mock.ts` | EDIT | ~15 (lines 43-47, 56-59, 81-83, 551-558) |

---

## Governance Compliance

- **W=25 allowance**: This fix should decrease score (unlock working tests)
- **No "estimated"**: Commit only with exact metrics from `artifacts/test-summary.json`
- **Infrastructure fix**: Targets harness bugs, not TDD RED phase tests
