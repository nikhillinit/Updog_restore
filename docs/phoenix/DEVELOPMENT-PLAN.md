# Phoenix Development Plan

**Version:** 1.0
**Based On:** Phoenix Execution Plan v2.16
**Timeline:** 7-9 weeks
**Executor:** Solo Developer
**Last Updated:** 2025-12-05

---

## Executive Summary

This document translates the Phoenix Execution Plan v2.16 into granular, day-by-day actionable tasks. Each task includes:
- Specific deliverables
- Time estimates
- Exit criteria
- Risk mitigation

**Core Principle:** "Minimum viable rigor" - Apply exactly what's needed per module.

---

## Pre-Execution Checklist

Before starting ANY development work:

```
[ ] Jest-dom fix verified (test runner green)
[ ] TypeScript baseline saved (`npm run baseline:save`)
[ ] This development plan read and understood
[ ] GROUND-TRUTH.md created (even if empty sections)
[ ] Phoenix journal started (notes/phoenix-journal.md)
```

---

## Phase Overview

| Phase | Duration | Focus | Key Deliverable |
|-------|----------|-------|-----------------|
| Pre-0 (FIRST!) | 0.5 days | Jest-dom fix | Green test runner |
| Pre-0 | 1 day | MOIC truth cases | moic.truth-cases.json |
| 0A | 3-4 days | Engine audit + precision | GROUND-TRUTH.md Section 1 |
| 0B | 2-3 days | Validation scaffolds | L1/L4 + PHOENIX_FLAGS |
| 1 | 3-4 days | MOIC implementation | 4 MOIC variants passing |
| 2 | 6-8 days | Cashflows & Fees | Capital + 4 fee bases |
| 4 | 7-10 days | Waterfall + Clawback | American carry complete |
| 5 | 1-2 days | IRR | XIRR edge cases |
| 6 | 3-5 days | Shadow mode | Production rollout |

---

## Pre-Phase 0 (FIRST!): Jest-Dom Fix

**Duration:** 0.5 days (4 hours max)
**Priority:** CRITICAL - Blocks all other work

### Tasks

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Diagnose jest-dom import issue | 30 min | Root cause identified |
| 2 | Fix `jsdom-setup.ts:6` import | 1 hour | Import resolved |
| 3 | Run full test suite | 30 min | Tests execute (may have failures) |
| 4 | Verify client tests run | 30 min | `npm test -- --project=client` works |
| 5 | Document fix in journal | 15 min | Journal entry |

### Exit Criteria

```
[ ] `npm test` executes without import errors
[ ] Client test project initializes jsdom correctly
[ ] At least one test file runs to completion
```

### Risk Mitigation

If fix takes >4 hours:
1. Check if issue is in `vitest.config.ts` or `vitest.workspace.ts`
2. Consider isolating Phoenix tests to separate config
3. Worst case: Create `vitest.phoenix.config.ts` for Phoenix-only tests

---

## Pre-Phase 0: MOIC Truth Cases

**Duration:** 1 day
**Depends On:** Jest-dom fix complete

### Morning (4 hours)

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Review existing MOIC implementations | 1 hour | Notes on current state |
| 2 | Identify POV Fund I equivalent data | 1 hour | Source numbers documented |
| 3 | Create `docs/moic.truth-cases.json` structure | 30 min | File with header |
| 4 | Implement Scenario 1: Simple 2.0x | 1.5 hours | First scenario complete |

### Afternoon (4 hours)

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 5 | Implement Scenario 2: Partial write-off | 1.5 hours | Second scenario |
| 6 | Implement Scenario 3: Zero-distribution | 1 hour | Third scenario |
| 7 | Implement Scenario 4: Late single exit | 1 hour | Fourth scenario |
| 8 | Validate all scenarios have provenance | 30 min | Provenance documented |

### Truth Case Structure

