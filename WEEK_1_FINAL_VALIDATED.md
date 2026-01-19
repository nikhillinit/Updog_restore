---
status: ACTIVE
last_updated: 2026-01-19
---

# Week 1 Final Plan (Multi-AI Validated)

**Date**: 2025-10-03
**Status**: Production-Ready with AI Consensus
**Validation**: Gemini (Architecture) + OpenAI (Strategy) + DeepSeek (Performance) + Gemini Code Review

---

## 🎯 AI Consensus Summary

### Chosen Approach: **Hybrid (Option C)**
✅ **Daily snapshots** (compliance/recovery)
✅ **Event-count snapshots** (every 50 events for performance)
✅ **Materialized views** (read performance)

### Critical Changes from Original Plan
1. ✅ Add `eventVersion` to idempotency key (DeepSeek)
2. ✅ Use `timestamptz` instead of `timestamp` (Gemini Code Review)
3. ✅ Single-query snapshot check (Gemini Code Review)
4. ✅ Composite index on `(fundId, createdAt)` (Gemini Code Review)
5. ✅ Materialized fund state table (All AIs - Consensus)

---

## 📅 Day 1-2: Event Schema (AI-Enhanced)

### Schema with All AI Recommendations

```typescript
// shared/schema.ts (PRODUCTION-READY VERSION)

import { pgTable, uuid, varchar, jsonb, timestamp, unique, index, integer } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { sql } from 'drizzle-orm';

// Event log with AI-validated idempotency
export const fundEvents = pgTable('fund_events', {
  id: uuid().primaryKey().defaultRandom(),
  fundId: uuid('fund_id').references(() => funds.id).notNull(),

  // Event metadata with versioning (DeepSeek recommendation)
  eventType: varchar('event_type', { length: 50 }).$type<
    | 'INVESTMENT_MADE'
    | 'VALUATION_UPDATED'
    | 'CAPITAL_CALLED'
    | 'DISTRIBUTION_MADE'
    | 'RESERVE_ALLOCATED'
    | 'FORECAST_CREATED'
    | 'ACTUAL_RECORDED'
  >().notNull(),
  eventVersion: varchar('event_version', { length: 10 }).default('1.0').notNull(),

  // Payload with hash for idempotency
  payload: jsonb().notNull(),
  payloadHash: varchar('payload_hash', { length: 64 }).notNull(), // SHA-256

  // Causality tracking
  causationId: uuid('causation_id'),
  correlationId: uuid('correlation_id'),

  // Idempotency key (client-generated, Gemini recommendation)
  idempotencyKey: uuid('idempotency_key'),

  // Timestamps with timezone (Gemini Code Review)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by').references(() => users.id)
}, (table) => ({
  // Enhanced idempotency (fundId + eventType + payloadHash + version)
  uniqueEvent: unique('unique_fund_event').on(
    table.fundId,
    table.eventType,
    table.payloadHash,
    table.eventVersion
  ),

  // Client idempotency key (prevents double-clicks)
  uniqueIdempotencyKey: unique('unique_idempotency_key').on(
    table.fundId,
    table.idempotencyKey
  ),

  // Performance indexes (Gemini Code Review)
  fundTimeIdx: index('idx_fund_events_fund_time').on(table.fundId, table.createdAt),
  correlationIdx: index('idx_fund_events_correlation').on(table.correlationId)
}));

// Snapshots with event-count trigger
export const fundSnapshots = pgTable('fund_snapshots', {
  id: uuid().primaryKey().defaultRandom(),
  fundId: uuid('fund_id').references(() => funds.id).notNull(),

  snapshotTime: timestamp('snapshot_time', { withTimezone: true }).notNull(),
  fundState: jsonb('fund_state').notNull(),

  lastEventId: uuid('last_event_id').references(() => fundEvents.id),
  eventCount: integer('event_count').default(0),

  // Snapshot trigger type
  triggerType: varchar('trigger_type', { length: 20 }).$type<
    'manual' | 'scheduled_daily' | 'event_count' | 'version_conflict'
  >().notNull(),

  description: text(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  fundTimeIdx: index('idx_fund_snapshots_fund_time').on(table.fundId, table.snapshotTime)
}));

// Materialized fund state (AI Consensus - all recommended this)
export const materializedFundState = pgTable('materialized_fund_state', {
  fundId: uuid('fund_id').primaryKey().references(() => funds.id),

  // Current state
  totalCommitted: numeric('total_committed', { precision: 15, scale: 2 }).default('0'),
  totalInvested: numeric('total_invested', { precision: 15, scale: 2 }).default('0'),
  totalValue: numeric('total_value', { precision: 15, scale: 2 }).default('0'),

  // Metadata
  lastEventId: uuid('last_event_id').references(() => fundEvents.id),
  lastEventTime: timestamp('last_event_time', { withTimezone: true }),
  projectionVersion: integer('projection_version').default(1),

  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  // Index for staleness checks
  lastEventTimeIdx: index('idx_mat_fund_last_event_time').on(table.lastEventTime)
}));

// Zod schemas
export const insertFundEventSchema = createInsertSchema(fundEvents, {
  eventType: z.enum([
    'INVESTMENT_MADE',
    'VALUATION_UPDATED',
    'CAPITAL_CALLED',
    'DISTRIBUTION_MADE',
    'RESERVE_ALLOCATED',
    'FORECAST_CREATED',
    'ACTUAL_RECORDED'
  ]),
  payload: z.record(z.unknown()),
  idempotencyKey: z.string().uuid().optional(),
  correlationId: z.string().uuid().optional()
});
```

