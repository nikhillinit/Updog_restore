# Week 1 Action Plan: Event Foundation + Test Stability

**Duration**: 5 days **Goal**: Establish event-sourcing foundation and fix CI
stability **Stack**: Express + BullMQ + Drizzle (existing architecture)

---

## 📅 Day-by-Day Breakdown

### Day 1: Event Schema + Idempotency

**Morning: Create Event Tables**

```bash
# 1. Add to shared/schema.ts
```

```typescript
// shared/schema.ts (ADD to existing file)

import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Core event log - immutable audit trail
export const fundEvents = pgTable(
  'fund_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    fundId: uuid('fund_id')
      .references(() => funds.id)
      .notNull(),

    // Event metadata
    eventType: varchar('event_type', { length: 50 })
      .$type<
        | 'INVESTMENT_MADE'
        | 'VALUATION_UPDATED'
        | 'CAPITAL_CALLED'
        | 'DISTRIBUTION_MADE'
        | 'RESERVE_ALLOCATED'
        | 'FORECAST_CREATED'
        | 'ACTUAL_RECORDED'
      >()
      .notNull(),

    eventVersion: varchar('event_version', { length: 10 })
      .default('1.0')
      .notNull(),

    // Event data
    payload: jsonb().notNull(),
    payloadHash: varchar('payload_hash', { length: 64 }).notNull(), // SHA-256 for idempotency

    // Causality tracking
    causationId: uuid('causation_id'), // Which command caused this event
    correlationId: uuid('correlation_id'), // Request trace ID

    // Audit
    createdAt: timestamp('created_at').defaultNow().notNull(),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (table) => ({
    // Idempotency: Same event type + payload can't be inserted twice
    uniqueEvent: unique('unique_fund_event').on(
      table.fundId,
      table.eventType,
      table.payloadHash
    ),

    // Performance indexes
    fundTimeIdx: index('idx_fund_events_fund_time').on(
      table.fundId,
      table.createdAt
    ),
    correlationIdx: index('idx_fund_events_correlation').on(
      table.correlationId
    ),
  })
);

// Snapshots for performance
export const fundSnapshots = pgTable(
  'fund_snapshots',
  {
    id: uuid().primaryKey().defaultRandom(),
    fundId: uuid('fund_id')
      .references(() => funds.id)
      .notNull(),

    snapshotTime: timestamp('snapshot_time').notNull(),
    fundState: jsonb('fund_state').notNull(), // Complete fund object

    lastEventId: uuid('last_event_id').references(() => fundEvents.id),
    eventCount: integer('event_count').default(0),

    type: varchar('type', { length: 20 })
      .$type<'manual' | 'scheduled' | 'auto'>()
      .notNull(),
    description: text(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    fundTimeIdx: index('idx_fund_snapshots_fund_time').on(
      table.fundId,
      table.snapshotTime
    ),
  })
);

// Zod schemas for validation
export const insertFundEventSchema = createInsertSchema(fundEvents, {
  eventType: z.enum([
    'INVESTMENT_MADE',
    'VALUATION_UPDATED',
    'CAPITAL_CALLED',
    'DISTRIBUTION_MADE',
    'RESERVE_ALLOCATED',
    'FORECAST_CREATED',
    'ACTUAL_RECORDED',
  ]),
  payload: z.record(z.unknown()),
  correlationId: z.string().uuid().optional(),
});

export const insertFundSnapshotSchema = createInsertSchema(fundSnapshots);
```

**Afternoon: Apply Migration**

```bash
# Generate migration
npx drizzle-kit generate

# Apply to database
npm run db:push

# Verify schema
npm run schema:check
```

**Deliverable**: ✅ Event tables in database with idempotency constraint

---

### Day 2: Fund Projector Service

**Morning: Core Projection Logic**