```json
{
  "version": "1.0",
  "provenance": "Excel parity testing + POV Fund I",
  "lastValidated": "2025-12-XX",
  "scenarios": [
    {
      "id": "moic-simple-2x",
      "name": "Simple 2.0x MOIC",
      "description": "Basic fund with 2x return",
      "inputs": {
        "contributions": 10000000,
        "distributions": 15000000,
        "currentNAV": 5000000
      },
      "expected": {
        "grossMOIC": 2.0,
        "netMOIC": 1.8,
        "dpiMOIC": 1.5,
        "rvpiMOIC": 0.5
      },
      "tolerance": {
        "relative": 0.001
      }
    }
  ]
}
```

### Exit Criteria

```
[ ] moic.truth-cases.json exists with 4 scenarios
[ ] Each scenario has provenance comment
[ ] Format header includes version and lastValidated
[ ] At least one scenario based on real fund data (POV Fund I or equivalent)
```

---

## Phase 0A: Engine Audit + Precision

**Duration:** 3-4 days
**Depends On:** MOIC truth cases exist

### Day 1: Engine Discovery

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Create `docs/phoenix/GROUND-TRUTH.md` | 30 min | File with section headers |
| 2 | Audit `reference-formulas.ts` | 2 hours | Section 1 entry |
| 3 | Audit `fee-calculations.ts` | 1.5 hours | Section 1 entry |
| 4 | Audit `capital-allocation-calculations.ts` | 1.5 hours | Section 1 entry |
| 5 | Document test coverage for each | 1.5 hours | Coverage notes |

### Day 2: Engine Discovery (continued)

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Audit `waterfall.ts` | 2 hours | Section 1 entry |
| 2 | Audit `xirr.ts` | 1.5 hours | Section 1 entry |
| 3 | Audit `fee-profile.ts` (server) | 1.5 hours | Section 1 entry |
| 4 | Compare client vs server implementations | 2 hours | Discrepancies noted |

### Day 3: Precision Audit

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Search for `parseFloat` in calculation paths | 1 hour | List of violations |
| 2 | Search for `Number()` on BigInt values | 1 hour | List of violations |
| 3 | Verify MOIC calculations use Decimal.js | 1.5 hours | Compliance check |
| 4 | Create `shared/lib/precision.ts` with `toFinancial()` | 2 hours | Utility created |
| 5 | Document precision strategy in GROUND-TRUTH.md | 1.5 hours | Section added |

### Day 4: Finalize Audit (if needed)

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Complete any remaining engine audits | 3 hours | All engines documented |
| 2 | Tier classification (A-now vs B-later) | 1 hour | Tiers assigned |
| 3 | Update GROUND-TRUTH.md Section 1 | 2 hours | Section complete |
| 4 | Review with AI (Tier 1: one pass) | 1 hour | AI feedback addressed |

### GROUND-TRUTH.md Section 1 Template

```markdown
## 1. Engines & Locations

### Tier A (Audit Now)

| Engine | Location | Status | Test Coverage | Notes |
|--------|----------|--------|---------------|-------|
| ReferenceFormulas | `client/src/lib/reference-formulas.ts` | Production | `tests/unit/reference-formulas.test.ts` | MOIC, DPI, TVPI |
| FeeCalculations | `client/src/lib/fee-calculations.ts` | MVP Only | `tests/unit/fees.test.ts` | Only 'committed' basis |
| Waterfall | `client/src/lib/waterfall.ts` | Production | 19 tests | Missing clawback calc |
| XIRR | `client/src/lib/finance/xirr.ts` | Production | 25 golden cases | |

### Tier B (Audit Later)

| Engine | Location | Reason for Deferral |
|--------|----------|---------------------|
| LiquidityEngine | `client/src/core/LiquidityEngine.ts` | Not Phoenix-critical |
| ReserveEngines | `shared/core/reserves/` | Planning only |

### Precision Strategy

- **Calculation layer:** Decimal.js mandatory
- **Storage:** BigInt (cents) or String
- **Display:** Format at UI boundary only
- **Banned:** parseFloat, Number(bigint) in calculations
```

