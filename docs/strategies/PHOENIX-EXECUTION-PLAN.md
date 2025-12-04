# Phoenix: Truth-Driven Fund Calculation Rebuild

**Version:** 2.0
**Date:** December 4, 2025
**Status:** ACTIVE - Supersedes all prior Phoenix plans
**Executor:** Solo Developer

---

## Operator's View (Flight Card)

**Use this when tired or context-switching. Full details below.**

### Daily Checklist

```
[ ] Which phase am I in? (0-6)
[ ] What calculation am I validating?
[ ] Have I checked existing JSON truth cases?
[ ] Are all 4 validation layers passing?
[ ] What's my AI tier for this calculation?
```

### Quick Reference

| Phase | Focus | Exit Gate |
|-------|-------|-----------|
| 0 | Test infrastructure + validation layers | `npm test` passes, 4 layers scaffolded |
| 1 | MOIC only (prove pattern) | All 4 MOIC variants validated E2E |
| 2 | Capital calls/distributions | 3 scenarios validated |
| 3 | Fee engine (4 bases) | 4 fee basis methods pass |
| 4 | American waterfall | Deal-by-deal carry validated |
| 5 | IRR (XIRR) | All XIRR edge cases pass |
| 6 | Integration + shadow | Feature flags live at 100% |

### 4 Validation Layers (Defense-in-Depth)

| Layer | Purpose | Check |
|-------|---------|-------|
| 1 | Data Plausibility | Zod schema with business rules |
| 2 | Fund Lifecycle State | Valid state for operation |
| 3 | Output Contracts | Precision/rounding for target |
| 4 | Debug Instrumentation | Structured logging with context |

### AI Validation Tiers

| Tier | Calculations | Rule |
|------|-------------|------|
| 1 | NAV, simple sums | 1 AI, must be GREEN |
| 2 | Fees, capital calls | 2 AI, both GREEN |
| 3 | Waterfall, IRR, MOIC | 2-3 AI, unanimous GREEN |

### Error Thresholds

| Metric | Threshold |
|--------|-----------|
| MOIC | < 0.1% relative |
| IRR | < 0.01% absolute |
| Fees | < $100 or 0.05% |
| NAV | < $1 or 0.01% |

### Slip Rules

- **Per-phase**: > 3 days slip -> reduce scope or re-estimate
- **Cumulative**: > 10 days total -> stop, re-baseline, notify stakeholders

---

## 1. Executive Summary

This plan rebuilds financial calculations for a VC fund modeling platform using a **truth-driven validation approach** with **defense-in-depth architecture**. Calculations are validated against existing JSON truth cases and protected by 4 validation layers.

### Core Philosophy

1. **JSON Truth Cases are Source of Truth**: Extend existing 5 JSON truth case files (not Excel)
2. **Follow DeterministicReserveEngine Pattern**: Proven production architecture
3. **Defense-in-Depth**: 4 validation layers prevent production failures
4. **Vertical-then-Horizontal**: MOIC only first, prove pattern, then expand
5. **Feature Flags for Safety**: BullMQ async shadow mode with instant rollback
6. **Solo Developer Optimized**: Multi-AI consensus replaces team review

### Success Criteria

- Zero P0 errors (calculations that would cause GP/LP financial discrepancies)
- All truth cases pass within defined error thresholds
- All 4 validation layers active before production rollout
- Feature flags enable gradual rollout (0% -> 10% -> 50% -> 100%)

---

## 2. Defense-in-Depth Architecture

### Why 4 Layers?

JSON truth cases validate **calculation logic is mathematically correct**.
They do NOT validate:
- Input data is financially plausible (Layer 1)
- Fund is in valid state for operation (Layer 2)
- Output is compatible with downstream systems (Layer 3)
- Failures can be debugged in production (Layer 4)

### Layer 1: Data Plausibility Validation

**Purpose:** Catch semantically invalid inputs before calculation

**Problem Solved:**
```typescript
// Truth case passes mathematically but is semantically wrong
{
  "rate": 5.0,  // Bug: Should be 0.05 (5%), not 500%
  "expected": { "payment": 53682.14 }  // Correct for 500% rate
}
```

