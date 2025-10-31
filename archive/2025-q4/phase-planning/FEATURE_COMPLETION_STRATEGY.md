# Feature Completion Strategy: Time Machine, Variance Tracking & Optimal Reserves

**Status**: Production-Ready Development Plan **Timeline**: 8-10 weeks
**Approach**: Event-Sourcing Foundation → Historical Analysis → Predictive
Intelligence

---

## 🎯 Executive Summary

This strategy completes three interconnected features that transform the
platform from a **system of record** into a **strategic decision-making tool**:

1. **Time Machine** - Event sourcing foundation for historical analysis
2. **Variance Tracking** - Compare forecasts vs actuals with automated alerts
3. **Optimal Reserves** - AI-driven reserve allocation recommendations

**Unique Value Proposition**: Time-aware reserve optimization that shows how
recommendations change historically and predicts future allocation impact.

---

## 🏗️ System Architecture

### Core Principle: Event Sourcing as Foundation

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                       │
│   React + TanStack Query + Recharts/Nivo + Shadcn/ui       │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                   API LAYER (Express + Zod)                  │
│  /events (Write)  │  /state?at=timestamp (Read)             │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│              BUSINESS LOGIC LAYER (BullMQ Workers)           │
│  Fund Projector │ Variance Calculator │ Reserve Optimizer   │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│              DATA LAYER (PostgreSQL + Redis Cache)           │
│  events │ snapshots │ actuals │ forecasts │ recommendations │
└─────────────────────────────────────────────────────────────┘
```

**Key Pattern**: CQRS (Command Query Responsibility Segregation)

- **Writes** → Event log (single source of truth)
- **Reads** → Snapshots + event replay (performance optimized)

---

## 📊 Phase 1: Event-Sourcing Foundation (Weeks 1-2)

### Backend: Complete Time Machine Persistence

#### 1.1 Data Model (Drizzle ORM)

```typescript
// shared/schema.ts

// Core event log - immutable audit trail
export const fundEvents = pgTable('fund_events', {
  id: uuid().primaryKey().defaultRandom(),
  fundId: uuid('fund_id').references(() => funds.id),
  eventType: varchar('event_type', { length: 50 }).$type<
    | 'INVESTMENT_MADE'
    | 'VALUATION_UPDATED'
    | 'CAPITAL_CALLED'
    | 'DISTRIBUTION_MADE'
    | 'RESERVE_ALLOCATED'
    | 'FORECAST_CREATED'
    | 'ACTUAL_RECORDED'
  >(),
  payload: jsonb().$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  metadata: jsonb().$type<{ ip?: string; userAgent?: string }>(),
});

// Performance-optimized snapshots
export const fundSnapshots = pgTable('fund_snapshots', {
  id: uuid().primaryKey().defaultRandom(),
  fundId: uuid('fund_id').references(() => funds.id),
  snapshotTime: timestamp('snapshot_time').notNull(),
  fundState: jsonb('fund_state').$type<FundState>(), // Complete fund object
  lastEventId: uuid('last_event_id').references(() => fundEvents.id),
  eventCount: integer('event_count').default(0),
  type: varchar({ length: 20 }).$type<'manual' | 'scheduled' | 'auto'>(),
  description: text(),
});

// Indexes for performance
export const fundEventsIndex = index('idx_fund_events_fund_time').on(
  fundEvents.fundId,
  fundEvents.createdAt
);
export const fundSnapshotsIndex = index('idx_fund_snapshots_fund_time').on(
  fundSnapshots.fundId,
  fundSnapshots.snapshotTime
);
```

#### 1.2 Fund Projector Service

```typescript
// server/services/fund-projector.ts

import { db } from '../db';
import { fundEvents, fundSnapshots } from '@shared/schema';
import { eq, and, lte, gt } from 'drizzle-orm';

export interface FundState {
  fundId: string;
  totalCommitted: number;
  totalInvested: number;
  totalValue: number;
  portfolioCompanies: PortfolioCompany[];
  reserves: ReserveAllocation[];
  forecasts: DealForecast[];
  // ... complete state object
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

    // 2. Load snapshot state (or initialize empty if no snapshot)
    let state: FundState =
      snapshot[0]?.fundState || this.initializeEmptyState(fundId);

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

    // 4. Apply events sequentially to derive final state
    for (const event of events) {
      state = this.applyEvent(state, event);
    }

