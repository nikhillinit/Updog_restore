# Phoenix: Truth-Driven Fund Calculation Rebuild

**Version:** 2.11
**Date:** December 4, 2025
**Timeline:** 8-10 weeks (accelerated with branch asset leverage)
**Status:** ACTIVE - Supersedes all prior Phoenix plans
**Executor:** Solo Developer
**Approach:** Leverage, Harden, Validate (not Rebuild)
**Success Probability:** 90-95% with branch asset integration (improved from 80-85%)

---

## BRANCH ASSET INVENTORY (v2.11 Discovery)

**Critical Finding:** Analysis of repository branches reveals substantial existing assets that accelerate execution by 3-5 weeks.

### Immediate Action Required

| Branch | Action | Priority | Value |
|--------|--------|----------|-------|
| `feat/excel-parity-testing` | **MERGE NOW** | CRITICAL | 3 scenarios, automated validation, 100% provenance |
| `phoenix/phase-1-wizard-fees` | Merge in Phase 3 | HIGH | Fee calculations already on main |

### Verified Assets on Main Branch

| Asset | Location | Status | Test Coverage |
|-------|----------|--------|---------------|
| **Fee Calculations** | `client/src/lib/fee-calculations.ts` | Production-ready | `tests/unit/fees.test.ts` |
| **Capital Allocation** | `client/src/lib/capital-allocation-calculations.ts` | Production-ready | `client/src/lib/__tests__/capital-allocation-calculations.test.ts` |
| **MOIC/DPI/TVPI** | `client/src/lib/reference-formulas.ts` | Production-ready | `tests/unit/reference-formulas.test.ts` |
| **Waterfall** | `client/src/lib/waterfall.ts` | Production-ready | `client/src/lib/__tests__/waterfall.test.ts` + 3 more |
| **XIRR** | `client/src/lib/finance/xirr.ts` | Production-ready | `tests/unit/xirr-golden-set.test.ts` (25 cases) |
| **Excel Parity Validator** | `client/src/lib/excel-parity-validator.ts` | Production-ready | Automated validation |

### Excel Parity Branch Assets (`feat/excel-parity-testing`)

| Scenario | Fund Size | Target TVPI | Target IRR | Use Case |
|----------|-----------|-------------|------------|----------|
| **Baseline** | $100M | 2.5x | 18.5% | POV Fund I equivalent, regression testing |
| **Aggressive** | $100M | 3.8x | 28.5% | High-return edge cases |
| **Conservative** | $100M | 1.85x | 12.5% | Steady-growth scenarios |

**Excel Formulas Documented:** TVPI, DPI, IRR, NAV, Management Fees, GP Carry (100% provenance)

---

## REVISED TIMELINE (v2.11 with Branch Assets)

| Phase | Original | With Assets | Savings | Rationale |
|-------|----------|-------------|---------|-----------|
| Pre-Phase 0 | 1 week | **2-3 days** | 2-4 days | Use excel-parity scenarios |
| Phase 0A | 1 week | **3-4 days** | 3 days | Engines already exist |
| Phase 0B | 1 week | 1 week | 0 days | L3 contracts still needed |
| Phase 1 (MOIC) | 2 weeks | **3-4 days** | 7-8 days | Leverage ReferenceFormulas |
| Phase 2 (Capital) | 2 weeks | **1 week** | 1 week | Leverage capital-allocation-calculations.ts |
| Phase 3 (Fees) | 1 week | **1-2 days** | 3-5 days | fee-calculations.ts already exists |
| Phase 4 (Waterfall) | 1 week | **3-4 days** | 3 days | waterfall.ts exists |
| Phase 5 (IRR) | 3-4 days | **1-2 days** | 2 days | XIRR complete with 25 truth cases |
| Phase 6 | 2 weeks | **1.5-2 weeks** | 2-3 days | Wizard already integrated |
| **Total** | **12-13 weeks** | **8-10 weeks** | **3-5 weeks** | |

---

## CRITICAL GAPS (Updated Status)

| Gap | Severity | Original Status | v2.11 Status |
|-----|----------|-----------------|--------------|
| **PHOENIX_FLAGS don't exist** | CRITICAL | Open | **Open** - Phase 0B |
| **Scope mismatch** | CRITICAL | Open | **Open** - Phase -1 decision |
| **Shadow mode vulnerabilities** | CRITICAL | Open | **Open** - Phase 0B |
| **DeterministicReserveEngine path** | MEDIUM | Open | **Resolved** - Correct path in plan |
| **Engines lack tests** | ~~MEDIUM~~ | ~~4/6~~ | **CORRECTED: 5/6 have tests** |
| **L3 output contracts** | HIGH | 20% | **Open** - Phase 0B |
| **Truth case provenance** | ~~HIGH~~ | ~~7.8%~~ | **RESOLVED by excel-parity branch** |

**Gaps Resolved: 3/7** (engine path, test coverage, provenance)

---

## Operator's View (Flight Card)

**Use this when tired or context-switching. Full details below.**

### Daily Checklist

```
[ ] What is the ONE thing I'm shipping today? (e.g., "Realized MOIC truth cases pass")
[ ] Which phase am I in? (Pre-0, 0-6)
[ ] What calculation am I validating?
[ ] Have I checked EXISTING ENGINES first?
[ ] Have I checked existing JSON truth cases?
[ ] Are required validation layers for this phase passing? (see layer table below)
[ ] What's my AI tier for this calculation?
```

### Restart After Breaks (>5 days)

Before resuming after any break of 5+ calendar days:

```
[ ] Re-run `npm test` and compare to last saved baseline
[ ] Re-open the current phase's exit gate checklist - confirm what is actually Done
[ ] Dump a 10-15 minute "what I was doing" brain recap into `notes/phoenix-journal.md`
[ ] Choose a single "ONE thing" for the first day back (phase X, calculation Y, layer Z)
```

**Why:** Solo developers are especially vulnerable to "rusty brain" days after gaps. This protocol reinforces the Flight Card and single-focus discipline.

### Validation Layer Requirements by Phase

Layer adoption is **progressive**, not all-or-nothing. L3 only required for **external-facing data** (CSV export, API response, LP reports).

| Phase | L1 Plausibility | L2 Fund State | L3 Output | L4 Logging |
|-------|-----------------|---------------|-----------|------------|
| 0A | - | - | - | - |
| 0B | Scaffold only | - | - | Wrapper exists |
| 1 (MOIC) | **Required** | Warn-only | External only | **Required** |
| 2-3 | **Required** | **Required** | External only | **Required** |
| 4+ | **Required** | **Required** | **Required** | **Required** |

**Notes:**
- "Warn-only" = Layer 2 logs violations but doesn't block calculation. Upgrade to enforced by Phase 2.
- "External only" = L3 contracts only for fields that leave the system (CSV/API/LP report) in this phase. Internal intermediates skip L3 until Phase 4.

### Quick Reference

| Phase | Week | Focus | Exit Gate |
|-------|------|-------|-----------|
| Pre-0 | 1 | MOIC truth cases + provenance audit | Truth cases exist, provenance verified |
| 0A | 2 | Read & Decide: Engine audit (Tier A only) | ENGINE_AUDIT.md + trust levels assigned |
| 0B | 3-4 | Harden Happy Path: TS triage + L1/L4 for MOIC path | tsconfig.phoenix.json clean, MOIC path hardened |
| 1 | 5-6 | MOIC (leverage existing) + API integration | 4 variants pass, API wired |
| 2 | 7-8 | Capital calls/distributions + API integration | 3 scenarios validated, API wired |
| 3 | 9 | Fee engine (4 bases) + API integration | 4 fee basis methods pass, API wired |
| 4 | 10 | American waterfall + API integration | Deal-by-deal carry validated, API wired |
| 5 | 11 | IRR (leverage existing XIRR) + API integration | All edge cases pass, API wired |
| 6 | 12-13 | MOIC canary shadow + rollout + rollback drill | MOIC 100% rollout, drill passed |

**Critical Insight:** Engine existence ≠ correctness ≠ production-ready. Audit before assuming leverage.

### 4 Validation Layers (Defense-in-Depth)

| Layer | Purpose | Check |
|-------|---------|-------|
| 1 | Data Plausibility | Zod schema with business rules |
| 2 | Fund Lifecycle State | Valid state for operation |
| 3 | Output Contracts | Precision/rounding for target |
| 4 | Debug Instrumentation | Structured logging with context |

**Validation Layer Gap Analysis (v2.10):**