**Implementation:**
```typescript
// shared/schemas/phoenix-validation.ts
import { z } from 'zod';

export const MOICInputSchema = z.object({
  contributions: z.number()
    .min(0, "Contributions cannot be negative")
    .max(10_000_000_000, "Contributions exceed $10B plausibility limit"),
  currentValue: z.number()
    .min(0, "Current value cannot be negative"),
  distributions: z.number()
    .min(0, "Distributions cannot be negative"),
}).refine(
  data => data.contributions > 0,
  "Contributions must be positive for MOIC calculation"
).refine(
  data => {
    const moic = (data.currentValue + data.distributions) / data.contributions;
    return moic < 100; // 100x MOIC is implausible
  },
  "Calculated MOIC > 100x is implausible - check inputs"
);

export const IRRInputSchema = z.object({
  cashflows: z.array(z.object({
    date: z.string().datetime(),
    amount: z.number(),
  })).min(2, "IRR requires at least 2 cash flows"),
}).refine(
  data => data.cashflows.some(cf => cf.amount < 0),
  "IRR requires at least one negative cash flow (investment)"
).refine(
  data => data.cashflows.some(cf => cf.amount > 0),
  "IRR requires at least one positive cash flow (return)"
);

export const FeeInputSchema = z.object({
  fundSize: z.number().min(100_000).max(10_000_000_000),
  feeRate: z.number()
    .min(0, "Fee rate cannot be negative")
    .max(0.10, "Fee rate > 10% is implausible"), // 10% max, not 1000%
  basisMethod: z.enum(['committed', 'called', 'invested', 'fmv']),
});
```

**Effort:** 8 hours

### Layer 2: Fund Lifecycle State Validation

**Purpose:** Ensure calculations are valid for fund's current state

**Problem Solved:**
- Can't calculate carry distributions in FUNDRAISING state
- Can't make new investments in LIQUIDATED state
- State transitions must be valid

**Implementation:**
```typescript
// shared/schemas/fund-lifecycle.ts

export type FundState =
  | 'FUNDRAISING'   // Raising capital, no investments yet
  | 'INVESTING'     // Deploying capital into companies
  | 'HARVESTING'    // No new investments, managing exits
  | 'LIQUIDATED';   // Fund closed, all assets distributed

const VALID_TRANSITIONS: Record<FundState, FundState[]> = {
  FUNDRAISING: ['INVESTING'],
  INVESTING: ['HARVESTING'],
  HARVESTING: ['LIQUIDATED'],
  LIQUIDATED: [],
};

const ALLOWED_OPERATIONS: Record<FundState, string[]> = {
  FUNDRAISING: ['capital_call', 'nav'],
  INVESTING: ['capital_call', 'distribution', 'nav', 'fee', 'moic', 'irr'],
  HARVESTING: ['distribution', 'nav', 'fee', 'moic', 'irr', 'waterfall'],
  LIQUIDATED: ['final_distribution', 'final_nav', 'final_moic', 'final_irr'],
};

export function validateOperation(
  fundState: FundState,
  operation: string
): { valid: boolean; reason?: string } {
  const allowed = ALLOWED_OPERATIONS[fundState];
  if (!allowed.includes(operation)) {
    return {
      valid: false,
      reason: `Operation '${operation}' not allowed in ${fundState} state. Allowed: ${allowed.join(', ')}`
    };
  }
  return { valid: true };
}

export function validateStateTransition(
  currentState: FundState,
  newState: FundState
): { valid: boolean; reason?: string } {
  const validNextStates = VALID_TRANSITIONS[currentState];
  if (!validNextStates.includes(newState)) {
    return {
      valid: false,
      reason: `Cannot transition from ${currentState} to ${newState}. Valid transitions: ${validNextStates.join(', ') || 'none'}`
    };
  }
  return { valid: true };
}
```

**Effort:** 6 hours

### Layer 3: Output Contract Validation

**Purpose:** Ensure calculation output is compatible with consumers

**Problem Solved:**
- Phoenix calculates with 28 decimal places (Decimal.js)
- UI displays 2 decimal places
- CSV export needs 4 decimal places
- Rounding mismatches cause reconciliation issues

