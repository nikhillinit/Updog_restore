---
status: ACTIVE
last_updated: 2026-01-19
---

# Phase 0B Service Layer - Quick Reference

**Date:** 2025-11-10
**Full Review:** See PHASE0B-SERVICE-ARCHITECTURE-REVIEW.md

---

## TL;DR - Core Decisions

### Architecture Pattern

```typescript
// DO: Standalone service class with direct Drizzle access
export class SnapshotService {
  async create(data: CreateSnapshotData): Promise<ForecastSnapshot> {
    const [snapshot] = await db.insert(forecastSnapshots)
      .values({ ...data })
      .onConflictDoNothing() // Database-level idempotency
      .returning();
    return snapshot;
  }
}

// DON'T: No repository pattern, no base class
class BaseService { } // ❌ Not in codebase
class SnapshotRepository { } // ❌ Adds unnecessary abstraction
```

### Transaction Management

```typescript
// DO: Import transaction function from pg-circuit
import { transaction } from '../db/pg-circuit';

await transaction(async (client) => {
  // Multi-step operations with automatic rollback
  await client.query(sql`UPDATE ...`);
  await client.query(sql`INSERT ...`);
});
```

### Idempotency

```typescript
// MIDDLEWARE: Handles API request idempotency (Redis, 5 min TTL)
router.post('/snapshots', idempotency(), handler);

// SERVICE: Handles database deduplication (PostgreSQL, permanent)
await db.insert(forecastSnapshots)
  .values({ idempotencyKey: data.key })
  .onConflictDoNothing(); // Respects unique index
```

### Optimistic Locking

```typescript
// DO: Use WHERE version = ? with version increment
await db.update(forecastSnapshots)
  .set({ name: 'Updated', version: data.version + 1n })
  .where(
    and(
      eq(forecastSnapshots.id, id),
      eq(forecastSnapshots.version, data.version) // Optimistic lock
    )
  )
  .returning();

// If result.length === 0 → throw ConflictError (409)
```

### Parent Entity Validation

```typescript
// DO: Always verify parent exists AND belongs to fund (security)
const [investment] = await db.select()
  .from(investments)
  .where(
    and(
      eq(investments.id, data.investmentId),
      eq(investments.fundId, fundId) // Prevent cross-fund access
    )
  );

if (!investment) {
  throw new NotFoundError(`Investment not found in fund ${fundId}`);
}
```

---

## Service Method Signatures

### SnapshotService

```typescript
class SnapshotService {
  // Create snapshot (status: pending, queue worker)
  async create(data: CreateSnapshotData): Promise<ForecastSnapshot>

  // List with cursor pagination + status filter
  async list(fundId: number, filter: SnapshotListFilter): Promise<{
    snapshots: ForecastSnapshot[];
    nextCursor?: string;
    hasMore: boolean;
  }>

  // Get by ID
  async get(snapshotId: string): Promise<ForecastSnapshot>

  // Update with optimistic locking
  async update(snapshotId: string, data: UpdateSnapshotData): Promise<ForecastSnapshot>
}
```

### LotService

```typescript
class LotService {
  // Create lot (validate investment belongs to fund)
  async create(fundId: number, data: CreateLotData): Promise<InvestmentLot>

  // List with filtering + pagination
  async list(fundId: number, filter: LotListFilter): Promise<{
    lots: InvestmentLot[];
    nextCursor?: string;
    hasMore: boolean;
  }>
}
```

---

## Error Handling

```typescript
// Throw domain-specific errors (not generic Error)
import { NotFoundError, ConflictError } from '../lib/errors';

// 404: Entity not found
throw new NotFoundError(`Snapshot ${id} not found`);

// 409: Version conflict (optimistic locking)
throw new ConflictError(`Version mismatch: expected ${v1}, current ${v2}`);
```

---

## Cursor Pagination

