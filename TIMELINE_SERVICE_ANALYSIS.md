# Timeline Service Extraction Analysis

## 1. Business Logic to Extract (5 Functions)

### 1.1 fetchStateAtTime (HIGHEST PRIORITY)

- Location: Lines 379-415
- Status: Private helper function
- Extract to: TimeTravelAnalyticsService.getStateAtTime()
- Used by: /compare endpoint (line 293)
- Purpose: Find nearest snapshot before target timestamp, count events

### 1.2 Fund State at Point in Time

- Location: Lines 139-211 (GET /state)
- Extract to: TimeTravelAnalyticsService.getStateAtPointInTime()
- Logic:
  - Cache lookup with key fund:{fundId}:state:{timestamp}
  - Conditional event retrieval (includeEvents flag)
  - Cache write with 5-minute TTL
  - Response assembly

### 1.3 Timeline Events with Pagination

- Location: Lines 47-127 (GET /timeline/:fundId)
- Extract to: TimeTravelAnalyticsService.getTimelineEvents()
- Logic:
  - Dynamic WHERE condition building (lines 61-64)
  - Parallel query execution (lines 67-101)
  - Total count for pagination (lines 104-107)
  - Response envelope composition

### 1.4 State Comparison

- Location: Lines 277-331 (GET /compare)
- Extract to: TimeTravelAnalyticsService.compareStates()
- Logic:
  - Parallel state retrieval using getStateAtTime
  - Difference calculation (JSON comparison, extensible)
  - Time span metrics calculation

### 1.5 Latest Events Query

- Location: Lines 338-376 (GET /events/latest)
- Extract to: TimeTravelAnalyticsService.getLatestEvents()
- Features:
  - Left join with funds table
  - Optional event type filtering
  - Enrich with fund names

## 2. Database Operations (4 Query Patterns)

### Pattern A: Complex WHERE with AND conditions

Example: Lines 68-81 Build conditions array with optional time filters Execute
query with and(...conditions) Used in: timeline events, state queries

### Pattern B: Snapshot Discovery (CRITICAL)

Example: Lines 161-171, 381-391 Find: fundSnapshots WHERE fundId=X AND
snapshotTime <= targetTime Order by: snapshotTime DESC Limit: 1 Foundation for:
All point-in-time reconstruction

### Pattern C: Count Aggregation

Example: Lines 104-107, 396-405 Count matching records with
sql<number>`count(*)` Used for: Pagination, event counting

### Pattern D: Left Join

Example: Lines 354-369 fundEvents LEFT JOIN funds on fundId Enrich events with
fund names Used in: Latest events endpoint

### Database Indexes (from shared/schema.ts)

- fundSnapshots: (fundId, type, createdAt DESC)
- fundEvents: (fundId, createdAt DESC) Service consideration: Queries must
  respect these for performance

## 3. Helper Functions to Extract

### 3.1 fetchStateAtTime

- Current: Lines 379-415 (private function)
- Extract to: public method getStateAtTime()
- Returns: FundStateAtTime with snapshot + state + eventsApplied count

### 3.2 Time Range Condition Builder

- Current: Lines 61-64 (inline)
- Extract to: private buildTimeRangeConditions()
- Purpose: Build dynamic WHERE conditions based on optional start/end times

### 3.3 Cache Key Generation

- Current: Line 153 (inline)
- Extract to: private generateCacheKey(fundId, timestamp)
- Pattern: fund:{fundId}:state:{timestamp}

### 3.4 Cache Get/Set Wrappers

- Current: Lines 154-157, 207 (inline)
- Extract to:
  - private getCachedState(key)
  - private setCachedState(key, state, ttl)

## 4. Dependencies

### Dependency 1: Database (db)

- Import: Line 8
- Type: Drizzle ORM instance
- Injection: Constructor parameter
- Usage: All query patterns

### Dependency 2: Cache

- Current Access: Lines 152-154 via app.locals.cache
- Interface Needed: Cache { get(), set(), delete?() }
- Injection: Constructor parameter
- Usage: State caching with 5-minute TTL

### Dependency 3: Metrics

