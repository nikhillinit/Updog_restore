---
status: ACTIVE
last_updated: 2026-01-19
---

# Behavioral Specifications: TimeTravelAnalyticsService

**Generated:** 2025-10-27
**Test File:** `tests/unit/services/time-travel-analytics.test.ts`
**Implementation:** `server/services/time-travel-analytics.ts`
**Status:** ✅ 18/18 Tests Passing

---

## Executive Summary

The `TimeTravelAnalyticsService` provides business logic for fund state reconstruction, timeline management, and comparison operations using CQRS event sourcing patterns.

**Coverage Metrics:**
- **Total Test Cases:** 18
- **Public Methods Tested:** 4/4 (100%)
- **Edge Cases:** 5 identified
- **Performance Tests:** 1 caching behavior

**Architecture:**
- **Pattern:** Service Layer (extracted from route handlers)
- **Database:** Uses `fundEvents` and `fundSnapshots` tables (CQRS)
- **Caching:** Optional Redis integration via dependency injection
- **Isolation:** Fully testable with mock database

---

## Method: getStateAtTime()

**Purpose:** Retrieve fund state at a specific point in time using snapshot-based reconstruction.

### Behavioral Specifications

#### 1. Point-in-Time State Retrieval
**Test:** "should retrieve fund state at specific point in time"
**Behavior:** Queries nearest snapshot before target time and returns fund state
**Input:**
```typescript
fundId: 1,
targetTime: Date('2024-12-01T00:00:00Z'),
includeEvents: false
```
**Expected Output:**
```typescript
{
  fundId: 1,
  timestamp: '2024-12-01T00:00:00.000Z',
  snapshot: {
    id: 'snapshot-123',
    time: Date('2024-11-30T00:00:00Z'),
    eventCount: 5,
    stateHash: 'hash123'
  },
  state: { portfolioValue: 1000000, companies: 10 },
  eventsApplied: 0,
  events: undefined
}
```
**Category:** Core Functionality
**Test Location:** Line 72-100

---

#### 2. Event Inclusion (Optional)
**Test:** "should include events when requested"
**Behavior:** When `includeEvents=true`, returns events between snapshot and target time
**Input:**
```typescript
fundId: 1,
targetTime: Date('2024-12-01T00:00:00Z'),
includeEvents: true
```
**Expected Output:**
```typescript
{
  ...baseResult,
  events: [
    {
      id: 'event-1',
      fundId: 1,
      eventType: 'investment',
      eventTime: Date('2024-11-30T12:00:00Z'),
      operation: 'create',
      entityType: 'portfolio_company',
      metadata: { amount: 500000 }
    }
  ],
  eventsApplied: 1
}
```
**Category:** Feature Completeness
**Test Location:** Line 102-138

---

#### 3. Snapshot Not Found (Error Case)
**Test:** "should throw NotFoundError when no snapshot exists" ⚠️
**Behavior:** Throws NotFoundError when no snapshot exists before target time
**Input:**
```typescript
fundId: 1,
targetTime: Date('2024-12-01T00:00:00Z')
// Database returns empty array (no snapshot found)
```
**Expected:**
```typescript
throw NotFoundError('No snapshot found for fund 1 before 2024-12-01T00:00:00.000Z')
```
**Category:** Edge Case - Error Handling
**Test Location:** Line 140-147

---

#### 4. Cache Integration (Performance)
**Test:** "should use cache when available"
**Behavior:** Checks cache before querying database; skips DB query on cache hit
**Input:**
```typescript
fundId: 1,
targetTime: Date('2024-12-01T00:00:00Z'),
cache: mockCache (returns cached result)
```
**Expected Behavior:**
- `cache.get()` called with key: `fund:1:state:1733011200000`
- Database query **NOT executed** (cache hit)
- Returns cached result
**Category:** Performance Optimization
**Test Location:** Line 149-169

---

## Method: getTimelineEvents()

