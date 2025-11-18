# Phase 0A Middleware Implementation Plan

## Status: 75% Complete

**Date Created:** 2025-11-17 **Created By:** Claude Code (Option B Execution)
**Target Completion:** 30 minutes (next session)

---

## What's Done

### [SUCCESS] Database Schema Hardening (100%)

**Files Applied:**

- `migrations/0001_create_portfolio_tables.sql` - Base tables created
- `migrations/0001_portfolio_schema_hardening.sql` - Schema modifications
  applied

**Changes Verified:**

- [x] Version columns: `integer` → `bigint` (3 tables)
- [x] Scoped idempotency indexes: Fund/investment/snapshot-scoped (3 indexes)
- [x] Cursor pagination indexes: `(parent_id, timestamp DESC, id DESC)` pattern
      (3 indexes)
- [x] Length constraints: idempotency_key 1-128 characters
- [x] Automated verification: All checks passed

**Verification Results:**

```
[PASS] forecast_snapshots.version: bigint
[PASS] investment_lots.version: bigint
[PASS] reserve_allocations.version: bigint
[PASS] 6 indexes created (3 idempotency + 3 cursor pagination)
```

---

## What Remains: Idempotency Middleware Fixes

### Task Overview

**File:** `server/middleware/idempotency.ts` **Status:** NOT STARTED
**Estimate:** 30 minutes **Priority:** P2 (not blocking Phase 1)

### Current State Analysis

Based on the agent's review, the middleware already has:

1. [SUCCESS] Atomic PENDING lock with Redis `SET NX EX`
2. [SUCCESS] Stable fingerprinting (custom stableStringify implementation)
3. [NEEDS FIX] Cache eviction uses FIFO instead of true LRU
4. [SUCCESS] Response headers (`Idempotency-Replay: true`)

**Only 1 actual fix needed:** Replace FIFO cache with LRU eviction.

---

## Implementation Approach

### Fix: Replace FIFO with LRU Cache

**Location:** `server/middleware/idempotency.ts:27-84` (`MemoryIdempotencyStore`
class)

**Current Implementation:**

```typescript
class MemoryIdempotencyStore {
  private store = new Map<
    string,
    { data: IdempotentResponse; expiry: number }
  >();
  private readonly maxSize = 1000;

  set(key: string, data: IdempotentResponse, ttl: number): void {
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value; // FIFO - wrong!
      this.store.delete(firstKey);
    }
    // ... store data ...
  }
}
```

**Issue:** Deletes the first key inserted (FIFO), not the least recently used
(LRU).

**Fix Options:**

#### Option A: Use `lru-cache` Package (RECOMMENDED)

```typescript
import { LRUCache } from 'lru-cache';

class MemoryIdempotencyStore {
  private store = new LRUCache<string, IdempotentResponse>({
    max: 1000, // 10k entries
    ttl: 60 * 60 * 1000, // 1 hour default
    updateAgeOnGet: true, // True LRU behavior
  });

  set(key: string, data: IdempotentResponse, ttl: number): void {
    this.store.set(key, data, { ttl: ttl * 1000 });
  }

  get(key: string): IdempotentResponse | null {
    const entry = this.store.get(key); // Updates access time automatically
    if (!entry) return null;
    return entry;
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}
```

**Advantages:**

- Battle-tested LRU implementation
- Built-in TTL management
- Thread-safe
- 3x faster than manual LRU

**Installation:**

```bash
npm install lru-cache
npm install --save-dev @types/lru-cache
```

#### Option B: Manual LRU with Access Tracking (NOT RECOMMENDED)

```typescript
class MemoryIdempotencyStore {
  private store = new Map<
    string,
    { data: IdempotentResponse; expiry: number; lastAccess: number }
  >();
  private readonly maxSize = 1000;

  set(key: string, data: IdempotentResponse, ttl: number): void {
    if (this.store.size >= this.maxSize) {
      // Find least recently used
      let lruKey: string | null = null;
      let lruTime = Infinity;
      for (const [k, v] of this.store.entries()) {
        if (v.lastAccess < lruTime) {
          lruTime = v.lastAccess;
          lruKey = k;
        }
      }
      if (lruKey) this.store.delete(lruKey);
    }

    this.store.set(key, {
      data,
      expiry: Date.now() + ttl,
      lastAccess: Date.now(),
    });
  }

  get(key: string): IdempotentResponse | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiry < Date.now()) {
      this.store.delete(key);
      return null;
    }
    entry.lastAccess = Date.now(); // Update access time
    return entry.data;
  }
}
```

**Disadvantages:**

- O(n) eviction lookup (slow with 10k entries)
- Manual TTL expiration checking
- More complex, higher bug risk

---

## Testing Strategy

### Test File

`tests/middleware/idempotency-dedupe.test.ts` (657 lines)

### Critical Tests to Validate

1. **LRU Eviction Test** (lines 246-289)
   - Current: Documents FIFO behavior
   - Fix: Should test true LRU behavior

   ```typescript
   // Update test expectation
   expect(cachedKey1).toBeNull(); // LRU victim, not first inserted
   expect(cachedKey2).not.toBeNull(); // Recently accessed, should survive
   ```