### Exit Criteria

```
[ ] GROUND-TRUTH.md Section 1 complete
[ ] All Tier A engines documented with location + status
[ ] Precision audit complete (violations listed)
[ ] toFinancial() utility created
[ ] Tier classification decided
```

---

## Phase 0B: Validation Scaffolds + Flags

**Duration:** 2-3 days
**Depends On:** Phase 0A complete

### Day 1: PHOENIX_FLAGS

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Open `shared/feature-flags/flag-definitions.ts` | 15 min | File open |
| 2 | Add PHOENIX_FLAGS section | 1 hour | 6 flags defined |
| 3 | Add flag dependencies (moic → fees → waterfall) | 1 hour | Dependencies configured |
| 4 | Test flag toggling in dev | 1 hour | Flags work |
| 5 | Document in GROUND-TRUTH.md | 30 min | Flags documented |

### PHOENIX_FLAGS Definition

```typescript
export const PHOENIX_FLAGS = {
  'phoenix.enabled': {
    name: 'Phoenix Master Switch',
    description: 'Master switch for all Phoenix calculations',
    defaultValue: false,
    dependencies: [],
  },
  'phoenix.shadow_mode': {
    name: 'Phoenix Shadow Mode',
    description: 'Run Phoenix in parallel, log discrepancies',
    defaultValue: false,
    dependencies: ['phoenix.enabled'],
  },
  'phoenix.moic': {
    name: 'Phoenix MOIC',
    description: 'Use Phoenix for MOIC calculations',
    defaultValue: false,
    dependencies: ['phoenix.enabled'],
  },
  'phoenix.fees': {
    name: 'Phoenix Fees',
    description: 'Use Phoenix for fee calculations',
    defaultValue: false,
    dependencies: ['phoenix.moic'],
  },
  'phoenix.waterfall': {
    name: 'Phoenix Waterfall',
    description: 'Use Phoenix for waterfall calculations',
    defaultValue: false,
    dependencies: ['phoenix.fees'],
  },
  'phoenix.irr': {
    name: 'Phoenix IRR',
    description: 'Use Phoenix for IRR calculations',
    defaultValue: false,
    dependencies: ['phoenix.moic'],
  },
} as const;
```

### Day 2: L1 Validation (Plausibility)

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Create `shared/schemas/phoenix-validation.ts` | 30 min | File created |
| 2 | Implement MOICInputSchema | 1.5 hours | Schema complete |
| 3 | Implement FeeInputSchema | 1.5 hours | Schema complete |
| 4 | Implement CapitalInputSchema | 1.5 hours | Schema complete |
| 5 | Add plausibility rules (MOIC < 100x, etc.) | 1.5 hours | Rules added |
| 6 | Write tests for validation schemas | 1.5 hours | Tests passing |

### L1 Validation Template

```typescript
import { z } from 'zod';
import Decimal from 'decimal.js';

// MOIC Input Schema with plausibility
export const MOICInputSchema = z.object({
  contributions: z.string().refine(
    (val) => new Decimal(val).greaterThan(0),
    'Contributions must be positive'
  ),
  distributions: z.string().refine(
    (val) => new Decimal(val).greaterThanOrEqualTo(0),
    'Distributions cannot be negative'
  ),
  currentNAV: z.string().refine(
    (val) => new Decimal(val).greaterThanOrEqualTo(0),
    'NAV cannot be negative'
  ),
}).refine(
  (data) => {
    const moic = new Decimal(data.distributions)
      .plus(data.currentNAV)
      .div(data.contributions);
    return moic.lessThan(100); // Plausibility: MOIC < 100x
  },
  'MOIC exceeds plausibility limit (100x)'
);

export type MOICInput = z.infer<typeof MOICInputSchema>;
```

