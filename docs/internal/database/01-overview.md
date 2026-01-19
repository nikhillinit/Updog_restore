---
status: ACTIVE
last_updated: 2026-01-19
---

# Database Layer Overview

**Purpose:** Architectural overview of the database layer, CQRS pattern
implementation, Event Sourcing fundamentals, and storage abstraction design for
the VC fund modeling platform.

**Audience:** Backend developers, full-stack engineers, and architects working
with data persistence, event sourcing, and database optimization.

**What You'll Learn:**

- How CQRS separates command and query responsibilities
- Why Event Sourcing provides audit trails and time-travel capabilities
- How the Storage Abstraction Layer simplifies database access
- PostgreSQL schema design patterns for financial data
- Drizzle ORM integration for type-safe queries
- Connection pooling and performance optimization strategies

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Overview](#architecture-overview)
3. [Integration Points](#integration-points)
4. [Design Rationale](#design-rationale)
5. [Key Components](#key-components)
6. [Getting Started](#getting-started)
7. [Common Patterns](#common-patterns)
8. [Next Steps](#next-steps)

---

## Overview

### Database Architecture

The platform uses a **PostgreSQL + Drizzle ORM** stack with a CQRS (Command
Query Responsibility Segregation) pattern and Event Sourcing for fund state
management. This architecture provides:

```
┌─────────────────────────────────────────────────────────────┐
│                     APPLICATION LAYER                        │
│  React Components → TanStack Query → Express API Routes     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  STORAGE ABSTRACTION LAYER                   │
│  IStorage Interface (server/storage.ts)                     │
│  • DatabaseStorage (PostgreSQL + Drizzle ORM)               │
│  • MemStorage (In-memory for development/testing)           │
└─────────────────────┬───────────────────────────────────────┘
                      │
         ┌────────────┴────────────┐
         ▼                         ▼
┌──────────────────┐    ┌──────────────────┐
│  WRITE MODEL     │    │   READ MODEL     │
│  (Command Side)  │    │  (Query Side)    │
│                  │    │                  │
│ • fundConfigs    │    │ • funds          │
│ • fundEvents     │    │ • fundMetrics    │
│ • fundSnapshots  │    │ • activities     │
└──────────────────┘    └──────────────────┘
         │                         │
         └────────────┬────────────┘
                      ▼
         ┌────────────────────────┐
         │  PostgreSQL Database   │
         │  • ACID transactions   │
         │  • JSONB support       │
         │  • Connection pooling  │
         └────────────────────────┘
```

**Key characteristics:**

- **CQRS Pattern:** Separates write operations (commands) from read operations
  (queries) for scalability
- **Event Sourcing:** All fund changes recorded as immutable events in
  `fundEvents` table
- **Storage Abstraction:** `IStorage` interface allows swapping between database
  implementations
- **Type Safety:** Drizzle ORM provides compile-time type checking for all
  queries
- **Connection Pooling:** Optimized PostgreSQL connection pool (max 20
  connections, idle timeout 30s)
- **Dual Storage Modes:** `DatabaseStorage` for production, `MemStorage` for
  testing

### Why Database Layer Matters

**Without proper database architecture:**

```typescript
// Direct database access (no abstraction, no type safety)
const result = await client.query('SELECT * FROM funds WHERE id = $1', [
  fundId,
]);
// result.rows[0] is any, no TypeScript safety
const fundSize = result.rows[0].size; // Could be string or number?
const calculations = fundSize * 0.02; // Runtime error if size is string!
```

**With Storage Layer + Drizzle ORM:**

```typescript
// Type-safe database access through storage layer
const fund = await storage.getFund(fundId);
if (!fund) throw new Error('Fund not found');

// fund.size is typed as string (PostgreSQL numeric type)
const fundSize = parseFloat(fund.size); // Explicit conversion
const calculations = fundSize * 0.02; // Type-safe arithmetic
```

---

## Architecture Overview

### CQRS Pattern Implementation

**Command Query Responsibility Segregation (CQRS)** separates data writes from
data reads, optimizing each for different use cases.

#### Write Model (Command Side)

Handles **all state changes** through immutable events:

```typescript
// server/routes/funds.ts - Publishing fund configuration
router.post('/funds/:id/publish', async (req, res) => {
  const fundId = parseInt(req.params.id);

  // Start transaction (write operations must be atomic)
  await db.transaction(async (tx) => {
    // 1. Update fund configuration (write model)
    await tx.insert(fundConfigs).values({
      fundId,
      version: newVersion,
      config: req.body,
      isPublished: true,
      publishedAt: new Date(),
    });

    // 2. Record event for audit trail (immutable log)
    await tx.insert(fundEvents).values({
      fundId,
      eventType: 'PUBLISHED',
      payload: { version: newVersion },
      eventTime: new Date(),
    });

    // 3. Create snapshot for fast queries (read model optimization)
    await tx.insert(fundSnapshots).values({
      fundId,
      type: 'RESERVE',
      payload: calculationResults,
      snapshotTime: new Date(),
    });
  });
});
```

**Key Tables (Write Side):**

- `fundConfigs` - Versioned fund configurations (each edit creates new version)
- `fundEvents` - Immutable event log (PUBLISHED, DRAFT_SAVED, CALC_TRIGGERED)
- `fundSnapshots` - Pre-computed calculation results for performance

**Source:** `shared/schema.ts:18-67`, `server/routes/funds.ts:147-203`

#### Read Model (Query Side)

Optimized for **fast queries** without complex joins:

```typescript
// server/storage.ts - Reading fund with metrics
export class DatabaseStorage implements IStorage {
  async getFund(id: number): Promise<Fund | undefined> {
    // Simple SELECT from read-optimized table
    const [fund] = await db.select().from(funds).where(eq(funds.id, id));

    return fund || undefined;
  }

  async getFundMetrics(fundId: number): Promise<FundMetrics[]> {
    // Pre-aggregated metrics (no expensive calculations)
    return await db
      .select()
      .from(fundMetrics)
      .where(eq(fundMetrics.fundId, fundId));
  }
}
```

**Key Tables (Read Side):**

- `funds` - Current fund state (denormalized for fast reads)
- `fundMetrics` - Pre-calculated performance metrics (IRR, MOIC, DPI, TVPI)
- `portfolioCompanies` - Portfolio company snapshots
- `activities` - Recent fund activity feed

**Source:** `server/storage.ts:449-586`

### Event Sourcing Fundamentals

**Event Sourcing** stores every state change as an immutable event, enabling:

1. **Complete Audit Trail:** Every fund modification is logged with timestamp,
   user, and payload
2. **Time-Travel Queries:** Reconstruct fund state at any point in history
3. **Debugging:** Replay events to understand how system reached current state
4. **Compliance:** Immutable event log satisfies regulatory audit requirements

**Event Flow Example:**

```typescript
// User edits fund configuration
// Event 1: DRAFT_SAVED
{
  id: 1,
  fundId: 42,
  eventType: 'DRAFT_SAVED',
  payload: { size: '100000000', managementFee: '0.02' },
  userId: 7,
  eventTime: '2025-11-06T10:00:00Z',
}

// User publishes configuration
// Event 2: PUBLISHED
{
  id: 2,
  fundId: 42,
  eventType: 'PUBLISHED',
  payload: { version: 2 },
  userId: 7,
  eventTime: '2025-11-06T10:15:00Z',
}

// Background worker completes reserve calculation
// Event 3: CALC_TRIGGERED
{
  id: 3,
  fundId: 42,
  eventType: 'CALC_TRIGGERED',
  payload: { calcType: 'RESERVE', status: 'completed' },
  userId: null, // System event
  eventTime: '2025-11-06T10:15:32Z',
}
```

**Querying Event History:**

```typescript
// Get all events for a fund (audit trail)
const events = await db
  .select()
  .from(fundEvents)
  .where(eq(fundEvents.fundId, fundId))
  .orderBy(desc(fundEvents.eventTime));

// Find when fund was published
const publishEvent = events.find((e) => e.eventType === 'PUBLISHED');
console.log(`Published at: ${publishEvent.eventTime}`);

// Time-travel: reconstruct state at specific time
const stateAtTime = await db
  .select()
  .from(fundSnapshots)
  .where(
    and(
      eq(fundSnapshots.fundId, fundId),
      lt(fundSnapshots.snapshotTime, targetDate)
    )
  )
  .orderBy(desc(fundSnapshots.snapshotTime))
  .limit(1);
```

**Source:** `shared/schema.ts:53-67` (fundEvents table),
`docs/internal/architecture/state-flow.md:82-120`

### Storage Abstraction Layer

The `IStorage` interface decouples application logic from database
implementation:

```typescript
// server/storage.ts - Interface definition
export interface IStorage {
  // Health check methods
  ping(): Promise<boolean>;
  isRedisHealthy?(): Promise<boolean>;

  // Fund methods
  getAllFunds(): Promise<Fund[]>;
  getFund(id: number): Promise<Fund | undefined>;
  createFund(fund: InsertFund): Promise<Fund>;

  // Portfolio methods
  getPortfolioCompanies(fundId?: number): Promise<PortfolioCompany[]>;
  getPortfolioCompany(id: number): Promise<PortfolioCompany | undefined>;
  createPortfolioCompany(
    company: InsertPortfolioCompany
  ): Promise<PortfolioCompany>;

  // Investment methods
  getInvestments(fundId?: number): Promise<Investment[]>;
  createInvestment(investment: InsertInvestment): Promise<Investment>;

  // Metrics methods
  getFundMetrics(fundId: number): Promise<FundMetrics[]>;
  createFundMetrics(metrics: InsertFundMetrics): Promise<FundMetrics>;

  // Activity methods
  getActivities(fundId?: number): Promise<Activity[]>;
  createActivity(activity: InsertActivity): Promise<Activity>;
}
```

**Two Implementations:**

1. **DatabaseStorage** (Production): Uses PostgreSQL + Drizzle ORM
2. **MemStorage** (Development/Testing): In-memory Map-based storage

**Automatic Selection:**

```typescript
// server/storage.ts:589-593
export const storage = process.env['DATABASE_URL']
  ? new DatabaseStorage()
  : new MemStorage();
```

**Source:** `server/storage.ts:15-49`

---

## Integration Points

### 1. Backend API Routes → Storage Layer

API routes use the storage abstraction for all database operations:

```typescript
// server/routes/funds.ts
import { storage } from '../storage';

router.get('/funds', async (req, res) => {
  try {
    const funds = await storage.getAllFunds();
    res.json(funds);
  } catch (error) {
    logger.error('Failed to fetch funds', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/funds', async (req, res) => {
  try {
    // Validate request body with Zod
    const validated = CreateFundSchema.parse(req.body);

    // Create fund through storage layer
    const fund = await storage.createFund(validated);

    res.status(201).json(fund);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.format() });
    }
    logger.error('Failed to create fund', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

**Flow:**

1. HTTP request → Express route handler
2. Route validates input with Zod schemas
3. Route calls `storage.method()` (abstraction layer)
4. Storage executes Drizzle ORM query
5. Database returns typed result
6. Route sends JSON response

**Source:** `server/routes/funds.ts:29-85`, `server/storage.ts:449-586`

### 2. Worker Processes (BullMQ) → Database Writes

Background workers perform long-running calculations and write results to
database:

```typescript
// Hypothetical worker (pattern from codebase)
import { db } from '../db';
import { fundSnapshots } from '@shared/schema';

// BullMQ job handler
queue.process('reserve-calculation', async (job) => {
  const { fundId, config } = job.data;

  // Perform expensive calculation (30-60 seconds)
  const results = await calculateReserveAllocations(config);

  // Write snapshot to database (read-optimized)
  await db.insert(fundSnapshots).values({
    fundId,
    type: 'RESERVE',
    payload: results,
    calcVersion: '2.1.0',
    snapshotTime: new Date(),
    correlationId: job.id,
  });

  logger.info('Reserve calculation completed', {
    fundId,
    jobId: job.id,
    duration: job.finishedOn - job.processedOn,
  });
});
```

**Worker Types:**

- **Reserve Calculation Worker:** Computes optimal reserve allocations per
  company
- **Pacing Analysis Worker:** Analyzes deployment pacing against targets
- **Cohort Analytics Worker:** Groups companies by cohort and calculates metrics
- **Monte Carlo Simulation Worker:** Runs 10,000+ scenario simulations

**Source:** `shared/schema.ts:34-50` (fundSnapshots table),
`docs/internal/architecture/state-flow.md:82-134`

### 3. Cache Layer (Redis) → Database Reads

Redis caches frequently accessed data to reduce database load:

```typescript
// server/routes/funds.ts - With caching (hypothetical pattern)
router.get('/funds/:id', async (req, res) => {
  const fundId = parseInt(req.params.id);
  const cacheKey = `fund:${fundId}`;

  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    return res.json(JSON.parse(cached));
  }

  // Cache miss - query database
  const fund = await storage.getFund(fundId);
  if (!fund) {
    return res.status(404).json({ error: 'Fund not found' });
  }

  // Cache for 60 seconds
  await redis.setex(cacheKey, 60, JSON.stringify(fund));

  res.json(fund);
});
```

**Cache Invalidation Strategy:**

- **Write-through:** Update cache when database changes
- **TTL-based:** Auto-expire cache entries (60s for funds, 300s for metrics)
- **Event-driven:** Invalidate on PUBLISHED/DRAFT_SAVED events

**Source:** `server/cache/index.ts:15-47` (cache utilities)

### 4. Connection Pooling

PostgreSQL connection pool prevents connection exhaustion:

```typescript
// server/db/pool.ts - Connection pool configuration
import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env['DATABASE_URL'],

  // Pool sizing (adjust based on server capacity)
  max: parseInt(process.env['DB_POOL_MAX'] || '20'),
  min: parseInt(process.env['DB_POOL_MIN'] || '2'),

  // Timeouts
  idleTimeoutMillis: 30000, // Release idle connections after 30s
  connectionTimeoutMillis: 2000, // Fail fast on connection attempts

  // Query timeouts (set in connection, not pool)
  application_name: 'fund-store-api',

  // Allow process to exit even with active connections
  allowExitOnIdle: true,
});

// Set up connection configuration
pool.on('connect', (client) => {
  // Set statement timeout for all queries
  client.query('SET statement_timeout = 5000'); // 5 second timeout
  client.query('SET lock_timeout = 3000'); // 3 second lock timeout
  client.query('SET idle_in_transaction_session_timeout = 10000'); // 10s idle transaction timeout

  // Set work_mem for better query performance
  client.query('SET work_mem = "8MB"');

  // Enable query timing
  client.query('SET track_io_timing = ON');
});

// Monitor pool health
pool.on('error', (err, client) => {
  logger.error('Database pool error', { err, database: dbName });
});

// Export pool metrics
export function getPoolMetrics() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    database: dbName,
  };
}

// Graceful shutdown
export async function closePool() {
  try {
    await pool.end();
    logger.info('Database pool closed', { database: dbName });
  } catch (error) {
    logger.error('Error closing database pool', { error, database: dbName });
  }
}
```

**Pool Metrics:**

- **Total connections:** 20 max (configurable via `DB_POOL_MAX`)
- **Idle timeout:** 30 seconds (releases unused connections)
- **Connection timeout:** 2 seconds (fail fast if database unavailable)
- **Query timeout:** 5 seconds (prevents long-running queries)

**Monitoring:**

```typescript
// Health check endpoint
app.get('/healthz', async (req, res) => {
  const dbHealthy = await storage.ping();
  const poolMetrics = getPoolMetrics();

  res.json({
    database: dbHealthy ? 'healthy' : 'unhealthy',
    pool: poolMetrics,
  });
});
```

**Source:** `server/db/pool.ts:1-74`

---

## Design Rationale

### Why Drizzle ORM?

**Decision:** Standardize on Drizzle ORM for all database access (2024-10-15)

| Feature            | Drizzle ORM     | Prisma             | TypeORM               | Raw SQL              |
| ------------------ | --------------- | ------------------ | --------------------- | -------------------- |
| **Type Safety**    | ✅ Compile-time | ✅ Generated types | ⚠️ Decorators         | ❌ Manual types      |
| **Performance**    | ✅ Lightweight  | ❌ Heavy runtime   | ⚠️ Medium overhead    | ✅ Direct SQL        |
| **SQL-First**      | ✅ SQL-like API | ❌ Abstracted      | ❌ Repository pattern | ✅ Raw SQL           |
| **Migrations**     | ✅ SQL-based    | ✅ Declarative     | ⚠️ Mixed              | ❌ Manual            |
| **Bundle Size**    | ✅ ~15KB        | ❌ ~200KB          | ❌ ~100KB             | ✅ ~5KB (pg)         |
| **Learning Curve** | ✅ Low          | ⚠️ Medium          | ⚠️ High               | ✅ Low (if know SQL) |

**Rationale:**

1. **Type Safety at Compile Time:** Drizzle infers TypeScript types from schema
   definitions

   ```typescript
   // shared/schema.ts
   export const funds = pgTable('funds', {
     id: serial('id').primaryKey(),
     size: decimal('size', { precision: 15, scale: 2 }).notNull(),
   });

   export type Fund = typeof funds.$inferSelect;
   // Fund = { id: number; size: string; ... }
   ```

2. **Lightweight vs Prisma/TypeORM:** Drizzle adds minimal runtime overhead
   (~15KB vs Prisma's ~200KB)

3. **SQL-First Approach:** Drizzle API mirrors SQL syntax (not
   abstraction-heavy)

   ```typescript
   // Drizzle (SQL-like)
   await db.select().from(funds).where(eq(funds.id, 1));

   // Prisma (abstracted)
   await prisma.fund.findUnique({ where: { id: 1 } });
   ```

4. **Better Performance for VC Fund Calculations:** Minimal query overhead
   matters for financial modeling
   - 30-60 second reserve calculations
   - 10,000+ Monte Carlo iterations
   - Real-time dashboard metrics

**Alternatives Considered:**

1. **Prisma**
   - ❌ Rejected: Heavy runtime (~200KB), slower query execution
   - ⚠️ Pro: Excellent DX, mature ecosystem

2. **TypeORM**
   - ❌ Rejected: Complex decorator syntax, repository pattern overkill
   - ⚠️ Pro: Feature-rich, active development

3. **Raw SQL (pg library)**
   - ⚠️ Considered: Maximum performance, no abstraction overhead
   - ❌ Rejected: No type safety, manual type definitions error-prone

**Trade-offs Accepted:**

- **Ecosystem Maturity:** Drizzle is newer than Prisma/TypeORM (less community
  resources)
  - Mitigation: Drizzle docs are excellent, team has SQL expertise

- **Migration Tooling:** Drizzle migrations are SQL-based (not declarative like
  Prisma)
  - Benefit: Full control over schema changes, easier to review

- **Complex Queries:** Some queries require raw SQL via `sql` template tag
  - Acceptable: 95% of queries use Drizzle, 5% use raw SQL for complex
    operations

**When to Revisit This Decision:**

1. **Performance Bottlenecks:** If Drizzle query overhead becomes measurable
   (unlikely)
2. **Feature Gaps:** If critical feature requires switching ORMs (e.g., advanced
   caching)
3. **Team Expertise:** If team loses SQL knowledge and needs more abstraction

**Source:** `shared/schema.ts:1-1628`, `server/db.ts:1-60`

### Why PostgreSQL?

**Decision:** Use PostgreSQL as primary database (2024-08-12)

**Rationale:**

1. **ACID Compliance for Financial Data:**

   ```sql
   -- Multi-table transaction (atomic)
   BEGIN;
     INSERT INTO fund_configs (...) VALUES (...);
     INSERT INTO fund_events (...) VALUES (...);
     INSERT INTO fund_snapshots (...) VALUES (...);
   COMMIT; -- All-or-nothing guarantee
   ```

   - Fund transactions must be atomic (no partial writes)
   - ACID properties prevent data corruption

2. **Complex Query Support:**
   - **CTEs (Common Table Expressions):** Multi-stage fund calculations
   - **Window Functions:** Cohort analysis, time-series metrics
   - **Recursive Queries:** Event replay for time-travel

   ```sql
   -- Cohort analysis with window functions
   SELECT
     vintage_year,
     company_name,
     IRR,
     PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY IRR) OVER (PARTITION BY vintage_year) AS cohort_median_irr
   FROM portfolio_companies
   WHERE vintage_year >= 2020;
   ```

3. **JSON(B) Support for Flexible Schemas:**

   ```typescript
   // Fund configuration stored as JSONB
   export const fundConfigs = pgTable('fundconfigs', {
     id: serial('id').primaryKey(),
     config: jsonb('config').notNull(), // Full fund model
   });

   // Query JSON fields
   await db
     .select()
     .from(fundConfigs)
     .where(sql`config->>'fundSize' > '100000000'`);
   ```

   - Fund models evolve (JSONB allows schema flexibility)
   - Avoid migrations for every field addition

4. **Proven Production Reliability:**
   - Battle-tested in financial industry (banking, trading, VC platforms)
   - Mature replication (streaming replication, logical replication)
   - Point-in-time recovery (PITR) for disaster recovery

**Alternatives Considered:**

1. **MySQL**
   - ❌ Rejected: Weaker JSON support, less robust transactions
   - ⚠️ Pro: Simpler operational model

2. **MongoDB**
   - ❌ Rejected: No ACID transactions (until v4.0), schemaless risks
   - ⚠️ Pro: Flexible schema, horizontal scaling

3. **SQLite**
   - ❌ Rejected: Single-writer limitation, no network access
   - ⚠️ Pro: Zero-config, embedded

**Trade-offs:**

- **Operational Complexity:** PostgreSQL requires tuning (connection pooling,
  vacuum, indexing)
  - Mitigation: Use managed service (Neon, AWS RDS, Supabase)

- **Horizontal Scaling:** PostgreSQL scales vertically (not horizontally like
  Cassandra)
  - Acceptable: VC fund platform has <10K funds, vertical scaling sufficient

**Source:** `server/db/pool.ts:1-74`, `shared/schema.ts:1-1628`

### Why CQRS + Event Sourcing?

**Decision:** Implement CQRS with Event Sourcing for fund state management
(2024-09-20)

**Rationale:**

1. **Audit Trail for Fund Events:**

   ```sql
   -- Every fund change logged (immutable)
   SELECT * FROM fund_events WHERE fund_id = 42 ORDER BY event_time DESC;

   -- Result:
   -- | event_type   | event_time          | user_id | payload                     |
   -- |--------------|---------------------|---------|----------------------------|
   -- | PUBLISHED    | 2025-11-06 10:15:00 | 7       | {"version": 2}             |
   -- | DRAFT_SAVED  | 2025-11-06 10:00:00 | 7       | {"size": "100000000"}      |
   -- | CREATED      | 2025-11-06 09:45:00 | 7       | {"name": "Fund I"}         |
   ```

   - Regulatory compliance (SEC requires audit logs)
   - Debugging: "Who changed the management fee on Nov 5?"

2. **Time-Travel Queries:**

   ```typescript
   // Reconstruct fund state at specific date
   async function getFundStateAt(
     fundId: number,
     targetDate: Date
   ): Promise<FundState> {
     // Find snapshot closest to target date
     const [snapshot] = await db
       .select()
       .from(fundSnapshots)
       .where(
         and(
           eq(fundSnapshots.fundId, fundId),
           lt(fundSnapshots.snapshotTime, targetDate)
         )
       )
       .orderBy(desc(fundSnapshots.snapshotTime))
       .limit(1);

     // Replay events after snapshot
     const events = await db
       .select()
       .from(fundEvents)
       .where(
         and(
           eq(fundEvents.fundId, fundId),
           gt(fundEvents.eventTime, snapshot.snapshotTime),
           lt(fundEvents.eventTime, targetDate)
         )
       )
       .orderBy(fundEvents.eventTime);

     // Apply events to snapshot state
     let state = snapshot.state;
     for (const event of events) {
       state = applyEvent(state, event);
     }

     return state;
   }
   ```

   - Answer: "What was the fund's NAV on Q3 2024 end?"
   - Compare performance: "Did IRR improve after strategy pivot?"

3. **Separation of Read/Write Performance Optimization:**
   - **Write Side:** Optimized for consistency (transactions, event logging)
   - **Read Side:** Optimized for speed (denormalized, pre-aggregated)

   ```typescript
   // Write: Atomic transaction (slow but consistent)
   await db.transaction(async (tx) => {
     await tx.insert(fundConfigs).values({...}); // 50ms
     await tx.insert(fundEvents).values({...});  // 20ms
     await tx.insert(fundSnapshots).values({...}); // 30ms
   }); // Total: 100ms

   // Read: Single SELECT (fast, no joins)
   const fund = await db.select().from(funds).where(eq(funds.id, id)); // 5ms
   ```

4. **Immutable Event Log for Compliance:**
   - Events never deleted (append-only log)
   - 7-year retention for audit log (SEC requirement)
   - Tamper-evident (event hash chain)

**Alternatives Considered:**

1. **Traditional CRUD (Single Model):**
   - ❌ Rejected: No audit trail, overwrites history
   - ⚠️ Pro: Simpler to implement

2. **Audit Columns (created_at, updated_at, updated_by):**
   - ❌ Rejected: Only tracks last change, not full history
   - ⚠️ Pro: Minimal schema changes

3. **Database Triggers for Audit Logging:**
   - ❌ Rejected: Hard to test, couples business logic to database
   - ⚠️ Pro: Automatic, no application code changes

**Trade-offs:**

- **Storage Overhead:** Event log grows indefinitely (10KB per event × 1000
  events/fund = 10MB/fund)
  - Mitigation: Archive old events to cold storage (S3, Glacier)

- **Query Complexity:** Reconstructing state requires event replay
  - Mitigation: Snapshots reduce replay (snapshot every 100 events)

- **Development Complexity:** Developers must understand event sourcing patterns
  - Mitigation: Storage layer abstracts complexity, developers use simple CRUD
    methods

**Source:** `shared/schema.ts:34-67`,
`docs/internal/architecture/state-flow.md:82-134`

---

## Key Components

### Schema Definition (shared/schema.ts)

Drizzle schema definitions for all database tables:

```typescript
// shared/schema.ts - Core fund tables
import {
  pgTable,
  serial,
  text,
  decimal,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';

// Main funds table (read-optimized)
export const funds = pgTable('funds', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  size: decimal('size', { precision: 15, scale: 2 }).notNull(),
  deployedCapital: decimal('deployed_capital', {
    precision: 15,
    scale: 2,
  }).default('0'),
  managementFee: decimal('management_fee', {
    precision: 5,
    scale: 4,
  }).notNull(),
  carryPercentage: decimal('carry_percentage', {
    precision: 5,
    scale: 4,
  }).notNull(),
  vintageYear: integer('vintage_year').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Fund configurations (versioned, write-optimized)
export const fundConfigs = pgTable(
  'fundconfigs',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .references(() => funds.id)
      .notNull(),
    version: integer('version').notNull().default(1),
    config: jsonb('config').notNull(), // Full fund configuration as JSON
    isDraft: boolean('is_draft').default(true),
    isPublished: boolean('is_published').default(false),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    fundVersionIdx: index('fundconfigs_fund_version_idx').on(
      table.fundId,
      table.version
    ),
  })
);

// Event log (immutable audit trail)
export const fundEvents = pgTable(
  'fund_events',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .references(() => funds.id)
      .notNull(),
    eventType: varchar('event_type', { length: 50 }).notNull(), // 'DRAFT_SAVED', 'PUBLISHED', 'CALC_TRIGGERED'
    payload: jsonb('payload'), // Event data
    userId: integer('user_id').references(() => users.id),
    eventTime: timestamp('event_time').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    fundEventIdx: index('fund_events_fund_idx').on(
      table.fundId,
      table.createdAt.desc()
    ),
  })
);