**Implementation:**
```typescript
// shared/schemas/output-contracts.ts

export interface OutputContract {
  target: string;
  decimals: number;
  roundingMode: 'HALF_UP' | 'HALF_EVEN' | 'DOWN';
  maxValue: number;
}

export const OUTPUT_CONTRACTS: Record<string, OutputContract> = {
  UI_DISPLAY: {
    target: 'UI_DISPLAY',
    decimals: 2,
    roundingMode: 'HALF_UP',
    maxValue: 999_999_999.99,
  },
  CSV_EXPORT: {
    target: 'CSV_EXPORT',
    decimals: 4,
    roundingMode: 'HALF_UP',
    maxValue: 999_999_999_999,
  },
  API_RESPONSE: {
    target: 'API_RESPONSE',
    decimals: 6,
    roundingMode: 'HALF_EVEN',
    maxValue: Number.MAX_SAFE_INTEGER,
  },
  INTERNAL_CALC: {
    target: 'INTERNAL_CALC',
    decimals: 10,
    roundingMode: 'HALF_EVEN',
    maxValue: Number.MAX_SAFE_INTEGER,
  },
};

export function formatForContract(
  value: Decimal,
  contractKey: keyof typeof OUTPUT_CONTRACTS
): { formatted: string; precisionLoss: string } {
  const contract = OUTPUT_CONTRACTS[contractKey];

  const rounded = value.toDecimalPlaces(
    contract.decimals,
    contract.roundingMode === 'HALF_UP' ? Decimal.ROUND_HALF_UP :
    contract.roundingMode === 'HALF_EVEN' ? Decimal.ROUND_HALF_EVEN :
    Decimal.ROUND_DOWN
  );

  const precisionLoss = value.minus(rounded).abs();

  return {
    formatted: rounded.toFixed(contract.decimals),
    precisionLoss: precisionLoss.toString(),
  };
}
```

**Effort:** 10 hours

### Layer 4: Debug Instrumentation

**Purpose:** Enable production debugging with full context

**Extends:** Existing `DeterministicReserveEngine` logging pattern

**Implementation:**
```typescript
// shared/instrumentation/phoenix-logger.ts

import { getLogger, getPerf } from '@shared/instrumentation';

const logger = getLogger();
const perf = getPerf();

export interface CalculationContext {
  userId?: string;
  fundId: string;
  effectiveDate: string;
  featureFlags: Record<string, boolean>;
  calculationType: string;
}

export function withPhoenixLogging<TInput, TOutput>(
  calculationType: string,
  calculateFn: (input: TInput) => TOutput
) {
  return function(input: TInput, context: CalculationContext): TOutput {
    const startTime = Date.now();
    const correlationId = `phx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    logger.debug('Phoenix calculation started', {
      correlationId,
      calculationType,
      input: sanitizeForLogging(input),
      context,
      version: process.env.npm_package_version,
    });

    try {
      const result = calculateFn(input);

      logger.info('Phoenix calculation succeeded', {
        correlationId,
        calculationType,
        duration: Date.now() - startTime,
        resultSummary: summarizeResult(result),
      });

      perf.recordMetric(`phoenix.${calculationType}.duration`, Date.now() - startTime);
      perf.recordMetric(`phoenix.${calculationType}.success`, 1);

      return result;
    } catch (error) {
      logger.error('Phoenix calculation failed', {
        correlationId,
        calculationType,
        error: error instanceof Error ? error.message : String(error),
        input: sanitizeForLogging(input),
        duration: Date.now() - startTime,
      });

      perf.recordMetric(`phoenix.${calculationType}.failure`, 1);

      throw error;
    }
  };
}
```

**Effort:** 4 hours

### Total Layer Implementation: 28 hours (~3.5 days)

---

## 3. Truth Source: Existing JSON Files

### Existing Truth Cases (USE THESE)

The codebase already has 5 validated JSON truth case files:

| File | Count | Status |
|------|-------|--------|
| `docs/xirr.truth-cases.json` | 25 | Production-validated, Excel parity confirmed |
| `docs/fees.truth-cases.json` | ~15 | Validated |
| `docs/waterfall.truth-cases.json` | ~20 | Validated |
| `docs/capital-allocation.truth-cases.json` | ~15 | Validated |
| `docs/exit-recycling.truth-cases.json` | ~10 | Validated |

### Truth Case Structure (from xirr.truth-cases.json)

```json
{
  "scenario": "01-simple-positive-return",
  "tags": ["baseline", "basic"],
  "notes": "Canonical 2-cashflow case: 2.5x return over 5 years yields ~20.10% IRR. Excel validated.",
  "input": {
    "cashflows": [
      { "date": "2020-01-01", "amount": -10000000 },
      { "date": "2025-01-01", "amount": 25000000 }
    ],
    "config": {
      "tolerance": 1e-7,
      "strategy": "Hybrid"
    }
  },
  "expected": {
    "irr": 0.2010340779,
    "converged": true,
    "algorithm": "Newton",
    "excelParity": true
  },
  "category": "basic",
  "excelFormula": "=XIRR({-10000000, 25000000}, {DATE(2020,1,1), DATE(2025,1,1)})"
}
```

### Adding New Truth Cases

When extending truth cases:

1. Add to existing JSON file (version controlled)
2. Include `excelFormula` for validation
3. Tag with `["phoenix", "v2"]` for traceability
4. Run against DeterministicReserveEngine pattern

**DO NOT:** Create new Excel workbook. Use existing JSON infrastructure.

---

## 4. Reference Pattern: DeterministicReserveEngine

All Phoenix calculations follow the pattern established in:
`shared/core/reserves/DeterministicReserveEngine.ts`

### Key Patterns to Follow

```typescript
// From DeterministicReserveEngine.ts

