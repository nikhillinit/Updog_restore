---
status: ACTIVE
last_updated: 2026-01-19
---

# Database Query Patterns & Transactions

**Purpose:** Comprehensive guide to query patterns, transactions, CQRS
implementation, and best practices using Drizzle ORM and raw PostgreSQL.

**Audience:** Backend developers working with the fund modeling API.

**Related Documentation:**

- [Database Overview](./01-overview.md) - Architecture and schema design
- [Schema Reference](../../../shared/schema.ts) - Table definitions
- [Storage Abstraction](../../../server/storage.ts) - Repository pattern
  implementation

---

## Table of Contents

1. [Query Patterns](#query-patterns)
2. [Transactions](#transactions)
3. [CQRS Pattern](#cqrs-pattern)
4. [Joins & Relations](#joins--relations)
5. [Copy-Paste Examples](#copy-paste-examples)
6. [Anti-Patterns](#anti-patterns)
7. [Troubleshooting](#troubleshooting)

---

## Query Patterns

This codebase uses **two query approaches**: Drizzle ORM for type-safe queries
and raw SQL via `pg` for complex operations.

### Import Strategy

```typescript
// Drizzle ORM (preferred for CRUD)
import { db } from '../db';
import { funds, portfolioCompanies, fundEvents } from '@shared/schema';
import { eq, and, lt, desc, sql } from 'drizzle-orm';

// Raw SQL (for complex transactions)
import { query, transaction, queryOne } from '../db/pg-circuit';
```

**Source:** `server/db/index.ts:1-24`, `server/routes/allocations.ts:16-18`

---

### Select Queries

#### 1. Simple Select (Single Record)

```typescript
// Drizzle ORM - Returns array, destructure for single result
const [fund] = await db.select().from(funds).where(eq(funds.id, fundId));

if (!fund) {
  throw new Error('Fund not found');
}
```

**Source:** `server/storage.ts:453-456`

**Expected Output:**

```typescript
{
  id: 1,
  name: "Press On Ventures Fund I",
  size: "100000000.00",
  managementFee: "0.0250",
  vintageYear: 2020,
  status: "active",
  createdAt: Date
}
```

#### 2. Select with Multiple Conditions

```typescript
// Build WHERE conditions dynamically
const conditions: SQL[] = [eq(portfolioCompanies.fundId, fundId)];

if (query.status) {
  conditions.push(eq(portfolioCompanies.status, query.status));
}

if (query.sector) {
  conditions.push(eq(portfolioCompanies.sector, query.sector));
}

// Search filter (case-insensitive LIKE)
if (query.q) {
  conditions.push(
    sql`LOWER(${portfolioCompanies.name}) LIKE LOWER(${`%${query.q}%`})`
  );
}

const results = await db
  .select()
  .from(portfolioCompanies)
  .where(and(...conditions));
```

**Source:** `server/routes/allocations.ts:417-442`

**Best Practice:** Build conditions array dynamically for optional filters.

#### 3. Select with Ordering and Pagination

```typescript
// Cursor-based pagination (more efficient than OFFSET)
const conditions: SQL[] = [eq(portfolioCompanies.fundId, fundId)];

// Cursor condition (id < cursor for DESC ordering)
if (cursor !== undefined) {
  conditions.push(lt(portfolioCompanies.id, cursor));
}

// Fetch limit + 1 to detect if there are more results
const fetchLimit = limit + 1;

const results = await db
  .select()
  .from(portfolioCompanies)
  .where(and(...conditions))
  .orderBy(
    sql`${portfolioCompanies.exitMoicBps} DESC NULLS LAST`,
    desc(portfolioCompanies.id)
  )
  .limit(fetchLimit);

// Check if we have more results
const hasMore = results.length > limit;
const companies = hasMore ? results.slice(0, limit) : results;
const nextCursor =
  hasMore && companies.length > 0
    ? companies[companies.length - 1].id.toString()
    : null;
```

**Source:** `server/routes/allocations.ts:420-508`

**Why Cursor Pagination?**

- Stable results even when data changes
- Better performance than OFFSET for large datasets
- Prevents skipped/duplicate records

#### 4. Select Specific Columns

```typescript
// Only fetch needed columns to reduce network overhead
const results = await db
  .select({
    id: portfolioCompanies.id,
    name: portfolioCompanies.name,
    sector: portfolioCompanies.sector,
    stage: portfolioCompanies.stage,
    plannedReservesCents: portfolioCompanies.plannedReservesCents,
  })
  .from(portfolioCompanies)
  .where(eq(portfolioCompanies.fundId, fundId));
```

**Source:** `server/routes/allocations.ts:480-495`

**Performance:** Selecting specific columns reduces data transfer by 50-80% vs
`SELECT *`.

#### 5. Aggregate Queries

```typescript
// Count query
const fundCheck = await db
  .select({ count: sql<number>`count(*)` })
  .from(portfolioCompanies)
  .where(eq(portfolioCompanies.fundId, fundId));

const totalCompanies = fundCheck[0]?.count || 0;
```

**Source:** `server/routes/allocations.ts:530-533`

```typescript
// Custom aggregation with raw SQL
const result = await query<{ total_planned: string }>(
  `SELECT SUM(planned_reserves_cents) as total_planned
   FROM portfoliocompanies
   WHERE fund_id = $1`,
  [fundId]
);

const totalPlanned = parseInt(result.rows[0].total_planned, 10);
```

**Pattern:** Use `sql<Type>` template tag for type-safe raw SQL in Drizzle
queries.

---

### Insert Queries

#### 1. Simple Insert (Single Record)

```typescript
// With .returning() to get the inserted record
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

if (!fund) {
  throw new Error('Failed to create fund');
}

return fund;
```

**Source:** `server/storage.ts:458-471`

**Critical:** Always use `.returning()` to get the inserted record with
auto-generated IDs.

#### 2. Bulk Insert

```typescript
// Insert multiple records in single query
const companies = [
  { fundId: 1, name: 'TechCorp', sector: 'Fintech', stage: 'Series B' },
  { fundId: 1, name: 'HealthAI', sector: 'Healthcare', stage: 'Series A' },
  { fundId: 1, name: 'DataFlow', sector: 'SaaS', stage: 'Series C' },
];

const results = await db
  .insert(portfolioCompanies)
  .values(companies)
  .returning();

console.log(`Inserted ${results.length} companies`);
```

**Performance:** Bulk inserts are 10-100x faster than individual inserts in a
loop.

#### 3. Insert with Conflict Handling

```typescript
// Upsert pattern using onConflictDoUpdate
import { eq } from 'drizzle-orm';

const [activity] = await db
  .insert(activities)
  .values({
    fundId,
    companyId,
    type: 'investment',
    title: 'New Investment',
    activityDate: new Date(),
  })
  .onConflictDoUpdate({
    target: [activities.fundId, activities.companyId, activities.activityDate],
    set: {
      title: sql`EXCLUDED.title`,
      updatedAt: sql`NOW()`,
    },
  })
  .returning();
```

**Use Case:** Idempotent inserts when duplicate key errors should update
instead.

#### 4. Insert with Raw SQL (Complex Logic)

```typescript
// Use raw SQL when Drizzle syntax becomes cumbersome
import { query } from '../db';

const result = await query(
  `INSERT INTO fund_events (
     fund_id, event_type, payload, user_id, event_time, operation
   ) VALUES ($1, $2, $3, $4, NOW(), $5)
   RETURNING id, event_time`,
  [
    fundId,
    'ALLOCATION_UPDATED',
    JSON.stringify({ updates, new_version: newVersion }),
    userId,
    'UPDATE',
  ]
);

const event = result.rows[0];
```

**Source:** `server/routes/allocations.ts:302-322`

#### 5. Insert Audit Log Entry

```typescript
// Standard audit logging pattern
await client.query(
  `INSERT INTO fund_events (
     fund_id, event_type, payload, user_id, event_time,
     operation, entity_type, metadata
   ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)`,
  [
    fundId,
    'ALLOCATION_UPDATED',
    JSON.stringify({
      updates,
      new_version: newVersion,
      update_count: updates.length,
    }),
    userId,
    'UPDATE',
    'allocation',
    JSON.stringify({
      timestamp: new Date().toISOString(),
      company_count: updates.length,
    }),
  ]
);
```

**Source:** `server/routes/allocations.ts:302-322`

**Pattern:** All state mutations should create corresponding audit log entries.

---

### Update Queries

#### 1. Simple Update (Single Field)

```typescript
// Update with WHERE condition
await db
  .update(portfolioCompanies)
  .set({
    plannedReservesCents: newValue,
    lastAllocationAt: new Date(),
  })
  .where(eq(portfolioCompanies.id, companyId));
```

**Note:** No `.returning()` needed unless you need the updated record.

#### 2. Optimistic Locking Update

```typescript
// Update with version check (prevents lost updates)
const result = await client.query(
  `UPDATE portfoliocompanies
   SET
     planned_reserves_cents = $1,
     allocation_version = allocation_version + 1,
     last_allocation_at = NOW()
   WHERE fund_id = $2 AND id = $3 AND allocation_version = $4
   RETURNING allocation_version`,
  [update.planned_reserves_cents, fundId, update.company_id, expectedVersion]
);

// Check if update succeeded
if (result.rows.length === 0) {
  // Version conflict - another user updated the record
  return {
    company_id: update.company_id,
    expected_version: expectedVersion,
    actual_version: currentVersion,
  };
}
```

**Source:** `server/routes/allocations.ts:259-287`

**Critical:** Always increment version number atomically with the update.

#### 3. Batch Update with CASE Statements

```typescript
// Update multiple records in single query
const companyIds = proposed_allocations.map((p) => p.company_id);
const params: (number | null)[] = [fundId];

// Build CASE WHEN for planned_reserves_cents
const plannedCases = proposed_allocations
  .map((prop, idx) => {
    params.push(prop.company_id);
    params.push(prop.planned_reserves_cents);
    return `WHEN $${params.length - 1} THEN $${params.length}::BIGINT`;
  })
  .join(' ');

// Add company IDs to params
const companyIdPlaceholders = companyIds
  .map((id) => {
    params.push(id);
    return `$${params.length}`;
  })
  .join(',');

// Construct UPDATE query
const updateQuery = `
  UPDATE portfoliocompanies
  SET
    planned_reserves_cents = CASE id ${plannedCases} ELSE planned_reserves_cents END,
    allocation_version = allocation_version + 1,
    last_allocation_at = NOW()
  WHERE fund_id = $1 AND id IN (${companyIdPlaceholders})
`;

const updateResult = await client.query(updateQuery, params);
console.log(`Updated ${updateResult.rowCount} companies`);
```

**Source:** `server/routes/reallocation.ts:485-532`

**Performance:** Batch updates are 10-50x faster than individual updates in a
loop.

#### 4. Conditional Update (Only if Changed)

```typescript
// Skip update if values haven't changed
const [current] = await db
  .select({ plannedReservesCents: portfolioCompanies.plannedReservesCents })
  .from(portfolioCompanies)
  .where(eq(portfolioCompanies.id, companyId));

if (current.plannedReservesCents !== newValue) {
  await db
    .update(portfolioCompanies)
    .set({
      plannedReservesCents: newValue,
      lastAllocationAt: new Date(),
    })
    .where(eq(portfolioCompanies.id, companyId));
}
```

**Use Case:** Prevent unnecessary database writes and audit log noise.

#### 5. Update with Computed Values

```typescript
// Use raw SQL for complex updates
await query(
  `UPDATE portfoliocompanies
   SET
     deployed_reserves_cents = deployed_reserves_cents + $1,
     allocation_iteration = allocation_iteration + 1,
     last_allocation_at = NOW()
   WHERE id = $2`,
  [additionalReserves, companyId]
);
```

**Pattern:** Use `column = column + value` for atomic increments.

---

### Delete Queries

#### 1. Simple Delete

```typescript
// Delete with WHERE condition
await db.delete(portfolioCompanies).where(eq(portfolioCompanies.id, companyId));
```

#### 2. Soft Delete (Preferred)

```typescript
// Mark as inactive instead of deleting
await db
  .update(portfolioCompanies)
  .set({
    status: 'written-off',
    updatedAt: new Date(),
  })
  .where(eq(portfolioCompanies.id, companyId));
```

**Best Practice:** Use soft deletes for audit trail and data recovery.

#### 3. Cascading Delete

```typescript
// Delete parent and children in transaction
await transaction(async (client) => {
  // Delete children first (if no CASCADE)
  await client.query('DELETE FROM investments WHERE company_id = $1', [
    companyId,
  ]);

  // Delete parent
  await client.query('DELETE FROM portfoliocompanies WHERE id = $1', [
    companyId,
  ]);
});
```

**Note:** Schema defines `onDelete: 'cascade'` for `scenarios` table (see
`shared/schema.ts:112`).

#### 4. Conditional Delete

```typescript
// Delete only if condition met
const result = await db
  .delete(activities)
  .where(and(eq(activities.fundId, fundId), eq(activities.type, 'draft')))
  .returning({ id: activities.id });

console.log(`Deleted ${result.length} draft activities`);
```

#### 5. Bulk Delete with Subquery

```typescript
// Delete records matching subquery
await query(
  `DELETE FROM fund_events
   WHERE fund_id IN (
     SELECT id FROM funds WHERE status = 'archived'
   )`
);
```

**Warning:** Test subquery separately before using in DELETE.

---

## Transactions

Transactions ensure **ACID properties** (Atomicity, Consistency, Isolation,
Durability) for multi-step operations.

### Transaction Basics

#### Standard Transaction Pattern

```typescript
import { transaction } from '../db/pg-circuit';
import type { PoolClient } from 'pg';

const result = await transaction(async (client: PoolClient) => {
  // Step 1: Lock rows
  const lockResult = await client.query(
    'SELECT * FROM portfoliocompanies WHERE fund_id = $1 FOR UPDATE',
    [fundId]
  );

  // Step 2: Perform updates
  await client.query(
    'UPDATE portfoliocompanies SET planned_reserves_cents = $1 WHERE id = $2',
    [newValue, companyId]
  );

  // Step 3: Log audit event
  await client.query(
    'INSERT INTO fund_events (fund_id, event_type, payload) VALUES ($1, $2, $3)',
    [fundId, 'UPDATE', JSON.stringify({ companyId, newValue })]
  );

  return { success: true };
});
```

**Source:** `server/db/pg-circuit.ts:191-207`

**Behavior:**

- `BEGIN` executed automatically
- `COMMIT` on successful completion
- `ROLLBACK` on any error
- Connection released back to pool

#### Transaction with Circuit Breaker

```typescript
import { transactionWithBreaker } from '../db';

// Automatically retries transient failures
const result = await transactionWithBreaker(async (client) => {
  // Transaction logic here
});
```

**Source:** `server/db/pg-circuit.ts:212-221`

**Use Case:** Production environments with network instability.

---

### Isolation Levels

PostgreSQL default: **READ COMMITTED**

#### 1. Read Committed (Default)

```typescript
// Each query sees committed data as of query start
await transaction(async (client) => {
  // Sees latest committed data
  const [fund] = await client.query('SELECT * FROM funds WHERE id = $1', [1]);

  // If another transaction commits here, next query sees new data
  const companies = await client.query(
    'SELECT * FROM portfoliocompanies WHERE fund_id = $1',
    [1]
  );
});
```

**Use Case:** Most operations (balances reads and writes).

#### 2. Repeatable Read

```typescript
// Consistent snapshot throughout transaction
await transaction(async (client) => {
  await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');

  const snapshot1 = await client.query(
    'SELECT SUM(planned_reserves_cents) FROM portfoliocompanies WHERE fund_id = $1',
    [1]
  );

  // Even if another transaction commits, this sees same data
  const snapshot2 = await client.query(
    'SELECT SUM(planned_reserves_cents) FROM portfoliocompanies WHERE fund_id = $1',
    [1]
  );

  // snapshot1 === snapshot2
});
```

**Use Case:** Reporting queries that need consistent view.

#### 3. Serializable

```typescript
// Strictest isolation - prevents phantom reads
await transaction(async (client) => {
  await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');

  // Transaction may fail with "could not serialize access" error
  // Application must retry
});
```

**Use Case:** Financial calculations requiring absolute consistency.

**Warning:** Higher risk of serialization failures - implement retry logic.

---

### Row-Level Locking

#### 1. FOR UPDATE (Exclusive Lock)

```typescript
// Lock rows to prevent concurrent updates
await transaction(async (client) => {
  // Lock all companies in fund
  const result = await client.query(
    `SELECT allocation_version
     FROM portfoliocompanies
     WHERE fund_id = $1
     FOR UPDATE`,
    [fundId]
  );

  // Other transactions block here until we commit/rollback
  // Perform updates safely
});
```

**Source:** `server/routes/allocations.ts:233-239`,
`server/routes/reallocation.ts:428-434`

**Behavior:** Blocks concurrent `SELECT FOR UPDATE`, `UPDATE`, `DELETE`.

#### 2. FOR UPDATE NOWAIT

```typescript
// Fail immediately if row is locked
await transaction(async (client) => {
  try {
    await client.query(
      'SELECT * FROM portfoliocompanies WHERE id = $1 FOR UPDATE NOWAIT',
      [companyId]
    );
  } catch (error) {
    // Row is locked by another transaction
    throw new Error('Resource is currently locked - please retry');
  }
});
```

**Use Case:** User-facing operations that shouldn't block.

#### 3. FOR UPDATE SKIP LOCKED

```typescript
// Lock available rows, skip locked ones
const result = await query(
  `SELECT id FROM portfoliocompanies
   WHERE fund_id = $1 AND status = 'pending'
   FOR UPDATE SKIP LOCKED
   LIMIT 10`
);

// Process unlocked rows (useful for job queues)
```

**Use Case:** Background workers processing queue items.

#### 4. FOR SHARE (Shared Lock)

```typescript
// Allow concurrent reads, prevent updates
await transaction(async (client) => {
  await client.query(
    'SELECT * FROM portfoliocompanies WHERE fund_id = $1 FOR SHARE',
    [fundId]
  );

  // Other transactions can read (FOR SHARE) but not update
});
```

**Use Case:** Read-heavy scenarios where you want to prevent updates during
computation.

---

### Rollback Handling

#### 1. Explicit Rollback

```typescript
await transaction(async (client) => {
  const conflicts: ConflictInfo[] = [];

  // Perform updates and collect conflicts
  for (const update of updates) {
    const conflict = await updateCompanyAllocation(
      client,
      fundId,
      expectedVersion,
      update
    );
    if (conflict) {
      conflicts.push(conflict);
    }
  }

  // If any conflicts, rollback entire transaction
  if (conflicts.length > 0) {
    throw {
      statusCode: 409,
      conflicts,
      message: `Version conflict: ${conflicts.length} companies have been updated by another user`,
    };
  }

  return { success: true };
});
```

**Source:** `server/routes/allocations.ts:689-735`

**Pattern:** Throw error to trigger automatic rollback.

#### 2. Savepoints (Nested Transactions)

```typescript
await transaction(async (client) => {
  // Create savepoint
  await client.query('SAVEPOINT sp1');

  try {
    // Risky operation
    await client.query(
      'UPDATE portfoliocompanies SET planned_reserves_cents = $1 WHERE id = $2',
      [value, id]
    );
  } catch (error) {
    // Rollback to savepoint (keeps outer transaction)
    await client.query('ROLLBACK TO SAVEPOINT sp1');
    console.warn('Partial operation failed, continuing...');
  }

  // Proceed with other operations
  await client.query('INSERT INTO fund_events ...');
});
```

**Use Case:** Partial rollback when some operations can fail without aborting
entire transaction.

#### 3. Timeout Protection

```typescript
// Set statement timeout for transaction
await transaction(async (client) => {
  // Transaction will fail if it takes longer than 5 seconds
  await client.query('SET LOCAL statement_timeout = 5000');

  // Perform operations
  await client.query('UPDATE portfoliocompanies ...');
});
```

**Source:** `server/db/pool.ts:36`

**Production Config:**

- `statement_timeout`: 5000ms (5 seconds)
- `lock_timeout`: 3000ms (3 seconds)
- `idle_in_transaction_session_timeout`: 10000ms (10 seconds)

---

### Nested Transactions

PostgreSQL doesn't support true nested transactions, but **savepoints** provide
similar functionality.

```typescript
await transaction(async (client) => {
  // Outer transaction
  await client.query('UPDATE funds SET status = $1 WHERE id = $2', [
    'active',
    fundId,
  ]);

  // Inner "transaction" (savepoint)
  await client.query('SAVEPOINT inner_txn');

  try {
    await client.query(
      'UPDATE portfoliocompanies SET status = $1 WHERE fund_id = $2',
      ['active', fundId]
    );
    await client.query('RELEASE SAVEPOINT inner_txn');
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT inner_txn');
    // Outer transaction continues
  }

  // This commits both outer and inner operations
});
```

---

## CQRS Pattern

**Command Query Responsibility Segregation (CQRS)** separates write operations
(commands) from read operations (queries).

### Architecture Overview

```
Write Path (Commands):                Read Path (Queries):
┌──────────────────┐                 ┌──────────────────┐
│  API Mutation    │                 │   API Query      │
└────────┬─────────┘                 └────────┬─────────┘
         │                                     │
         ▼                                     ▼
┌──────────────────┐                 ┌──────────────────┐
│  fund_events     │────────────────>│  fund_snapshots  │
│  (append-only)   │   Background    │  (read-optimized)│
└──────────────────┘   Aggregation   └──────────────────┘
```

**Source:** `shared/schema.ts:34-67`

---

### Write Path: fund_events

Events are the **source of truth** for all state changes.

#### Event Schema

```typescript
export const fundEvents = pgTable('fund_events', {
  id: serial('id').primaryKey(),
  fundId: integer('fund_id')
    .references(() => funds.id)
    .notNull(),
  eventType: varchar('event_type', { length: 50 }).notNull(),
  payload: jsonb('payload'),
  userId: integer('user_id').references(() => users.id),
  correlationId: varchar('correlation_id', { length: 36 }),
  eventTime: timestamp('event_time').notNull(),
  operation: varchar('operation', { length: 50 }),
  entityType: varchar('entity_type', { length: 50 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

**Source:** `shared/schema.ts:53-67`

#### Event Types

| Event Type           | Description                    | Payload Example                                 |
| -------------------- | ------------------------------ | ----------------------------------------------- |
| `DRAFT_SAVED`        | User saves draft config        | `{ version: 1, changes: {...} }`                |
| `PUBLISHED`          | Draft promoted to production   | `{ version: 1, publishedBy: 123 }`              |
| `CALC_TRIGGERED`     | Background calculation started | `{ calcType: "RESERVE", correlationId: "..." }` |
| `ALLOCATION_UPDATED` | Reserve allocation changed     | `{ updates: [...], new_version: 2 }`            |

#### Writing Events

```typescript
// Standard event logging pattern
await client.query(
  `INSERT INTO fund_events (
     fund_id, event_type, payload, user_id, event_time,
     operation, entity_type, metadata, correlation_id
   ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8)
   RETURNING id, event_time`,
  [
    fundId,
    'ALLOCATION_UPDATED',
    JSON.stringify({
      updates,
      new_version: newVersion,
      update_count: updates.length,
    }),
    userId,
    'UPDATE',
    'allocation',
    JSON.stringify({
      timestamp: new Date().toISOString(),
      company_count: updates.length,
    }),
    correlationId, // UUID for tracking related events
  ]
);
```

**Source:** `server/routes/allocations.ts:302-322`

**Best Practices:**

- Use `event_time` for ordering (not `created_at` which may have clock skew)
- Always include `correlation_id` for distributed tracing
- Store full payload (storage is cheap, lost context is expensive)
- Never delete events (append-only log)

---

### Read Path: fund_snapshots

Snapshots are **materialized views** of aggregated event data.

#### Snapshot Schema

```typescript
export const fundSnapshots = pgTable('fund_snapshots', {
  id: serial('id').primaryKey(),
  fundId: integer('fund_id')
    .references(() => funds.id)
    .notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'RESERVE', 'PACING', 'COHORT'
  payload: jsonb('payload').notNull(), // Calculation results
  calcVersion: varchar('calc_version', { length: 20 }).notNull(),
  correlationId: varchar('correlation_id', { length: 36 }).notNull(),
  metadata: jsonb('metadata'),
  snapshotTime: timestamp('snapshot_time').notNull(),
  eventCount: integer('event_count').default(0),
  stateHash: varchar('state_hash', { length: 64 }),
  state: jsonb('state'), // Full portfolio state
  createdAt: timestamp('created_at').defaultNow(),
});
```

**Source:** `shared/schema.ts:35-50`

#### Snapshot Types

| Type      | Description                    | Payload Example                                 |
| --------- | ------------------------------ | ----------------------------------------------- |
| `RESERVE` | Reserve allocation calculation | `{ companies: [...], totalReserves: 50000000 }` |
| `PACING`  | Investment pacing analysis     | `{ quarterlyPlan: [...], runway: 36 }`          |
| `COHORT`  | Cohort performance metrics     | `{ cohorts: [...], avgMOIC: 2.5 }`              |

#### Reading Snapshots

```typescript
// Get latest snapshot for a fund
const [snapshot] = await db
  .select()
  .from(fundSnapshots)
  .where(
    and(eq(fundSnapshots.fundId, fundId), eq(fundSnapshots.type, 'RESERVE'))
  )
  .orderBy(desc(fundSnapshots.snapshotTime))
  .limit(1);

if (!snapshot) {
  // No snapshot yet - trigger calculation
  await triggerReserveCalculation(fundId);
  throw new Error('Calculation in progress - retry in 5 seconds');
}

// Use cached snapshot
return snapshot.payload as ReserveAllocationResult;
```

**Pattern:** Always check for snapshot existence before using.

#### Creating Snapshots

```typescript
// Background worker creates snapshot after calculation
import { createHash } from 'crypto';

const stateHash = createHash('sha256')
  .update(JSON.stringify(calculationResult))
  .digest('hex');

await db.insert(fundSnapshots).values({
  fundId,
  type: 'RESERVE',
  payload: calculationResult,
  calcVersion: '1.0.0',
  correlationId,
  metadata: {
    duration_ms: 1234,
    input_hash: inputHash,
  },
  snapshotTime: new Date(),
  eventCount: eventsSinceLastSnapshot,
  stateHash,
  state: fullPortfolioState,
});
```

**Best Practices:**

- Include `calcVersion` for schema migration tracking
- Store `stateHash` for cache invalidation
- Log `eventCount` to detect if snapshot is stale

---

### CQRS Examples

#### Example 1: Allocation Update (Write Path)

```typescript
// POST /api/funds/:fundId/allocations
router.post('/funds/:fundId/allocations', async (req, res) => {
  const { expected_version, updates } = req.body;

  const result = await transaction(async (client) => {
    // 1. Verify version and lock rows
    const versionCheck = await client.query(
      'SELECT allocation_version FROM portfoliocompanies WHERE fund_id = $1 FOR UPDATE',
      [fundId]
    );

    if (versionCheck.rows[0].allocation_version !== expected_version) {
      throw new Error('Version conflict');
    }

    // 2. Apply updates
    await client.query(
      'UPDATE portfoliocompanies SET planned_reserves_cents = $1, allocation_version = allocation_version + 1 WHERE id = $2',
      [updates[0].planned_reserves_cents, updates[0].company_id]
    );

    // 3. Log event (append-only)
    await client.query(
      `INSERT INTO fund_events (fund_id, event_type, payload, event_time)
       VALUES ($1, $2, $3, NOW())`,
      [
        fundId,
        'ALLOCATION_UPDATED',
        JSON.stringify({ updates, new_version: expected_version + 1 }),
      ]
    );

    return { new_version: expected_version + 1 };
  });

  res.json(result);
});
```

**Source:** `server/routes/allocations.ts:661-739`

#### Example 2: Query Latest State (Read Path)

```typescript
// GET /api/funds/:fundId/allocations/latest
router.get('/funds/:fundId/allocations/latest', async (req, res) => {
  // Read from normalized tables (NOT events)
  const result = await transaction(async (client) => {
    const companiesResult = await client.query(
      `SELECT
         id as company_id,
         name as company_name,
         planned_reserves_cents,
         allocation_version,
         last_allocation_at
       FROM portfoliocompanies
       WHERE fund_id = $1
       ORDER BY id ASC`,
      [fundId]
    );

    return {
      fund_id: fundId,
      companies: companiesResult.rows,
      metadata: {
        total_planned_cents: companiesResult.rows.reduce(
          (sum, c) => sum + parseInt(c.planned_reserves_cents),
          0
        ),
        companies_count: companiesResult.rows.length,
      },
    };
  });

  res.json(result);
});
```

**Source:** `server/routes/allocations.ts:570-647`

#### Example 3: Time-Travel Query (Event Replay)

```typescript
// GET /api/funds/:fundId/state/at/:timestamp
router.get('/funds/:fundId/state/at/:timestamp', async (req, res) => {
  const targetTime = new Date(req.params.timestamp);

  // 1. Find nearest snapshot before target time
  const [snapshot] = await db
    .select()
    .from(fundSnapshots)
    .where(
      and(
        eq(fundSnapshots.fundId, fundId),
        lte(fundSnapshots.snapshotTime, targetTime)
      )
    )
    .orderBy(desc(fundSnapshots.snapshotTime))
    .limit(1);

  if (!snapshot) {
    throw new Error('No snapshot found before target time');
  }

  // 2. Get events between snapshot and target time
  const events = await db
    .select()
    .from(fundEvents)
    .where(
      and(
        eq(fundEvents.fundId, fundId),
        gte(fundEvents.eventTime, snapshot.snapshotTime),
        lte(fundEvents.eventTime, targetTime)
      )
    )
    .orderBy(asc(fundEvents.eventTime));

  // 3. Replay events on top of snapshot
  let state = snapshot.state as PortfolioState;
  for (const event of events) {
    state = applyEvent(state, event);
  }

  res.json({
    snapshot: { id: snapshot.id, time: snapshot.snapshotTime },
    events_applied: events.length,
    state,
  });
});
```

**Source:** `server/services/time-travel-analytics.ts:154-197`

---

## Joins & Relations

### Drizzle ORM Relations

#### 1. One-to-Many (Fund → Companies)

```typescript
// Manual join
const results = await db
  .select({
    fund: funds,
    company: portfolioCompanies,
  })
  .from(funds)
  .leftJoin(portfolioCompanies, eq(funds.id, portfolioCompanies.fundId))
  .where(eq(funds.id, fundId));

// Group by fund
const fundWithCompanies = {
  ...results[0].fund,
  companies: results.map((r) => r.company).filter(Boolean),
};
```

**Note:** Drizzle doesn't auto-group joins - you must aggregate manually.

#### 2. Many-to-One (Company → Fund)

```typescript
// Simple join to get fund info for a company
const [result] = await db
  .select({
    companyName: portfolioCompanies.name,
    fundName: funds.name,
    fundSize: funds.size,
  })
  .from(portfolioCompanies)
  .innerJoin(funds, eq(portfolioCompanies.fundId, funds.id))
  .where(eq(portfolioCompanies.id, companyId));
```

#### 3. Many-to-Many (Scenarios → Companies)

```typescript
// Through table join
const results = await db
  .select({
    scenario: scenarios,
    case: scenarioCases,
  })
  .from(scenarios)
  .innerJoin(scenarioCases, eq(scenarios.id, scenarioCases.scenarioId))
  .where(eq(scenarios.companyId, companyId));
```

**Source:** `shared/schema.ts:110-145`

---

### Raw SQL Joins

#### 1. INNER JOIN

```typescript
// Only return rows with matches in both tables
const result = await query(
  `SELECT
     pc.id,
     pc.name,
     f.name as fund_name,
     f.size as fund_size
   FROM portfoliocompanies pc
   INNER JOIN funds f ON pc.fund_id = f.id
   WHERE f.status = $1`,
  ['active']
);
```

#### 2. LEFT JOIN

```typescript
// Return all companies, even if no fund match
const result = await query(
  `SELECT
     pc.id,
     pc.name,
     f.name as fund_name
   FROM portfoliocompanies pc
   LEFT JOIN funds f ON pc.fund_id = f.id`
);
```

#### 3. Complex Join with Aggregation

```typescript
// Get fund with company counts and total reserves
const result = await query(
  `SELECT
     f.id,
     f.name,
     COUNT(pc.id) as company_count,
     SUM(pc.planned_reserves_cents) as total_planned_reserves
   FROM funds f
   LEFT JOIN portfoliocompanies pc ON f.id = pc.fund_id
   WHERE f.status = $1
   GROUP BY f.id, f.name
   ORDER BY total_planned_reserves DESC`,
  ['active']
);
```

#### 4. Multiple Joins

```typescript
// Fund → Companies → Investments
const result = await query(
  `SELECT
     f.name as fund_name,
     pc.name as company_name,
     i.amount as investment_amount,
     i.round
   FROM funds f
   INNER JOIN portfoliocompanies pc ON f.id = pc.fund_id
   INNER JOIN investments i ON pc.id = i.company_id
   WHERE f.id = $1
   ORDER BY i.investment_date DESC`,
  [fundId]
);
```

---

## Copy-Paste Examples

### Example 1: Create Fund with Initial Config

```typescript
import { db } from '../db';
import { funds, fundConfigs, fundEvents } from '@shared/schema';
import { transaction } from '../db';
import { v4 as uuidv4 } from 'uuid';

const correlationId = uuidv4();

const newFund = await transaction(async (client) => {
  // Insert fund
  const [fund] = await db
    .insert(funds)
    .values({
      name: 'Acme Ventures Fund II',
      size: '150000000',
      managementFee: '0.0200',
      carryPercentage: '0.2000',
      vintageYear: 2025,
    })
    .returning();

  // Insert initial config
  await db.insert(fundConfigs).values({
    fundId: fund.id,
    version: 1,
    config: {
      stages: [
        { name: 'Seed', graduate: 0.5, exit: 0.3, months: 18 },
        { name: 'Series A', graduate: 0.4, exit: 0.4, months: 24 },
      ],
    },
    isDraft: true,
  });

  // Log event
  await db.insert(fundEvents).values({
    fundId: fund.id,
    eventType: 'FUND_CREATED',
    payload: { name: fund.name, size: fund.size },
    eventTime: new Date(),
    correlationId,
    operation: 'CREATE',
    entityType: 'fund',
  });

  return fund;
});

console.log('Created fund:', newFund);
```

**Expected Output:**

```typescript
{
  id: 42,
  name: "Acme Ventures Fund II",
  size: "150000000.00",
  managementFee: "0.0200",
  carryPercentage: "0.2000",
  vintageYear: 2025,
  status: "active",
  createdAt: Date
}
```

---

### Example 2: Bulk Update with Optimistic Locking

```typescript
import { transaction, query } from '../db';

const proposedAllocations = [
  { company_id: 1, planned_reserves_cents: 5000000 },
  { company_id: 2, planned_reserves_cents: 3000000 },
  { company_id: 3, planned_reserves_cents: 7000000 },
];

const fundId = 1;
const expectedVersion = 5;

const result = await transaction(async (client) => {
  // 1. Lock and verify version
  const versionCheck = await client.query(
    `SELECT DISTINCT allocation_version
     FROM portfoliocompanies
     WHERE fund_id = $1
     FOR UPDATE`,
    [fundId]
  );

  const actualVersions = versionCheck.rows.map((r) => r.allocation_version);
  if (actualVersions.length !== 1 || actualVersions[0] !== expectedVersion) {
    throw new Error(
      `Version conflict: expected ${expectedVersion}, found ${actualVersions.join(', ')}`
    );
  }

  // 2. Build batch update query
  const companyIds = proposedAllocations.map((p) => p.company_id);
  const params = [fundId];

  const plannedCases = proposedAllocations
    .map((prop) => {
      params.push(prop.company_id, prop.planned_reserves_cents);
      return `WHEN $${params.length - 1} THEN $${params.length}::BIGINT`;
    })
    .join(' ');

  const companyIdPlaceholders = companyIds
    .map((id) => {
      params.push(id);
      return `$${params.length}`;
    })
    .join(',');

  // 3. Execute batch update
  const updateQuery = `
    UPDATE portfoliocompanies
    SET
      planned_reserves_cents = CASE id ${plannedCases} ELSE planned_reserves_cents END,
      allocation_version = allocation_version + 1,
      last_allocation_at = NOW()
    WHERE fund_id = $1 AND id IN (${companyIdPlaceholders})
  `;

  const updateResult = await client.query(updateQuery, params);

  // 4. Log event
  await client.query(
    `INSERT INTO fund_events (fund_id, event_type, payload, event_time, operation)
     VALUES ($1, $2, $3, NOW(), $4)`,
    [
      fundId,
      'ALLOCATION_BATCH_UPDATE',
      JSON.stringify({
        allocations: proposedAllocations,
        new_version: expectedVersion + 1,
      }),
      'UPDATE',
    ]
  );

  return {
    updated_count: updateResult.rowCount,
    new_version: expectedVersion + 1,
  };
});

console.log('Batch update result:', result);
```

**Expected Output:**

```typescript
{
  updated_count: 3,
  new_version: 6
}
```

---

### Example 3: Paginated Company List with Filters

```typescript
import { db } from '../db';
import { portfolioCompanies } from '@shared/schema';
import { eq, and, lt, desc, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

interface QueryParams {
  fundId: number;
  cursor?: number;
  limit: number;
  sector?: string;
  status?: 'active' | 'exited' | 'written-off';
  search?: string;
}

async function getCompanies(params: QueryParams) {
  const { fundId, cursor, limit, sector, status, search } = params;

  // Build WHERE conditions
  const conditions: SQL[] = [eq(portfolioCompanies.fundId, fundId)];

  if (cursor !== undefined) {
    conditions.push(lt(portfolioCompanies.id, cursor));
  }

  if (sector) {
    conditions.push(eq(portfolioCompanies.sector, sector));
  }

  if (status) {
    conditions.push(eq(portfolioCompanies.status, status));
  }

  if (search) {
    conditions.push(
      sql`LOWER(${portfolioCompanies.name}) LIKE LOWER(${`%${search}%`})`
    );
  }

  // Fetch limit + 1 to detect more results
  const fetchLimit = limit + 1;

  const results = await db
    .select({
      id: portfolioCompanies.id,
      name: portfolioCompanies.name,
      sector: portfolioCompanies.sector,
      stage: portfolioCompanies.stage,
      status: portfolioCompanies.status,
      plannedReservesCents: portfolioCompanies.plannedReservesCents,
    })
    .from(portfolioCompanies)
    .where(and(...conditions))
    .orderBy(desc(portfolioCompanies.id))
    .limit(fetchLimit);

  // Check if more results exist
  const hasMore = results.length > limit;
  const companies = hasMore ? results.slice(0, limit) : results;
  const nextCursor =
    hasMore && companies.length > 0 ? companies[companies.length - 1].id : null;

  return {
    companies,
    pagination: {
      next_cursor: nextCursor,
      has_more: hasMore,
    },
  };
}

// Usage
const result = await getCompanies({
  fundId: 1,
  limit: 50,
  sector: 'Fintech',
  search: 'tech',
});

console.log(`Found ${result.companies.length} companies`);
console.log(`Next cursor: ${result.pagination.next_cursor}`);
```

**Expected Output:**

```typescript
{
  companies: [
    { id: 42, name: "TechCorp", sector: "Fintech", stage: "Series B", status: "active", plannedReservesCents: 5000000 },
    { id: 38, name: "FinTech Solutions", sector: "Fintech", stage: "Series A", status: "active", plannedReservesCents: 3000000 },
  ],
  pagination: {
    next_cursor: 38,
    has_more: true,
  }
}
```

---

### Example 4: Snapshot-Based State Reconstruction

```typescript
import { db } from '../db';
import { fundSnapshots, fundEvents } from '@shared/schema';
import { eq, and, gte, lte, desc, asc } from 'drizzle-orm';

interface PortfolioState {
  companies: Array<{
    id: number;
    name: string;
    plannedReservesCents: number;
  }>;
  totalReserves: number;
}

async function getStateAtTime(
  fundId: number,
  targetTime: Date
): Promise<PortfolioState> {
  // 1. Find nearest snapshot before target time
  const [snapshot] = await db
    .select()
    .from(fundSnapshots)
    .where(
      and(
        eq(fundSnapshots.fundId, fundId),
        lte(fundSnapshots.snapshotTime, targetTime)
      )
    )
    .orderBy(desc(fundSnapshots.snapshotTime))
    .limit(1);

  if (!snapshot) {
    throw new Error(
      `No snapshot found for fund ${fundId} before ${targetTime.toISOString()}`
    );
  }

  // 2. Get events between snapshot and target time
  const events = await db
    .select()
    .from(fundEvents)
    .where(
      and(
        eq(fundEvents.fundId, fundId),
        gte(fundEvents.eventTime, snapshot.snapshotTime),
        lte(fundEvents.eventTime, targetTime)
      )
    )
    .orderBy(asc(fundEvents.eventTime));

  // 3. Start with snapshot state
  let state = snapshot.state as PortfolioState;

  // 4. Replay events to get state at target time
  for (const event of events) {
    if (event.eventType === 'ALLOCATION_UPDATED') {
      const payload = event.payload as {
        updates: Array<{ company_id: number; planned_reserves_cents: number }>;
      };
      for (const update of payload.updates) {
        const company = state.companies.find((c) => c.id === update.company_id);
        if (company) {
          const delta =
            update.planned_reserves_cents - company.plannedReservesCents;
          company.plannedReservesCents = update.planned_reserves_cents;
          state.totalReserves += delta;
        }
      }
    }
  }

  return state;
}

// Usage
const state = await getStateAtTime(1, new Date('2025-01-15T00:00:00Z'));
console.log('Portfolio state at 2025-01-15:', state);
console.log(
  `Total reserves: $${state.totalReserves / 100} (from ${state.companies.length} companies)`
);
```

**Expected Output:**

```typescript
{
  companies: [
    { id: 1, name: "TechCorp", plannedReservesCents: 5000000 },
    { id: 2, name: "HealthAI", plannedReservesCents: 3000000 },
  ],
  totalReserves: 8000000
}
```

---

### Example 5: Audit Trail Query

```typescript
import { db } from '../db';
import { fundEvents } from '@shared/schema';
import { eq, and, gte, desc } from 'drizzle-orm';

async function getAuditTrail(fundId: number, since: Date, limit: number = 50) {
  const events = await db
    .select({
      id: fundEvents.id,
      eventType: fundEvents.eventType,
      eventTime: fundEvents.eventTime,
      operation: fundEvents.operation,
      entityType: fundEvents.entityType,
      userId: fundEvents.userId,
      payload: fundEvents.payload,
      metadata: fundEvents.metadata,
    })
    .from(fundEvents)
    .where(and(eq(fundEvents.fundId, fundId), gte(fundEvents.eventTime, since)))
    .orderBy(desc(fundEvents.eventTime))
    .limit(limit);

  return events.map((event) => ({
    id: event.id,
    type: event.eventType,
    time: event.eventTime,
    operation: event.operation,
    entity: event.entityType,
    user_id: event.userId,
    details: event.payload,
    metadata: event.metadata,
  }));
}

// Usage
const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
const trail = await getAuditTrail(1, since, 100);

console.log(`Found ${trail.length} events in last 7 days`);
for (const event of trail.slice(0, 5)) {
  console.log(
    `[${event.time.toISOString()}] ${event.type} - ${event.operation} ${event.entity}`
  );
}
```

**Expected Output:**

```
Found 23 events in last 7 days
[2025-01-14T15:30:00Z] ALLOCATION_UPDATED - UPDATE allocation
[2025-01-13T10:15:00Z] PUBLISHED - UPDATE fund_config
[2025-01-12T09:00:00Z] DRAFT_SAVED - CREATE fund_config
[2025-01-11T14:20:00Z] CALC_TRIGGERED - CREATE calculation
[2025-01-10T11:45:00Z] ALLOCATION_UPDATED - UPDATE allocation
```

---

## Anti-Patterns

### 1. N+1 Query Problem

**Bad:**

```typescript
// Fetches funds, then queries each fund's companies separately (N+1 queries)
const funds = await db.select().from(funds);

for (const fund of funds) {
  const companies = await db
    .select()
    .from(portfolioCompanies)
    .where(eq(portfolioCompanies.fundId, fund.id));

  console.log(`${fund.name} has ${companies.length} companies`);
}
// Total queries: 1 + N (where N = number of funds)
```

**Good:**

```typescript
// Single query with join
const results = await db
  .select({
    fundId: funds.id,
    fundName: funds.name,
    companyCount: sql<number>`COUNT(${portfolioCompanies.id})`,
  })
  .from(funds)
  .leftJoin(portfolioCompanies, eq(funds.id, portfolioCompanies.fundId))
  .groupBy(funds.id, funds.name);

for (const row of results) {
  console.log(`${row.fundName} has ${row.companyCount} companies`);
}
// Total queries: 1
```

**Fix:** Use JOINs or batch queries with `IN` clause.

---

### 2. Missing Indexes

**Bad:**

```typescript
// Query on unindexed column causes full table scan
const result = await query(
  'SELECT * FROM portfoliocompanies WHERE sector = $1',
  ['Fintech']
);
// EXPLAIN shows: Seq Scan on portfoliocompanies (cost=0.00..1000.00)
```

**Good:**

```sql
-- Add index in migration
CREATE INDEX idx_portfoliocompanies_sector ON portfoliocompanies(sector);
```

```typescript
// Same query now uses index
const result = await query(
  'SELECT * FROM portfoliocompanies WHERE sector = $1',
  ['Fintech']
);
// EXPLAIN shows: Index Scan using idx_portfoliocompanies_sector (cost=0.00..10.00)
```

**Detection:** Run `EXPLAIN ANALYZE` on slow queries:

```typescript
const result = await query(
  'EXPLAIN ANALYZE SELECT * FROM portfoliocompanies WHERE sector = $1',
  ['Fintech']
);
console.log(result.rows);
```

**Common Missing Indexes:**

- Foreign keys (`fund_id`, `company_id`)
- Filter columns (`status`, `sector`, `stage`)
- Sort columns (`created_at`, `event_time`)
- Composite indexes for multi-column filters

---

### 3. Transaction Deadlocks

**Bad:**

```typescript
// Transaction A
await transaction(async (client) => {
  await client.query('UPDATE funds SET status = $1 WHERE id = $2 FOR UPDATE', [
    'active',
    1,
  ]);
  await client.query(
    'UPDATE portfoliocompanies SET status = $1 WHERE fund_id = $2 FOR UPDATE',
    ['active', 1]
  );
});

// Transaction B (running concurrently)
await transaction(async (client) => {
  // Locks in OPPOSITE order - causes deadlock!
  await client.query(
    'UPDATE portfoliocompanies SET status = $1 WHERE fund_id = $2 FOR UPDATE',
    ['active', 1]
  );
  await client.query('UPDATE funds SET status = $1 WHERE id = $2 FOR UPDATE', [
    'active',
    1,
  ]);
});
```

**Good:**

```typescript
// Always lock tables in CONSISTENT ORDER
async function updateFundAndCompanies(fundId: number, status: string) {
  return transaction(async (client) => {
    // Always lock funds first, then companies
    await client.query(
      'UPDATE funds SET status = $1 WHERE id = $2 FOR UPDATE',
      [status, fundId]
    );
    await client.query(
      'UPDATE portfoliocompanies SET status = $1 WHERE fund_id = $2 FOR UPDATE',
      [status, fundId]
    );
  });
}
```

**Detection:** PostgreSQL logs deadlocks:

```
ERROR: deadlock detected
DETAIL: Process 12345 waits for ShareLock on transaction 67890; blocked by process 54321.
```

**Fix:**

1. Lock resources in consistent order (alphabetical by table name)
2. Use `FOR UPDATE NOWAIT` to fail fast
3. Implement retry logic with exponential backoff

---

### 4. Long-Running Transactions

**Bad:**

```typescript
await transaction(async (client) => {
  // Fetch data
  const companies = await client.query(
    'SELECT * FROM portfoliocompanies WHERE fund_id = $1 FOR UPDATE',
    [fundId]
  );

  // Expensive computation INSIDE transaction (blocks other transactions)
  await new Promise((resolve) => setTimeout(resolve, 30000)); // 30 seconds!

  // Update
  for (const company of companies.rows) {
    await client.query(
      'UPDATE portfoliocompanies SET planned_reserves_cents = $1 WHERE id = $2',
      [compute(company), company.id]
    );
  }
});
```

**Good:**

```typescript
// Fetch data (no transaction, no locks)
const companies = await query(
  'SELECT * FROM portfoliocompanies WHERE fund_id = $1',
  [fundId]
);

// Expensive computation OUTSIDE transaction
const updates = companies.rows.map((company) => ({
  id: company.id,
  newValue: compute(company), // 30 seconds of CPU time
}));

// Short transaction for writes only
await transaction(async (client) => {
  // Lock and update (milliseconds)
  for (const update of updates) {
    await client.query(
      'UPDATE portfoliocompanies SET planned_reserves_cents = $1 WHERE id = $2',
      [update.newValue, update.id]
    );
  }
});
```

**Rule:** Keep transactions under 5 seconds (enforced by `statement_timeout`).

---

### 5. Missing Error Handling

**Bad:**

```typescript
// Unhandled database errors crash the server
const [fund] = await db.select().from(funds).where(eq(funds.id, fundId));
console.log(fund.name); // TypeError: Cannot read property 'name' of undefined
```

**Good:**

```typescript
try {
  const [fund] = await db.select().from(funds).where(eq(funds.id, fundId));

  if (!fund) {
    return res.status(404).json({ error: 'Fund not found' });
  }

  console.log(fund.name);
} catch (error) {
  console.error('Database error:', error);

  // Check for specific error codes
  if (error.code === '23505') {
    // Unique violation
    return res.status(409).json({ error: 'Duplicate record' });
  }

  if (error.code === '23503') {
    // Foreign key violation
    return res.status(400).json({ error: 'Invalid reference' });
  }

  return res.status(500).json({ error: 'Internal server error' });
}
```

**PostgreSQL Error Codes:**

- `23505`: Unique violation
- `23503`: Foreign key violation
- `23502`: Not null violation
- `40P01`: Deadlock detected
- `57014`: Query canceled (timeout)

---

### 6. Implicit Type Coercion

**Bad:**

```typescript
// Implicitly converts number to string - may cause index to be ignored
const result = await query(
  'SELECT * FROM portfoliocompanies WHERE id = $1',
  ['42'] // String, but id is integer
);
```

**Good:**

```typescript
// Explicit type coercion
const result = await query(
  'SELECT * FROM portfoliocompanies WHERE id = $1::integer',
  ['42']
);

// Or parse in JavaScript
const companyId = parseInt(req.params.companyId, 10);
if (isNaN(companyId)) {
  return res.status(400).json({ error: 'Invalid company ID' });
}

const result = await query('SELECT * FROM portfoliocompanies WHERE id = $1', [
  companyId,
]);
```

---

### 7. Selecting Unnecessary Columns

**Bad:**

```typescript
// Fetches all columns (including large JSONB fields)
const companies = await db
  .select()
  .from(portfolioCompanies)
  .where(eq(portfolioCompanies.fundId, fundId));

// Only uses id and name
return companies.map((c) => ({ id: c.id, name: c.name }));
```

**Good:**

```typescript
// Only fetch needed columns
const companies = await db
  .select({
    id: portfolioCompanies.id,
    name: portfolioCompanies.name,
  })
  .from(portfolioCompanies)
  .where(eq(portfolioCompanies.fundId, fundId));

return companies;
```

**Performance:** Reduces network transfer by 50-90% depending on schema.

---

### 8. Unbounded Result Sets

**Bad:**

```typescript
// Fetches ALL companies (could be 10,000+ rows)
const companies = await db
  .select()
  .from(portfolioCompanies)
  .where(eq(portfolioCompanies.fundId, fundId));

// OOM risk if too many rows
```

**Good:**

```typescript
// Always use LIMIT
const companies = await db
  .select()
  .from(portfolioCompanies)
  .where(eq(portfolioCompanies.fundId, fundId))
  .limit(1000); // Reasonable upper bound

if (companies.length === 1000) {
  console.warn('Result set truncated - use pagination');
}
```

**Rule:** Always specify `LIMIT` or implement pagination.

---

## Troubleshooting

### Slow Queries

**Symptom:** API endpoints taking >1 second to respond.

**Diagnosis:**

```typescript
// Enable query logging
import { query } from '../db/pg-circuit';

// Query metrics are automatically tracked
const metrics = getQueryMetrics();
console.log('Average query duration:', metrics.avgDuration, 'ms');
console.log('Slow queries (>1s):', metrics.slowQueries);
```

**Source:** `server/db/pg-circuit.ts:68-104`

**Fix:**

1. Run `EXPLAIN ANALYZE` on slow query
2. Add missing indexes
3. Rewrite query with better JOIN strategy
4. Add pagination to limit result set

---

### Connection Pool Exhaustion

**Symptom:** Error: "Connection pool timeout exceeded"

**Diagnosis:**

```typescript
import { getPoolStats } from '../db/pool';

const stats = getPoolStats();
console.log('Pool stats:', stats);
// { total: 20, idle: 0, waiting: 15 }
```

**Source:** `server/db/pool.ts:53-60`

**Fix:**

1. Check for leaked connections (not released)
2. Increase pool size: `DB_POOL_MAX=30`
3. Reduce connection hold time (shorter transactions)
4. Add connection timeout: `connectionTimeoutMillis: 2000`

---

### Transaction Conflicts

**Symptom:** Error: "could not serialize access due to concurrent update"

**Diagnosis:**

```typescript
// Check for version conflicts
const versionCheck = await client.query(
  'SELECT allocation_version FROM portfoliocompanies WHERE fund_id = $1',
  [fundId]
);

console.log(
  'Current versions:',
  versionCheck.rows.map((r) => r.allocation_version)
);
```

**Fix:**

1. Implement optimistic locking (version checks)
2. Use `FOR UPDATE NOWAIT` for fast failure
3. Add retry logic with exponential backoff
4. Reduce transaction scope

**Example Retry Logic:**

```typescript
async function updateWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.code === '40P01' && attempt < maxRetries) {
        // Deadlock - retry after delay
        const delay = Math.pow(2, attempt) * 100; // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

---

### Memory Leaks

**Symptom:** Node.js process memory grows over time, eventually crashes.

**Diagnosis:**

```bash
# Monitor heap usage
node --expose-gc --max-old-space-size=4096 server.js

# Take heap snapshot
node --inspect server.js
# Then open chrome://inspect and take snapshot
```

**Common Causes:**

1. Unreleased database connections
2. Large result sets held in memory
3. Event listeners not removed

**Fix:**

```typescript
// Always release connections
const client = await pool.connect();
try {
  await client.query('SELECT * FROM funds');
} finally {
  client.release(); // CRITICAL
}

// Stream large result sets
const { Readable } = require('stream');
const stream = client.query(
  new QueryStream('SELECT * FROM portfoliocompanies WHERE fund_id = $1', [
    fundId,
  ])
);
stream.on('data', (row) => {
  // Process row immediately, don't accumulate
  console.log(row);
});
```

---

### Timestamp Timezone Issues

**Symptom:** Times displayed incorrectly in UI (off by hours).

**Diagnosis:**

```sql
-- Check database timezone
SHOW timezone; -- Should be 'UTC'

-- Check column type
\d portfoliocompanies
-- event_time | timestamp with time zone (GOOD)
-- created_at | timestamp without time zone (BAD)
```

**Fix:**

1. Always use `timestamp with time zone` in schema
2. Store in UTC, convert in application layer
3. Use ISO 8601 format for API responses

```typescript
// Good: Always use toISOString() for JSON responses
const event = {
  id: 1,
  time: eventTime.toISOString(), // "2025-01-14T15:30:00.000Z"
};

// Bad: Timezone information lost
const event = {
  id: 1,
  time: eventTime.toString(), // "Mon Jan 14 2025 15:30:00 GMT-0800"
};
```

---

### Index Not Being Used

**Symptom:** Query is slow despite having an index.

**Diagnosis:**

```sql
-- Check if index exists
\d portfoliocompanies
-- Indexes:
--   "idx_portfoliocompanies_fund_id" btree (fund_id)

-- Explain query
EXPLAIN ANALYZE SELECT * FROM portfoliocompanies WHERE fund_id = 1;
-- Seq Scan on portfoliocompanies (cost=0.00..1000.00) -- BAD
-- Index Scan using idx_portfoliocompanies_fund_id (cost=0.00..10.00) -- GOOD
```

**Common Causes:**

1. Function call on indexed column: `WHERE LOWER(name) = 'test'`
2. Type mismatch: `WHERE id = '1'` (string vs integer)
3. Leading wildcard: `WHERE name LIKE '%corp'`
4. OR conditions: `WHERE fund_id = 1 OR company_id = 2`

**Fix:**

```sql
-- Create functional index for case-insensitive search
CREATE INDEX idx_portfoliocompanies_name_lower ON portfoliocompanies(LOWER(name));

-- Query now uses index
SELECT * FROM portfoliocompanies WHERE LOWER(name) = 'techcorp';
```

---

### JSON Query Performance

**Symptom:** Queries on JSONB columns are slow.

**Diagnosis:**

```sql
EXPLAIN ANALYZE SELECT * FROM fund_events WHERE payload->>'company_id' = '42';
-- Seq Scan (cost=0.00..5000.00) -- BAD
```

**Fix:**

```sql
-- Create GIN index on JSONB column
CREATE INDEX idx_fund_events_payload_gin ON fund_events USING GIN (payload);

-- Or index specific key path
CREATE INDEX idx_fund_events_company_id ON fund_events ((payload->>'company_id'));

-- Query now uses index
EXPLAIN ANALYZE SELECT * FROM fund_events WHERE payload->>'company_id' = '42';
-- Index Scan using idx_fund_events_company_id (cost=0.00..50.00) -- GOOD
```

---

## Summary

**Key Takeaways:**

1. **Query Patterns:** Use Drizzle ORM for simple CRUD, raw SQL for complex
   operations
2. **Transactions:** Always use transactions for multi-step operations, keep
   them short (<5s)
3. **CQRS:** Write to `fund_events` (append-only), read from `fund_snapshots`
   (materialized views)
4. **Joins:** Avoid N+1 queries by using JOINs or batch queries with `IN` clause
5. **Anti-Patterns:** Watch for missing indexes, long transactions, unbounded
   result sets
6. **Troubleshooting:** Use `EXPLAIN ANALYZE`, monitor query metrics, implement
   retry logic

**Further Reading:**

- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [PostgreSQL Performance Tips](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [CQRS Pattern](https://martinfowler.com/bliki/CQRS.html)

---

<div style="background: #f0f0f0; padding: 1rem; border-radius: 4px; font-size: 0.875rem; margin-top: 2rem;">
  <strong>Definition of Done:</strong><br>
  ✅ Query patterns documented (SELECT, INSERT, UPDATE, DELETE)<br>
  ✅ Transaction patterns with isolation levels<br>
  ✅ CQRS implementation (fund_events → fund_snapshots)<br>
  ✅ Join patterns and examples<br>
  ✅ 10+ copy-paste ready examples<br>
  ✅ Anti-patterns with fixes<br>
  ✅ Troubleshooting guide<br>
  ✅ File references (server/storage.ts, server/routes/*.ts, server/db/*.ts)<br>
  ✅ Expected outputs for all examples<br>
  ✅ Performance notes and best practices
</div>
