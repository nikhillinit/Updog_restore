# Plan: Database Mock Bug Fix

## Executive Summary

Two interconnected bugs are causing test failures:
1. **Loader boundary bug**: `server/db.ts` uses `require()` to load a TypeScript file, which fails outside Vitest context
2. **Check constraint bug**: 3 check functions expect `(value)` but receive `(row)`, causing 15+ test failures

## Problem Analysis

### Bug 1: Loader Boundary Issue

**Current state** (`server/db.ts:25`):
```javascript
const { databaseMock } = require('../tests/helpers/database-mock');
```

**Problem**:
- `database-mock.ts` is a TypeScript file with ESM imports (`import { vi } from 'vitest'`)
- Node.js `require()` cannot load TypeScript files natively
- The `vi.fn()` calls fail outside Vitest test runner context
- Error: "Unexpected strict mode reserved word" at database-mock.cjs:11:18

**Impact**: 7 integration test suites fail to load

### Bug 2: Check Constraint Signature Mismatch

**Current state** (`database-mock.ts:555`):
```javascript
// All check functions now receive the entire row
if (!(checkFn as Function)(row)) {
```

**Problem**: 3 check functions still expect `(value)` not `(row)`:

| Function | Line | Signature | Actual Behavior |
|----------|------|-----------|-----------------|
| `data_integrity_score` | 43 | `(value: any)` | `parseFloat(row)` returns NaN |
| `confidence_score` | 56 | `(value: any)` | `parseFloat(row)` returns NaN |
| `restoration_duration_ms` | 81 | `(value: any)` | `parseFloat(row)` returns NaN |

When `parseFloat(objectRow)` returns `NaN`, the range check `NaN >= 0.0 && NaN <= 1.0` evaluates to `false`, triggering spurious constraint failures.

**Impact**: 15+ "Check constraint failed" test errors

---

## Proposed Solution: Option A (Pure CJS Mock)

### Rationale

Option A (pure CJS) is superior to Option B (ESM import) because:
1. **No loader complexity** - Works with plain Node.js `require()`
2. **Decoupled from Vitest** - No `vi.fn()` dependency
3. **Minimal change surface** - Only add one file, update one line
4. **Clean separation** - Test-time mock (TS) vs runtime mock (CJS) are distinct concerns

### Implementation Steps

#### Step 1: Create Pure CJS Mock

Create `tests/helpers/database-mock.cjs`:

```javascript
/**
 * Pure CommonJS Database Mock for Node.js require() context
 *
 * Used by server/db.ts when NODE_ENV=test outside Vitest.
 * Provides minimal stub interface - full mock in database-mock.ts.
 */

class DatabaseMock {
  constructor() {
    this.mockData = new Map();
    this.callHistory = [];
  }

  // Stub methods that return resolved promises
  execute = async (query, params) => [];
  select = () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) });
  insert = (table) => ({ values: (data) => ({ returning: () => Promise.resolve([{ id: 'mock-id', ...data }]) }) });
  update = () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) });
  delete = () => ({ from: () => ({ where: () => ({ execute: () => Promise.resolve({ affectedRows: 0 }) }) }) });
  transaction = async (callback) => callback(this);
  run = this.execute;
  query = this.execute;
  close = async () => {};

  // Test utilities
  setMockData(tableName, data) { this.mockData.set(tableName, data); }
  getMockData(tableName) { return this.mockData.get(tableName) || []; }
  clearMockData() { this.mockData.clear(); }
  getCallHistory() { return this.callHistory; }
  clearCallHistory() { this.callHistory = []; }
  reset() { this.clearMockData(); this.clearCallHistory(); }
}

const databaseMock = new DatabaseMock();

module.exports = { databaseMock, DatabaseMock };
```

**Key characteristics**:
- Pure JavaScript, no TypeScript
- No vitest dependency (`vi.fn()` replaced with plain functions)
- CommonJS exports (`module.exports`)
- Same interface shape as the TypeScript mock

#### Step 2: Update server/db.ts

Change line 25 from:
```javascript
const { databaseMock } = require('../tests/helpers/database-mock');
```

To:
```javascript
const { databaseMock } = require('../tests/helpers/database-mock.cjs');
```

The explicit `.cjs` extension ensures Node.js loads the CommonJS file.

#### Step 3: Fix Check Constraint Functions

Update the 3 check functions in `database-mock.ts` to accept `(row)` and extract the field value:

```typescript
// Line 43-47: data_integrity_score
data_integrity_score: (row: any) => {
  const value = row.data_integrity_score;
  if (value === undefined || value === null) return true;
  const score = parseFloat(value);
  return score >= 0.0 && score <= 1.0;
}

// Line 56-59: confidence_score
confidence_score: (row: any) => {
  const value = row.confidence_score;
  if (value === undefined || value === null) return true;
  const score = parseFloat(value);
  return score >= 0.0 && score <= 1.0;
}

// Line 81-83: restoration_duration_ms
restoration_duration_ms: (row: any) => {
  const value = row.restoration_duration_ms;
  if (value === undefined || value === null) return true;
  return parseFloat(value) >= 0;
}
```

**Pattern**: All check functions now consistently:
1. Accept `(row: any)`
2. Extract the specific field value
3. Handle undefined/null gracefully (return true for optional fields)
4. Perform the actual validation

---

## Verification Plan

### After Step 1 & 2 (Loader Fix):
```bash
npm test -- --project=server tests/integration/
```
Expected: 7 suites should load and run (may have other failures, but no loader errors)

### After Step 3 (Constraint Fix):
```bash
npm run baseline:test:check
```
Expected: 15+ fewer "Check constraint failed" errors

### Final Verification:
```bash
npm run baseline:test:check
```
Record exact metrics from `artifacts/test-summary.json`

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| CJS mock behavior differs from TS mock | CJS mock is minimal stub; full mock used during Vitest runs |
| Missing methods in CJS mock | Same interface shape, stubs return empty/resolved |
| Check constraint fix introduces regressions | Tests will verify the fix works |

---

## Expected Outcomes

1. **7 integration suites unblocked** - No more loader errors
2. **15+ constraint failures fixed** - Check functions work correctly
3. **Exact metrics available** - Can run `baseline:test:check` for real numbers

---

## Files to Modify

1. **CREATE**: `tests/helpers/database-mock.cjs` (new file, ~40 lines)
2. **EDIT**: `server/db.ts` line 25 (add `.cjs` extension)
3. **EDIT**: `tests/helpers/database-mock.ts` lines 43-47, 56-59, 81-83 (fix check signatures)

---

## Governance Notes

- This fix targets **infrastructure bugs**, not TDD RED phase tests
- Unlocks suites that should pass, not suites revealing unimplemented features
- Should improve NonPassing count, moving toward 90% target