// Snapshots for fast queries (pre-computed results)
export const fundSnapshots = pgTable(
  'fund_snapshots',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .references(() => funds.id)
      .notNull(),
    type: varchar('type', { length: 50 }).notNull(), // 'RESERVE', 'PACING', 'COHORT'
    payload: jsonb('payload').notNull(), // Calculation results
    calcVersion: varchar('calc_version', { length: 20 }).notNull(),
    snapshotTime: timestamp('snapshot_time').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    lookupIdx: index('fund_snapshots_lookup_idx').on(
      table.fundId,
      table.type,
      table.createdAt.desc()
    ),
  })
);

// Type inference (automatic TypeScript types)
export type Fund = typeof funds.$inferSelect;
export type InsertFund = typeof funds.$inferInsert;
export type FundConfig = typeof fundConfigs.$inferSelect;
export type FundEvent = typeof fundEvents.$inferSelect;
export type FundSnapshot = typeof fundSnapshots.$inferSelect;
```

**Key Schema Tables:**

| Table                | Purpose                  | Write Pattern              | Read Pattern               |
| -------------------- | ------------------------ | -------------------------- | -------------------------- |
| `funds`              | Current fund state       | Infrequent (on publish)    | Frequent (dashboards)      |
| `fundConfigs`        | Versioned configurations | Every save (draft)         | Rare (config editor)       |
| `fundEvents`         | Immutable event log      | Every action               | Rare (audit, time-travel)  |
| `fundSnapshots`      | Pre-computed results     | After calculations         | Frequent (analytics)       |
| `portfolioCompanies` | Portfolio holdings       | Moderate (company updates) | Frequent (portfolio view)  |
| `fundMetrics`        | Performance metrics      | Daily (batch job)          | Very frequent (dashboards) |

**Source:** `shared/schema.ts:4-67`

### Storage Layer (server/storage.ts)

Repository pattern implementation with two storage backends:

```typescript
// server/storage.ts - DatabaseStorage implementation
import { db } from './db';
import { funds, portfolioCompanies, investments } from '@shared/schema';
import { eq } from 'drizzle-orm';