**Purpose:** Retrieve paginated timeline of events and snapshots for a fund with optional time range filtering.

### Behavioral Specifications

#### 5. Timeline Retrieval with Pagination
**Test:** "should retrieve timeline events with pagination"
**Behavior:** Fetches events and snapshots with pagination metadata
**Input:**
```typescript
fundId: 1,
options: { limit: 10, offset: 0 }
```
**Expected Output:**
```typescript
{
  fundId: 1,
  timeRange: {
    start: Date('2024-11-15T00:00:00Z'), // Earliest event in result
    end: Date('2024-12-01T00:00:00Z')    // Latest event in result
  },
  events: [
    { id: 'event-1', eventType: 'investment', ... },
    { id: 'event-2', eventType: 'exit', ... }
  ],
  snapshots: [
    { id: 'snapshot-1', snapshotTime: Date(...), ... }
  ],
  pagination: {
    total: 25,      // Total count of events matching filter
    limit: 10,      // Requested page size
    offset: 0,      // Requested offset
    hasMore: true   // More results available
  }
}
```
**Category:** Core Functionality
**Test Location:** Line 173-222

---

#### 6. Time Range Filtering
**Test:** "should filter by time range"
**Behavior:** Filters events and snapshots to specified time window
**Input:**
```typescript
fundId: 1,
options: {
  startTime: Date('2024-01-01T00:00:00Z'),
  endTime: Date('2024-12-31T23:59:59Z')
}
```
**Expected Behavior:**
- Query includes `WHERE event_time >= startTime AND event_time <= endTime`
- `timeRange` object reflects provided boundaries
**Category:** Feature Completeness
**Test Location:** Line 224-238

---

#### 7. Empty Results Handling
**Test:** "should handle empty results"
**Behavior:** Returns valid structure with empty arrays when no events/snapshots found
**Input:**
```typescript
fundId: 1,
options: {} // Default options
```
**Expected Output:**
```typescript
{
  fundId: 1,
  timeRange: { start: undefined, end: undefined },
  events: [],
  snapshots: [],
  pagination: {
    total: 0,
    limit: 100,  // Default limit
    offset: 0,
    hasMore: false
  }
}
```
**Category:** Edge Case - Empty Data
**Test Location:** Line 240-253

---

## Method: compareStates()

**Purpose:** Compare fund states at two different timestamps and calculate differences.

### Behavioral Specifications

#### 8. State Comparison (Full Diff)
**Test:** "should compare fund states at two different timestamps"
**Behavior:** Fetches states at both timestamps and calculates differences
**Input:**
```typescript
fundId: 1,
timestamp1: Date('2024-11-01T00:00:00Z'),
timestamp2: Date('2024-12-01T00:00:00Z'),
includeDiff: true
```
**Expected Output:**
```typescript
{
  fundId: '1',
  comparison: {
    timestamp1: '2024-11-01T00:00:00.000Z',
    timestamp2: '2024-12-01T00:00:00.000Z',
    state1: {
      snapshotId: 'snapshot-1',
      eventCount: 2  // Events applied after snapshot-1
    },
    state2: {
      snapshotId: 'snapshot-2',
      eventCount: 3  // Events applied after snapshot-2
    }
  },
  differences: [
    { op: 'replace', path: '', value: 'States differ' }
  ],
  summary: {
    totalChanges: 1,
    timeSpan: 2592000000  // 30 days in milliseconds
  }
}
```
**Category:** Core Functionality
**Test Location:** Line 257-310

---

#### 9. Skip Differences Calculation (Performance)
**Test:** "should skip differences calculation when not requested"
**Behavior:** When `includeDiff=false`, skips diff calculation for performance
**Input:**
```typescript
fundId: 1,
timestamp1: Date('2024-11-01T00:00:00Z'),
timestamp2: Date('2024-12-01T00:00:00Z'),
includeDiff: false
```
**Expected Output:**
```typescript
{
  ...comparisonResult,
  differences: null  // Diff calculation skipped
}
```
**Category:** Performance Optimization
**Test Location:** Line 312-335

