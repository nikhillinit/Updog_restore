# Iteration A: Technical Review Action Plan

**Date**: 2025-10-04
**Reviewer Findings**: Critical gaps identified between MVP and production-grade VC modeling
**Status**: 🔴 Action Required

---

## 🚨 Critical Issues (Fix Immediately)

### 1. PR Naming Collision
**Problem**: "PR #3" already used for CSP/HSTS security headers
**Impact**: Confusion in commit history and PR tracking
**Action**:
- ✅ Rename commits: `IterA-PR1/2/3` → `IterA-Foundation/Schemas/Engine`
- ✅ Create feature branch: `feat/iteration-a-deterministic-engine`
- ✅ Push branch (blocked by TS errors - see below)

### 2. TypeScript Errors Blocking Push
**Problem**: `shared/feature-flags/flag-definitions.ts` has 7 TS errors (possibly undefined)
**Action**: Fix flag definitions null safety before push

### 3. Fractional Company Counts (Determinism + Capital Conservation)
**Problem**: `floor()` in deployment creates unused capital and drift
**Impact**: Violates capital conservation, creates "leftover capital" problem
**Solution**: Use fractional counts internally, round only in UI
**Rationale**: Tactyc approach - preserves mass balance, maintains determinism

---

## 🎯 High-Priority Enhancements (PR 3.5 - Stage Profiles & Policies)

### A. Replace Exit Buckets with Stage-Driven Valuations

**Current Flawed Approach**:
```typescript
// ❌ Hard-coded power law
const exitBucket = exitBuckets[globalCompanyIndex % 4];
const exitMultiple = getExitMultiple(exitBucket); // 0.1x/3x/15x/5x
```

**Required Approach**:
```typescript
// ✅ Stage-driven cohort flow
interface StageProfile {
  stage: Stage;
  roundSize: Decimal;
  postMoneyValuation: Decimal;
  esopPct: Decimal;
  graduationRatePct: Decimal;  // % that graduate to next stage
  exitRatePct: Decimal;         // % that exit this period
  monthsToGraduate: number;
  monthsToExit: number;
}

// Derived: failureRate = 100% - graduation - exit
```

**Implementation**:
1. Add `StageProfile[]` to `FundModelInputs`
2. Update `deployCompanies()` to use fractional counts
3. Update `simulatePeriods()` to apply cohort flow per period
4. Mark deals at FMV (postMoney × ownership) until exit

### B. Parameterize Fees & Capital Calls

**Add to Schema**:
```typescript
interface FeeProfile {
  tiers: Array<{
    basis: 'committed' | 'called_cumulative' | 'called_net_returns' | 'invested' | 'fmv' | 'unrealized_cost';
    ratePct: Decimal;
    startMonth: number;
    endMonth: number;
    recyclingPct?: Decimal;  // Fee recycling %
  }>;
  stepDowns?: Array<{
    afterYear: number;
    newRatePct: Decimal;
  }>;
}

interface CapitalCallPolicy {
  mode: 'upfront' | 'quarterly' | 'semi_annual' | 'annual' | 'as_needed';
  schedule?: Array<{
    periodIndex: number;
    callPct: Decimal;
  }>;
}
```

### C. Waterfall Policies (European & American)

**Add to Schema**:
```typescript
interface WaterfallPolicy {
  type: 'european' | 'american';
  tiers: Array<{
    name: 'return_of_capital' | 'preferred_return' | 'gp_catchup' | 'carry';
    thresholdIRR?: Decimal;      // For pref return
    thresholdMultiple?: Decimal;  // Alternative to IRR
    gpSharePct: Decimal;          // GP's % of this tier
    lpSharePct: Decimal;          // LP's % of this tier
  }>;
  gpCommitPct: Decimal;           // GP commit treated as LP for Tier 1
  clawbackEnabled: boolean;
}
```

### D. Recycling Controls

**Add to Schema**:
```typescript
interface RecyclingPolicy {
  managementFeeRecycling: {
    enabled: boolean;
    capPct?: Decimal;  // % of committed capital
    termMonths?: number;
  };
  exitProceedsRecycling: {
    enabled: boolean;
    capPct?: Decimal;
    termMonths?: number;
    anticipatedEnabled: boolean;  // Reinvest ahead of realized exits
  };
}
```

---

## 🔬 Reserve Optimizer v1 (PR 5 - Refined)

### Objective
Maximize **Expected MOIC on Planned Reserves** under constraints

### Algorithm
```typescript
interface ReserveOptimization {
  objective: 'max_expected_moic';
  constraints: {
    globalReserveBudget: Decimal;
    perCompanyCaps: Map<string, Decimal>;
    perRoundCaps: Map<string, Decimal>;
  };

  // Greedy/Knapsack approach
  rankCompanies(): Array<{
    companyId: string;
    nextDollarMOIC: Decimal;
    plannedReserve: Decimal;
    optimalReserve: Decimal;
    delta: Decimal;
  }>;
}
```

### Implementation
1. Sort companies by `nextDollarMOIC` (descending)
2. Allocate reserves greedily until budget exhausted
3. Respect per-company and per-round caps
4. Output ranking table + allocation deltas

---

## 📊 Golden Fixtures & Parity Tests

### Fixture 1: Simple European (No Recycling)
```typescript
const fixture1: FundModelInputs = {
  fundSize: 100_000_000,
  stages: [
    { stage: 'seed', allocation: 0.4, roundSize: 1_000_000, ... },
    { stage: 'series_a', allocation: 0.6, roundSize: 3_000_000, ... }
  ],
  feeProfile: { basis: 'committed', rate: 0.02, stepDowns: [] },
  capitalCall: { mode: 'upfront' },
  waterfall: { type: 'european', tiers: [...], clawback: false },
  recycling: { managementFee: { enabled: false }, exitProceeds: { enabled: false } }
};

// Expected outputs (locked)
const fixture1Expected: FundModelOutputs = {
  kpis: { tvpi: 2.5432, dpi: 1.2345, irrAnnualized: 18.25 },
  // ... full snapshot
};
```

