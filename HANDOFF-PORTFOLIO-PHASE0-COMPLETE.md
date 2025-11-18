# Portfolio API Phase 0 - Complete Handoff Memo

**Date**: 2025-11-09 **From**: Design & Planning Session **To**: Implementation
Session **Branch**: `feat/portfolio-lot-moic-schema` **Status**: READY FOR
IMPLEMENTATION (Plan approved, infrastructure fixes designed)

---

## Executive Summary

**Mission**: Complete Phase 0 of Portfolio API implementation (forecast
snapshots + investment lots routes)

**Current State**: 15% complete (excellent scaffolding, zero business logic)

- Route files exist: `server/routes/portfolio/{index,snapshots,lots}.ts`
- Comprehensive Zod schemas: `shared/schemas/portfolio-route.ts` (473 LOC)
- Database tables exist with proper structure
- Test template ready: `tests/api/portfolio-route.template.test.ts` (741 LOC)

**Strategy**: ENHANCE existing scaffolding (not replace) - Quality score: 9/10

**Estimated Effort**: 24 hours (~3 work days) for production-grade
implementation

---

## Critical Context from Planning Session

### Capabilities Available (264 Total)

- **22 Project Agents**: db-migration, test-repair, code-explorer,
  waterfall-specialist, test-automator
- **28 Superpowers Skills**: using-superpowers, brainstorming,
  test-driven-development, systematic-debugging, verification-before-completion
- **15 MCP Tools**: Multi-AI collaboration (Gemini, OpenAI, DeepSeek),
  NotebookLM
- **7 Slash Commands**: /test-smart, /fix-auto, /deploy-check
- **8 Agent Packages**: @povc/agent-core, @povc/test-repair-agent,
  @updog/memory-manager

### Mandatory Workflows (Enforced by using-superpowers skill)

1. Check CAPABILITIES.md BEFORE implementing anything
2. Use Skill tool before announcing skill usage
3. Follow brainstorming before coding
4. Create TodoWrite todos for checklists
5. Follow test-driven-development (RED-GREEN-REFACTOR)
6. Use verification-before-completion before claiming done

### Code-Explorer Analysis Results

- **Implementation Status**: 15% complete (scaffolding only, all 501 stubs)
- **Anti-Pattern Violations Identified**: 12 (all in TODOs, documented below)
- **Missing Components**: Service layer, database queries, BullMQ workers,
  integration tests
- **Recommendation**: ENHANCE (not replace) existing high-quality scaffolding

---

## Production-Grade Improvements (From Design Review)

### 1. Database Schema Hardening

**Version Columns** (AP-LOCK-02 compliance):

```sql
-- Change from integer to bigint (overflow protection)
ALTER TABLE forecast_snapshots ALTER COLUMN version TYPE bigint;
ALTER TABLE investment_lots ALTER COLUMN version TYPE bigint;
ALTER TABLE reserve_allocations ALTER COLUMN version TYPE bigint;

-- Add NOT NULL DEFAULT for safety
ALTER TABLE forecast_snapshots ALTER COLUMN version SET NOT NULL;
ALTER TABLE forecast_snapshots ALTER COLUMN version SET DEFAULT 0;
-- Repeat for other tables
```

**Cursor Pagination Indexes** (AP-CURSOR-01 compliance):

```sql
-- Compound indexes for stable ordering
CREATE INDEX idx_snapshots_cursor
  ON forecast_snapshots(snapshot_time DESC, id DESC);

CREATE INDEX idx_lots_cursor
  ON investment_lots(created_at DESC, id DESC);

-- Add NOT NULL DEFAULT for timestamp stability
ALTER TABLE forecast_snapshots
  ALTER COLUMN snapshot_time SET NOT NULL,
  ALTER COLUMN snapshot_time SET DEFAULT now();
```

**Scoped Idempotency Indexes** (AP-IDEM-03 compliance):