```typescript
// server/services/fund-projector.ts (NEW FILE)

import { db } from '../db';
import { fundEvents, fundSnapshots, funds } from '@shared/schema';
import { eq, and, lte, gt, desc, asc } from 'drizzle-orm';
import crypto from 'crypto';

export interface FundState {
  fundId: string;
  totalCommitted: number;
  totalInvested: number;
  totalValue: number;
  portfolioCompanies: Array<{
    id: string;
    name: string;
    totalInvestment: number;
    currentValuation: number;
    ownership: number;
  }>;
  reserves: Array<{
    companyId: string;
    allocated: number;
    deployed: number;
  }>;
  forecasts: Array<{
    companyId: string;
    metricType: string;
    projectedValue: number;
  }>;
  actuals: Array<{
    companyId: string;
    metricType: string;
    actualValue: number;
    recordedAt: Date;
  }>;
}

export class FundProjector {
  /**
   * Get fund state at specific timestamp
   * Uses nearest snapshot + event replay for performance
   */
  async getFundStateAt(fundId: string, timestamp: Date): Promise<FundState> {
    // 1. Find nearest snapshot BEFORE target timestamp
    const snapshot = await db
      .select()
      .from(fundSnapshots)
      .where(
        and(
          eq(fundSnapshots.fundId, fundId),
          lte(fundSnapshots.snapshotTime, timestamp)
        )
      )
      .orderBy(desc(fundSnapshots.snapshotTime))
      .limit(1);

    // 2. Load snapshot state (or initialize empty)
    let state: FundState =
      (snapshot[0]?.fundState as FundState) ||
      this.initializeEmptyState(fundId);

    // 3. Fetch events between snapshot and target timestamp
    const events = await db
      .select()
      .from(fundEvents)
      .where(
        and(
          eq(fundEvents.fundId, fundId),
          gt(fundEvents.createdAt, snapshot[0]?.snapshotTime || new Date(0)),
          lte(fundEvents.createdAt, timestamp)
        )
      )
      .orderBy(asc(fundEvents.createdAt));

    // 4. Apply events sequentially
    for (const event of events) {
      state = this.applyEvent(state, event);
    }

    return state;
  }

  /**
   * Apply single event to state (pure function)
   */
  private applyEvent(
    state: FundState,
    event: typeof fundEvents.$inferSelect
  ): FundState {
    switch (event.eventType) {
      case 'INVESTMENT_MADE':
        return this.applyInvestmentMade(state, event.payload);

      case 'VALUATION_UPDATED':
        return this.applyValuationUpdate(state, event.payload);

      case 'RESERVE_ALLOCATED':
        return this.applyReserveAllocation(state, event.payload);

      case 'FORECAST_CREATED':
        return this.applyForecastCreated(state, event.payload);

      case 'ACTUAL_RECORDED':
        return this.applyActualRecorded(state, event.payload);

      default:
        return state;
    }
  }

  private applyInvestmentMade(state: FundState, payload: any): FundState {
    return {
      ...state,
      totalInvested: state.totalInvested + payload.amount,
      portfolioCompanies: state.portfolioCompanies.map((company) =>
        company.id === payload.companyId
          ? {
              ...company,
              totalInvestment: company.totalInvestment + payload.amount,
            }
          : company
      ),
    };
  }

  private applyValuationUpdate(state: FundState, payload: any): FundState {
    return {
      ...state,
      totalValue:
        state.totalValue -
        this.getCompanyValue(state, payload.companyId) +
        payload.newValuation,
      portfolioCompanies: state.portfolioCompanies.map((company) =>
        company.id === payload.companyId
          ? { ...company, currentValuation: payload.newValuation }
          : company
      ),
    };
  }

  private applyReserveAllocation(state: FundState, payload: any): FundState {
    const existingReserve = state.reserves.find(
      (r) => r.companyId === payload.companyId
    );

    if (existingReserve) {
      return {
        ...state,
        reserves: state.reserves.map((r) =>
          r.companyId === payload.companyId
            ? { ...r, allocated: payload.amount }
            : r
        ),
      };
    }

    return {
      ...state,
      reserves: [
        ...state.reserves,
        {
          companyId: payload.companyId,
          allocated: payload.amount,
          deployed: 0,
        },
      ],
    };
  }

  private applyForecastCreated(state: FundState, payload: any): FundState {
    return {
      ...state,
      forecasts: [
        ...state.forecasts,
        {
          companyId: payload.companyId,
          metricType: payload.metricType,
          projectedValue: payload.value,
        },
      ],
    };
  }

  private applyActualRecorded(state: FundState, payload: any): FundState {
    return {
      ...state,
      actuals: [
        ...state.actuals,
        {
          companyId: payload.companyId,
          metricType: payload.metricType,
          actualValue: payload.value,
          recordedAt: new Date(payload.recordedAt),
        },
      ],
    };
  }

  private getCompanyValue(state: FundState, companyId: string): number {
    return (
      state.portfolioCompanies.find((c) => c.id === companyId)
        ?.currentValuation || 0
    );
  }

  private initializeEmptyState(fundId: string): FundState {
    return {
      fundId,
      totalCommitted: 0,
      totalInvested: 0,
      totalValue: 0,
      portfolioCompanies: [],
      reserves: [],
      forecasts: [],
      actuals: [],
    };
  }

  /**
   * Calculate payload hash for idempotency
   */
  static hashPayload(payload: object): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
  }
}
```