| Layer | Existing | Gap | Priority |
|-------|----------|-----|----------|
| **L1** | 70% - Zod schemas, conservation validation, range checks | Missing: centralized limits, context-aware MOIC | HIGH |
| **L2** | 40% - `lifecycle-rules.ts` with stages | Missing: operation validation, state transitions | MEDIUM |
| **L3** | 20% - Contract schemas (structure only) | Missing: precision rules, rounding modes, `formatForContract()` | HIGH |
| **L4** | 60% - Winston logging, performance monitors | Missing: Phoenix-specific wrappers, calculation context | LOW |

**What Already Exists (Leverage, Don't Rebuild):**
- `shared/schemas/decimal-zod.ts`: ZodPercentage, ZodPositiveDecimal
- `shared/lib/lifecycle-rules.ts`: LifecycleStage, getFundAge(), getLifecycleStage()
- `shared/validation/conservation.ts`: validateConservation(), validateReserveAllocationConservation()
- `server/utils/logger.ts`: Winston with custom levels, performance monitors
- `shared/instrumentation.ts`: Logger interface, runtime injection

### AI Validation Tiers

| Tier | Calculations | Rule |
|------|-------------|------|
| 1 | NAV, simple sums | 1 AI, must be GREEN |
| 2 | Fees, capital calls | 2 AI, both GREEN |
| 3 | Waterfall, IRR, MOIC | 2-3 AI, at least one GREEN, none RED |

**Tier 3 Clarification:** If an AI returns YELLOW but others are GREEN and numbers match truth cases within thresholds, treat YELLOW as advisory comments, not a hard block. Truth cases + numeric parity are the ultimate arbiters.

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

### Working Agreements (Cognitive Load Mitigation)

**ONE-at-a-time discipline prevents burnout:**

- **ONE Phoenix flag at a time** - Don't enable shadow for MOIC + Fees simultaneously
- **ONE calculation family at a time** - MOIC → Capital → Fees → Waterfall → IRR (sequential)
- **ONE validation layer at a time** - Don't add Layer 2 while Layer 1 incomplete
- **ONE deliverable per day** - From daily checklist "ONE thing shipping today"
- **NO new infra without explicit scope change** - No BullMQ, Kafka, GraphQL

**Themed Days (reduce context switching):**
- Monday: Planning + truth case review
- Tuesday-Thursday: Implementation
- Friday: Testing + documentation

---

## 1. Executive Summary

This plan rebuilds financial calculations for a VC fund modeling platform using a **truth-driven validation approach** with **defense-in-depth architecture**. Calculations are validated against existing JSON truth cases and protected by 4 validation layers.

### Core Philosophy: Leverage, Harden, Validate

**NOT "Rebuild from Scratch"** - Audit existing engines first, leverage what works.

1. **Leverage Existing Code**: Audit `reference-formulas.ts`, `LiquidityEngine.ts`, `DeterministicReserveEngine.ts`
2. **Harden with 4 Validation Layers**: Add plausibility, lifecycle, contracts, instrumentation
3. **Validate Against Truth Cases**: JSON truth cases are source of truth
4. **Replace Only What Fails**: If existing code passes truth cases, don't rebuild
5. **Integrate Incrementally**: Wire to API/UI after each phase (not big-bang in Phase 6)
6. **Feature Flags for Safety**: In-memory shadow mode with instant rollback (no Redis)

### Existing Assets to Leverage

| Asset | Location | Phoenix Use |
|-------|----------|-------------|
| **ReferenceFormulas** | `client/src/lib/reference-formulas.ts` | GrossMOIC, NetMOIC, DPI, TVPI |
| **DeterministicReserveEngine** | `shared/core/reserves/` | Pattern template, Exit MOIC |
| **LiquidityEngine** | `client/src/core/LiquidityEngine.ts` | Cash flow analysis for Phase 2 |
| **XIRR Implementation** | `client/src/lib/finance/xirr.ts` | Phase 5 leverage |
| **Waterfall Schema** | `shared/schemas/waterfall-policy.ts` | Phase 4 leverage |
| **Fee Profile Schema** | `shared/schemas/fee-profile.ts` | Phase 3 leverage |

### Decision Framework

For each calculation:
1. **Check**: Does existing implementation exist?
2. **Test**: Does it pass against truth cases?
3. **Decide**:
   - If passes → Add validation layers, skip rebuild
   - If fails → Fix existing or replace
   - If missing → Build new (as planned)

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

// Configurable plausibility limits (tunable without code changes)
export const PLAUSIBILITY_LIMITS = {
  MAX_FUND_SIZE: 10_000_000_000,      // $10B
  MAX_FEE_RATE: 0.10,                 // 10%
  MIN_FUND_SIZE: 100_000,             // $100K
  // MOIC limits differ by context (fund-level vs deal-level)
  MAX_MOIC: {
    fund: 100,    // Fund-level 100x is extreme but possible
    deal: 1_000,  // Deal-level 10-100x is normal for seed; 1000x = safety cap
  },
} as const;

export type MoicContext = 'fund' | 'deal';

export const MOICInputSchema = z.object({
  contributions: z.number()
    .min(0, "Contributions cannot be negative")
    .max(PLAUSIBILITY_LIMITS.MAX_FUND_SIZE, "Contributions exceed plausibility limit"),
  currentValue: z.number()
    .min(0, "Current value cannot be negative"),
  distributions: z.number()
    .min(0, "Distributions cannot be negative"),
}).refine(
  data => data.contributions > 0,
  "Contributions must be positive for MOIC calculation"
);

// Separate warning check (does not fail validation, only logs)
// Use context to apply appropriate limit (fund-level vs deal-level)
export function checkMOICPlausibility(
  input: { contributions: number; currentValue: number; distributions: number },
  context: MoicContext = 'fund'  // Default to stricter fund-level
): {
  warnings: string[];
  isPlausible: boolean;
} {
  const warnings: string[] = [];
  const moic = (input.currentValue + input.distributions) / input.contributions;
  const limit = PLAUSIBILITY_LIMITS.MAX_MOIC[context];

  if (moic > limit) {
    warnings.push(`MOIC ${moic.toFixed(2)}x exceeds ${limit}x ${context}-level threshold - verify inputs`);
  }

  return { warnings, isPlausible: warnings.length === 0 };
}

// Hard failures vs warnings:
// - HARD FAIL: negative values, zero contributions, impossible math
// - WARNING: extreme but possible values (100x+ MOIC, very high fees)

// IRR result type includes "not yet realized" status for early funds
export type IRRResult =
  | { status: 'computed'; irr: number; converged: boolean }
  | { status: 'not_yet_realized'; irr: null; reason: string };

export const IRRInputSchema = z.object({
  cashflows: z.array(z.object({
    date: z.string().datetime(),
    amount: z.number(),
  })).min(1, "IRR requires at least 1 cash flow"),
}).refine(
  data => data.cashflows.some(cf => cf.amount < 0),
  "IRR requires at least one negative cash flow (investment)"
);
// NOTE: Positive cash flow is NOT required - early funds may have only called capital

// Handle funds with no distributions yet (IRR is undefined, not an error)
export function computeIRR(input: z.infer<typeof IRRInputSchema>): IRRResult {
  const hasPositive = input.cashflows.some(cf => cf.amount > 0);

  if (!hasPositive) {
    // Fund has only called capital, no exits/distributions yet
    return {
      status: 'not_yet_realized',
      irr: null,
      reason: 'No positive cash flows yet (no distributions or exits)',
    };
  }

  // Normal IRR computation
  const irr = xirr(input.cashflows); // Your existing XIRR implementation
  return { status: 'computed', irr, converged: true };
}

export const FeeInputSchema = z.object({
  fundSize: z.number()
    .min(PLAUSIBILITY_LIMITS.MIN_FUND_SIZE)
    .max(PLAUSIBILITY_LIMITS.MAX_FUND_SIZE),
  feeRate: z.number()
    .min(0, "Fee rate cannot be negative")
    .max(PLAUSIBILITY_LIMITS.MAX_FEE_RATE, "Fee rate exceeds plausibility limit"),
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

// Typed operation constants (avoid magic strings)
export type FundOperation =
  | 'capital_call'
  | 'distribution'
  | 'nav'
  | 'fee'
  | 'moic'
  | 'irr'
  | 'waterfall'
  | 'final_distribution'
  | 'final_nav'
  | 'final_moic'
  | 'final_irr';

const VALID_TRANSITIONS: Record<FundState, FundState[]> = {
  FUNDRAISING: ['INVESTING'],
  INVESTING: ['HARVESTING'],
  HARVESTING: ['LIQUIDATED'],
  LIQUIDATED: [],
};

const ALLOWED_OPERATIONS: Record<FundState, FundOperation[]> = {
  FUNDRAISING: ['capital_call', 'nav'],
  INVESTING: ['capital_call', 'distribution', 'nav', 'fee', 'moic', 'irr'],
  HARVESTING: ['distribution', 'nav', 'fee', 'moic', 'irr', 'waterfall'],
  LIQUIDATED: ['final_distribution', 'final_nav', 'final_moic', 'final_irr'],
};

export function validateOperation(
  fundState: FundState,
  operation: FundOperation
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

**Leverage Existing:** The codebase already has `shared/lib/lifecycle-rules.ts` with `LifecycleStage` type. Align Phoenix terminology with existing code:

| Phoenix Term | Existing Term | Location | Action |
|--------------|---------------|----------|--------|
| FUNDRAISING | (none) | - | Add to `LifecycleStage` type |
| INVESTING | `investment` | `lifecycle-rules.ts:28` | Map via alias |
| HARVESTING | `harvest` | `lifecycle-rules.ts:31` | Map via alias |
| LIQUIDATED | `liquidation` | `lifecycle-rules.ts:32` | Map via alias |

**Implementation Decision:** Extend existing `LifecycleStage` in `lifecycle-rules.ts` rather than creating parallel `FundState` type. Use `getLifecycleStage()` function which derives state from fund age.

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

// Contract usage mapping (where each contract is used):
// - UI_DISPLAY: MainDashboardV2 KPIs, Portfolio tables, Fund metrics
// - CSV_EXPORT: "Download to Excel" feature, LP reports
// - API_RESPONSE: External integrations, mobile apps
// - INTERNAL_CALC: Intermediate calculations, waterfall steps

// Brand/UI Note: Any UI adjustments during Phoenix should reuse the existing
// Inter/Poppins typography and gray/sand palette defined in brand-tokens.css.
// Phoenix does not introduce new visual tokens.

export function formatForContract(
  value: Decimal,
  contractKey: keyof typeof OUTPUT_CONTRACTS,
  logger?: { warn: (msg: string, ctx: object) => void }
): { formatted: string; precisionLoss: string; clamped: boolean } {
  const contract = OUTPUT_CONTRACTS[contractKey];

  const rounded = value.toDecimalPlaces(
    contract.decimals,
    contract.roundingMode === 'HALF_UP' ? Decimal.ROUND_HALF_UP :
    contract.roundingMode === 'HALF_EVEN' ? Decimal.ROUND_HALF_EVEN :
    Decimal.ROUND_DOWN
  );

  const precisionLoss = value.minus(rounded).abs();
  let clamped = false;

  // Enforce maxValue with logging and clamping
  if (rounded.abs().greaterThan(contract.maxValue)) {
    logger?.warn('Value exceeded output contract maxValue', {
      contractKey,
      value: value.toString(),
      rounded: rounded.toString(),
      maxValue: contract.maxValue,
    });

    // Clamp for UI, but log for investigation
    // API responses should throw instead if strict mode enabled
    clamped = true;
  }

  return {
    formatted: rounded.toFixed(contract.decimals),
    precisionLoss: precisionLoss.toString(),
    clamped,
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

**PII Sanitization Rule:** `sanitizeForLogging` MUST strip or hash any PII (investor names, emails, phone numbers, account numbers). Only fund-level IDs and aggregate numeric values should be logged. Never log raw LP data.

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

**Excel Policy:** Do not introduce a *new* long-lived Excel workbook as a second source of truth. Temporary spreadsheets are allowed for scratch calculations and design verification, but **all authoritative truth must be encoded in the existing JSON truth cases** with `excelFormula` fields where applicable. Rule: *"No change is 'real' until it's encoded as a JSON truth case and tests pass."*

### Hybrid Truth Case Strategy

**Leverage existing Golden Dataset infrastructure** (`tests/fixtures/golden-datasets/`) for time-series validations. Use JSON for point-in-time formula verification.

| Calculation Type | Format | Rationale | Location |
|------------------|--------|-----------|----------|
| MOIC (4 variants) | JSON | Point-in-time formula | `docs/moic.truth-cases.json` |
| IRR/XIRR | JSON | Point-in-time, existing format | `docs/xirr.truth-cases.json` |
| Fees | JSON | Per-period formula | `docs/fees.truth-cases.json` |
| Capital Calls | Golden Dataset CSV | Time-series tabular data | `tests/fixtures/golden-datasets/capital-calls/` |
| Distributions | Golden Dataset CSV | Time-series tabular data | `tests/fixtures/golden-datasets/distributions/` |
| Waterfall | Golden Dataset CSV | Multi-step tabular output | `tests/fixtures/golden-datasets/waterfall/` |

**Why Hybrid:** Golden Datasets provide byte-level reproducibility with 1e-6 tolerance for time-series data. JSON is simpler for single-output formula validation. Using both avoids reinventing infrastructure.

**Integration:** Use existing `tests/utils/golden-dataset.ts` utilities for CSV-based validations in Phases 2 and 4.

**Golden Dataset Scope Freeze:**

To prevent the hybrid approach from becoming a parallel spec system, limit initial Golden Datasets to:

| Dataset | Phase | Purpose |
|---------|-------|---------|
| `phoenix_fund_timeseries.csv` | 2 | Fund-level cash flows & NAV |
| `phoenix_waterfall_scenarios.csv` | 4 | Full-fund waterfall stories (3-5 scenarios) |

**Rule:** No new Golden Datasets until after Phase 3 unless a P0 bug explicitly demands time-series validation. JSON truth cases are the default.

### Truth Case Audit (Phase 0 Prerequisite)

Before Phase 1, run a one-time audit of each `*.truth-cases.json` file:

1. **Confirm exact counts** - Replace approximate counts (~15, ~20) with actual numbers
2. **Tag Phoenix scenarios** - Add `["phoenix-v2", "moic"]` tags to scenarios used by Phoenix
3. **Identify gaps** - List missing scenarios needed for Phase 1-4 (e.g., multi-LP calls, fee step-downs)
4. **Document in inventory** - Commit `TRUTH_CASE_INVENTORY.md` with up-to-date counts and tags

**Exit Criterion:** `TRUTH_CASE_INVENTORY.md` committed before Phase 1 begins.

### Truth Case vs Code Bug Classification

When code fails a truth case, **classify before fixing**:

| Classification | Symptom | Action |
|----------------|---------|--------|
| **Case Bug** | JSON `expected` doesn't match agreed financial logic | Fix JSON, add tag `["corrected"]`, add `correctionReason` field |
| **Code Bug** | JSON is correct, implementation is wrong | Fix code, add regression test referencing truth-case ID |
| **Spec Gap** | Neither clearly right (e.g., SAFE conversion ambiguous) | Move to `DEFERRED_VALIDATIONS.md`, mark JSON with `status: "pending"` |

**Critical Rule:** Never change code just to make JSON go green unless you've confirmed the JSON represents correct financial behavior. When in doubt, defer.

**Corrected Truth Case Example:**
```json
{
  "scenario": "MOIC-003-edge-case",
  "tags": ["phoenix", "moic", "corrected"],
  "correctionReason": "Original expected value used wrong denominator (committed vs called)",
  "input": { ... },
  "expected": { "currentMOIC": 1.45 }
}
```

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

**Note:** POV Fund I is a conceptual reference scenario. Its cashflows must be encoded as one or more JSON truth cases to be tested; there is no separate Excel file or hard-coded path for this scenario. The scenario parameters above inform what truth cases to create.

### POV Fund I Truth Case Mapping

Each aspect of POV Fund I is encoded in the appropriate truth case file:

| Aspect | Truth File | Scenario ID Pattern | Phase |
|--------|------------|---------------------|-------|
| IRR/XIRR | `docs/xirr.truth-cases.json` | `pov-fund-irr-*` | 5 |
| MOIC (4 variants) | `docs/moic.truth-cases.json` | `pov-fund-moic-*` | 1 |
| Fees | `docs/fees.truth-cases.json` | `pov-fund-fees-*` | 3 |
| Waterfall | `docs/waterfall.truth-cases.json` | `pov-fund-waterfall-*` | 4 |
| Capital Calls | `docs/capital-allocation.truth-cases.json` | `pov-fund-capital-*` | 2 |

**Tagging Convention:** All POV Fund I scenarios MUST include tags `["pov-fund-i", "phoenix-v2"]` for traceability.

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

### Phase -1: Reality Sync (Before Starting)

**Goal:** Reconcile plan assumptions with actual execution state. Prevents duplicating completed work.

**Context:** This plan is written as a self-contained blueprint. If execution has already started (phoenix/* branches exist, some exit gates already met), this step prevents blindly following the plan from the beginning.

**Reality Sync Checklist:**

For each phase, check the **exit criteria** and mark as:
- DONE: Already met (skip this phase's work)
- PARTIAL: Partially met (start from incomplete items)
- NOT_STARTED: Proceed with full phase

| Exit Criterion | Check Command / File | Status |
|----------------|----------------------|--------|
| `docs/moic.truth-cases.json` exists (9+ cases) | `ls docs/moic.truth-cases.json` | [ ] |
| `TRUTH_CASE_INVENTORY.md` committed | `ls TRUTH_CASE_INVENTORY.md` | [ ] |
| `ENGINE_AUDIT.md` with tier classification | `ls ENGINE_AUDIT.md` | [ ] |
| `TACTYC_ALIGNMENT.md` committed | `ls TACTYC_ALIGNMENT.md` | [ ] |
| `tsconfig.phoenix.json` created | `ls tsconfig.phoenix.json` | [ ] |
| PHOENIX_FLAGS in `flag-definitions.ts` | `grep PHOENIX flag-definitions.ts` | [ ] |
| Layer 3 output contracts implemented | Check `shared/schemas/` | [ ] |

**Branch State Check:**

```bash
# What Phoenix work exists?
git branch -a | grep phoenix
git log --since="2025-11-30" --oneline --all | grep -i phoenix

# Diff against main to see actual changes
git diff main..origin/phoenix/phase-1-wizard-fees --stat
```

**Exit Criterion:** `REALITY_SYNC.md` committed documenting:
- Which phases are DONE, PARTIAL, or NOT_STARTED
- Current branch and last Phoenix-related commit
- Adjusted starting point (e.g., "Start at Phase 1, skip Pre-Phase 0 and 0A")

**Why This Exists:** The `phoenix/phase-1-wizard-fees` branch and `runbooks/phoenix-execution.md` show significant Phase 0 work is already complete. This step prevents re-doing that work.

**CRITICAL: Scope Clarification (v2.10)**

Two Phoenix execution documents exist with DIFFERENT SCOPES:

| Document | Version | Scope | Status |
|----------|---------|-------|--------|
| `runbooks/phoenix-execution.md` | v2.2 | IA + Wizard improvements | Phase 0 DONE, Track 2 DONE |
| This plan (`PHOENIX-EXECUTION-PLAN.md`) | v2.10 | Calculation rebuild | Pre-Phase 0 NOT STARTED |

**What's Been Completed (on `phoenix/phase-1-wizard-fees` branch):**
- Phase 0 baseline locking (TS errors: 452, tests: 74.2%)
- Ground zero tag: `phoenix-ground-zero-2025-11-30`
- Wizard Track 2: FeesExpensesStep auto-save (15 tests)

**What Has NOT Started:**
- Pre-Phase 0: MOIC truth cases (this plan)
- Phase 0A: Engine audit (this plan)
- Phase 0B: Validation layers (this plan)
- Phase 1: MOIC calculations (this plan)

**Decision Required:** Before proceeding, choose ONE active track:
- **Option A:** Continue this plan (calculation rebuild) - start at Pre-Phase 0
- **Option B:** Continue runbook v2.2 (IA/Wizard) - complete Track 1 IA Consolidation
- **Option C:** Run both in parallel (risk: cognitive overload for solo developer)

---

### Pre-Phase 0: Preparation (Week 1) - BLOCKER RESOLUTION

**Goal:** Eliminate blockers + verify truth case provenance before Phase 0 starts

**CRITICAL:** MOIC truth cases do NOT exist. Engine existence ≠ correctness.

**Day 1-2: Create MOIC Truth Cases**

| Task | Exit Criteria |
|------|---------------|
| Create `docs/moic.truth-cases.json` | File exists with valid JSON |
| Add Current MOIC cases (3) | Cases MOIC-001 to MOIC-003 |
| Add Realized MOIC cases (2) | Cases MOIC-004 to MOIC-005 |
| Add Target MOIC cases (2) | Cases MOIC-006 to MOIC-007 |
| Add Exit MOIC on Reserves cases (2) | Cases MOIC-008 to MOIC-009 |
| Validate against Excel | `excelFormula` field populated |

**Day 3: Truth Case Provenance Audit** ⭐ NEW

Verify existing truth cases are reliable before trusting them.

**Mechanical Checklist (per MOIC case you will rely on in Phase 1):**

```
For each truth case (9-12 cases total):
[ ] 1. Locate original Excel/Sheets formula (or back-solve it)
[ ] 2. Verify JSON `expected` matches Excel within thresholds (MOIC: 0.1%)
[ ] 3. Tag case with "tags": ["phoenix", "provenance-checked"]
[ ] 4. Log result in TRUTH_CASE_INVENTORY.md
```

**Scope:** Only the 9-12 MOIC cases needed for Phase 1. Don't audit all 3,992 lines of truth cases.

| Task | Exit Criteria |
|------|---------------|
| Document provenance for MOIC file | Source identified (Excel? Domain expert? Legacy?) |
| Sample verification (all Phase 1 cases) | Rebuild in Excel, confirm within tolerance |
| Flag suspicious cases | Mark with `status: "needs-review"` |
| Create `TRUTH_CASE_INVENTORY.md` | Provenance documented for Phase 1 cases |

**Provenance Inventory Format:**
```markdown
## xirr.truth-cases.json (25 cases)

**Provenance:** Excel XIRR function (excelFormula field present in JSON)
**Sample Verification:** 5 scenarios tested (01, 02, 13, 18, 24)
**Result:** All within 0.01% of Excel XIRR output
**Status:** VERIFIED - Excel parity confirmed
**Gaps:** No negative rate edge cases (add in Phase 5)
```

**Day 4-5: Encode POV Fund I Scenarios**

| Task | Exit Criteria |
|------|---------------|
| Add POV Fund I MOIC cases | Tagged `["pov-fund-i", "phoenix"]` |
| Add POV Fund I capital calls | In `capital-allocation.truth-cases.json` |
| Add POV Fund I fee scenarios | In `fees.truth-cases.json` |
| Add POV Fund I waterfall | In `waterfall.truth-cases.json` |

**Pre-Phase 0 Exit Criteria (ALL REQUIRED):**

- [ ] `docs/moic.truth-cases.json` exists with 9+ cases
- [ ] `TRUTH_CASE_INVENTORY.md` committed with provenance verification
- [ ] POV Fund I scenarios encoded in truth case files
- [ ] No truth cases flagged `status: "needs-review"` without resolution plan

**HARD GATE:** Phase 0 CANNOT start until Pre-Phase 0 is complete.

---

### Phase 0A: Read & Decide (Week 2)

**Goal:** Understand what exists. No refactors, no TS fixes yet.

**Critical Insight:** Engine existence ≠ correctness ≠ Tactyc-aligned. Read and classify BEFORE touching code.

#### Engine Audit with Tier Classification

Engines are classified into **Tier A** (deep-dive now) vs **Tier B** (read now, deep-dive when used):

| Tier | Engine | Location | Why This Tier |
|------|--------|----------|---------------|
| **A** | ReferenceFormulas | `client/src/lib/reference-formulas.ts` | Used in Phase 1 (MOIC) |
| **A** | DeterministicReserveEngine | `shared/core/reserves/` | Pattern template, Exit MOIC |
| **A** | XIRR | `client/src/lib/xirr.ts` | Used in Phase 5, but formula critical |
| **B** | LiquidityEngine | `client/src/core/LiquidityEngine.ts` | Deep-dive in Phase 2 |
| **B** | WaterfallSchema | `shared/schemas/waterfall-policy.ts` | Deep-dive in Phase 4 |
| **B** | FeeProfileSchema | `shared/schemas/fee-profile.ts` | Deep-dive in Phase 3 |

**Tier A: Full audit in Phase 0A.** Answer: Does it work? Can we trust it? What's missing?
**Tier B: Structure review only.** Note locations, document entry points, defer deep-dive to their phase.

**Phase 0A Tasks:**

| Task | Exit Criteria |
|------|---------------|
| Deep audit Tier A engines | Alignment gaps documented |
| Structure review Tier B engines | Entry points noted, defer deep-dive |
| Create `ENGINE_AUDIT.md` | Tier classification + trust levels |
| Server import verification | `npx tsc --noEmit` passes or barrel created |

**ENGINE_AUDIT.md Template:**

| Engine | Tier | Tactyc Alignment | Test Coverage | Trust Level | Deep-Dive Phase |
|--------|------|------------------|---------------|-------------|-----------------|
| ReferenceFormulas | A | MOIC: ✅ DPI: ✅ TVPI: ✅ | 0 tests | HIGH | 0A |
| DeterministicReserveEngine | A | Exit MOIC: ✅ Fractional: ❓ | 3 unit tests | MEDIUM | 0A |
| XIRR | A | Excel parity: ✅ | 25 truth cases | HIGH | 0A |
| LiquidityEngine | B | Tactyc cashflow: ❓ | 0 tests | UNKNOWN | Phase 2 |
| WaterfallSchema | B | American: ✅ European: ❓ | 0 tests | MEDIUM | Phase 4 |
| FeeProfileSchema | B | 6 basis vs Tactyc's 7: ❓ | 0 tests | UNKNOWN | Phase 3 |

**Tactyc Alignment Tables (TACTYC_ALIGNMENT.md):**

Create per-engine alignment documentation. **Scope:** Terminology and primary formulas match, not every optional Tactyc switch.

```markdown
## MOIC Engine - Tactyc Alignment

| Tactyc Term | Our Term | Formula Match | Notes |
|-------------|----------|---------------|-------|
| Gross MOIC | GrossMOIC | Y | Verified |
| Net MOIC | NetMOIC | Y | After fees |
| DPI | DPI | Y | Distributions / Called |
| TVPI | TVPI | Y | (NAV + Distributions) / Called |

## Fee Engine - Tactyc Alignment (Phase 3 deep-dive)

| Tactyc Basis Method | Our Method | Status |
|---------------------|------------|--------|
| Committed Capital | committed | Implemented |
| Called Capital | called | Implemented |
| Invested Capital | invested | Implemented |
| Net Asset Value | fmv | Implemented |
| Unfunded Commitment | - | GAP: Defer to Phase 3 |
| Remaining Cost | - | GAP: Defer to Phase 3 |
```

**Server Import Verification (2-4 hours):**

| Task | Exit Criteria |
|------|---------------|
| Test server-side import | `npx tsc --noEmit server/test-phoenix-imports.ts` |
| If fails: Create barrel export | `shared/engines/index.ts` re-exports with explicit paths |
| Verify no browser deps | Grep for `window`, `document`, `localStorage` |

**Phase 0A Exit Criteria:**

- [ ] `ENGINE_AUDIT.md` committed with tier classification
- [ ] `TACTYC_ALIGNMENT.md` committed (Tier A engines only)
- [ ] Server import verification passed or barrel created
- [ ] No refactors or TS fixes done (read-only phase)

---

### Phase 0B: Harden Happy Path (Weeks 3-4)

**Goal:** Apply TS triage and validation layers **only to the MOIC path** that Phase 1 will use. Push "nice-to-have" to later phases.

#### TypeScript Surgical Triage

**Scope:** Phoenix entrypoints ONLY, not all 454 errors. **Cap: Maximum 30 P0 errors fixed.**

| Task | Exit Criteria |
|------|---------------|
| Create `tsconfig.phoenix.json` | Strict mode for Phoenix files only |
| Run `npx tsc -p tsconfig.phoenix.json` | Identify P0 errors in Phoenix APIs |
| Fix P0 errors (~20-30 estimated) | Phoenix interfaces compile strict |
| Defer non-Phoenix errors | Tagged with `// TODO: PHOENIX-v3.1` |

**tsconfig.phoenix.json:**
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  },
  "include": [
    "client/src/lib/reference-formulas.ts",
    "client/src/lib/xirr.ts",
    "client/src/core/LiquidityEngine.ts",
    "shared/schemas/waterfall-policy.ts",
    "shared/schemas/fee-profile.ts",
    "shared/core/reserves/DeterministicReserveEngine.ts",
    "shared/schemas/phoenix-validation.ts"
  ]
}
```

**Goal:** `npx tsc -p tsconfig.phoenix.json` returns 0 errors

**Week 3: Test Infrastructure + Feature Flags**

| Task | Exit Criteria |
|------|---------------|
| Fix `cross-env not found` error | `npm test` runs without setup errors |
| Verify sidecar packages linked | `npm run doctor:links` passes |
| Establish baseline test pass rate | Document current pass rate |

**Day 2: Feature Flag Infrastructure**

**BLOCKER (v2.10 Gap Analysis):** These flags DO NOT EXIST. The infrastructure supports them (5 flag systems, percentage rollout ready), but `phoenix.*` flags must be created before shadow mode can work.

| Task | Exit Criteria |
|------|---------------|
| Add `phoenix.*` flags to `flag-definitions.ts` | Flags compile and export |
| Implement calculation switching logic | `isPhoenixEnabled()` function works |
| Test flag toggling | Flag changes reflected in runtime |
| Coordinate with wizard flags | No conflicts with `enable_wizard_*` |
| Verify percentage rollout works | `shouldEnableForUser()` bucketing correct |

```typescript
// Flags to create in shared/feature-flags/flag-definitions.ts
// CRITICAL: These DO NOT exist yet - must be created in Phase 0B
export const PHOENIX_FLAGS = {
  'phoenix.enabled': {
    enabled: false,
    rolloutPercentage: 0,
    description: 'Master switch for Phoenix calculation engine'
  },
  'phoenix.shadow_mode': {
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['phoenix.enabled'],
    description: 'Run Phoenix in shadow mode (compare results, return legacy)'
  },
  'phoenix.moic': {
    enabled: false,
    dependencies: ['phoenix.enabled'],
    description: 'Use Phoenix for MOIC calculations'
  }
'phoenix.irr': { enabled: false, dependencies: ['phoenix.moic'] }
'phoenix.fees': { enabled: false, dependencies: ['phoenix.moic'] }
'phoenix.waterfall': { enabled: false, dependencies: ['phoenix.fees'] }
```

**Day 3: Truth Case Inventory**

| Task | Exit Criteria |
|------|---------------|
| Count exact cases in each JSON file | No approximate counts (~15, ~20) |
| Tag all phoenix-v2 scenarios | `["phoenix-v2", "moic"]` tags added |
| Document gaps | Missing scenarios listed |
| Commit inventory | `TRUTH_CASE_INVENTORY.md` in repo |

**Days 4-5: Validation Layers (MOIC Path Only)**

Focus on L1 + L4 for the MOIC happy path. L2 warn-only, L3 deferred to Phase 1 for exports.

| Task | Exit Criteria |
|------|---------------|
| Implement Layer 1 (Zod schemas) | `phoenix-validation.ts` with MOIC schema tested |
| Scaffold Layer 2 (Fund lifecycle) | `fund-lifecycle.ts` created, warn-only mode |
| Scaffold Layer 3 (Output contracts) | `output-contracts.ts` created (implement in Phase 1) |
| Implement Layer 4 (Instrumentation) | `phoenix-logger.ts` with correlation IDs tested |

**Phase 0B Exit Criteria (ALL REQUIRED):**

- [ ] `npm test` runs completely (infrastructure works)
- [ ] Phoenix feature flags defined and testable in `flag-definitions.ts`
- [ ] `TRUTH_CASE_INVENTORY.md` committed with exact counts and gap list
- [ ] L1 + L4 implemented and tested for MOIC path; L2/L3 scaffolded
- [ ] Zod schema for MOIC inputs defined and tested
- [ ] **TS Smoke Test:** `npx tsc -p tsconfig.phoenix.json` returns 0 errors
- [ ] **TS Fix Cap:** Maximum 30 errors fixed; remaining tracked in `TS_DEFERRED.md`

**HARD GATE:** Phase 1 CANNOT start until all Phase 0A + 0B exit criteria are met.

---

## Go/No-Go Decision Gates

**Purpose:** Explicit checkpoints to assess project health and decide whether to continue, pivot, or stop.

### Gate 1: End of Phase 0B (Week 4)

**Question:** Is the MOIC path hardened enough to build on?

| Criterion | Required | Evidence |
|-----------|----------|----------|
| Test infrastructure works | YES | `npm test` completes without setup errors |
| MOIC truth cases exist | YES | `docs/moic.truth-cases.json` has 9+ cases |
| Tier A engine audit complete | YES | `ENGINE_AUDIT.md` with trust levels |
| Tactyc alignment (Tier A) | YES | `TACTYC_ALIGNMENT.md` for MOIC/XIRR |
| TS Phoenix subset compiles | YES | `npx tsc -p tsconfig.phoenix.json` = 0 errors |
| TS fix cap respected | YES | ≤30 errors fixed; rest in `TS_DEFERRED.md` |
| Feature flags defined | YES | `phoenix.*` flags in `flag-definitions.ts` |
| L1 + L4 working | YES | MOIC validation + logging tested |

**Decision:**
- **GO:** All criteria met → Proceed to Phase 1
- **CONDITIONAL GO:** 1-2 minor gaps (e.g., L2 incomplete) → Document, proceed
- **NO-GO:** TS smoke test fails OR Tier A audit incomplete → Stop, fix first

### Gate 2: End of Phase 3 (Week 9)

**Question:** Are core calculations validated and integrated?

| Criterion | Required | Evidence |
|-----------|----------|----------|
| MOIC passes all truth cases | YES | 9/9 green |
| Capital operations integrated | YES | API endpoints return correct values |
| Fee engine works (4 bases) | YES | All 4 fee basis methods pass |
| Leverage ratio acceptable | YES | > 40% existing code reused |
| No P0 regressions | YES | Existing tests still pass |
| Cumulative slip < 10 days | YES | Timeline tracking |

**Decision:**
- **GO:** All criteria met → Proceed to Phase 4 (Waterfall)
- **CONDITIONAL GO:** Leverage ratio 30-40% → Document rebuild justifications, proceed
- **NO-GO:** P0 regression OR slip > 10 days → Stop, root cause analysis

### Gate 3: End of Phase 6 (Week 12-13)

**Question:** Is Phoenix ready for production?

| Criterion | Required | Evidence |
|-----------|----------|----------|
| All truth cases pass | YES | 100% green across all JSON files |
| Shadow mode validated | YES | < 0.1% discrepancy rate |
| Rollback drill passed | YES | < 60 second rollback time |
| All 4 validation layers active | YES | Layers enforced in production builds |
| No P0 errors in 48h soak | YES | Monitoring clean |

**Decision:**
- **GO:** All criteria met → 100% rollout
- **CONDITIONAL GO:** Minor shadow discrepancies → Investigate, fix, re-soak
- **NO-GO:** Rollback drill failed OR P0 in soak → Do not ship, investigate

---

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

**Incremental Integration (End of Phase 1):**
- [ ] Wire `calculateMOIC()` to existing API endpoint (behind `phoenix.moic` flag)
- [ ] Add MOIC display to one UI component (read-only, flag-gated)
- [ ] Verify API returns Phoenix result when flag enabled
- [ ] **Integration test:** Call API, verify MOIC matches truth case

**Exit Gate:** MOIC calculation proven E2E with 4 validation layers AND API integration verified

### Phase 2: Capital Operations (Weeks 4-5)

**Goal:** Complete capital call and distribution logic

**Leverage Check:** Audit `LiquidityEngine.ts` before building. If existing code passes truth cases, add validation layers instead of rebuilding.

| Task | Truth Cases | AI Tier |
|------|-------------|---------|
| Multi-LP capital calls | 3 | Tier 2 |
| Partial calls | 2 | Tier 2 |
| Return of capital | 2 | Tier 2 |
| Profit distributions | 3 | Tier 2 |

**Incremental Integration (End of Phase 2):**
- [ ] Wire capital call endpoint (behind `phoenix.capital_calls` flag)
- [ ] Wire distribution endpoint (behind `phoenix.capital_calls` flag)
- [ ] Add capital call UI component (flag-gated)
- [ ] **Integration test:** Full capital call flow via API

**Exit Gate:** 3 distinct scenarios validated for calls and distributions AND API integration verified

### Phase 3: Fee Engine (Week 6)

**Goal:** All 4 fee basis methods working

**Leverage Check:** Audit existing fee calculation in `fee-profile.ts` and related files. If existing code passes truth cases, add validation layers instead of rebuilding.

| Fee Basis | Truth Cases | AI Tier |
|-----------|-------------|---------|
| Committed Capital | 2 | Tier 2 |
| Net Cumulative Called | 2 | Tier 2 |
| Cumulative Invested | 2 | Tier 2 |
| FMV-based | 2 | Tier 2 |

**Incremental Integration (End of Phase 3):**
- [ ] Wire fee calculation endpoint (behind `phoenix.fees` flag)
- [ ] Update fee display in Fund settings UI (flag-gated)
- [ ] **Integration test:** Fee calculation via API matches truth case

**Exit Gate:** Each fee basis method has 2 passing truth cases AND API integration verified

### Phase 4: American Waterfall (Weeks 7-8)

**Goal:** Deal-by-deal carry calculation validated

**Leverage Check:** Audit existing waterfall schema and calculations in `waterfall-policy.ts`. If existing code passes truth cases, add validation layers instead of rebuilding.

| Scenario | Truth Cases | AI Tier |
|----------|-------------|---------|
| Single exit, no hurdle | 1 | Tier 3 |
| Single exit, hurdle met | 1 | Tier 3 |
| Multiple exits, catch-up | 2 | Tier 3 |
| Clawback scenario | 1 | Tier 3 |
| GP commit treatment | 1 | Tier 3 |

**Incremental Integration (End of Phase 4):**
- [ ] Wire waterfall calculation endpoint (behind `phoenix.waterfall` flag)
- [ ] Update waterfall display in distribution UI (flag-gated)
- [ ] **Integration test:** Waterfall calculation via API matches truth case

**Exit Gate:** All waterfall scenarios pass with unanimous AI consensus AND API integration verified

### Phase 5: IRR (XIRR) (Weeks 8-9)

**Goal:** XIRR with edge cases validated

**Leverage Check:** 25 existing truth cases in `docs/xirr.truth-cases.json` already validated. Audit existing XIRR implementation first - if it passes truth cases, add validation layers instead of rebuilding.

| Metric | Truth Cases | AI Tier |
|--------|-------------|---------|
| XIRR (standard) | 3 | Tier 3 |
| XIRR (edge: single cash flow) | 1 | Tier 3 |
| XIRR (edge: all negative) | 1 | Tier 3 |
| XIRR (edge: very high return) | 1 | Tier 3 |

**Incremental Integration (End of Phase 5):**
- [ ] Wire IRR calculation endpoint (behind `phoenix.irr` flag)
- [ ] Update IRR display in fund metrics UI (flag-gated)
- [ ] **Integration test:** IRR calculation via API matches truth case

**Exit Gate:** All XIRR edge cases pass AND API integration verified

### Phase 6: MOIC Canary & Rollout (Weeks 12-13)

**Goal:** Prove shadow + rollout pattern with MOIC first, then apply to other calculations.

**MOIC Canary Strategy:**

MOIC is the **only** calculation to go through full shadow → partial rollout → 100% + rollback drill initially. Once MOIC proves the pattern, other calculations (Fees, Waterfall, IRR) follow the same pattern in their own phases without a separate "shadow phase."

| Task | Criteria |
|------|----------|
| MOIC shadow mode (0%) | Both calcs run, only legacy returned, discrepancies logged |
| MOIC gradual rollout (10% -> 50%) | Canary users see Phoenix MOIC |
| MOIC full rollout (100%) | All users on Phoenix MOIC |
| Rollback drill (MOIC) | Prove rollback works before rolling out Fees/Waterfall/IRR |
| Pattern documented | Other calculations follow same rollout script |

**Shadow Mode Clarification:**

Shadow mode is a **diagnostic tool**, not a gate. It does not block rollout if MOIC already matches truth cases and Tactyc alignment within thresholds. Its purpose is to detect unexpected discrepancies in production data patterns.

**Rollback Drill (REQUIRED before MOIC 100% rollout):**

Before full MOIC rollout, execute a rehearsed rollback:

| Step | Action | Verification |
|------|--------|--------------|
| 1 | Deploy Phoenix at 50% rollout | Shadow logs show Phoenix active |
| 2 | Simulate P0 error (test flag) | Alert fires as expected |
| 3 | Set `phoenix.*` flags to 0% | Instant rollback triggered |
| 4 | Verify legacy calculations active | API returns legacy results |
| 5 | Verify no data corruption | Database state unchanged |
| 6 | Document rollback time | Target: < 60 seconds |

**Rollback Drill Checklist:**
- [ ] Alert-to-rollback time measured (target < 60s)
- [ ] No manual database intervention required
- [ ] All feature flags disable cleanly
- [ ] Legacy calculations resume correctly
- [ ] Shadow mode can be re-enabled safely

**Exit Gate:** MOIC at 100% rollout with no P0 errors for 48 hours AND rollback drill completed. Pattern documented for other calculations.

### Discrepancy Triage Protocol

When shadow mode or parallel validation detects a discrepancy, classify it immediately to prevent investigation paralysis:

| Tier | Definition | Action |
|------|------------|--------|
| **P0** | Violates thresholds by >10x, OR clear logic bug (sign error, null handling, missing cashflow) | **Immediate rollback** of phoenix.* flag |
| **P1** | Above threshold but formula/logic looks plausible | **Investigate within 24-48 hours**, decide to fix or accept |
| **P2** | Within per-metric thresholds (see Section 10) | **Accept** - document but do not block rollout |

**Examples:**

- **P0:** MOIC < 0 when NAV+distributions > 0, IRR wildly different from truth case, fee calculation returns NaN
- **P1:** 2% MOIC difference on edge case fund, IRR off by 0.5% on illiquid fund
- **P2:** $0.23 fee rounding difference, 0.0005 change in IRR on a 20% rate

**Modified Gate Rule:** "STOP if >10% of funds show P0 or P1 discrepancies." P2 discrepancies are logged but do not count toward the threshold.

**Why This Exists:** Without clear triage rules, every $1 rounding difference risks delaying rollout by days. This ladder provides decision rules tied to the existing per-metric thresholds.

---

## 8. Shadow Mode Architecture (Simplified)

### Why NOT BullMQ? ⭐ SIMPLIFIED

**Problem with BullMQ:** The existing codebase is a Vite+React SPA with Express API. There's no existing BullMQ/Redis worker infrastructure. Adding BullMQ would create a new operational surface area (Redis, queue monitoring, worker scaling) just for shadow mode validation.

**Expert Insight:** "Introducing BullMQ would add a brand-new operational surface area just to get shadow mode, which is a classic 'infra tax' for limited benefit."

**Solution:** In-memory dual calculation with async structured logging. 80% of shadow mode value with 20% of DevOps overhead.

### MANDATORY Hardening Requirements (v2.10)

**Silent-failure-hunter agent identified 5 critical vulnerabilities in the shadow mode pattern. ALL must be addressed before Phase 6 rollout:**

| Issue | Severity | Description | Required Fix |
|-------|----------|-------------|--------------|
| #1 | P0 | Phoenix errors silently swallowed | Add metrics + alerting for failure rate |
| #2 | P0 | Context mutation race condition | Deep clone context before deferring |
| #3 | P0 | No timeout for deferred execution | Add 5s timeout with abort |
| #4 | HIGH | No circuit breaker | Disable after 10 consecutive failures |
| #5 | HIGH | No sampling for high volume | Sample 10% for high-volume calcs |

**Required Hardening Checklist (Phase 0B):**

```
[ ] Add PhoenixShadowMetrics interface (recordSuccess, recordFailure, recordTimeout)
[ ] Implement circuit breaker (open after 10 failures, reset after 5 min)
[ ] Add 5-second timeout with `setTimeout` + `clearTimeout`
[ ] Deep clone context with `Object.freeze({...context})`
[ ] Add sampling rates per calculation type (MOIC: 100%, Fees: 10%)
[ ] Separate try-catch for compareResults vs phoenixFn
[ ] Add ERROR_IDS constants for Sentry grouping
```

**Estimated Hardening Effort:** 8-12 hours

### Implementation (Zero Redis Dependency)

```typescript
// client/src/lib/phoenix-shadow.ts

import { logger } from '@/lib/logger';
import { getFeatureFlag } from '@/providers/FeatureFlagProvider';

// Per-metric thresholds (from Section 10)
const THRESHOLDS: Record<string, { relative?: number; absolute?: number }> = {
  moic: { relative: 0.001 },      // 0.1%
  irr: { absolute: 0.0001 },      // 0.01%
  fees: { absolute: 100 },        // $100
  nav: { absolute: 1 },           // $1
};

function exceedsThreshold(
  calculationType: string,
  legacy: number,
  phoenix: number
): boolean {
  const threshold = THRESHOLDS[calculationType];
  if (!threshold) return false;

  if (threshold.relative) {
    const relDiff = Math.abs((phoenix - legacy) / legacy);
    return relDiff > threshold.relative;
  }
  if (threshold.absolute) {
    return Math.abs(phoenix - legacy) > threshold.absolute;
  }
  return false;
}

// Feature-flagged calculation wrapper
export function calculateWithShadow<T>(
  legacyFn: () => T,
  phoenixFn: () => T,
  flagKey: string,
  context: { fundId: string; calculation: string }
): T {
  const flag = getFeatureFlag(flagKey);
  const useShadow = flag?.shadowMode ?? false;

  if (!useShadow) {
    return legacyFn();
  }

  // Always return legacy result immediately
  const legacyResult = legacyFn();

  // Run Phoenix calc async using setImmediate to avoid blocking event loop
  // NOTE: setImmediate defers to next event loop iteration (unlike Promise.resolve
  // which runs in microtask queue and can still block). In browser, use setTimeout(fn, 0).
  const deferFn = typeof setImmediate !== 'undefined' ? setImmediate : (fn: () => void) => setTimeout(fn, 0);

  deferFn(() => {
    try {
      const phoenixResult = phoenixFn();
      const discrepancy = compareResults(legacyResult, phoenixResult);

      if (discrepancy.significant) {
        logger.warn('Phoenix shadow discrepancy', {
          ...context,
          legacy: legacyResult,
          phoenix: phoenixResult,
          delta: discrepancy.delta,
          percentDiff: discrepancy.percentDiff,
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      logger.error('Phoenix shadow error', {
        ...context,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return legacyResult; // Always return trusted legacy result
}

function compareResults(legacy: any, phoenix: any): {
  significant: boolean;
  delta: number;
  percentDiff: number;
} {
  const legacyNum = typeof legacy === 'number' ? legacy : legacy?.value ?? 0;
  const phoenixNum = typeof phoenix === 'number' ? phoenix : phoenix?.value ?? 0;
  const delta = phoenixNum - legacyNum;
  const percentDiff = legacyNum !== 0 ? Math.abs(delta / legacyNum) : 0;

  return {
    significant: percentDiff > 0.001 || Math.abs(delta) > 1,
    delta,
    percentDiff,
  };
}
```

### Environment Configuration (Simplified)

```bash
# .env.development - No special config needed
# Shadow mode controlled entirely by feature flags

# .env.production - Same, no Redis required
```

### Rollout Sequence

```
Phase 6 Rollout (Weeks 12-13):

  Day 1-2:   0% + shadow logging (both calcs run, only legacy returned)
  Day 3-4:   10% (canary users see Phoenix results)
  Day 5-6:   50% (broader testing)
  Day 7:     100% (full rollout)

  Rollback: Set phoenix.* flag rolloutPercentage to 0 instantly
```

**Benefit:** No Redis. No BullMQ. No worker scaling. Just structured logs.

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

**Ceremony Reduction for Tier 1/2:**

- **Tier 1:** Default is NO AI if truth cases already exist and code change is small (wiring, not math). Use AI only when changing the mathematical behavior.
- **Tier 2:** Use a single consolidated AI run per batch of related changes (e.g., all four fee bases together), not per truth case. Batch validation saves time without losing rigor.
- **Tier 3:** Full ceremony required - individual validation per truth case, unanimous consensus.

### Verdict Definitions

| Verdict | Meaning | Action |
|---------|---------|--------|
| **GREEN** | Calculation matches truth case within threshold | Proceed |
| **YELLOW** | Minor discrepancy or ambiguity | Review, clarify, re-validate |
| **RED** | Fails threshold or logic error | Do not proceed, investigate |

### Validation Prompt Template

**Use this template for Tier 2/3 validations only.** Skip for pure refactors or Tier 1 wiring changes.

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

### AI Consensus Limitations (Critical)

**AI verdicts are ADVISORY, not definitive.** Multi-AI consensus does not guarantee financial correctness.

**Domain-specific errors invisible to AI:**
- GIPS compliance violations
- LP agreement specific clauses
- Compounding conventions (quarterly vs. annually)
- Day-count conventions (30/360 vs. ACT/365)

**Required Investigation Protocol for YELLOW/RED Verdicts:**

1. **Manual investigation by developer** - Do not blindly trust or dismiss
2. **Reference against public GIPS standards** - Verify calculation methodology
3. **Cross-validate with existing xirr.truth-cases.json patterns** - Check for precedent
4. **If unclear: DEFER** - Do not proceed until external expertise consulted

**Example Escalation:**
```
Tier 3 Validation (Waterfall):
  AI-1: GREEN
  AI-2: YELLOW ("catch-up calculation unclear")

Action: DO NOT PROCEED
  1. Developer reviews catch-up logic manually
  2. Cross-reference Tactyc waterfall documentation
  3. Check existing waterfall.truth-cases.json for similar scenario
  4. If still unclear: document in DEFERRED_VALIDATIONS.md, proceed with other work
```

**Buffer Time:** +2 days allocated for manual investigation (included in Phase timeline)

### When NOT to Use AI Validation

AI validation is **required** when mathematical behavior changes. It is **optional** for:

- Purely mechanical refactors (splitting functions, renaming variables)
- Code style changes (formatting, import ordering)
- Documentation-only changes (comments, JSDoc)
- Test-only changes (unless testing new calculation logic)
- Infrastructure changes (build config, CI/CD)

**Rule:** If the calculation contract (inputs → outputs) doesn't change, skip AI validation.

---

## 11. Domain Expert Allocation (Optional Uplift)

**Important:** This section describes an *optional uplift* if a human domain expert (CFO/quant/fund admin) is available. This plan does **not** assume such a person is guaranteed. The baseline validation relies on:
- JSON truth cases with Excel parity
- The 4 validation layers
- Multi-AI review (Tier 1/2/3)

If no domain expert is available, these hours are skipped and the AI + truth-case process carries the load.

### If Domain Expert Available: 9 hours over 8 weeks

| Phase | Activity | Hours |
|-------|----------|-------|
| Phase 0 | Review validation layer design | 1 |
| Phase 1 | Validate MOIC truth cases | 2 |
| Phase 3 | Validate fee basis methods | 2 |
| Phase 4 | Validate waterfall scenarios | 2 |
| Phase 6 | Production sign-off | 2 |

### Quarterly Review (Optional, Post-Launch)

If domain expert relationship established:
- 2 hours per quarter
- Review truth cases for regulatory drift
- Validate any new edge cases discovered

If no domain expert: rely on Tactyc documentation updates and AI review for drift detection.

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
| Shadow mode performance | Low | Medium | In-memory async (non-blocking) |

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
| **Leverage ratio** | > 40% existing code reused (not rebuilt) |
| Rollback drill time | < 60 seconds |

**Leverage Ratio Measurement Heuristic:**

Track per-phase in a simple Markdown table (no script needed):

| Phase | Functions Touched | Functions Kept | Functions Rebuilt | Leverage % |
|-------|-------------------|----------------|-------------------|------------|
| 1 MOIC | 4 | 3 | 1 | 75% |
| 2 Capital | 6 | 4 | 2 | 67% |
| ... | ... | ... | ... | ... |
| **Total** | **X** | **Y** | **Z** | **Y/X%** |

- **Function Kept** = existing implementation passes truth cases + gets validation layers
- **Function Rebuilt** = new implementation or major rewrite (> 50% line change)

### Qualitative

- [ ] All calculations traceable to JSON truth source
- [ ] All 4 validation layers active
- [ ] Feature flags enable instant rollback
- [ ] No regressions in existing functionality
- [ ] Clear documentation for each calculation
- [ ] **Existing engines audited** before each phase
- [ ] **Leverage decisions documented** per calculation

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
| 1.0 | 2025-12-04 | Initial release |
| 2.0 | 2025-12-04 | Added 4 validation layers, replaced Excel with JSON, reduced Phase 1 to MOIC only, added BullMQ shadow mode |
| 2.1 | 2025-12-04 | Softened Excel policy, added Truth Case Audit, marked Domain Expert as optional, added PII rules, per-metric shadow thresholds |
| 2.2 | 2025-12-04 | Added AI consensus limitations protocol, explicit feature flag creation in Phase 0, hard gate on Phase 0 exit criteria, 8.5-week timeline |
| 2.3 | 2025-12-04 | **Major revision:** Reframed as "Leverage, Harden, Validate" (not rebuild). Added Pre-Phase 0 for MOIC truth cases (blocker). Added existing assets table. Added incremental integration to all phases (not big-bang). Extended timeline to 11 weeks. Added rollback drill requirement. Added leverage ratio success metric. |
| 2.4 | 2025-12-04 | **Refinements:** Progressive layer adoption by phase (not all-or-nothing). Configurable plausibility limits with warnings vs hard-fails. Typed FundOperation constants. Output contract maxValue enforcement with clamping. POV Fund I truth case mapping table. Dev-mode guard for BullMQ (skip Redis in local dev). "When not to use AI" guidance. Daily checklist "ONE thing" focus item. |
| 2.5 | 2025-12-04 | **Final polish:** Truth case vs code bug classification table. MOIC limits split by context (fund: 100x, deal: 1000x). IRR `not_yet_realized` status for early funds. AI ceremony reduction for Tier 1/2 (batch validation, skip for wiring). PHOENIX_SHADOW_MODE env var toggle. Leverage ratio measurement heuristic. Corrected truth case example format. |
| 2.6 | 2025-12-04 | **Calibration refinements:** Timeline extended to 12-13 weeks (from 11). Success probability calibrated to 75-80% (from overcorrected 85%). Added Engine Audit section (ENGINE_AUDIT.md) as mandatory Phase 0 deliverable. Added Tactyc Alignment Tables (TACTYC_ALIGNMENT.md) requirement. Added TypeScript Surgical Triage with tsconfig.phoenix.json (Phoenix files only, not all 454 errors). Replaced BullMQ/Redis shadow mode with simplified in-memory implementation. Added Working Agreements for cognitive load mitigation (ONE-at-a-time discipline). Added Go/No-Go Decision Gates at Phase 0, 3, and 6. |
| 2.7 | 2025-12-04 | **Technical review integration:** Added Server Import Verification task (2-4h) to Phase 0 for client/server compatibility. Added Hybrid Truth Case Strategy (JSON for point-in-time, Golden Datasets CSV for time-series). Fixed shadow mode to use `setImmediate` instead of microtask queue to prevent event loop blocking. Added Layer 2 terminology alignment with existing `lifecycle-rules.ts`. |
| 2.8 | 2025-12-04 | **Scope containment refinements:** Split Phase 0 into 0A (Read & Decide) + 0B (Harden Happy Path). Added Tier A/B engine classification (deep-dive now vs later). Tightened L3 to "external-facing data only" for Phase 1-3. Added Golden Dataset scope freeze (2 datasets max until Phase 3). Added mechanical provenance audit checklist. Relaxed Tier 3 AI validation to "at least one GREEN, none RED." Made MOIC the canary calculation for Phase 6 rollout. Capped TS fixes at 30 with smoke test at phase gates. Clarified shadow mode as diagnostic tool, not gate. |
| 2.9 | 2025-12-04 | **Reality sync & operational protocols:** Added Phase -1: Reality Sync to reconcile plan with actual execution state (prevents re-doing completed work from `phoenix/phase-1-wizard-fees` branch). Added Discrepancy Triage Protocol (P0/P1/P2 classification with action ladder). Added Restart After Breaks protocol for resuming after >5 day gaps. These additions improve plan operability for solo developer execution. |
| 2.10 | 2025-12-04 | **Multi-agent gap analysis & hardening:** 7 parallel agents scrutinized plan. Added CRITICAL GAPS section at top with 7 blockers. Added scope clarification (runbook v2.2 vs this plan v2.10). Added PHOENIX_FLAGS BLOCKER warning (flags don't exist, must create). Added shadow mode MANDATORY hardening requirements (5 P0 vulnerabilities: timeout, circuit breaker, metrics, context cloning, sampling). Added validation layer gap analysis (L1: 70%, L2: 40%, L3: 20%, L4: 60%). Added "What Already Exists" list to prevent rebuilding. Improved success probability to 80-85% with hardening. |
| 2.11 | 2025-12-04 | **Branch asset integration (MAJOR):** Verified 6 production-ready calculation implementations on main branch. Added BRANCH ASSET INVENTORY section with verified locations and test coverage. Integrated `feat/excel-parity-testing` discovery (3 scenarios, 100% provenance, automated validation). Corrected gap analysis: 5/6 engines have tests (not 4/6), truth case provenance resolved by excel-parity. Added REVISED TIMELINE: 8-10 weeks (accelerated from 12-13 weeks, 3-5 week savings). Updated success probability to 90-95%. Key assets: fee-calculations.ts, capital-allocation-calculations.ts, reference-formulas.ts, waterfall.ts, xirr.ts - all production-ready with test coverage. |

**This plan supersedes:**
- PHOENIX-PLAN-2025-11-30.md
- PHOENIX-EXECUTION-PLAN.md v1.0
- All prior Phoenix planning documents

**Next Review:** End of Phase 1 or upon major scope change