export class DatabaseStorage implements IStorage {
  // Health check
  async ping(): Promise<boolean> {
    try {
      await db.execute(sql`SELECT 1`);
      return true;
    } catch (error) {
      console.error('Database ping failed:', error);
      return false;
    }
  }

  // Fund operations
  async getAllFunds(): Promise<Fund[]> {
    return await db.select().from(funds);
  }

  async getFund(id: number): Promise<Fund | undefined> {
    const [fund] = await db.select().from(funds).where(eq(funds.id, id));
    return fund || undefined;
  }

  async createFund(insertFund: InsertFund): Promise<Fund> {
    const [fund] = await db
      .insert(funds)
      .values({
        name: insertFund.name,
        size: insertFund.size.toString(),
        managementFee: insertFund.managementFee.toString(),
        carryPercentage: insertFund.carryPercentage.toString(),
        vintageYear: insertFund.vintageYear,
      })
      .returning();

    if (!fund) throw new Error('Failed to create fund');
    return fund;
  }

  // Portfolio operations
  async getPortfolioCompanies(fundId?: number): Promise<PortfolioCompany[]> {
    if (fundId) {
      return await db
        .select()
        .from(portfolioCompanies)
        .where(eq(portfolioCompanies.fundId, fundId));
    }
    return await db.select().from(portfolioCompanies);
  }