```sql
-- Add columns if missing
ALTER TABLE forecast_snapshots ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE investment_lots ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Fund-scoped unique constraints (NOT global)
CREATE UNIQUE INDEX IF NOT EXISTS ux_snapshots_fund_idem
  ON forecast_snapshots(fund_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_lots_investment_idem
  ON investment_lots(investment_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Length constraint for sanity
ALTER TABLE forecast_snapshots
  ADD CONSTRAINT chk_idem_len
  CHECK (idempotency_key IS NULL OR length(idempotency_key) BETWEEN 1 AND 128);

ALTER TABLE investment_lots
  ADD CONSTRAINT chk_idem_len
  CHECK (idempotency_key IS NULL OR length(idempotency_key) BETWEEN 1 AND 128);
```

**Tuple Predicate for Cursor Queries** (Prefer this over simple ID comparison):

```sql
-- Efficient seek method
WHERE (snapshot_time, id) < ($cursor_snapshot_time, $cursor_id)
ORDER BY snapshot_time DESC, id DESC
LIMIT $page_size;
```

### 2. Idempotency Middleware Robustness

**File**: `server/middleware/idempotency.ts`

**Critical Fix 1: Atomic PENDING Lock** (Race condition in current
implementation):

```typescript
// After retrieveResponse returns null
const lockKey = `${key}:lock`;
const locked = await redis.set(lockKey, 'PENDING', 'EX', 30, 'NX');

if (!locked) {
  // Another request is processing this key
  return res.setHeader('Retry-After', '30').status(409).json({
    error: 'request_in_progress',
    message: 'Request with this idempotency key is currently being processed',
    retryAfter: 30,
  });
}

// IMPORTANT: Clean up lock in finally block
try {
  // Call next() and process request
  next();
} finally {
  // Prevent lock leaks if request aborted
  await redis.del(lockKey);
}
```

**Critical Fix 2: Stable Request Fingerprinting**:

```typescript
function stableStringify(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as any).sort());
}

function generateFingerprint(req: Request): string {
  return createHash('sha256')
    .update(
      req.method + '|' + req.originalUrl + '|' + stableStringify(req.body)
    )
    .digest('hex');
}

// When storing response
const fingerprint = generateFingerprint(req);
await storeResponse(key, { ...response, fingerprint, statusCode, headers });

// When retrieving response
if (cached.fingerprint !== generateFingerprint(req)) {
  return res.status(422).json({
    error: 'idempotency_key_reused',
    message: 'Idempotency key used with different request payload',
  });
}

// On replay, add headers
res.setHeader('Idempotency-Replay', 'true');
res.setHeader('Idempotency-Key', idempotencyKey);
```

**Fix 3: LRU Cache Eviction** (Current is FIFO):

```typescript
// In MemoryIdempotencyStore.get()
if (this.cache.has(key)) {
  const value = this.cache.get(key)!;
  this.cache.delete(key); // Re-insert to move to end (LRU)
  this.cache.set(key, value);
  return value;
}
```

**Response Semantics Table**:

| Situation                         | Status  | Headers                    | Notes                   |
| --------------------------------- | ------- | -------------------------- | ----------------------- |
| Same key, same payload, completed | 200/201 | `Idempotency-Replay: true` | Replay from Redis       |
| Same key, in-flight               | 409     | `Retry-After: 30`          | PENDING lock held       |
| Same key, different payload       | 422     | -                          | Fingerprint mismatch    |
| No key on required route          | 400     | -                          | Validation failure      |
| Redis miss, DB hit                | 200     | -                          | Return existing from DB |

### 3. Opaque Cursor Implementation

**Never expose column details to clients**:

```typescript
// Encoding
function encodeCursor(snapshot_time: Date, id: string): string {
  return Buffer.from(JSON.stringify({ snapshot_time, id })).toString('base64');
}

// Decoding
function decodeCursor(cursor: string): { snapshot_time: Date; id: string } {
  const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
  return {
    snapshot_time: new Date(decoded.snapshot_time),
    id: decoded.id,
  };
}

// Usage in route
const hasMore = snapshots.length > limit;
const items = hasMore ? snapshots.slice(0, limit) : snapshots;
const nextCursor = hasMore
  ? encodeCursor(
      items[items.length - 1].snapshotTime,
      items[items.length - 1].id
    )
  : undefined;

return res.json({
  snapshots: items,
  pagination: { nextCursor, hasMore },
});
```

### 4. Service Layer Result Shapes

**Type-safe service responses**:

```typescript
type Created<T> = {
  status: 201 | 200; // 201 = new, 200 = duplicate
  resource: T;
  idempotencyKey?: string;
  created: boolean; // Helps middleware know if to cache
};

type Updated<T> = {
  status: 200 | 409; // 409 = version conflict
  resource?: T;
  conflict?: { expectedVersion: number; actualVersion: number };
};

type Paginated<T> = {
  items: T[];
  pagination: {
    nextCursor?: string;
    hasMore: boolean;
  };
};
```

### 5. BullMQ Production Setup

**Queue Configuration**:

```typescript
// server/queues/snapshot-queue.ts
import { Queue, QueueScheduler } from 'bullmq';

// CRITICAL: Instantiate scheduler for retries
const scheduler = new QueueScheduler('snapshot-calculations', {
  connection: redisConnection,
});

const queue = new Queue('snapshot-calculations', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    timeout: 300000, // 5 min
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

// Job idempotency via jobId
export async function enqueueSnapshotCalculation(snapshotId: string) {
  await queue.add(
    'calculate-snapshot',
    { snapshotId },
    { jobId: `snapshot:${snapshotId}` } // Prevents duplicate jobs
  );
}
```

**Worker Configuration**:

```typescript
// server/workers/snapshot-calculation-worker.ts
const worker = new Worker(
  'snapshot-calculations',
  async (job: Job) => {
    const { snapshotId } = job.data;

    await updateSnapshotStatus(snapshotId, 'calculating');

    for (let i = 0; i < 100; i += 10) {
      await job.updateProgress({ current: i, total: 100 });
      // Calculation logic here
    }

    await updateSnapshotStatus(snapshotId, 'complete', metrics);
  },
  {
    connection: redisConnection,
    concurrency: 4, // Parallel workers
  }
);

worker.on('failed', async (job, err) => {
  if (job) {
    await updateSnapshotStatus(job.data.snapshotId, 'error');
  }
});
```

**Outbox-Lite Pattern** (Enqueue after DB commit):

```typescript
// In route handler
const snapshot = await db.transaction(async (tx) => {
  const [created] = await tx
    .insert(forecastSnapshots)
    .values({ ...data })
    .returning();

  return created;
});

// After successful commit
try {
  await enqueueSnapshotCalculation(snapshot.id);
} catch (err) {
  // Job enqueue failed, but snapshot created
  // Reconciler will pick up status='pending' snapshots
  logger.error('Failed to enqueue snapshot job', {
    snapshotId: snapshot.id,
    err,
  });
}

return res.status(202).json({
  snapshot,
  statusUrl: `/api/snapshots/${snapshot.id}`,
});
```

### 6. Observability & Metrics

**Prometheus Metrics to Add**:

```typescript
import { Counter } from 'prom-client';

export const idempotencyMetrics = {
  replayCount: new Counter({
    name: 'idem_replay_count',
    help: 'Number of idempotent request replays',
    labelNames: ['route'],
  }),

  inflightConflicts: new Counter({
    name: 'idem_inflight_conflicts',
    help: 'Number of in-flight idempotency conflicts (409)',
    labelNames: ['route'],
  }),

  fingerprintMismatches: new Counter({
    name: 'idem_fp_mismatch',
    help: 'Number of fingerprint mismatches (422)',
    labelNames: ['route'],
  }),

  dbConflicts: new Counter({
    name: 'db_idem_conflicts',
    help: 'Number of database idempotency conflicts',
    labelNames: ['table'],
  }),

  queueEnqueueFailures: new Counter({
    name: 'queue_enqueue_fail',
    help: 'Number of failed BullMQ job enqueues',
    labelNames: ['queue'],
  }),
};
```

**Structured Logging** (Never log full bodies):

```typescript
logger.info('Idempotent request processed', {
  tenantId: req.user?.tenantId,
  route: req.path,
  fingerprintHash: generateFingerprint(req).substring(0, 8), // First 8 chars only
  idempotencyKeyPrefix: idempotencyKey?.substring(0, 8),
  replay: !!cached,
  statusCode: res.statusCode,
});
```

### 7. Enhanced Test Coverage

**Required Test Scenarios** (Add to template):