### Fixture 2: Complex American (With Recycling)
- American waterfall (deal-by-deal carry)
- Fee recycling enabled (20% cap, 5-year term)
- Exit proceeds recycling (50% cap, aggressive mode)

### Parity Tests
1. **XIRR Validation**: Test against known IRR patterns (20% annual, etc.)
2. **Capital Conservation**: `SUM(contributions) = SUM(distributions) + endingNAV + fees`
3. **Shares Conservation**: Shares don't increase without financing events

---

## 🏗️ Revised PR Sequence

### **IterA-PR3.5: Stage Profiles & Fee/Call Scaffolding** (NEXT)
**Branch**: `feat/itera-pr3.5-stage-profiles`
**Duration**: 2 days
**Acceptance Criteria**:
- ✅ `StageProfile[]` added to inputs
- ✅ Fractional company counts (no `floor()`)
- ✅ `FeeProfile` + `CapitalCallPolicy` implemented
- ✅ NAV uses FMV marks (not cost)
- ✅ Golden fixture 1 passes

### **IterA-PR4: Scenario Management** (UNCHANGED)
**Branch**: `feat/itera-pr4-scenarios`
**Duration**: 1.5 days
**Features**: IndexedDB storage, save/load/duplicate/export
**AC**: Scenario reload reproduces identical outputs

### **IterA-PR5: Reserve Optimizer v1** (REFINED)
**Branch**: `feat/itera-pr5-reserve-optimizer`
**Duration**: 2 days
**Features**: MOIC-rank algorithm, allocation table, explain view
**AC**: `DeterministicReserveEngine` returns allocations + rankings

### **IterA-PR6: Waterfall & Recycling** (NEW)
**Branch**: `feat/itera-pr6-waterfall-recycling`
**Duration**: 2.5 days
**Features**: European/American waterfalls, fee recycling, exit recycling
**AC**: DPI/TVPI differ correctly under policies (golden fixture 2)

### **IterA-PR7: Observability & Performance Gates** (UNCHANGED)
**Branch**: `feat/itera-pr7-observability`
**Duration**: 1.5 days
**Features**: Timing metrics, error bus, invariant checks, CI gates
**AC**: < 15ms for 1k companies × 120 months

### **IterA-PR8: Brand & UX Polish** (PARALLELIZABLE)
**Branch**: `feat/itera-pr8-brand-ux`
**Duration**: 1.5 days
**Features**: Inter/Poppins fonts, color tokens, responsive polish

---

## 🔧 Engineering Principles (Updated)

### 1. Deterministic Cohort Math (No RNG)
- **Use fractional counts** throughout engine
- **Round only in UI** with tooltip: _"Fractions reflect deterministic cohort math and ensure no unused capital"_
- **Preserve mass balance**: Capital + shares conservation

### 2. Performance Budget
- **Target**: < 15ms for 1k companies × 120 months (M-class laptop)
- **Strategy**: Pure function, Web Worker if needed
- **Gate**: CI fails if exceeded

### 3. API Surface
```typescript
// Core pure function
export function runFundModel(inputs: FundModelInputs): FundModelOutputs;

// Optional diagnostics
export function explainModel(inputs: FundModelInputs): {
  stageFlows: StageFlowTable;
  feeLadder: FeeLadderTable;
  waterfallTiers: WaterfallTierTable;
};
```

### 4. Documentation
- **ADR-001**: Deterministic Cohort Engine (why fractions?)
- **ADR-002**: Waterfall Implementation (european vs american)
- **ADR-003**: Reserve Optimization Algorithm

---

## 📝 Small High-Leverage Tweaks

### A. Line of Credit & Fee Waivers
```typescript
interface LOCPolicy {
  enabled: boolean;
  maxDrawAmount: Decimal;
  drawRules: 'as_needed' | 'scheduled';
  repaymentRules: 'from_exits' | 'end_of_term';
}

interface GPCommitPolicy {
  commitPct: Decimal;
  cashlessEnabled: boolean;  // GP carry used to fund commit
}
```

### B. End-of-Life Liquidation Toggle
```typescript
interface FundTermPolicy {
  mode: 'liquidate_at_fmv' | 'extend_to_exits';
  liquidationDiscount?: Decimal;  // If liquidate mode
  maxExtensionMonths?: number;    // If extend mode
}
```

### C. A/B Policy Compare
**UI Feature**: Pin 2 scenarios, compare DPI/TVPI/IRR side-by-side
**Implementation**: `ScenarioCompare` component in dashboard

---

## ✅ Immediate Checklist (Next 2 Hours)

1. **Fix TS errors** in `shared/feature-flags/flag-definitions.ts`
2. **Push branch** `feat/iteration-a-deterministic-engine` to GitHub
3. **Create PR 3.5 branch** for stage profiles work
4. **Draft schema extensions** for StageProfile, FeeProfile, CapitalCallPolicy, WaterfallPolicy
5. **Update CHANGELOG.md** with review findings
6. **Create ADR-001** (Deterministic Cohort Engine)

---

## 📚 References

- **Tactyc Construction Wizard**: Stage profiles, cohort math, fractional counts
- **LP/IC Expectations**: European/American waterfalls, fee recycling, GP commit
- **Industry Standard**: Management fee step-downs, exit recycling caps, clawback provisions

---

**Next Session**: Implement PR 3.5 (Stage Profiles & Fee Scaffolding) with fractional counts and FMV marks.
