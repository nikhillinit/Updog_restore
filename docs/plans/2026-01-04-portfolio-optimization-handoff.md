---
status: HISTORICAL
last_updated: 2026-01-19
---

# Portfolio Construction & Optimization - Handoff Prompt

**Context**: This is a handoff document for continuing the Portfolio Construction & Optimization design conversation. The design is complete and production-ready, but the context window is approaching limits.

---

## What Has Been Done

We've completed a **comprehensive, production-ready design** for a Portfolio Construction & Optimization system that extends the existing VC fund modeling platform. The design has gone through multiple rigorous review cycles with ultrathink-level scrutiny, addressing:

- **Correctness**: All semantic bugs fixed (MOIC denominators, Big-M values, constraint relaxation, calibration attribution)
- **Crash-safety**: Exactly-once job processing with outbox pattern, stuck job reaper, exponential backoff
- **Concurrency**: FOR UPDATE SKIP LOCKED claiming, idempotency keys, BullMQ deduplication
- **Performance**: Normalized MILP (weights not dollars), Big-M=1, canonical cache keying
- **Debuggability**: matrixKeyJson, normalizedConfigJson, solver metadata, constraint satisfaction reports

---

## Current Status

**Design Phase**: COMPLETE - All critical gaps addressed, production-hardened
**Implementation Phase**: NOT STARTED - Ready to begin implementation
**Documentation**: This handoff document + final design in PLAN.md (to be created)

---

## Next Steps for Continuation

### Immediate Actions

1. **Review Final Design**: Read the complete design from the last ExitPlanMode output (included below as "Final Design Reference")
2. **Create PLAN.md**: Write the final design document to `docs/plans/2026-01-04-portfolio-optimization-design.md`
3. **Begin Implementation**: Start with Phase 1 (Database Schema) - 11 critical tasks
4. **Use Superpowers Workflow**: Follow `/superpowers:write-plan` → `/superpowers:execute-plan` pattern

### Critical Items to Implement First

1. **job_outbox schema**: idempotencyKey UNIQUE + nextRunAt + CHECKs
2. **Canonical CTE claiming**: WITH cte AS (SELECT ... FOR UPDATE SKIP LOCKED)
3. **Exponential backoff**: nextRunAt = NOW() + 2^attempts seconds (cap 300s)
4. **Stuck job reaper**: Separate daemon, resets stale processing → pending
5. **Explicit JSONB casts**: $2::jsonb in all INSERT/UPDATE statements
6. **Payload cleanup on retry**: Clear moicMatrix, bucketKeys when failed → generating
7. **BullMQ jobId**: matrix (matrixKey), optimization (sessionId), validation (sessionId)

---

## Key Design Decisions (Context for Future Work)

### Architecture Pattern
- **Single-objective optimization with guardrails** (NOT multi-objective Pareto solver)
- Maximize expected portfolio multiple subject to constraints
- Lexicographic relaxation for infeasibility (8-level priority)

### Reserve Semantics (LOCKED INVARIANT)
```typescript
// NEVER change this:
allInCost = initialCheckSize * (1 + reserveRatio)  // Allocated capital
m_{b,s} = terminalValue / allInCost                // MOIC per allocated $
// NOT: terminalValue / deployed (would bias optimizer)
```

### Scenario Generation
- **Three-component correlation**: Shared macro regime (40-60%) + bucket systematic (20-30%) + idiosyncratic (20-30%)
- **Stage-by-stage Markov**: Seed → A → B → C with transition probabilities
- **Calibration attribution**: Uses subsequent investments (not terminal status) to avoid censoring bias
- **Recycling**: Same-bucket only (preserves V_s = Σ x_b * m_{b,s} additivity)

### Cache Keying (Critical for Correctness)
- **ScenarioMatrixKey v1.2**: Includes ALL factors that affect MOIC simulation
- **Recycling normalization**: enabled=false → canonical no-op (prevents cache thrashing)
- **Scenario config canonicalization**: Regime probs sum to 1, sorted keys, float precision, min/max swap
- **Idempotency keys**: `{jobType}:{entityId}` pattern with UNIQUE constraint