```typescript
describe('Idempotency - Production Scenarios', () => {
  it('should replay response with Idempotency-Replay header', async () => {
    const key = randomUUID();
    const payload = { name: 'Test Snapshot' };

    const res1 = await request(app)
      .post('/api/funds/1/portfolio/snapshots')
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(201);

    const res2 = await request(app)
      .post('/api/funds/1/portfolio/snapshots')
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(200);

    expect(res2.headers['idempotency-replay']).toBe('true');
    expect(res2.body).toEqual(res1.body);
  });

  it('should return 409 for in-flight duplicate', async () => {
    const key = randomUUID();

    // Start first request (slow handler)
    const req1 = request(app)
      .post('/api/funds/1/portfolio/snapshots')
      .set('Idempotency-Key', key)
      .send({ name: 'Slow' });

    // Immediately start second request
    const req2 = request(app)
      .post('/api/funds/1/portfolio/snapshots')
      .set('Idempotency-Key', key)
      .send({ name: 'Slow' });

    const results = await Promise.allSettled([req1, req2]);

    const statuses = results.map((r) =>
      r.status === 'fulfilled' ? r.value.status : null
    );
    expect(statuses).toContain(409);
    expect(statuses).toContain(201);
  });

  it('should return 422 for fingerprint mismatch', async () => {
    const key = randomUUID();

    await request(app)
      .post('/api/funds/1/portfolio/snapshots')
      .set('Idempotency-Key', key)
      .send({ name: 'Original' })
      .expect(201);

    await request(app)
      .post('/api/funds/1/portfolio/snapshots')
      .set('Idempotency-Key', key)
      .send({ name: 'Different' }) // Different payload
      .expect(422);
  });

  it('should handle Redis miss + DB hit gracefully', async () => {
    const key = randomUUID();

    const res1 = await request(app)
      .post('/api/funds/1/portfolio/snapshots')
      .set('Idempotency-Key', key)
      .send({ name: 'Test' })
      .expect(201);

    // Expire Redis cache
    await redis.del(`idempotency:${key}`);

    // Request again - should fetch from DB
    const res2 = await request(app)
      .post('/api/funds/1/portfolio/snapshots')
      .set('Idempotency-Key', key)
      .send({ name: 'Test' })
      .expect(200);

    expect(res2.body.id).toBe(res1.body.id);
  });
});

describe('Optimistic Locking - Production Scenarios', () => {
  it('should return 409 with current version on conflict', async () => {
    const snapshot = await createTestSnapshot();

    const res = await request(app)
      .put(`/api/snapshots/${snapshot.id}`)
      .send({
        name: 'Updated',
        version: 999, // Wrong version
      })
      .expect(409);

    expect(res.body).toMatchObject({
      error: 'version_conflict',
      expectedVersion: 999,
      actualVersion: snapshot.version,
    });
  });
});

describe('Cursor Pagination - Edge Cases', () => {
  it('should not return nextCursor on last page', async () => {
    await createTestSnapshots(15);

    const res = await request(app)
      .get('/api/funds/1/portfolio/snapshots?limit=20')
      .expect(200);

    expect(res.body.pagination.hasMore).toBe(false);
    expect(res.body.pagination.nextCursor).toBeUndefined();
  });

  it('should handle timestamp ties with ID tiebreaker', async () => {
    const time = new Date();
    await createTestSnapshot({ snapshotTime: time });
    await createTestSnapshot({ snapshotTime: time });

    const res = await request(app)
      .get('/api/funds/1/portfolio/snapshots?limit=1')
      .expect(200);

    expect(res.body.snapshots).toHaveLength(1);
    expect(res.body.pagination.hasMore).toBe(true);

    // Fetch second page
    const res2 = await request(app)
      .get(
        `/api/funds/1/portfolio/snapshots?limit=1&cursor=${res.body.pagination.nextCursor}`
      )
      .expect(200);

    expect(res2.body.snapshots).toHaveLength(1);
    expect(res2.body.snapshots[0].id).not.toBe(res.body.snapshots[0].id);
  });
});
```

---

## Anti-Pattern Violations (12 Total - To Be Fixed)

### Critical (Must Fix in Phase 0):

**AP-IDEM-03: Race Conditions in Idempotency Checks**

- Location: `snapshots.ts:84`, `lots.ts:86`
- Fix: Use `onConflictDoNothing()` with unique index
- Status: Design complete (see Section 2)

