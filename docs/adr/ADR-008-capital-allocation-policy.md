---
status: ACTIVE
last_updated: 2026-01-19
---

# ADR-008: Capital Allocation Policy (Reserve, Pacing, Cohort)

**Status**: Proposed **Date**: 2025-10-29 **Owners**: Capital Allocation WG

## 1. Context

The allocation layer must deploy capital predictably across time and cohorts
while honoring liquidity protection and fairness. Inputs arrive from upstream
modules (Waterfall: realized cash; Fees: fee schedules; Exit Recycling:
eligibility). Downstream consumers need auditable, deterministic outputs with
clear precedence when rules conflict.

## 2. Decision

### 2.1 Core Precedence

**Reserve floor → Pacing target → Cohort allocation**

This precedence ensures liquidity protection takes priority over deployment
smoothness, which in turn takes priority over cohort-level fairness
considerations.

### 2.2 Reserve Policy

- **Default**: `static_pct` (target_reserve_pct × commitment)
- **Extensions**: `dynamic_ratio`, `waterfall_dependent` (versioned additions)
- **Floor enforcement**: `max(reserve_target, min_cash_buffer)`

The reserve engine must satisfy its target before any capital is allocated to
deals. If the reserve balance falls below the floor (which is the maximum of the
calculated reserve target and the minimum cash buffer), allocations are reduced
until the reserve is replenished.

### 2.3 Pacing

- **Rolling window with carryover**: C*t = max(0, P*{t-1} - A\_{t-1})
- **Cadence**: monthly | quarterly | annual
- **Changes apply prospectively** (no retroactive reallocation)

Pacing smooths deployment over time using a rolling window (typically 12-24
months). If a period under-deploys relative to its target, the shortfall carries
forward to the next period. Changes to the pacing window (e.g., from 24 to 18
months) apply from the change date forward and do not trigger retroactive
adjustments.

### 2.4 Cohort Allocation

- **Pro-rata by normalized weights**: Each cohort receives allocation
  proportional to its weight relative to the sum of all active cohort weights
- **Enforce `max_allocation_per_cohort` cap**: No single cohort can receive more
  than this percentage of the period's total allocation
- **Spill deterministically to remaining cohorts**: If a cohort hits its cap,
  the residual amount is reallocated to other cohorts in a deterministic order
- **Rounding**: Bankers' rounding (round to nearest even); tie-break to highest
  remainder → lexicographic name order

### 2.5 Recycling Integration

- **Eligible distributions increase allocable capacity after reserve checks**:
  When an exit generates proceeds that are eligible for recycling, these funds
  are added to the allocable capacity, but only after the reserve engine has
  verified that reserve requirements are met
- **Capital recalls (negative distributions) are NOT recycle-eligible**: When
  LPs are required to return capital (capital recall/clawback), this is modeled
  as a negative distribution amount, but these amounts cannot be recycled back
  into new deals

### 2.6 Versioning

- **Schema + policy**: Semantic versioning (semver)
- **Breaking changes bump major version**: Any change that would cause existing
  truth cases to fail validation requires a major version increment

## 3. Design Decision: Negative Distributions as Capital Recalls

### 3.1 Context

Venture capital funds occasionally need to "recall" capital from Limited
Partners (LPs) when previously distributed proceeds must be returned. This can
occur due to LP defaults, escrow releases, or claw-back provisions in fund
documents. We needed to decide how to model these events in our data schema.

### 3.2 Trade-offs Analysis

**Chosen Approach**: Model capital recalls as negative distribution amounts

#### Pros (Mathematical Simplicity)

1. **Unified ledger**: A single `distributions` array captures all cash flows
   to/from LPs
   - Net Asset Value (NAV) calculation becomes:
     `NAV = Σ(contributions) - Σ(distributions)`
   - No need to track separate "recall" vs "distribution" transaction types

2. **Simplified queries**: Calculating net cash flow to LPs is a simple sum

   ```sql
   SELECT SUM(amount) as net_distributions
   FROM distributions
   WHERE fund_id = ?
   ```

3. **Reduced data duplication**: One transaction type instead of two related
   types that must be kept synchronized

#### Cons (Semantic Ambiguity)

1. **Legal semantic mismatch**: A "distribution" has a specific legal meaning in
   fund documents - it represents capital returning TO the LP. A "recall" is the
   opposite - capital returning FROM the LP. Conflating these under one field
   name creates ambiguity.

2. **Reporting confusion**: User-facing reports must clarify terminology:
   - "Gross Distributions" (sum of positive amounts only)
   - "Net Distributions" (algebraic sum including recalls)
   - Teams unfamiliar with the convention may misinterpret "Total Distributions"

