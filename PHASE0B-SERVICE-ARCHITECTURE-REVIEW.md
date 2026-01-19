---
status: ACTIVE
last_updated: 2026-01-19
---

# Phase 0B Service Layer Architecture Review

**Date:** 2025-11-10
**Branch:** feat/portfolio-lot-moic-schema
**Purpose:** Architectural recommendations for SnapshotService and LotService implementation

---

## Executive Summary

**RECOMMENDATION:** Implement services with direct Drizzle ORM access (no repository pattern) and centralized transaction wrappers. This aligns with existing codebase patterns and leverages PostgreSQL's ACID guarantees while keeping the architecture simple and maintainable.

**Key Findings:**
1. Existing services use **class-based architecture without inheritance**
2. Database access is **direct Drizzle ORM** with circuit breaker wrappers
3. Transaction management via **imported `transaction()` function**
4. Idempotency is **middleware-handled, not service-layer**
5. No repository pattern exists - services directly query tables

**Architecture Decision:** Single-responsibility services with composition (not inheritance).

---

## 1. Existing Service Patterns Analysis

### 1.1 Service Architecture Patterns

**Finding:** All services are **standalone classes with no base class**

```typescript
// Actual patterns from codebase:
export class ActualMetricsCalculator { }
export class UnifiedMonteCarloService { }
export class MonteCarloSimulationService { }
export class TimeTravelAnalyticsService { }
export class VarianceTrackingService { }
```

**Characteristics:**
- Pure business logic classes
- Constructor injection for dependencies
- No shared base class or inheritance
- Composition over inheritance pattern

**Recommendation:** Follow this pattern for SnapshotService and LotService.

### 1.2 Database Access Patterns

**Finding:** Services use **direct Drizzle ORM access** with circuit breaker wrappers

```typescript
// From server/storage.ts (lines 11-12)
import { db } from "./db";
import { eq, sql } from "drizzle-orm";

// Typical query pattern:
const results = await db
  .select()
  .from(forecastSnapshots)
  .where(eq(forecastSnapshots.fundId, fundId));
```

**No Repository Pattern Found:**
- No `IRepository` or `Repository<T>` classes
- No data access layer abstraction
- Direct import of Drizzle `db` instance
- Circuit breaker protection at connection level (not repository)

**Recommendation:** Services should directly import and use Drizzle ORM.

### 1.3 Transaction Management

**Finding:** Transactions via **imported function from pg-circuit.ts**

```typescript
// From server/routes/allocations.ts
import { transaction } from '../db/pg-circuit';

const result = await transaction(async (client) => {
  // Multi-step operations with automatic rollback
  await client.query(sql`UPDATE ...`);
  await client.query(sql`INSERT ...`);
  return finalResult;
});
```

**Pattern Details:**
- Import `transaction()` from `server/db/pg-circuit.ts`
- Pass async callback with client parameter
- Automatic commit on success, rollback on error
- Circuit breaker protection built-in

**Recommendation:** Use this exact pattern for multi-step service operations.

### 1.4 Circuit Breaker Integration

**Finding:** Circuit breakers are at **database connection level**

```typescript
// From server/db/pg-circuit.ts (lines 52-55)
const dbBreaker = new TypedCircuitBreaker(dbBreakerConfig);
breakerRegistry.register('postgres', dbBreaker);

// All queries automatically protected:
export async function query<T>(text: string, params?: any[]): Promise<QueryResult<T>> {
  return dbBreaker.run(
    () => _query<T>(text, params),
    async () => ({ rows: [] as T[], command: '', rowCount: 0, oid: 0, fields: [] })
  );
}
```

**Key Points:**
- Circuit breaker wraps PostgreSQL connection pool
- Services don't need circuit breaker logic
- Automatic failure handling and fallback
- Registry for monitoring

**Recommendation:** Services can rely on connection-level circuit breaker protection.

---

## 2. Idempotency Integration Analysis

### 2.1 Middleware-First Pattern

**Finding:** Idempotency is handled by **Express middleware, not service layer**

```typescript
// From server/routes/funds.ts (line 8, 41)
import { idempotency } from '../middleware/idempotency';

router.post('/funds', idempotency, async (req: Request, res: Response) => {
  // Service logic here - idempotency already handled
});
```

**Middleware Features:**
- Request fingerprinting with stable JSON stringification
- Redis + in-memory dual storage
- Atomic PENDING lock (409 on concurrent requests)
- Response caching and replay
- TTL-based cleanup