### Day 3: L4 Instrumentation

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Create `shared/instrumentation/phoenix-logger.ts` | 30 min | File created |
| 2 | Implement `withPhoenixLogging()` wrapper | 2 hours | Wrapper complete |
| 3 | Add correlation ID support | 1 hour | IDs working |
| 4 | Add calculation context (type, inputs, outputs) | 1.5 hours | Context logged |
| 5 | Write tests for logging wrapper | 1.5 hours | Tests passing |
| 6 | Update GROUND-TRUTH.md with validation status | 1 hour | Documentation updated |

### L4 Instrumentation Template

```typescript
import { logger } from '@/server/utils/logger';
import { v4 as uuidv4 } from 'uuid';

interface PhoenixContext {
  calculationType: 'moic' | 'fee' | 'capital' | 'waterfall' | 'irr';
  fundId?: string;
  correlationId?: string;
}

export function withPhoenixLogging<TInput, TOutput>(
  fn: (input: TInput) => TOutput,
  context: PhoenixContext
): (input: TInput) => TOutput {
  return (input: TInput) => {
    const correlationId = context.correlationId || uuidv4();
    const startTime = performance.now();

    logger.info({
      event: 'phoenix_calculation_start',
      correlationId,
      calculationType: context.calculationType,
      fundId: context.fundId,
      input: JSON.stringify(input),
    });

    try {
      const output = fn(input);
      const duration = performance.now() - startTime;

      logger.info({
        event: 'phoenix_calculation_complete',
        correlationId,
        calculationType: context.calculationType,
        duration,
        output: JSON.stringify(output),
      });

      return output;
    } catch (error) {
      logger.error({
        event: 'phoenix_calculation_error',
        correlationId,
        calculationType: context.calculationType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}
```

### Exit Criteria

```
[ ] PHOENIX_FLAGS defined (6 flags with dependencies)
[ ] L1 validation schemas created (MOIC, Fee, Capital)
[ ] L4 instrumentation wrapper created
[ ] Tests passing for new code
[ ] GROUND-TRUTH.md updated with validation layer status
```

---

## Phase 1: MOIC Implementation

**Duration:** 3-4 days
**Depends On:** Phase 0B complete

### Day 1: Gross MOIC + Net MOIC

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Write failing test for Gross MOIC (TDD) | 1 hour | Red test |
| 2 | Implement Gross MOIC with Decimal.js | 1.5 hours | Green test |
| 3 | Add L1 validation wrapper | 30 min | Validation integrated |
| 4 | Add L4 logging wrapper | 30 min | Logging integrated |
| 5 | Write failing test for Net MOIC | 1 hour | Red test |
| 6 | Implement Net MOIC (after fees/carry) | 1.5 hours | Green test |
| 7 | Run truth case validation | 1 hour | 2 scenarios pass |

### Day 2: DPI + RVPI

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Write failing test for DPI | 45 min | Red test |
| 2 | Implement DPI | 1 hour | Green test |
| 3 | Write failing test for RVPI | 45 min | Red test |
| 4 | Implement RVPI | 1 hour | Green test |
| 5 | Verify TVPI = DPI + RVPI | 30 min | Invariant tested |
| 6 | Run all truth cases | 1 hour | 3-4 scenarios pass |
| 7 | Code review (10-20 lines at a time) | 2 hours | Review complete |

### Day 3: API Wiring + POV Fund Validation

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Create Phoenix MOIC API endpoint | 2 hours | Endpoint exists |
| 2 | Add feature flag guard | 30 min | Flag-gated |
| 3 | Wire to existing fund data | 2 hours | Data flows |
| 4 | Validate against POV Fund scenario | 2 hours | POV fund matches |
| 5 | Document in GROUND-TRUTH.md Section 2 | 1 hour | Truth cases documented |

### Day 4: Polish + Exit Gate (if needed)

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Fix any failing truth cases | 2 hours | All cases green |
| 2 | AI review (Tier 1: one pass) | 1 hour | Feedback addressed |
| 3 | Refactor for clarity | 1.5 hours | Code clean |
| 4 | Final test run | 1 hour | All tests pass |
| 5 | Commit with detailed message | 30 min | Commit pushed |