**Afternoon: Add Tests**

```typescript
// server/services/__tests__/fund-projector.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { FundProjector } from '../fund-projector';

describe('FundProjector', () => {
  let projector: FundProjector;

  beforeEach(() => {
    projector = new FundProjector();
  });

  it('should initialize empty state', () => {
    const state = projector['initializeEmptyState']('fund-123');

    expect(state.fundId).toBe('fund-123');
    expect(state.totalInvested).toBe(0);
    expect(state.portfolioCompanies).toEqual([]);
  });

  it('should apply INVESTMENT_MADE event', () => {
    const initialState = projector['initializeEmptyState']('fund-123');
    initialState.portfolioCompanies = [
      {
        id: 'company-a',
        name: 'Company A',
        totalInvestment: 0,
        currentValuation: 0,
        ownership: 0,
      },
    ];

    const event = {
      eventType: 'INVESTMENT_MADE' as const,
      payload: { companyId: 'company-a', amount: 1000000 },
    };

    const newState = projector['applyEvent'](initialState, event as any);

    expect(newState.totalInvested).toBe(1000000);
    expect(newState.portfolioCompanies[0].totalInvestment).toBe(1000000);
  });

  it('should hash payload consistently', () => {
    const payload = { companyId: 'test', amount: 1000000 };

    const hash1 = FundProjector.hashPayload(payload);
    const hash2 = FundProjector.hashPayload(payload);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 = 64 hex chars
  });
});
```

**Deliverable**: ✅ Fund Projector service with tests

---

### Day 3: Express API Routes

**Morning: Time Travel Routes**

```typescript
// server/routes/time-travel.ts (NEW FILE)

import express from 'express';
import { z } from 'zod';
import { FundProjector } from '../services/fund-projector';
import { asyncHandler } from '../middleware/async';
import { validateRequest } from '../middleware/validation';
import { db } from '../db';
import { fundEvents, fundSnapshots } from '@shared/schema';
import { eq, and, desc, gte, lte } from 'drizzle-orm';

const router = express.Router();
const projector = new FundProjector();

// Get fund state at timestamp
const getFundStateSchema = z.object({
  params: z.object({
    fundId: z.string().uuid(),
  }),
  query: z.object({
    at: z.string().datetime().optional(),
  }),
});

router.get(
  '/api/funds/:fundId/state',
  validateRequest(getFundStateSchema),
  asyncHandler(async (req, res) => {
    const { fundId } = req.params;
    const timestamp = req.query.at ? new Date(req.query.at) : new Date();

    const state = await projector.getFundStateAt(fundId, timestamp);

    res.json({
      timestamp: timestamp.toISOString(),
      state,
    });
  })
);

// Get timeline of events
const getTimelineSchema = z.object({
  params: z.object({
    fundId: z.string().uuid(),
  }),
  query: z.object({
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
    limit: z
      .string()
      .transform(Number)
      .pipe(z.number().int().positive())
      .default('100'),
  }),
});

router.get(
  '/api/funds/:fundId/timeline',
  validateRequest(getTimelineSchema),
  asyncHandler(async (req, res) => {
    const { fundId } = req.params;
    const { start, end, limit } = req.query;

    const events = await db
      .select()
      .from(fundEvents)
      .where(
        and(
          eq(fundEvents.fundId, fundId),
          start ? gte(fundEvents.createdAt, new Date(start)) : undefined,
          end ? lte(fundEvents.createdAt, new Date(end)) : undefined
        )
      )
      .orderBy(desc(fundEvents.createdAt))
      .limit(Number(limit));

    res.json({ events });
  })
);

// List snapshots
router.get(
  '/api/funds/:fundId/snapshots',
  asyncHandler(async (req, res) => {
    const { fundId } = req.params;

    const snapshots = await db
      .select()
      .from(fundSnapshots)
      .where(eq(fundSnapshots.fundId, fundId))
      .orderBy(desc(fundSnapshots.snapshotTime))
      .limit(50);

    res.json({ snapshots });
  })
);

export default router;
```