```typescript
// Encode cursor (base64)
private encodeCursor(timestamp: Date, id: string): string {
  return Buffer.from(JSON.stringify({ timestamp, id })).toString('base64');
}

// Decode cursor
private decodeCursor(cursor: string): { timestamp: Date; id: string } {
  const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
  return {
    timestamp: new Date(decoded.timestamp),
    id: decoded.id,
  };
}

// Use in query (compound index: timestamp DESC, id DESC)
const conditions = [
  eq(forecastSnapshots.fundId, fundId),
  lt(forecastSnapshots.snapshotTime, cursorTimestamp),
];

const limit = Math.min(filter.limit || 20, 100); // Clamp to 100
const fetchLimit = limit + 1; // Fetch 1 extra for hasMore

const rows = await db.select()
  .from(forecastSnapshots)
  .where(and(...conditions))
  .orderBy(desc(forecastSnapshots.snapshotTime), desc(forecastSnapshots.id))
  .limit(fetchLimit);

const hasMore = rows.length > limit;
const snapshots = rows.slice(0, limit);
```

---

## Worker Integration

```typescript
// SERVICE: Creates record, returns immediately
const snapshot = await snapshotService.create({
  fundId: 1,
  name: 'Q4 Forecast',
  idempotencyKey: 'key',
});

// ROUTE: Queues worker for async calculation
await snapshotQueue.add('calculate', {
  snapshotId: snapshot.id,
  fundId: snapshot.fundId,
}, {
  attempts: 3,
  timeout: 300000, // 5 minutes
  removeOnComplete: true,
});

// Return 202 Accepted
res.status(202)
  .header('Location', `/api/snapshots/${snapshot.id}`)
  .header('Retry-After', '30')
  .json(snapshot);
```

---

## Testing Checklist

### Unit Tests (TDD)

- [ ] create() success case
- [ ] create() throws NotFoundError if fund missing
- [ ] create() returns existing on idempotency collision
- [ ] update() success with version increment
- [ ] update() throws ConflictError on version mismatch
- [ ] list() pagination with cursor
- [ ] list() status filtering
- [ ] Security: Prevent cross-fund access

### Transaction Tests

- [ ] Atomic state capture (all 3 fields or none)
- [ ] Rollback on error during transaction
- [ ] No partial updates on failure

### Integration Tests (Phase 3)

- [ ] Middleware + Service idempotency together
- [ ] Worker processes queued job
- [ ] Status transitions: pending → calculating → complete

---

## Anti-Pattern Coverage

All 24 anti-patterns from ADR-011 covered:

- **Cursor (6):** ✅ Indexes, validation, opaque cursors, limit clamping, stable order, parameterized
- **Idempotency (7):** ✅ Database-backed, TTL, scoped keys, atomic check, fingerprint, response replay, LRU
- **Locking (5):** ✅ Optimistic only, bigint version, WHERE version=?, 409 response, retry guidance
- **Queue (6):** ✅ Max retries, timeout, stalled detection, error handling, cleanup, progress tracking

---

## Phase 0B Execution (4.5h)

### Batch 1: SnapshotService Core (1.5h)
- Create `server/services/snapshot-service.ts`
- Implement `create()`, `list()`, `get()`
- Write 10 unit tests (TDD)

### Batch 2: SnapshotService Updates (1h)
- Implement `update()` with optimistic locking
- Transaction for atomic state updates
- Write 5 unit tests (version conflicts)

### Batch 3: LotService (1.5h)
- Create `server/services/lot-service.ts`
- Implement `create()`, `list()`
- Cross-fund security validation
- Write 8 unit tests

### Batch 4: Integration (0.5h)
- Verify middleware integration
- Test `onConflictDoNothing()` behavior
- Document cursor helpers

---

## Key Takeaways

1. **No Repository Pattern** - Drizzle ORM is the abstraction
2. **No Base Class** - Standalone services with composition
3. **Trust Middleware** - Don't duplicate idempotency logic
4. **Workers Do Calculations** - Services orchestrate only
5. **Security First** - Always validate parent entity belongs to fund
6. **Transactions for Atomicity** - Multi-field updates in single transaction
7. **Optimistic Locking** - Version field + WHERE clause (no SELECT FOR UPDATE)
8. **Cursor Pagination** - Base64-encoded { timestamp, id } tuples

---

**For detailed examples and rationale, see PHASE0B-SERVICE-ARCHITECTURE-REVIEW.md**