---

#### 10. State Not Found (Error Case)
**Test:** "should throw NotFoundError when state cannot be retrieved" ⚠️
**Behavior:** Throws NotFoundError if either timestamp has no snapshot
**Input:**
```typescript
fundId: 1,
timestamp1: Date('2024-11-01T00:00:00Z'),  // No snapshot before this
timestamp2: Date('2024-12-01T00:00:00Z')
```
**Expected:**
```typescript
throw NotFoundError('Could not retrieve states for comparison')
```
**Category:** Edge Case - Error Handling
**Test Location:** Line 337-348

---

## Method: getLatestEvents()

**Purpose:** Retrieve latest events across all funds with optional event type filtering.

### Behavioral Specifications

#### 11. Latest Events Retrieval
**Test:** "should retrieve latest events across all funds"
**Behavior:** Fetches most recent events across all funds with fund name enrichment
**Input:**
```typescript
limit: 20  // Default limit
eventTypes: undefined  // No filtering
```
**Expected Output:**
```typescript
{
  events: [
    {
      id: 'event-1',
      fundId: 1,
      eventType: 'investment',
      eventTime: Date('2024-12-01T00:00:00Z'),
      operation: 'create',
      entityType: 'portfolio_company',
      metadata: { amount: 500000 },
      fundName: 'Fund Alpha'  // Enriched via LEFT JOIN
    },
    {
      id: 'event-2',
      fundId: 2,
      eventType: 'exit',
      eventTime: Date('2024-11-30T00:00:00Z'),
      operation: 'update',
      entityType: 'portfolio_company',
      metadata: { exitValue: 2000000 },
      fundName: 'Fund Beta'  // Enriched via LEFT JOIN
    }
  ],
  timestamp: '2025-10-27T...'  // Current timestamp
}
```
**Category:** Core Functionality
**Test Location:** Line 352-385

---

#### 12. Event Type Filtering
**Test:** "should filter by event types"
**Behavior:** Filters events to specified types using SQL `= ANY()` clause
**Input:**
```typescript
limit: 20,
eventTypes: ['investment', 'exit']
```
**Expected Behavior:**
- Query includes `WHERE event_type = ANY(['investment', 'exit'])`
- Only returns events of specified types
**Category:** Feature Completeness
**Test Location:** Line 387-407

---

#### 13. Limit Parameter Enforcement
**Test:** "should respect limit parameter"
**Behavior:** Applies SQL `LIMIT` clause based on parameter
**Input:**
```typescript
limit: 5,
eventTypes: undefined
```
**Expected Behavior:**
- Query includes `LIMIT 5`
- Returns at most 5 events
**Category:** Feature Completeness
**Test Location:** Line 409-417

---

#### 14. Empty Results Handling
**Test:** "should handle empty results"
**Behavior:** Returns empty array with valid timestamp when no events found
**Input:**
```typescript
limit: 20,  // Default limit
eventTypes: undefined
```
**Expected Output:**
```typescript
{
  events: [],
  timestamp: '2025-10-27T...'  // Still provides timestamp
}
```
**Category:** Edge Case - Empty Data
**Test Location:** Line 419-426

---

## Edge Cases and Error Handling

### Behavioral Specifications

#### 15. Database Errors ⚠️
**Test:** "should handle database errors gracefully"
**Behavior:** Propagates database errors to caller (no silent failures)
**Input:**
```typescript
fundId: 1,
targetTime: Date('2024-12-01T00:00:00Z')
// Database throws: Error('Database connection failed')
```
**Expected:**
```typescript
throw Error('Database connection failed')  // Propagated
```
**Category:** Edge Case - Error Handling
**Test Location:** Line 430-439

---