// 1. Decimal.js for precision
import Decimal from 'decimal.js';
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// 2. Version tracking
const CALCULATION_VERSION = '1.0.0';

// 3. Deterministic caching
private calculationCache = new Map<string, ReserveCalculationResult>();
const cacheKey = this.generateDeterministicHash(input);

// 4. Input validation
this.validateInputs(input);

// 5. Performance monitoring
if (this.featureFlags.enablePerformanceLogging) {
  performanceMonitor.startTimer('reserve_calculation');
}

// 6. Conservation validation
validateReserveAllocationConservation(result);
```

### Phoenix Calculation Template

```typescript
// Example: client/src/lib/finance/moic-phoenix.ts

import Decimal from 'decimal.js';
import { MOICInputSchema } from '@shared/schemas/phoenix-validation';
import { validateOperation } from '@shared/schemas/fund-lifecycle';
import { formatForContract } from '@shared/schemas/output-contracts';
import { withPhoenixLogging } from '@shared/instrumentation/phoenix-logger';

const CALCULATION_VERSION = '1.0.0';

interface MOICInput {
  contributions: number;
  currentValue: number;
  distributions: number;
}

interface MOICResult {
  currentMOIC: Decimal;
  realizedMOIC: Decimal;
  version: string;
}

function calculateMOICCore(input: MOICInput): MOICResult {
  // Layer 1: Data plausibility
  MOICInputSchema.parse(input);

  const contributions = new Decimal(input.contributions);
  const currentValue = new Decimal(input.currentValue);
  const distributions = new Decimal(input.distributions);

  return {
    currentMOIC: currentValue.plus(distributions).dividedBy(contributions),
    realizedMOIC: distributions.dividedBy(contributions),
    version: CALCULATION_VERSION,
  };
}