**AP-LOCK-03: Missing Version Check in Updates**

- Location: `snapshots.ts:188`
- Fix: Add `eq(forecastSnapshots.version, expectedVersion)` to WHERE clause
- Status: Design complete

**AP-CURSOR-02: No Cursor Validation**

- Location: `snapshots.ts:116`, `lots.ts:117`
- Fix: Validate cursor format before SQL (opaque base64)
- Status: Design complete (see Section 3)

**AP-QUEUE-01: Infinite Retries**

- Location: Snapshot creation (no worker exists yet)
- Fix: Configure max 3 attempts with exponential backoff
- Status: Design complete (see Section 5)

**AP-QUEUE-02: Missing Timeout**

- Location: Worker implementation (doesn't exist)
- Fix: Add `timeout: 300000` (5 min)
- Status: Design complete

### High (Fix in Phase 1):

**AP-CURSOR-04: Limit Clamping**

- Fix: Enforce `Math.min(limit, 100)` in query
- Status: Schema has clamping, enforce in query too

**AP-CURSOR-05: Race Conditions (Page Drift)**

- Fix: Use compound ORDER BY with ID tiebreaker
- Status: Design complete

**AP-LOCK-04: No Retry Guidance**

- Fix: Add `Retry-After` header to 409 responses
- Status: Design complete

**AP-IDEM-02: Missing TTL**

- Fix: Add background cleanup job for old keys
- Status: Deferred to Phase 1+

**AP-IDEM-07: Response Mismatch**

- Fix: Return `{ resource, created: boolean }` from services
- Status: Design complete (see Section 4)

**AP-QUEUE-06: No Progress Tracking**

- Fix: Implement `job.updateProgress()` and Redis storage
- Status: Design complete

---

## Implementation Plan (24 Hours Total)

### Phase 0A: Infrastructure (3.5 hours)

1. Database schema hardening (1.5h)
   - Version columns → bigint
   - Cursor indexes
   - Scoped idempotency indexes
   - Length constraints
   - Timestamp NOT NULL defaults

2. Idempotency middleware fixes (2h)
   - Atomic PENDING lock
   - Stable fingerprinting
   - LRU cache eviction
   - Response headers

### Phase 0B: Dependencies & Tooling (2 hours)

3. Install Testcontainers (5 min)
4. Create VS Code snippets (30 min)
   - cursor-pagination
   - idempotent-create
   - optimistic-update
   - bullmq-worker
   - cursor-seek (opaque cursor helper)
5. Mount portfolio router (5 min)
6. Add observability metrics (1h)

### Phase 1: Service Layer (4.5 hours)

7. SnapshotService implementation (2.5h)
   - TDD cycle for each method
   - Opaque cursor encoding/decoding
   - Status transition validation
8. LotService implementation (1.5h)
9. FundValidationService (30 min)

### Phase 2: BullMQ Workers (4 hours)

10. Queue + scheduler setup (1h)
11. Worker implementation (2h)
    - Progress tracking
    - Status transitions
    - Error handling
12. Outbox-lite pattern (1h)

### Phase 3: Route Integration (2 hours)

13. Replace TODOs with service calls
14. Add proper error responses
15. Add observability logging

### Phase 4: Integration Tests (7 hours)

16. Test utilities (2h)
17. Snapshot tests (3h)
    - All scenarios from Section 7
18. Lot tests (2h)

### Phase 5: Quality Validation (1 hour)

19. Run /test-smart
20. Run /deploy-check
21. Verify anti-pattern checklist
22. Update CHANGELOG.md

---

## Quality Gates & Checkpoints

### After Each Service Method:

```bash
/test-smart     # Affected tests only
/fix-auto       # Lint/type cleanup
```

### Before Each Commit:

```bash
npm run check   # TypeScript validation
npm test        # Full suite
```

### Before Claiming Phase 0 Complete:

```bash
/deploy-check                  # 8-phase validation
npm run check                  # TypeScript strict
npm test -- --coverage         # ≥90% coverage
```

### Anti-Pattern Compliance Checklist:

- [ ] All cursor pagination uses tuple predicate + ID tiebreaker
- [ ] All cursor responses use opaque base64 encoding
- [ ] All POST endpoints use `onConflictDoNothing()`
- [ ] All PUT endpoints check version in WHERE clause
- [ ] All BullMQ jobs have jobId for dedupe
- [ ] All BullMQ jobs have timeout + retry config
- [ ] Idempotency middleware has PENDING lock
- [ ] Idempotency middleware has fingerprinting
- [ ] Idempotency middleware has Retry-After header
- [ ] All timestamps are NOT NULL DEFAULT now()
- [ ] Version columns are bigint NOT NULL DEFAULT 0

---

## Next Session Start Checklist

**BEFORE writing any code:**

1. [ ] Invoke `using-superpowers` skill (MANDATORY)
2. [ ] Check CAPABILITIES.md for existing solutions
3. [ ] Review this handoff memo completely
4. [ ] Verify branch: `feat/portfolio-lot-moic-schema`
5. [ ] Confirm untracked files: `server/routes/portfolio/*.ts`
6. [ ] Create TodoWrite todos for all phases

**First implementation task:**

```bash
# Launch db-migration agent for schema fixes
Task("db-migration", {
  goal: "Apply production-grade schema hardening",
  files: [
    "shared/schema.ts",
    "See HANDOFF memo Section 1 for exact SQL"
  ]
})
```

**TDD Workflow (Enforced by skills):**

1. RED: Write failing test
2. GREEN: Minimal implementation
3. REFACTOR: Improve design
4. Code review checkpoint every 10-20 lines
5. /test-smart after each change

---

## File Locations Reference

### Route Files (Current):

- `server/routes/portfolio/index.ts` (241 bytes) - Router composition
- `server/routes/portfolio/snapshots.ts` (5,643 bytes) - 4 endpoints, all 501
- `server/routes/portfolio/lots.ts` (3,837 bytes) - 2 endpoints, all 501

### Schema Files (Complete):

- `shared/schemas/portfolio-route.ts` (473 LOC) - Request/response validation
- `shared/schema.ts` (lines 125-204) - Database tables

### Test Files:

- `tests/api/portfolio-route.template.test.ts` (741 LOC) - Comprehensive
  template
- `tests/utils/portfolio-route-test-utils.ts` - TO CREATE
- `tests/fixtures/portfolio-route-fixtures.ts` - TO CREATE

### Middleware:

- `server/middleware/idempotency.ts` (330 LOC) - NEEDS FIXES (Section 2)
- `server/middleware/async.ts` - Already used (asyncHandler)

### To Create:

- `server/services/snapshot-service.ts`
- `server/services/lot-service.ts`
- `server/services/fund-validation-service.ts`
- `server/queues/snapshot-queue.ts`
- `server/workers/snapshot-calculation-worker.ts`
- `.vscode/portfolio-api.code-snippets`

---

## Key Design Decisions Made

### 1. Idempotency Strategy: Two-Layer Approach

- **Layer 1**: Redis middleware (fast replay, PENDING lock)
- **Layer 2**: Database unique constraint (data integrity)
- **Rationale**: Defense-in-depth, handles both network retries and race
  conditions

### 2. Cursor Pagination: Opaque Base64

- **Format**: `btoa(JSON.stringify({snapshot_time, id}))`
- **Query**: Tuple predicate `WHERE (snapshot_time, id) < ($t, $id)`
- **Rationale**: Never expose column details, stable under concurrent writes

### 3. Service Layer: Type-Safe Result Shapes

- **Created<T>**: Returns `{status, resource, created}`
- **Updated<T>**: Returns `{status, resource?, conflict?}`
- **Paginated<T>**: Returns `{items, pagination: {nextCursor?, hasMore}}`
- **Rationale**: Explicit semantics, helps middleware caching

### 4. BullMQ: Outbox-Lite Pattern

- **Pattern**: DB commit first, then enqueue job
- **Fallback**: Reconciler scans `status='pending'` snapshots
- **Rationale**: Guarantees snapshot created even if queue fails

### 5. Observability: Metrics First

- **Metrics**: 5 counters (replay, conflicts, mismatches, DB conflicts, queue
  fails)
- **Logging**: Structured JSON, never full bodies
- **Rationale**: Debug production issues, monitor anti-pattern violations

---

## Critical Warnings

**DO NOT:**

- Skip using-superpowers skill (conversation will fail mandatory workflow
  checks)
- Implement database queries without `onConflictDoNothing()` (race conditions)
- Update without version WHERE clause (lost updates)
- Use integer cursors (exposed IDs, enumeration attacks)
- Enqueue BullMQ jobs without jobId (duplicate jobs)
- Skip Testcontainers dependency install (tests will fail)
- Commit without running /deploy-check (quality gate)

**DO:**

- Follow TDD cycle strictly (RED-GREEN-REFACTOR)
- Use /test-smart after EVERY change
- Code review checkpoint every 10-20 lines
- Log decisions in DECISIONS.md if changing approach
- Update CHANGELOG.md after each phase
- Verify anti-pattern checklist before committing

---

## Success Criteria (Phase 0 Complete)

**Functional:**

- [ ] All 6 endpoints return real data (no 501 responses)
- [ ] POST snapshot creates + queues BullMQ job
- [ ] Worker processes job and updates status to 'complete'
- [ ] GET snapshot shows progress during calculation
- [ ] Idempotency prevents duplicate creation (201 → 200 replay)
- [ ] Optimistic locking detects conflicts (409 with current version)
- [ ] Cursor pagination stable (no duplicates/skips under concurrent writes)

**Testing:**

- [ ] 20+ integration tests pass
- [ ] All scenarios from Section 7 covered
- [ ] Test coverage ≥ 90%
- [ ] Testcontainers setup working

**Quality:**

- [ ] Zero anti-pattern violations (all 12 fixed)
- [ ] All ESLint checks pass
- [ ] TypeScript strict mode passes
- [ ] /deploy-check passes (build, bundle, smoke, idempotency)
- [ ] Observability metrics implemented
- [ ] Structured logging in place

**Documentation:**

- [ ] CHANGELOG.md updated with Phase 0 completion
- [ ] DECISIONS.md updated if design changed
- [ ] Code comments explain non-obvious decisions
- [ ] VSCode snippets created and tested

---

## Estimated Timeline

**Optimistic (Senior Dev, TDD Expert)**: 20 hours **Realistic (Solid Dev,
Learning TDD)**: 24 hours **Conservative (Junior Dev, First Time)**: 32 hours

**Critical Path**: Infrastructure → Service Layer → Workers → Routes → Tests

**Suggested Schedule**:

- **Day 1**: Infrastructure + Service Layer (8h)
- **Day 2**: Workers + Route Integration (8h)
- **Day 3**: Integration Tests + Quality Validation (8h)

---

## Context from Planning Session

**Token Usage**: 130k/200k used (65% - comprehensive research phase)

- 5 parallel agents launched (code-explorer, skills, commands, MCP, memory)
- using-superpowers + brainstorming skills activated
- Two rounds of design feedback incorporated
- All 24 anti-patterns reviewed
- Production-grade improvements from expert review

**Key Insights**:

- Existing scaffolding is excellent quality (don't replace)
- 12 anti-pattern violations identified (all fixable)
- Two-layer idempotency is industry-standard approach
- Opaque cursors prevent enumeration attacks
- Outbox-lite ensures job reliability

**Recommendation**: Start fresh session with this memo, proceed with
implementation using TDD cycle and quality gates.

---

## Additional Resources

**Documentation**:

- Anti-pattern catalog: `cheatsheets/anti-pattern-prevention.md`
- Testing patterns: `cheatsheets/service-testing-patterns.md`
- Daily workflow: `cheatsheets/daily-workflow.md`
- Memory strategy: `cheatsheets/memory-commit-strategy.md`

**Agent Capabilities**:

- Full inventory: CAPABILITIES.md
- Agent architecture: `cheatsheets/agent-architecture.md`
- Memory integration: `cheatsheets/agent-memory-integration.md`

**Slash Commands**:

- /test-smart - Run affected tests only
- /fix-auto - Auto-repair lint/format/simple test failures
- /deploy-check - 8-phase pre-deployment validation
- /log-change - Update CHANGELOG.md
- /log-decision - Update DECISIONS.md

---

**END OF HANDOFF MEMO**

**Next session should start by reading this file completely, then invoking
using-superpowers skill and proceeding with Phase 0A (Infrastructure fixes).**