### Migration Script

```bash
# Generate migration with AI enhancements
npx drizzle-kit generate

# Preview migration
cat db/migrations/0001_add_event_sourcing.sql

# Apply to database
npm run db:push

# Verify with schema check
npm run schema:check
```

---

## 📅 Day 3: Fund Projector + Materialized Views

### Optimized Snapshot Check (Gemini Code Review)

```typescript
// server/services/snapshot-checker.ts (NEW - OPTIMIZED VERSION)

import { db } from '../db';
import { fundEvents, fundSnapshots } from '@shared/schema';
import { sql, eq, and, gt } from 'drizzle-orm';

const SNAPSHOT_EVENT_THRESHOLD = 50; // AI Consensus: 50 events

export async function shouldCreateSnapshot(fundId: string): Promise<boolean> {
  // Single-query optimization (Gemini Code Review)
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(fundEvents)
    .where(
      and(
        eq(fundEvents.fundId, fundId),
        // Subquery finds last snapshot time
        gt(
          fundEvents.createdAt,
          sql`(
            SELECT COALESCE(MAX(snapshot_time), '1970-01-01T00:00:00Z'::timestamptz)
            FROM ${fundSnapshots}
            WHERE ${fundSnapshots.fundId} = ${fundId}
          )`
        )
      )
    );

  return (result[0]?.count || 0) >= SNAPSHOT_EVENT_THRESHOLD;
}
```

### Projector with Materialized Views

```typescript
// server/services/fund-projector.ts (HYBRID VERSION)

import { db } from '../db';
import { fundEvents, fundSnapshots, materializedFundState } from '@shared/schema';
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
  // ... rest of state
}

export class FundProjector {
  /**
   * Get current fund state (from materialized view for performance)
   */
  async getCurrentState(fundId: string): Promise<FundState> {
    const materialized = await db
      .select()
      .from(materializedFundState)
      .where(eq(materializedFundState.fundId, fundId))
      .limit(1);

    if (!materialized[0]) {
      throw new Error(`No materialized state for fund ${fundId}`);
    }

    // For current state, materialized view is authoritative
    return this.hydrateFundState(fundId, materialized[0]);
  }

  /**
   * Get fund state at specific timestamp (time travel - uses snapshots)
   */
  async getFundStateAt(fundId: string, timestamp: Date): Promise<FundState> {
    // For historical queries, use snapshot + replay
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

    let state: FundState = snapshot[0]?.fundState as FundState || this.initializeEmptyState(fundId);

    // Replay events from snapshot to target timestamp
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

    for (const event of events) {
      state = this.applyEvent(state, event);
    }

    return state;
  }

  /**
   * Update materialized view (called by BullMQ worker on each event)
   */
  async updateMaterializedView(fundId: string, event: typeof fundEvents.$inferSelect): Promise<void> {
    const current = await db
      .select()
      .from(materializedFundState)
      .where(eq(materializedFundState.fundId, fundId))
      .limit(1);

    const currentState = current[0]
      ? await this.hydrateFundState(fundId, current[0])
      : this.initializeEmptyState(fundId);

    const newState = this.applyEvent(currentState, event);

    // Upsert materialized state
    await db
      .insert(materializedFundState)
      .values({
        fundId,
        totalCommitted: newState.totalCommitted.toString(),
        totalInvested: newState.totalInvested.toString(),
        totalValue: newState.totalValue.toString(),
        lastEventId: event.id,
        lastEventTime: event.createdAt,
        projectionVersion: (current[0]?.projectionVersion || 0) + 1
      })
      .onConflictDoUpdate({
        target: materializedFundState.fundId,
        set: {
          totalCommitted: newState.totalCommitted.toString(),
          totalInvested: newState.totalInvested.toString(),
          totalValue: newState.totalValue.toString(),
          lastEventId: event.id,
          lastEventTime: event.createdAt,
          projectionVersion: sql`${materializedFundState.projectionVersion} + 1`,
          updatedAt: new Date()
        }
      });
  }

  // Event application methods (same as before)
  private applyEvent(state: FundState, event: typeof fundEvents.$inferSelect): FundState {
    switch (event.eventType) {
      case 'INVESTMENT_MADE':
        return this.applyInvestmentMade(state, event.payload);
      case 'VALUATION_UPDATED':
        return this.applyValuationUpdate(state, event.payload);
      // ... other event handlers
      default:
        return state;
    }
  }

  private applyInvestmentMade(state: FundState, payload: any): FundState {
    return {
      ...state,
      totalInvested: state.totalInvested + payload.amount,
      portfolioCompanies: state.portfolioCompanies.map(company =>
        company.id === payload.companyId
          ? { ...company, totalInvestment: company.totalInvestment + payload.amount }
          : company
      )
    };
  }

  // Helper methods
  private async hydrateFundState(fundId: string, materialized: any): Promise<FundState> {
    // Convert materialized view to full FundState
    // This would include joins to portfolio_companies, reserves, etc.
    return {
      fundId,
      totalCommitted: Number(materialized.totalCommitted),
      totalInvested: Number(materialized.totalInvested),
      totalValue: Number(materialized.totalValue),
      portfolioCompanies: [], // TODO: Join from portfolio_companies table
    };
  }

  private initializeEmptyState(fundId: string): FundState {
    return {
      fundId,
      totalCommitted: 0,
      totalInvested: 0,
      totalValue: 0,
      portfolioCompanies: []
    };
  }
}
```

