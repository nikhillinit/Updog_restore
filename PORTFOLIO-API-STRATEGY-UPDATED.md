---
status: ACTIVE
last_updated: 2026-01-19
---

# Portfolio API Implementation Strategy (Updated 2025-01-09)

**Status:** Ready for implementation **Source:** Original strategy plan updated
with cheatsheets/anti-pattern-prevention.md patterns **Cross-References:**

- [Anti-Pattern Prevention](cheatsheets/anti-pattern-prevention.md) - 24
  catalogued patterns
- [Service Testing Patterns](cheatsheets/service-testing-patterns.md) - Test
  isolation guide
- [Daily Workflow](cheatsheets/daily-workflow.md) - Quality gate checklist
- [CAPABILITIES.md](CAPABILITIES.md) - Check for existing agents first

---

## Phase 0: Pre-Flight Verification (15 min)  NEW

**Why This Exists:** Prevents reinventing existing solutions and ensures
awareness of all 24 anti-patterns.

### Step 0.1: Check for Existing Solutions (5 min)

```bash
# 1. Review capabilities for portfolio/MOIC agents
cat CAPABILITIES.md | grep -i "portfolio\|snapshot\|moic\|lot"

# 2. Check for waterfall-specialist agent
claude-code --list-agents | grep waterfall
```

### Step 0.2: Review Anti-Pattern Catalog (10 min)

**File:** `cheatsheets/anti-pattern-prevention.md` (1,490 lines)

**Focus Areas:**

- Lines 50-400: Cursor Pagination (6 patterns)
- Lines 401-800: Idempotency (7 patterns)
- Lines 801-1100: Optimistic Locking (5 patterns)
- Lines 1101-1400: BullMQ Queue (6 patterns)

**Quick Checklist:**

- [ ] Understand compound cursor pattern (timestamp + UUID tiebreaker)
- [ ] Know database-backed idempotency (not in-memory)
- [ ] Understand version field type (bigint, not int)
- [ ] Know queue timeout requirements (5 min max)

### Step 0.3: Design Validation (5 min)

```bash
# Use brainstorming skill for design validation
/superpowers:brainstorm
```

**Prompt:**

> I'm implementing a portfolio API with snapshots, lots, and MOIC calculations.
> The API will have 6 endpoints with cursor pagination, idempotency, and
> optimistic locking. Background workers will calculate MOIC metrics using
> BullMQ. Are there any edge cases or design flaws I should address before
> coding?

---

## Phase 1: Quality Gates Setup (3-4 hours)

### Step 1.1: Database Schema Validation (30 min)

**Critical Fields for Anti-Pattern Prevention:**

```typescript
// server/db/schema/portfolio.ts
export const forecastSnapshots = pgTable(
  'forecast_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fundId: integer('fund_id').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull(), // pending | calculating | complete | error

    // AP-LOCK-02: Use bigint for version (not integer)
    version: bigint('version', { mode: 'number' }).notNull().default(0),

    // AP-IDEM-02: Idempotency with TTL-friendly timestamp
    idempotencyKey: uuid('idempotency_key'),
    createdAt: timestamp('created_at').notNull().defaultNow(),

    // AP-CURSOR-01: Compound cursor fields (index required)
    snapshotTime: timestamp('snapshot_time').notNull(),

    calculatedMetrics: jsonb('calculated_metrics'), // MOIC results
  },
  (table) => ({
    // AP-CURSOR-01: Compound index for pagination
    cursorIdx: index('snapshot_cursor_idx').on(
      table.snapshotTime.desc(),
      table.id.desc()
    ),
    // AP-IDEM-02: TTL query optimization
    idempotencyIdx: index('snapshot_idempotency_idx').on(
      table.idempotencyKey,
      table.createdAt
    ),
  })
);
```

**Validation:**

- [ ] Version fields are `bigint` (not `integer`)
- [ ] Compound indexes for cursor pagination exist
- [ ] Idempotency key column with timestamp for TTL filtering
- [ ] No exposed sequential IDs in API responses

### Step 1.2: ESLint Anti-Pattern Rules (1 hour)

**File:** `.eslintrc.cjs`

```javascript
module.exports = {
  rules: {
    // AP-CURSOR-06: No string concatenation in SQL
    'no-sql-concat': 'error',

    // AP-IDEM-01: No in-memory idempotency storage
    'no-memory-idempotency': 'error',

    // AP-LOCK-01: No FOR UPDATE (use optimistic locking)
    'no-pessimistic-locking': 'error',

    // AP-QUEUE-02: All queue jobs must have timeout
    'require-queue-timeout': 'error',

    // AP-QUEUE-04: All queues must have dead letter queue
    'require-dlq': 'error',

    // General quality
    'no-console': 'warn',
    'no-unused-vars': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
  },
};
```

### Step 1.3: Pre-Commit Hooks (30 min)

**File:** `.husky/pre-commit`

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# 1. TypeScript strict mode check
echo "Checking: Checking TypeScript..."
npm run check || exit 1

# 2. ESLint with anti-pattern rules
echo "Checking: Running ESLint..."
npm run lint || exit 1

# 3. Run affected tests only
echo "Testing: Running affected tests..."
/test-smart || exit 1

# 4. Check for hardcoded limits
echo "Checking: Checking for hardcoded limits..."
git diff --cached | grep -E "(limit.*=.*[0-9]+|take\([0-9]+\))" && {
  echo "[ ] Found hardcoded limits. Use validated schema defaults."
  exit 1
}

# 5. Check for manual cursor construction
echo "Checking: Checking for manual cursors..."
git diff --cached | grep -E "(cursor.*=.*\`|cursor.*\+)" && {
  echo "[ ] Found manual cursor construction. Use cursor helper."
  exit 1
}