### Optimization Formulation
- **Normalized variables**: w_b (portfolio weights 0-1) not x_b (dollars)
- **Big-M = 1**: Because M_s ∈ [0, ∞) and y_s = max(0, 1-M_s) ∈ [0,1]
- **Expected winners denominator**: allInCost (NOT initialCheck)
- **Winner definition**: "10x on allocated all-in cost" (explicit in UI)

### Exactly-Once Semantics
- **Outbox pattern**: job_outbox with idempotencyKey UNIQUE
- **Claiming**: FOR UPDATE SKIP LOCKED with canonical CTE
- **Backoff**: Exponential with nextRunAt, cap at 300s
- **Reaper**: Resets stuck jobs (processing > 5min) → pending
- **BullMQ deduplication**: jobId for all job types

---

## Critical Files & Locations

### Existing Codebase
- `shared/core/reserves/ConstrainedReserveEngine.ts` - Existing greedy allocator (will become validator)
- `client/src/core/reserves/ReserveEngine.ts` - Provides policy defaults
- `server/services/streaming-monte-carlo-engine.ts` - Will be extended for correlated scenarios
- `shared/schema.ts` - Database schema (will add 3 new tables)
- `server/routes/` - API endpoints (will add optimization routes)

### New Files to Create
- `shared/core/optimization/PortfolioOptimizationEngine.ts` - MILP solver integration
- `shared/core/optimization/ScenarioMatrixCache.ts` - Cache management
- `shared/core/optimization/OptimizationOrchestrator.ts` - State machine
- `server/workers/matrix-generation-worker.ts` - BullMQ worker
- `server/workers/optimization-worker.ts` - BullMQ worker
- `server/workers/outbox-worker.ts` - Job enqueuing daemon
- `server/workers/reaper-worker.ts` - Stuck job cleanup
- `server/routes/optimization.ts` - API endpoints
- `client/src/pages/optimization.tsx` - UI (or extend analytics page)

### Documentation
- `docs/plans/2026-01-04-portfolio-optimization-design.md` - Complete design (to be created from final output)
- `CHANGELOG.md` - Will document feature addition
- `DECISIONS.md` - Will document key architectural choices

---

## Implementation Plan Summary (8 Phases, 56 Tasks)

### Phase 1: Database Schema (11 tasks) - START HERE
1. Create `scenario_matrices` table with nullable payload + complete CHECK constraint
2. Add `matrixKeyJson` JSONB debugging column
3. Create `optimization_sessions` with `matrixKeyJson` copy + JSONB config fields
4. **Create `job_outbox` with idempotencyKey UNIQUE + nextRunAt** ⚠️ CRITICAL
5. Add all CHECK constraints (state consistency)
6. Create `survival_matrices` (optional - benchmark transitions)
7. Add SQL `normalize_sector()` function (POSIX whitespace class)
8. **Add indexes: nextRunAt, processingAt, FOR UPDATE SKIP LOCKED support** ⚠️ CRITICAL
9. Create Drizzle migration scripts
10. Test CHECK constraint behavior (psql tests)
11. Seed test data for development

### Phase 2: Scenario Generation (10 tasks)
- ScenarioState generator, three-component correlation, stage attribution calibration
- Stage-by-stage Markov simulator with recycling
- Power-law from median+P90, matrix compression, BullMQ worker

### Phase 3: ScenarioMatrixCache (8 tasks)
- Canonical hashing v1.2, recycling normalization, PostgreSQL + Redis storage
- Outbox worker for job enqueuing

### Phase 4: Optimization Engine (9 tasks)
- Solver selection (glpk.js vs highs-js), normalized MILP, constraints
- Lexicographic relaxation with directional logic

### Phase 5: Orchestration (11 tasks)
- State machine, transactional request handler, polling with promotion
- Outbox worker, stuck job reaper, error handling

### Phase 6: API Layer (5 tasks)
- Zod schemas, endpoints, integration tests

### Phase 7: UI Components (8 tasks)
- Configuration form, visualizations, progress indicator