---

## 📅 Day 4: BullMQ Workers (Dual-Trigger Snapshots)

### Projection Worker (Updates Materialized Views)

```typescript
// workers/projection-worker.ts (NEW - AI Consensus Pattern)

import { Worker, Queue } from 'bullmq';
import { FundProjector } from '../server/services/fund-projector';
import { logger } from '../lib/logger';
import { withMetrics } from '../lib/metrics';
import { registerWorker } from './health-server';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

export const projectionQueue = new Queue('projection-updates', { connection });

export const projectionWorker = new Worker(
  'projection-updates',
  async (job) => {
    const { fundId, eventId } = job.data;

    logger.info('Updating materialized view', { fundId, eventId });

    return withMetrics('projection', async () => {
      const projector = new FundProjector();

      // Get event and update materialized view
      const event = await db
        .select()
        .from(fundEvents)
        .where(eq(fundEvents.id, eventId))
        .limit(1);

      if (!event[0]) {
        throw new Error(`Event ${eventId} not found`);
      }

      await projector.updateMaterializedView(fundId, event[0]);

      logger.info('Materialized view updated', { fundId, eventId });

      return { success: true, fundId, eventId };
    });
  },
  {
    connection,
    concurrency: 5, // Higher concurrency for view updates
    settings: {
      backoffStrategy: (attemptsMade) => Math.min(1000 * Math.pow(2, attemptsMade), 30000)
    }
  }
);

registerWorker('projection-worker', projectionWorker);
```

### Snapshot Worker (Dual-Trigger)

```typescript
// workers/snapshot-worker.ts (AI-ENHANCED VERSION)

import { Worker, Queue } from 'bullmq';
import { db } from '../server/db';
import { fundSnapshots } from '@shared/schema';
import { FundProjector } from '../server/services/fund-projector';
import { shouldCreateSnapshot } from '../server/services/snapshot-checker';
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
    const { fundId, triggerType } = job.data;

    logger.info('Processing snapshot creation', { fundId, triggerType });

    return withMetrics('snapshot', async () => {
      const projector = new FundProjector();

      // Get current fund state (from materialized view for speed)
      const currentState = await projector.getCurrentState(fundId);

      // Create snapshot
      const [snapshot] = await db
        .insert(fundSnapshots)
        .values({
          fundId,
          snapshotTime: new Date(),
          fundState: currentState,
          triggerType,
          eventCount: await getEventCount(fundId)
        })
        .returning();

      logger.info('Snapshot created', {
        fundId,
        snapshotId: snapshot.id,
        triggerType
      });

      return { success: true, snapshotId: snapshot.id };
    });
  },
  {
    connection,
    concurrency: 2,
    settings: {
      backoffStrategy: (attemptsMade) => Math.min(1000 * Math.pow(2, attemptsMade), 30000)
    }
  }
);

registerWorker('snapshot-worker', snapshotWorker);

// Dual-trigger snapshot scheduling
export async function maybeCreateSnapshot(fundId: string): Promise<void> {
  if (await shouldCreateSnapshot(fundId)) {
    await snapshotQueue.add('event-count-snapshot', {
      fundId,
      triggerType: 'event_count'
    });
  }
}

export async function scheduleDailySnapshots(fundId: string): Promise<void> {
  await snapshotQueue.add(
    'daily-snapshot',
    { fundId, triggerType: 'scheduled_daily' },
    {
      repeat: { pattern: '0 0 * * *' }, // Daily at midnight
      jobId: `snapshot-${fundId}-daily`
    }
  );
}

async function getEventCount(fundId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(fundEvents)
    .where(eq(fundEvents.fundId, fundId));

  return result[0]?.count || 0;
}
```

