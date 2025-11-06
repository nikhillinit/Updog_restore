# PacingEngine Integration Guide

**Module:** `client/src/core/pacing/PacingEngine.ts` **Purpose:** Practical API
usage patterns, integration examples, and production deployment guidance
**Estimated Reading Time:** 10-15 minutes **Target Audience:** Backend
developers, integration engineers, DevOps, QA engineers

---

## Table of Contents

1. [API Usage Patterns](#api-usage-patterns)
2. [Worker Integration](#worker-integration)
3. [Database Schema and Storage](#database-schema-and-storage)
4. [Integration with Other Engines](#integration-with-other-engines)
5. [Real-World Scenarios](#real-world-scenarios)
6. [Common Pitfalls and Solutions](#common-pitfalls-and-solutions)
7. [Performance Considerations](#performance-considerations)
8. [Testing Strategies](#testing-strategies)
9. [Monitoring and Observability](#monitoring-and-observability)

---

## API Usage Patterns

### Basic Usage: Direct Function Call

**Simplest Pattern:**

```typescript
import { PacingEngine } from '@/core/pacing/PacingEngine';

// Minimal input
const input = {
  fundSize: 50000000, // $50M fund
  deploymentQuarter: 1, // Start in Q1
  marketCondition: 'neutral', // Balanced pacing
};

const deployments = PacingEngine(input);

// Returns: PacingOutput[]
// [
//   { quarter: 1, deployment: 6437500, note: "neutral market pacing (early-stage focus)" },
//   { quarter: 2, deployment: 6062500, note: "neutral market pacing (early-stage focus)" },
//   ...
// ]
```

**Code Reference:**
[PacingEngine.ts:124-137](client/src/core/pacing/PacingEngine.ts#L124)

---

### Advanced Usage: Summary Generation

**For comprehensive metadata:**

```typescript
import { generatePacingSummary } from '@/core/pacing/PacingEngine';
import type { PacingInput, PacingSummary } from '@shared/types';

const input: PacingInput = {
  fundSize: 100000000,
  deploymentQuarter: 5,
  marketCondition: 'bull',
};

const summary: PacingSummary = generatePacingSummary(input);

// Returns: PacingSummary
// {
//   fundSize: 100000000,
//   totalQuarters: 8,
//   avgQuarterlyDeployment: 12500000,  // Rounded average
//   marketCondition: 'bull',
//   deployments: [...],                 // Full PacingOutput[]
//   generatedAt: Date                   // Timestamp
// }
```

**Use Case:** Dashboard displays, reporting, scenario comparison

**Code Reference:**
[PacingEngine.ts:144-159](client/src/core/pacing/PacingEngine.ts#L144)

**Test Evidence:**
[pacing-engine.test.ts:255-293](tests/unit/engines/pacing-engine.test.ts#L255)

---

### Input Validation and Error Handling

**Automatic Validation with Zod:**

```typescript
import { PacingEngine } from '@/core/pacing/PacingEngine';

// Invalid input: negative fund size
try {
  const result = PacingEngine({
    fundSize: -1000000, // ❌ Invalid
    deploymentQuarter: 1,
    marketCondition: 'neutral',
  });
} catch (error) {
  console.error(error.message);
  // "Invalid pacing input: fundSize must be >= 0"
}

// Invalid input: missing required field
try {
  const result = PacingEngine({
    fundSize: 50000000,
    // ❌ Missing deploymentQuarter and marketCondition
  });
} catch (error) {
  console.error(error.message);
  // "Invalid pacing input: deploymentQuarter is required"
}

// Invalid input: wrong market condition
try {
  const result = PacingEngine({
    fundSize: 50000000,
    deploymentQuarter: 1,
    marketCondition: 'sideways', // ❌ Not in enum
  });
} catch (error) {
  console.error(error.message);
  // "Invalid pacing input: marketCondition must be 'bull', 'bear', or 'neutral'"
}
```

**Validation Logic:**
[PacingEngine.ts:25-31](client/src/core/pacing/PacingEngine.ts#L25)

**Schema Definition:** [shared/types.ts:113-117](shared/types.ts#L113)

**Test Coverage:**
[pacing-engine.test.ts:24-53](tests/unit/engines/pacing-engine.test.ts#L24)

---

### Type-Safe Integration

**Recommended Pattern for TypeScript:**

```typescript
import type { PacingInput, PacingOutput, PacingSummary } from '@shared/types';
import { PacingInputSchema } from '@shared/types';
import {
  PacingEngine,
  generatePacingSummary,
} from '@/core/pacing/PacingEngine';

// Type-safe input construction
function createPacingRequest(
  fundSize: number,
  startQuarter: number,
  condition: 'bull' | 'bear' | 'neutral'
): PacingInput {
  const input = {
    fundSize,
    deploymentQuarter: startQuarter,
    marketCondition: condition,
  };

  // Validate at runtime
  const validated = PacingInputSchema.parse(input);
  return validated;
}

// Usage
const input = createPacingRequest(50000000, 1, 'neutral');
const deployments: PacingOutput[] = PacingEngine(input);
const summary: PacingSummary = generatePacingSummary(input);
```

---

### Algorithm Mode Configuration

**Environment-Based Mode Selection:**

```typescript
// Option 1: Enable ML mode globally
process.env['ALG_PACING'] = 'true';

const result = PacingEngine(input);
// Uses ML-enhanced calculation with trend adjustments

// Option 2: Development mode auto-enables ML
process.env['NODE_ENV'] = 'development';

const result = PacingEngine(input);
// Also uses ML-enhanced calculation

// Option 3: Production mode (rule-based)
delete process.env['ALG_PACING'];
process.env['NODE_ENV'] = 'production';

const result = PacingEngine(input);
// Uses rule-based calculation (default)
```

**Mode Detection:**
[PacingEngine.ts:47-49](client/src/core/pacing/PacingEngine.ts#L47)

**Test Coverage:**
[pacing-engine.test.ts:191-222](tests/unit/engines/pacing-engine.test.ts#L191)

---

## Worker Integration

### BullMQ Job Processing

The **pacing-worker** handles background calculations asynchronously via Redis
queues.

**Worker Setup:**
[workers/pacing-worker.ts:31-152](workers/pacing-worker.ts#L31)

```typescript
import { Worker } from 'bullmq';
import { generatePacingSummary } from '../client/src/core/pacing/PacingEngine';
import type { PacingInput } from '@shared/types';

interface PacingJobData {
  fundId: number;
  correlationId: string;
  marketCondition?: 'bull' | 'bear' | 'neutral';
  deploymentQuarter?: number;
}

export const pacingWorker = new Worker<PacingJobData>(
  'pacing:calc', // Queue name
  async (job) => {
    const {
      fundId,
      correlationId,
      marketCondition = 'neutral',
      deploymentQuarter = 1,
    } = job.data;

    // 1. Load fund data from database
    const fund = await db.query.funds.findFirst({
      where: eq(funds.id, fundId),
    });

    if (!fund) {
      throw new Error(`Fund ${fundId} not found`);
    }

    // 2. Prepare pacing input
    const pacingInput: PacingInput = {
      fundSize: parseFloat(fund.size),
      deploymentQuarter,
      marketCondition,
    };

    // 3. Generate pacing calculations
    const pacingSummary = generatePacingSummary(pacingInput);

    // 4. Store results in database
    const historyInserts = pacingSummary.deployments.map((deployment) => ({
      fundId,
      quarter: `Q${deployment.quarter}`,
      deploymentAmount: deployment.deployment.toString(),
      marketCondition,
    }));

    for (const history of historyInserts) {
      await db
        .insert(pacingHistory)
        .values(history)
        .onConflictDoUpdate({
          target: [pacingHistory.fundId, pacingHistory.quarter],
          set: {
            deploymentAmount: history.deploymentAmount,
            marketCondition: history.marketCondition,
          },
        });
    }

    // 5. Create snapshot
    const [snapshot] = await db
      .insert(fundSnapshots)
      .values({
        fundId,
        type: 'PACING',
        payload: pacingSummary,
        calcVersion: process.env.ALG_PACING_VERSION || '1.0.0',
        correlationId,
        snapshotTime: new Date(),
        metadata: {
          totalQuarters: pacingSummary.totalQuarters,
          avgQuarterlyDeployment: pacingSummary.avgQuarterlyDeployment,
          marketCondition: pacingSummary.marketCondition,
        },
      })
      .returning();

    return {
      fundId,
      snapshotId: snapshot.id,
      pacing: pacingSummary,
      calculatedAt: snapshot.createdAt,
      version: snapshot.calcVersion,
    };
  },
  {
    connection: { host: 'localhost', port: 6379 },
    concurrency: 5,
  }
);
```

**Key Features:**

1. **Async Processing:** Non-blocking API responses
2. **Database Persistence:** Results stored in `fundSnapshots` and
   `pacingHistory`
3. **Error Handling:** Automatic retry logic via BullMQ
4. **Metrics Collection:** Prometheus metrics for observability
5. **Health Monitoring:** Dedicated health check endpoint on port 9002

---

### Job Enqueueing Pattern

**API Endpoint Integration:**

```typescript
import { Queue } from 'bullmq';

const pacingQueue = new Queue('pacing:calc', {
  connection: { host: 'localhost', port: 6379 },
});

// Express route handler
app.post('/api/funds/:fundId/pacing', async (req, res) => {
  const { fundId } = req.params;
  const { marketCondition = 'neutral', deploymentQuarter = 1 } = req.body;

  // Enqueue background job
  const job = await pacingQueue.add('calculate', {
    fundId: parseInt(fundId),
    correlationId: generateUUID(),
    marketCondition,
    deploymentQuarter,
  });

  res.status(202).json({
    message: 'Pacing calculation enqueued',
    jobId: job.id,
    status: 'processing',
  });
});

// Poll for results
app.get('/api/funds/:fundId/pacing/status/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const job = await pacingQueue.getJob(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const state = await job.getState();
  const result = await job.returnvalue;

  res.json({
    jobId: job.id,
    state,
    result,
  });
});
```

**Trade-off:** Asynchronous pattern requires polling or webhooks for result
retrieval, but enables high-throughput API.

---

### Worker Health Monitoring

**Health Check Server:**
[workers/pacing-worker.ts:158-159](workers/pacing-worker.ts#L158)

```bash
# Health check endpoint
curl http://localhost:9002/health

# Response:
{
  "status": "healthy",
  "workers": {
    "pacing-calc": {
      "status": "active",
      "processed": 1234,
      "failed": 5,
      "uptime": 86400
    }
  }
}
```

**Configuration:**

- Health port: `PACING_WORKER_HEALTH_PORT` (default: 9002)
- Graceful shutdown: SIGTERM/SIGINT handlers

---

## Database Schema and Storage

### Tables Used

**1. fundSnapshots Table:**

```sql
CREATE TABLE fund_snapshots (
  id SERIAL PRIMARY KEY,
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  type VARCHAR(50) NOT NULL,           -- 'PACING', 'RESERVES', 'COHORTS', etc.
  payload JSONB NOT NULL,              -- Full PacingSummary object
  calc_version VARCHAR(20) NOT NULL,   -- Algorithm version
  correlation_id UUID NOT NULL,        -- Request tracing
  snapshot_time TIMESTAMP NOT NULL,
  metadata JSONB,                      -- Additional metrics
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_fund_snapshots_fund_type ON fund_snapshots(fund_id, type);
CREATE INDEX idx_fund_snapshots_correlation ON fund_snapshots(correlation_id);
```

**2. pacingHistory Table:**

```sql
CREATE TABLE pacing_history (
  id SERIAL PRIMARY KEY,
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  quarter VARCHAR(10) NOT NULL,         -- 'Q1', 'Q2', etc.
  deployment_amount DECIMAL(15,2) NOT NULL,
  market_condition VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(fund_id, quarter)              -- One entry per quarter
);

CREATE INDEX idx_pacing_history_fund ON pacing_history(fund_id);
```

**Implementation:**
[workers/pacing-worker.ts:62-80](workers/pacing-worker.ts#L62)

---

### Query Patterns

**Retrieve Latest Pacing Calculation:**

```typescript
import { db } from '../server/db';
import { fundSnapshots } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';

async function getLatestPacing(fundId: number) {
  const snapshot = await db.query.fundSnapshots.findFirst({
    where: and(
      eq(fundSnapshots.fundId, fundId),
      eq(fundSnapshots.type, 'PACING')
    ),
    orderBy: [desc(fundSnapshots.createdAt)],
  });

  return snapshot?.payload as PacingSummary;
}
```

**Retrieve Historical Deployments:**

```typescript
import { pacingHistory } from '@shared/schema';

async function getDeploymentHistory(fundId: number) {
  const history = await db.query.pacingHistory.findMany({
    where: eq(pacingHistory.fundId, fundId),
    orderBy: [pacingHistory.quarter],
  });

  return history.map((h) => ({
    quarter: h.quarter,
    amount: parseFloat(h.deploymentAmount),
    condition: h.marketCondition,
    date: h.createdAt,
  }));
}
```

**Compare Scenarios:**

```typescript
async function comparePacingScenarios(
  fundId: number,
  correlationIds: string[]
) {
  const snapshots = await db.query.fundSnapshots.findMany({
    where: and(
      eq(fundSnapshots.fundId, fundId),
      eq(fundSnapshots.type, 'PACING')
      // Filter by correlation IDs
    ),
  });

  return snapshots.map((s) => ({
    correlationId: s.correlationId,
    marketCondition: s.metadata.marketCondition,
    avgQuarterly: s.metadata.avgQuarterlyDeployment,
    summary: s.payload as PacingSummary,
  }));
}
```

---

## Integration with Other Engines

### 1. ReserveEngine Coordination

**Pacing schedules feed into reserve allocation:**

```typescript
import { PacingEngine } from '@/core/pacing/PacingEngine';
import { ReserveEngine } from '@/core/reserves/ConstrainedReserveEngine';

// Step 1: Calculate pacing schedule
const pacingInput = {
  fundSize: 100000000,
  deploymentQuarter: 1,
  marketCondition: 'bull',
};

const deployments = PacingEngine(pacingInput);

// Step 2: Use pacing to determine available capital per quarter
const quarterlyCapital = deployments.map((d) => d.deployment);

// Step 3: Allocate reserves from available capital
const reserveResults = await ReserveEngine.allocateForQuarter({
  availableCapital: quarterlyCapital[0], // Q1 deployment
  existingInvestments: portfolioCompanies,
  reserveMultiple: 2.0,
});

// Result: Ensures reserves don't exceed paced deployment
```

**Use Case:** Prevent over-commitment of capital by coordinating pacing with
reserve requirements.

**Cross-Reference:** See `docs/notebooklm-sources/reserves/` for ReserveEngine
integration patterns.

---

### 2. CohortEngine Integration

**Pacing influences cohort formation:**

```typescript
import { PacingEngine } from '@/core/pacing/PacingEngine';
import { CohortEngine } from '@/core/cohorts/CohortEngine';

// Calculate pacing
const deployments = PacingEngine({
  fundSize: 50000000,
  deploymentQuarter: 1,
  marketCondition: 'neutral',
});

// Group investments by quarter (early/mid/late phases)
const earlyPhaseDeployments = deployments.slice(0, 3);
const midPhaseDeployments = deployments.slice(3, 6);
const latePhaseDeployments = deployments.slice(6, 8);

// Analyze cohort performance by phase
const cohortResults = await CohortEngine.analyzeByVintage({
  vintageYear: 2024,
  phases: {
    early: earlyPhaseDeployments.map((d) => d.deployment),
    mid: midPhaseDeployments.map((d) => d.deployment),
    late: latePhaseDeployments.map((d) => d.deployment),
  },
});

// Result: Correlate pacing strategy with cohort IRR/MOIC
```

---

### 3. Monte Carlo Simulation Integration

**Pacing schedules as simulation inputs:**

```typescript
import {
  PacingEngine,
  generatePacingSummary,
} from '@/core/pacing/PacingEngine';
import { runMonteCarloSimulation } from '@/core/monte-carlo/SimulationEngine';

// Generate pacing schedule
const pacingSummary = generatePacingSummary({
  fundSize: 100000000,
  deploymentQuarter: 1,
  marketCondition: 'bull',
});

// Use pacing in Monte Carlo simulation
const simulationResults = await runMonteCarloSimulation({
  initialCapital: pacingSummary.fundSize,
  deploymentSchedule: pacingSummary.deployments,
  runs: 10000,
  periods: 40, // 10 years quarterly
  // ... other params
});

// Result: Model portfolio outcomes under different pacing strategies
```

**Use Case:** Test "what-if" scenarios like "What's the expected IRR if we
front-load vs back-load deployment?"

---

## Real-World Scenarios

### Scenario 1: New Fund Launch (Neutral Market)

**Context:**

- $50M fund raised in Q1 2024
- No strong market signals
- First-time fund manager seeking balanced risk

**Implementation:**

```typescript
const input = {
  fundSize: 50000000,
  deploymentQuarter: 1,
  marketCondition: 'neutral',
};

const summary = generatePacingSummary(input);

// Expected result:
// - 8 quarters: Q1-Q8 2024-2025
// - ~$6.25M per quarter (±10% variance)
// - Even distribution across early/mid/late phases
// - Total: ~$50M deployed over 2 years
```

**Dashboard Display:**

```typescript
function PacingDashboard({ summary }) {
  return (
    <div>
      <h2>Deployment Schedule</h2>
      <p>Total Fund: ${formatCurrency(summary.fundSize)}</p>
      <p>Avg Quarterly: ${formatCurrency(summary.avgQuarterlyDeployment)}</p>
      <p>Strategy: {summary.marketCondition}</p>

      <table>
        <thead>
          <tr>
            <th>Quarter</th>
            <th>Deployment</th>
            <th>Phase</th>
          </tr>
        </thead>
        <tbody>
          {summary.deployments.map(d => (
            <tr key={d.quarter}>
              <td>Q{d.quarter}</td>
              <td>${formatCurrency(d.deployment)}</td>
              <td>{d.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

### Scenario 2: Bull Market Opportunity (Front-Loaded)

**Context:**

- $100M growth equity fund in 2021 tech boom
- High valuations and competitive deal flow
- Need to secure allocations quickly

**Implementation:**

```typescript
const input = {
  fundSize: 100000000,
  deploymentQuarter: 5, // Q1 2021
  marketCondition: 'bull',
};

const summary = generatePacingSummary(input);

// Expected result:
// - Early phase (Q5-7): ~$49M (49%)
// - Mid phase (Q8-10): ~$33M (33%)
// - Late phase (Q11-12): ~$18M (18%)
// - Total: ~$100M, heavily front-loaded
```

**Risk Management:**

```typescript
// Monitor actual vs. planned deployment
const actualDeployment = await getActualSpendByQuarter(fundId);

summary.deployments.forEach((planned, index) => {
  const actual = actualDeployment[index];
  const variance = (actual - planned.deployment) / planned.deployment;

  if (Math.abs(variance) > 0.2) {
    console.warn(`Q${planned.quarter} variance: ${variance * 100}%`);
    // Alert: Adjust pacing for remaining quarters
  }
});
```

---

### Scenario 3: Bear Market Caution (Back-Loaded)

**Context:**

- $75M fund launching in Q4 2022 (tech downturn)
- High valuation uncertainty
- Strategy: Wait for better pricing

**Implementation:**

```typescript
const input = {
  fundSize: 75000000,
  deploymentQuarter: 16, // Q4 2022
  marketCondition: 'bear',
};

const summary = generatePacingSummary(input);

// Expected result:
// - Early phase (Q16-18): ~$19.5M (26%)
// - Mid phase (Q19-21): ~$22.5M (30%)
// - Late phase (Q22-23): ~$33M (44%)
// - Total: ~$75M, heavily back-loaded
```

**Adaptive Strategy:**

```typescript
// Re-calculate pacing mid-cycle if market shifts
async function adjustPacingStrategy(
  fundId: number,
  newCondition: 'bull' | 'bear' | 'neutral'
) {
  const currentPacing = await getLatestPacing(fundId);
  const remainingCapital = calculateRemainingCapital(currentPacing);
  const currentQuarter = getCurrentQuarter();

  // Generate new pacing for remaining quarters
  const adjustedInput = {
    fundSize: remainingCapital,
    deploymentQuarter: currentQuarter,
    marketCondition: newCondition,
  };

  const newSummary = generatePacingSummary(adjustedInput);

  // Store as new scenario
  await storePacingScenario(fundId, newSummary, 'adjusted-strategy');

  return newSummary;
}
```

---

### Scenario 4: Multi-Scenario Planning

**Context:**

- Fund planning committee wants to compare 3 strategies
- Need to visualize impact of different market assumptions

**Implementation:**

```typescript
const baseInput = {
  fundSize: 50000000,
  deploymentQuarter: 1,
};

// Generate 3 scenarios
const scenarios = ['bull', 'bear', 'neutral'].map((condition) => ({
  condition,
  summary: generatePacingSummary({
    ...baseInput,
    marketCondition: condition as 'bull' | 'bear' | 'neutral',
  }),
}));

// Compare cumulative deployment
const comparisonData = scenarios.map((s) => ({
  condition: s.condition,
  cumulative: s.summary.deployments.reduce(
    (acc, d, i) => {
      acc.push({
        quarter: d.quarter,
        total: (acc[i - 1]?.total || 0) + d.deployment,
      });
      return acc;
    },
    [] as Array<{ quarter: number; total: number }>
  ),
}));

// Visualization: Chart cumulative deployment curves
```

**Test Evidence:** Multi-scenario testing validated in
[pacing-engine.test.ts:95-108](tests/unit/engines/pacing-engine.test.ts#L95)

---

## Common Pitfalls and Solutions

### Pitfall 1: Ignoring Deterministic Seed Reset

**Problem:**

```typescript
// WRONG: No seed reset between calls
const prng = new PRNG(123);

function calculatePacing(input) {
  // Missing: prng.reset(123);
  // Result: Each call produces different output
}

const result1 = calculatePacing(input); // Uses seed state 123
const result2 = calculatePacing(input); // Uses seed state 124 (advanced)
// result1 !== result2 (inconsistent)
```

**Solution:**

```typescript
// CORRECT: Reset seed on every invocation
export function PacingEngine(input: unknown): PacingOutput[] {
  prng.reset(123); // ✓ Ensures consistency
  // ...
}
```

**Why It Matters:** Testing, auditing, and scenario comparison require
deterministic results.

**Code Reference:**
[PacingEngine.ts:126](client/src/core/pacing/PacingEngine.ts#L126)

---

### Pitfall 2: Assuming Total Deployment = Fund Size

**Problem:**

```typescript
const summary = generatePacingSummary({ fundSize: 50000000, ... });
const total = summary.deployments.reduce((sum, d) => sum + d.deployment, 0);

// Assumption: total === 50000000 (WRONG)
// Actual: total ≈ 50000000 ± 10% due to variability
```

**Solution:**

```typescript
// Accept soft constraint
expect(total).toBeGreaterThan(45000000); // Within 10%
expect(total).toBeLessThan(55000000); // Within 10%

// Or normalize if exact total required
const normalized = summary.deployments.map((d) => ({
  ...d,
  deployment: Math.round((d.deployment / total) * summary.fundSize),
}));
```

**Test Evidence:**
[pacing-engine.test.ts:157-167](tests/unit/engines/pacing-engine.test.ts#L157)

---

### Pitfall 3: Mixing Algorithm Modes Unintentionally

**Problem:**

```typescript
// Development environment auto-enables ML mode
process.env['NODE_ENV'] = 'development';

const result1 = PacingEngine(input); // Uses ML mode
// Later in production...
const result2 = PacingEngine(input); // Uses rule-based mode
// result1 !== result2 (different algorithms)
```

**Solution:**

```typescript
// Explicitly control algorithm mode
function calculatePacingWithMode(input, useML = false) {
  const originalMode = process.env['ALG_PACING'];

  if (useML) {
    process.env['ALG_PACING'] = 'true';
  } else {
    delete process.env['ALG_PACING'];
  }

  const result = PacingEngine(input);

  // Restore original setting
  if (originalMode) {
    process.env['ALG_PACING'] = originalMode;
  } else {
    delete process.env['ALG_PACING'];
  }

  return result;
}
```

**Best Practice:** Document algorithm mode in `fundSnapshots.calcVersion`:

```typescript
calcVersion: process.env.ALG_PACING === 'true' ? '1.1.0-ml' : '1.0.0-rule';
```

---

### Pitfall 4: Not Handling Edge Cases

**Problem:**

```typescript
// Very small fund
const input = {
  fundSize: 10000,
  deploymentQuarter: 1,
  marketCondition: 'neutral',
};
const result = PacingEngine(input);

// BaseAmount = 10000 / 8 = 1250 per quarter
// After rounding: Some quarters may be $0 or negative? (NO, but totals may vary significantly)
```

**Solution:**

```typescript
// Validate minimum fund size for reasonable pacing
function validateFundSizeForPacing(fundSize: number): boolean {
  const minReasonableFund = 1000000; // $1M minimum
  return fundSize >= minReasonableFund;
}

if (!validateFundSizeForPacing(input.fundSize)) {
  console.warn(
    'Fund size too small for quarterly pacing. Consider annual pacing.'
  );
}
```

**Test Evidence:** Edge cases validated in
[pacing-engine.test.ts:299-336](tests/unit/engines/pacing-engine.test.ts#L299)

---

### Pitfall 5: Ignoring Market Condition Context

**Problem:**

```typescript
// Using bull market pacing in obvious bear market
const input = {
  fundSize: 50000000,
  deploymentQuarter: 1,
  marketCondition: 'bull', // ❌ But market is actually in recession
};
```

**Solution:**

```typescript
// Add market condition validation layer
async function getPacingWithMarketValidation(
  fundId: number,
  suggestedCondition: string
) {
  const actualMarketCondition = await getMarketIndicators();

  if (actualMarketCondition !== suggestedCondition) {
    console.warn(
      `Mismatch: Suggested '${suggestedCondition}' but indicators show '${actualMarketCondition}'`
    );
    // Prompt user to confirm or adjust
  }

  return generatePacingSummary({
    fundSize: await getFundSize(fundId),
    deploymentQuarter: getCurrentQuarter(),
    marketCondition: suggestedCondition as 'bull' | 'bear' | 'neutral',
  });
}
```

---

## Performance Considerations

### Time Complexity Analysis

**Algorithm Performance:**

- **PacingEngine:** O(1) - Fixed 8 iterations
- **generatePacingSummary:** O(1) - Single pass over 8-element array
- **Total:** O(1) constant time

**Benchmark (typical hardware):**

```typescript
import { performance } from 'perf_hooks';

const start = performance.now();
const result = PacingEngine(input);
const duration = performance.now() - start;

console.log(`Calculation time: ${duration.toFixed(2)}ms`);
// Typical: 0.1-0.5ms (sub-millisecond)
```

---

### Memory Footprint

**Memory Usage:**

- Input: ~100 bytes (3 fields)
- Output: ~800 bytes (8 objects × ~100 bytes each)
- PRNG state: ~50 bytes
- **Total:** <1KB per calculation

**Scalability:**

- Can handle 10,000+ calculations per second on single core
- No memory leaks (no persistent state between calls)

---

### Optimization Opportunities

**1. Batch Processing:**

```typescript
// Process multiple funds in parallel
async function batchCalculatePacing(fundIds: number[]) {
  const results = await Promise.all(
    fundIds.map(async (fundId) => {
      const fund = await getFund(fundId);
      return {
        fundId,
        summary: generatePacingSummary({
          fundSize: fund.size,
          deploymentQuarter: 1,
          marketCondition: 'neutral',
        }),
      };
    })
  );

  return results;
}
```

**2. Caching:**

```typescript
import NodeCache from 'node-cache';

const pacingCache = new NodeCache({ stdTTL: 3600 }); // 1-hour cache

function getCachedPacing(input: PacingInput): PacingSummary {
  const cacheKey = JSON.stringify(input);
  const cached = pacingCache.get<PacingSummary>(cacheKey);

  if (cached) {
    return cached;
  }

  const summary = generatePacingSummary(input);
  pacingCache.set(cacheKey, summary);
  return summary;
}
```

**Trade-off:** Pacing calculation is so fast (<1ms) that caching overhead may
exceed benefit. Only cache if database lookups dominate.

---

## Testing Strategies

### Unit Testing Pattern

**Test Structure:**
[pacing-engine.test.ts](tests/unit/engines/pacing-engine.test.ts#L1)

```typescript
import { describe, it, expect } from 'vitest';
import {
  PacingEngine,
  generatePacingSummary,
} from '@/core/pacing/PacingEngine';

describe('PacingEngine - Input Validation', () => {
  it('should reject invalid fund size', () => {
    const input = {
      fundSize: -1000000,
      deploymentQuarter: 1,
      marketCondition: 'neutral',
    };
    expect(() => PacingEngine(input)).toThrow('Invalid pacing input');
  });
});

describe('PacingEngine - Market Condition Adjustments', () => {
  it('should front-load deployment in bull markets', () => {
    const input = {
      fundSize: 50000000,
      deploymentQuarter: 1,
      marketCondition: 'bull',
    };
    const result = PacingEngine(input);

    const earlyTotal = result
      .slice(0, 3)
      .reduce((sum, q) => sum + q.deployment, 0);
    const lateTotal = result
      .slice(5, 8)
      .reduce((sum, q) => sum + q.deployment, 0);

    expect(earlyTotal).toBeGreaterThan(lateTotal);
  });
});
```

**Coverage:** 30+ test cases across 336 lines

---

### Integration Testing

**API Endpoint Test:**

```typescript
import request from 'supertest';
import app from '../server/app';

describe('POST /api/funds/:fundId/pacing', () => {
  it('should enqueue pacing calculation', async () => {
    const response = await request(app)
      .post('/api/funds/123/pacing')
      .send({
        marketCondition: 'bull',
        deploymentQuarter: 1,
      })
      .expect(202);

    expect(response.body).toMatchObject({
      message: 'Pacing calculation enqueued',
      jobId: expect.any(String),
      status: 'processing',
    });
  });
});
```

---

### Property-Based Testing

**Invariant Testing:**

```typescript
import { fc, test } from '@fast-check/vitest';

test.prop([
  fc.integer({ min: 1000000, max: 1000000000 }), // Fund size
  fc.integer({ min: 1, max: 100 }), // Quarter
  fc.constantFrom('bull', 'bear', 'neutral'), // Market condition
])(
  'PacingEngine should always return 8 quarters',
  (fundSize, quarter, marketCondition) => {
    const input = { fundSize, deploymentQuarter: quarter, marketCondition };
    const result = PacingEngine(input);

    expect(result).toHaveLength(8);
    expect(result.every((d) => d.deployment >= 0)).toBe(true);
  }
);
```

---

## Monitoring and Observability

### Prometheus Metrics

**Worker Metrics:**
[workers/pacing-worker.ts:98-109](workers/pacing-worker.ts#L98)

```typescript
import { metrics } from '../lib/metrics';

// Record calculation duration
metrics.histogram('pacing_calculation_duration_ms', duration, {
  fundId: fundId.toString(),
  marketCondition,
});

// Count successful calculations
metrics.counter('pacing_calculations_total', 1, {
  fundId: fundId.toString(),
  marketCondition,
});

// Track errors
metrics.counter('pacing_calculation_errors_total', 1, {
  fundId: fundId.toString(),
  errorType: (error as Error).name,
});
```

**Grafana Queries:**

```promql
# Average calculation time
rate(pacing_calculation_duration_ms_sum[5m]) /
rate(pacing_calculation_duration_ms_count[5m])

# Error rate
rate(pacing_calculation_errors_total[5m]) /
rate(pacing_calculations_total[5m])

# Throughput
rate(pacing_calculations_total[1m])
```

---

### Structured Logging

**Logger Integration:**
[workers/pacing-worker.ts:36](workers/pacing-worker.ts#L36)

```typescript
import { logger } from '../lib/logger';

logger.info('Processing pacing calculation', {
  fundId,
  correlationId,
  jobId: job.id,
  marketCondition,
});

logger.info('Pacing calculation completed', {
  fundId,
  correlationId,
  snapshotId: snapshot.id,
  totalQuarters: pacingSummary.totalQuarters,
  avgQuarterlyDeployment: pacingSummary.avgQuarterlyDeployment,
});

logger.error('Pacing calculation failed', error, {
  fundId,
  correlationId,
});
```

**Log Aggregation (e.g., ELK Stack):**

```json
{
  "timestamp": "2025-11-06T12:00:00Z",
  "level": "info",
  "message": "Pacing calculation completed",
  "fundId": 123,
  "correlationId": "abc-123-def",
  "snapshotId": 456,
  "totalQuarters": 8,
  "avgQuarterlyDeployment": 6250000,
  "duration": 45.2
}
```

---

### Alerting Rules

**Example Alerts:**

1. **High Error Rate:**

   ```yaml
   alert: PacingHighErrorRate
   expr: |
     rate(pacing_calculation_errors_total[5m]) /
     rate(pacing_calculations_total[5m]) > 0.05
   annotations:
     summary: 'Pacing error rate > 5%'
   ```

2. **Slow Calculations:**

   ```yaml
   alert: PacingSlowCalculations
   expr: |
     histogram_quantile(0.95,
       rate(pacing_calculation_duration_ms_bucket[5m])
     ) > 100
   annotations:
     summary: 'P95 calculation time > 100ms'
   ```

3. **Worker Downtime:**
   ```yaml
   alert: PacingWorkerDown
   expr: up{job="pacing-worker"} == 0
   annotations:
     summary: 'Pacing worker is down'
   ```

---

## Summary Checklist

**Before Deploying PacingEngine Integration:**

- [ ] Input validation with Zod schemas
- [ ] Error handling for invalid inputs
- [ ] Type-safe TypeScript usage
- [ ] Algorithm mode configuration (ALG_PACING env var)
- [ ] Worker setup with BullMQ
- [ ] Database schema for fundSnapshots and pacingHistory
- [ ] Health monitoring endpoint
- [ ] Prometheus metrics collection
- [ ] Structured logging with correlation IDs
- [ ] Unit tests (30+ cases)
- [ ] Integration tests (API + worker)
- [ ] Performance benchmarking (<1ms calculation time)
- [ ] Caching strategy (if needed)
- [ ] Alerting rules for errors and latency
- [ ] Documentation reviewed and validated

---

## Next Steps

- **[01-overview.md](01-overview.md)** - Conceptual overview and use cases
- **[02-strategies.md](02-strategies.md)** - Mathematical formulas and
  algorithms

---

## Related Documentation

- **Implementation:**
  [PacingEngine.ts](client/src/core/pacing/PacingEngine.ts#L1)
- **Worker:** [pacing-worker.ts](workers/pacing-worker.ts#L1)
- **Test Suite:**
  [pacing-engine.test.ts](tests/unit/engines/pacing-engine.test.ts#L1)
- **Type Definitions:** [shared/types.ts:113-132](shared/types.ts#L113)
- **Validation Config:**
  [pacing-validation.yaml](scripts/validation/pacing-validation.yaml#L1)
- **Database Schema:** `@shared/schema` (fundSnapshots, pacingHistory)

---

**Document Version:** 1.0 **Last Updated:** 2025-11-06 **Validation Status:**
Pending Promptfoo evaluation