  // ... more methods
}

// Automatic backend selection
export const storage = process.env['DATABASE_URL']
  ? new DatabaseStorage()
  : new MemStorage();
```

**Storage Layer Benefits:**

1. **Testability:** Swap `DatabaseStorage` for `MemStorage` in tests
2. **Consistency:** All database access goes through standard interface
3. **Type Safety:** Methods return typed objects (not `any`)
4. **Migration Path:** Easy to switch databases (add new implementation)

**Source:** `server/storage.ts:413-593`

### Connection Pool (server/db/pool.ts)

Optimized PostgreSQL connection pool configuration:

```typescript
// server/db/pool.ts
import { Pool } from 'pg';
import { logger } from './logger';

// Parse connection string to get database name
const dbName =
  process.env['DATABASE_URL']?.split('/').pop()?.split('?')[0] || 'unknown';

// Optimized pool configuration
export const pool = new Pool({
  connectionString: process.env['DATABASE_URL'],

  // Pool sizing (adjust based on your server capacity)
  max: parseInt(process.env['DB_POOL_MAX'] || '20'),
  min: parseInt(process.env['DB_POOL_MIN'] || '2'),

  // Timeouts
  idleTimeoutMillis: 30000, // Release idle connections after 30s
  connectionTimeoutMillis: 2000, // Fail fast on connection attempts

  // Query timeouts (set in connection, not pool)
  application_name: 'fund-store-api',

  // Allow process to exit even with active connections
  allowExitOnIdle: true,
});