### Coding Pairs Protocol (Phase 1)

```
Every 10 lines of MOIC calculation code:
1. Pause and review with code-reviewer agent
2. Fix any CRITICAL issues immediately
3. Run affected tests
4. Continue to next 10 lines
```

### Exit Criteria

```
[ ] 4 MOIC variants implemented (Gross, Net, DPI, RVPI)
[ ] All 4 truth case scenarios pass within tolerance
[ ] POV Fund scenario matches expected values
[ ] API endpoint wired (behind phoenix.moic flag)
[ ] L1 + L3 + L4 validation layers active
[ ] At least one AI GREEN on spec review
```

---

## Phase 2: Cashflows & Fees (Merged)

**Duration:** 6-8 days
**Depends On:** Phase 1 complete

### Week 1: Capital Calls & Distributions (Days 1-4)

#### Day 1: Capital Call Logic

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Write failing test for capital call calculation | 1 hour | Red test |
| 2 | Implement capital call with Decimal.js | 2 hours | Green test |
| 3 | Add L1 + L2 validation (lifecycle matters here) | 1.5 hours | Validation active |
| 4 | Add L4 logging | 30 min | Logging active |
| 5 | Test against first capital scenario | 2 hours | Scenario passes |

#### Day 2: Distribution Logic

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Write failing test for distribution calculation | 1 hour | Red test |
| 2 | Implement distribution logic | 2 hours | Green test |
| 3 | Implement cumulative tracking | 1.5 hours | Cumulative works |
| 4 | Test second capital scenario | 2 hours | Scenario passes |
| 5 | Code review (15 lines at a time) | 1.5 hours | Review complete |

#### Day 3: Timeline Integration

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Implement cash flow timeline builder | 3 hours | Timeline works |
| 2 | Add period aggregation (quarterly/annual) | 2 hours | Aggregation works |
| 3 | Test third capital scenario | 2 hours | Scenario passes |
| 4 | Wire to existing capital data structures | 1 hour | Integration complete |

#### Day 4: Capital API + Buffer

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Create Phoenix capital API endpoint | 2 hours | Endpoint exists |
| 2 | Add feature flag guard | 30 min | Flag-gated |
| 3 | Fix any failing scenarios | 2 hours | All green |
| 4 | Buffer for unexpected issues | 3.5 hours | Issues resolved |

### Week 2: Fee Calculations (Days 5-8)

#### Day 5: Fee Basis - Net Cumulative Called

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Consolidate fee type definitions | 2 hours | Single source of truth |
| 2 | Write failing test for net_cumulative_called | 1 hour | Red test |
| 3 | Implement on stable capital timeline | 2 hours | Green test |
| 4 | Add L1 + L3 validation | 1 hour | Validation active |
| 5 | Test first fee scenario | 2 hours | Scenario passes |

#### Day 6: Remaining Fee Bases

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Implement committed_capital basis | 1.5 hours | Basis works |
| 2 | Implement invested_capital basis | 1.5 hours | Basis works |
| 3 | Implement fair_market_value basis | 2 hours | Basis works |
| 4 | Test all 4 fee bases against scenarios | 2 hours | All pass |
| 5 | Code review | 1 hour | Review complete |

#### Day 7: Fee API + Integration

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Create Phoenix fee API endpoint | 2 hours | Endpoint exists |
| 2 | Integrate with capital timeline | 2 hours | Integration works |
| 3 | Validate fee scenarios | 2 hours | Scenarios pass |
| 4 | Update GROUND-TRUTH.md Section 2 | 2 hours | Documentation complete |

#### Day 8: Polish + Exit Gate

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Fix any failing scenarios | 2 hours | All green |
| 2 | AI review (Tier 1: one pass per module) | 1 hour | Feedback addressed |
| 3 | Refactor for clarity | 2 hours | Code clean |
| 4 | Final integration test | 2 hours | All tests pass |
| 5 | Commit with detailed message | 1 hour | Commit pushed |

