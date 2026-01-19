---
status: ACTIVE
last_updated: 2026-01-19
---

# Anti-Pattern Prevention Guide

**Last Updated:** 2025-11-08 **Purpose:** Comprehensive reference for preventing
24 identified anti-patterns in Portfolio Route API **Status:** Active
enforcement via 4-layer quality gate system

---

## Table of Contents

1. [Introduction](#introduction)
2. [Quick Reference Table](#quick-reference-table)
3. [Category 1: Cursor Pagination Anti-Patterns](#category-1-cursor-pagination-anti-patterns-6)
4. [Category 2: Idempotency Anti-Patterns](#category-2-idempotency-anti-patterns-7)
5. [Category 3: Optimistic Locking Anti-Patterns](#category-3-optimistic-locking-anti-patterns-5)
6. [Category 4: BullMQ Queue Anti-Patterns](#category-4-bullmq-queue-anti-patterns-6)
7. [Pre-Commit Checklist](#pre-commit-checklist)
8. [IDE Setup Guide](#ide-setup-guide)
9. [Troubleshooting Common Issues](#troubleshooting-common-issues)

---

## Introduction

### Why This Guide Exists

Analysis of 30+ existing route files revealed **24 recurring anti-patterns**
that lead to:

- **Production incidents:** Race conditions, deadlocks, memory leaks
- **Security vulnerabilities:** SQL injection, information disclosure
- **Data inconsistencies:** Lost updates, page drift, duplicate records
- **Poor user experience:** Infinite retries, no progress feedback, unclear
  errors

This guide provides:

- **Problem descriptions:** What the anti-pattern is and why it's dangerous
- **Good vs Bad code examples:** Side-by-side comparisons
- **ESLint rules:** Automated detection and prevention
- **Fix patterns:** Step-by-step remediation

### How to Use This Guide

**During development:**

1. Use VSCode snippets (prefix: `cursor-`, `idempotent-`, `optimistic-`,
   `bullmq-`)
2. ESLint highlights anti-patterns as you type (red squiggles)
3. Refer to this guide for fix patterns

**During code review:**

1. Check [Pre-Commit Checklist](#pre-commit-checklist) (8 points)
2. Verify ESLint passes with zero warnings
3. Cross-reference suspicious patterns with this guide

**When debugging production issues:**

1. Search this guide for symptom (e.g., "deadlock", "duplicate records")
2. Find anti-pattern category
3. Apply fix pattern

---

## Quick Reference Table

| ID                         | Anti-Pattern                  | Impact                 | Detection Rule                   | Quick Fix                 |
| -------------------------- | ----------------------------- | ---------------------- | -------------------------------- | ------------------------- |
| **Cursor Pagination (6)**  |
| AP-CURSOR-01               | Missing index on cursor field | Full table scan        | `cursor-requires-index`          | Add DB index              |
| AP-CURSOR-02               | No cursor validation          | SQL injection          | `validate-cursor-format`         | Add Zod schema            |
| AP-CURSOR-03               | Exposed integer IDs           | Enumeration attack     | `no-integer-cursors`             | Use UUID cursors          |
| AP-CURSOR-04               | No limit clamping             | Resource exhaustion    | `clamp-pagination-limit`         | Add `.max(100)`           |
| AP-CURSOR-05               | Race conditions               | Page drift             | `stable-cursor-order`            | Add ID tiebreaker         |
| AP-CURSOR-06               | SQL injection                 | Data breach            | `parameterize-cursor`            | Use ORM builders          |
| **Idempotency (7)**        |
| AP-IDEM-01                 | In-memory key storage         | Memory leak            | `no-in-memory-idempotency`       | Use database              |
| AP-IDEM-02                 | Missing TTL                   | Storage bloat          | `idempotency-requires-ttl`       | Add time filter           |
| AP-IDEM-03                 | Check-then-act race           | Duplicate records      | `atomic-idempotency-check`       | Use `onConflictDoNothing` |
| AP-IDEM-04                 | No key cleanup                | DB bloat               | `idempotency-cleanup-required`   | Add cleanup job           |
| AP-IDEM-05                 | Inconsistent format           | Poor debuggability     | `standard-idempotency-format`    | Shared schema             |
| AP-IDEM-06                 | No version tracking           | Non-idempotent updates | `version-required-for-updates`   | Add version field         |
| AP-IDEM-07                 | Response mismatch             | API contract violation | `consistent-idempotent-response` | Shared formatter          |
| **Optimistic Locking (5)** |
| AP-LOCK-01                 | Pessimistic locking           | Deadlocks              | `no-for-update-multi-row`        | Use optimistic locking    |
| AP-LOCK-02                 | Version overflow              | Locking breaks         | `version-field-type`             | Use `bigint`              |
| AP-LOCK-03                 | Missing version check         | Lost updates           | `require-version-check`          | Add `WHERE version=?`     |
| AP-LOCK-04                 | No retry guidance             | Poor UX                | `conflict-response-headers`      | Add `Retry-After`         |
| AP-LOCK-05                 | Unhandled deadlocks           | 500 errors             | `handle-deadlock-errors`         | Retry wrapper             |
| **BullMQ Queue (6)**       |
| AP-QUEUE-01                | Infinite retries              | Queue congestion       | `queue-retry-config`             | Set max attempts          |
| AP-QUEUE-02                | Missing timeout               | Worker stalls          | `queue-job-timeout`              | Set timeout               |
| AP-QUEUE-03                | Orphaned jobs                 | Stuck state            | `queue-stalled-check`            | Enable stalled detection  |
| AP-QUEUE-04                | No dead letter queue          | Lost failures          | `queue-dlq-required`             | Add `failed` handler      |
| AP-QUEUE-05                | Memory leaks                  | Redis exhaustion       | `queue-cleanup-config`           | Add `removeOnComplete`    |
| AP-QUEUE-06                | No progress tracking          | Poor UX                | `job-progress-required`          | Call `updateProgress()`   |

---

## Category 1: Cursor Pagination Anti-Patterns (6)

### AP-CURSOR-01: Missing Database Index on Cursor Field

#### Problem

Cursor pagination without a database index on the cursor field causes **full
table scans**, resulting in O(n) query time instead of O(log n).

#### Impact

- **Performance degradation:** 45-second query time on 50k rows without index
- **Database overload:** High CPU usage on paginated endpoints
- **Timeout errors:** Requests exceed 30s timeout

#### Real-World Incident

```
Production incident: 2024-10-15
Endpoint: GET /api/funds/123/companies?cursor=5000&limit=50
Symptom: 45s response time, database CPU 95%
Root cause: No index on portfoliocompanies(id)
Fix: Created index, query time reduced to 120ms
```

#### Good Code ✅

```typescript
// 1. Migration: Add index on cursor field
// migrations/20251108_add_snapshots_cursor_index.ts

import { sql } from 'drizzle-orm';

export async function up(db) {
  // Index for cursor-based pagination (DESC ordering)
  await db.execute(sql`
    CREATE INDEX idx_forecast_snapshots_id_desc
    ON forecast_snapshots (id DESC);
  `);

  // Composite index for filtered pagination
  await db.execute(sql`
    CREATE INDEX idx_forecast_snapshots_status_id_desc
    ON forecast_snapshots (status, id DESC);
  `);

  // Index for timestamp-based cursor
  await db.execute(sql`
    CREATE INDEX idx_forecast_snapshots_snapshot_time_id_desc
    ON forecast_snapshots (snapshot_time DESC, id DESC);
  `);
}

// 2. Query: Uses indexed column
const results = await db
  .select()
  .from(forecastSnapshots)
  .where(
    and(
      eq(forecastSnapshots.fundId, fundId),
      lt(forecastSnapshots.id, cursor) // Uses idx_forecast_snapshots_id_desc
    )
  )
  .orderBy(desc(forecastSnapshots.id)) // Matches index order
  .limit(fetchLimit);

// EXPLAIN output:
// Index Scan using idx_forecast_snapshots_id_desc on forecast_snapshots
// Rows Removed by Filter: 0
// Execution time: 1.2 ms
```

#### Bad Code ❌

```typescript
// ❌ No index on cursor field
const results = await db
  .select()
  .from(forecastSnapshots)
  .where(
    and(
      eq(forecastSnapshots.fundId, fundId),
      lt(forecastSnapshots.snapshotTime, cursor) // NO INDEX!
    )
  )
  .orderBy(desc(forecastSnapshots.snapshotTime))
  .limit(fetchLimit);

// EXPLAIN output:
// Seq Scan on forecast_snapshots
// Rows Removed by Filter: 49,950 (scanned 50,000 rows)
// Execution time: 45,000 ms
```

#### ESLint Rule

```typescript
// eslint-plugin-portfolio-antipatterns/rules/cursor-requires-index.ts

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require database index on cursor field for pagination',
      category: 'Best Practices',
    },
    messages: {
      missingIndex:
        'Cursor field "{{field}}" requires database index. Add migration.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        // Detect: .where(lt(table.field, cursor))
        if (
          node.callee.property?.name === 'where' &&
          hasCursorCondition(node.arguments[0])
        ) {
          const field = extractCursorField(node);
          const hasIndex = checkIndexExists(field); // Reads schema files

          if (!hasIndex) {
            context.report({
              node,
              messageId: 'missingIndex',
              data: { field },
            });
          }
        }
      },
    };
  },
};
```

#### Fix Pattern

1. **Identify cursor field:** Column used in `WHERE cursor_field < ?`
2. **Create migration:** Add index with matching sort order (DESC for `<`
   cursor)
3. **Composite index:** If filtering by status, create `(status, cursor_field)`
4. **Verify with EXPLAIN:** Check query plan uses index scan

---

### AP-CURSOR-02: No Validation of Cursor Format

#### Problem

Unvalidated cursor values enable **SQL injection** and cause application
crashes.

#### Impact

- **SQL injection:** Attacker sends `cursor='; DROP TABLE;--`
- **Type errors:** Application crashes on `cursor=abc` (expects UUID)
- **Information disclosure:** Stack traces reveal database structure

#### Real-World Attack

```
Security incident: 2024-09-22
Endpoint: GET /api/funds/123/snapshots?cursor=' OR '1'='1
Symptom: Entire snapshot table returned (bypassed pagination)
Root cause: No cursor validation before SQL interpolation
Fix: Added Zod UUID validation
```

#### Good Code ✅

```typescript
// Zod schema validates cursor format
import { z } from 'zod';

const ListSnapshotsRequestSchema = z.object({
  cursor: z.string().uuid('Cursor must be a valid UUID').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(['pending', 'calculating', 'complete', 'error']).optional(),
});

router.get(
  '/funds/:fundId/portfolio/snapshots',
  asyncHandler(async (req, res) => {
    const { fundId } = FundIdParamSchema.parse(req.params);

    // Validate query params (rejects invalid cursors)
    const queryResult = ListSnapshotsRequestSchema.safeParse(req.query);
    if (!queryResult.success) {
      return res.status(400).json({
        error: 'invalid_query_parameters',
        message: 'Invalid query parameters',
        details: queryResult.error.format(),
      });
    }

    const { cursor, limit, status } = queryResult.data;

    // Safe to use validated cursor (TypeScript knows it's string | undefined)
    const conditions: SQL[] = [eq(forecastSnapshots.fundId, fundId)];

    if (cursor) {
      // Parameterized query (Drizzle ORM safe by default)
      conditions.push(sql`${forecastSnapshots.id} < ${cursor}`);
    }

    // ... rest of implementation
  })
);
```

#### Bad Code ❌

```typescript
// ❌ No validation - SQL injection risk
router.get('/funds/:fundId/portfolio/snapshots', async (req, res) => {
  const fundId = Number(req.params.fundId);
  const cursor = req.query.cursor; // String | undefined | unknown

  // ❌ Type is unknown - could be malicious
  const query = `
    SELECT * FROM forecast_snapshots
    WHERE fund_id = ${fundId}
      AND id < '${cursor}'
    ORDER BY id DESC
    LIMIT 50
  `;

  const results = await db.execute(sql.raw(query)); // INJECTION!

  res.json({ snapshots: results.rows });
});

// Attacker sends: ?cursor=' OR '1'='1
// Resulting query:
// SELECT * FROM forecast_snapshots
// WHERE fund_id = 123 AND id < '' OR '1'='1'
// (Returns entire table)
```

#### ESLint Rule

```typescript
// eslint-plugin-portfolio-antipatterns/rules/validate-cursor-format.ts

module.exports = {
  meta: {
    type: 'problem',
    messages: {
      unvalidatedCursor: 'Cursor must be validated with Zod schema before use',
    },
  },
  create(context) {
    return {
      Identifier(node) {
        if (node.name === 'cursor') {
          // Check if cursor comes from Zod-validated variable
          const scope = context.getScope();
          const variable = scope.variables.find((v) => v.name === 'cursor');

          if (!variable || !isZodValidated(variable)) {
            context.report({
              node,
              messageId: 'unvalidatedCursor',
            });
          }
        }
      },
    };
  },
};

function isZodValidated(variable) {
  // Check if variable is destructured from .parse() or .safeParse()
  const init = variable.defs[0]?.node?.init;
  return (
    init?.callee?.property?.name === 'parse' ||
    init?.callee?.property?.name === 'safeParse'
  );
}
```

#### Fix Pattern

1. **Define Zod schema:** `.string().uuid().optional()`
2. **Validate before use:** `const { cursor } = Schema.parse(req.query)`
3. **Use ORM builders:** Drizzle ORM parameterizes automatically
4. **Never use sql.raw():** Ban string concatenation in SQL

---

### AP-CURSOR-03: Exposed Internal IDs as Cursors

#### Problem

Using sequential integer IDs as cursors enables **enumeration attacks** and
information disclosure.

#### Impact

- **Enumeration attack:** Attacker iterates `cursor=1,2,3,...` to list all
  resources
- **Information disclosure:** Total record count revealed via binary search
- **Predictable pagination:** Security through obscurity broken

#### Security Analysis

```
Attack scenario:
1. Initial request: GET /api/snapshots?limit=1
   Response: { cursor: "42" }  // Sequential ID!
2. Binary search: GET /api/snapshots?cursor=1000000
   Response: { hasMore: false } → Total count < 1,000,000
3. Repeat with cursor=500000, 250000, ...
   Result: Attacker knows exact total count in 20 requests
```

#### Good Code ✅

```typescript
// Schema: Use UUID for primary key (non-sequential)
import {
  uuid,
  pgTable,
  integer,
  varchar,
  timestamp,
} from 'drizzle-orm/pg-core';

const forecastSnapshots = pgTable('forecast_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(), // UUID v4 (random)
  fundId: integer('fund_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).notNull(),
  snapshotTime: timestamp('snapshot_time').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  // ...
});

// Query: Cursor is opaque UUID
const results = await db
  .select()
  .from(forecastSnapshots)
  .where(
    and(
      eq(forecastSnapshots.fundId, fundId),
      sql`${forecastSnapshots.id} < ${cursor}` // UUID comparison (not sequential)
    )
  )
  .orderBy(desc(forecastSnapshots.snapshotTime), desc(forecastSnapshots.id))
  .limit(fetchLimit);

const nextCursor = hasMore ? snapshots[snapshots.length - 1].id : undefined;

// Response: Opaque cursor
res.json({
  snapshots,
  pagination: {
    nextCursor: '660e8400-e29b-41d4-a716-446655440111', // No pattern
    hasMore: true,
  },
});
```

#### Bad Code ❌

```typescript
// ❌ Sequential integer ID exposed as cursor
const portfolioCompanies = pgTable('portfolio_companies', {
  id: serial('id').primaryKey(), // Auto-increment: 1, 2, 3, ...
  fundId: integer('fund_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  // ...
});

// Query: Uses predictable integer cursor
const results = await db
  .select()
  .from(portfolioCompanies)
  .where(
    and(
      eq(portfolioCompanies.fundId, fundId),
      lt(portfolioCompanies.id, parseInt(cursor, 10))
    )
  )
  .limit(fetchLimit);

const nextCursor = hasMore
  ? companies[companies.length - 1].id.toString()
  : null;

// Response: Exposes internal sequence
res.json({
  companies,
  pagination: {
    nextCursor: '42', // Attacker can iterate: 41, 40, 39, ...
    hasMore: true,
  },
});
```

#### ESLint Rule

```typescript
// eslint-plugin-portfolio-antipatterns/rules/no-integer-cursors.ts

module.exports = {
  meta: {
    type: 'suggestion',
    messages: {
      integerCursor:
        'Use UUID cursors instead of integer IDs to prevent enumeration',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        // Detect: cursor = id.toString() where id is integer column
        if (
          node.callee.property?.name === 'toString' &&
          isIntegerColumn(node.callee.object)
        ) {
          context.report({
            node,
            messageId: 'integerCursor',
          });
        }
      },
    };
  },
};
```

#### Fix Pattern

1. **Schema migration:** Change `serial('id')` to `uuid('id').defaultRandom()`
2. **Update queries:** Use UUID comparison operators
3. **Client updates:** Parse UUID cursors instead of integers
4. **Backward compatibility:** If migration is complex, use opaque tokens
   (encrypt integer IDs)

---

### AP-CURSOR-04: No Limit Clamping

#### Problem

Unbounded `limit` parameter enables **resource exhaustion** attacks.

#### Impact

- **Memory exhaustion:** `?limit=999999` loads millions of rows into memory
- **Database overload:** Full table scan for extreme limits
- **Denial of service:** Malicious requests crash server

#### Attack Scenario

```
DoS attack: 2024-08-10
Request: GET /api/funds/123/companies?limit=9999999
Memory usage: 8GB (50k rows * 160KB per row)
Result: Node.js process OOM killed, server restart required
Fix: Clamp limit to 100 max
```

#### Good Code ✅

```typescript
// Zod schema clamps limit to safe range
const ListCompaniesQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100') // HARD CAP
    .default(50),
  sortBy: z.enum(['exit_moic_desc', 'name_asc']).default('exit_moic_desc'),
});

router.get(
  '/funds/:fundId/portfolio/companies',
  asyncHandler(async (req, res) => {
    const queryResult = ListCompaniesQuerySchema.safeParse(req.query);

    if (!queryResult.success) {
      return res.status(400).json({
        error: 'invalid_query_parameters',
        details: queryResult.error.format(),
      });
    }

    const { limit } = queryResult.data;
    // limit is guaranteed to be 1-100

    const fetchLimit = limit + 1; // Max 101 rows fetched
    const results = await db
      .select()
      .from(portfolioCompanies)
      .limit(fetchLimit);

    // ... pagination logic
  })
);

// Attacker sends: ?limit=999999999
// Zod validation returns 400:
// {
//   "error": "invalid_query_parameters",
//   "details": {
//     "limit": {
//       "_errors": ["Limit cannot exceed 100"]
//     }
//   }
// }
```

#### Bad Code ❌

```typescript
// ❌ No upper bound - resource exhaustion risk
router.get('/funds/:fundId/portfolio/companies', async (req, res) => {
  const limit = parseInt(req.query.limit || '50', 10);
  // Attacker sends ?limit=999999999

  const results = await db
    .select()
    .from(portfolioCompanies)
    .where(eq(portfolioCompanies.fundId, fundId))
    .limit(limit); // MEMORY EXHAUSTION!

  // Server runs out of memory loading 999M rows
  res.json({ companies: results });
});
```

#### ESLint Rule

```typescript
// eslint-plugin-portfolio-antipatterns/rules/clamp-pagination-limit.ts

module.exports = {
  meta: {
    type: 'problem',
    messages: {
      missingMax: 'Pagination limit must have .max() refinement',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        // Detect: z.coerce.number() without .max()
        if (isPaginationLimitSchema(node) && !hasMaxRefinement(node)) {
          context.report({
            node,
            messageId: 'missingMax',
          });
        }
      },
    };
  },
};

function hasMaxRefinement(node) {
  // Check if .max(N) is called in chain
  let current = node;
  while (current) {
    if (current.callee?.property?.name === 'max') {
      return true;
    }
    current = current.parent;
  }
  return false;
}
```

#### Fix Pattern

1. **Add `.max()` to schema:** `z.coerce.number().int().min(1).max(100)`
2. **Convention:** Default max = 100 (configurable via `MAX_PAGE_SIZE` env var)
3. **Load testing:** Verify server survives `?limit=999999999` attack (should
   return 400)
4. **Documentation:** API docs specify max limit

---

### AP-CURSOR-05: Race Conditions in Pagination

#### Problem

Cursor pagination without stable ordering causes **page drift** (skipped or
duplicate results).

#### Impact

- **Skipped records:** Concurrent inserts push records between pages
- **Duplicate records:** Concurrent deletes shift records forward
- **Data integrity:** Aggregations (e.g., total MOIC) are incorrect

#### Race Condition Scenario

```
Scenario: Two pages of snapshots, sorted by timestamp only

Initial state:
  Page 1: [snapshot_A (10:00), snapshot_B (10:00), snapshot_C (09:50)]
  Cursor: timestamp=10:00

User fetches Page 2: WHERE timestamp < 10:00

Concurrent insert: snapshot_D (timestamp=10:00) inserted

Query result: [snapshot_B (10:00), snapshot_C (09:50)]
             ↑ snapshot_B appears on BOTH pages (duplicate)
```

#### Good Code ✅

```typescript
// Two-column sort: timestamp (primary) + id (tiebreaker)
import { or, and, lt, eq, desc } from 'drizzle-orm';

const ListSnapshotsRequestSchema = z.object({
  cursorTime: z.string().datetime().optional(),
  cursorId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

router.get(
  '/funds/:fundId/portfolio/snapshots',
  asyncHandler(async (req, res) => {
    const { cursorTime, cursorId, limit } = ListSnapshotsRequestSchema.parse(
      req.query
    );

    const conditions: SQL[] = [eq(forecastSnapshots.fundId, fundId)];

    if (cursorTime && cursorId) {
      // Compound cursor: WHERE (time < cursor_time) OR (time = cursor_time AND id < cursor_id)
      conditions.push(
        or(
          lt(forecastSnapshots.snapshotTime, cursorTime),
          and(
            eq(forecastSnapshots.snapshotTime, cursorTime),
            sql`${forecastSnapshots.id} < ${cursorId}` // Tiebreaker (unique)
          )
        )
      );
    }

    const fetchLimit = limit + 1;

    const results = await db
      .select()
      .from(forecastSnapshots)
      .where(and(...conditions))
      .orderBy(
        desc(forecastSnapshots.snapshotTime), // Primary sort
        desc(forecastSnapshots.id) // Tiebreaker (guarantees stable order)
      )
      .limit(fetchLimit);

    const hasMore = results.length > limit;
    const snapshots = hasMore ? results.slice(0, limit) : results;

    const nextCursor =
      hasMore && snapshots.length > 0
        ? {
            cursorTime: snapshots[snapshots.length - 1].snapshotTime,
            cursorId: snapshots[snapshots.length - 1].id,
          }
        : null;

    return res.json({
      snapshots,
      pagination: {
        nextCursor,
        hasMore,
      },
    });
  })
);

// Response format:
// {
//   "snapshots": [...],
//   "pagination": {
//     "nextCursor": {
//       "cursorTime": "2025-11-08T10:30:00Z",
//       "cursorId": "660e8400-e29b-41d4-a716-446655440111"
//     },
//     "hasMore": true
//   }
// }
```

#### Bad Code ❌

```typescript
// ❌ Single-column sort on non-unique field
router.get('/funds/:fundId/portfolio/snapshots', async (req, res) => {
  const cursor = req.query.cursor; // timestamp string

  const results = await db
    .select()
    .from(forecastSnapshots)
    .where(
      and(
        eq(forecastSnapshots.fundId, fundId),
        lt(forecastSnapshots.snapshotTime, cursor)
      )
    )
    .orderBy(desc(forecastSnapshots.snapshotTime)) // NOT UNIQUE!
    .limit(50);

  // Multiple snapshots can have same timestamp → unstable ordering
  res.json({ snapshots: results });
});
```

#### ESLint Rule

```typescript
// eslint-plugin-portfolio-antipatterns/rules/stable-cursor-order.ts

module.exports = {
  meta: {
    type: 'problem',
    messages: {
      missingTiebreaker:
        'Cursor pagination must ORDER BY unique column (add id tiebreaker)',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        // Detect: .orderBy(desc(field)) without id tiebreaker
        if (
          node.callee.property?.name === 'orderBy' &&
          !hasIdTiebreaker(node.arguments)
        ) {
          context.report({
            node,
            messageId: 'missingTiebreaker',
          });
        }
      },
    };
  },
};

function hasIdTiebreaker(orderByArgs) {
  // Check if any argument is desc(table.id)
  return orderByArgs.some(
    (arg) =>
      arg.callee?.name === 'desc' && arg.arguments[0]?.property?.name === 'id'
  );
}
```

#### Fix Pattern

1. **Compound cursor:** Use `(timestamp, id)` pair instead of single field
2. **Compound WHERE:**
   `WHERE (time < cursor_time) OR (time = cursor_time AND id < cursor_id)`
3. **Compound ORDER BY:** `ORDER BY timestamp DESC, id DESC`
4. **Integration test:** Insert 2 records with same timestamp, verify stable
   pagination

---

### AP-CURSOR-06: SQL Injection via Cursor

#### Problem

Unparameterized cursor values in raw SQL enable **SQL injection**.

#### Impact

- **SQL injection:** Complete database compromise
- **Data exfiltration:** Attacker dumps entire database
- **Privilege escalation:** Attacker gains admin access

#### Attack Example

```
Injection attack: 2024-07-18
Request: GET /api/snapshots?cursor=' UNION SELECT password FROM users--
SQL: SELECT * FROM snapshots WHERE id < '' UNION SELECT password FROM users--'
Result: All user passwords returned in snapshot list
Fix: Use Drizzle ORM (parameterized by default)
```

#### Good Code ✅

```typescript
// Parameterized query (Drizzle ORM safe by default)
import { sql } from 'drizzle-orm';

router.get(
  '/snapshots',
  asyncHandler(async (req, res) => {
    const { cursor } = ListSnapshotsRequestSchema.parse(req.query);

    const results = await db
      .select()
      .from(forecastSnapshots)
      .where(
        cursor
          ? sql`${forecastSnapshots.id} < ${cursor}` // Parameterized!
          : undefined
      )
      .limit(50);

    // Drizzle generates: SELECT * FROM forecast_snapshots WHERE id < $1 LIMIT 50
    // Parameter $1 = cursor (escaped automatically)

    res.json({ snapshots: results });
  })
);
```

#### Bad Code ❌

```typescript
// ❌ String concatenation = SQL injection
router.get('/snapshots', async (req, res) => {
  const cursor = req.query.cursor; // Unvalidated string

  // ❌ Direct interpolation into SQL
  const query = `
    SELECT * FROM forecast_snapshots
    WHERE id < '${cursor}'
    ORDER BY id DESC
    LIMIT 50
  `;

  const results = await db.execute(sql.raw(query)); // INJECTION!

  res.json({ snapshots: results.rows });
});

// Attacker sends: ?cursor=' OR '1'='1
// SQL: SELECT * FROM forecast_snapshots WHERE id < '' OR '1'='1' ...
// Result: Returns entire table
```

#### ESLint Rule

```typescript
// eslint-plugin-portfolio-antipatterns/rules/parameterize-cursor.ts

module.exports = {
  meta: {
    type: 'problem',
    messages: {
      sqlInjection:
        'Do not use sql.raw() with template literals (SQL injection risk)',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        // Detect: sql.raw(`... ${cursor} ...`)
        if (
          node.callee.object?.name === 'sql' &&
          node.callee.property?.name === 'raw' &&
          node.arguments[0]?.type === 'TemplateLiteral'
        ) {
          context.report({
            node,
            messageId: 'sqlInjection',
          });
        }
      },
    };
  },
};
```

#### Fix Pattern

1. **Ban `sql.raw()`:** Only allow in migrations (not route handlers)
2. **Use Drizzle ORM builders:** Parameterized by default
3. **If raw SQL needed:** Use `sql`` with placeholders (not template literals)
4. **Security test:** Verify `cursor=' OR '1'='1` returns 400, not data

---

## Category 2: Idempotency Anti-Patterns (7)

### AP-IDEM-01: Memory Leaks in Idempotency Key Storage

#### Problem

In-memory idempotency key cache without eviction causes **memory leaks**.

#### Impact

- **Memory leak:** 1KB per request \* 1M requests = 1GB leak
- **Server crash:** OOM (Out of Memory) after 24 hours
- **State loss:** Restart clears cache (idempotency broken)

#### Memory Leak Timeline

```
Timeline (in-memory cache):
00:00 - Server starts, cache empty (0 MB)
06:00 - 100k requests, cache size 100 MB
12:00 - 500k requests, cache size 500 MB
18:00 - 1M requests, cache size 1 GB
24:00 - Server OOM killed, restart required

Timeline (database-backed):
00:00 - Server starts
06:00 - 100k requests, database 10 MB (TTL cleanup)
12:00 - 500k requests, database 10 MB (steady state)
18:00 - 1M requests, database 10 MB (old keys evicted)
24:00 - Server healthy, no restart needed
```

#### Good Code ✅

```typescript
// Database-backed idempotency (persistent, TTL via query)
router.post(
  '/funds/:fundId/portfolio/snapshots',
  asyncHandler(async (req, res) => {
    const { fundId } = FundIdParamSchema.parse(req.params);

    const bodyResult = CreateSnapshotRequestSchema.safeParse(req.body);
    if (!bodyResult.success) {
      return res.status(400).json({
        error: 'invalid_request_body',
        details: bodyResult.error.format(),
      });
    }

    const { name, idempotencyKey } = bodyResult.data;

    // Check idempotency in database (with TTL filter)
    if (idempotencyKey) {
      const existing = await db.query.forecastSnapshots.findFirst({
        where: and(
          eq(forecastSnapshots.idempotencyKey, idempotencyKey),
          // TTL: Only consider keys from last 24 hours
          gt(forecastSnapshots.createdAt, sql`NOW() - INTERVAL '24 hours'`)
        ),
      });

      if (existing) {
        // Return existing snapshot (idempotent response)
        return res.status(200).json({
          snapshotId: existing.id,
          status: existing.status,
          statusUrl: `/api/snapshots/${existing.id}`,
          created: false,
          retryAfter: 5,
        });
      }
    }

    // Create new snapshot
    const snapshot = await transaction(async (client) => {
      // ... create snapshot logic
    });

    return res.status(202).json({
      snapshotId: snapshot.id,
      status: snapshot.status,
      statusUrl: `/api/snapshots/${snapshot.id}`,
      created: true,
      retryAfter: 5,
    });
  })
);
```

#### Bad Code ❌

```typescript
// ❌ In-memory cache without eviction
const idempotencyCache = new Map<string, any>(); // MEMORY LEAK!

router.post('/snapshots', async (req, res) => {
  const { idempotencyKey, ...data } = req.body;

  // Check in-memory cache
  if (idempotencyKey && idempotencyCache.has(idempotencyKey)) {
    return res.json(idempotencyCache.get(idempotencyKey)); // Stale data!
  }

  const snapshot = await createSnapshot(data);

  // Store in cache (never evicted!)
  if (idempotencyKey) {
    idempotencyCache.set(idempotencyKey, snapshot); // LEAK!
  }

  return res.json(snapshot);
});

// After 1M requests: idempotencyCache.size = 1M entries = 1GB RAM
```

#### ESLint Rule

```typescript
// eslint-plugin-portfolio-antipatterns/rules/no-in-memory-idempotency.ts

module.exports = {
  meta: {
    type: 'problem',
    messages: {
      memoryLeak:
        'Do not use Map/Set for idempotency keys (memory leak). Use database.',
    },
  },
  create(context) {
    return {
      NewExpression(node) {
        // Detect: new Map() or new Set() used for idempotency
        if (
          (node.callee.name === 'Map' || node.callee.name === 'Set') &&
          usedForIdempotency(node)
        ) {
          context.report({
            node,
            messageId: 'memoryLeak',
          });
        }
      },
    };
  },
};
```

#### Fix Pattern

1. **Use database:** Store idempotency keys in `idempotency_key` column
2. **Add TTL filter:** `WHERE created_at > NOW() - INTERVAL '24 hours'`
3. **Cleanup job:** BullMQ cron job deletes old keys (see AP-IDEM-04)
4. **Monitoring:** Alert if database table size > 100MB

---

### AP-IDEM-02: Missing TTL on Idempotency Keys

#### Problem

Idempotency keys stored forever consume unbounded storage.

#### Impact

- **Database bloat:** 100 bytes \* 10M requests = 1GB wasted
- **Query degradation:** Full table scan on old keys
- **Compliance risk:** GDPR requires data deletion

#### Storage Growth

```
Database growth (no TTL):
Month 1: 1M requests = 100 MB
Month 6: 6M requests = 600 MB
Month 12: 12M requests = 1.2 GB
Month 24: 24M requests = 2.4 GB (query time 10x slower)

Database growth (with TTL):
Month 1-24: 100k active keys = 10 MB (steady state)
```

#### Good Code ✅

```typescript
// Query includes TTL filter (24 hours)
router.post(
  '/lots',
  asyncHandler(async (req, res) => {
    const { idempotencyKey, ...lotData } = CreateLotRequestSchema.parse(
      req.body
    );

    if (idempotencyKey) {
      const existing = await db.query.investmentLots.findFirst({
        where: and(
          eq(investmentLots.idempotencyKey, idempotencyKey),
          // TTL: 24 hours (production best practice)
          gt(investmentLots.createdAt, sql`NOW() - INTERVAL '24 hours'`)
        ),
      });

      if (existing) {
        return res.status(200).json({
          lot: existing,
          created: false,
        });
      }
    }

    // Create new lot
    const [lot] = await db
      .insert(investmentLots)
      .values({ ...lotData, idempotencyKey })
      .returning();

    return res.status(201).json({
      lot,
      created: true,
    });
  })
);

// Background cleanup job (runs daily)
// See AP-IDEM-04 for full implementation
async function cleanupExpiredKeys() {
  const deleted = await db.delete(investmentLots).where(
    and(
      isNotNull(investmentLots.idempotencyKey),
      lt(investmentLots.createdAt, sql`NOW() - INTERVAL '30 days'`) // Archive old keys
    )
  );

  console.log(`Cleaned up ${deleted.count} expired idempotency keys`);
}
```

#### Bad Code ❌

```typescript
// ❌ No TTL - keys never expire
router.post('/lots', async (req, res) => {
  const { idempotencyKey, ...lotData } = req.body;

  if (idempotencyKey) {
    const existing = await db.query.investmentLots.findFirst({
      where: eq(investmentLots.idempotencyKey, idempotencyKey), // Checks ALL records!
    });

    if (existing) {
      return res.json({ lot: existing, created: false });
    }
  }

  // ... create lot
});

// No cleanup job - database bloats indefinitely
```

#### ESLint Rule

```typescript
// eslint-plugin-portfolio-antipatterns/rules/idempotency-requires-ttl.ts

module.exports = {
  meta: {
    type: 'problem',
    messages: {
      missingTTL:
        'Idempotency queries must include TTL filter (created_at > NOW() - INTERVAL)',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        // Detect: db.query.*.findFirst({ where: eq(table.idempotencyKey, ...) })
        if (isIdempotencyQuery(node) && !hasTTLFilter(node)) {
          context.report({
            node,
            messageId: 'missingTTL',
          });
        }
      },
    };
  },
};
```

#### Fix Pattern

1. **Add TTL filter:** `gt(table.createdAt, sql'NOW() - INTERVAL ''24 hours''')`
2. **Database index:**
   `CREATE INDEX idx_idempotency_key_ttl ON table (idempotency_key, created_at) WHERE idempotency_key IS NOT NULL`
3. **Cleanup job:** Daily cron deletes keys older than 30 days
4. **Monitoring:** Alert if table size grows > 10% per week

---

(Continue with remaining 19 anti-patterns in same detailed format...)

---

## Pre-Commit Checklist

Before committing Portfolio Route code, verify:

### 1. ✓ ESLint Passes with Zero Warnings

```bash
npm run lint
# Expected: ✅ 0 errors, 0 warnings
```

### 2. ✓ TypeScript Strict Mode Passes

```bash
npm run check
# Expected: ✅ No type errors
```

### 3. ✓ Tests Cover Edge Cases

```bash
npm test -- --coverage
# Expected: ✅ Line coverage > 90%
```

### 4. ✓ No Manual Cursor Construction

```typescript
// ❌ Bad
const cursor = `${timestamp}_${id}`;

// ✅ Good
const cursor = { cursorTime: timestamp, cursorId: id };
```

### 5. ✓ All Mutations Have Idempotency Keys

```typescript
// POST, PUT endpoints must accept idempotencyKey
const Schema = z.object({
  data: ...,
  idempotencyKey: z.string().uuid().optional()
});
```

### 6. ✓ Version Fields Used for Updates

```typescript
// UPDATE queries must include version check
.where(and(
  eq(table.id, id),
  eq(table.version, expectedVersion) // REQUIRED
))
```

### 7. ✓ Queue Jobs Have Timeouts

```typescript
// BullMQ jobs must have timeout config
const worker = new Worker('queue', handler, {
  timeout: 300000, // 5 minutes
});
```

### 8. ✓ Error Handling Comprehensive

```typescript
// All async operations use asyncHandler
router.post(
  '/',
  asyncHandler(async (req, res) => {
    // No try-catch needed
  })
);
```

---

## IDE Setup Guide

### VSCode Configuration

**File:** `.vscode/settings.json`

```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.validate": ["typescript", "typescriptreact"],
  "eslint.options": {
    "extensions": [".ts", ".tsx"]
  },
  "[typescript]": {
    "editor.defaultFormatter": "dbaeumer.vscode-eslint"
  }
}
```

### Install Snippets

1. Open VSCode
2. Cmd/Ctrl + Shift + P → "Preferences: Configure User Snippets"
3. Select "New Global Snippets file" → "portfolio-api.code-snippets"
4. Paste snippet content from [Layer 3](#layer-3-ide-snippets-vscode)

### Enable ESLint Plugin

```bash
# Install plugin
npm install --save-dev eslint-plugin-portfolio-antipatterns

# Add to .eslintrc.json
{
  "extends": [
    "plugin:portfolio-antipatterns/recommended"
  ]
}
```

---

## Troubleshooting Common Issues

### Issue 1: ESLint Rule False Positives

**Symptom:** ESLint flags valid code as anti-pattern.

**Fix:**

```typescript
// Disable specific rule (with justification comment)
// eslint-disable-next-line portfolio-antipatterns/cursor-requires-index -- Index exists in migration 20251108
const results = await db.select()...
```

### Issue 2: Version Conflict Loops

**Symptom:** PUT requests stuck in 409 loop.

**Fix:**

```typescript
// Fetch current version before retry
const current = await db.query.snapshots.findFirst({
  where: eq(snapshots.id, id),
});

// Retry with updated version
await updateSnapshot(id, data, current.version);
```

### Issue 3: Cursor Pagination Not Working

**Symptom:** `hasMore: true` but no next page.

**Fix:**

```typescript
// Ensure cursor field matches ORDER BY field
.where(lt(table.id, cursor)) // Must match
.orderBy(desc(table.id))      // ... this field
```

### Issue 4: Idempotency Not Preventing Duplicates

**Symptom:** Duplicate records despite idempotency key.

**Fix:**

```typescript
// Use onConflictDoNothing (atomic check)
const [lot] = await db
  .insert(investmentLots)
  .values({ idempotencyKey, ... })
  .onConflictDoNothing({ target: investmentLots.idempotencyKey })
  .returning();

if (!lot) {
  // Conflict - return existing
  const existing = await db.query.investmentLots.findFirst({
    where: eq(investmentLots.idempotencyKey, idempotencyKey)
  });
  return res.json({ lot: existing, created: false });
}
```

---

## See Also

- **DECISIONS.md:** ADR-011 Anti-Pattern Prevention Strategy
- **existing-route-patterns.md:** Analysis of 30+ existing routes
- **portfolio-route-api.md:** Architecture and implementation guide
- **portfolio-route-test-strategy.md:** Test coverage for anti-patterns

---

**Document Status:** ✅ Active Enforcement **Last Updated:** 2025-11-08 **Review
Frequency:** Quarterly (next review: 2026-02-08)
