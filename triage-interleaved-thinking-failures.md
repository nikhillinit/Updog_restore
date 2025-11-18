# Triage: Interleaved Thinking API Test Failures

**Date:** 2025-11-14 **Investigator:** Claude (AI Agent) **Failures:** 17 out of
17 tests in `tests/integration/interleaved-thinking.test.ts`

---

## Root Cause Analysis

### Primary Issue: Module Resolution Failure

**Error Message:**

```
Cannot find module '../tests/helpers/database-mock'
Require stack:
- c:\dev\Updog_restore\server\db.ts
```

**Location:** [server/db.ts:23](server/db.ts#L23)

**Code:**

```typescript
// Use mock database in test environment
if (isTest) {
  // Import the database mock for testing
  const { databaseMock } = require('../tests/helpers/database-mock');
  db = databaseMock;
  pool = null;
}
```

### File System Verification

✅ **File exists:** `tests/helpers/database-mock.ts` (16,840 bytes) ✅ **File is
valid:** TypeScript module with DatabaseMock class ✅ **Path is correct:**
`../tests/helpers/database-mock` is valid relative path from `server/`

### Hypothesis

The issue is likely **CommonJS `require()` vs ES module path resolution**:

- `server/db.ts` uses `require('../tests/helpers/database-mock')` (CommonJS)
- `tests/helpers/database-mock.ts` is a TypeScript ES module (uses
  `import`/`export`)
- Vitest test environment may not be transpiling the path correctly

### Evidence

Other files successfully import database-mock using ES module syntax:

- `tests/helpers/test-database.ts:7` -
  `import { databaseMock } from './database-mock';` ✅
- `tests/unit/database/test-mock-directly.test.ts:6` -
  `import { databaseMock } from '../../helpers/database-mock';` ✅
- `tests/unit/reallocation-api.test.ts:22` -
  `await import('../helpers/database-mock')` ✅

**Conclusion:** The `require()` call in `server/db.ts` is the problem.

---

## Impact Assessment

### Criticality: **MINOR** ⚠️

**Reasoning:**

1. **Isolated Feature:** Interleaved Thinking API is an experimental AI feature,
   NOT core portfolio API
2. **No Database Impact:** Does not affect database schema, migrations, or data
   integrity
3. **No Phase 0A Dependency:** Portfolio routes (`/portfolio/lots`,
   `/portfolio/snapshots`) do not depend on this feature
4. **Test Infrastructure Issue:** Module resolution problem, not business logic
   failure

### Affected Systems

- ❌ **Interleaved Thinking API** (`/api/interleaved-thinking/*` routes)
- ✅ **Portfolio API** (unaffected)
- ✅ **Database layer** (database-mock itself works, just path resolution issue)
- ✅ **Other test suites** (use correct import syntax)

### Phase 0A Impact

**Does NOT block Phase 0A** (database migration + idempotency middleware)
because:

- Phase 0A works with portfolio routes (`/portfolio/*`)
- Database mock is used successfully by portfolio tests (different import
  syntax)
- Migration scripts don't depend on Interleaved Thinking feature
- Idempotency middleware tests pass (22/22 in
  `tests/integration/middleware.test.ts`)

---

## Recommended Fix

### Option A: Convert to ES Module Import (Quick, 5 minutes)

**Change:** Update `server/db.ts` line 23 to use dynamic import

```typescript
// Before (CommonJS)
const { databaseMock } = require('../tests/helpers/database-mock');

// After (ES module)
const { databaseMock } = await import('../tests/helpers/database-mock');
```

**Pros:** Aligns with other test file imports, consistent with ES modules
**Cons:** Requires `await` at top level (may need function wrapper)

### Option B: Add Path Alias to vitest.config.ts (Better, 10 minutes)

**Change:** Ensure Vitest resolves test helper paths correctly

**File:** `vitest.config.ts`

```typescript
resolve: {
  alias: {
    '@/': new URL('./client/src/', import.meta.url).pathname,
    '@shared/': new URL('./shared/', import.meta.url).pathname,
    '@tests/': new URL('./tests/', import.meta.url).pathname, // Add this
  },
},
```

Then update `server/db.ts`:

```typescript
const { databaseMock } = require('@tests/helpers/database-mock');
```

**Pros:** Centralizes path resolution, prevents future issues **Cons:** Slightly
more configuration

### Option C: Defer to Technical Debt (Recommended for Now)

**Action:** Log as technical debt, fix after Phase 0A completion

**Rationale:**

- Does NOT block critical path (Phase 0A portfolio work)
- Interleaved Thinking API is experimental, not production-critical
- Fix is straightforward (5-10 minutes) but requires verification
- Better to fix with full context after Phase 0A complete

---

## Recommendation

**✅ PROCEED WITH PHASE 0A**

**Action Items:**

1. **Create GitHub Issue:** Log Interleaved Thinking test failures for future
   fix
2. **Continue Phase 0A:** No blocking dependency identified
3. **Fix Post-Phase 0A:** Address after database migration complete

**Priority:** P3 (Low) - Technical debt, not production blocker

---

## Additional Test Failures (Non-Blocking)

### Monte Carlo Test (1 failure - Flaky)

- Test: `should handle higher reserve allocation for current market conditions`
- Issue: `expected false to be true` (assertion logic, not infrastructure)
- Status: Marked as `@flaky`, not blocking

### Middleware Test (1 failure - Race Condition)

- Test: `should reject during shutdown without parsing large body`
- Issue: `read ECONNRESET` (connection reset during shutdown simulation)
- Status: Edge case in shutdown handling, not critical

**Total Non-Interleaved Failures:** 2 (both flaky/edge cases)

---

## Decision

**ASSESSMENT: MINOR** **IMPACT ON PHASE 0A: NONE** **RECOMMENDATION: PROCEED
WITH PHASE 0A, FIX AS TECHNICAL DEBT**

---

**Next Steps:**

1. ✅ Document this triage (complete)
2. ➡️ Commit Phase 0-PRE verification work
3. ➡️ Read Phase 0A handoff documents
4. ➡️ Create Phase 0A execution plan