// Wrap with Layer 4: Debug instrumentation
export const calculateMOIC = withPhoenixLogging('moic', calculateMOICCore);
```

---

## 5. Reference Scenario: POV Fund I

All calculations validated against a single reference fund:

| Parameter | Value |
|-----------|-------|
| Fund Size | $50M committed |
| Management Fee | 2.0% on committed (Years 1-5), 1.5% on invested (Years 6-10) |
| Carried Interest | 20% (American waterfall, deal-by-deal) |
| Preferred Return | 8% IRR hurdle |
| GP Commitment | 2% ($1M) |
| Fund Term | 10 years + 2 extension |
| Vintage Year | 2024 |

### Portfolio Construction

| Company | Stage | Initial | Follow-on | Exit |
|---------|-------|---------|-----------|------|
| Alpha Corp | Series A | $2M (Q1 2024) | $1M (Q3 2025) | $15M (Q4 2028) |
| Beta Inc | Series B | $3M (Q2 2024) | $2M (Q1 2026) | $8M (Q2 2029) |
| Gamma LLC | Seed | $500K (Q3 2024) | $500K (Q2 2025) | $0 (Write-off Q1 2027) |
| Delta Co | Series A | $2.5M (Q4 2024) | $1.5M (Q3 2026) | $25M (Q4 2030) |

---

## 6. Calculation Scope

### In Scope

| Category | Calculations |
|----------|--------------|
| **MOIC** (Phase 1) | Current, Realized, Target, Exit MOIC on Planned Reserves |
| **Capital Calls** | LP contributions, GP contributions, call schedules |
| **Distributions** | Proceeds allocation, return of capital, profit distribution |
| **Fees** | Management fees (4 basis methods), organizational expenses |
| **Waterfall** | American (deal-by-deal) carry with clawback |
| **IRR** | XIRR with edge case handling |

### Out of Scope (Explicit Exclusions)

| Item | Reason |
|------|--------|
| **European Waterfall** | Whole-fund carry not used by POV |
| **SAFEs/Convertibles** | Complex conversion logic deferred to future phase |
| **Cashless GP Commits** | Management fee offset mechanism deferred |
| **Monte Carlo Simulation** | Already documented, validation separate |
| **Multi-currency** | Single currency (USD) for POV Fund I |

### MOIC Variants (4 Types) - Phase 1 Focus

| Variant | Formula | When Used |
|---------|---------|-----------|
| **Current MOIC** | (Distributions + NAV) / Called | Standard reporting |
| **Realized MOIC** | Distributions / Called | Actual returns |
| **Target MOIC** | Projected Value / Called | Planning |
| **Exit MOIC on Planned Reserves** | (Realized + Reserve Exits) / Total Called | Reserve strategy |

### Fee Basis Methods (4 Types)

| Method | Description | When Used |
|--------|-------------|-----------|
| **Committed Capital** | Fee on total commitment | Investment period |
| **Net Cumulative Called** | Fee on called minus returned | Post-investment |
| **Cumulative Invested** | Fee on deployed capital | Alternative structure |
| **FMV (Fair Market Value)** | Fee on current portfolio value | Growth funds |

### American Waterfall Structure

```
For each realized investment:
  1. Return of Capital (to all partners pro-rata)
  2. Preferred Return (8% IRR to LPs)
  3. GP Catch-up (until GP has 20% of profits)
  4. Carried Interest (80/20 split thereafter)