3. **Integration brittleness**: External systems integrating with our API may
   reasonably assume all `distribution.amount` values are non-negative. This can
   lead to:
   - Validation errors in downstream systems
   - Incorrect calculations if systems don't expect negative values
   - Need for extensive API documentation and integration guides

4. **Lost query granularity**: To specifically find capital recalls requires
   filtering:

   ```sql
   SELECT * FROM distributions WHERE amount < 0  -- All recalls
   ```

   Instead of:

   ```sql
   SELECT * FROM capital_recalls  -- Semantic table/type
   ```

5. **Recycling eligibility ambiguity**: The rule "recalls are not
   recycle-eligible" must be enforced through application logic checking for
   negative amounts, rather than through type system guarantees

### 3.3 Mitigation Strategy

To address the semantic concerns while maintaining the chosen approach:

1. **Schema documentation**:
   - Explicit `description` field in JSON schema explaining negative
     distribution semantic
   - Reference to this ADR for detailed rationale

2. **API layer abstraction**:

   ```typescript
   // Provide semantic methods that abstract the storage representation
   interface FundAPI {
     getDistributions(): Distribution[]; // Positive amounts only
     getRecalls(): CapitalRecall[]; // Negative amounts, inverted
     getNetDistributions(): number; // Algebraic sum
   }
   ```

3. **Reporting layer clarity**:
   - All user-facing reports explicitly label "Gross" vs "Net" distributions
   - LP statements include separate line items for distributions and recalls
   - Help text explains the distinction

4. **Integration contracts**:
   - API documentation prominently features this design decision
   - Client library examples show correct handling of negative amounts
   - Integration test suite includes recall scenarios

5. **Validation rules**:
   ```typescript
   // Application-level validation
   if (distribution.amount < 0 && distribution.recycle_eligible === true) {
     throw new ValidationError('Capital recalls cannot be recycle-eligible');
   }
   ```

### 3.4 Future Migration Path

If semantic clarity becomes a critical issue (e.g., due to regulatory
requirements or persistent integration problems), we can migrate to an explicit
transaction type system:

**Schema v2.0 (Future)**:

```json
{
  "transaction_type": "capitalRecall",
  "amount": 200000, // Positive value; type indicates direction
  "reason": "LP_default",
  "related_distribution_id": "dist-123", // Links back to original distribution
  "recycle_eligible": false // Explicitly false by type
}
```

**Migration strategy**:

1. Introduce new `transaction_type` field with default value "distribution"
2. Create `capital_recall` type alongside existing distributions
3. Migrate negative distributions to new type via backfill script
4. Deprecate negative distribution amounts in schema v2.0
5. Remove support in schema v3.0 (breaking change)

**Technical debt ticket**: [Create backlog item for schema v2.0 planning]

## 4. Rationale

### 4.1 Liquidity Protection (Reserve Precedence)

The reserve precedence rule is critical for fund operations:

- **Prevents under-reserving**: Without reserve precedence, aggressive pacing
  targets could deplete cash reserves below safe levels, creating liquidity risk
- **Supports commitments**: Adequate reserves ensure the fund can meet its
  obligations to portfolio companies for follow-on investments
- **Risk management**: Maintains cash buffer for unforeseen expenses, down-round
  protection, or portfolio support

**Example (CA-013)**: When monthly pacing targets would deplete reserves below
the floor, the allocation is reduced to preserve liquidity, even if this causes
under-deployment relative to the pacing target.

### 4.2 Deployment Smoothness (Pacing with Carryover)

Pacing prevents both over- and under-deployment:

- **Avoids vintage risk**: Deploying too quickly in a single vintage year
  concentrates risk
- **Reduces J-curve**: Smooth deployment spreads the initial loss period
  (J-curve) over multiple years
- **Market timing flexibility**: Carryover allows tactical pausing during
  overheated markets without losing deployment capacity

**Example (CA-009)**: Quarterly pacing with a shortfall in Q1 carries that
capacity to Q2, allowing the fund to take advantage of better deal flow later
without falling behind on total deployment.

### 4.3 Fairness and Diversification (Cohort Allocation)

Cohort weights and caps ensure portfolio balance:

- **Diversification**: Prevents concentration in a single cohort (sector,
  geography, stage)
- **Strategy alignment**: Cohort weights encode fund strategy (e.g., 60% Core,
  40% Growth)
- **Risk limits**: Maximum per-cohort caps enforce hard limits on concentration
  risk

**Deterministic spill** is critical for auditability:

- Same inputs always produce same outputs
- Auditors can verify allocation logic
- No "black box" optimization that's hard to explain

### 4.4 Explainability and Audit

Pure functions enable reproducibility:

- **No hidden state**: Engines are stateless functions taking explicit inputs
- **Testable**: Truth cases provide complete input-output examples
- **Debuggable**: Logs show exact decision points (reserve binding, caps
  applied, spill amounts)

## 5. Alternatives Considered

### 5.1 Pacing Precedence Over Reserve

**Description**: Invert the precedence to prioritize deployment targets over
reserve maintenance.

**Rejected because**:

- Violates liquidity protection, creating risk of cash shortfalls
- Could trigger breach of fund covenants requiring minimum reserves
- Makes fund vulnerable to portfolio support needs during market downturns

### 5.2 Single Global Optimizer

**Description**: Use a mathematical optimization algorithm to find the "optimal"
allocation across all constraints simultaneously.

**Rejected because**:

- **Opacity**: Optimization solvers are black boxes; stakeholders can't verify
  correctness
- **Non-determinism**: Tie-breaking in solvers may be non-deterministic or
  poorly documented
- **Fragility**: Small input changes can cause large output swings due to
  constraint binding/unbinding
- **Audit complexity**: Auditors require explainable, step-by-step logic

### 5.3 Heuristic Rounding

**Description**: Use ad-hoc rounding rules (e.g., "always round up for Core
cohort") instead of deterministic bankers' rounding.

**Rejected because**:

- **Non-deterministic**: Different runs could produce different results
- **Audit failure**: Auditors cannot verify allocation correctness
- **Favoritism concerns**: Cohort-specific rules create appearance of unfair
  preference

### 5.4 Separate Capital Recall Transaction Type (v1.0)

**Description**: Introduce `capitalRecall` as a distinct transaction type
alongside distributions in the initial schema version.

**Deferred to v2.0 because**:

- **Complexity**: Adds implementation overhead for MVP
- **Time to market**: Negative distribution approach allows faster delivery
- **Uncertain need**: May not be required if integration partners adapt to
  documented convention
- **Reversible**: Can migrate to explicit type in v2.0 without data loss

**Condition for revisiting**: If 3+ integration partners report issues with
negative distributions, or if regulatory review requires explicit transaction
types, escalate to schema v2.0 planning.

## 6. Consequences

### 6.1 Positive Consequences

- **Predictable outputs**: Same inputs always produce same results, suitable for
  audit and compliance
- **Modular design**: Three independent engines (Reserve, Pacing, Cohort) enable
  separate testing and evolution
- **Clear conflict resolution**: Precedence rules provide unambiguous answers
  when constraints conflict
- **Audit trail**: Structured logs capture every decision point with
  justification

### 6.2 Negative Consequences

- **Under-deployment risk**: Reserve precedence can delay capital deployment
  when reserves bind, potentially under-deploying relative to fund strategy
- **Complexity**: Cap enforcement and spill reallocation add implementation
  complexity vs. simple pro-rata allocation
- **Semantic debt**: Negative distribution modeling creates documentation and
  integration burden

### 6.3 Mitigation Plans

**For under-deployment**:

- Monitor reserve binding frequency via metrics
- Alert fund managers when reserve precedence triggers
- Dashboard shows "foregone allocations" due to reserve constraints

**For complexity**:

- Comprehensive truth cases validate edge cases (CA-015: cap binding, CA-018:
  rounding tie-breaks)
- Unit tests for each engine independently
- Integration tests for multi-engine coordination (CA-020)

**For semantic debt**:

- ADR-008 documents design rationale (this document)
- Schema descriptions reference this ADR
- API documentation includes "Capital Recall Handling" section
- Client libraries provide semantic helper methods

## 7. Implementation Notes

### 7.1 Engine Architecture

All engines are **pure functions**:

```typescript
// Reserve Engine
interface ReserveState {
  target: number;
  floor: number;
  balance: number;
  needs: number;
}
function computeReserveState(inputs: Inputs, timestamp: Date): ReserveState;

// Pacing Engine
interface PacingTargets {
  period: string;
  base: number;
  carryover: number;
  target: number;
}
function computePacingTargets(
  inputs: Inputs,
  calendar: Calendar
): Map<Period, PacingTargets>;

// Cohort Engine
interface CohortAllocation {
  cohort: string;
  preCapAmount: number;
  capApplied: boolean;
  finalAmount: number;
}
function allocateToCohorts(
  amount: number,
  cohorts: Cohort[],
  maxPerCohort: number
): CohortAllocation[];
```

**No hidden state**: All inputs explicit; no global variables or mutable state.

### 7.2 Time Handling

- **Normalization**: All timestamps converted to fund timezone before processing
- **Period boundaries**: Calculated via `Calendar` abstraction (handles
  month-end, quarter-end, year-end consistently)
- **Cadence alignment**: Monthly/quarterly/annual rebalancing snaps to calendar
  boundaries

### 7.3 Idempotency

Spill and carryover calculations are **order-stable**:

- Sorting cohorts lexicographically before spill reallocation
- Carryover applied in chronological order
- Rounding tie-breaks follow highest-remainder → lexicographic rule

This ensures that running the same calculation multiple times produces identical
results.

### 7.4 Observability

Emit structured JSON per period:

```json
{
  "period": "2025-05",
  "reserve": {
    "target": 8000000,
    "balance": 10000000,
    "needs": 0,
    "precedence_applied": false
  },
  "pacing": {
    "base": 1666667,
    "carryover": 0,
    "target": 1666667
  },
  "cohorts_pre_caps": [
    { "name": "A", "amount": 900000 },
    { "name": "B", "amount": 900000 }
  ],
  "caps": {
    "max_per_cohort": 0.5,
    "cohorts_capped": [],
    "spilled": 0
  },
  "allocations": [
    { "name": "A", "amount": 900000 },
    { "name": "B", "amount": 900000 }
  ]
}
```

This log format enables:

- Debugging allocation decisions
- Audit trail reconstruction
- Performance metrics (how often caps bind, reserve precedence triggers, etc.)

## 8. Test Strategy

### 8.1 Coverage Plan

**20 truth cases** covering:

- **Reserve Engine**: 8 cases
  - CA-001: Baseline (reserve satisfied)
  - CA-002: Underfunded (reserve needs > 0)
  - CA-003: Overfunded (reserve > target)
  - CA-004: Zero contributions (adversarial)
  - CA-005: Dynamic ratio tracking
  - CA-006: Large distribution rebalancing
  - CA-007: Year-end cutoff handling
  - CA-013: **Reserve precedence over pacing** (conflict resolution)

- **Pacing Engine**: 5 cases
  - CA-008: Monthly pacing baseline
  - CA-009: **Quarterly pacing with carryover**
  - CA-010: Front-loaded pipeline constrained
  - CA-011: Pipeline drought (pacing floor triggered)
  - CA-012: Window comparison (24-month vs 18-month scenarios)

- **Cohort Engine**: 6 cases
  - CA-014: Fixed weights (simple pro-rata)
  - CA-015: **Cohort cap binding with spill**
  - CA-016: **Cohort lifecycle transitions** (cohort closes mid-year)
  - CA-017: Quarterly rebalance vs monthly
  - CA-018: **Rounding with tie-break** (three equal-weight cohorts)
  - CA-019: **Capital recall** (negative distribution handling)

- **Integration**: 1 case
  - CA-020: **Multi-engine coordination** (reserve + pacing + caps + recycling)

### 8.2 Adversarial Cases

Minimum 6 adversarial/edge cases included:

- CA-004: Zero contributions (no deployment)
- CA-011: Pipeline drought (pacing floor, no deals)
- CA-013: Reserve overrides pacing (conflict)
- CA-015: Cohort cap forces spill
- CA-019: Capital recall (negative distribution)
- CA-020: All policies interact simultaneously

### 8.3 Validation Approach

1. **JSON Schema validation**: All truth cases must pass `ajv` schema validation
2. **Domain scoring**: Custom scorer evaluates documentation against:
   - Domain keyword coverage (30%)
   - Schema vocabulary alignment (25%)
   - Code reference completeness (25%)
   - Truth case overlap (20%)
3. **Target**: ≥90% domain score (matching Phase 1B/1C quality standard)

## 9. References

### 9.1 Schema and Data

- **Schema**: `docs/schemas/capital-allocation-truth-case.schema.json`
- **Truth cases**: `docs/capital-allocation.truth-cases.json` (20 cases, CA-001
  through CA-020)
- **Validator**: `scripts/validation/capital-allocation-validation.yaml`

### 9.2 Related ADRs

- **ADR-006**: Fee Calculation Standards (upstream: provides fee schedules)
- **ADR-007**: Exit Recycling Policy (upstream: provides eligibility flags)

### 9.3 Implementation

- **Reserve Engine**: `client/src/core/reserves/ReserveEngine.ts` (planned)
- **Pacing Engine**: `client/src/core/pacing/PacingEngine.ts` (planned)
- **Cohort Engine**: `client/src/core/cohorts/CohortEngine.ts` (planned)

## 10. Approval and Review

**Review required from**:

- Capital Allocation Working Group
- Finance team (reserve policy implications)
- Legal/Compliance (capital recall handling)
- Integration partners (negative distribution convention)

**Status**: Awaiting review **Next review date**: TBD

---

**Document version**: 1.0.0 **Last updated**: 2025-10-29