# 6. Check for missing version in updates
echo "Checking: Checking optimistic locking..."
git diff --cached server/ | grep -A5 "\.update(" | grep -q "version" || {
  echo "WARNING:  Warning: UPDATE without version check detected"
}

echo "[x] Pre-commit checks passed!"
```

### Step 1.4: VS Code Snippets (30 min)

**File:** `.vscode/portfolio-api.code-snippets`

```json
{
  "Cursor Pagination Query": {
    "prefix": "cursor-query",
    "body": [
      "const schema = z.object({",
      "  cursorTime: z.string().datetime().optional(),",
      "  cursorId: z.string().uuid().optional(),",
      "  limit: z.coerce.number().int().min(1).max(100).default(50),",
      "});",
      "",
      "const filters = [];",
      "if (cursorTime && cursorId) {",
      "  filters.push(",
      "    or(",
      "      lt(table.timestamp, cursorTime),",
      "      and(",
      "        eq(table.timestamp, cursorTime),",
      "        lt(table.id, cursorId)",
      "      )",
      "    )",
      "  );",
      "}",
      "",
      "const results = await db.select()",
      "  .from(table)",
      "  .where(and(...filters))",
      "  .orderBy(desc(table.timestamp), desc(table.id))",
      "  .limit(limit + 1); // +1 for hasMore detection"
    ]
  },

  "Idempotency Check": {
    "prefix": "idempotency-check",
    "body": [
      "// AP-IDEM-02: Database-backed idempotency with TTL",
      "const existing = await db.select()",
      "  .from(table)",
      "  .where(",
      "    and(",
      "      eq(table.idempotencyKey, idempotencyKey),",
      "      gt(table.createdAt, sql`NOW() - INTERVAL '24 hours'`)",
      "    )",
      "  )",
      "  .limit(1);",
      "",
      "if (existing.length > 0) {",
      "  return res.status(200).json(existing[0]); // Return cached result",
      "}",
      "",
      "// Atomic insert with conflict handling",
      "const result = await db.insert(table)",
      "  .values({ ...data, idempotencyKey })",
      "  .onConflictDoNothing({ target: table.idempotencyKey })",
      "  .returning();"
    ]
  },

  "Optimistic Locking Update": {
    "prefix": "optimistic-update",
    "body": [
      "// AP-LOCK-02: Version field must be bigint",
      "const updated = await db.update(table)",
      "  .set({",
      "    ...changes,",
      "    version: sql`${table.version} + 1`,",
      "    updatedAt: new Date(),",
      "  })",
      "  .where(",
      "    and(",
      "      eq(table.id, id),",
      "      eq(table.version, expectedVersion) // CRITICAL: Version check",
      "    )",
      "  )",
      "  .returning();",
      "",
      "if (updated.length === 0) {",
      "  return res.status(409).json({",
      "    error: 'Conflict',",
      "    message: 'Resource was modified. Please retry.',",
      "    retryAfter: 1,",
      "    currentVersion: (await db.select().from(table).where(eq(table.id, id)))[0]?.version,",
      "  });",
      "}"
    ]
  },

  "BullMQ Job with Timeout": {
    "prefix": "queue-job",
    "body": [
      "// AP-QUEUE-02: All jobs MUST have timeout",
      "const job = await queue.add('${1:job-name}', {",
      "  ${2:payload}",
      "}, {",
      "  attempts: 3,",
      "  backoff: {",
      "    type: 'exponential',",
      "    delay: 1000,",
      "  },",
      "  timeout: 300000, // 5 min max (REQUIRED)",
      "  removeOnComplete: {",
      "    age: 86400, // 24 hours",
      "    count: 1000,",
      "  },",
      "  removeOnFail: {",
      "    age: 604800, // 7 days",
      "  },",
      "});"
    ]
  }
}
```

### Step 1.5: Quality Gate Summary

**Pre-Commit Checklist:**

- [ ] ESLint passes (0 warnings)
- [ ] TypeScript strict mode passes
- [ ] No hardcoded limits in queries
- [ ] No manual cursor construction
- [ ] All updates include version check
- [ ] All queue jobs have timeout
- [ ] Tests pass (via /test-smart)
- [ ] Changes logged (via /log-change)

---

## Phase 2: Pattern Adaptation (1.5 hours)

### Step 2.1: Cursor Pagination Helper (30 min)

**File:** `server/utils/cursor-pagination.ts`

```typescript
import { z } from 'zod';
import { SQL, and, or, lt, eq, desc } from 'drizzle-orm';

/**
 * AP-CURSOR-05: Compound cursor prevents page drift
 * AP-CURSOR-04: Limit clamping prevents resource exhaustion
 */