Clawback: GP returns excess carry if fund underperforms
GP Commit: Treated as LP for distribution, no carry on own capital
```

---

## 7. Phased Execution

### Phase 0: Foundation + Validation Layers (Week 1)

**Goal:** Test infrastructure works + 4 validation layers scaffolded

| Task | Exit Criteria |
|------|---------------|
| Fix `cross-env not found` error | `npm test` runs without setup errors |
| Verify sidecar packages linked | `npm run doctor:links` passes |
| Scaffold Layer 1 (Zod schemas) | `phoenix-validation.ts` created |
| Scaffold Layer 2 (Fund lifecycle) | `fund-lifecycle.ts` created |
| Scaffold Layer 3 (Output contracts) | `output-contracts.ts` created |
| Scaffold Layer 4 (Instrumentation) | `phoenix-logger.ts` created |

**Deliverables:**
- [ ] Test suite runs (existing tests may fail, but infrastructure works)
- [ ] 4 validation layer modules created and importable
- [ ] Zod schema for MOIC inputs defined

### Phase 1: MOIC Only - Prove Pattern (Weeks 2-3)

**Goal:** Single calculation type fully validated with all 4 layers

**Why MOIC First:**
- Well-defined formula
- 4 variants to validate
- High business value
- Existing truth cases available

| Task | Truth Cases | AI Tier |
|------|-------------|---------|
| Current MOIC | 3 | Tier 3 |
| Realized MOIC | 2 | Tier 3 |
| Target MOIC | 2 | Tier 3 |
| Exit MOIC on Planned Reserves | 2 | Tier 3 |

**Validation Checklist (all must pass):**
- [ ] Layer 1: Zod schema rejects implausible inputs
- [ ] Layer 2: Fund state validation works
- [ ] Layer 3: Output formats for UI/CSV/API defined
- [ ] Layer 4: Structured logging emits correlation IDs
- [ ] All 9 truth cases pass
- [ ] AI consensus: GREEN from 2+ AIs

**Exit Gate:** MOIC calculation proven E2E with 4 validation layers

### Phase 2: Capital Operations (Weeks 4-5)

**Goal:** Complete capital call and distribution logic

| Task | Truth Cases | AI Tier |
|------|-------------|---------|
| Multi-LP capital calls | 3 | Tier 2 |
| Partial calls | 2 | Tier 2 |
| Return of capital | 2 | Tier 2 |
| Profit distributions | 3 | Tier 2 |

**Exit Gate:** 3 distinct scenarios validated for calls and distributions

### Phase 3: Fee Engine (Week 6)

**Goal:** All 4 fee basis methods working

| Fee Basis | Truth Cases | AI Tier |
|-----------|-------------|---------|
| Committed Capital | 2 | Tier 2 |
| Net Cumulative Called | 2 | Tier 2 |
| Cumulative Invested | 2 | Tier 2 |
| FMV-based | 2 | Tier 2 |

**Exit Gate:** Each fee basis method has 2 passing truth cases

### Phase 4: American Waterfall (Week 7)

**Goal:** Deal-by-deal carry calculation validated

| Scenario | Truth Cases | AI Tier |
|----------|-------------|---------|
| Single exit, no hurdle | 1 | Tier 3 |
| Single exit, hurdle met | 1 | Tier 3 |
| Multiple exits, catch-up | 2 | Tier 3 |
| Clawback scenario | 1 | Tier 3 |
| GP commit treatment | 1 | Tier 3 |

**Exit Gate:** All waterfall scenarios pass with unanimous AI consensus

### Phase 5: IRR (XIRR) (Week 7, continued)

**Goal:** XIRR with edge cases validated

| Metric | Truth Cases | AI Tier |
|--------|-------------|---------|
| XIRR (standard) | 3 | Tier 3 |
| XIRR (edge: single cash flow) | 1 | Tier 3 |
| XIRR (edge: all negative) | 1 | Tier 3 |
| XIRR (edge: very high return) | 1 | Tier 3 |

**Note:** 25 existing truth cases in `docs/xirr.truth-cases.json`

**Exit Gate:** All XIRR edge cases pass

### Phase 6: Integration & Rollout (Week 8)

**Goal:** Feature flags live, BullMQ shadow mode validated

| Task | Criteria |
|------|----------|
| Feature flag implementation | Extend `flag-definitions.ts` with `phoenix.*` flags |
| BullMQ shadow worker | Async calculation validation (not in API path) |
| Shadow mode (0%) | New calculations run async, log discrepancies |
| Gradual rollout (10% -> 50%) | Canary users see new calculations |
| Full rollout (100%) | All users on new system |
| Monitoring | Discrepancy alerts configured |

**Exit Gate:** 100% rollout with no P0 errors for 48 hours

---

## 8. Shadow Mode Architecture (BullMQ)

### Why BullMQ?

Shadow mode runs OLD + NEW calculations in parallel. Running both synchronously in the API path would double latency and load.

**Solution:** Queue Phoenix calculations to BullMQ workers.

### Implementation

```typescript
// server/workers/phoenix-shadow-worker.ts

import { Queue, Worker } from 'bullmq';
import { calculateMOIC } from '@/lib/finance/moic-phoenix';
import { calculateMOICLegacy } from '@/lib/finance/moic-legacy';

const phoenixShadowQueue = new Queue('phoenix-shadow', {
  connection: redisConnection,
});

// Worker processes shadow validations async
const worker = new Worker('phoenix-shadow', async (job) => {
  const { calculationType, input, legacyResult, context } = job.data;

  try {
    const phoenixResult = calculateMOIC(input, context);

    const discrepancy = compareResults(legacyResult, phoenixResult);

    if (discrepancy.significantDifference) {
      logger.warn('Phoenix shadow mode discrepancy', {
        calculationType,
        legacyResult,
        phoenixResult,
        discrepancy,
        context,
      });

      // Alert if discrepancy exceeds threshold
      if (discrepancy.percentDiff > 0.001) { // 0.1%
        await alertDiscrepancy(job.data, discrepancy);
      }
    }
  } catch (error) {
    logger.error('Phoenix shadow calculation failed', {
      calculationType,
      error: error.message,
      context,
    });
  }
}, { connection: redisConnection });