    return state;
  }

  /**
   * Apply single event to state (pure function)
   */
  private applyEvent(state: FundState, event: FundEvent): FundState {
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
    // Immutable state update
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

  // ... implement other event handlers
}
```

#### 1.3 Automatic Snapshot Generation (BullMQ Worker)

```typescript
// workers/snapshot-worker.ts

import { Queue, Worker } from 'bullmq';
import { db } from '../server/db';
import { FundProjector } from '../server/services/fund-projector';

const snapshotQueue = new Queue('snapshot-generation', {
  connection: { host: 'localhost', port: 6379 },
});

export const snapshotWorker = new Worker(
  'snapshot-generation',
  async (job) => {
    const { fundId, type } = job.data;
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

    const eventCount = await db
      .select({ count: sql`COUNT(*)` })
      .from(fundEvents)
      .where(
        and(
          eq(fundEvents.fundId, fundId),
          gt(fundEvents.createdAt, lastSnapshot[0]?.snapshotTime || new Date(0))
        )
      );

    // Create snapshot
    await db.insert(fundSnapshots).values({
      fundId,
      snapshotTime: new Date(),
      fundState: currentState,
      eventCount: eventCount[0].count,
      type,
    });

    return { success: true, eventCount: eventCount[0].count };
  },
  { connection: { host: 'localhost', port: 6379 } }
);

// Auto-snapshot every 100 events or 24 hours
export async function schedulePeriodicSnapshots(fundId: string) {
  await snapshotQueue.add(
    'auto-snapshot',
    { fundId, type: 'scheduled' },
    { repeat: { pattern: '0 0 * * *' } } // Daily at midnight
  );
}
```

#### 1.4 API Endpoints

```typescript
// server/routes/time-travel.ts

import { Router } from 'express';
import { z } from 'zod';
import { FundProjector } from '../services/fund-projector';
import { snapshotQueue } from '../../workers/snapshot-worker';

const router = Router();
const projector = new FundProjector();

// Get fund state at specific timestamp
router.get('/api/funds/:fundId/state', async (req, res) => {
  const { fundId } = req.params;
  const { at } = req.query;

  const timestamp = at ? new Date(at as string) : new Date();

  const state = await projector.getFundStateAt(fundId, timestamp);

  res.json({
    timestamp: timestamp.toISOString(),
    state,
  });
});

// Create manual snapshot
router.post('/api/funds/:fundId/snapshots', async (req, res) => {
  const { fundId } = req.params;
  const { description } = req.body;

  await snapshotQueue.add('manual-snapshot', {
    fundId,
    type: 'manual',
    description,
  });

  res.json({ message: 'Snapshot queued for creation' });
});

// Get timeline of events
router.get('/api/funds/:fundId/timeline', async (req, res) => {
  const { fundId } = req.params;
  const { start, end, limit = 100 } = req.query;

  const events = await db
    .select()
    .from(fundEvents)
    .where(
      and(
        eq(fundEvents.fundId, fundId),
        start
          ? gte(fundEvents.createdAt, new Date(start as string))
          : undefined,
        end ? lte(fundEvents.createdAt, new Date(end as string)) : undefined
      )
    )
    .orderBy(desc(fundEvents.createdAt))
    .limit(Number(limit));

  res.json({ events });
});

export default router;
```

### Frontend: Integrate with TanStack Query

```typescript
// client/src/hooks/useTimeMachine.ts

import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';