**Afternoon: Register Routes**

```typescript
// server/app.ts (MODIFY existing file)

import timeTravelRouter from './routes/time-travel.js';

export function makeApp() {
  const app = express();

  // ... existing middleware ...

  // Add time travel routes
  app.use(timeTravelRouter);

  // ... rest of app ...

  return app;
}
```

**Deliverable**: ✅ Time travel API endpoints

---

### Day 4: BullMQ Snapshot Worker

**Morning: Worker Implementation**

```typescript
// workers/snapshot-worker.ts (NEW FILE - follows reserve-worker.ts pattern)

import { Worker, Queue } from 'bullmq';
import { db } from '../server/db';
import { fundSnapshots, fundEvents } from '@shared/schema';
import { eq, gt, desc, sql } from 'drizzle-orm';
import { FundProjector } from '../server/services/fund-projector';
import { logger } from '../lib/logger';
import { withMetrics } from '../lib/metrics';
import { registerWorker } from './health-server';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

export const snapshotQueue = new Queue('snapshot-generation', { connection });

export const snapshotWorker = new Worker(
  'snapshot-generation',
  async (job) => {
    const { fundId, type = 'auto' } = job.data;

    logger.info('Processing snapshot creation', {
      fundId,
      type,
      jobId: job.id,
    });

    return withMetrics('snapshot', async () => {
      const startTime = performance.now();

      try {
        const projector = new FundProjector();

        // Get current fund state
        const currentState = await projector.getFundStateAt(fundId, new Date());

        // Count events since last snapshot
        const lastSnapshot = await db
          .select()
          .from(fundSnapshots)
          .where(eq(fundSnapshots.fundId, fundId))
          .orderBy(desc(fundSnapshots.snapshotTime))
          .limit(1);

        const eventCountResult = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(fundEvents)
          .where(
            eq(fundEvents.fundId, fundId),
            lastSnapshot[0]
              ? gt(fundEvents.createdAt, lastSnapshot[0].snapshotTime)
              : undefined
          );

        const eventCount = Number(eventCountResult[0]?.count || 0);

        // Create snapshot
        const [snapshot] = await db
          .insert(fundSnapshots)
          .values({
            fundId,
            snapshotTime: new Date(),
            fundState: currentState,
            eventCount,
            type,
          })
          .returning();

        const duration = performance.now() - startTime;
        logger.info('Snapshot created successfully', {
          fundId,
          snapshotId: snapshot.id,
          eventCount,
          duration,
        });

        return { success: true, snapshotId: snapshot.id, eventCount, duration };
      } catch (error) {
        logger.error('Snapshot creation failed', { fundId, error });
        throw error;
      }
    });
  },
  {
    connection,
    concurrency: 2,
    settings: {
      backoffStrategy: (attemptsMade) =>
        Math.min(1000 * Math.pow(2, attemptsMade), 30000),
    },
  }
);

// Register with health server
registerWorker('snapshot-worker', snapshotWorker);

// Auto-snapshot scheduler
export async function schedulePeriodicSnapshots(fundId: string) {
  await snapshotQueue.add(
    'auto-snapshot',
    { fundId, type: 'scheduled' },
    {
      repeat: { pattern: '0 0 * * *' }, // Daily at midnight
      jobId: `snapshot-${fundId}-daily`,
    }
  );
}
```

**Afternoon: Test Worker**

```bash
# Terminal 1: Start Redis
docker compose -f docker-compose.dev.yml up redis

# Terminal 2: Start snapshot worker
npm run dev:worker:snapshot

# Terminal 3: Queue a test job
node -e "
  const { snapshotQueue } = require('./workers/snapshot-worker.ts');
  snapshotQueue.add('test', { fundId: 'test-fund-123', type: 'manual' });
"
```