// API endpoint enqueues shadow validation
export async function calculateWithShadow<T>(
  calculationType: string,
  input: any,
  legacyFn: () => T,
  context: CalculationContext
): Promise<T> {
  // Always return legacy result immediately
  const legacyResult = legacyFn();

  // If shadow mode enabled, queue Phoenix validation
  if (isPhoenixShadowEnabled(calculationType)) {
    await phoenixShadowQueue.add('validate', {
      calculationType,
      input,
      legacyResult,
      context,
    });
  }

  return legacyResult;
}
```

### Rollout Sequence

```
Phase 6 Rollout:

  Day 1-2:   0% (shadow mode, BullMQ workers logging only)
  Day 3-4:   10% (canary users see Phoenix results)
  Day 5-6:   50% (broader testing)
  Day 7:     100% (full rollout)

  Rollback: Set rolloutPercentage to 0 instantly
```

---

## 9. Feature Flag Strategy

### Extend Existing flag-definitions.ts

Add Phoenix flags to existing infrastructure:

```typescript
// In shared/feature-flags/flag-definitions.ts

export const PHOENIX_FLAGS: Record<string, FeatureFlag> = {
  'phoenix.moic': {
    key: 'phoenix.moic',
    name: 'Phoenix MOIC Engine',
    description: 'New MOIC calculation with 4 validation layers',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: [],
  },
  'phoenix.capital_calls': {
    key: 'phoenix.capital_calls',
    name: 'Phoenix Capital Calls',
    description: 'New capital call calculation engine',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['phoenix.moic'], // Proves pattern first
  },
  'phoenix.fees': {
    key: 'phoenix.fees',
    name: 'Phoenix Fee Engine',
    description: 'New fee calculation with 4 basis methods',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['phoenix.capital_calls'],
  },
  'phoenix.waterfall': {
    key: 'phoenix.waterfall',
    name: 'Phoenix Waterfall',
    description: 'American waterfall calculation',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['phoenix.fees'],
  },
  'phoenix.irr': {
    key: 'phoenix.irr',
    name: 'Phoenix IRR',
    description: 'XIRR calculations with edge case handling',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['phoenix.waterfall'],
  },
};
```

---

## 10. AI Validation Methodology

### Tier Definitions

| Tier | Complexity | AI Count | Consensus Rule | Examples |
|------|------------|----------|----------------|----------|
| **Tier 1** | Simple | 1 AI | GREEN required | NAV, simple sums |
| **Tier 2** | Moderate | 2 AI | Both GREEN required | Fees, capital calls |
| **Tier 3** | Complex | 2-3 AI | Unanimous GREEN | Waterfall, IRR, MOIC |

### Verdict Definitions

| Verdict | Meaning | Action |
|---------|---------|--------|
| **GREEN** | Calculation matches truth case within threshold | Proceed |
| **YELLOW** | Minor discrepancy or ambiguity | Review, clarify, re-validate |
| **RED** | Fails threshold or logic error | Do not proceed, investigate |

### Validation Prompt Template

```markdown
## Calculation Validation Request

**Calculation:** [Name]
**Tier:** [1/2/3]
**Truth Case ID:** [from JSON]

### Inputs
[Paste from JSON truth case]

### Expected Output
[From JSON truth case]

### Implementation
[Code snippet]

### 4-Layer Validation Status
- Layer 1 (Plausibility): [PASS/FAIL]
- Layer 2 (Fund State): [PASS/FAIL]
- Layer 3 (Output Contract): [PASS/FAIL]
- Layer 4 (Instrumentation): [PASS/FAIL]