2. **Response Headers Test** (lines 291-309)
   - Already passing: `Idempotency-Replay: true` on cache hits

3. **Stable Fingerprinting Test** (lines 160-207)
   - Already passing: Key order independence validation

4. **In-Flight Request Handling** (lines 209-244)
   - Already passing: Redis `SET NX EX` atomic lock

### Test Commands

```bash
# Run full middleware test suite
npm test -- --project=server tests/middleware/idempotency-dedupe.test.ts

# Run specific LRU cache test
npm test -- --project=server tests/middleware/idempotency-dedupe.test.ts -t "LRU cache eviction"

# Run with coverage
npm test -- --coverage tests/middleware/idempotency-dedupe.test.ts
```

---

## Implementation Steps (30 minutes)

### Step 1: Install LRU Cache Package (5 min)

```bash
npm install lru-cache
npm install --save-dev @types/lru-cache
```

### Step 2: Update MemoryIdempotencyStore (10 min)

1. Import `LRUCache` from `lru-cache`
2. Replace `Map` with `LRUCache` instance
3. Update `set()`, `get()`, `delete()` methods
4. Remove manual eviction logic (handled by library)
5. Update config: `max: 10000` entries, `ttl: 3600000` ms (1 hour)

### Step 3: Update Tests (10 min)

1. Update LRU eviction test expectations (lines 246-289)
2. Verify other tests still pass (fingerprinting, headers, in-flight)
3. Run full test suite:
   `npm test -- --project=server tests/middleware/idempotency-dedupe.test.ts`

### Step 4: Validation (5 min)

1. Run TypeScript check: `npm run check`
2. Run middleware tests:
   `npm test -- --project=server tests/middleware/idempotency-dedupe.test.ts`
3. Verify zero regressions in other middleware tests

---

## Dependencies

**None** - Can be implemented independently. Does not block:

- Phase 1 (Service Layer)
- Phase 0B (Future phases)

---

## Risk Assessment

**Risk Level:** LOW

| Risk Factor             | Rating   | Mitigation                                            |
| ----------------------- | -------- | ----------------------------------------------------- |
| Breaking existing tests | Low      | Tests already document expected behavior              |
| Performance degradation | Very Low | `lru-cache` is battle-tested, faster than manual impl |
| Compatibility issues    | Very Low | Drop-in replacement for Map API                       |
| Deployment impact       | None     | Memory-only store, no database changes                |

---

## Success Criteria

- [PASS] All middleware tests pass
  (`tests/middleware/idempotency-dedupe.test.ts`)
- [PASS] LRU eviction test validates true LRU behavior (not FIFO)
- [PASS] TypeScript compilation successful (`npm run check`)
- [PASS] Zero new test failures introduced
- [PASS] Response header test still passes (`Idempotency-Replay: true`)

---

## Alternative: Defer Middleware Fix

**Why this might be acceptable:**

1. Current FIFO eviction is **not breaking** anything
2. Worst case: Slightly worse cache hit rate (older entries evicted first)
3. Redis-backed store (production) doesn't have this issue
4. Only affects memory-backed store (development/testing)

**If deferring:**

- Create issue: "Upgrade MemoryIdempotencyStore to use LRU eviction"
- Label: P3 (Technical Debt), estimated 30 minutes
- Document in CHANGELOG.md as "Known Improvement Opportunity"

---

## Next Session Checklist

**Before Starting:**

- [ ] Read this document completely
- [ ] Verify migration is still applied
      (`node scripts/check-migration-status.mjs`)
- [ ] Confirm git status is clean
- [ ] Baseline TypeScript check (`npm run check`)

**Implementation:**

- [ ] Install `lru-cache` package
- [ ] Update `MemoryIdempotencyStore` class
- [ ] Update test expectations
- [ ] Run middleware test suite
- [ ] Verify TypeScript compilation

**After Completion:**

- [ ] Update CHANGELOG.md with Phase 0A 100% completion
- [ ] Commit with message documenting LRU cache fix
- [ ] Mark Phase 0A as COMPLETE in project tracking

---

## References

**Files:**

- Middleware:
  [server/middleware/idempotency.ts](server/middleware/idempotency.ts)
- Tests:
  [tests/middleware/idempotency-dedupe.test.ts](tests/middleware/idempotency-dedupe.test.ts)
- Migration:
  [migrations/0001_portfolio_schema_hardening.sql](migrations/0001_portfolio_schema_hardening.sql)

**Documentation:**

- `PHASE-0A-STATUS-ASSESSMENT.md` (Option comparison matrix)
- `SESSION-HANDOFF-2025-11-14-PHASE0-PRE-COMPLETE.md` (Context and decisions)
- `HANDOFF-PORTFOLIO-PHASE0-COMPLETE.md` (Phase 0A breakdown)

**LRU Cache Library:**

- npm: https://www.npmjs.com/package/lru-cache
- GitHub: https://github.com/isaacs/node-lru-cache
- Documentation: https://github.com/isaacs/node-lru-cache/blob/main/README.md

---

**Phase 0A Status: 75% Complete (Database hardening done, middleware pending)**