### Phase 8: Testing (9 tasks)
- Truth cases, invariants, concurrency tests, crash recovery tests

**Estimated Effort**: 6-9 weeks (experienced full-stack developer)

---

## Technical Debt & Constraints

### What We're NOT Building (Phase 2 Enhancements)
- IRR-based optimization (cash-flow matrices instead of MOIC-only)
- Cross-bucket reserve recycling (breaks additivity)
- Discrete deal selection from pipeline
- Multi-period optimization with pacing constraints
- Stochastic programming (scenario tree optimization)
- Survival analysis (Kaplan-Meier) for transition calibration

### Known Limitations (Acceptable for MVP)
- Bucket count < 100 (MILP scaling)
- S_opt = 250-400 scenarios for optimization (S_val = 5k for validation)
- Same-bucket recycling only (no fund-level allocator)
- MOIC-only matrices (no IRR until Phase 2)
- Polling-driven session promotion (no WebSocket push)

---

## Questions to Ask When Continuing

1. **Should I proceed with implementation**, or do you want to review the final design first?
2. **Which phase should I start with**? (Recommend: Phase 1 - Database Schema)
3. **Do you want me to use the superpowers workflow** (`/superpowers:write-plan` → `/superpowers:execute-plan`)?
4. **Should I create the design document** at `docs/plans/2026-01-04-portfolio-optimization-design.md` before implementation?
5. **Do you want TDD** (write tests first) or implementation-first approach?

---

## Final Design Reference (Complete Specification)

### Database Schema (Crash-Safe)