- Import: Line 16 - recordBusinessMetric
- Usage Locations:
  - Line 109: timeline_query / success
  - Line 156: state_query / cache_hit
  - Line 209: state_query / success
  - Line 252: snapshot_creation / queued
  - Line 309: state_comparison / success
- Decision: Keep in routes for endpoint-level metrics

### Dependency 4: Logger

- Import: Line 15
- Usage: Line 247 (optional, info level)
- Injection: Optional constructor parameter

### Dependency 5: Error Types

- Import: Line 14
- Types: NotFoundError (404), ValidationError (400)
- Service throws: Same errors, routes translate to HTTP

## 5. Route Responsibilities (What Stays)

- HTTP Method Routing: Decide GET/POST/DELETE
- Parameter Parsing: Extract and coerce request.params
- Validation Schemas: Define Zod schemas (lines 21-41)
- Response Formatting: Shape HTTP response envelopes
- Middleware Orchestration: Wire up validateRequest + asyncHandler
- Error Translation: Map service errors to HTTP status codes
- Metric Recording Entry Points: Record operation timing

## 6. Proposed Service Class

### Class: TimeTravelAnalyticsService

Location: server/services/time-travel-analytics.ts

Constructor: constructor( private db: Database, private cache: Cache, private
logger?: Logger )

Public Methods:

- async getStateAtTime(fundId, targetTime, includeEvents?)
- async getTimelineEvents(fundId, options)
- async compareStates(fundId, timestamp1, timestamp2, includeDiff?)
- async getLatestEvents(limit, eventTypes?)

Private Methods:

- buildTimeRangeConditions()
- generateCacheKey()
- getCachedState()
- setCachedState()

Return Types:

- FundStateAtTime { snapshot, state, eventsApplied }
- TimelineResult { fundId, timeRange, events, snapshots, pagination }
- ComparisonResult { fundId, comparison, differences, summary }
- LatestEventResult { id, fundId, eventType, eventTime, fundName }

## 7. Implementation Checklist

Phase 1: Service Interface

- [ ] Create server/services/time-travel-analytics.ts
- [ ] Define FundStateAtTime interface
- [ ] Define TimelineResult interface
- [ ] Define return types
- [ ] Stub method signatures

Phase 2: Implementation

- [ ] Move fetchStateAtTime logic
- [ ] Move timeline query logic
- [ ] Move comparison logic
- [ ] Move latest events logic
- [ ] Add cache integration
- [ ] Add error handling

Phase 3: Dependency Injection

- [ ] Define Cache interface
- [ ] Create service in server.ts
- [ ] Pass service to route handlers

Phase 4: Route Refactoring

- [ ] Replace inline queries with service calls
- [ ] Keep validation/response formatting
- [ ] Keep metric recording
- [ ] Keep error translation

Phase 5: Testing

- [ ] Unit tests for service
- [ ] Integration tests
- [ ] Cache behavior tests
- [ ] Error scenario tests

Phase 6: Documentation

- [ ] Add JSDoc comments
- [ ] Update DECISIONS.md
- [ ] Document cache strategy
- [ ] Document error handling

## 8. Key Insights

1. Single Responsibility: Service = business logic, Routes = HTTP
2. Testability: Service methods testable with mock db
3. Cache Management: Service owns cache key generation + TTL
4. Error Handling: Service throws domain errors, routes translate
5. Metrics: Keep endpoint-level in routes
6. Performance: Preserve parallel query execution
7. Type Safety: Define Cache interface for type safety

## 9. Performance Considerations

Critical Queries:

1. Snapshot discovery (Pattern B)
   - Index: (fundId, createdAt DESC)
   - Frequent: Every point-in-time query
   - Essential for performance

2. Event filtering with time range (Pattern A)
   - Index: (fundId, createdAt DESC)
   - Critical for timeline queries
   - Time-based filtering is key

3. Event counting (Pattern C)
   - Leverages (fundId, createdAt DESC) index
   - Used for pagination

Actions:

- Service should preserve Promise.all for parallel execution
- Monitor query performance with metrics
- Consider query explaining for optimization