export function useTimeMachine(fundId: string) {
  const [currentTimestamp, setCurrentTimestamp] = useState<Date>(new Date());

  // Query fund state at specific timestamp
  const { data: fundState, isLoading } = useQuery({
    queryKey: ['fundState', fundId, currentTimestamp.toISOString()],
    queryFn: async () => {
      const res = await fetch(
        `/api/funds/${fundId}/state?at=${currentTimestamp.toISOString()}`
      );
      return res.json();
    },
    staleTime: 60_000, // Cache for 1 minute
    enabled: !!fundId,
  });

  // Create snapshot mutation
  const createSnapshot = useMutation({
    mutationFn: async ({ description }: { description?: string }) => {
      const res = await fetch(`/api/funds/${fundId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      return res.json();
    },
  });

  return {
    currentTimestamp,
    setCurrentTimestamp,
    fundState: fundState?.state,
    isLoading,
    createSnapshot,
  };
}
```

**✅ Phase 1 Outcome**: Fully persistent Time Machine with event sourcing
foundation

---

## 📈 Phase 2: Variance Tracking Integration (Weeks 3-4)

### Backend: Actuals Integration & Alert System

#### 2.1 Data Model Extension

```typescript
// shared/schema.ts

export const portfolioCompanyActuals = pgTable('portfolio_company_actuals', {
  id: uuid().primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => portfolioCompanies.id),
  metricType: varchar('metric_type', { length: 50 }).$type<
    'REVENUE' | 'EBITDA' | 'CASH_BURN' | 'ARR' | 'VALUATION'
  >(),
  value: decimal({ precision: 15, scale: 2 }),
  effectiveDate: date('effective_date').notNull(),
  recordedAt: timestamp('recorded_at').defaultNow(),
  source: varchar({ length: 100 }), // 'manual', 'api', 'import'
  metadata: jsonb(),
});

export const varianceAlerts = pgTable('variance_alerts', {
  id: uuid().primaryKey().defaultRandom(),
  fundId: uuid('fund_id').references(() => funds.id),
  alertRuleId: uuid('alert_rule_id').references(() => varianceAlertRules.id),
  triggeringActualId: uuid('triggering_actual_id').references(
    () => portfolioCompanyActuals.id
  ),
  severity: varchar({ length: 20 }).$type<
    'info' | 'warning' | 'critical' | 'urgent'
  >(),
  details: jsonb().$type<{
    metric: string;
    forecast: number;
    actual: number;
    variance: number;
    variancePercent: number;
  }>(),
  isRead: boolean('is_read').default(false),
  isResolved: boolean('is_resolved').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  resolvedAt: timestamp('resolved_at'),
});
```

#### 2.2 Variance Calculation Worker

```typescript
// workers/variance-worker.ts

import { Queue, Worker } from 'bullmq';
import { db } from '../server/db';
import { FundProjector } from '../server/services/fund-projector';

const varianceQueue = new Queue('variance-calculation', {
  connection: { host: 'localhost', port: 6379 },
});

export const varianceWorker = new Worker(
  'variance-calculation',
  async (job) => {
    const { actualId } = job.data;

    // 1. Fetch the newly recorded actual
    const actual = await db
      .select()
      .from(portfolioCompanyActuals)
      .where(eq(portfolioCompanyActuals.id, actualId))
      .limit(1);

    if (!actual[0]) return { error: 'Actual not found' };

    // 2. Get fund state at effective date to find forecast
    const projector = new FundProjector();
    const historicalState = await projector.getFundStateAt(
      actual[0].fundId,
      new Date(actual[0].effectiveDate)
    );

    // 3. Find matching forecast
    const forecast = historicalState.forecasts.find(
      (f) =>
        f.companyId === actual[0].companyId &&
        f.metricType === actual[0].metricType
    );

    if (!forecast) return { message: 'No matching forecast' };

    // 4. Calculate variance
    const variance = Number(actual[0].value) - forecast.projectedValue;
    const variancePercent = (variance / forecast.projectedValue) * 100;

    // 5. Check against alert rules
    const alertRules = await db
      .select()
      .from(varianceAlertRules)
      .where(eq(varianceAlertRules.fundId, actual[0].fundId));

    for (const rule of alertRules) {
      const shouldAlert = this.evaluateAlertRule(rule, {
        variance,
        variancePercent,
        metricType: actual[0].metricType,
      });

      if (shouldAlert) {
        // Create alert
        await db.insert(varianceAlerts).values({
          fundId: actual[0].fundId,
          alertRuleId: rule.id,
          triggeringActualId: actualId,
          severity: rule.severity,
          details: {
            metric: actual[0].metricType,
            forecast: forecast.projectedValue,
            actual: Number(actual[0].value),
            variance,
            variancePercent,
          },
        });

        // Queue alert delivery
        await alertDeliveryQueue.add('deliver-alert', {
          alertId: alert.id,
          channel: rule.deliveryChannel, // 'email', 'slack', 'in-app'
        });
      }
    }

    return { variance, variancePercent, alertsCreated: alertRules.length };
  },
  { connection: { host: 'localhost', port: 6379 } }
);
```

**✅ Phase 2 Outcome**: Real-time variance tracking with automated alerts

---

## 🎯 Phase 3: Optimal Reserve Allocation (Weeks 5-7)

### Backend: Reserve Optimization Engine

#### 3.1 Data Model

```typescript
// shared/schema.ts

export const reserveRecommendations = pgTable('reserve_recommendations', {
  id: uuid().primaryKey().defaultRandom(),
  fundId: uuid('fund_id').references(() => funds.id),
  companyId: uuid('company_id').references(() => portfolioCompanies.id),
  calculationDate: timestamp('calculation_date').defaultNow(),

  // Current state
  currentReserveAllocation: decimal('current_reserve_allocation', {
    precision: 15,
    scale: 2,
  }),
  deployedReserves: decimal('deployed_reserves', { precision: 15, scale: 2 }),

  // Recommendations
  recommendedAllocation: decimal('recommended_allocation', {
    precision: 15,
    scale: 2,
  }),
  expectedMOIC: decimal('expected_moic', { precision: 6, scale: 2 }),
  followOnMultiple: decimal('follow_on_multiple', { precision: 6, scale: 2 }),

  // Confidence metrics
  confidenceScore: decimal('confidence_score', { precision: 3, scale: 2 }), // 0.00-1.00
  simulationIterations: integer('simulation_iterations').default(10000),

  // Scenario link
  scenarioId: uuid('scenario_id'), // Links to Monte Carlo scenarios

  // Metadata
  metadata: jsonb().$type<{
    exitScenarios: ExitScenario[];
    futureRounds: FundingRound[];
    performanceCases: PerformanceCase[];
  }>(),
});

export const reserveAllocationScenarios = pgTable(
  'reserve_allocation_scenarios',
  {
    id: uuid().primaryKey().defaultRandom(),
    fundId: uuid('fund_id').references(() => funds.id),
    name: varchar({ length: 255 }),
    description: text(),
    recommendations: jsonb().$type<ReserveRecommendation[]>(),
    createdAt: timestamp('created_at').defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
  }
);
```

#### 3.2 Reserve Optimization Engine

```typescript
// server/services/reserve-optimization-engine.ts

import { MonteCarloEngine } from './monte-carlo-engine';
import { FundProjector } from './fund-projector';

export interface ReserveRecommendation {
  companyId: string;
  companyName: string;
  currentReserveAllocation: number;
  deployedReserves: number;
  recommendedAllocation: number;
  expectedMOIC: number;
  followOnMultiple: number;
  confidenceScore: number;
  rank: number;
}

export class ReserveOptimizationEngine {
  constructor(
    private monteCarloEngine: MonteCarloEngine,
    private fundProjector: FundProjector
  ) {}

  /**
   * Calculate optimal reserve allocation for all portfolio companies
   * Returns ranked list by follow-on multiple (expected MOIC of next $1)
   */
  async calculateOptimalReserves(
    fundId: string,
    options: {
      incrementalAmount?: number; // Default: $1M
      iterations?: number; // Default: 10,000
      confidenceLevel?: number; // Default: 0.95
    } = {}
  ): Promise<ReserveRecommendation[]> {
    const {
      incrementalAmount = 1_000_000,
      iterations = 10_000,
      confidenceLevel = 0.95,
    } = options;

    // 1. Get current fund state
    const currentState = await this.fundProjector.getFundStateAt(
      fundId,
      new Date()
    );

    // 2. For each active portfolio company with planned reserves
    const recommendations: ReserveRecommendation[] = [];

    for (const company of currentState.portfolioCompanies) {
      if (company.status !== 'active' || company.plannedReserves <= 0) {
        continue;
      }

      // 3. Get company's deal-level forecast
      const dealForecast = currentState.forecasts.find(
        (f) => f.companyId === company.id
      );

      if (!dealForecast) continue;

      // 4. Simulate incremental $1M investment
      const baselineScenario = {
        ...company,
        totalInvestment: company.totalInvestment,
        currentOwnership: company.ownership,
      };

      const incrementalScenario = {
        ...company,
        totalInvestment: company.totalInvestment + incrementalAmount,
        // Adjust ownership based on pro-rata participation
        currentOwnership: this.calculateNewOwnership(
          company,
          incrementalAmount,
          dealForecast
        ),
      };

      // 5. Run Monte Carlo simulations for both scenarios
      const baselineResults = await this.monteCarloEngine.simulate({
        fundId,
        companies: [baselineScenario],
        iterations,
        exitScenarios: dealForecast.exitScenarios,
        futureRounds: dealForecast.futureRounds,
      });

      const incrementalResults = await this.monteCarloEngine.simulate({
        fundId,
        companies: [incrementalScenario],
        iterations,
        exitScenarios: dealForecast.exitScenarios,
        futureRounds: dealForecast.futureRounds,
      });

      // 6. Calculate expected MOIC of marginal $1M
      const baselineMOIC = this.calculateExpectedMOIC(
        baselineResults,
        confidenceLevel
      );
      const incrementalMOIC = this.calculateExpectedMOIC(
        incrementalResults,
        confidenceLevel
      );

      // Marginal MOIC = (Incremental Value - Baseline Value) / Incremental Investment
      const marginalReturn =
        incrementalResults.expectedValue - baselineResults.expectedValue;
      const expectedMOIC = marginalReturn / incrementalAmount;

      // Follow-on multiple = Expected MOIC / Current Ownership %
      // This normalizes for ownership dilution
      const followOnMultiple = expectedMOIC / (company.ownership / 100);

      // 7. Calculate recommended allocation
      const recommendedAllocation = this.calculateOptimalAllocation({
        company,
        followOnMultiple,
        totalAvailableReserves: currentState.availableCapital,
        constraintss: {
          maxPerCompany: currentState.fundSize * 0.15, // Max 15% of fund
          minReserveRatio: 1.5, // At least 1.5x initial check
        },
      });

      recommendations.push({
        companyId: company.id,
        companyName: company.name,
        currentReserveAllocation: company.plannedReserves,
        deployedReserves: company.deployedReserves || 0,
        recommendedAllocation,
        expectedMOIC,
        followOnMultiple,
        confidenceScore: incrementalResults.confidenceScore,
        rank: 0, // Will be set after sorting
      });
    }

    // 8. Rank by follow-on multiple (highest first)
    recommendations.sort((a, b) => b.followOnMultiple - a.followOnMultiple);
    recommendations.forEach((rec, index) => (rec.rank = index + 1));

    return recommendations;
  }

  private calculateNewOwnership(
    company: PortfolioCompany,
    incrementalAmount: number,
    forecast: DealForecast
  ): number {
    // Simplified pro-rata calculation
    // In reality, this would consider anti-dilution provisions, participation rights, etc.
    const nextRoundValuation =
      forecast.futureRounds[0]?.preMoneyValuation || company.currentValuation;
    const newShares = incrementalAmount / (nextRoundValuation / 1_000_000); // Simplified
    const totalShares = 1_000_000; // Normalized share count
    return (
      (((company.ownership / 100) * totalShares + newShares) /
        (totalShares + newShares)) *
      100
    );
  }

  private calculateExpectedMOIC(
    simulationResults: MonteCarloResults,
    confidenceLevel: number
  ): number {
    // Use percentile-based expected value (e.g., 50th percentile = median)
    const sortedOutcomes = simulationResults.outcomes.sort(
      (a, b) => a.totalValue - b.totalValue
    );
    const index = Math.floor(sortedOutcomes.length * confidenceLevel);
    return sortedOutcomes[index].moic;
  }

  private calculateOptimalAllocation(params: {
    company: PortfolioCompany;
    followOnMultiple: number;
    totalAvailableReserves: number;
    constraints: {
      maxPerCompany: number;
      minReserveRatio: number;
    };
  }): number {
    const { company, followOnMultiple, totalAvailableReserves, constraints } =
      params;

    // Kelly Criterion-inspired allocation
    // Allocation = (Expected Return - 1) / Variance
    // Simplified for VC: Weight by follow-on multiple with constraints

    let recommended = company.totalInvestment * constraints.minReserveRatio;

    // Adjust based on follow-on multiple
    if (followOnMultiple > 3.0) {
      recommended *= 1.5; // 50% more for high-opportunity companies
    } else if (followOnMultiple < 1.5) {
      recommended *= 0.5; // 50% less for low-opportunity companies
    }

    // Apply constraints
    recommended = Math.min(recommended, constraints.maxPerCompany);
    recommended = Math.min(recommended, totalAvailableReserves * 0.2); // Max 20% of available

    return Math.round(recommended);
  }
}
```

#### 3.3 Background Worker

```typescript
// workers/reserve-optimization-worker.ts

import { Queue, Worker } from 'bullmq';
import { ReserveOptimizationEngine } from '../server/services/reserve-optimization-engine';
import { redis } from '../server/redis';

const reserveQueue = new Queue('reserve-optimization', {
  connection: { host: 'localhost', port: 6379 },
});

export const reserveWorker = new Worker(
  'reserve-optimization',
  async (job) => {
    const { fundId, iterations = 10000 } = job.data;

    const engine = new ReserveOptimizationEngine(
      new MonteCarloEngine(),
      new FundProjector()
    );

    // Update progress
    await job.updateProgress(10);

    const recommendations = await engine.calculateOptimalReserves(fundId, {
      iterations,
      incrementalAmount: 1_000_000,
    });

    await job.updateProgress(90);

    // Cache results in Redis with 1-hour TTL
    await redis.setex(
      `reserve-recommendations:${fundId}`,
      3600,
      JSON.stringify(recommendations)
    );

    await job.updateProgress(100);

    return {
      success: true,
      recommendationsCount: recommendations.length,
      topThree: recommendations.slice(0, 3),
    };
  },
  {
    connection: { host: 'localhost', port: 6379 },
    concurrency: 2, // Limit concurrent calculations
  }
);
```

#### 3.4 API Endpoints

```typescript
// server/routes/reserve-optimization.ts

import { Router } from 'express';
import { reserveQueue } from '../../workers/reserve-optimization-worker';
import { redis } from '../redis';

const router = Router();

// Start reserve optimization calculation
router.post(
  '/api/funds/:fundId/optimal-reserves/calculate',
  async (req, res) => {
    const { fundId } = req.params;
    const { iterations = 10000 } = req.body;

    const job = await reserveQueue.add('calculate-reserves', {
      fundId,
      iterations,
    });

    res.json({
      jobId: job.id,
      message: 'Calculation started',
    });
  }
);

// Get calculation results
router.get('/api/funds/:fundId/optimal-reserves/results', async (req, res) => {
  const { fundId } = req.params;
  const { jobId } = req.query;

  // Check cache first
  const cached = await redis.get(`reserve-recommendations:${fundId}`);

  if (cached) {
    return res.json({
      status: 'completed',
      data: JSON.parse(cached),
    });
  }

  // Check job status
  if (jobId) {
    const job = await reserveQueue.getJob(jobId as string);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const state = await job.getState();
    const progress = job.progress;

    return res.json({
      status: state,
      progress,
      data: state === 'completed' ? await job.returnvalue : null,
    });
  }

  res.status(404).json({ error: 'No results available' });
});

export default router;
```

### Frontend: Optimal Reserves UI

```typescript
// client/src/pages/optimal-reserves.tsx

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  Target,
  DollarSign,
  AlertCircle
} from 'lucide-react';

export default function OptimalReservesPage() {
  const { currentFund } = useFundContext();
  const [jobId, setJobId] = useState<string | null>(null);

  // Start calculation
  const calculateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/funds/${currentFund.id}/optimal-reserves/calculate`,
        { method: 'POST' }
      );
      return res.json();
    },
    onSuccess: (data) => {
      setJobId(data.jobId);
    }
  });

  // Poll for results
  const { data: results, isLoading } = useQuery({
    queryKey: ['optimalReserves', currentFund?.id, jobId],
    queryFn: async () => {
      const res = await fetch(
        `/api/funds/${currentFund.id}/optimal-reserves/results?jobId=${jobId}`
      );
      return res.json();
    },
    enabled: !!jobId,
    refetchInterval: (data) => {
      // Stop polling when completed
      return data?.status === 'completed' ? false : 2000;
    }
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Optimal Reserves Ranking</h1>
          <p className="text-gray-600 mt-2">
            Data-driven reserve allocation recommendations based on expected MOIC
          </p>
        </div>

        <Button
          onClick={() => calculateMutation.mutate()}
          disabled={calculateMutation.isPending || results?.status === 'active'}
        >
          {results?.status === 'active' ? 'Calculating...' : 'Calculate Optimal Reserves'}
        </Button>
      </div>

      {/* Calculation Progress */}
      {results?.status === 'active' && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Running Monte Carlo simulations...</span>
                <span className="text-sm text-gray-600">{results.progress}%</span>
              </div>
              <Progress value={results.progress} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Table */}
      {results?.status === 'completed' && results.data && (
        <Card>
          <CardHeader>
            <CardTitle>Portfolio Rankings by Follow-On Multiple</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3">Rank</th>
                    <th className="text-left p-3">Company</th>
                    <th className="text-right p-3">Follow-On Multiple</th>
                    <th className="text-right p-3">Expected MOIC</th>
                    <th className="text-right p-3">Current Reserves</th>
                    <th className="text-right p-3">Recommended</th>
                    <th className="text-right p-3">Deployed</th>
                    <th className="text-center p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {results.data.map((company: ReserveRecommendation) => (
                    <tr key={company.companyId} className="border-b hover:bg-gray-50">
                      <td className="p-3">
                        <Badge variant={company.rank <= 3 ? 'default' : 'secondary'}>
                          #{company.rank}
                        </Badge>
                      </td>
                      <td className="p-3 font-medium">{company.companyName}</td>
                      <td className="p-3 text-right">
                        <span className={`font-bold ${
                          company.followOnMultiple >= 3 ? 'text-green-600' :
                          company.followOnMultiple >= 2 ? 'text-yellow-600' :
                          'text-gray-600'
                        }`}>
                          {company.followOnMultiple.toFixed(2)}x
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {company.expectedMOIC.toFixed(2)}x
                      </td>
                      <td className="p-3 text-right">
                        ${(company.currentReserveAllocation / 1_000_000).toFixed(1)}M
                      </td>
                      <td className="p-3 text-right">
                        <span className={
                          company.recommendedAllocation > company.currentReserveAllocation
                            ? 'text-green-600 font-semibold'
                            : company.recommendedAllocation < company.currentReserveAllocation
                            ? 'text-orange-600 font-semibold'
                            : ''
                        }>
                          ${(company.recommendedAllocation / 1_000_000).toFixed(1)}M
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        ${(company.deployedReserves / 1_000_000).toFixed(1)}M
                      </td>
                      <td className="p-3 text-center">
                        {company.recommendedAllocation > company.currentReserveAllocation && (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            <TrendingUp className="w-3 h-3 mr-1" />
                            Increase
                          </Badge>
                        )}
                        {company.recommendedAllocation < company.currentReserveAllocation && (
                          <Badge variant="outline" className="text-orange-600 border-orange-600">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Reduce
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Insights Panel */}
      {results?.status === 'completed' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3">
                <Target className="w-8 h-8 text-blue-600" />
                <div>
                  <div className="text-2xl font-bold">
                    {results.data.filter((r: ReserveRecommendation) => r.followOnMultiple > 3).length}
                  </div>
                  <div className="text-sm text-gray-600">High-Opportunity Companies</div>
                  <div className="text-xs text-gray-500 mt-1">Follow-on multiple &gt; 3.0x</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3">
                <DollarSign className="w-8 h-8 text-green-600" />
                <div>
                  <div className="text-2xl font-bold">
                    ${(
                      results.data.reduce((sum: number, r: ReserveRecommendation) =>
                        sum + (r.recommendedAllocation - r.currentReserveAllocation), 0
                      ) / 1_000_000
                    ).toFixed(1)}M
                  </div>
                  <div className="text-sm text-gray-600">Total Reallocation</div>
                  <div className="text-xs text-gray-500 mt-1">Suggested capital movement</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3">
                <TrendingUp className="w-8 h-8 text-purple-600" />
                <div>
                  <div className="text-2xl font-bold">
                    {(
                      results.data.reduce((sum: number, r: ReserveRecommendation) =>
                        sum + r.expectedMOIC, 0) / results.data.length
                    ).toFixed(2)}x
                  </div>
                  <div className="text-sm text-gray-600">Avg Expected MOIC</div>
                  <div className="text-xs text-gray-500 mt-1">On next $1M invested</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
```

**✅ Phase 3 Outcome**: AI-driven reserve allocation with actionable rankings

---

## 🔄 Phase 4: Cross-Feature Integration (Week 8)

### Time-Aware Reserve Recommendations

```typescript
// client/src/hooks/useTimeAwareReserves.ts

export function useTimeAwareReserves(fundId: string) {
  const { currentTimestamp } = useTimeMachine(fundId);

  return useQuery({
    queryKey: ['reserves', fundId, currentTimestamp.toISOString()],
    queryFn: async () => {
      // Calculate reserves based on historical fund state
      const res = await fetch(
        `/api/funds/${fundId}/optimal-reserves/calculate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            asOfDate: currentTimestamp.toISOString(),
          }),
        }
      );
      return res.json();
    },
  });
}
```

### Unified Analytics Dashboard

```typescript
// client/src/pages/analytics-hub.tsx

export default function AnalyticsHub() {
  const { currentFund } = useFundContext();
  const { currentTimestamp } = useTimeMachine(currentFund.id);
  const { data: variance } = useVarianceAnalysis(currentFund.id);
  const { data: reserves } = useTimeAwareReserves(currentFund.id);

  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="time-machine">Time Machine</TabsTrigger>
        <TabsTrigger value="variance">Variance Tracking</TabsTrigger>
        <TabsTrigger value="reserves">Optimal Reserves</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        {/* Cross-feature insights */}
        <InsightPanel
          variance={variance}
          reserves={reserves}
          timestamp={currentTimestamp}
        />
      </TabsContent>

      {/* Other tabs... */}
    </Tabs>
  );
}
```

---

## 🚀 Performance Optimization

### Demo Mode (<2s Response)

- Pre-calculate reserve rankings for sample data
- Use 2,000 Monte Carlo iterations instead of 10,000
- Serve from Redis cache
- Implement React.memo() on heavy components

### Production Mode (<5s Response)

- Background jobs for hourly recalculation
- 10,000+ Monte Carlo iterations
- PostgreSQL materialized views for variance summaries
- Edge caching via CDN

---

## 📋 Testing Strategy

### Unit Tests

```typescript
// Verify event sourcing correctness
describe('FundProjector', () => {
  it('should reconstruct fund state from events', async () => {
    const events = [
      { type: 'INVESTMENT_MADE', payload: { amount: 1000000 } },
      { type: 'VALUATION_UPDATED', payload: { newValue: 5000000 } },
    ];

    const state = await projector.applyEvents(initialState, events);
    expect(state.totalInvested).toBe(1000000);
  });
});

// Verify reserve ranking logic
describe('ReserveOptimizationEngine', () => {
  it('should rank companies by follow-on multiple', async () => {
    const recommendations = await engine.calculateOptimalReserves(fundId);
    expect(recommendations[0].followOnMultiple).toBeGreaterThan(
      recommendations[1].followOnMultiple
    );
  });
});
```

### Integration Tests

```typescript
// End-to-end event sourcing
it('should persist events and enable time travel', async () => {
  await createInvestment(fundId, { amount: 1000000, companyId: 'abc' });
  const stateNow = await getFundState(fundId, new Date());
  const statePast = await getFundState(fundId, oneDayAgo);

  expect(stateNow.totalInvested).toBe(1000000);
  expect(statePast.totalInvested).toBe(0);
});
```

---

## 📦 Deployment Checklist

- [ ] Database migrations for new tables
- [ ] Redis configured for caching
- [ ] BullMQ workers deployed
- [ ] Environment variables set (`MONTE_CARLO_ITERATIONS`, `SNAPSHOT_FREQUENCY`)
- [ ] Monitoring alerts for failed background jobs
- [ ] Documentation updated
- [ ] Feature flags enabled (`FF_TIME_MACHINE`, `FF_OPTIMAL_RESERVES`)

---

## 🎯 Success Metrics

**Technical:**

- Time Machine queries: <500ms (with snapshots)
- Variance calculations: <2s
- Reserve optimization: <5s (10K iterations)
- Event throughput: 1000+ events/sec

**Business:**

- Time to insights: <10 seconds from "Calculate" click
- Alert delivery: <1 minute from variance detection
- Reserve recommendation adoption: >40% of recommendations acted upon

---

## 🔮 Future Enhancements

1. **Predictive Variance**: Use ML to predict future variances before they occur
2. **Automated Reserve Rebalancing**: One-click execution of recommendations
3. **Multi-Fund Comparison**: Compare reserve strategies across funds
4. **Scenario Branching**: "What-if" analysis using time machine states
5. **External Data Integration**: Pull market data, comps, public valuations

---

**This strategy delivers production-ready features while maintaining the
existing codebase's quality standards. Each phase builds on the previous,
creating a cohesive analytics platform.**