### Exit Criteria

```
[ ] 3 capital scenarios pass
[ ] 4 fee basis methods implemented and tested
[ ] Capital + Fee timelines integrated
[ ] API endpoints wired (behind phoenix.fees flag)
[ ] L1 + L2 + L4 for capital, L1 + L3 + L4 for fees
[ ] Type consolidation complete (single FeeBasis definition)
```

---

## Phase 4: Waterfall + Clawback

**Duration:** 7-10 days
**Depends On:** Phase 2 complete

### Week 1: Core Waterfall (Days 1-4)

#### Day 1: Return of Capital Tier

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Write failing test for ROC tier | 1 hour | Red test |
| 2 | Implement ROC with Decimal.js | 2 hours | Green test |
| 3 | Add full L1-L4 validation (waterfall = high risk) | 2 hours | All layers active |
| 4 | Test first waterfall scenario | 2 hours | Scenario passes |
| 5 | Code review (5 lines at a time for waterfall) | 1 hour | Review complete |

#### Day 2: Preferred Return (Hurdle)

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Write failing test for hurdle calculation | 1 hour | Red test |
| 2 | Implement preferred return tier | 2.5 hours | Green test |
| 3 | Handle hurdle rate variations | 1.5 hours | Variations work |
| 4 | Test hurdle scenario | 2 hours | Scenario passes |
| 5 | Code review (5 lines at a time) | 1 hour | Review complete |

#### Day 3: GP Catch-Up

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Write failing test for catch-up | 1 hour | Red test |
| 2 | Implement catch-up calculation | 2.5 hours | Green test |
| 3 | Handle catch-up percentage variations | 1.5 hours | Variations work |
| 4 | Test catch-up scenario | 2 hours | Scenario passes |
| 5 | Code review (5 lines at a time) | 1 hour | Review complete |

#### Day 4: Carry Split

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Write failing test for carry split | 1 hour | Red test |
| 2 | Implement 80/20 (or configurable) split | 2 hours | Green test |
| 3 | Test full waterfall flow | 2 hours | Flow works |
| 4 | Validate against Excel parity scenarios | 2 hours | Parity confirmed |
| 5 | Code review | 1 hour | Review complete |

### Week 2: Clawback Implementation (Days 5-8)

#### Day 5: Clawback Detection

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Write failing test for underperformance detection | 1.5 hours | Red test |
| 2 | Implement fund performance tracking | 2.5 hours | Tracking works |
| 3 | Add lookback period logic | 2 hours | Lookback works |
| 4 | Test detection scenarios | 2 hours | Detection accurate |

#### Day 6: Clawback Calculation

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Write failing test for clawback amount | 1.5 hours | Red test |
| 2 | Implement GP payback obligation calculation | 3 hours | Calculation works |
| 3 | Handle partial clawback scenarios | 2 hours | Partial works |
| 4 | Test clawback scenarios | 1.5 hours | Scenarios pass |

#### Day 7: Clawback Integration

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Integrate clawback into waterfall flow | 3 hours | Integration works |
| 2 | Add to waterfall ledger | 2 hours | Ledger updated |
| 3 | Test full waterfall + clawback | 2 hours | Full flow works |
| 4 | AI review (Tier 3: multi-AI for waterfall) | 1 hour | Consensus achieved |

#### Day 8: API Wiring

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Create Phoenix waterfall API endpoint | 2 hours | Endpoint exists |
| 2 | Add feature flag guard | 30 min | Flag-gated |
| 3 | Wire to existing waterfall data | 2 hours | Integration works |
| 4 | Validate all 5 waterfall scenarios | 2 hours | All pass |
| 5 | Update GROUND-TRUTH.md | 1.5 hours | Documentation complete |

### Days 9-10: Polish + Exit Gate

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Fix any failing scenarios | 3 hours | All green |
| 2 | Comprehensive AI review (Tier 3) | 2 hours | All feedback addressed |
| 3 | Performance profiling | 2 hours | <10ms per calculation |
| 4 | Edge case testing | 2 hours | Edge cases pass |
| 5 | Final commit | 1 hour | Commit pushed |