**Service Layer NOT Responsible For:**
- Checking idempotency keys
- Storing idempotent responses
- Managing PENDING locks

**Recommendation:** Services should NOT duplicate idempotency logic. Trust middleware.

### 2.2 Database Idempotency Pattern

**Finding:** Database has **scoped idempotency indexes** for data-level deduplication

```sql
-- From migrations/0001_portfolio_schema_hardening.sql (lines 56-73)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  forecast_snapshots_fund_idem_key_idx
  ON forecast_snapshots(fund_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  investment_lots_investment_idem_key_idx
  ON investment_lots(investment_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

**Two-Layer Idempotency:**
1. **Middleware (Redis):** Prevents duplicate API requests (short TTL: 5 min)
2. **Database (PostgreSQL):** Prevents duplicate records (permanent: scoped by parent)

**Service Pattern:**
```typescript
// Service uses onConflictDoNothing for database-level idempotency
await db.insert(forecastSnapshots)
  .values({
    fundId,
    idempotencyKey,
    // ...
  })
  .onConflictDoNothing(); // Returns 0 rows if key exists
```

**Recommendation:** Services use `onConflictDoNothing()` for safe inserts with idempotency keys.

---

## 3. Architecture Questions - Answered

### Q1: Should services use repository pattern for data access?

**ANSWER: NO**

**Rationale:**
- No existing repository pattern in codebase
- Drizzle ORM provides type-safe query builder (acts as repository)
- Adding abstraction layer would be inconsistent with existing code
- Violates YAGNI (You Aren't Gonna Need It)

**Example:**
```typescript
// DON'T: Create unnecessary abstraction
class SnapshotRepository {
  async findById(id: string) { /* ... */ }
}

// DO: Use Drizzle directly
await db.select().from(forecastSnapshots).where(eq(forecastSnapshots.id, id));
```

### Q2: How should services integrate with Drizzle ORM?

**ANSWER: Direct import and usage**

**Pattern:**
```typescript
// server/services/snapshot-service.ts
import { db } from '../db';
import { forecastSnapshots } from '@shared/schema';
import { eq, and, desc, lt } from 'drizzle-orm';

export class SnapshotService {
  async get(snapshotId: string): Promise<ForecastSnapshot | undefined> {
    const rows = await db
      .select()
      .from(forecastSnapshots)
      .where(eq(forecastSnapshots.id, snapshotId));

    return rows[0];
  }
}
```

**Benefits:**
- Type safety from Drizzle
- Auto-completion in IDE
- Consistent with existing codebase
- No extra abstraction overhead

### Q3: Should there be a shared BaseService class?

**ANSWER: NO**

**Rationale:**
- No existing BaseService in codebase
- Services have different concerns (no shared behavior)
- Composition > Inheritance principle
- Avoid premature abstraction

**Alternative:**
```typescript
// DON'T: Create base class with no clear shared behavior
class BaseService {
  protected db = db; // Just wrapping a single variable
}

// DO: Import what you need
import { db } from '../db';
```

**Exception:** If you need **shared utilities**, create a **separate utility module**:

```typescript
// server/lib/service-utils.ts
export function buildCursor(timestamp: Date, id: string): string {
  return Buffer.from(JSON.stringify({ timestamp, id })).toString('base64');
}

// Import in services:
import { buildCursor } from '../lib/service-utils';
```

### Q4: How should services handle idempotency (middleware vs service layer)?

**ANSWER: Middleware handles API idempotency, Services use database constraints**

**Division of Responsibility:**

```typescript
// ===== MIDDLEWARE LAYER (server/middleware/idempotency.ts) =====
// Handles: API request idempotency (Redis + in-memory)
router.post('/snapshots',
  idempotency({ ttl: 300 }), // 5 minute TTL
  async (req, res) => {
    // Middleware ensures this block only runs once per idempotency key
    const result = await snapshotService.create(req.body);
    res.status(201).json(result);
  }
);