### Request
1. Verify the implementation matches the expected output
2. Check edge cases: [list relevant edges]
3. Provide verdict: GREEN / YELLOW / RED
4. If not GREEN, explain discrepancy
```

### Error Thresholds

| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| **MOIC** | < 0.1% relative | Industry reporting standard |
| **IRR** | < 0.01% absolute | Basis point precision required |
| **Fees** | < $100 or 0.05% | Materiality threshold |
| **NAV** | < $1 or 0.01% | Rounding tolerance |
| **Distributions** | < $1 or 0.01% | LP statement precision |

---

## 11. Domain Expert Allocation

### Total Hours: 9 hours over 8 weeks

| Phase | Activity | Hours |
|-------|----------|-------|
| Phase 0 | Review validation layer design | 1 |
| Phase 1 | Validate MOIC truth cases | 2 |
| Phase 3 | Validate fee basis methods | 2 |
| Phase 4 | Validate waterfall scenarios | 2 |
| Phase 6 | Production sign-off | 2 |

### Quarterly Review (Post-Launch)

- 2 hours per quarter
- Review truth cases for regulatory drift
- Validate any new edge cases discovered

---

## 12. Risk Management

### Slip Rules

**Per-Phase Slip:**
- If any phase slips > 3 days, STOP
- Options: Reduce scope OR re-estimate remaining phases
- Document decision in phase completion notes

**Cumulative Slip:**
- If total slip exceeds 10 days across all phases, STOP
- Re-baseline entire plan
- Notify stakeholders before continuing

### Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Truth case semantic error | Medium | High | Layer 1 plausibility validation |
| Fund state invalid for operation | Medium | Medium | Layer 2 lifecycle validation |
| Precision mismatch | Medium | Medium | Layer 3 output contracts |
| Test infrastructure fragile | Medium | Medium | Phase 0 dedicated to fixing |
| Scope creep (European waterfall) | Low | High | Explicit out-of-scope list |
| AI consensus disagreement | Medium | Low | Escalate to YELLOW, manual review |
| Shadow mode performance | Low | Medium | BullMQ async workers |

### Rollback Procedure

```
If P0 error detected post-rollout:

1. Set phoenix.* rolloutPercentage to 0 (immediate)
2. Verify legacy calculations restored
3. Log incident with reproduction steps
4. Root cause analysis before re-enabling
5. Add regression test to truth cases
```

---

## 13. Success Metrics

### Quantitative

| Metric | Target |
|--------|--------|
| P0 errors | 0 |
| Truth cases passing | 100% |
| AI consensus rate | > 95% GREEN on first pass |
| Rollback incidents | < 2 |
| Layer 1 rejections (plausibility) | > 0 (proves layer works) |
| Shadow mode discrepancies | < 0.1% |

### Qualitative

- [ ] All calculations traceable to JSON truth source
- [ ] All 4 validation layers active
- [ ] Feature flags enable instant rollback
- [ ] No regressions in existing functionality
- [ ] Clear documentation for each calculation

---

## 14. Appendix

### A. Existing Truth Case Files

| File | Purpose |
|------|---------|
| `docs/xirr.truth-cases.json` | 25 XIRR scenarios with Excel parity |
| `docs/fees.truth-cases.json` | Fee calculation scenarios |
| `docs/waterfall.truth-cases.json` | Distribution waterfall scenarios |
| `docs/capital-allocation.truth-cases.json` | Capital call/distribution scenarios |
| `docs/exit-recycling.truth-cases.json` | Exit recycling scenarios |

### B. Key Files

| File | Purpose |
|------|---------|
| `shared/core/reserves/DeterministicReserveEngine.ts` | Reference pattern |
| `shared/feature-flags/flag-definitions.ts` | Existing flag infrastructure |
| `client/src/lib/wizard-reserve-bridge.ts` | Integration pattern |
| `client/src/providers/FeatureFlagProvider.tsx` | React flag provider |

### C. Related Documentation

| Document | Purpose |
|----------|---------|
| `CAPABILITIES.md` | Agent and tool inventory |
| `DECISIONS.md` | Architectural decisions (ADRs) |
| `cheatsheets/anti-pattern-prevention.md` | Quality guidelines |

### D. Glossary

| Term | Definition |
|------|------------|
| **American Waterfall** | Deal-by-deal carry calculation |
| **European Waterfall** | Whole-fund carry (out of scope) |
| **MOIC** | Multiple on Invested Capital |
| **DPI** | Distributions to Paid-In |
| **RVPI** | Residual Value to Paid-In |
| **TVPI** | Total Value to Paid-In (DPI + RVPI) |
| **XIRR** | Extended Internal Rate of Return |
| **Clawback** | GP returns excess carry |
| **Catch-up** | GP receives profits until target carry % |
| **Defense-in-Depth** | Multiple validation layers for safety |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-12-04 | Initial release |
| 2.0 | 2024-12-04 | Added 4 validation layers, replaced Excel with JSON, reduced Phase 1 to MOIC only, added BullMQ shadow mode |

**This plan supersedes:**
- PHOENIX-PLAN-2025-11-30.md
- PHOENIX-EXECUTION-PLAN.md v1.0
- All prior Phoenix planning documents

**Next Review:** End of Phase 1 or upon major scope change