### Exit Criteria

```
[ ] 5 waterfall scenarios pass:
    [ ] Single exit, no hurdle
    [ ] Single exit, hurdle met
    [ ] Multiple exits, catch-up
    [ ] Clawback scenario
    [ ] GP commit treatment
[ ] Clawback calculation implemented
[ ] API endpoint wired (behind phoenix.waterfall flag)
[ ] Full L1-L4 validation active
[ ] AI Tier 3 consensus achieved
[ ] Performance <10ms per calculation
```

---

## Phase 5: IRR (XIRR)

**Duration:** 1-2 days
**Depends On:** Phase 4 complete

### Day 1: XIRR Validation

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Review existing XIRR implementation | 1 hour | Understanding complete |
| 2 | Run existing 25 golden cases | 1 hour | Baseline established |
| 3 | Add L1 + L4 validation wrappers | 2 hours | Wrappers active |
| 4 | Test edge cases (single cash flow, all negative) | 2 hours | Edge cases pass |
| 5 | AI review (Tier 3: Newton-Raphson is tricky) | 2 hours | Review complete |

### Day 2: API Wiring + Exit Gate

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Create Phoenix IRR API endpoint | 1.5 hours | Endpoint exists |
| 2 | Add feature flag guard | 30 min | Flag-gated |
| 3 | Validate all 25 XIRR cases | 2 hours | All pass |
| 4 | Document in GROUND-TRUTH.md | 1 hour | Documentation complete |
| 5 | Commit | 30 min | Commit pushed |

### Exit Criteria

```
[ ] All 25 XIRR golden cases pass
[ ] Edge cases handled (single cash flow, negative, high return)
[ ] API endpoint wired (behind phoenix.irr flag)
[ ] L1 + L4 validation active
[ ] AI Tier 3 review complete
```

---

## Phase 6: Shadow Mode + Rollout

**Duration:** 3-5 days
**Depends On:** Phase 5 complete

### Day 1: Shadow Mode Implementation

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Implement `calculateWithShadow()` wrapper | 3 hours | Wrapper works |
| 2 | Add threshold configuration | 1 hour | Thresholds configurable |
| 3 | Implement discrepancy logging | 2 hours | Logging works |
| 4 | Test shadow mode with MOIC | 2 hours | MOIC shadow works |

### Day 2: Shadow Mode Testing

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Test shadow mode with all calculation types | 3 hours | All types work |
| 2 | Simulate discrepancy scenarios | 2 hours | Discrepancies logged |
| 3 | Test manual rollback procedure | 1 hour | Rollback works |
| 4 | Document rollback procedure | 1 hour | Procedure documented |
| 5 | Update GROUND-TRUTH.md | 1 hour | Documentation complete |

### Day 3: Rollout Preparation

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Create rollout checklist | 1 hour | Checklist exists |
| 2 | Configure flag percentages (0% → 10%) | 1 hour | Config ready |
| 3 | Set up monitoring (check logs manually) | 2 hours | Monitoring ready |
| 4 | Rollback drill (simulate P0, verify <60s) | 2 hours | Drill complete |
| 5 | Document drill results | 1 hour | Results documented |

### Days 4-5: Gradual Rollout

| # | Task | Time | Deliverable |
|---|------|------|-------------|
| 1 | Enable 10% rollout for MOIC | 2 hours | 10% active |
| 2 | Monitor for 4-8 hours | - | No issues |
| 3 | Enable 50% rollout | 1 hour | 50% active |
| 4 | Monitor for 4-8 hours | - | No issues |
| 5 | Enable 100% rollout | 1 hour | 100% active |
| 6 | Repeat for fees, waterfall, IRR | 4-6 hours | All modules 100% |

### Exit Criteria