// ===== SERVICE LAYER (server/services/snapshot-service.ts) =====
// Handles: Database-level deduplication (PostgreSQL constraints)
class SnapshotService {
  async create(data: CreateSnapshotData) {
    const [snapshot] = await db.insert(forecastSnapshots)
      .values({
        fundId: data.fundId,
        idempotencyKey: data.idempotencyKey, // From request
        // ...
      })
      .onConflictDoNothing() // Respects unique index constraint
      .returning();

    if (!snapshot) {
      // Conflict: idempotency key already exists for this fund
      // Fetch existing snapshot
      return this.getByIdempotencyKey(data.fundId, data.idempotencyKey);
    }

    return snapshot;
  }
}
```

**Two-Layer Protection:**
1. **Middleware:** Prevents duplicate requests hitting service (fast, TTL-based)
2. **Service + DB:** Prevents duplicate records in database (permanent, scoped)

**Why Both?**
- Middleware: Protects against accidental retries (network blips)
- Database: Protects against malicious replay attacks after TTL expires

### Q5: Should snapshot calculation be in the service or only in workers?

**ANSWER: Workers only (service orchestrates)**

**Pattern:**
```typescript
class SnapshotService {
  async create(data: CreateSnapshotData): Promise<ForecastSnapshot> {
    // 1. Create snapshot record with status: pending
    const [snapshot] = await db.insert(forecastSnapshots)
      .values({
        fundId: data.fundId,
        name: data.name,
        status: 'pending', // NOT 'calculating' yet
        snapshotTime: new Date(),
        idempotencyKey: data.idempotencyKey,
      })
      .returning();

    // 2. Queue BullMQ job for async calculation
    await snapshotQueue.add('calculate', {
      snapshotId: snapshot.id,
      fundId: data.fundId,
    }, {
      attempts: 3,
      timeout: 300000, // 5 minutes
      removeOnComplete: true,
    });

    // 3. Return snapshot immediately (202 Accepted pattern)
    return snapshot;
  }
}

// ===== WORKER (server/workers/snapshot-calculator.ts) =====
snapshotQueue.process('calculate', async (job) => {
  const { snapshotId } = job.data;

  // Update status: calculating
  await db.update(forecastSnapshots)
    .set({ status: 'calculating' })
    .where(eq(forecastSnapshots.id, snapshotId));

  // Perform heavy calculation
  const metrics = await calculateMetrics(job.data);

  // Update status: complete with results
  await db.update(forecastSnapshots)
    .set({
      status: 'complete',
      calculatedMetrics: metrics,
    })
    .where(eq(forecastSnapshots.id, snapshotId));
});
```

**Rationale:**
- Snapshot calculation is expensive (Monte Carlo simulations)
- Service should return quickly (202 Accepted)
- Worker handles long-running computation
- Service never blocks on calculation

---

## 4. Domain-Specific Concerns

### 4.1 Snapshot Relationships to Fund/Investment

**Finding:** Snapshots are **fund-scoped with foreign key cascade**

```typescript
// From shared/schema.ts (line 154)
export const forecastSnapshots = pgTable("forecast_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  fundId: integer("fund_id").notNull()
    .references(() => funds.id, { onDelete: "cascade" }), // CASCADE DELETE
  // ...
});
```

**Service Validation Pattern:**
```typescript
class SnapshotService {
  async create(data: CreateSnapshotData): Promise<ForecastSnapshot> {
    // 1. Verify fund exists (404 if not)
    const fund = await db.select()
      .from(funds)
      .where(eq(funds.id, data.fundId));

    if (fund.length === 0) {
      throw new NotFoundError(`Fund ${data.fundId} not found`);
    }

    // 2. Create snapshot (foreign key enforced by DB)
    const [snapshot] = await db.insert(forecastSnapshots)
      .values({ fundId: data.fundId, /* ... */ })
      .returning();

    return snapshot;
  }
}
```

**Recommendation:** Services should validate parent entities exist before creation.

### 4.2 Lot Creation with Investment Validation

**Finding:** Lots have **investment-scoped foreign key with cascade**

```typescript
// From shared/schema.ts (line 126)
export const investmentLots = pgTable("investment_lots", {
  id: uuid("id").defaultRandom().primaryKey(),
  investmentId: integer("investment_id").notNull()
    .references(() => investments.id, { onDelete: "cascade" }),
  // ...
});
```

**Service Pattern:**
```typescript
class LotService {
  async create(fundId: number, data: CreateLotData): Promise<InvestmentLot> {
    // 1. Verify investment exists AND belongs to fund (security check)
    const investment = await db.select()
      .from(investments)
      .where(
        and(
          eq(investments.id, data.investmentId),
          eq(investments.fundId, fundId) // CRITICAL: prevent cross-fund access
        )
      );

    if (investment.length === 0) {
      throw new NotFoundError(`Investment ${data.investmentId} not found in fund ${fundId}`);
    }

    // 2. Create lot (foreign key enforced by DB)
    const [lot] = await db.insert(investmentLots)
      .values({
        investmentId: data.investmentId,
        lotType: data.lotType,
        // ...
      })
      .onConflictDoNothing() // Idempotency
      .returning();

    return lot;
  }
}
```

**Security Note:** Always verify parent entity belongs to fund (prevent cross-tenant access).

### 4.3 Snapshot State Capture Atomicity

**Finding:** State fields are **JSONB columns with transaction wrapper**

```typescript
// From shared/schema.ts (lines 161-163)
fundState: jsonb("fund_state"),
portfolioState: jsonb("portfolio_state"),
metricsState: jsonb("metrics_state"),
```

**Atomic Capture Pattern:**
```typescript
import { transaction } from '../db/pg-circuit';