export const CursorPaginationSchema = z.object({
  cursorTime: z.string().datetime().optional(),
  cursorId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CursorPagination = z.infer<typeof CursorPaginationSchema>;

export function buildCursorFilter<T extends { timestamp: any; id: any }>(
  table: T,
  cursor: CursorPagination
): SQL | undefined {
  const { cursorTime, cursorId } = cursor;

  if (!cursorTime || !cursorId) return undefined;

  // Compound cursor: (timestamp < cursor) OR (timestamp = cursor AND id < cursorId)
  return or(
    lt(table.timestamp, cursorTime),
    and(eq(table.timestamp, cursorTime), lt(table.id, cursorId))
  );
}

export function buildCursorResponse<T extends { timestamp: Date; id: string }>(
  results: T[],
  limit: number
) {
  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, limit) : results;

  const nextCursor = hasMore
    ? {
        cursorTime: items[items.length - 1].timestamp.toISOString(),
        cursorId: items[items.length - 1].id,
      }
    : undefined;

  return { items, hasMore, nextCursor };
}
```

**Tests:** `server/utils/__tests__/cursor-pagination.test.ts`

### Step 2.2: Idempotency Middleware (30 min)

**File:** `server/middleware/idempotency.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { idempotencyKeys } from '../db/schema';
import { eq, and, gt, sql } from 'drizzle-orm';

const IdempotencyKeySchema = z.string().uuid();

/**
 * AP-IDEM-02: Database-backed with 24hr TTL
 * AP-IDEM-03: Atomic check-then-insert via onConflictDoNothing
 */
export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const key = req.headers['idempotency-key'] as string;

  if (!key) {
    return res.status(400).json({
      error: 'Missing required header: Idempotency-Key',
    });
  }

  const parseResult = IdempotencyKeySchema.safeParse(key);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Idempotency-Key must be a valid UUID',
    });
  }

  // Check for existing request (with TTL filter)
  const existing = await db
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.key, key),
        gt(idempotencyKeys.createdAt, sql`NOW() - INTERVAL '24 hours'`)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Return cached response
    return res.status(existing[0].statusCode).json(existing[0].responseBody);
  }

  // Store key for later (response stored in route handler)
  req.idempotencyKey = key;
  next();
}
```

### Step 2.3: Optimistic Locking Helper (20 min)

**File:** `server/utils/optimistic-locking.ts`

```typescript
import { Response } from 'express';

/**
 * AP-LOCK-03: Always check version in WHERE clause
 * AP-LOCK-04: Provide retry guidance in 409 response
 */
export function handleVersionConflict(
  res: Response,
  currentVersion: number | null
) {
  return res.status(409).json({
    error: 'Conflict',
    message:
      'Resource was modified by another request. Please refetch and retry.',
    retryAfter: 1, // seconds
    currentVersion,
  });
}

export function incrementVersion(version: number): number {
  // AP-LOCK-02: Version is bigint, check for overflow (unlikely but safe)
  if (version >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Version overflow detected');
  }
  return version + 1;
}
```

### Step 2.4: Queue Instance (10 min)

**File:** `server/queues/snapshot-queue.ts`

```typescript
import { Queue } from 'bullmq';
import { redis } from '../db/redis';

/**
 * AP-QUEUE-02: All jobs MUST have timeout (enforced in job options)
 * AP-QUEUE-04: Dead letter queue for permanent failures
 */
export const snapshotQueue = new Queue('snapshot-calculation', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    timeout: 300000, // 5 min max
    removeOnComplete: {
      age: 86400, // 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 604800, // 7 days for debugging
    },
  },
});
```

---

## Phase 2.5: Service Layer (1 hour)  NEW

**Why This Exists:** Separates business logic from HTTP handling, enables proper
test isolation.

### Step 2.5.1: Snapshot Service (30 min)

**File:** `server/services/snapshot-service.ts`

```typescript
import { db } from '../db';
import { forecastSnapshots } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import {
  buildCursorFilter,
  buildCursorResponse,
} from '../utils/cursor-pagination';
import { snapshotQueue } from '../queues/snapshot-queue';