```
[ ] Shadow mode implemented and tested
[ ] Manual rollback procedure documented and tested
[ ] Rollback drill completed (<60 seconds)
[ ] All calculation types at 100% rollout
[ ] No P0 issues for 24 hours
[ ] GROUND-TRUTH.md fully complete
```

---

## Daily Workflow

### Morning Startup (15 minutes)

```
1. [ ] What is the ONE thing I'm shipping today?
2. [ ] Which phase am I in?
3. [ ] Review yesterday's journal entry
4. [ ] Check test status (npm test)
5. [ ] Open relevant files
```

### Development Cycle

```
┌─ WRITE (10-20 lines max)
│
├─ TEST (run affected tests)
│
├─ REVIEW (code-reviewer agent if calculation code)
│
├─ FIX (address any issues immediately)
│
└─ COMMIT (if exit criteria partially met)
```

### End of Day (15 minutes)

```
1. [ ] Update phoenix-journal.md with progress
2. [ ] Note any blockers or surprises
3. [ ] Commit work in progress
4. [ ] Update GROUND-TRUTH.md if applicable
5. [ ] Plan tomorrow's ONE thing
```

---

## Risk Mitigation

### If Stuck >3 Iterations

Apply Simplification Break:

```
1. REVERT to last known-good state
2. IDENTIFY the complexity causing failure
3. WRITE a simpler test case (reduce scope)
4. IMPLEMENT the simpler case
5. ITERATE back to full scope after green
```

### If Phase Slips >5 Days

```
1. Document root cause in journal
2. Reduce scope (defer non-critical features)
3. Re-estimate remaining work
4. Do NOT stop - continue with reduced scope
```

### If Cumulative Slip >15 Days

```
1. STOP development
2. Re-baseline the entire plan
3. Document lessons learned
4. Consider scope cuts:
   - Defer clawback to post-MVP
   - Simplify shadow mode further
   - Reduce truth case coverage
```

---

## Success Metrics

### Quantitative

| Metric | Target | Measurement |
|--------|--------|-------------|
| Truth case pass rate | 100% | Automated tests |
| MOIC tolerance | <0.1% relative | Truth case validation |
| IRR tolerance | <0.01% absolute | Truth case validation |
| Fee tolerance | <$100 or 0.05% | Truth case validation |
| Rollback time | <60 seconds | Rollback drill |
| Performance | <10ms per calculation | Benchmark |

### Qualitative

```
[ ] All calculations traceable to JSON truth source
[ ] Validation layers active per module matrix
[ ] Feature flags enable instant rollback
[ ] No regressions in existing functionality
[ ] GROUND-TRUTH.md complete and accurate
```

---

## Appendix: File Locations

### New Files to Create

| File | Purpose | Created In |
|------|---------|------------|
| `docs/moic.truth-cases.json` | MOIC truth cases | Pre-Phase 0 |
| `docs/phoenix/GROUND-TRUTH.md` | Consolidated documentation | Phase 0A |
| `docs/phoenix/DEVELOPMENT-PLAN.md` | This document | Pre-execution |
| `notes/phoenix-journal.md` | Daily progress notes | Pre-execution |
| `shared/lib/precision.ts` | toFinancial() utility | Phase 0A |
| `shared/schemas/phoenix-validation.ts` | L1 validation schemas | Phase 0B |
| `shared/instrumentation/phoenix-logger.ts` | L4 logging wrapper | Phase 0B |

### Existing Files to Modify

| File | Modification | Phase |
|------|--------------|-------|
| `shared/feature-flags/flag-definitions.ts` | Add PHOENIX_FLAGS | Phase 0B |
| `client/src/lib/reference-formulas.ts` | Add validation wrappers | Phase 1 |
| `client/src/lib/fee-calculations.ts` | Consolidate with server | Phase 2 |
| `client/src/lib/waterfall.ts` | Add clawback calculation | Phase 4 |

---

## Document Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-05 | Initial development plan based on Phoenix v2.16 |

---

**Next Step:** When Excel fund scenario is provided, update MOIC truth cases and validate against this plan.