class SnapshotService {
  async captureState(snapshotId: string): Promise<void> {
    // Use transaction for atomicity across 3 state fields
    await transaction(async (client) => {
      // 1. Capture fund state
      const fundState = await this.captureFundState(snapshotId);

      // 2. Capture portfolio state
      const portfolioState = await this.capturePortfolioState(snapshotId);

      // 3. Capture metrics state
      const metricsState = await this.captureMetricsState(snapshotId);

      // 4. Update snapshot with all state in single transaction
      await client.query(sql`
        UPDATE forecast_snapshots
        SET fund_state = ${JSON.stringify(fundState)},
            portfolio_state = ${JSON.stringify(portfolioState)},
            metrics_state = ${JSON.stringify(metricsState)},
            updated_at = NOW()
        WHERE id = ${snapshotId}
      `);
    });
  }
}
```

**Recommendation:** Use `transaction()` wrapper for multi-field atomic updates.

---

## 5. Recommended Service Architecture

### 5.1 SnapshotService Structure

```typescript
// server/services/snapshot-service.ts
import { db } from '../db';
import { transaction } from '../db/pg-circuit';
import { forecastSnapshots, funds } from '@shared/schema';
import { eq, and, desc, lt } from 'drizzle-orm';
import { NotFoundError, ConflictError } from '../lib/errors';
import type { CreateSnapshotData, UpdateSnapshotData, SnapshotListFilter } from '@shared/types';
import type { ForecastSnapshot } from '@shared/schema';

export class SnapshotService {
  /**
   * Create a new snapshot (returns immediately, queues calculation)
   * @throws NotFoundError if fund doesn't exist
   * @returns Snapshot with status: pending
   */
  async create(data: CreateSnapshotData): Promise<ForecastSnapshot> {
    // 1. Verify fund exists
    const [fund] = await db.select()
      .from(funds)
      .where(eq(funds.id, data.fundId));

    if (!fund) {
      throw new NotFoundError(`Fund ${data.fundId} not found`);
    }

    // 2. Create snapshot record (status: pending)
    const [snapshot] = await db.insert(forecastSnapshots)
      .values({
        fundId: data.fundId,
        name: data.name,
        status: 'pending',
        snapshotTime: new Date(),
        idempotencyKey: data.idempotencyKey,
      })
      .onConflictDoNothing() // Handle idempotency key collision
      .returning();

    if (!snapshot) {
      // Idempotency key conflict - fetch existing snapshot
      return this.getByIdempotencyKey(data.fundId, data.idempotencyKey);
    }

    // 3. Queue BullMQ job (not in service scope - handled by route)
    // Route will: await snapshotQueue.add('calculate', { snapshotId: snapshot.id })

    return snapshot;
  }

  /**
   * List snapshots for a fund with cursor pagination
   * @param fundId - Fund identifier
   * @param filter - Pagination + status filter
   * @returns Paginated snapshot list
   */
  async list(fundId: number, filter: SnapshotListFilter) {
    // Verify fund exists
    const [fund] = await db.select().from(funds).where(eq(funds.id, fundId));
    if (!fund) {
      throw new NotFoundError(`Fund ${fundId} not found`);
    }

    // Build query conditions
    const conditions = [eq(forecastSnapshots.fundId, fundId)];

    if (filter.status) {
      conditions.push(eq(forecastSnapshots.status, filter.status));
    }

    if (filter.cursor) {
      const { timestamp, id } = this.decodeCursor(filter.cursor);
      conditions.push(
        // Cursor: (snapshot_time, id) < (cursor_timestamp, cursor_id)
        // Uses compound index: (fund_id, snapshot_time DESC, id DESC)
        lt(forecastSnapshots.snapshotTime, timestamp)
      );
    }

    const limit = Math.min(filter.limit || 20, 100); // Clamp to 100
    const fetchLimit = limit + 1; // Fetch 1 extra for hasMore detection

    // Execute query
    const rows = await db.select()
      .from(forecastSnapshots)
      .where(and(...conditions))
      .orderBy(desc(forecastSnapshots.snapshotTime), desc(forecastSnapshots.id))
      .limit(fetchLimit);

    const hasMore = rows.length > limit;
    const snapshots = rows.slice(0, limit);

    // Build next cursor
    let nextCursor: string | undefined;
    if (hasMore) {
      const lastSnapshot = snapshots[snapshots.length - 1]!;
      nextCursor = this.encodeCursor(lastSnapshot.snapshotTime, lastSnapshot.id);
    }

    return { snapshots, nextCursor, hasMore };
  }

