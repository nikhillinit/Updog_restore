# Capital Allocation & Exit Recycling Calculations

**Purpose**: Canonical reference for calculation semantics, edge cases, and
implementation details that support ADR-008 (Capital Allocation Policy) and
truth case validation.

**Status**: Living document - updated as truth cases identify ambiguities **Last
Updated**: 2025-12-13 **Related**: ADR-008, CA/ER truth cases (CA-001 through
CA-020, ER-010 through ER-016)

---

## Table of Contents

1. [Reserve Accounting Model](#reserve-accounting-model)
2. [Exit Recycling Period Boundaries](#exit-recycling-period-boundaries)
3. [Zero Rate Edge Cases](#zero-rate-edge-cases)
4. [Multi-Engine Integration](#multi-engine-integration)
5. [Implementation References](#implementation-references)

---

## Reserve Accounting Model

### Semantic Clarification: Reserve Balance vs Reserve Target

**Ambiguity Identified**: Truth case CA-013 expects $15.5M output from $8M input
reserve balance, causing confusion about whether "reserve_balance" means actual
cash on hand or target/commitment amount.

**Resolution**:

#### Terminology

- **reserve_target**: The calculated amount the fund SHOULD hold in reserves
  (policy-driven)
  - Formula: `commitment × target_reserve_pct` (for static_pct policy)
  - Example: $100M fund × 8% = $8M target

- **reserve_balance**: The actual cash CURRENTLY held in liquid reserves
  - This is real capital available for deployment
  - Can be above or below target due to market conditions, deployments, and
    exits

- **reserve_needs**: The shortfall that must be filled before deployment
  - Formula: `max(0, reserve_target - reserve_balance)`
  - When needs > 0, reserve precedence applies (limits pacing allocations)

#### CA-013 Explanation

In CA-013, the scenario models:

- Initial reserve_balance: $8M (actual cash)
- reserve_target: $8M (policy requirement)
- Distribution event: $7.5M exit proceeds received
- **After distribution**: reserve_balance increases to $15.5M ($8M + $7.5M)

The output reflects the **updated reserve_balance after the exit proceeds are
added**, not a calculation error.

**Key Principle**: Reserve balance is a **state variable** that changes over
time as cash flows in/out of reserves. Reserve target is a **policy parameter**
that remains constant (unless policy changes).

### Implementation Location

- **File**: `client/src/core/reserves/ReserveEngine.ts`
- **Function**: `calculateRuleBasedAllocation()` (lines 47-107)
  - Note: Current implementation focuses on portfolio-level reserve allocation
  - Truth case CA-013 requires time-series reserve state tracking (future
    enhancement)

**Current Gap**: ReserveEngine.ts implements portfolio company reserve
allocation, but CA-013 requires fund-level reserve accounting with time-series
state management. See [Multi-Engine Integration](#multi-engine-integration) for
coordination requirements.

### Testing

- **Truth Cases**: CA-001 (baseline), CA-002 (underfunded), CA-003 (overfunded),
  CA-013 (reserve precedence)
- **Test Location**: `client/src/core/reserves/__tests__/reserves.spec.ts`

---

## Exit Recycling Period Boundaries

### Semantic Clarification: Inclusive vs Exclusive Period Logic

**Ambiguity Identified**: Truth cases ER-013 through ER-016 revealed unclear
period boundary semantics in ADR-008 Section 2.5. Is the recycling period
inclusive or exclusive?

**Resolution**: **INCLUSIVE BOUNDARY**

#### Implementation

**File**: `client/src/lib/exit-recycling-calculations.ts` **Function**:
`isExitWithinRecyclingPeriod()` (lines 596-601)

```typescript
export function isExitWithinRecyclingPeriod(
  exitYear: number,
  recyclingPeriod: number
): boolean {
  return exitYear <= recyclingPeriod; // INCLUSIVE: year 5 exit IS eligible if period = 5
}
```

#### Rationale

The `<=` comparison implements **inclusive period boundaries**, meaning:

- **recyclingPeriod = 5 years** → Exits in years 1, 2, 3, 4, **AND 5** are
  eligible
- **recyclingPeriod = 3 years** → Exits in years 1, 2, **AND 3** are eligible
- An exit in year 6 with a 5-year period is NOT eligible (6 > 5)

**Business Justification**:

- Standard VC fund convention treats "5-year recycling period" as "through year
  5"
- Matches LP agreements and fund documentation language
- Aligns with intuitive interpretation: "5 years" means "up to and including
  year 5"

#### Examples

| Exit Year | Recycling Period | Eligible? | Reason                             |
| --------- | ---------------- | --------- | ---------------------------------- |
| 3         | 5                | YES       | 3 <= 5 (within period)             |
| 5         | 5                | YES       | 5 <= 5 (boundary case, INCLUSIVE)  |
| 6         | 5                | NO        | 6 > 5 (beyond period)              |
| 1         | 0                | NO        | 1 > 0 (zero period = no recycling) |

### JSDoc Enhancement Needed

**Current**: Line 588-595 provides basic documentation **Recommended Addition**:

```typescript
/**
 * Check if exit is within recycling period
 *
 * IMPORTANT: Period boundary is INCLUSIVE. An exit in year N is eligible
 * if recyclingPeriod >= N. This matches standard VC fund convention where
 * "5-year recycling period" means "through year 5".
 *
 * @param exitYear - Year of exit (relative to vintage, 1-indexed)
 * @param recyclingPeriod - Recycling period in years
 * @returns True if exit is within recycling period (exitYear <= recyclingPeriod)
 *
 * @example
 * isExitWithinRecyclingPeriod(5, 5) // => true (boundary case)
 * isExitWithinRecyclingPeriod(6, 5) // => false (beyond period)
 */
```

### Testing

- **Truth Cases**: ER-013 (boundary), ER-014 (beyond), ER-015 (within), ER-016
  (multi-exit)
- **Test Location**:
  `client/src/lib/__tests__/exit-recycling-calculations.test.ts` (lines 111-166)

---

## Zero Rate Edge Cases

### Semantic Clarification: Zero Recycling Rate Behavior

**Ambiguity Identified**: Truth case ER-010 revealed that 0% recycling rate is
not explicitly documented in ADR-008. Does eligibility override zero rate, or
does zero rate short-circuit all recycling?

**Resolution**: **ZERO RATE SHORT-CIRCUITS RECYCLING**

#### Implementation

**File**: `client/src/lib/exit-recycling-calculations.ts` **Function**:
`calculateRecyclingFromExit()` (lines 218-274)

```typescript
// Implicit behavior at line 251-259:
const eligibleProceeds = exitEvent.withinRecyclingPeriod ? fundProceeds : 0;

const recycledAmount = exitEvent.withinRecyclingPeriod
  ? fundProceeds * (recyclingRate / 100) // If rate = 0, recycledAmount = 0
  : 0;
```

#### Behavior Matrix

| Recycling Rate | Within Period? | Eligible Proceeds | Recycled Amount | Returned to LPs |
| -------------- | -------------- | ----------------- | --------------- | --------------- |
| 0%             | YES            | $10M              | $0              | $10M            |
| 0%             | NO             | $0                | $0              | $10M            |
| 50%            | YES            | $10M              | $5M             | $5M             |
| 50%            | NO             | $0                | $0              | $10M            |

**Key Principle**: Recycling rate of 0% means "no recycling, regardless of
eligibility". Eligibility determines which proceeds are available for recycling;
the rate determines how much of those eligible proceeds are actually recycled.

#### Business Justification

- **Rate = 0%** is semantically distinct from **disabled recycling**
  - Disabled: Feature turned off entirely (no eligibility checks)
  - Rate = 0%: Feature enabled, but policy says "recycle nothing"
- Allows funds to change rates over time without changing eligibility logic
- Supports scenarios like "recycling enabled but temporarily paused"

### JSDoc Enhancement Needed

**Recommended Addition** to `calculateRecyclingFromExit()`:

```typescript
/**
 * Calculate recycling from a single exit event
 *
 * EDGE CASE: If recyclingRate = 0%, all proceeds return to LPs even if exit
 * is within the recycling period. Zero rate means "no recycling" regardless
 * of eligibility. This is distinct from disabled recycling (where no
 * eligibility checks occur).
 *
 * @param exitEvent - Exit event with proceeds and eligibility
 * @param recyclingRate - Percentage of eligible proceeds to recycle (0-100)
 * @returns Recycling calculation with splits
 */
```

### Testing

- **Truth Case**: ER-010 (zero rate)
- **Test Coverage Needed**: Explicit test case for 0% rate with eligible exit
- **Current Gap**: Tests focus on positive rates; zero rate behavior is implicit

---

## Multi-Engine Integration

### Semantic Clarification: Reserve + Pacing + Cohort Coordination

**Ambiguity Identified**: Truth case CA-020 shows -60% variance in cohort
allocations, revealing unclear interaction between reserve, pacing, and cohort
engines.

**Resolution**: **SEQUENTIAL PRECEDENCE WITH EXPLICIT HANDOFFS**

#### Coordination Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. RESERVE ENGINE                                           │
│    Input: commitment, reserve_target, reserve_balance       │
│    Output: allocable_capital (after reserve needs met)      │
│    Constraint: allocable_capital = available - reserve_needs│
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. PACING ENGINE                                            │
│    Input: allocable_capital, pacing_target, carryover       │
│    Output: period_allocation (pacing-limited capital)       │
│    Constraint: period_allocation <= allocable_capital       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. COHORT ENGINE                                            │
│    Input: period_allocation, cohort_weights, caps           │
│    Output: cohort_allocations[] (capital split by cohort)   │
│    Constraint: sum(cohort_allocations) = period_allocation  │
└─────────────────────────────────────────────────────────────┘
```

#### CA-020 Diagnostic

**Expected Behavior** (per ADR-008):

1. Reserve engine validates $8M reserve requirement is met
2. Pacing engine allocates $1.8M/month from available capital
3. Cohort engine splits $1.8M across cohorts A/B/C per weights

**Current Implementation Gap**:

- **ReserveEngine.ts** (lines 136-163): Calculates portfolio-level reserve
  allocations per company
- **CohortEngine.ts** (lines 159-169): Calculates vintage cohort performance
  metrics
- **Missing**: Fund-level capital allocation orchestrator that sequences these
  engines

**Root Cause**: No integration layer implements the precedence chain. Each
engine operates independently on different data models:

- Reserve: Portfolio company → reserve allocation
- Cohort: Vintage year → performance metrics
- Pacing: **NOT IMPLEMENTED**

#### Required Implementation

**New File Needed**: `client/src/core/allocation/AllocationOrchestrator.ts`

```typescript
interface AllocationOrchestratorInput {
  commitment: number;
  reserve_target: number;
  reserve_balance: number;
  pacing_target: number;
  pacing_carryover: number;
  cohort_weights: { cohort: string; weight: number }[];
  cohort_caps: { max_per_cohort: number };
}

interface AllocationOrchestratorOutput {
  // Reserve layer
  reserve_needs: number;
  allocable_capital: number;
  reserve_precedence_applied: boolean;

  // Pacing layer
  pacing_target: number;
  pacing_carryover: number;
  period_allocation: number;

  // Cohort layer
  cohort_allocations: {
    cohort: string;
    pre_cap_amount: number;
    cap_applied: boolean;
    final_amount: number;
  }[];

  // Summary
  total_allocated: number;
  unallocated: number;
}

export function orchestrateAllocation(
  input: AllocationOrchestratorInput
): AllocationOrchestratorOutput {
  // 1. Reserve precedence (ADR-008 Section 2.2)
  const reserve_needs = Math.max(
    0,
    input.reserve_target - input.reserve_balance
  );
  const allocable_capital = Math.max(0, input.reserve_balance - reserve_needs);
  const reserve_precedence_applied = reserve_needs > 0;

  // 2. Pacing constraint (ADR-008 Section 2.3)
  const pacing_capacity = input.pacing_target + input.pacing_carryover;
  const period_allocation = Math.min(allocable_capital, pacing_capacity);
  const new_carryover = Math.max(0, pacing_capacity - period_allocation);

  // 3. Cohort distribution (ADR-008 Section 2.4)
  const cohort_allocations = allocateToCohorts(
    period_allocation,
    input.cohort_weights,
    input.cohort_caps
  );

  return {
    reserve_needs,
    allocable_capital,
    reserve_precedence_applied,
    pacing_target: input.pacing_target,
    pacing_carryover: new_carryover,
    period_allocation,
    cohort_allocations,
    total_allocated: period_allocation,
    unallocated: allocable_capital - period_allocation,
  };
}
```

### Testing

- **Truth Case**: CA-020 (multi-engine integration)
- **Current Status**: FAILING (-60% variance)
- **Resolution Path**: Implement AllocationOrchestrator.ts, validate against
  CA-020
- **Dependency**: Requires PacingEngine.ts (not yet implemented)

---

## Implementation References

### Reserve Engine

- **File**: `client/src/core/reserves/ReserveEngine.ts`
- **Lines**: 1-190
- **Key Functions**:
  - `ReserveEngine()` (136-163): Main entry point
  - `calculateRuleBasedAllocation()` (47-107): Rule-based reserves
  - `calculateMLBasedAllocation()` (110-125): ML-enhanced reserves
  - `generateReserveSummary()` (171-188): Fund-level summary

- **Current Scope**: Portfolio company reserve allocation
- **ADR-008 Mapping**: Partial (Section 2.2 reserve policy)
- **Gap**: Fund-level reserve state tracking (CA-013 requirement)

### Cohort Engine

- **File**: `client/src/core/cohorts/CohortEngine.ts`
- **Lines**: 1-252
- **Key Functions**:
  - `CohortEngine()` (159-169): Main entry point
  - `calculateRuleBasedCohortMetrics()` (72-119): Performance metrics
  - `generateCohortSummary()` (176-208): Cohort summary
  - `compareCohorts()` (215-250): Multi-cohort comparison

- **Current Scope**: Vintage cohort performance analysis
- **ADR-008 Mapping**: Partial (Section 2.4 cohort allocation terminology only)
- **Gap**: Capital allocation by cohort (CA-020 requirement)

### Exit Recycling

- **File**: `client/src/lib/exit-recycling-calculations.ts`
- **Lines**: 1-650+
- **Key Functions**:
  - `isExitWithinRecyclingPeriod()` (596-601): Period boundary logic
  - `calculateRecyclingFromExit()` (218-274): Single exit recycling
  - `calculateRecyclingSchedule()` (276-350+): Full schedule

- **Current Scope**: Complete exit recycling calculations
- **ADR-008 Mapping**: Complete (Section 2.5 recycling integration)
- **Status**: Production-ready

### Pacing Engine

- **Status**: **NOT IMPLEMENTED**
- **Required For**: CA-009, CA-010, CA-011, CA-012, CA-013, CA-020
- **ADR-008 Reference**: Section 2.3 (Pacing with carryover)

### Allocation Orchestrator

- **Status**: **NOT IMPLEMENTED**
- **Required For**: CA-020 (multi-engine integration)
- **ADR-008 Reference**: Section 2.1 (Core precedence)
- **Design**: See [Multi-Engine Integration](#multi-engine-integration) section
  above

---

## Amendment History

| Date       | Sections Added | Trigger                         | Related Truth Cases                |
| ---------- | -------------- | ------------------------------- | ---------------------------------- |
| 2025-12-13 | All sections   | STEP 5 ADR ambiguity resolution | CA-013, CA-020, ER-010, ER-013-016 |

---

## Cross-References

- **ADR-008**: Capital Allocation Policy (authoritative policy source)
- **Truth Cases**: `docs/capital-allocation.truth-cases.json`,
  `docs/exit-recycling.truth-cases.json`
- **Evidence Bundles**: `docs/validation/ca-er/evidence-bundles/`
- **Test Files**:
  - `client/src/core/reserves/__tests__/reserves.spec.ts`
  - `client/src/lib/__tests__/exit-recycling-calculations.test.ts`
