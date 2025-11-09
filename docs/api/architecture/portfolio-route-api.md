# Portfolio Route REST API Architecture

**Version:** 1.0.0
**Created:** 2025-11-08
**Status:** Ready for Implementation
**Phase:** Phase 3 - API Route Implementation

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Endpoint Design Patterns](#2-endpoint-design-patterns)
3. [Error Handling Strategy](#3-error-handling-strategy)
4. [Middleware Stack](#4-middleware-stack)
5. [Database Transaction Patterns](#5-database-transaction-patterns)
6. [Background Job Integration (BullMQ)](#6-background-job-integration-bullmq)
7. [File Structure](#7-file-structure)
8. [Testing Strategy Summary](#8-testing-strategy-summary)
9. [Implementation Checklist](#9-implementation-checklist)
10. [Success Criteria](#10-success-criteria)

---

## 1. Architecture Overview

### 1.1 Tech Stack

**Frontend → Backend Flow:**
```
React → TanStack Query → Express API → PostgreSQL/Redis → BullMQ Workers
```

**Core Technologies:**
- **Express.js** - REST API framework
- **TypeScript** - Type safety (strict mode)
- **Zod** - Runtime validation (see `shared/schemas/portfolio-route.ts`)
- **Drizzle ORM** - Type-safe database queries
- **PostgreSQL** - Primary data store
- **BullMQ + Redis** - Background job processing
- **Testcontainers** - Integration testing

### 1.2 API Endpoints

The Portfolio Route API provides **6 RESTful endpoints** across **3 resource types**:

#### Forecast Snapshots (3 endpoints)
1. **POST /api/funds/:fundId/portfolio/snapshots** - Create snapshot (202 Accepted)
2. **GET /api/funds/:fundId/portfolio/snapshots** - List snapshots (cursor pagination)
3. **GET /api/snapshots/:snapshotId** - Get snapshot status (polling)
4. **PUT /api/snapshots/:snapshotId** - Update snapshot (optimistic locking)

#### Investment Lots (2 endpoints)
5. **POST /api/funds/:fundId/portfolio/lots** - Create lot (idempotent)
6. **GET /api/funds/:fundId/portfolio/lots** - List lots (filtering)

### 1.3 Key Architectural Patterns

| Pattern | Purpose | Endpoints |
|---------|---------|-----------|
| **Async Operations (202 Accepted)** | Long-running calculations | POST /snapshots |
| **Cursor Pagination** | Consistent results at scale | GET /snapshots, GET /lots |
| **Optimistic Locking** | Prevent concurrent update conflicts | PUT /snapshots/:id |
| **Idempotency** | Prevent duplicate requests | POST /snapshots, POST /lots |
| **Status Polling** | Monitor async job progress | GET /snapshots/:id |
| **Circuit Breaker** | Database fault tolerance | All endpoints |

### 1.4 Data Flow Example

**Snapshot Creation Workflow:**
```
1. Client → POST /api/funds/1/portfolio/snapshots
   ↓
2. API validates request (Zod)
   ↓
3. Database creates snapshot (status: pending)
   ↓
4. BullMQ job queued (snapshot-calculation)
   ↓
5. API returns 202 Accepted:
   {
     snapshotId: "uuid",
     status: "pending",
     statusUrl: "/api/snapshots/uuid",
     retryAfter: 5
   }
   ↓
6. Worker picks up job → updates status to "calculating"
   ↓
7. Worker calculates MOIC → updates status to "complete"
   ↓
8. Client polls GET /api/snapshots/uuid → receives final result
```

---

## 2. Endpoint Design Patterns

### 2.1 POST /api/funds/:fundId/portfolio/snapshots (202 Accepted)

**Pattern:** Async operation with polling

**Flow:**
1. Validate request (Zod: `CreateSnapshotRequestSchema`)
2. Check idempotency key (if provided) - return existing if duplicate
3. Create snapshot record in database (status: `pending`)
4. Queue BullMQ job for MOIC calculation
5. Return 202 with snapshot ID and status URL

**Request:**
```typescript
POST /api/funds/1/portfolio/snapshots
Content-Type: application/json
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

{
  "name": "Q4 2024 Conservative Scenario",
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (202 Accepted):**
```typescript
{
  "snapshotId": "660e8400-e29b-41d4-a716-446655440111",
  "status": "pending",
  "statusUrl": "/api/snapshots/660e8400-e29b-41d4-a716-446655440111",
  "retryAfter": 5
}
```

**Handler Structure (~50 lines):**
```typescript
router.post('/funds/:fundId/portfolio/snapshots', asyncHandler(async (req, res) => {
  // 1. Validate path params
  const { fundId } = FundIdParamSchema.parse(req.params);

  // 2. Validate request body
  const bodyResult = CreateSnapshotRequestSchema.safeParse(req.body);
  if (!bodyResult.success) {
    return res.status(400).json({
      error: 'invalid_request_body',
      message: 'Invalid snapshot data',
      details: bodyResult.error.format()
    });
  }

  const { name, idempotencyKey } = bodyResult.data;

  // 3. Check idempotency (if key provided)
  if (idempotencyKey) {
    const existing = await db.query.forecastSnapshots.findFirst({
      where: eq(forecastSnapshots.idempotencyKey, idempotencyKey)
    });

    if (existing) {
      return res.status(202).json({
        snapshotId: existing.id,
        status: existing.status,
        statusUrl: `/api/snapshots/${existing.id}`,
        retryAfter: 5
      });
    }
  }

  // 4. Create snapshot record (transaction)
  const snapshot = await transaction(async (client) => {
    await verifyFundExists(client, fundId);

    const [newSnapshot] = await client
      .insert(forecastSnapshots)
      .values({
        fundId,
        name,
        status: 'pending',
        idempotencyKey,
        snapshotTime: new Date(),
      })
      .returning();

    return newSnapshot;
  });

  // 5. Queue background job
  await snapshotQueue.add('calculate-snapshot', {
    snapshotId: snapshot.id,
    fundId
  });

  // 6. Return 202 Accepted
  res.setHeader('Retry-After', '5');
  res.setHeader('Location', `/api/snapshots/${snapshot.id}`);
  return res.status(202).json({
    snapshotId: snapshot.id,
    status: snapshot.status,
    statusUrl: `/api/snapshots/${snapshot.id}`,
    retryAfter: 5
  });
}));
```

**Database:** Single INSERT with foreign key check
**Queue:** BullMQ job added with `{ snapshotId, fundId }`

---

### 2.2 GET /api/funds/:fundId/portfolio/snapshots (cursor pagination)

**Pattern:** Cursor-based pagination with filters

**Flow:**
1. Validate query params (Zod: `ListSnapshotsRequestSchema`)
2. Build query conditions (status filter, cursor)
3. Fetch `limit + 1` rows (to detect if more results exist)
4. Return paginated response

**Request:**
```typescript
GET /api/funds/1/portfolio/snapshots?status=complete&limit=20&cursor=660e8400-e29b-41d4-a716-446655440111
```

**Response (200 OK):**
```typescript
{
  "snapshots": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440111",
      "fundId": 1,
      "name": "Q4 2024 Conservative Scenario",
      "status": "complete",
      "calculatedMetrics": { "irr": 0.185, "moic": 2.4 },
      "snapshotTime": "2025-11-08T10:30:00.000Z",
      "version": 1,
      "createdAt": "2025-11-08T10:30:00.000Z",
      "updatedAt": "2025-11-08T10:35:00.000Z"
    }
  ],
  "pagination": {
    "nextCursor": "770e8400-e29b-41d4-a716-446655440222",
    "hasMore": true
  }
}
```

**Handler Structure (~40 lines):**
```typescript
router.get('/funds/:fundId/portfolio/snapshots', asyncHandler(async (req, res) => {
  const { fundId } = FundIdParamSchema.parse(req.params);

  const queryResult = ListSnapshotsRequestSchema.safeParse(req.query);
  if (!queryResult.success) {
    return res.status(400).json({
      error: 'invalid_query_parameters',
      message: 'Invalid query parameters',
      details: queryResult.error.format()
    });
  }

  const { status, cursor, limit } = queryResult.data;

  // Build query conditions
  const conditions: SQL[] = [eq(forecastSnapshots.fundId, fundId)];

  if (status) {
    conditions.push(eq(forecastSnapshots.status, status));
  }

  if (cursor) {
    // For DESC ordering with UUID cursors, use id < cursor
    conditions.push(sql`${forecastSnapshots.id} < ${cursor}`);
  }

  // Fetch limit + 1 to detect if there are more results
  const fetchLimit = limit + 1;

  const results = await db
    .select()
    .from(forecastSnapshots)
    .where(and(...conditions))
    .orderBy(desc(forecastSnapshots.snapshotTime), desc(forecastSnapshots.id))
    .limit(fetchLimit);

  // Check if we have more results
  const hasMore = results.length > limit;
  const snapshots = hasMore ? results.slice(0, limit) : results;

  // Get next cursor (last item's ID)
  const nextCursor = hasMore && snapshots.length > 0
    ? snapshots[snapshots.length - 1].id
    : undefined;

  return res.status(200).json({
    snapshots,
    pagination: {
      nextCursor,
      hasMore
    }
  });
}));
```

**Database:** SELECT with WHERE + ORDER BY + LIMIT

---

### 2.3 GET /api/snapshots/:snapshotId (status polling)

**Pattern:** Resource retrieval with progress

**Flow:**
1. Validate snapshot ID (UUID format)
2. Fetch snapshot from database
3. If `status === 'calculating'`: fetch progress from Redis
4. If not complete: include `retryAfter` header
5. Return snapshot with optional progress metadata

**Request:**
```typescript
GET /api/snapshots/660e8400-e29b-41d4-a716-446655440111
```

**Response (200 OK):**
```typescript
{
  "snapshot": {
    "id": "660e8400-e29b-41d4-a716-446655440111",
    "fundId": 1,
    "name": "Q4 2024 Conservative Scenario",
    "status": "calculating",
    "calculatedMetrics": null,
    "snapshotTime": "2025-11-08T10:30:00.000Z",
    "version": 1,
    "createdAt": "2025-11-08T10:30:00.000Z",
    "updatedAt": "2025-11-08T10:31:00.000Z"
  },
  "progress": {
    "current": 50,
    "total": 200
  },
  "retryAfter": 5
}
```

**Handler Structure (~35 lines):**
```typescript
router.get('/snapshots/:snapshotId', asyncHandler(async (req, res) => {
  const { snapshotId } = SnapshotIdParamSchema.parse(req.params);

  const snapshot = await db.query.forecastSnapshots.findFirst({
    where: eq(forecastSnapshots.id, snapshotId)
  });

  if (!snapshot) {
    return res.status(404).json({
      error: 'snapshot_not_found',
      message: `Snapshot ${snapshotId} not found`
    });
  }

  const response: SnapshotStatusResponse = { snapshot };

  // If calculating, fetch progress from Redis
  if (snapshot.status === 'calculating') {
    const progressKey = `snapshot:${snapshotId}:progress`;
    const progressData = await redis.get(progressKey);

    if (progressData) {
      response.progress = JSON.parse(progressData);
    }

    response.retryAfter = 5;
    res.setHeader('Retry-After', '5');
  }

  return res.status(200).json(response);
}));
```

**Database:** Single SELECT by ID
**Redis:** Optional GET for progress data

---

### 2.4 POST /api/funds/:fundId/portfolio/lots (idempotent)

**Pattern:** Synchronous creation with validation

**Flow:**
1. Validate request (Zod: `CreateLotRequestSchema` with cost basis refinement)
2. Check idempotency key (if provided) - return existing if duplicate
3. Verify fund + investment exist (transaction)
4. Create lot record
5. Return 201 with lot

**Request:**
```typescript
POST /api/funds/1/portfolio/lots
Content-Type: application/json
Idempotency-Key: 770e8400-e29b-41d4-a716-446655440333

{
  "investmentId": 42,
  "lotType": "follow_on",
  "sharePriceCents": "250000",
  "sharesAcquired": "1000.50000000",
  "costBasisCents": "250125000",
  "idempotencyKey": "770e8400-e29b-41d4-a716-446655440333"
}
```

**Response (201 Created):**
```typescript
{
  "lot": {
    "id": "880e8400-e29b-41d4-a716-446655440444",
    "investmentId": 42,
    "lotType": "follow_on",
    "sharePriceCents": "250000",
    "sharesAcquired": "1000.50000000",
    "costBasisCents": "250125000",
    "version": 1,
    "idempotencyKey": "770e8400-e29b-41d4-a716-446655440333",
    "createdAt": "2025-11-08T11:00:00.000Z",
    "updatedAt": "2025-11-08T11:00:00.000Z"
  },
  "created": true
}
```

**Handler Structure (~60 lines):**
```typescript
router.post('/funds/:fundId/portfolio/lots', asyncHandler(async (req, res) => {
  const { fundId } = FundIdParamSchema.parse(req.params);

  const bodyResult = CreateLotRequestSchema.safeParse(req.body);
  if (!bodyResult.success) {
    return res.status(400).json({
      error: 'invalid_request_body',
      message: 'Invalid lot data',
      details: bodyResult.error.format()
    });
  }

  const { investmentId, lotType, sharePriceCents, sharesAcquired, costBasisCents, idempotencyKey } = bodyResult.data;

  // Check idempotency
  if (idempotencyKey) {
    const existing = await db.query.investmentLots.findFirst({
      where: eq(investmentLots.idempotencyKey, idempotencyKey)
    });

    if (existing) {
      return res.status(200).json({
        lot: existing,
        created: false
      });
    }
  }

  // Create lot (transaction)
  const lot = await transaction(async (client) => {
    // Verify fund exists
    await verifyFundExists(client, fundId);

    // Verify investment exists and belongs to fund
    const investment = await client.query.investments.findFirst({
      where: and(
        eq(investments.id, investmentId),
        eq(investments.fundId, fundId)
      )
    });

    if (!investment) {
      const error: any = new Error(`Investment ${investmentId} not found in fund ${fundId}`);
      error.statusCode = 404;
      throw error;
    }

    // Insert lot
    const [newLot] = await client
      .insert(investmentLots)
      .values({
        investmentId,
        lotType,
        sharePriceCents: BigInt(sharePriceCents),
        sharesAcquired,
        costBasisCents: BigInt(costBasisCents),
        idempotencyKey,
        version: 1
      })
      .returning();

    return newLot;
  });

  return res.status(201).json({
    lot: {
      ...lot,
      sharePriceCents: lot.sharePriceCents.toString(),
      costBasisCents: lot.costBasisCents.toString()
    },
    created: true
  });
}));
```

**Database:** Transaction (verify fund + investment + INSERT)

---

### 2.5 GET /api/funds/:fundId/portfolio/lots (filtering + pagination)

**Pattern:** Filtered list with cursor pagination

**Flow:**
1. Validate query params (Zod: `ListLotsRequestSchema`)
2. Build query conditions (`investmentId`, `lotType`, cursor)
3. Fetch `limit + 1` rows
4. Return paginated response

**Request:**
```typescript
GET /api/funds/1/portfolio/lots?investmentId=42&lotType=follow_on&limit=50&cursor=880e8400-e29b-41d4-a716-446655440444
```

**Response (200 OK):**
```typescript
{
  "lots": [
    {
      "id": "880e8400-e29b-41d4-a716-446655440444",
      "investmentId": 42,
      "lotType": "follow_on",
      "sharePriceCents": "250000",
      "sharesAcquired": "1000.50000000",
      "costBasisCents": "250125000",
      "version": 1,
      "idempotencyKey": "770e8400-e29b-41d4-a716-446655440333",
      "createdAt": "2025-11-08T11:00:00.000Z",
      "updatedAt": "2025-11-08T11:00:00.000Z"
    }
  ],
  "pagination": {
    "nextCursor": "990e8400-e29b-41d4-a716-446655440555",
    "hasMore": true
  }
}
```

**Handler Structure (~45 lines):**
```typescript
router.get('/funds/:fundId/portfolio/lots', asyncHandler(async (req, res) => {
  const { fundId } = FundIdParamSchema.parse(req.params);

  const queryResult = ListLotsRequestSchema.safeParse(req.query);
  if (!queryResult.success) {
    return res.status(400).json({
      error: 'invalid_query_parameters',
      message: 'Invalid query parameters',
      details: queryResult.error.format()
    });
  }

  const { investmentId, lotType, cursor, limit } = queryResult.data;

  // Build query - need to join with investments to filter by fundId
  const conditions: SQL[] = [eq(investments.fundId, fundId)];

  if (investmentId) {
    conditions.push(eq(investmentLots.investmentId, investmentId));
  }

  if (lotType) {
    conditions.push(eq(investmentLots.lotType, lotType));
  }

  if (cursor) {
    conditions.push(sql`${investmentLots.id} < ${cursor}`);
  }

  const fetchLimit = limit + 1;

  const results = await db
    .select({ lot: investmentLots })
    .from(investmentLots)
    .innerJoin(investments, eq(investmentLots.investmentId, investments.id))
    .where(and(...conditions))
    .orderBy(desc(investmentLots.createdAt), desc(investmentLots.id))
    .limit(fetchLimit);

  const hasMore = results.length > limit;
  const lots = hasMore ? results.slice(0, limit).map(r => r.lot) : results.map(r => r.lot);

  const nextCursor = hasMore && lots.length > 0
    ? lots[lots.length - 1].id
    : undefined;

  return res.status(200).json({
    lots: lots.map(lot => ({
      ...lot,
      sharePriceCents: lot.sharePriceCents.toString(),
      costBasisCents: lot.costBasisCents.toString()
    })),
    pagination: {
      nextCursor,
      hasMore
    }
  });
}));
```

**Database:** SELECT with JOIN + WHERE + ORDER BY + LIMIT

---

### 2.6 PUT /api/snapshots/:snapshotId (optimistic locking)

**Pattern:** Update with version check

**Flow:**
1. Validate request (Zod: `UpdateSnapshotRequestSchema`)
2. Validate status transition (use `validateStatusTransition` helper)
3. Update with `WHERE version = ?` clause
4. Check `rowCount` (if 0, return 409 Conflict)
5. Return updated snapshot

**Request:**
```typescript
PUT /api/snapshots/660e8400-e29b-41d4-a716-446655440111
Content-Type: application/json

{
  "name": "Q4 2024 Updated Name",
  "status": "complete",
  "calculatedMetrics": {
    "irr": 0.185,
    "moic": 2.4
  },
  "version": 2
}
```

**Response (200 OK):**
```typescript
{
  "snapshot": {
    "id": "660e8400-e29b-41d4-a716-446655440111",
    "fundId": 1,
    "name": "Q4 2024 Updated Name",
    "status": "complete",
    "calculatedMetrics": {
      "irr": 0.185,
      "moic": 2.4
    },
    "snapshotTime": "2025-11-08T10:30:00.000Z",
    "version": 3,
    "createdAt": "2025-11-08T10:30:00.000Z",
    "updatedAt": "2025-11-08T14:45:00.000Z"
  },
  "updated": true
}
```

**Handler Structure (~50 lines):**
```typescript
router.put('/snapshots/:snapshotId', asyncHandler(async (req, res) => {
  const { snapshotId } = SnapshotIdParamSchema.parse(req.params);

  const bodyResult = UpdateSnapshotRequestSchema.safeParse(req.body);
  if (!bodyResult.success) {
    return res.status(400).json({
      error: 'invalid_request_body',
      message: 'Invalid update data',
      details: bodyResult.error.format()
    });
  }

  const { name, status, calculatedMetrics, version } = bodyResult.data;

  // Fetch current snapshot
  const currentSnapshot = await db.query.forecastSnapshots.findFirst({
    where: eq(forecastSnapshots.id, snapshotId)
  });

  if (!currentSnapshot) {
    return res.status(404).json({
      error: 'snapshot_not_found',
      message: `Snapshot ${snapshotId} not found`
    });
  }

  // Validate status transition (if status is being updated)
  if (status && status !== currentSnapshot.status) {
    if (!validateStatusTransition(currentSnapshot.status, status)) {
      return res.status(400).json({
        error: 'invalid_status_transition',
        message: `Cannot transition from '${currentSnapshot.status}' to '${status}'`,
        currentStatus: currentSnapshot.status,
        requestedStatus: status
      });
    }
  }

  // Optimistic locking update
  const updateData: any = {
    version: version + 1,
    updatedAt: new Date()
  };

  if (name !== undefined) updateData.name = name;
  if (status !== undefined) updateData.status = status;
  if (calculatedMetrics !== undefined) updateData.calculatedMetrics = calculatedMetrics;

  const result = await db
    .update(forecastSnapshots)
    .set(updateData)
    .where(and(
      eq(forecastSnapshots.id, snapshotId),
      eq(forecastSnapshots.version, version)
    ))
    .returning();

  if (result.length === 0) {
    return res.status(409).json({
      error: 'version_conflict',
      message: `Version mismatch - snapshot has been modified. Expected version ${version}, current version ${currentSnapshot.version}.`,
      currentVersion: currentSnapshot.version
    });
  }

  return res.status(200).json({
    snapshot: result[0],
    updated: true
  });
}));
```

**Database:** UPDATE with version check (`WHERE version = ?`)

---

## 3. Error Handling Strategy

### 3.1 Consistent Error Format

**ApiError Interface:**
```typescript
interface ApiError {
  error: string;        // Error code (snake_case)
  message: string;      // Human-readable message
  details?: unknown;    // Zod errors, etc.
  correlationId?: string; // For tracing
}
```

### 3.2 HTTP Status Codes

| Code | Usage | Example |
|------|-------|---------|
| 200 OK | Successful GET/PUT | Retrieved snapshot |
| 201 Created | Successful POST (synchronous) | Created lot |
| 202 Accepted | Async operation queued | Created snapshot (pending calculation) |
| 400 Bad Request | Validation errors | Invalid Zod schema |
| 404 Not Found | Resource not found | Snapshot ID doesn't exist |
| 409 Conflict | Version mismatch, idempotency conflict | Optimistic locking failure |
| 500 Internal Server Error | Unexpected errors | Database connection failed |

### 3.3 Error Handling Pattern

**Use `asyncHandler` wrapper (from existing patterns):**
```typescript
import { asyncHandler } from '../middleware/async';

router.post('/endpoint', asyncHandler(async (req, res) => {
  // No try-catch needed - asyncHandler catches all
  const data = await someAsyncOperation();
  res.json(data);
}));
```

**Benefits:**
- No boilerplate try-catch blocks
- Consistent error responses
- Prevents unhandled promise rejections

**Example Error Responses:**
```typescript
// 400 - Validation Error
{
  "error": "invalid_query_parameters",
  "message": "Invalid query parameters",
  "details": {
    "limit": {
      "_errors": ["Number must be less than or equal to 100"]
    }
  }
}

// 404 - Not Found
{
  "error": "fund_not_found",
  "message": "Fund with ID 123 not found"
}

// 409 - Conflict (Optimistic Locking)
{
  "error": "version_conflict",
  "message": "Version mismatch - snapshot has been modified",
  "currentVersion": 3
}

// 500 - Internal Error
{
  "error": "internal_server_error",
  "message": "Database connection failed",
  "correlationId": "abc-123-def"
}
```

---

## 4. Middleware Stack

### 4.1 Request Lifecycle

```
Request → [asyncHandler] → [validateRequest] → [handler] → Response
           ↓ errors          ↓ 400 errors       ↓ business logic
        [errorHandler]
```

### 4.2 Recommended Middleware

| Middleware | Purpose | Usage |
|------------|---------|-------|
| `asyncHandler` | Catch async errors | Wrap all route handlers |
| `validateRequest(schema)` | Zod validation | Optional (can do inline validation) |
| `requireAuth` | JWT authentication | Protect endpoints (if needed) |
| `idempotency` | Duplicate request detection | POST endpoints |

**Example Middleware Stack:**
```typescript
// Route-level middleware
router.post('/funds/:fundId/portfolio/lots',
  asyncHandler(async (req, res) => {
    // Inline validation (recommended for Portfolio Route)
    const bodyResult = CreateLotRequestSchema.safeParse(req.body);
    if (!bodyResult.success) {
      return res.status(400).json({
        error: 'invalid_request_body',
        message: 'Invalid lot data',
        details: bodyResult.error.format()
      });
    }

    // Business logic
    const lot = await createLot(bodyResult.data);
    return res.status(201).json({ lot, created: true });
  })
);
```

---

## 5. Database Transaction Patterns

### 5.1 Simple Queries (Drizzle ORM)

**Use for single-table queries:**
```typescript
const snapshots = await db
  .select()
  .from(forecastSnapshots)
  .where(eq(forecastSnapshots.fundId, fundId))
  .limit(limit);
```

### 5.2 Transactions (Multi-Step Operations)

**Use `transaction()` wrapper for atomicity:**
```typescript
import { transaction } from '../db/pg-circuit';

const lot = await transaction(async (client) => {
  // 1. Verify fund exists
  await verifyFundExists(client, fundId);

  // 2. Verify investment exists
  const investment = await client.query.investments.findFirst({
    where: and(
      eq(investments.id, investmentId),
      eq(investments.fundId, fundId)
    )
  });

  if (!investment) {
    const error: any = new Error(`Investment not found`);
    error.statusCode = 404;
    throw error;
  }

  // 3. Insert lot
  const [newLot] = await client
    .insert(investmentLots)
    .values({ ... })
    .returning();

  return newLot;
});
```

**Benefits:**
- All-or-nothing execution (atomicity)
- Prevents partial updates
- Automatic rollback on errors

### 5.3 Optimistic Locking

**Use version field in WHERE clause:**
```typescript
const result = await db
  .update(forecastSnapshots)
  .set({
    name: 'Updated Name',
    version: version + 1,
    updatedAt: new Date()
  })
  .where(and(
    eq(forecastSnapshots.id, snapshotId),
    eq(forecastSnapshots.version, version) // Critical!
  ))
  .returning();

if (result.length === 0) {
  throw new ConflictError('Version mismatch - resource was modified');
}
```

**Prevents:**
- Lost updates (concurrent modification)
- Race conditions

---

## 6. Background Job Integration (BullMQ)

### 6.1 Queue Design

**Queue:** `snapshot-calculation`
**Worker:** Calculate MOIC for all lots in snapshot
**Job Data:**
```typescript
{
  snapshotId: string;  // UUID
  fundId: number;      // Integer
}
```

### 6.2 Job Flow

```
1. POST /snapshots creates snapshot (status: pending)
   ↓
2. Queue job: snapshotQueue.add('calculate-snapshot', { snapshotId, fundId })
   ↓
3. Worker picks up job:
   - Update status to 'calculating'
   - Calculate MOIC for each lot
   - Store results in calculatedMetrics (JSONB)
   - Update status to 'complete' or 'error'
   ↓
4. Client polls GET /snapshots/:id until status === 'complete'
```

### 6.3 Progress Tracking

**Store progress in Redis:**
```typescript
// Worker updates progress
await redis.set(
  `snapshot:${snapshotId}:progress`,
  JSON.stringify({ current: 50, total: 200 }),
  'EX', 3600 // Expire after 1 hour
);

// API endpoint reads progress
const progressData = await redis.get(`snapshot:${snapshotId}:progress`);
if (progressData) {
  response.progress = JSON.parse(progressData);
}
```

**Example Worker Implementation:**
```typescript
// server/workers/snapshot-calculation-worker.ts

import { Worker } from 'bullmq';
import { db } from '../db';
import { forecastSnapshots } from '@shared/schema';
import { eq } from 'drizzle-orm';

const worker = new Worker('snapshot-calculation', async (job) => {
  const { snapshotId, fundId } = job.data;

  try {
    // 1. Update status to 'calculating'
    await db
      .update(forecastSnapshots)
      .set({ status: 'calculating', updatedAt: new Date() })
      .where(eq(forecastSnapshots.id, snapshotId));

    // 2. Calculate MOIC (simulate heavy computation)
    const metrics = await calculateMOIC(fundId, snapshotId, job);

    // 3. Update status to 'complete' with results
    await db
      .update(forecastSnapshots)
      .set({
        status: 'complete',
        calculatedMetrics: metrics,
        updatedAt: new Date()
      })
      .where(eq(forecastSnapshots.id, snapshotId));

  } catch (error) {
    // Update status to 'error'
    await db
      .update(forecastSnapshots)
      .set({
        status: 'error',
        updatedAt: new Date()
      })
      .where(eq(forecastSnapshots.id, snapshotId));

    throw error; // Let BullMQ handle retry logic
  }
}, {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379')
  }
});

async function calculateMOIC(fundId: number, snapshotId: string, job: any) {
  // Fetch all lots for this fund
  const lots = await db.query.investmentLots.findMany({
    where: eq(investments.fundId, fundId),
    with: { investment: true }
  });

  const total = lots.length;
  let current = 0;

  // Calculate MOIC for each lot
  for (const lot of lots) {
    // Simulate calculation
    await new Promise(r => setTimeout(r, 100));

    current++;

    // Update progress in Redis
    await redis.set(
      `snapshot:${snapshotId}:progress`,
      JSON.stringify({ current, total }),
      'EX', 3600
    );
  }

  // Return calculated metrics
  return {
    expectedMOIC: 3.2,
    expectedIRR: 0.25,
    probabilityDPI1x: 0.95,
    lotsAnalyzed: total
  };
}
```

---

## 7. File Structure

### 7.1 Recommended Structure

```
server/
├── routes/
│   └── portfolio/
│       ├── index.ts              # Express router setup
│       ├── snapshots.ts          # Snapshot endpoints (4 routes)
│       ├── lots.ts               # Lot endpoints (2 routes)
│       ├── validators.ts         # Reusable validation helpers
│       └── helpers.ts            # Database helper functions
│
├── services/
│   └── portfolio/
│       ├── snapshot-service.ts   # Business logic for snapshots
│       └── lot-service.ts        # Business logic for lots
│
└── workers/
    └── snapshot-calculation-worker.ts  # BullMQ worker

shared/
└── schemas/
    └── portfolio-route.ts        # Zod schemas (DONE - Phase 2)

tests/
└── integration/
    └── portfolio-route.test.ts   # Integration tests (template ready)
```

### 7.2 Router Setup

**File: `server/routes/portfolio/index.ts`**
```typescript
import { Router } from 'express';
import snapshotsRouter from './snapshots';
import lotsRouter from './lots';

const router = Router();

// Mount sub-routers
router.use('/', snapshotsRouter);
router.use('/', lotsRouter);

export default router;
```

**File: `server/app.ts`**
```typescript
import portfolioRouter from './routes/portfolio';

app.use('/api', portfolioRouter);
```

---

## 8. Testing Strategy Summary

**Reference:** `docs/api/testing/portfolio-route-test-strategy.md`

### 8.1 Test Distribution

- **Unit Tests (60%):** Validators, helpers, services
- **Integration Tests (30%):** Full API with Testcontainers (PostgreSQL + Redis)
- **E2E Tests (10%):** Complete workflows (create → poll → verify)

### 8.2 Coverage Target

- **Line Coverage:** 90%+
- **Total Scenarios:** 35+ test cases
- **Test Infrastructure:** Vitest + Testcontainers

### 8.3 Key Test Scenarios

1. **Idempotency Tests** (P0)
   - Duplicate requests with same idempotency key
   - Verify no duplicate records created

2. **Optimistic Locking Tests** (P0)
   - Concurrent updates with version conflicts
   - Verify 409 Conflict response

3. **Pagination Tests** (P1)
   - Cursor-based pagination boundary conditions
   - Empty results, single page, multiple pages

4. **Status Transition Tests** (P0)
   - Valid transitions (pending → calculating → complete)
   - Invalid transitions (complete → pending)

5. **Background Job Tests** (P2)
   - Job queued on snapshot creation
   - Worker processes job and updates status
   - Progress tracking via Redis

---

## 9. Implementation Checklist

### Phase 3.1: Setup (2 hours)

- [ ] Create route files
  - [ ] `server/routes/portfolio/index.ts`
  - [ ] `server/routes/portfolio/snapshots.ts`
  - [ ] `server/routes/portfolio/lots.ts`
  - [ ] `server/routes/portfolio/validators.ts`
  - [ ] `server/routes/portfolio/helpers.ts`

- [ ] Create service files
  - [ ] `server/services/portfolio/snapshot-service.ts`
  - [ ] `server/services/portfolio/lot-service.ts`

- [ ] Create worker file
  - [ ] `server/workers/snapshot-calculation-worker.ts`

- [ ] Add middleware (if not already present)
  - [ ] `server/middleware/async.ts` (asyncHandler)
  - [ ] `server/middleware/validation.ts` (validateRequest)

### Phase 3.2: Implement Endpoints (8-12 hours, TDD with coding pairs)

**Snapshots:**
- [ ] POST /api/funds/:fundId/portfolio/snapshots (202 Accepted)
  - [ ] Request validation
  - [ ] Idempotency check
  - [ ] Database insert (transaction)
  - [ ] Queue BullMQ job
  - [ ] 202 response with statusUrl

- [ ] GET /api/funds/:fundId/portfolio/snapshots (cursor pagination)
  - [ ] Query param validation
  - [ ] Filter by status
  - [ ] Cursor-based pagination
  - [ ] Response with nextCursor

- [ ] GET /api/snapshots/:snapshotId (status polling)
  - [ ] Snapshot retrieval
  - [ ] Progress from Redis (if calculating)
  - [ ] retryAfter header

- [ ] PUT /api/snapshots/:snapshotId (optimistic locking)
  - [ ] Request validation
  - [ ] Status transition validation
  - [ ] Optimistic locking UPDATE
  - [ ] 409 on version mismatch

**Lots:**
- [ ] POST /api/funds/:fundId/portfolio/lots (idempotent)
  - [ ] Request validation (with cost basis refinement)
  - [ ] Idempotency check
  - [ ] Verify fund + investment (transaction)
  - [ ] Database insert
  - [ ] 201 response

- [ ] GET /api/funds/:fundId/portfolio/lots (filtering + pagination)
  - [ ] Query param validation
  - [ ] Filter by investmentId, lotType
  - [ ] Cursor-based pagination
  - [ ] Response with nextCursor

### Phase 3.3: Background Jobs (4 hours)

- [ ] Implement BullMQ worker
  - [ ] Queue setup (snapshot-calculation)
  - [ ] Worker job handler
  - [ ] MOIC calculation logic
  - [ ] Status updates (pending → calculating → complete)

- [ ] Add progress tracking
  - [ ] Redis progress updates
  - [ ] API endpoint integration

- [ ] Test async flow
  - [ ] Create snapshot → verify job queued
  - [ ] Worker processes job → verify status updated
  - [ ] Poll until complete → verify metrics present

### Phase 3.4: Testing (6 hours)

- [ ] Adapt template tests to actual implementation
  - [ ] Update test fixtures
  - [ ] Add endpoint-specific tests
  - [ ] Add edge case tests

- [ ] Run integration tests with Testcontainers
  - [ ] PostgreSQL container setup
  - [ ] Redis container setup
  - [ ] Database seeding

- [ ] Verify all 35+ test scenarios pass
  - [ ] Happy paths (100%)
  - [ ] Error scenarios (100%)
  - [ ] Idempotency (100%)
  - [ ] Optimistic locking (100%)
  - [ ] Pagination (90%)
  - [ ] Status transitions (100%)

### Phase 3.5: Documentation (2 hours)

- [ ] Update CHANGELOG.md
  - [ ] Add Phase 3 entry
  - [ ] Document new endpoints

- [ ] Add OpenAPI spec (optional)
  - [ ] Generate from Zod schemas
  - [ ] Publish to docs

- [ ] Create API usage examples
  - [ ] cURL examples
  - [ ] TypeScript client examples

### Total Estimate: 22-28 hours across 5 sub-phases

---

## 10. Success Criteria

### 10.1 Functional Requirements

- ✅ All 6 endpoints implemented
- ✅ All tests passing (35+ scenarios)
- ✅ Error handling consistent (ApiError format)
- ✅ Pagination working correctly (cursor-based)
- ✅ Idempotency verified (duplicate requests handled)
- ✅ Optimistic locking verified (version conflicts detected)
- ✅ Background jobs processing snapshots (BullMQ + Redis)
- ✅ Status transitions validated (monotonic progression)
- ✅ API matches frozen contracts (v1)

### 10.2 Quality Metrics

- ✅ **Code Coverage:** 90%+ line coverage
- ✅ **Test Success Rate:** 100% passing
- ✅ **Error Rate:** < 0.1% in production
- ✅ **Response Time (p95):**
  - POST /snapshots: < 200ms
  - GET /snapshots (list): < 100ms
  - GET /snapshots/:id: < 50ms
  - POST /lots: < 150ms
  - GET /lots (list): < 100ms
  - PUT /snapshots/:id: < 100ms

### 10.3 Code Review Checklist

- [ ] All routes use `asyncHandler` wrapper
- [ ] All requests validated with Zod schemas
- [ ] All database operations use transactions where needed
- [ ] All errors follow ApiError format
- [ ] All paginated endpoints use cursor-based pagination
- [ ] All POST endpoints support idempotency
- [ ] All updates use optimistic locking
- [ ] All async operations return 202 with statusUrl
- [ ] All BigInt fields serialized as strings in responses
- [ ] All status transitions validated

### 10.4 Deployment Readiness

- [ ] All tests passing in CI/CD
- [ ] Database migrations applied
- [ ] Redis connection configured
- [ ] BullMQ worker deployed
- [ ] Monitoring configured (Prometheus, Grafana)
- [ ] Logging configured (Winston, structured JSON)
- [ ] Error tracking configured (Sentry, etc.)
- [ ] API documentation published

---

## Appendix: Quick Reference

### Key Files

| File | Purpose |
|------|---------|
| `shared/schemas/portfolio-route.ts` | Zod schemas (Phase 2 - DONE) |
| `docs/api/contracts/portfolio-route-v1.md` | Frozen API contracts |
| `docs/api/patterns/existing-route-patterns.md` | Existing codebase patterns |
| `docs/api/testing/portfolio-route-test-strategy.md` | Test strategy |
| `server/routes/portfolio/` | Route implementations (Phase 3) |
| `tests/integration/portfolio-route.test.ts` | Integration tests (Phase 3) |

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Cursor-based pagination** | Consistent results at scale, no page drift |
| **Optimistic locking** | Prevent lost updates in concurrent scenarios |
| **Idempotency keys** | Prevent duplicate requests (especially POST) |
| **Async operations (202)** | Long-running calculations don't block API |
| **BigInt for cents** | Prevent floating-point precision errors |
| **Status transitions** | Monotonic progression (no backwards transitions) |
| **Zod validation** | Runtime + compile-time type safety |
| **Testcontainers** | Real database for integration tests |

### Helper Functions

```typescript
// Validation
validateStatusTransition(currentStatus, newStatus): boolean

// BigInt serialization
serializeBigInt(value: bigint): string
parseBigInt(value: string): bigint
calculateCostBasis(sharePriceCents, sharesAcquired): bigint

// Database
verifyFundExists(client, fundId): Promise<void>
verifyInvestmentExists(client, investmentId, fundId): Promise<void>
```

---

**Document Status:** ✅ Ready for Implementation
**Last Updated:** 2025-11-08
**Next Steps:** Begin Phase 3.1 (Setup)