export class SnapshotService {
  /**
   * Create snapshot with idempotency
   * Business logic only - no HTTP concerns
   */
  async createSnapshot(data: {
    fundId: number;
    name: string;
    idempotencyKey: string;
    correlationId: string;
  }) {
    // Check idempotency (DB-backed, 24hr TTL)
    const existing = await db
      .select()
      .from(forecastSnapshots)
      .where(
        and(
          eq(forecastSnapshots.idempotencyKey, data.idempotencyKey),
          gt(forecastSnapshots.createdAt, sql`NOW() - INTERVAL '24 hours'`)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return existing[0]; // Return cached result
    }

    // Create snapshot record
    const snapshot = await db
      .insert(forecastSnapshots)
      .values({
        fundId: data.fundId,
        name: data.name,
        status: 'pending',
        snapshotTime: new Date(),
        idempotencyKey: data.idempotencyKey,
      })
      .returning();

    // Queue background calculation
    await snapshotQueue.add('calculate-snapshot', {
      snapshotId: snapshot[0].id,
      fundId: data.fundId,
      correlationId: data.correlationId,
    });

    return snapshot[0];
  }

  /**
   * List snapshots with cursor pagination
   */
  async listSnapshots(fundId: number, pagination: CursorPagination) {
    const { limit } = pagination;
    const cursorFilter = buildCursorFilter(forecastSnapshots, pagination);

    const filters = [eq(forecastSnapshots.fundId, fundId)];
    if (cursorFilter) filters.push(cursorFilter);

    const results = await db
      .select()
      .from(forecastSnapshots)
      .where(and(...filters))
      .orderBy(desc(forecastSnapshots.snapshotTime), desc(forecastSnapshots.id))
      .limit(limit + 1); // +1 for hasMore detection

    return buildCursorResponse(results, limit);
  }

  /**
   * Get snapshot by ID with optimistic locking support
   */
  async getSnapshot(id: string) {
    const snapshot = await db
      .select()
      .from(forecastSnapshots)
      .where(eq(forecastSnapshots.id, id))
      .limit(1);

    if (snapshot.length === 0) {
      return null;
    }

    return snapshot[0];
  }

  /**
   * Update snapshot with optimistic locking
   */
  async updateSnapshot(
    id: string,
    version: number,
    changes: Partial<typeof forecastSnapshots.$inferInsert>
  ) {
    const updated = await db
      .update(forecastSnapshots)
      .set({
        ...changes,
        version: sql`${forecastSnapshots.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(forecastSnapshots.id, id),
          eq(forecastSnapshots.version, version) // AP-LOCK-03: REQUIRED
        )
      )
      .returning();

    return updated.length > 0 ? updated[0] : null;
  }
}

export const snapshotService = new SnapshotService();
```

### Step 2.5.2: Service Tests (30 min)

**File:** `server/services/__tests__/snapshot-service.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { snapshotService } from '../snapshot-service';
import * as dbModule from '../../db';
import * as queueModule from '../../queues/snapshot-queue';

// AP-TEST-01: Import REAL service, MOCK database
vi.mock('../../db');
vi.mock('../../queues/snapshot-queue');

describe('SnapshotService', () => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(dbModule.db).mockReturnValue(mockDb);
  });

  afterEach(() => {
    vi.restoreAllMocks(); // AP-TEST-03: Prevent mock pollution
  });

  describe('createSnapshot', () => {
    it('returns existing snapshot if idempotency key exists', async () => {
      // Arrange
      const existing = { id: 'uuid-1', name: 'Test', status: 'complete' };
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([existing]),
          }),
        }),
      });

      // Act
      const result = await snapshotService.createSnapshot({
        fundId: 1,
        name: 'Test',
        idempotencyKey: 'key-1',
        correlationId: 'corr-1',
      });

      // Assert
      expect(result).toEqual(existing);
      expect(mockDb.insert).not.toHaveBeenCalled(); // Idempotency worked
    });

    it('creates new snapshot and queues job if key not found', async () => {
      // Arrange
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // No existing
          }),
        }),
      });

      const newSnapshot = { id: 'uuid-2', name: 'New', status: 'pending' };
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newSnapshot]),
        }),
      });

      const mockQueue = { add: vi.fn() };
      vi.mocked(queueModule.snapshotQueue).mockReturnValue(mockQueue);

      // Act
      const result = await snapshotService.createSnapshot({
        fundId: 1,
        name: 'New',
        idempotencyKey: 'key-2',
        correlationId: 'corr-2',
      });

      // Assert
      expect(result).toEqual(newSnapshot);
      expect(mockQueue.add).toHaveBeenCalledWith('calculate-snapshot', {
        snapshotId: 'uuid-2',
        fundId: 1,
        correlationId: 'corr-2',
      });
    });
  });

  // Additional tests for listSnapshots, getSnapshot, updateSnapshot...
});
```

**Key Testing Principles:**

- [x] Import REAL service class (not mocked)
- [x] Mock database module only
- [x] Test business logic correctness
- [x] Verify service called with correct arguments
- [x] Add `vi.restoreAllMocks()` in afterEach

---

## Phase 3: Wire Up Routes & Test (30 min)

### Step 3.1: Mount Portfolio Router (15 min)

**File:** `server/routes/portfolio/index.ts`

```typescript
import { Router } from 'express';
import { snapshotService } from '../../services/snapshot-service';
import { idempotencyMiddleware } from '../../middleware/idempotency';
import { CursorPaginationSchema } from '../../utils/cursor-pagination';
import { z } from 'zod';

const router = Router();

// POST /api/funds/:fundId/portfolio/snapshots
router.post(
  '/funds/:fundId/portfolio/snapshots',
  idempotencyMiddleware,
  async (req, res) => {
    res.status(501).json({ error: 'Not Implemented' });
  }
);

// GET /api/funds/:fundId/portfolio/snapshots
router.get('/funds/:fundId/portfolio/snapshots', async (req, res) => {
  res.status(501).json({ error: 'Not Implemented' });
});

// GET /api/snapshots/:snapshotId
router.get('/snapshots/:snapshotId', async (req, res) => {
  res.status(501).json({ error: 'Not Implemented' });
});

// POST /api/funds/:fundId/portfolio/lots
router.post(
  '/funds/:fundId/portfolio/lots',
  idempotencyMiddleware,
  async (req, res) => {
    res.status(501).json({ error: 'Not Implemented' });
  }
);

// GET /api/funds/:fundId/portfolio/lots
router.get('/funds/:fundId/portfolio/lots', async (req, res) => {
  res.status(501).json({ error: 'Not Implemented' });
});

// PUT /api/snapshots/:snapshotId
router.put('/snapshots/:snapshotId', async (req, res) => {
  res.status(501).json({ error: 'Not Implemented' });
});

export default router;
```

**File:** `server/app.ts`

```typescript
import portfolioRouter from './routes/portfolio/index.js';

// ... existing imports ...

app.use('/api', portfolioRouter);
```

### Step 3.2: Test Scaffolding (15 min)

```bash
# Start dev server
npm run dev:api

# Test all 6 endpoints return 501
curl -X POST http://localhost:5000/api/funds/1/portfolio/snapshots \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test"}'

curl -X GET http://localhost:5000/api/funds/1/portfolio/snapshots
curl -X GET http://localhost:5000/api/snapshots/uuid-test
curl -X POST http://localhost:5000/api/funds/1/portfolio/lots \
  -H "Idempotency-Key: $(uuidgen)"
curl -X GET http://localhost:5000/api/funds/1/portfolio/lots
curl -X PUT http://localhost:5000/api/snapshots/uuid-test
```

**Expected:** All return 501 with `{ "error": "Not Implemented" }`

### Step 3.3: Commit Scaffolding (5 min)

```bash
git add server/routes/portfolio/ server/services/ server/utils/
git commit -m "$(cat <<'EOF'
feat(api): Portfolio route scaffolding with quality gates

- Add portfolio router with 6 endpoints (all return 501)
- Add SnapshotService with idempotency, pagination, optimistic locking
- Add cursor pagination helper (compound cursor)
- Add idempotency middleware (DB-backed, 24hr TTL)
- Add optimistic locking helper
- All patterns prevent anti-patterns AP-CURSOR-*, AP-IDEM-*, AP-LOCK-*

[AI] Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: TDD First Endpoint (2-3 hours)

**Endpoint:** `POST /api/funds/:fundId/portfolio/snapshots`

### Step 4.1: Write Failing Tests (30 min)

**File:** `server/routes/portfolio/__tests__/snapshots.test.ts` (API Test)

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../../app';
import * as serviceModule from '../../../services/snapshot-service';

// AP-TEST-02: Mock service layer, test HTTP handling
vi.mock('../../../services/snapshot-service');

describe('POST /api/funds/:fundId/portfolio/snapshots', () => {
  const mockService = {
    createSnapshot: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(serviceModule.snapshotService).mockReturnValue(mockService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 202 Accepted with snapshot ID and statusUrl', async () => {
    // Arrange
    const snapshot = {
      id: 'uuid-123',
      fundId: 1,
      name: 'Test Snapshot',
      status: 'pending',
      version: 0,
    };
    mockService.createSnapshot.mockResolvedValue(snapshot);

    // Act
    const response = await request(app)
      .post('/api/funds/1/portfolio/snapshots')
      .set('Idempotency-Key', 'key-123')
      .send({ name: 'Test Snapshot' });

    // Assert
    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      snapshotId: 'uuid-123',
      status: 'pending',
      statusUrl: '/api/snapshots/uuid-123',
      retryAfter: 5,
    });
  });

  it('returns 400 if name is missing', async () => {
    const response = await request(app)
      .post('/api/funds/1/portfolio/snapshots')
      .set('Idempotency-Key', 'key-123')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  it('returns 400 if Idempotency-Key header is missing', async () => {
    const response = await request(app)
      .post('/api/funds/1/portfolio/snapshots')
      .send({ name: 'Test' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Idempotency-Key');
  });

  it('returns 404 if fund does not exist', async () => {
    mockService.createSnapshot.mockRejectedValue(new Error('Fund not found'));

    const response = await request(app)
      .post('/api/funds/999/portfolio/snapshots')
      .set('Idempotency-Key', 'key-123')
      .send({ name: 'Test' });

    expect(response.status).toBe(404);
  });
});
```

**Run tests (expect failures):**

```bash
npm test -- server/routes/portfolio/__tests__/snapshots.test.ts
```

### Step 4.2: Implement in 10-20 Line Chunks (1.5-2 hours)

**Chunk 1: Validate Request (10 lines)**

```typescript
// server/routes/portfolio/snapshots.ts
import { z } from 'zod';

const FundIdParamSchema = z.object({
  fundId: z.coerce.number().int().positive(),
});

const CreateSnapshotRequestSchema = z.object({
  name: z.string().min(1).max(255),
});

router.post(
  '/funds/:fundId/portfolio/snapshots',
  idempotencyMiddleware,
  async (req, res) => {
    // 1. Validate params
    const paramResult = FundIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      return res.status(400).json({
        error: 'Invalid fund ID',
        details: paramResult.error.errors,
      });
    }

    const { fundId } = paramResult.data;

    // Next chunk...
  }
);
```

**[x] Code Review Checkpoint:**

```bash
/test-smart  # Run affected tests
/fix-auto    # Auto-fix lint issues

# Manual review:
# - Are params validated with Zod?
# - Is fundId coerced to number?
# - Are validation errors returned as 400?
```

**Chunk 2: Validate Body (15 lines)**

```typescript
// 2. Validate body
const bodyResult = CreateSnapshotRequestSchema.safeParse(req.body);
if (!bodyResult.success) {
  return res.status(400).json({
    error: 'Invalid request body',
    details: bodyResult.error.errors,
  });
}

const { name } = bodyResult.data;
```

**[x] Code Review Checkpoint:**

```bash
/test-smart
# Check: Is name validated? Is error response 400?
```

**Chunk 3: Verify Fund Exists (20 lines)**

```typescript
// server/utils/fund-validators.ts
import { db } from '../db';
import { funds } from '../db/schema';
import { eq } from 'drizzle-orm';

export async function verifyFundExists(fundId: number): Promise<void> {
  const fund = await db
    .select()
    .from(funds)
    .where(eq(funds.id, fundId))
    .limit(1);

  if (fund.length === 0) {
    throw new Error('Fund not found');
  }
}

// In route handler:
try {
  await verifyFundExists(fundId);
} catch (error) {
  return res.status(404).json({
    error: 'Fund not found',
    fundId,
  });
}
```

**[x] Code Review Checkpoint:**

```bash
/test-smart
# Check: Does 404 return if fund missing?
```

**Chunk 4: Create Snapshot via Service (15 lines)**

```typescript
// 4. Create snapshot via service layer
try {
  const snapshot = await snapshotService.createSnapshot({
    fundId,
    name,
    idempotencyKey: req.idempotencyKey!, // Set by middleware
    correlationId: req.id, // Request tracking
  });

  // Next chunk: return response
} catch (error) {
  return res.status(500).json({
    error: 'Failed to create snapshot',
    correlationId: req.id,
  });
}
```

**[x] Code Review Checkpoint:**

```bash
/test-smart
# Check: Is service called with correct args?
# Check: Is idempotencyKey from middleware?
# Check: Is correlationId from request?
```

**Chunk 5: Return 202 Response (10 lines)**

```typescript
// 5. Return 202 Accepted
return res.status(202).json({
  snapshotId: snapshot.id,
  status: snapshot.status,
  statusUrl: `/api/snapshots/${snapshot.id}`,
  retryAfter: 5, // seconds
});
```

**[x] Code Review Checkpoint:**

```bash
/test-smart
# Check: Status code 202?
# Check: All required fields present?
# Check: statusUrl format correct?
```

### Step 4.3: Verify Tests Pass (15 min)

```bash
# Run full test suite for this endpoint
npm test -- server/routes/portfolio/__tests__/snapshots.test.ts

# Expected: All tests pass [x]
```

### Step 4.4: Run Quality Gates (10 min)

```bash
# 1. Pre-commit checks (automatic)
git add server/routes/portfolio/snapshots.ts
.husky/pre-commit

# 2. Manual anti-pattern review
npm run lint -- --rule 'anti-patterns/*:error'

# 3. Type check
npm run check

# Expected: All pass [x]
```

### Step 4.5: Commit (10 min)

```bash
/log-change  # Updates CHANGELOG.md

git commit -m "$(cat <<'EOF'
feat(api): implement POST /snapshots with 202 Accepted

- Validate fundId and request body with Zod
- Verify fund exists before creating snapshot
- Use SnapshotService for business logic
- Return 202 Accepted with statusUrl
- Idempotency handled by middleware
- All quality gates passing (ESLint, tests, TypeScript)

Prevents anti-patterns:
- AP-IDEM-03: Idempotency via service layer
- AP-QUEUE-02: Job timeout in queue config

Tests: 4 scenarios (happy path, validation, missing fund, idempotency)
Coverage: 100% of route handler

[AI] Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5: Remaining 5 Endpoints (5-8 hours)

**Pattern for each endpoint:**

1. **Write failing test (20 min):** API test mocking service layer
2. **Implement with coding pairs (1-1.5 hours):** 10-20 line chunks with reviews
3. **Code review after each chunk:** `/test-smart` + manual checklist
4. **Run quality gates (10 min):** ESLint + pre-commit
5. **Verify tests pass (10 min):** Full suite for endpoint
6. **Commit (5 min):** `/log-change` + structured commit message

### Endpoint 2: GET /api/funds/:fundId/portfolio/snapshots (cursor pagination)

**Time:** ~1.5 hours

**Key Implementation Points:**

- Use `CursorPaginationSchema` for validation
- Call `snapshotService.listSnapshots(fundId, pagination)`
- Return `{ items, hasMore, nextCursor }`
- Include `Link` header for next page (RFC 5988)

**Tests:**

- Happy path with pagination
- Empty cursor (first page)
- With cursor (subsequent pages)
- Invalid cursor format (400)
- Limit clamping (max 100)

### Endpoint 3: GET /api/snapshots/:snapshotId (status polling)

**Time:** ~1 hour

**Key Implementation Points:**

- Validate UUID format
- Call `snapshotService.getSnapshot(id)`
- Return snapshot with version for optimistic locking
- 404 if not found

**Tests:**

- Happy path (snapshot found)
- 404 if not found
- Invalid UUID format (400)

### Endpoint 4: POST /api/funds/:fundId/portfolio/lots (idempotent)

**Time:** ~1.5 hours

**Key Implementation Points:**

- Idempotency middleware (same as snapshots)
- Validate lot data (companyName, investmentDate, etc.)
- Create via `lotService.createLot()`
- Return 201 Created

**Tests:**

- Happy path
- Idempotency (duplicate key returns cached)
- Validation errors (400)
- Missing fund (404)

### Endpoint 5: GET /api/funds/:fundId/portfolio/lots (filtering + pagination)

**Time:** ~2 hours (most complex)

**Key Implementation Points:**

- Cursor pagination + filters (status, dateRange)
- Validate all query params with Zod
- Call `lotService.listLots(fundId, { filters, pagination })`
- Return paginated results

**Tests:**

- Pagination (cursor + limit)
- Filter by status
- Filter by date range
- Combined filters + pagination
- Invalid filter values (400)

### Endpoint 6: PUT /api/snapshots/:snapshotId (optimistic locking)

**Time:** ~1.5 hours

**Key Implementation Points:**

- Require `If-Match: version` header (ETag pattern)
- Validate version is integer
- Call `snapshotService.updateSnapshot(id, version, changes)`
- Return 409 Conflict if version mismatch
- Return 200 with new version on success

**Tests:**

- Happy path (version matches)
- 409 Conflict (version mismatch)
- Missing If-Match header (428 Precondition Required)
- Invalid version format (400)
- 404 if snapshot not found

---

## Phase 6: Background Worker (2 hours)

**File:** `server/workers/snapshot-calculation-worker.ts`

```typescript
import { Worker, Job } from 'bullmq';
import { redis } from '../db/redis';
import { db } from '../db';
import { forecastSnapshots, portfolioLots } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

interface SnapshotJobData {
  snapshotId: string;
  fundId: number;
  correlationId: string;
}

/**
 * AP-QUEUE-02: Worker processes jobs with 5min timeout
 * AP-QUEUE-06: Progress tracking via Redis
 */
const worker = new Worker<SnapshotJobData>(
  'snapshot-calculation',
  async (job: Job<SnapshotJobData>) => {
    const { snapshotId, fundId, correlationId } = job.data;

    try {
      // 1. Update status to 'calculating'
      await updateSnapshotStatus(snapshotId, 'calculating');

      // 2. Fetch all lots for fund
      const lots = await db
        .select()
        .from(portfolioLots)
        .where(eq(portfolioLots.fundId, fundId));

      // 3. Calculate MOIC for each lot (stub for now)
      const metrics = lots.map((lot) => ({
        lotId: lot.id,
        moic: calculateMOIC(lot), // Stub implementation
      }));

      // 4. Update progress (50%)
      await job.updateProgress(50);

      // 5. Store results in snapshot
      await db
        .update(forecastSnapshots)
        .set({
          calculatedMetrics: { lots: metrics },
          status: 'complete',
          version: sql`${forecastSnapshots.version} + 1`,
        })
        .where(eq(forecastSnapshots.id, snapshotId));

      // 6. Update progress (100%)
      await job.updateProgress(100);

      return { success: true, lotCount: lots.length };
    } catch (error) {
      // 7. Mark snapshot as error
      await updateSnapshotStatus(snapshotId, 'error');
      throw error; // Triggers retry or DLQ
    }
  },
  {
    connection: redis,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 1000,
    },
  }
);

async function updateSnapshotStatus(
  snapshotId: string,
  status: 'calculating' | 'complete' | 'error'
) {
  await db
    .update(forecastSnapshots)
    .set({
      status,
      version: sql`${forecastSnapshots.version} + 1`,
    })
    .where(eq(forecastSnapshots.id, snapshotId));
}

function calculateMOIC(lot: any): number {
  // Stub: Return 1.0 (no gain/loss)
  // TODO: Implement actual MOIC calculation
  return 1.0;
}

// Event handlers for monitoring
worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed:`, job.returnvalue);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

export { worker as snapshotWorker };
```

**Tests:** `server/workers/__tests__/snapshot-calculation-worker.test.ts`

---

## Phase 7: Comprehensive Testing (4 hours)

### Critical Tests (18 scenarios - Must Pass)

#### Cursor Pagination (6 tests)

```typescript
describe('Cursor Pagination', () => {
  it('returns first page with hasMore=true if more results exist');
  it('returns subsequent page using nextCursor');
  it('returns hasMore=false on last page');
  it('prevents page drift during concurrent inserts (compound cursor)');
  it('clamps limit to max 100 (AP-CURSOR-04)');
  it('rejects invalid cursor format (AP-CURSOR-02)');
});
```

#### Idempotency (3 tests)

```typescript
describe('Idempotency', () => {
  it('returns cached result if idempotency key exists within 24hr TTL');
  it('creates new resource if key expired (>24hr)');
  it('handles race condition: concurrent requests with same key (AP-IDEM-03)');
});
```

#### Optimistic Locking (3 tests)

```typescript
describe('Optimistic Locking', () => {
  it('returns 409 Conflict if version mismatch');
  it('includes Retry-After header in 409 response (AP-LOCK-04)');
  it('increments version on successful update');
});
```

#### BullMQ (3 tests)

```typescript
describe('BullMQ Queue', () => {
  it('job times out after 5 minutes (AP-QUEUE-02)');
  it('job retries 3 times with exponential backoff');
  it('job moves to dead letter queue after max retries (AP-QUEUE-04)');
});
```

#### Security (3 tests)

```typescript
describe('Security', () => {
  it('prevents SQL injection in cursor values (AP-CURSOR-06)');
  it('validates all user input with Zod schemas');
  it('does not expose internal sequential IDs (AP-CURSOR-03)');
});
```

### Integration Tests (12 scenarios)

**Setup:** Testcontainers (PostgreSQL + Redis)

```typescript
// tests/integration/portfolio-workflow.test.ts
import { GenericContainer } from 'testcontainers';

describe('Portfolio Workflow (Integration)', () => {
  let postgres: StartedTestContainer;
  let redis: StartedTestContainer;

  beforeAll(async () => {
    postgres = await new GenericContainer('postgres:15')
      .withExposedPorts(5432)
      .start();

    redis = await new GenericContainer('redis:7')
      .withExposedPorts(6379)
      .start();
  });

  it('full snapshot creation workflow', async () => {
    // 1. Create snapshot via API
    const createRes = await request(app)
      .post('/api/funds/1/portfolio/snapshots')
      .set('Idempotency-Key', uuid())
      .send({ name: 'Integration Test' });

    expect(createRes.status).toBe(202);

    // 2. Poll status until complete
    const snapshotId = createRes.body.snapshotId;
    let status = 'pending';

    while (status === 'pending' || status === 'calculating') {
      await new Promise((resolve) => setTimeout(resolve, 500));

      const statusRes = await request(app).get(`/api/snapshots/${snapshotId}`);

      status = statusRes.body.status;
    }

    expect(status).toBe('complete');

    // 3. Verify calculated metrics exist
    const finalSnapshot = await request(app).get(
      `/api/snapshots/${snapshotId}`
    );

    expect(finalSnapshot.body.calculatedMetrics).toBeDefined();
    expect(finalSnapshot.body.calculatedMetrics.lots).toBeInstanceOf(Array);
  });

  // 11 more scenarios...
});
```

### Chaos Tests (8 scenarios)

```typescript
describe('Chaos Testing', () => {
  it('handles Redis restart gracefully');
  it('handles database connection loss');
  it('handles slow database queries (>5s timeout)');
  it('handles network partition between API and DB');
  it('handles disk full during write');
  it('recovers from worker timeout (5min limit)');
  it('processes jobs after worker crash');
  it('maintains data consistency during concurrent writes');
});
```

---

## Quality Gate Summary

### Pre-Implementation Checklist

- [ ] Database indexes designed (compound cursor, idempotency TTL)
- [ ] Version fields are `bigint` (not `integer`)
- [ ] ESLint anti-pattern rules configured (16+ rules)
- [ ] Pre-commit hooks active (8+ checks)
- [ ] VS Code snippets available (5 patterns)
- [ ] CAPABILITIES.md reviewed for existing agents
- [ ] Anti-pattern catalog reviewed (24 patterns)

### During Implementation (Every 10-20 Lines)

- [ ] All `JSON.parse()` wrapped in try-catch
- [ ] All async calls have error handlers
- [ ] No hardcoded limits (use Zod schema defaults)
- [ ] Correlation IDs in all errors
- [ ] No `FOR UPDATE` in queries (optimistic locking only)
- [ ] Queue jobs have retry policy + timeout
- [ ] Lock timeout configured (if using transactions)
- [ ] `/test-smart` after each chunk
- [ ] `/fix-auto` for lint issues

### Pre-Commit (Automated)

- [ ] ESLint passes (0 warnings)
- [ ] Pre-commit hook passes (8+ checks)
- [ ] TypeScript strict mode passes
- [ ] No silent catch blocks
- [ ] All tests pass
- [ ] `/log-change` updates CHANGELOG.md
- [ ] Commit message follows format

### CI/CD (Continuous)

- [ ] Anti-pattern gate workflow passes
- [ ] Test coverage ≥ 90%
- [ ] Performance thresholds met (p95 < 200ms)
- [ ] Load tests pass (1000 req/sec)
- [ ] No security vulnerabilities (Trivy scan)

---

## Time Estimates

| Phase                   | Duration        | Key Deliverables                                         |
| ----------------------- | --------------- | -------------------------------------------------------- |
| 0. Pre-Flight           | 15 min          | Capabilities checked, anti-patterns reviewed             |
| 1. Quality Gates        | 3-4 hours       | ESLint rules, pre-commit hooks, snippets                 |
| 2. Pattern Adaptation   | 1.5 hours       | 4 adapted patterns (cursor, idempotency, locking, queue) |
| 2.5. Service Layer      | 1 hour          | SnapshotService + tests                                  |
| 3. Wire Up & Test       | 0.5 hours       | Routes mounted, 501 responses tested                     |
| 4. First Endpoint (TDD) | 2.5 hours       | POST /snapshots working with tests                       |
| 5. Endpoints 2-6        | 6-8 hours       | All 6 endpoints complete                                 |
| 6. Background Worker    | 2 hours         | Job processing working                                   |
| 7. Testing              | 4 hours         | All quality gates passing                                |
| **Total**               | **20-23 hours** | **Production-ready API**                                 |

---

## Success Criteria

- [x] All 6 endpoints implemented and tested
- [x] **Zero of 24 anti-patterns** present in code
- [x] All quality gates passing (ESLint, pre-commit, CI/CD)
- [x] Test coverage ≥ 90%
- [x] All 35+ test scenarios passing
- [x] Idempotency verified (duplicate requests work)
- [x] Cursor pagination working (10k+ records)
- [x] Optimistic locking working (409 on conflicts)
- [x] Background jobs processing snapshots
- [x] Status transitions validated (monotonic: pending → calculating →
  complete/error)
- [x] Performance targets met (p95 < 200ms)

---

## Key Benefits

### Zero Anti-Patterns

4-layer quality gate prevents all 24 identified issues:

- Layer 1: ESLint (< 5s feedback)
- Layer 2: Pre-commit hooks (< 30s)
- Layer 3: IDE snippets (instant)
- Layer 4: CI/CD workflows (< 5min)

### Fast Feedback

- ESLint catches issues in < 5 seconds
- Pre-commit hooks run in < 30 seconds
- `/test-smart` runs only affected tests
- `/fix-auto` auto-fixes lint issues

### Proven Patterns

- Adapting battle-tested code from cheatsheets
- Service layer isolation for testability
- Compound cursors prevent page drift
- Database-backed idempotency with TTL

### Comprehensive Testing

- 35+ scenarios cover all edge cases
- Service tests (mock DB, test logic)
- API tests (mock service, test HTTP)
- Integration tests (real DB, end-to-end)
- Chaos tests (resilience validation)

### Developer Experience

- Code snippets reduce boilerplate
- Auto-fix for common issues
- Quality gates catch bugs early
- Clear commit messages with `/log-change`

### Continuous Validation

- CI/CD ensures quality never degrades
- Performance monitoring (p95 < 200ms)
- Security scanning (Trivy)
- Coverage tracking (≥ 90%)

---

## Cross-References

- **Anti-Pattern Prevention:**
  [cheatsheets/anti-pattern-prevention.md](cheatsheets/anti-pattern-prevention.md)
- **Service Testing:**
  [cheatsheets/service-testing-patterns.md](cheatsheets/service-testing-patterns.md)
- **Daily Workflow:**
  [cheatsheets/daily-workflow.md](cheatsheets/daily-workflow.md)
- **Memory Commands:**
  [cheatsheets/memory-commands.md](cheatsheets/memory-commands.md)
- **Agent Architecture:**
  [cheatsheets/agent-architecture.md](cheatsheets/agent-architecture.md)
- **Capabilities:** [CAPABILITIES.md](CAPABILITIES.md)

---

## Next Steps

1. **Review this strategy** with `/superpowers:brainstorm` for design validation
2. **Check CAPABILITIES.md** for existing portfolio/MOIC agents
3. **Start Phase 0** (pre-flight verification)
4. **Follow the plan** phase by phase with quality gates
5. **Use agents** (waterfall-specialist, test-repair, architect-review)
6. **Document progress** with `/log-change` after each commit

**Remember:** Quality is mandatory, not optional. Every shortcut today is
tomorrow's P1 incident.