```sql
-- job_outbox: Exactly-once job processing with backoff
CREATE TABLE job_outbox (
  id UUID PRIMARY KEY,
  idempotencyKey TEXT UNIQUE NOT NULL,  -- matrix_generation:{matrixKey}, optimization:{sessionId}
  jobType TEXT NOT NULL CHECK (jobType IN ('matrix_generation', 'optimization', 'validation')),
  payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'enqueued', 'failed')) DEFAULT 'pending',
  attempts INT DEFAULT 0,
  maxAttempts INT DEFAULT 3,
  errorReason TEXT,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  processingAt TIMESTAMPTZ,
  enqueuedAt TIMESTAMPTZ,
  nextRunAt TIMESTAMPTZ DEFAULT NOW(),  -- Exponential backoff support
  CONSTRAINT ck_failed_has_reason CHECK (status <> 'failed' OR errorReason IS NOT NULL),
  CONSTRAINT ck_processing_has_timestamp CHECK (status <> 'processing' OR processingAt IS NOT NULL)
);

CREATE INDEX idx_job_outbox_pending ON job_outbox(nextRunAt) WHERE status = 'pending';
CREATE INDEX idx_job_outbox_processing ON job_outbox(processingAt) WHERE status = 'processing';

-- scenario_matrices: Cached MOIC matrices with state consistency
CREATE TABLE scenario_matrices (
  id UUID PRIMARY KEY,
  matrixKey TEXT UNIQUE NOT NULL,
  matrixKeyJson JSONB NOT NULL,  -- Debugging
  fundId TEXT NOT NULL,
  taxonomyVersion TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('generating', 'complete', 'failed')),
  errorReason TEXT,

  -- Payload (nullable until complete)
  moicMatrix BYTEA,
  compressionCodec TEXT,
  matrixLayout TEXT,
  bucketKeys JSONB,
  scenarioStates JSONB,
  bucketParams JSONB,
  bucketCount INT,
  S_opt INT,

  -- Versions
  keySchemaVersion TEXT NOT NULL,
  simModelVersion TEXT NOT NULL,
  calibrationVersion TEXT,

  -- Timestamps
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  completedAt TIMESTAMPTZ,

  -- State consistency CHECKs
  CONSTRAINT ck_matrix_complete_payload CHECK (
    (status <> 'complete') OR (
      moicMatrix IS NOT NULL AND bucketKeys IS NOT NULL AND scenarioStates IS NOT NULL
      AND bucketParams IS NOT NULL AND compressionCodec IS NOT NULL AND matrixLayout IS NOT NULL
      AND bucketCount IS NOT NULL AND S_opt IS NOT NULL
    )
  ),
  CONSTRAINT ck_generating_not_completed CHECK (status <> 'generating' OR completedAt IS NULL),
  CONSTRAINT ck_complete_has_timestamp CHECK (status <> 'complete' OR completedAt IS NOT NULL),
  CONSTRAINT ck_failed_has_reason CHECK (status <> 'failed' OR errorReason IS NOT NULL),
  CONSTRAINT ck_failed_not_completed CHECK (status <> 'failed' OR completedAt IS NULL)
);

CREATE INDEX idx_scenario_matrices_fund_tax_status ON scenario_matrices(fundId, taxonomyVersion, status);
CREATE INDEX idx_scenario_matrices_created ON scenario_matrices(createdAt);
CREATE INDEX idx_scenario_matrices_status_incomplete ON scenario_matrices(status) WHERE status IN ('generating', 'failed');

-- optimization_sessions: Optimization runs with reproducibility metadata
CREATE TABLE optimization_sessions (
  id UUID PRIMARY KEY,
  fundId TEXT NOT NULL,
  matrixKey TEXT NOT NULL,  -- Soft FK
  matrixKeyJson JSONB,  -- Copy for debugging
  config JSONB NOT NULL,  -- Original request
  normalizedConfigJson JSONB NOT NULL,  -- Post-defaults + canonical rounding
  status TEXT NOT NULL CHECK (status IN ('REQUESTED', 'MATRIX_GENERATING', 'OPTIMIZING', 'VALIDATING', 'COMPLETED', 'FAILED')),
  progress INT DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  currentStep TEXT,
  solverName TEXT,
  solverVersion TEXT,
  solverSettings JSONB,
  allocation JSONB,
  riskMetrics JSONB,
  constraintReport JSONB,
  errorReason TEXT,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  completedAt TIMESTAMPTZ
);

CREATE INDEX idx_optimization_sessions_fund_created ON optimization_sessions(fundId, createdAt DESC);
CREATE INDEX idx_optimization_sessions_status ON optimization_sessions(status);
CREATE INDEX idx_optimization_sessions_matrix_key ON optimization_sessions(matrixKey);
CREATE INDEX idx_optimization_sessions_matrix_generating ON optimization_sessions(status, matrixKey) WHERE status = 'MATRIX_GENERATING';

-- SQL normalization function
CREATE OR REPLACE FUNCTION normalize_sector(raw_sector TEXT) RETURNS TEXT AS $$
  SELECT CASE
    WHEN TRIM(raw_sector) = '' OR raw_sector IS NULL THEN '(blank)'
    ELSE LOWER(REGEXP_REPLACE(TRIM(raw_sector), '[[:space:]]+', ' ', 'g'))
  END;
$$ LANGUAGE SQL IMMUTABLE;
```

### PolicyParamsHash v1.2 (Complete)

```typescript
type RecyclingPolicyParams = {
  enabled: boolean;
  utilization: number;      // [0, 1]
  cashMultiple: number;     // Typically 1.0
  maxRecycleDeals: number;  // Typically 3
};

type PolicyParamsHash = {
  keySchemaVersion: "v1.2";

  // Transitions (graduate from benchmarks)
  exitRateByStage: Record<string, number>;
  graduateRateByStage: Record<string, number>;
  failureRateByStage: Record<string, number>;
  survivalMatrixVersion?: string;

  // Exit outcomes (median + P90 → alpha derived)
  exitMoicMedianByStage: Record<string, number>;
  exitMoicP90ByStage: Record<string, number>;

  // Follow-on economics
  reserveRatioByStage: Record<string, number>;
  initialCheckSizeByStage: Record<string, number>;
  checkSizeCvByStage: Record<string, number>;
  roundsToExitByStage: Record<string, number>;

  // Dilution
  dilutionPerRoundPct: number;
  optionPoolRefreshPct: number;
  proRataParticipationRate: number;

  // Sector adjustments
  sectorRiskMultipliers: Record<string, number>;
  sectorReturnMultipliers: Record<string, number>;

  // Recycling (normalized when enabled=false)
  recycling: RecyclingPolicyParams;

  // Scenario config (canonicalized)
  scenarioGenConfig: {
    regimeProbabilities: Record<MacroRegime, number>;  // Sum to 1.0
    shockRanges: Record<string, { min: number; max: number }>;
  };
};
```