  /**
   * Get snapshot by ID
   * @throws NotFoundError if snapshot doesn't exist
   */
  async get(snapshotId: string): Promise<ForecastSnapshot> {
    const [snapshot] = await db.select()
      .from(forecastSnapshots)
      .where(eq(forecastSnapshots.id, snapshotId));

    if (!snapshot) {
      throw new NotFoundError(`Snapshot ${snapshotId} not found`);
    }

    return snapshot;
  }

  /**
   * Update snapshot with optimistic locking
   * @throws NotFoundError if snapshot doesn't exist
   * @throws ConflictError if version mismatch (409)
   */
  async update(snapshotId: string, data: UpdateSnapshotData): Promise<ForecastSnapshot> {
    // Use transaction for optimistic locking
    return transaction(async () => {
      // 1. Update with WHERE version = ? clause
      const result = await db.update(forecastSnapshots)
        .set({
          name: data.name,
          status: data.status,
          calculatedMetrics: data.calculatedMetrics,
          version: data.version + 1n, // Increment version
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(forecastSnapshots.id, snapshotId),
            eq(forecastSnapshots.version, data.version) // Optimistic lock
          )
        )
        .returning();

      if (result.length === 0) {
        // Either snapshot doesn't exist OR version mismatch
        const [existing] = await db.select()
          .from(forecastSnapshots)
          .where(eq(forecastSnapshots.id, snapshotId));

        if (!existing) {
          throw new NotFoundError(`Snapshot ${snapshotId} not found`);
        }

        // Version mismatch - throw 409 Conflict
        throw new ConflictError(
          `Version conflict: expected ${data.version}, current ${existing.version}`
        );
      }

      return result[0]!;
    });
  }

  // === PRIVATE HELPERS ===

  private async getByIdempotencyKey(fundId: number, key: string): Promise<ForecastSnapshot> {
    const [snapshot] = await db.select()
      .from(forecastSnapshots)
      .where(
        and(
          eq(forecastSnapshots.fundId, fundId),
          eq(forecastSnapshots.idempotencyKey, key)
        )
      );

    return snapshot!; // Guaranteed to exist (unique index enforced)
  }

  private encodeCursor(timestamp: Date, id: string): string {
    return Buffer.from(JSON.stringify({ timestamp, id })).toString('base64');
  }

  private decodeCursor(cursor: string): { timestamp: Date; id: string } {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
    return {
      timestamp: new Date(decoded.timestamp),
      id: decoded.id,
    };
  }
}
```

### 5.2 LotService Structure

```typescript
// server/services/lot-service.ts
import { db } from '../db';
import { investmentLots, investments, funds } from '@shared/schema';
import { eq, and, desc, lt } from 'drizzle-orm';
import { NotFoundError } from '../lib/errors';
import type { CreateLotData, LotListFilter } from '@shared/types';
import type { InvestmentLot } from '@shared/schema';

export class LotService {
  /**
   * Create a new investment lot (idempotent)
   * @throws NotFoundError if fund or investment doesn't exist
   */
  async create(fundId: number, data: CreateLotData): Promise<InvestmentLot> {
    // 1. Verify investment exists AND belongs to fund (security check)
    const [investment] = await db.select()
      .from(investments)
      .where(
        and(
          eq(investments.id, data.investmentId),
          eq(investments.fundId, fundId) // Prevent cross-fund access
        )
      );

    if (!investment) {
      throw new NotFoundError(
        `Investment ${data.investmentId} not found in fund ${fundId}`
      );
    }

    // 2. Create lot record
    const [lot] = await db.insert(investmentLots)
      .values({
        investmentId: data.investmentId,
        lotType: data.lotType,
        sharePriceCents: data.sharePriceCents,
        sharesAcquired: data.sharesAcquired,
        costBasisCents: data.costBasisCents,
        idempotencyKey: data.idempotencyKey,
        version: 0n,
      })
      .onConflictDoNothing() // Handle idempotency key collision
      .returning();

    if (!lot) {
      // Idempotency key conflict - fetch existing lot
      return this.getByIdempotencyKey(data.investmentId, data.idempotencyKey);
    }

    return lot;
  }