---

## 📅 Day 5: Express API + k6 Gates

### Express Routes (Current + Historical)

```typescript
// server/routes/time-travel.ts (DUAL ENDPOINT VERSION)

import express from 'express';
import { z } from 'zod';
import { FundProjector } from '../services/fund-projector';
import { asyncHandler } from '../middleware/async';
import { validateRequest } from '../middleware/validation';

const router = express.Router();
const projector = new FundProjector();

// Current state (from materialized view - FAST)
router.get(
  '/api/funds/:fundId/state/current',
  asyncHandler(async (req, res) => {
    const { fundId } = req.params;

    const state = await projector.getCurrentState(fundId);

    res.json({
      timestamp: new Date().toISOString(),
      source: 'materialized_view',
      state
    });
  })
);

// Historical state (from snapshots - ACCURATE)
router.get(
  '/api/funds/:fundId/state',
  validateRequest(z.object({
    params: z.object({ fundId: z.string().uuid() }),
    query: z.object({ at: z.string().datetime() })
  })),
  asyncHandler(async (req, res) => {
    const { fundId } = req.params;
    const timestamp = new Date(req.query.at);

    const state = await projector.getFundStateAt(fundId, timestamp);

    res.json({
      timestamp: timestamp.toISOString(),
      source: 'snapshot_replay',
      state
    });
  })
);

export default router;
```

### k6 Performance Gates (AI-Validated Thresholds)

```javascript
// k6/critical-flows.js (PRODUCTION THRESHOLDS)

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 0 }
  ],
  thresholds: {
    // AI Consensus: Achievable with materialized views
    'http_req_duration{operation:current_state}': ['p(95)<50'], // Materialized view
    'http_req_duration{operation:historical_state}': ['p(95)<200'], // Snapshot replay
    'http_req_duration{operation:timeline}': ['p(95)<100'],
    'http_req_failed': ['rate<0.01']
  }
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3001';
const FUND_ID = '550e8400-e29b-41d4-a716-446655440000';

export default function() {
  // Current state (materialized view - should be <50ms)
  const currentRes = http.get(
    `${BASE_URL}/api/funds/${FUND_ID}/state/current`,
    { tags: { operation: 'current_state' } }
  );
  check(currentRes, {
    'current state: p95 < 50ms': (r) => r.timings.duration < 50
  });

  sleep(1);

  // Historical state (snapshot + replay - should be <200ms)
  const historicalRes = http.get(
    `${BASE_URL}/api/funds/${FUND_ID}/state?at=2024-01-01T00:00:00Z`,
    { tags: { operation: 'historical_state' } }
  );
  check(historicalRes, {
    'historical state: p95 < 200ms': (r) => r.timings.duration < 200
  });

  sleep(1);
}
```

---

## ✅ Week 1 Success Metrics (AI-Validated)

| Metric | AI Target | Validation |
|--------|-----------|------------|
| Current state read p95 | <50ms | Gemini: "Materialized view = simple SELECT" |
| Historical state read p95 | <200ms | All AIs: "Achievable with snapshots" |
| Snapshot creation p95 | <500ms | OpenAI: "Realistic for event sourcing" |
| Events since last snapshot | ≤50 | DeepSeek: "Balance of performance + storage" |
| Test pass rate | >95% | Standard target |

---

## 🔍 What Changed from Original Plan

### ✅ Added (AI Recommendations)
1. `eventVersion` in idempotency key
2. `timestamptz` for timezone safety
3. Client `idempotencyKey` for double-click prevention
4. Materialized `fund_state` table for reads
5. Dual-trigger snapshots (daily + every 50 events)
6. Single-query snapshot check optimization
7. Composite indexes for performance

### ✅ Kept (Already Correct)
- Express + BullMQ architecture
- Drizzle ORM with Zod validation
- SHA-256 payload hashing
- Event replay logic

### ❌ Removed (Unnecessary)
- On-demand event replay for current state (too slow)
- Daily-only snapshots (insufficient for hot aggregates)

---

**Next Step**: Execute Day 1 - Create AI-validated schema with `npm run db:push`