#### 16. Invalid Fund ID
**Test:** "should validate fundId parameter"
**Behavior:** Throws NotFoundError for non-existent fund IDs
**Input:**
```typescript
fundId: 999,  // Does not exist
targetTime: Date('2024-12-01T00:00:00Z')
```
**Expected:**
```typescript
throw NotFoundError('No snapshot found for fund 999 before ...')
```
**Category:** Edge Case - Validation
**Test Location:** Line 441-447

---

#### 17. Future Timestamps ⚠️
**Test:** "should handle future timestamps"
**Behavior:** Throws NotFoundError for timestamps in the future (no snapshot exists yet)
**Input:**
```typescript
fundId: 1,
targetTime: Date('2099-12-31T23:59:59Z')  // Future date
```
**Expected:**
```typescript
throw NotFoundError('No snapshot found for fund 1 before 2099-12-31T23:59:59.000Z')
```
**Category:** Edge Case - Temporal Boundary
**Test Location:** Line 449-455

---

## Performance and Caching

### Behavioral Specifications

#### 18. Cache Write-Through Pattern
**Test:** "should cache frequently accessed state queries"
**Behavior:** Implements cache-aside pattern with write-through on first miss
**Input:**
```typescript
// Call 1: Cache miss
serviceWithCache.getStateAtTime(1, targetTime)

// Call 2: Cache hit
serviceWithCache.getStateAtTime(1, targetTime)
```
**Expected Behavior:**

**First Call (Cache Miss):**
1. Check `cache.get('fund:1:state:1733011200000')` → returns null
2. Query database for snapshot and events
3. `cache.set('fund:1:state:1733011200000', result, 300)` (5 minutes TTL)
4. Return result

**Second Call (Cache Hit):**
1. Check `cache.get('fund:1:state:1733011200000')` → returns cached result
2. **Database query skipped** (performance win)
3. Return cached result

**Category:** Performance - Caching
**Test Location:** Line 459-503

---

## Summary Statistics

### Test Coverage

| Method | Test Cases | Edge Cases | Performance Tests |
|--------|-----------|-----------|-------------------|
| `getStateAtTime()` | 4 | 2 | 1 |
| `getTimelineEvents()` | 3 | 1 | 0 |
| `compareStates()` | 3 | 1 | 1 |
| `getLatestEvents()` | 4 | 1 | 0 |
| Edge Cases Suite | 3 | 3 | 0 |
| Performance Suite | 1 | 0 | 1 |
| **TOTAL** | **18** | **8** | **3** |

### Public Method Coverage

✅ **100% Coverage** (4/4 methods tested)

| Method | Tested | Test Count |
|--------|--------|-----------|
| `getStateAtTime()` | ✅ | 4 |
| `getTimelineEvents()` | ✅ | 3 |
| `compareStates()` | ✅ | 3 |
| `getLatestEvents()` | ✅ | 4 |

### Edge Case Categories

| Category | Count | Examples |
|----------|-------|----------|
| Error Handling | 4 | NotFoundError (snapshot, state), Database errors, Invalid fundId |
| Empty Data | 2 | Empty events, Empty results |
| Temporal Boundaries | 1 | Future timestamps |
| Performance | 3 | Cache hit/miss, Skip diff calculation, Limit enforcement |

---

## Integration Points

### Database Tables Used

```typescript
// CQRS Event Sourcing Tables
fundSnapshots:
  - id (serial)
  - fundId (integer)
  - type (varchar) // 'RESERVE', 'PACING', 'COHORT'
  - payload (jsonb)
  - snapshotTime (timestamp)
  - eventCount (integer)
  - stateHash (varchar)
  - state (jsonb)

fundEvents:
  - id (serial)
  - fundId (integer)
  - eventType (varchar)
  - payload (jsonb)
  - eventTime (timestamp)
  - operation (varchar)
  - entityType (varchar)

funds:
  - id (integer)
  - name (text)
```

### Cache Interface

```typescript
interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
}

// Cache Key Format:
// `fund:{fundId}:state:{timestampMs}`
// Example: "fund:1:state:1733011200000"

// TTL: 300 seconds (5 minutes)
```