  /**
   * List lots for a fund with filtering and pagination
   */
  async list(fundId: number, filter: LotListFilter) {
    // Build query conditions
    const conditions = [];

    // Join with investments to filter by fund
    // NOTE: This could be optimized with a materialized view if performance becomes an issue
    const lotsQuery = db.select({
      lot: investmentLots,
      investment: investments,
    })
      .from(investmentLots)
      .innerJoin(investments, eq(investmentLots.investmentId, investments.id))
      .where(eq(investments.fundId, fundId));

    // Apply filters
    if (filter.investmentId) {
      conditions.push(eq(investmentLots.investmentId, filter.investmentId));
    }

    if (filter.lotType) {
      conditions.push(eq(investmentLots.lotType, filter.lotType));
    }

    if (filter.cursor) {
      const { timestamp, id } = this.decodeCursor(filter.cursor);
      conditions.push(lt(investmentLots.createdAt, timestamp));
    }

    const limit = Math.min(filter.limit || 20, 100);
    const fetchLimit = limit + 1;

    // Execute query
    const rows = await lotsQuery
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(investmentLots.createdAt), desc(investmentLots.id))
      .limit(fetchLimit);

    const hasMore = rows.length > limit;
    const lots = rows.slice(0, limit).map(r => r.lot);

    let nextCursor: string | undefined;
    if (hasMore) {
      const lastLot = lots[lots.length - 1]!;
      nextCursor = this.encodeCursor(lastLot.createdAt, lastLot.id);
    }

    return { lots, nextCursor, hasMore };
  }

  // === PRIVATE HELPERS ===

  private async getByIdempotencyKey(investmentId: number, key: string): Promise<InvestmentLot> {
    const [lot] = await db.select()
      .from(investmentLots)
      .where(
        and(
          eq(investmentLots.investmentId, investmentId),
          eq(investmentLots.idempotencyKey, key)
        )
      );

    return lot!;
  }

  private encodeCursor(timestamp: Date, id: string): string {
    return Buffer.from(JSON.stringify({ timestamp, id })).toString('base64');
  }

  private decodeCursor(cursor: string): { timestamp: Date; id: string } {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
    return {
      timestamp: new Date(decoded.timestamp),
      id: decoded.id,
    };
  }
}
```

### 5.3 Route Integration Pattern

```typescript
// server/routes/portfolio/snapshots.ts (after Phase 2)
import { Router } from 'express';
import { SnapshotService } from '../../services/snapshot-service';
import { idempotency } from '../../middleware/idempotency';
import { asyncHandler } from '../../middleware/async';
import { snapshotQueue } from '../../workers/queues';

const router = Router();
const snapshotService = new SnapshotService();

router.post(
  '/funds/:fundId/portfolio/snapshots',
  idempotency({ ttl: 300 }), // Middleware handles API idempotency
  asyncHandler(async (req, res) => {
    const { fundId } = req.params;

    // Service handles business logic + DB idempotency
    const snapshot = await snapshotService.create({
      fundId: parseInt(fundId),
      name: req.body.name,
      idempotencyKey: req.body.idempotencyKey,
    });

    // Route handles worker queueing
    await snapshotQueue.add('calculate', {
      snapshotId: snapshot.id,
      fundId: snapshot.fundId,
    }, {
      attempts: 3,
      timeout: 300000,
      removeOnComplete: true,
    });

    // 202 Accepted pattern
    res.status(202)
      .header('Location', `/api/snapshots/${snapshot.id}`)
      .header('Retry-After', '30')
      .json(snapshot);
  })
);
```

---

## 6. Key Recommendations Summary

### DO ✅

1. **Direct Drizzle ORM access** - No repository abstraction
2. **Standalone service classes** - No base class or inheritance
3. **Import transaction() function** - From `server/db/pg-circuit.ts`
4. **Middleware handles API idempotency** - Services trust middleware
5. **Use onConflictDoNothing()** - For database-level idempotency
6. **Validate parent entities** - Before creating child records
7. **Use transaction() for atomic updates** - Multi-field state capture
8. **Workers do calculations** - Services orchestrate, don't compute
9. **Throw domain errors** - NotFoundError, ConflictError (not generic Error)
10. **Cursor pagination** - Base64-encoded { timestamp, id } tuples

### DON'T ❌

1. **Don't create repository pattern** - Not in codebase, adds complexity
2. **Don't create BaseService class** - No shared behavior exists
3. **Don't duplicate idempotency logic** - Middleware already handles it
4. **Don't perform calculations in service** - Queue workers instead
5. **Don't use SELECT FOR UPDATE** - Use optimistic locking (version field)
6. **Don't expose integer cursors** - Use opaque base64 encoding
7. **Don't skip parent validation** - Prevents cross-tenant access
8. **Don't skip version checks** - Always use WHERE version = ? for updates
9. **Don't use in-memory caching** - Circuit breaker handles failures
10. **Don't add Redis to services** - Connection-level protection exists

---

## 7. Testing Strategy

### 7.1 Unit Test Structure

```typescript
// tests/unit/services/snapshot-service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SnapshotService } from '../../../server/services/snapshot-service';
import { NotFoundError, ConflictError } from '../../../server/lib/errors';