// Set up connection configuration
pool.on('connect', (client) => {
  // Set statement timeout for all queries
  client.query('SET statement_timeout = 5000'); // 5 second timeout
  client.query('SET lock_timeout = 3000'); // 3 second lock timeout
  client.query('SET idle_in_transaction_session_timeout = 10000'); // 10s idle transaction timeout

  // Set work_mem for better query performance
  client.query('SET work_mem = "8MB"');

  // Enable query timing
  client.query('SET track_io_timing = ON');
});

// Monitor pool health
pool.on('error', (err, client) => {
  logger.error('Database pool error', { err, database: dbName });
});

// Export pool metrics
export function getPoolMetrics() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    database: dbName,
  };
}

// Graceful shutdown
export async function closePool() {
  try {
    await pool.end();
    logger.info('Database pool closed', { database: dbName });
  } catch (error) {
    logger.error('Error closing database pool', { error, database: dbName });
  }
}

export const db = drizzle(pool);
```

**Pool Configuration Guidelines:**

| Parameter                 | Recommended Value | Rationale                                                       |
| ------------------------- | ----------------- | --------------------------------------------------------------- |
| `max`                     | 20                | 1 connection per concurrent request, leave headroom for workers |
| `min`                     | 2                 | Keep warm connections, reduce latency                           |
| `idleTimeoutMillis`       | 30000 (30s)       | Release idle connections to prevent pool exhaustion             |
| `connectionTimeoutMillis` | 2000 (2s)         | Fail fast if database unavailable                               |
| `statement_timeout`       | 5000 (5s)         | Prevent long-running queries from blocking pool                 |

**Source:** `server/db/pool.ts:1-74`

---

## Getting Started

### Simple Example: Creating and Querying a Fund

**Step 1: Define Schema (already done in `shared/schema.ts`)**

```typescript
// shared/schema.ts - Fund table definition
export const funds = pgTable('funds', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  size: decimal('size', { precision: 15, scale: 2 }).notNull(),
  managementFee: decimal('management_fee', {
    precision: 5,
    scale: 4,
  }).notNull(),
  vintageYear: integer('vintage_year').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export type Fund = typeof funds.$inferSelect;
export type InsertFund = typeof funds.$inferInsert;
```

**Step 2: Use Storage Layer to Create Fund**

```typescript
// server/routes/funds.ts
import { storage } from '../storage';
import { InsertFund } from '@shared/schema';

router.post('/funds', async (req, res) => {
  try {
    // Validate input (Zod schema)
    const fundData: InsertFund = {
      name: req.body.name,
      size: req.body.size,
      managementFee: req.body.managementFee,
      vintageYear: req.body.vintageYear,
    };

    // Create fund through storage layer
    const fund = await storage.createFund(fundData);

    console.log('Created fund:', fund);
    // Output: { id: 1, name: "Fund I", size: "100000000.00", ... }

    res.status(201).json(fund);
  } catch (error) {
    console.error('Failed to create fund:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

**Step 3: Query Fund**

```typescript
// server/routes/funds.ts
router.get('/funds/:id', async (req, res) => {
  try {
    const fundId = parseInt(req.params.id);

    // Query through storage layer
    const fund = await storage.getFund(fundId);

    if (!fund) {
      return res.status(404).json({ error: 'Fund not found' });
    }

    console.log('Retrieved fund:', fund);
    // Output: { id: 1, name: "Fund I", size: "100000000.00", ... }

    res.json(fund);
  } catch (error) {
    console.error('Failed to fetch fund:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

**Step 4: Handle Errors Properly**

```typescript
// server/routes/funds.ts
import { ZodError } from 'zod';
import { CreateFundSchema } from '../validators/fundSchema';

router.post('/funds', async (req, res) => {
  try {
    // Validate with Zod
    const validated = CreateFundSchema.parse(req.body);

    // Create fund
    const fund = await storage.createFund(validated);

    res.status(201).json(fund);
  } catch (error) {
    // Handle validation errors
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.format(),
      });
    }

    // Handle database errors
    if (error instanceof Error && error.message.includes('duplicate key')) {
      return res.status(409).json({ error: 'Fund already exists' });
    }

    // Generic error
    console.error('Unexpected error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

**Example Output:**

```json
// POST /api/funds
// Request:
{
  "name": "Press On Ventures Fund II",
  "size": 150000000,
  "managementFee": 0.025,
  "vintageYear": 2025
}

// Response (201 Created):
{
  "id": 2,
  "name": "Press On Ventures Fund II",
  "size": "150000000.00",
  "managementFee": "0.0250",
  "carryPercentage": "0.2000",
  "vintageYear": 2025,
  "status": "active",
  "createdAt": "2025-11-06T15:30:00.000Z"
}

// GET /api/funds/2
// Response (200 OK):
{
  "id": 2,
  "name": "Press On Ventures Fund II",
  "size": "150000000.00",
  "managementFee": "0.0250",
  "vintageYear": 2025,
  "status": "active",
  "createdAt": "2025-11-06T15:30:00.000Z"
}
```

**Source:** `server/storage.ts:449-471`, `server/routes/funds.ts:29-85`

---

## Common Patterns

This section provides high-level patterns. For detailed query examples (60+
patterns), see [02-patterns.md](./02-patterns.md).

### Read Pattern (SELECT via storage.ts)

```typescript
// Simple read (single record)
const fund = await storage.getFund(fundId);

// List with filter
const companies = await storage.getPortfolioCompanies(fundId);

// With error handling
const fund = await storage.getFund(fundId);
if (!fund) {
  throw new Error('Fund not found');
}
```

**Complexity:** O(1) with indexes, O(n) without

**Source:** `server/storage.ts:449-586`

### Write Pattern (INSERT with event logging)

```typescript
// Write with transaction
await db.transaction(async (tx) => {
  // 1. Insert main record
  const [fund] = await tx.insert(funds).values({...}).returning();

  // 2. Log event (audit trail)
  await tx.insert(fundEvents).values({
    fundId: fund.id,
    eventType: 'CREATED',
    payload: { name: fund.name },
    eventTime: new Date(),
  });
});
```

**Why Transaction:** Ensures atomic write (all-or-nothing)

**Source:** `shared/schema.ts:53-67`,
`docs/internal/database/02-patterns.md:127-168`

### Transaction Pattern (atomic multi-table writes)

```typescript
// Complex transaction (fund publish flow)
await db.transaction(async (tx) => {
  // Step 1: Update config
  await tx.insert(fundConfigs).values({
    fundId,
    version: newVersion,
    isPublished: true,
  });

  // Step 2: Log event
  await tx.insert(fundEvents).values({
    fundId,
    eventType: 'PUBLISHED',
    eventTime: new Date(),
  });

  // Step 3: Create snapshot
  await tx.insert(fundSnapshots).values({
    fundId,
    type: 'RESERVE',
    payload: results,
    snapshotTime: new Date(),
  });
});
```

**Transaction Guarantees:**

- **Atomicity:** All steps succeed or all rollback
- **Consistency:** Database constraints enforced
- **Isolation:** Other transactions don't see partial state
- **Durability:** Committed data survives crashes

**Source:** `docs/internal/database/02-patterns.md:127-168`

### Time-Travel Pattern (event replay)

```typescript
// Reconstruct fund state at specific date
async function getFundStateAt(fundId: number, targetDate: Date) {
  // 1. Find closest snapshot before target date
  const [snapshot] = await db
    .select()
    .from(fundSnapshots)
    .where(
      and(
        eq(fundSnapshots.fundId, fundId),
        lt(fundSnapshots.snapshotTime, targetDate)
      )
    )
    .orderBy(desc(fundSnapshots.snapshotTime))
    .limit(1);

  if (!snapshot) {
    throw new Error('No snapshot found before target date');
  }

  // 2. Get events after snapshot, before target date
  const events = await db
    .select()
    .from(fundEvents)
    .where(
      and(
        eq(fundEvents.fundId, fundId),
        gt(fundEvents.eventTime, snapshot.snapshotTime),
        lt(fundEvents.eventTime, targetDate)
      )
    )
    .orderBy(fundEvents.eventTime);

  // 3. Replay events to reconstruct state
  let state = snapshot.state;
  for (const event of events) {
    state = applyEvent(state, event);
  }

  return state;
}

// Helper: Apply event to state
function applyEvent(state: any, event: FundEvent): any {
  switch (event.eventType) {
    case 'DRAFT_SAVED':
      return { ...state, ...event.payload };
    case 'PUBLISHED':
      return { ...state, isPublished: true, version: event.payload.version };
    default:
      return state;
  }
}
```

**Use Cases:**

- "What was fund NAV on 2024-12-31?"
- "Show fund performance before strategy change"
- "Compliance: audit fund state at specific date"

**Source:** `shared/schema.ts:34-50`, Event Sourcing pattern

---

## Next Steps

### Detailed Documentation

- **[02-patterns.md](./02-patterns.md)** - 60+ query examples (SELECT, INSERT,
  UPDATE, DELETE, transactions, CTEs, window functions)
- **[03-optimization.md](./03-optimization.md)** - Performance tuning (indexes,
  query plans, connection pooling, caching strategies)
- **[../architecture/state-flow.md](../architecture/state-flow.md)** - Visual
  data flow diagrams (request-response, CQRS, event sourcing)

### Practical Guides

- **Migrations:** See `migrations/` directory for schema evolution examples
- **Testing:** `tests/unit/database/` contains database test patterns
- **Monitoring:** `server/metrics.ts` for database performance metrics

### Performance Optimization

- **Query Profiling:** Use `EXPLAIN ANALYZE` to identify slow queries

  ```sql
  EXPLAIN ANALYZE SELECT * FROM funds WHERE vintage_year = 2024;
  ```

- **Index Creation:** Add indexes for frequently queried columns

  ```sql
  CREATE INDEX idx_funds_vintage_year ON funds(vintage_year);
  ```

- **Connection Pool Tuning:** Adjust pool size based on server capacity
  ```bash
  export DB_POOL_MAX=30  # Increase for high-traffic servers
  ```

### Troubleshooting

Common issues and solutions:

| Issue                     | Symptom                   | Solution                                           |
| ------------------------- | ------------------------- | -------------------------------------------------- |
| Connection pool exhausted | "Too many clients" error  | Increase `DB_POOL_MAX`, check for connection leaks |
| Slow queries              | p95 > 200ms               | Add indexes, optimize query, use `EXPLAIN ANALYZE` |
| Transaction deadlocks     | "Deadlock detected" error | Reduce transaction scope, retry with backoff       |
| Migration failures        | Schema out of sync        | Rollback migration, fix schema, re-run             |

**Source:** `docs/internal/database/02-patterns.md:1089-1150`

---

## Definition of Done

**Security/Reliability:** CQRS event log immutable; connection pool prevents
exhaustion; prepared statements prevent SQL injection; transactions ensure ACID
properties **Observability:** Log `{query_type, duration_ms, rows_affected}`;
metric: `db.query_duration_ms`; span: `db.{operation}` (e.g., `db.select`,
`db.insert`) **Performance:** Target p95 < 200ms for complex queries; connection
pool size: 10-20 (configurable); query timeout: 5s; statement timeout: 5s; lock
timeout: 3s **Example:** `await storage.getFund(fundId)` → returns typed `Fund`
object with full schema; `null` if not found; throws on database error
**Ownership:** DRI=database team; next review: 2026-05-06

---

**Related Documentation:**

- [02-patterns.md](./02-patterns.md) - Comprehensive query pattern guide (60+
  examples)
- [03-optimization.md](./03-optimization.md) - Performance tuning and
  optimization strategies
- [../architecture/state-flow.md](../architecture/state-flow.md) - Visual data
  flow diagrams across stack
- [../validation/01-overview.md](../validation/01-overview.md) - Zod validation
  patterns at API boundaries