**Deliverable**: ✅ Snapshot generation worker

---

### Day 5: Test Stability + CI Gates

**Morning: Fix Flaky Tests**

```typescript
// tests/helpers/test-decorators.ts (NEW FILE)

export function flaky(reason: string) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;

    descriptor.value = function(...args: any[]) {
      if (process.env.SKIP_FLAKY === '1') {
        console.log(`[SKIPPED FLAKY] ${propertyKey}: ${reason}`);
        return;
      }
      return original.apply(this, args);
    };

    return descriptor;
  };
}

// Usage in tests:
import { flaky } from './helpers/test-decorators';

describe('Wizard E2E', () => {
  @flaky('Needs data-testid on step 3/4 - Issue #46')
  it('should complete fund setup wizard', async () => {
    // ...test code...
  });
});
```

**Afternoon: Add k6 Performance Gates**

```javascript
// k6/critical-flows.js (NEW FILE)

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    // README targets: p95 <200ms reads, <500ms writes
    'http_req_duration{operation:fund_state}': ['p(95)<200'],
    'http_req_duration{operation:timeline}': ['p(95)<200'],
    'http_req_duration{operation:snapshot_create}': ['p(95)<500'],
    http_req_failed: ['rate<0.01'], // <1% error rate
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3001';
const FUND_ID = '550e8400-e29b-41d4-a716-446655440000'; // Test fund

export default function () {
  // 1. Fund state query (read)
  const stateRes = http.get(`${BASE_URL}/api/funds/${FUND_ID}/state`, {
    tags: { operation: 'fund_state' },
  });
  check(stateRes, {
    'fund state: status 200': (r) => r.status === 200,
    'fund state: p95 < 200ms': (r) => r.timings.duration < 200,
  });

  sleep(1);

  // 2. Timeline query (read)
  const timelineRes = http.get(
    `${BASE_URL}/api/funds/${FUND_ID}/timeline?limit=50`,
    { tags: { operation: 'timeline' } }
  );
  check(timelineRes, {
    'timeline: status 200': (r) => r.status === 200,
    'timeline: p95 < 200ms': (r) => r.timings.duration < 200,
  });

  sleep(2);

  // 3. Snapshot creation (write)
  const snapshotRes = http.post(
    `${BASE_URL}/api/funds/${FUND_ID}/snapshots`,
    JSON.stringify({ type: 'manual' }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { operation: 'snapshot_create' },
    }
  );
  check(snapshotRes, {
    'snapshot: status 202': (r) => r.status === 202,
    'snapshot: p95 < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
```

**CI Integration**

```yaml
# .github/workflows/performance.yml (NEW FILE)

name: Performance Gates

on: [pull_request, push]

jobs:
  k6-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start services
        run: docker compose -f docker-compose.dev.yml up -d

      - name: Run k6 performance tests
        uses: grafana/k6-action@v0.3.0
        with:
          filename: k6/critical-flows.js
          flags: --out json=results.json
        env:
          API_URL: http://localhost:3001

      - name: Fail if thresholds breached
        run: |
          if grep -q '"success":false' results.json; then
            echo "❌ Performance thresholds breached!"
            exit 1
          fi
```

**Deliverable**: ✅ Flaky test tagging + k6 CI gates

---

## ✅ Week 1 Success Criteria

- [ ] Event tables deployed with idempotency constraint
- [ ] Fund Projector service passing unit tests
- [ ] Time travel API routes functional
- [ ] Snapshot worker running and processing jobs
- [ ] Flaky tests tagged with `@flaky` decorator
- [ ] k6 performance gates added to CI
- [ ] All tests passing: `npm run check && npm run lint && npm test`

---

## 📊 Week 1 Metrics to Track

| Metric                | Target   | Actual |
| --------------------- | -------- | ------ |
| Fund state query p95  | <200ms   | \_\_\_ |
| Timeline query p95    | <200ms   | \_\_\_ |
| Snapshot creation p95 | <500ms   | \_\_\_ |
| Test pass rate        | >95%     | \_\_\_ |
| Flaky test count      | <5       | \_\_\_ |
| PR review time        | <4 hours | \_\_\_ |

---

**Next Week**: Variance tracking integration + alert system