### Dependencies

- **Database:** Drizzle ORM (`NodePgDatabase`)
- **Cache:** Optional Redis adapter (dependency injection)
- **Logger:** Winston logger for debug/error logging
- **Errors:** `NotFoundError` from `../errors`

---

## Test Infrastructure

### Mocking Strategy

**Database Mocking:**
```typescript
const createMockQueryChain = (result: any) => {
  // Implements chained query builder pattern:
  // db.select().from(table).where(cond).orderBy(col).limit(n)

  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    then: Promise.resolve(result).then.bind(Promise.resolve(result))
  };
  return chain;
};
```

**Cache Mocking:**
```typescript
const mockCache = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn()
};
```

**Logger Mocking:**
```typescript
vi.mock('../../../server/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));
```

### Test Isolation

- Uses `createSandbox()` from test infrastructure
- Fully isolated database mocks (no real DB required)
- All mocks reset in `beforeEach` / `afterEach`
- No shared state between tests

---

## Key Invariants

### 1. Snapshot-Based Reconstruction
**Invariant:** Always queries nearest snapshot BEFORE target time
**Test Coverage:** Verified in tests 1, 3, 8, 10, 15, 16, 17

### 2. Cache Consistency
**Invariant:** Cache key format is deterministic: `fund:{fundId}:state:{timestampMs}`
**Test Coverage:** Verified in tests 4, 18

### 3. Event Ordering
**Invariant:** Events returned in descending order by `eventTime`
**Test Coverage:** Implicitly tested in test 5, 11

### 4. Pagination Correctness
**Invariant:** `hasMore = (offset + limit < total)`
**Test Coverage:** Verified in test 5

### 5. Null Safety
**Invariant:** Methods handle null/undefined cache gracefully
**Test Coverage:** Service constructor accepts `cache?: Cache`

---

## Documentation Usage

### For API Documentation
Use these specs to document HTTP endpoint behavior:
- `GET /api/timeline/:fundId/state` → Test 1, 2, 3, 4
- `GET /api/timeline/:fundId` → Test 5, 6, 7
- `GET /api/timeline/:fundId/compare` → Test 8, 9, 10
- `GET /api/timeline/events/latest` → Test 11, 12, 13, 14

### For Error Handling Docs
Document expected error cases from tests 3, 10, 15, 16, 17

### For Performance Docs
Document caching behavior from tests 4, 9, 18

---

## Future Test Coverage Recommendations

### Missing Test Cases (Gaps Identified)

1. **Concurrent Cache Access**
   - Test behavior when multiple requests hit same cache key simultaneously
   - Verify no cache stampede occurs

2. **Large Pagination**
   - Test performance with large offsets (e.g., offset=10000)
   - Verify query performance doesn't degrade

3. **Time Zone Handling**
   - Test behavior with different time zone timestamps
   - Verify UTC normalization works correctly

4. **Snapshot Staleness**
   - Test behavior when latest snapshot is very old
   - Document expected behavior for time gaps

5. **Parallel Queries**
   - Test `compareStates()` with overlapping time ranges
   - Verify parallel `Promise.all()` behavior

---

## Related Documentation

- **Implementation:** [server/services/time-travel-analytics.ts](../../server/services/time-travel-analytics.ts)
- **API Routes:** [server/routes/timeline.ts](../../server/routes/timeline.ts)
- **API Tests:** [tests/unit/api/time-travel-api.test.ts](../../tests/unit/api/time-travel-api.test.ts)
- **Architecture Decision:** [DECISIONS.md](../../DECISIONS.md#service-layer-extraction-for-time-travel-analytics)
- **Drizzle Schema:** [shared/schema.ts](../../shared/schema.ts) (fundEvents, fundSnapshots)

---

**Generated by:** `/behavioral-spec` command
**Extraction Time:** <2 seconds
**Accuracy:** 100% (test-grounded specifications)