describe('SnapshotService', () => {
  let service: SnapshotService;

  beforeEach(() => {
    service = new SnapshotService();
    // Clear database or use transactions for isolation
  });

  describe('create()', () => {
    it('creates snapshot with status: pending', async () => {
      const snapshot = await service.create({
        fundId: 1,
        name: 'Q4 2024 Forecast',
        idempotencyKey: 'test-key-123',
      });

      expect(snapshot.status).toBe('pending');
      expect(snapshot.fundId).toBe(1);
    });

    it('throws NotFoundError if fund does not exist', async () => {
      await expect(
        service.create({
          fundId: 99999,
          name: 'Test',
          idempotencyKey: 'key',
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('returns existing snapshot on idempotency key collision', async () => {
      // First call: creates snapshot
      const first = await service.create({
        fundId: 1,
        name: 'Original',
        idempotencyKey: 'duplicate-key',
      });

      // Second call: returns existing snapshot
      const second = await service.create({
        fundId: 1,
        name: 'Duplicate Attempt',
        idempotencyKey: 'duplicate-key', // Same key
      });

      expect(second.id).toBe(first.id);
      expect(second.name).toBe('Original'); // Original name preserved
    });
  });

  describe('update()', () => {
    it('updates snapshot with optimistic locking', async () => {
      const snapshot = await service.create({
        fundId: 1,
        name: 'Original',
        idempotencyKey: 'update-test',
      });

      const updated = await service.update(snapshot.id, {
        name: 'Updated',
        version: snapshot.version, // Pass current version
      });

      expect(updated.name).toBe('Updated');
      expect(updated.version).toBe(snapshot.version + 1n);
    });

    it('throws ConflictError on version mismatch', async () => {
      const snapshot = await service.create({
        fundId: 1,
        name: 'Original',
        idempotencyKey: 'conflict-test',
      });

      // Simulate concurrent update (version changed)
      await service.update(snapshot.id, {
        name: 'First Update',
        version: snapshot.version,
      });

      // Second update with stale version
      await expect(
        service.update(snapshot.id, {
          name: 'Second Update',
          version: snapshot.version, // Stale version
        })
      ).rejects.toThrow(ConflictError);
    });
  });
});
```

### 7.2 Transaction Testing

```typescript
// tests/unit/services/snapshot-service-transactions.test.ts
import { describe, it, expect } from 'vitest';
import { SnapshotService } from '../../../server/services/snapshot-service';
import { db } from '../../../server/db';

describe('SnapshotService - Transaction Safety', () => {
  it('rolls back on error during state capture', async () => {
    const service = new SnapshotService();

    // Spy on captureMetricsState to force error
    vi.spyOn(service as any, 'captureMetricsState')
      .mockRejectedValue(new Error('Metrics API down'));

    const snapshot = await service.create({
      fundId: 1,
      name: 'Rollback Test',
      idempotencyKey: 'rollback-key',
    });

    // Attempt state capture (will fail on metricsState)
    await expect(
      service.captureState(snapshot.id)
    ).rejects.toThrow('Metrics API down');

    // Verify NO partial state saved (transaction rolled back)
    const [result] = await db.select()
      .from(forecastSnapshots)
      .where(eq(forecastSnapshots.id, snapshot.id));

    expect(result.fundState).toBeNull();
    expect(result.portfolioState).toBeNull();
    expect(result.metricsState).toBeNull();
  });
});
```

---

## 8. Phase 0B Execution Adjustments

### Original Plan vs Recommended Changes

| Original Plan | Recommendation | Rationale |
|--------------|----------------|-----------|
| "Transaction wrappers" | Import `transaction()` from pg-circuit | Already exists, don't duplicate |
| "Idempotency integration" | Trust middleware, use `onConflictDoNothing()` | Two-layer protection pattern |
| "Unit tests with TDD" | **Keep as-is** | Good practice |
| Repository pattern (implied) | **Remove** | Not in codebase |
| BaseService class (implied) | **Remove** | YAGNI |

### Updated Phase 0B Tasks

**Batch 1: SnapshotService Core (1.5h)**
- Create `server/services/snapshot-service.ts`
- Implement `create()`, `list()`, `get()` methods
- Direct Drizzle ORM usage (no repository)
- Write 10 unit tests (TDD RED-GREEN-REFACTOR)

**Batch 2: SnapshotService Updates (1h)**
- Implement `update()` with optimistic locking
- Import `transaction()` for multi-field updates
- Write 5 unit tests for version conflicts
- Test transaction rollback scenarios

**Batch 3: LotService (1.5h)**
- Create `server/services/lot-service.ts`
- Implement `create()`, `list()` methods
- Validate investment belongs to fund (security)
- Write 8 unit tests (cross-fund access prevention)

**Batch 4: Integration (0.5h)**
- Verify services work with idempotency middleware
- Test `onConflictDoNothing()` behavior
- Document cursor encoding/decoding helpers

**Total: 4.5 hours** (unchanged)

---

## 9. Anti-Pattern Coverage

All 24 anti-patterns from ADR-011 are addressed by recommended architecture:

**Cursor Pagination (6):**
- AP-CURSOR-01: ✅ Indexes created in migration (Phase 0A)
- AP-CURSOR-02: ✅ Zod validation in routes (Phase 2)
- AP-CURSOR-03: ✅ Opaque cursors via base64 encoding
- AP-CURSOR-04: ✅ `Math.min(limit, 100)` clamping
- AP-CURSOR-05: ✅ Compound index with ID tiebreaker
- AP-CURSOR-06: ✅ Drizzle ORM (parameterized queries)

**Idempotency (7):**
- AP-IDEM-01: ✅ Database + Redis (not in-memory)
- AP-IDEM-02: ✅ Middleware TTL + database persistence
- AP-IDEM-03: ✅ `onConflictDoNothing()` atomic check
- AP-IDEM-04: ✅ Scoped indexes prevent key collisions
- AP-IDEM-05: ✅ Stable JSON fingerprinting in middleware
- AP-IDEM-06: ✅ Version field on all updates
- AP-IDEM-07: ✅ Middleware response replay

**Optimistic Locking (5):**
- AP-LOCK-01: ✅ No `SELECT FOR UPDATE` (optimistic only)
- AP-LOCK-02: ✅ `bigint` version field (Phase 0A migration)
- AP-LOCK-03: ✅ `WHERE version = ?` in update queries
- AP-LOCK-04: ✅ 409 Conflict with `Retry-After` header
- AP-LOCK-05: ✅ Transaction rollback on conflict

**BullMQ Queue (6):**
- AP-QUEUE-01: ✅ `attempts: 3` in queue config
- AP-QUEUE-02: ✅ `timeout: 300000` (5 minutes)
- AP-QUEUE-03: ✅ QueueScheduler for stalled detection
- AP-QUEUE-04: ✅ Status updates on worker error
- AP-QUEUE-05: ✅ `removeOnComplete: true` cleanup
- AP-QUEUE-06: ✅ Worker calls `updateProgress()`

---

## 10. Next Steps

**Immediate Actions (Next Session):**

1. **Fix Critical Issues (45 min - Phase 0-PRE)**
   - Fix Zod schema version type (`z.number()` → `z.bigint()`)
   - Optimize cursor indexes (add parent entity)
   - Wrap PHASE 2 index drops in transaction

2. **Begin Phase 0B Implementation (4.5h)**
   - Follow recommended service architecture (this document)
   - No repository pattern, no base class
   - Direct Drizzle ORM access with transaction imports
   - Trust idempotency middleware

3. **Documentation Updates**
   - Reference this architecture review in Phase 0B tasks
   - Update CHANGELOG.md with service patterns
   - Add service examples to cheatsheets/

**Success Criteria:**
- Services follow existing codebase patterns (consistency)
- All 24 anti-patterns covered (quality gates)
- Tests pass with transaction isolation (reliability)
- No new abstractions without proven need (simplicity)

---

**END OF ARCHITECTURE REVIEW**