### Outbox Worker Pattern (Crash-Safe)

```typescript
// Canonical CTE claiming
async function drainOutbox() {
  while (true) {
    const jobs = await db.transaction(async (tx) => {
      const claimed = await tx.query(`
        WITH cte AS (
          SELECT id FROM job_outbox
          WHERE status = 'pending' AND nextRunAt <= NOW()
          ORDER BY createdAt LIMIT 10
          FOR UPDATE SKIP LOCKED
        )
        UPDATE job_outbox j
        SET status = 'processing', attempts = attempts + 1, processingAt = NOW()
        FROM cte WHERE j.id = cte.id
        RETURNING j.*
      `);
      return claimed.rows;
    });

    if (jobs.length === 0) {
      await sleep(1000);
      continue;
    }

    for (const job of jobs) {
      try {
        await processOutboxJob(job);
        await db.query(`UPDATE job_outbox SET status = 'enqueued', enqueuedAt = NOW() WHERE id = $1`, [job.id]);
      } catch (error) {
        const nextStatus = job.attempts >= job.maxAttempts ? 'failed' : 'pending';
        const backoffSeconds = Math.min(Math.pow(2, job.attempts), 300);
        await db.query(`
          UPDATE job_outbox
          SET status = $1, errorReason = $2, nextRunAt = NOW() + INTERVAL '${backoffSeconds} seconds'
          WHERE id = $3
        `, [nextStatus, error.message, job.id]);
      }
    }
  }
}

// Stuck job reaper (separate process)
async function reapStuckJobs() {
  while (true) {
    await db.query(`
      UPDATE job_outbox SET status = 'pending', processingAt = NULL
      WHERE status = 'processing' AND processingAt < NOW() - INTERVAL '300 seconds'
    `);
    await sleep(60000);  // Every 1 minute
  }
}
```

### MILP Formulation Summary

```typescript
// Normalized decision variables (weights, not dollars)
w_b ∈ [0, 1]  // Fraction of capital to bucket b
Σ_b w_b = 1   // Budget constraint

// Scenario multiple
M_s = Σ_b w_b * m_{b,s}

// Loss probability (Big-M = 1)
y_s ≥ 1 - M_s, y_s ≥ 0
y_s ≤ 1 · z_s, z_s ∈ {0,1}
(1/S) Σ_s z_s ≤ p_max

// CVaR tail risk
u_s ≥ y_s - τ, u_s ≥ 0
τ + (1/(1-α)S) Σ_s u_s ≤ cvar_max

// Expected winners (allInCost denominator)
Σ_b [(w_b * C) / allInCost_b] * p_win^b ≥ W_min

// Diversification (mins + maxs)
w_min^sector_k ≤ Σ_{b∈sector_k} w_b ≤ w_max^sector_k
w_min^stage_g ≤ Σ_{b∈stage_g} w_b ≤ w_max^stage_g
w_b ≤ w_max^bucket

// Objective
maximize (1/S) Σ_s M_s

// Lexicographic relaxation priority:
// hitRate → bucketMaxWeight → sectorMaxWeight → sectorMinWeight
// → stageMaxWeight → stageMinWeight → cvarMax → pLossMax [SACRED]
```

---

## How to Use This Handoff

1. **Read this document completely** to understand the design context
2. **Ask clarifying questions** about any unclear aspects
3. **Confirm next steps** (create design doc? start Phase 1? use superpowers?)
4. **Begin implementation** with Phase 1 critical items
5. **Refer back to this document** whenever you need context on design decisions

---

**Design Status**: COMPLETE, PRODUCTION-READY
**Implementation Status**: NOT STARTED
**Next Action**: Confirm approach with user, then begin Phase 1