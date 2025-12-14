# Capital Allocation Semantic Lock

**Status**: ACTIVE - Phase 1 Implementation In Progress
**Gate**: Implementation MUST follow all sections as specified
**Authority**: This document is the AUTHORITATIVE SOURCE for all CA engine behavior

---

## Document Authority

This semantic lock document is the single source of truth for:
- Conservation identity formulas
- Term definitions and semantics
- Rounding and allocation algorithms
- Violation handling and severity levels

All implementations, tests, and reviews MUST reference this document.
Any code behavior that contradicts this spec is a BUG.

---

## 1. Conservation Identity (MANDATORY)

### 1.1 Choose ONE Conservation Model

| Model | Formula | Use When |
|-------|---------|----------|
| **Cash Ledger** | `starting_cash + contributions - distributions - allocations = ending_reserve_balance` | reserve_balance represents actual cash |
| **Commitment Capacity** | `commitment = reserved_capacity + allocable_capacity + deployed` | reserve_balance represents budgeted capacity |
| **Hybrid** | `reserve_balance` is cash; `allocations_by_cohort` is planned capacity | Mixed semantics |

**DECISION**: [ ] Cash Ledger / [ ] Commitment Capacity / [x] Hybrid

**Rationale**: Hybrid model selected because:
1. **Full truth case coverage** - Only Hybrid can pass all 119 Phoenix cases (CA-001 to CA-006 require cash tracking; CA-007+ require capacity planning)
2. **Real-world accuracy** - VC funds track both actual cash (LP contributions/distributions) AND planned capacity allocation (deployment strategy by cohort)
3. **No semantic overloading** - `reserve_balance` = actual cash on hand; `allocations_by_cohort` = planned capacity allocation. Each field has ONE meaning.
4. **Audit + planning** - Cash component reconciles to bank statements (auditor-friendly); capacity component integrates with pacing engine
5. **Existing code alignment** - reserves-v11.ts patterns for cash; fund-calc.ts patterns for capacity

### 1.1.0 Hybrid Model: What Exactly Is Conserved? (CRITICAL)

**Two separate conservation identities must hold:**

#### Cash Ledger Identity (Always)

```
ending_cash = starting_cash + sum(contributions) - sum(distributions) - sum(deployed_cash)
```

Where:
- `starting_cash`: Cash on hand at period start (or 0 for fund inception)
- `contributions`: LP capital calls received (actual cash in)
- `distributions`: LP distributions paid (actual cash out)
- `deployed_cash`: Cash sent to portfolio companies (actual investment outflows)
- `ending_cash`: Total cash on hand (NOT the same as `reserve_balance`)

**CRITICAL**: Planned allocations (`allocations_by_cohort`) do NOT appear in this equation. Only actual cash movements affect cash position.

**NOTE (Phase 2 Deferral)**: Management fees and fund expenses are NOT included in the cash formula for Phase 1. Fee handling will be added in Phase 2 when fee waterfall integration is implemented.

#### Commitment Remaining (Capacity Tracking)

```
commitment_remaining = commitment - sum(deployed_cash_by_cohort)
```

Where:
- `commitment`: Total fund commitment from LPA
- `deployed_cash_by_cohort`: Actual cash deployed to each cohort (not planned allocations)
- `commitment_remaining`: Unfunded commitment available for future deployment

This tracks the remaining DEPLOYMENT CAPACITY, separate from the cash ledger.

#### Reserve Balance Formula (TRUTH-CASE VERIFIED)

**This formula is validated against CA-001, CA-002, CA-003:**

```typescript
// Step 1: Calculate target reserve based on policy
const target_reserve = fund.commitment * (fund.target_reserve_pct ?? 0);

// Step 2: Effective buffer = max of absolute floor and percentage target
const effective_buffer = Math.max(
  constraints.min_cash_buffer ?? 0,
  target_reserve
);

// Step 3: reserve_balance = the held-back portion (capped by what we have)
const reserve_balance = Math.min(ending_cash, effective_buffer);
```

**Interpretation**: `reserve_balance` is the **reserved/held-back portion** of cash, NOT total cash on hand.

| Truth Case | ending_cash | effective_buffer | reserve_balance | Validation |
|------------|-------------|------------------|-----------------|------------|
| CA-001 | 20 | max(1, 20) = 20 | min(20, 20) = 20 | PASS |
| CA-002 | 2 | max(2, 20) = 20 | min(2, 20) = 2 | PASS |
| CA-003 | 25 | max(1, 15) = 15 | min(25, 15) = 15 | PASS |

#### Capacity Planning Identity (Separately)

```
commitment = sum(allocations_by_cohort) + remaining_capacity
```

Where:
- `commitment`: Total fund commitment from LPA (ceiling, not cash)
- `allocations_by_cohort`: Planned capacity earmarked for each vintage/cohort
- `remaining_capacity`: Unallocated commitment available for future planning

**CRITICAL**: This identity is about **planning against commitment**, not cash movement. A cohort can have $10M allocated (planned) but $0 deployed (no cash moved yet).

#### Mapping Rule: What Drives the Capacity Plan?

**DECISION**: [x] Commitment-driven planning

The capacity plan (`allocations_by_cohort`) is driven by **commitment budget**, not called capital:
- GPs plan deployment against total fund size ($100M commitment)
- Actual cash available (`reserve_balance`) may be less than planned allocations
- This is intentional: you can plan to deploy $20M to Cohort 2024 even if you've only called $15M

**Constraint**: `sum(deployed_cash)` for a cohort cannot exceed `allocations_by_cohort` for that cohort (can't deploy more than planned).

#### Event Type Separation

| Event Type | Affects Cash Ledger? | Affects Capacity Plan? | Example |
|------------|---------------------|------------------------|---------|
| Contribution | Yes (+cash) | No | LP wires $5M capital call |
| Distribution | Yes (-cash) | No | Fund distributes $2M to LPs |
| Plan allocation | No | Yes (+allocated) | Earmark $10M for 2024 cohort |
| Cash deployment | Yes (-cash) | Yes (type='deployed') | Invest $1M in portfolio company |

**CRITICAL**: "Contributions first" ordering only applies to the **cash ledger**. Planned allocations have no ordering constraint because they don't move cash.

### 1.1.1 Term Definitions (MANDATORY)

**CRITICAL**: These definitions are referenced by invariants and tests. Ambiguity here propagates everywhere.

| Term | Definition | Represented By |
|------|------------|----------------|
| `allocations` | [x] Planned capacity allocation to cohorts (NOT cash outflow). Represents how much of the fund's commitment is earmarked for each vintage year. | Output field: `allocations_by_cohort[].amount` |
| `reserve_balance` | [x] **The held-back portion of cash** = `min(ending_cash, effective_buffer)`. This is the reserve being protected, NOT total cash on hand. Verified against CA-001/002/003. | Output field: `reserve_balance` |
| `ending_cash` | Total cash on hand = `starting_cash + contributions - distributions - deployed_cash`. Different from `reserve_balance`. | Internal calculation |
| `effective_buffer` | `max(min_cash_buffer, commitment * target_reserve_pct)` - the target reserve level. | Internal calculation |
| `allocable_cash` | Cash available for allocation = `max(0, ending_cash - reserve_balance)` = excess above reserve. | Derived |
| `cash_deployed` | Cumulative actual cash outflows to portfolio companies. Subset of allocations that have been funded. | Output field: `cumulative_deployed` or derived from `allocations_by_cohort[].type === 'deployed'` |
| `remaining_capacity` | Unallocated commitment that can still be planned for future cohorts. | Output field: `remaining_capacity` |
| `deployed` | [x] Cumulative cash outflows (actual money sent to portfolio companies) | Tracked in: `cumulative_deployed` or filtered `allocations_by_cohort` |

### 1.2 Model-Specific Invariants (Machine-Testable)

**Selected: Invariant Set C (Hybrid)** - Two invariants must hold: cash conservation AND capacity conservation.

**CRITICAL**: Variable names MUST include unit and semantic to prevent misinterpretation. Use `Decimal.eq()` or tolerance check for non-integer comparisons (never `===` for floating point).

#### Invariant Set A: Cash Ledger Model

```typescript
// INVARIANT 1A: Cash Conservation (Cash Ledger only)
// Must hold at end of every period
// Variable names explicitly encode: unit (Cents) + semantic (Cash/Deployed)

const startingCashCents = input.startingCash * 100; // Normalize to cents
const contributionsCents = input.flows.contributions.map(c => c.amountCents);
const distributionsCents = input.flows.distributions.map(d => d.amountCents);

// "deployedCashCents" = cash outflows to portfolio (NOT planned allocations)
const deployedCashCents = result.allocations_by_cohort
  .filter(a => a.type === 'deployed') // Only actual cash outflows
  .reduce((sum, a) => sum + a.amountCents, 0);

const lhsCents = startingCashCents + sum(contributionsCents) - sum(distributionsCents) - deployedCashCents;
const endingReserveBalanceCents = result.reserve_balance * 100;

// Use tolerance for floating point, or Decimal.eq() for Decimal.js
assert(
  Math.abs(lhsCents - endingReserveBalanceCents) < 1, // 1 cent tolerance
  `Cash conservation violation: LHS=${lhsCents}, RHS=${endingReserveBalanceCents}`
);
```

#### Invariant Set B: Commitment Capacity Model

```typescript
// INVARIANT 1B: Capacity Conservation (Commitment Capacity only)
// Variable names: unit (Dollars) + semantic (Capacity/Deployed)

const commitmentDollars = input.fund.commitment;
const reservedCapacityDollars = result.reserve_balance; // In capacity model, this is capacity, not cash
const allocableCapacityDollars = result.allocations_by_cohort
  .filter(a => a.type === 'planned')
  .reduce((sum, a) => sum + a.amountDollars, 0);
const deployedDollars = result.cumulative_deployed; // Actual deployments

assert(
  Math.abs(commitmentDollars - (reservedCapacityDollars + allocableCapacityDollars + deployedDollars)) < 0.01,
  "Capacity conservation violation"
);
```

#### Invariant Set C: Hybrid Model

```typescript
// INVARIANT 1C-i: Cash component (Hybrid)
// reserve_balance is CASH, allocations_by_cohort is PLANNED CAPACITY

const cashLhsCents = startingCashCents + sum(contributionsCents) - sum(distributionsCents) - sum(actualCashOutflowsCents);
assert(
  Math.abs(cashLhsCents - result.reserve_balance * 100) < 1,
  "Hybrid cash component violation"
);

// INVARIANT 1C-ii: Capacity component (Hybrid)
const capacityLhsDollars = input.fund.commitment;
const plannedCapacityDollars = result.allocations_by_cohort.reduce((sum, a) => sum + a.amountDollars, 0);
const remainingCapacityDollars = result.remaining_capacity;

assert(
  Math.abs(capacityLhsDollars - (plannedCapacityDollars + remainingCapacityDollars)) < 0.01,
  "Hybrid capacity component violation"
);
```

#### Common Invariants (All Models)

```typescript
// INVARIANT 2: Buffer Constraint (uses EFFECTIVE BUFFER, not just min_cash_buffer)
// effective_buffer = max(min_cash_buffer ?? 0, commitment * target_reserve_pct ?? 0)
const effectiveBufferCents = Math.max(
  (input.constraints.min_cash_buffer ?? 0) * 100,
  Math.round((input.fund.commitment ?? 0) * (input.fund.target_reserve_pct ?? 0) * 100)
);
assert(result.reserve_balance * 100 >= effectiveBufferCents, "Buffer breach");
// Decision: [x] Soft (warning + violation flag) - per enforcement matrix
// Behavior: Silently clip allocations to preserve buffer. Only emit violation if uncurable.

// INVARIANT 3: Allocation Cap
const totalAllocatedCents = result.allocations_by_cohort.reduce((sum, a) => sum + a.amountCents, 0);
assert(totalAllocatedCents <= availableCapacityCents, "Over-allocation");

// INVARIANT 4: Non-negativity
assert(result.reserve_balance >= 0, "Negative reserve");
assert(result.allocations_by_cohort.every(a => a.amountCents >= 0), "Negative allocation");
// Exception: CA-019 allows negative distributions (capital recall)
```

**Effective Buffer Unified Rule** (LOCKED):
> `effective_buffer = max(min_cash_buffer ?? 0, commitment * target_reserve_pct ?? 0)`
>
> This unifies absolute floor (`min_cash_buffer`) and percentage reserve (`target_reserve_pct`) into a single constraint. CA-001 uses percentage only; CA-002 uses absolute floor only; both paths evaluate against `effective_buffer`.

### 1.3 Spec Test Requirement

**CRITICAL**: Invariant tests MUST compute totals from **independent outputs** (e.g., sum of arrays), NOT from a `total_*` scalar emitted by the same function. Self-referential tests are tautological.

**ADDITIONAL REQUIREMENT**: At least ONE test must have an expected allocation that is **independently derivable from the spec** (not from any engine output). This prevents an engine from "making up" coherent but incorrect internals.

Create `tests/unit/truth-cases/ca-invariants.test.ts` with:

```typescript
describe('CA Conservation Invariants', () => {
  /**
   * TEST 1: Independently-derivable allocation (MANDATORY)
   *
   * This test uses a simplified case where the expected allocation can be
   * calculated by hand from the spec, WITHOUT running the engine first.
   *
   * Setup: target_reserve = 20%, single cohort (100%), no constraints
   * Net inflows: 50 + 50 - 20 = 80
   * Expected reserve: 80 * 0.20 = 16
   * Expected allocation: 80 - 16 = 64
   */
  it('independently-derivable: single cohort with 20% reserve', () => {
    const input = {
      starting_cash: 0,
      contributions: [{ date: '2024-03-31', amount: 50 }, { date: '2024-06-30', amount: 50 }],
      distributions: [{ date: '2024-09-30', amount: 20 }],
      target_reserve_pct: 0.2,
      cohorts: [], // Empty = single implicit cohort at 100%
    };

    // CALCULATE EXPECTED VALUES BY HAND (from spec, not from engine)
    const netInflowsCents = (0 + 50 + 50 - 20) * 100; // = 8000 cents
    const expectedReserveCents = Math.round(netInflowsCents * 0.2); // = 1600 cents
    const expectedAllocationCents = netInflowsCents - expectedReserveCents; // = 6400 cents

    const result = calculateReserve(input);

    // Assert allocation matches hand-calculated value (NOT derived from engine)
    const actualAllocationCents = result.allocations_by_cohort.reduce(
      (sum, cohort) => sum + cohort.amountCents, 0
    );
    expect(actualAllocationCents).toBe(expectedAllocationCents); // 6400

    // Then verify conservation holds using that allocation
    const conservationLhsCents = 0 + 5000 + 5000 - 2000 - actualAllocationCents;
    expect(result.reserve_balance * 100).toBe(conservationLhsCents); // 1600
  });

  /**
   * TEST 2: Conservation across multiple periods
   */
  it('conservation holds across multiple periods', () => {
    // Test that running balance + allocations = inputs at each checkpoint
  });

  /**
   * TEST 3: Multi-cohort with known weights
   */
  it('independently-derivable: two cohorts with 60/40 split', () => {
    const input = {
      // ... setup for 2 cohorts with weights [0.6, 0.4]
    };

    // HAND CALCULATION
    const totalToAllocate = 10000; // cents
    const cohort1Expected = Math.round(totalToAllocate * 0.6); // 6000
    const cohort2Expected = totalToAllocate - cohort1Expected; // 4000 (remainder goes here)

    const result = calculateReserve(input);

    expect(result.allocations_by_cohort[0].amountCents).toBe(cohort1Expected);
    expect(result.allocations_by_cohort[1].amountCents).toBe(cohort2Expected);
  });
});
```

---

## 2. Time Boundary Rules

### 2.0 Timezone Rule (MANDATORY)

**CRITICAL**: Timezone ambiguity causes silent boundary assignment bugs.

**RULE**: All date-only strings (e.g., `"2024-03-31"`) are interpreted as **UTC date buckets**.

- Parse as: `YYYY-MM-DDT00:00:00.000Z` (never local time)
- Comparison: Date-only equality, not timestamp equality
- Storage: ISO 8601 format with explicit Z suffix when timestamps needed

#### Implementation Prohibition (MANDATORY)

**NEVER use these in production logic** - they parse as local time and cause nondeterminism:

```typescript
// PROHIBITED - These parse as LOCAL TIME (nondeterministic)
new Date('2024-03-31');           // WRONG - local time
Date.parse('2024-03-31');         // WRONG - local time
parseISO('2024-03-31');           // WRONG - depends on library
dayjs('2024-03-31');              // WRONG - local time default
```

**APPROVED patterns** - Deterministic UTC handling:

```typescript
// OPTION A: Keep as string, compare lexicographically (PREFERRED for date-only)
const dateStr = '2024-03-31';
if (dateStr <= '2024-03-31') { /* Q1 */ }

// OPTION B: Explicit UTC parsing when Date object needed
const date = new Date(Date.UTC(2024, 2, 31)); // Month is 0-indexed
const date = new Date('2024-03-31T00:00:00.000Z'); // Explicit Z suffix

// OPTION C: Library with explicit UTC
dayjs.utc('2024-03-31');
```

**Spec test (timezone boundary + implementation check)**:
```typescript
describe('Timezone Determinism', () => {
  it('boundary date assignment is timezone-independent', () => {
    // This test would fail if local time parsing is used in certain timezones
    const flow = { date: '2024-03-31', amount: 100 };
    const q1End = '2024-03-31';

    // Flow on Q1 end date should consistently belong to Q1 (or Q2, per decision)
    const assignment = assignFlowToPeriod(flow, q1End);
    expect(assignment.period).toBe('Q1'); // Or 'Q2' - but deterministic
  });

  it('date-only strings are never parsed as local time', () => {
    // This test fails if implementation uses new Date('YYYY-MM-DD')
    // Run in a timezone where local != UTC (e.g., TZ=America/Los_Angeles)
    const testDate = '2024-01-15';

    // If implementation parses as local time, this will shift by timezone offset
    const result = parseDateForCA(testDate);

    // Must always produce the same UTC date regardless of system timezone
    expect(result.toISOString().startsWith('2024-01-15')).toBe(true);
  });
});
```

### 2.1 Period Definition

| Rule | Decision | Example |
|------|----------|---------|
| Period bounds | [x] `[start, end]` inclusive | Q1 = Jan 1 to Mar 31 (both inclusive) |
| Quarterly definition | [x] Calendar quarters | Q1 = Jan-Mar, Q2 = Apr-Jun, Q3 = Jul-Sep, Q4 = Oct-Dec |
| Period start time | [x] 00:00:00.000Z (UTC) | Captures all activity on start date |
| Period end time | [x] 23:59:59.999Z (UTC) | Mar 31 at any time = Q1 |

**Rationale**: Matches LPA language ("through March 31"), fund admin conventions, LP reporting cadence, and auditor expectations.

### 2.2 Boundary Date Assignment

When a flow occurs on a period boundary date:

| Scenario | Decision |
|----------|----------|
| Flow on period end date | [x] Belongs to ending period (Mar 31 call = Q1) |
| Flow on period start date | [x] Belongs to starting period (Apr 1 call = Q2) |
| Multiple flows same date | [x] Contributions first, then distributions (cash in before cash out) |

**Rationale**: Matches capital call notice date convention. Contributions first prevents negative interim balances and matches fund admin practice.

### 2.3 Rebalance Trigger

| Trigger Type | Decision |
|--------------|----------|
| Calendar-based | [x] Every period end |
| Event-based | Not required (low transaction volume for emerging managers) |
| Hybrid | Future enhancement if needed |

**Rationale**: Calendar-based matches LP reporting cadence, provides clean audit trail. Emerging managers typically have 2-4 capital calls/year, making event-based triggers unnecessary complexity.

**rebalance_frequency mapping**:
- `"quarterly"`: Recalculate at end of each calendar quarter (Mar 31, Jun 30, Sep 30, Dec 31)
- `"monthly"`: Recalculate at end of each calendar month
- `"annual"`: Recalculate at fund fiscal year end only

---

## 3. Unit + Precision Table

### 3.1 Canonical Internal Representation

**DECISION**: [x] Integer cents (JS safe integer) / [ ] Decimal dollars (2 places) / [ ] Decimal dollars (4 places)

**Rationale**: Integer cents selected for determinism (matches reserves-v11 pattern).

**Technical Note**: JavaScript `number` is IEEE 754 double, not true int64. Max safe integer is `Number.MAX_SAFE_INTEGER` (2^53 - 1 ≈ $90 quadrillion in cents). This is sufficient for all fund sizes.

**Implementation requirement**:
```typescript
function toCents(dollars: number): number {
  const cents = Math.round(dollars * 100);
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`Value ${dollars} exceeds safe integer range when converted to cents`);
  }
  return cents;
}
```

**Weights representation**: Use basis points (bps, 1e4 scale) for deterministic integer math:
- 33.33% = 3333 bps
- Allocation: `Math.floor(totalCents * weightBps / 10000)` + largest remainder distribution

### 3.2 Field-by-Field Specification

| Field | Truth Case Unit | Internal Rep | Output Rounding | Notes |
|-------|-----------------|--------------|-----------------|-------|
| `commitment` | USD or $M (mixed) | cents (int64) | dollars (0 dec) | Infer from magnitude |
| `contributions[].amount` | USD or $M | cents (int64) | dollars (0 dec) | Same scale as commitment |
| `distributions[].amount` | USD or $M | cents (int64) | dollars (0 dec) | Same scale as commitment |
| `min_cash_buffer` | USD or $M | cents (int64) | dollars (0 dec) | Same scale as commitment |
| `reserve_balance` | USD or $M | cents (int64) | dollars (0 dec) | Output in input scale |
| `allocations_by_cohort[].amount` | USD or $M | cents (int64) | dollars (0 dec) | Output in input scale |
| `target_reserve_pct` | decimal (0-1) | decimal | 4 decimal places | e.g., 0.2 = 20% |
| `cohort_weight` | decimal (0-1) | decimal | 4 decimal places | |

### 3.3 Unit Inference Rules

```typescript
function inferUnitScale(commitment: number): number {
  // If commitment < 10,000, assume $M (multiply by 1,000,000)
  // If commitment >= 10,000, assume raw dollars
  return commitment < 10_000 ? 1_000_000 : 1;
}

// CRITICAL: Apply same scale to ALL monetary fields
function normalizeInput(input: TruthCaseInput): NormalizedInput {
  const scale = inferUnitScale(input.fund.commitment);
  return {
    commitment_cents: Math.round(input.fund.commitment * scale * 100),
    contributions: input.flows.contributions.map(c => ({
      ...c,
      amount_cents: Math.round(c.amount * scale * 100),
    })),
    // ... apply to all monetary fields
  };
}
```

### 3.4 Million-Scale Mismatch Detector (MANDATORY)

**CRITICAL**: The most common unit error is "off by ~1,000,000×" between fields. This detector targets that specific failure mode with deterministic ratio comparison.

**Algorithm**: Compare ratios between each monetary field and commitment. If any ratio differs from others by ~1,000,000×, trigger the trap.

```typescript
/**
 * Detects million-scale mismatches between monetary fields.
 *
 * Failure mode we're catching:
 * - commitment=100 (implying $M scale)
 * - but min_cash_buffer=1000000 (raw dollars, not scaled)
 *
 * Detection: The ratio (field/commitment) should be similar across all fields.
 * If one ratio is ~1,000,000× different from others, we have a scale mismatch.
 */
function detectMillionScaleMismatch(input: TruthCaseInput): void {
  const commitment = input.fund.commitment;
  if (commitment === 0) return; // Can't compute ratios

  // Collect all non-zero monetary field values
  const fields: { name: string; value: number; ratio: number }[] = [];

  const addField = (name: string, value: number) => {
    if (value !== 0 && value !== undefined) {
      fields.push({ name, value, ratio: value / commitment });
    }
  };

  addField('min_cash_buffer', input.constraints?.min_cash_buffer);
  input.flows?.contributions?.forEach((c, i) => addField(`contributions[${i}]`, c.amount));
  input.flows?.distributions?.forEach((d, i) => addField(`distributions[${i}]`, d.amount));

  if (fields.length < 2) return; // Need at least 2 fields to compare

  // Find min and max ratios
  const ratios = fields.map(f => f.ratio);
  const minRatio = Math.min(...ratios);
  const maxRatio = Math.max(...ratios);

  // If max/min ratio exceeds ~100,000 (allowing some tolerance), likely mismatch
  // This catches the 1,000,000× case with margin for legitimate variation
  const MISMATCH_THRESHOLD = 100_000;

  if (minRatio > 0 && maxRatio / minRatio > MISMATCH_THRESHOLD) {
    const minField = fields.find(f => f.ratio === minRatio)!;
    const maxField = fields.find(f => f.ratio === maxRatio)!;

    throw new Error(
      `Million-scale mismatch detected:\n` +
      `  commitment=${commitment}\n` +
      `  ${minField.name}=${minField.value} (ratio=${minField.ratio.toExponential(2)})\n` +
      `  ${maxField.name}=${maxField.value} (ratio=${maxField.ratio.toExponential(2)})\n` +
      `  Ratio difference: ${(maxRatio / minRatio).toExponential(2)}× exceeds threshold ${MISMATCH_THRESHOLD}×`
    );
  }
}
```

**Spec test (inconsistency trap)**:
```typescript
it('detects unit inconsistency between commitment and other fields', () => {
  const inconsistentInput = {
    fund: { commitment: 100 },        // Looks like $M (small number)
    constraints: { min_cash_buffer: 1000000 }, // Looks like raw dollars
    // ...
  };

  expect(() => normalizeInput(inconsistentInput)).toThrow(/inconsistency/i);
});
```

### 3.5 Inconsistency Trap Decision

If a truth case has inconsistent scales (e.g., commitment in $M but buffer in raw dollars):

**DECISION**: [x] Fail with error / [ ] Warn and proceed / [ ] Auto-correct with log

**Rationale**: Fail-fast prevents silent data corruption. Clear error message guides user to fix input. Audit trail remains clean.

**Error message format**:
```
Million-scale mismatch detected:
  commitment=100 (ratio to self: 1.00)
  min_cash_buffer=5000000 (ratio to commitment: 50000.00)
  Ratio difference: 50000× exceeds threshold 1000×

Fix: Ensure all monetary fields use the same unit scale (either $M or raw dollars).
```

---

## 4. Determinism Contract

### 4.1 Rounding Rules

| Context | Rounding Method | Precision |
|---------|-----------------|-----------|
| Intermediate calculations | [x] Full precision (no rounding) | N/A |
| **Allocation amounts** | [x] **Largest Remainder Method** (Section 4.2) | Cents (integer) |
| Percent-derived scalars | [x] Bankers (half-to-even) | Cents |
| When rounding occurs | [x] End-of-period only | N/A |

**CRITICAL Distinction**:
> - **Allocation amounts** are produced by **Largest Remainder Method** (Section 4.2), NOT by banker's rounding.
> - **Banker's rounding** applies ONLY to percent-derived scalars (e.g., `effective_buffer_cents`) and any non-integer-to-integer conversions.
> - Do NOT apply banker's rounding to each cohort share before remainder distribution - that would change outputs.

**Rationale**: CA-018 explicitly specifies "Bankers' rounding with stable tie-break". Bankers rounding is statistically unbiased and standard in financial systems.

**Usage Scope** (LOCKED):
> Bankers rounding is applied **only** when converting external decimal inputs to integer cents (and when rendering outputs). **Never** apply during integer-cent internal computation. **Never** apply to allocation amounts (use LRM instead).

**Implementation** (JS doesn't have native Bankers rounding):
```typescript
// Rounds to nearest integer; ties go to nearest EVEN integer
// NOTE: 0.5 is exactly representable in IEEE-754, so strict comparison is safe
// if upstream doesn't manufacture float noise
function bankersRoundPositive(x: number): number {
  const n = Math.floor(x);
  const frac = x - n;

  if (frac < 0.5) return n;
  if (frac > 0.5) return n + 1;
  // exactly half - round to nearest even
  return (n % 2 === 0) ? n : n + 1;
}

// For negative values (CA-019 capital recalls), use symmetric version:
function bankersRoundSymmetric(x: number): number {
  return Math.sign(x) * bankersRoundPositive(Math.abs(x));
}

// Canonical usage: dollars → cents conversion
function dollarsToCents(dollars: number): number {
  return bankersRoundSymmetric(dollars * 100);
}
```

**Required Test Vectors** (spec test must include):
| Input | Expected | Reason |
|-------|----------|--------|
| `bankersRoundSymmetric(2.5)` | `2` | Tie → even (2) |
| `bankersRoundSymmetric(3.5)` | `4` | Tie → even (4) |
| `bankersRoundSymmetric(-2.5)` | `-2` | Negative tie → even (-2) |
| `bankersRoundSymmetric(-3.5)` | `-4` | Negative tie → even (-4) |
| `bankersRoundSymmetric(2.4)` | `2` | Below midpoint |
| `bankersRoundSymmetric(2.6)` | `3` | Above midpoint |

**Alignment with runner**: Use same approach as `assertNumericField()` in helpers.ts

### 4.2 Allocation Algorithm

When allocating to multiple cohorts:

| Step | Rule |
|------|------|
| 1. Base allocation | Pro-rata by cohort weight |
| 2. Remainder handling | [x] **Largest remainder method** (CA-018 verified) |
| 3. Tie-break (equal remainders) | [x] First cohort in canonical sort order |

**NOTE (Simplification)**: When remainders are exactly equal, the "first cohort" rule (lower index in canonical sort order) replaces the traditional LRM "largest fraction" approach. This simplification ensures determinism without requiring complex fraction comparison, and produces identical results for all CA truth cases.

**CRITICAL**: LRM remainder ranking must be computed using **integer arithmetic** (no float remainders).

**Integer LRM via Basis Points** (LOCKED):
```typescript
// Convert weights to basis points (0-10000), enforce sum = 10000
function normalizeWeightsToBps(weights: number[]): number[] {
  const rawBps = weights.map(w => Math.round(w * 10000));
  const sum = rawBps.reduce((a, b) => a + b, 0);

  // Adjust last element to ensure sum = 10000
  if (sum !== 10000) {
    rawBps[rawBps.length - 1] += (10000 - sum);
  }
  return rawBps;
}

// LRM with pure integer math (no float remainders)
function allocateLRM(totalCents: number, weightsBps: number[]): number[] {
  const allocations: number[] = [];
  const remainders: { index: number; rem: number }[] = [];

  for (let i = 0; i < weightsBps.length; i++) {
    const base = Math.floor(totalCents * weightsBps[i] / 10000);
    const rem = (totalCents * weightsBps[i]) % 10000;  // Integer remainder!
    allocations.push(base);
    remainders.push({ index: i, rem });
  }

  // Distribute shortfall to largest remainders (stable sort for tie-break)
  const sumBase = allocations.reduce((a, b) => a + b, 0);
  let shortfall = totalCents - sumBase;

  // Sort by remainder DESC, then by index ASC (canonical order tie-break)
  remainders.sort((a, b) => b.rem - a.rem || a.index - b.index);

  for (let i = 0; shortfall > 0 && i < remainders.length; i++) {
    allocations[remainders[i].index] += 1;
    shortfall--;
  }

  return allocations;
}
```

**Why basis points?** Float weights like `0.3333333` produce float remainders that can compare inconsistently. Integer `% 10000` produces exact integer remainders with deterministic comparison.

**CA-018 Verification (Integer Method)**:
```
Input weights: [0.3333333, 0.3333333, 0.3333334]
Normalized bps: [3333, 3333, 3334] (sum = 10000)
Total: 1,000,000 cents

Base allocation:
  A: floor(1000000 * 3333 / 10000) = 333300, rem = (1000000 * 3333) % 10000 = 0
  B: floor(1000000 * 3333 / 10000) = 333300, rem = 0
  C: floor(1000000 * 3334 / 10000) = 333400, rem = 0

Wait - that gives 999,900 + 333,400 = 1,000,000. Let me recalculate...

Actually with 7-decimal weights, use higher precision (1e7 scale):
  weightScale = [3333333, 3333333, 3333334] (sum = 10,000,000)
  A: floor(1000000 * 3333333 / 10000000) = 333333, rem = 3333330000000 % 10000000 = 3000000
  B: floor(1000000 * 3333333 / 10000000) = 333333, rem = 3000000
  C: floor(1000000 * 3333334 / 10000000) = 333333, rem = 4000000

Sum of floors: 999999 (1 cent short)
Largest remainder: C (4000000 > 3000000)
C gets +1 → 333334

Expected: [333333, 333333, 333334] ✓
```

**Precision Choice**: For CA-018 style 7-decimal weights, use 1e7 scale (not 1e4). Adapter normalizes to this scale on input.

### 4.3 Ordering Rules (Input Processing)

| Scenario | Deterministic Order |
|----------|---------------------|
| Multiple flows on same date | [x] Contributions first, then distributions (cash in before cash out) |
| Multiple cohorts eligible | [x] By canonical sort key: `(start_date, id)` |
| Cap spill-over (CA-015) | [x] Next cohort in canonical sort order |

**Constraint Evaluation Timing** (LOCKED):
> Ordering only affects the cash ledger **if** constraints are evaluated per-flow. In Phase 1, cash constraints are evaluated **at period end** (unless a truth case explicitly requires per-flow enforcement). This prevents "contributions-first" from becoming a silent semantic dependency.

**Canonical Sort Key** (LOCKED):
```typescript
// Type-safe sort key with explicit coercion
function cohortSortKey(c: Cohort): [string, string] {
  return [
    c.start_date || '9999-12-31',                    // Empty/null = far future
    String(c.id ?? c.name ?? '').toLowerCase()       // Coerce to string (handles numeric ids)
  ];
}

// Deterministic string comparator (avoids locale-sensitive localeCompare)
// localeCompare can produce different results for non-ASCII in different environments
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// Sort ascending by tuple comparison
cohorts.sort((a, b) => {
  const [aDate, aId] = cohortSortKey(a);
  const [bDate, bId] = cohortSortKey(b);
  return cmp(aDate, bDate) || cmp(aId, bId);
});
```

**Why not `localeCompare`?** It can be locale-sensitive for non-ASCII identifiers, causing cross-environment drift. Simple `<`/`>` comparison is deterministic for ASCII ISO dates and IDs.

**Date Format Requirement** (LOCKED):
> All cohort dates **must** be canonical `YYYY-MM-DD` (zero-padded). Non-canonical formats (e.g., `2024-1-1`) are **adapter errors**. Lexicographic sort only works with zero-padded ISO dates.

**Sort Key Test Cases** (spec test must include):
| `start_date` | `id` | Expected Sort Position |
|--------------|------|------------------------|
| `'2024-01-01'` | `'A'` | First |
| `'2024-01-01'` | `'B'` | Second (same date, id tiebreak) |
| `'2024-06-01'` | `'A'` | Third |
| `''` (empty) | `'Z'` | Last (empty = far future) |
| `null` | `'Y'` | Last (null = far future) |
| `'2024-01-01'` | `0` (numeric) | Works - coerced to `'0'` |

**Cap Spill-Over (CA-015 Verified)**:
- If cohort hits `max_allocation_per_cohort` cap, excess spills to next cohort in sort order
- Continue until all capacity allocated or all cohorts at cap
- **Termination rule**: If all cohorts at cap, remaining allocable capacity stays **unallocated** (no violation emitted, appears as `unallocated_capacity` in output if field exists)

### 4.4 Output Sorting + Presence Requirements (MANDATORY)

**CRITICAL**: Even if computation is deterministic, output arrays can become nondeterministic due to:
- Object key iteration order
- Map iteration order
- Insertion order dependent on input ordering
- Unstable sorts

#### Exact Sort Keys (LOCKED)

| Output Array | Sort Key | Sort Order | String Comparison |
|--------------|----------|------------|-------------------|
| `reserve_balance_over_time[]` | `date` | Ascending | Lexicographic (`'2024-01-01' < '2024-03-31'`) |
| `allocations_by_cohort[]` | `cohort` | Ascending | Lexicographic (`'2023' < '2024'`) |
| `pacing_targets_by_period[]` | `period` | Ascending | Lexicographic (`'2024-Q1' < '2024-Q2'`) |
| `violations[]` | `(period, type, cohort)` | Ascending | Period first, then type, then cohort; nulls LAST |

#### Arrays MUST Be Present (Even If Empty)

**CRITICAL**: Avoid `undefined` vs `[]` drift, which causes validation failures.

```typescript
// WRONG - Creates undefined/[] inconsistency
return {
  reserve_balance: 100,
  allocations_by_cohort: hasAllocations ? allocations : undefined, // WRONG
};

// CORRECT - Always return arrays (empty if needed)
return {
  reserve_balance: 100,
  allocations_by_cohort: allocations ?? [],    // Always array
  reserve_balance_over_time: timeSeries ?? [], // Always array
  violations: violations ?? [],                 // Always array
};
```

**Implementation requirement**:
```typescript
// ALWAYS sort output arrays AND ensure they exist before returning
function formatOutput(result: InternalResult): TruthCaseOutput {
  return {
    reserve_balance: result.reserve_balance,

    // Sort by cohort (lexicographic), always present
    allocations_by_cohort: (result.allocations ?? [])
      .sort((a, b) => a.cohort.localeCompare(b.cohort)),

    // Sort by date (lexicographic), always present
    reserve_balance_over_time: (result.timeSeries ?? [])
      .sort((a, b) => a.date.localeCompare(b.date)),

    // Sort by period → type → cohort, nulls last
    violations: (result.violations ?? [])
      .sort((a, b) =>
        (a.period ?? 'zzz').localeCompare(b.period ?? 'zzz') ||
        a.type.localeCompare(b.type) ||
        (a.cohort ?? 'zzz').localeCompare(b.cohort ?? 'zzz')
      ),
  };
}
```

**Spec test (output ordering)**:
```typescript
it('output arrays are sorted deterministically', () => {
  // Run twice with same input
  const result1 = executeCA(input);
  const result2 = executeCA(input);

  // Deep equality includes array order
  expect(result1).toEqual(result2);

  // Verify specific ordering
  expect(result1.allocations_by_cohort.map(c => c.cohort))
    .toEqual(['2023', '2024', '2025']); // Sorted order
});

### 4.5 Spec Test: Determinism Verification

```typescript
describe('CA Determinism', () => {
  it('same input always produces same output', () => {
    const input = loadTruthCase('CA-006'); // Multiple cohorts
    const results = Array(10).fill(null).map(() => executeCA(input));

    // All runs must be identical
    results.forEach((r, i) => {
      expect(r).toEqual(results[0]);
    });
  });

  it('allocation remainder is deterministic', () => {
    // Test case with non-integer pro-rata split
    const input = { available: 100, cohorts: [{ weight: 0.333 }, { weight: 0.333 }, { weight: 0.334 }] };
    const result = allocateToCohorts(input);

    expect(result[0].amount + result[1].amount + result[2].amount).toBe(100);
    // Remainder (1 unit) always goes to same cohort
    expect(result[2].amount).toBe(34); // Or wherever spec says
  });
});
```

---

## 5. Semantic Definitions

### 5.1 Core Field Semantics

| Field | Definition | Type |
|-------|------------|------|
| `reserve_balance` | [x] Cash on hand - actual cash available after all inflows/outflows | **Cash** |
| `allocations_by_cohort[].amount` | [x] Planned allocation - capacity earmarked for cohort (may or may not be deployed yet) | **Plan** |
| `allocations_by_cohort[].type` | `'planned'` = capacity reservation, `'deployed'` = actual cash outflow | Discriminator |
| `cumulative_deployed` | Sum of all `type === 'deployed'` allocations - actual cash sent to portfolio | **Cash** |
| `remaining_capacity` | `commitment - sum(all allocations)` - unallocated commitment | **Capacity** |
| `violations[]` | Conditions that trigger a violation entry | See 5.2 |

### 5.2 Violation Conditions

| Violation Type | Trigger Condition | Severity | Enforcement Behavior |
|----------------|-------------------|----------|---------------------|
| `buffer_breach` | `reserve_balance < effective_buffer` | [x] **Warning** | Silently clip allocations first; only emit violation if uncurable at zero allocation |
| `over_allocation` | `sum(allocations) > available` | [x] **Warning** (correctable) | Always satisfiable via pro-rata clip; never actually emitted |
| `cap_exceeded` | `cohort_allocation > cohort_cap` | [x] **Warning** | Satisfiable via spill-over; see termination rule below |
| `negative_balance` | `reserve_balance < 0` | [x] **Error** | Throw immediately - indicates invalid input or calculation bug |
| `negative_capacity` | `commitment - sum(allocations) < 0` | [x] **Error** | Throw immediately - allocation exceeds commitment |

**Note**: `buffer_breach` uses `effective_buffer` (see Section 1.2), not just `min_cash_buffer`.

**Key Distinction** (from CA-IMPLEMENTATION-EVALUATION-FINAL.md):
- **Binding** = constraint was satisfied by automatic clipping/spill-over; `violations: []`
- **Breach** = constraint cannot be satisfied even at zero allocation; violation emitted and/or error thrown

**Cap Exhaustion Termination Rule** (LOCKED):
> If all cohorts are at their `max_allocation_per_cohort` cap, remaining allocable capacity stays **unallocated**:
> - `violations: []` (not a violation - caps are advisory)
> - Unallocated amount appears as `remaining_capacity > 0` in output
> - **Rationale**: Caps are portfolio construction guardrails, not hard failures. GP can review and adjust caps if needed.

### 5.3 Cohort Handling

| Scenario | Behavior | Rationale |
|----------|----------|-----------|
| No cohorts array (CA-001 style) | [x] **Single implicit cohort** by vintage year | CA-001 outputs `allocations_by_cohort: [{cohort: "2024", ...}]` with no explicit cohorts input |
| Empty cohorts array | [x] **Single implicit cohort** by vintage year | Same as "no cohorts" - vintage year is canonical default |
| Cohort weights sum within 0.1% of 1.0 | [x] **Normalize** to sum=1.0 | More forgiving for emerging managers; avoids rejection for minor rounding |
| Cohort weights sum > 0.1% off from 1.0 | [x] **Error** | Don't normalize garbage - large deviation indicates input error |
| Any weight < 0 | [x] **Error** | Negative weights are invalid |
| Sum of weights <= 0 | [x] **Error** | Would cause division by zero in normalization |
| Missing `vintage_year` | [x] Derive from `timeline.start_date` year | Fallback prevents undefined cohort name |
| User cohort named same as implicit | [x] Use collision-safe internal ID | Prevents identity collisions |

**Weight Validation Rules** (LOCKED):
```typescript
function validateAndNormalizeWeights(weights: number[]): number[] {
  // Rule 1: No negative weights
  if (weights.some(w => w < 0)) {
    throw new Error('Cohort weights cannot be negative');
  }

  const sum = weights.reduce((a, b) => a + b, 0);

  // Rule 2: Sum must be positive
  if (sum <= 0) {
    throw new Error('Sum of cohort weights must be positive');
  }

  // Rule 3: Only normalize if within 0.1% tolerance
  const tolerance = 0.001; // 0.1%
  if (Math.abs(sum - 1.0) > tolerance) {
    throw new Error(`Cohort weights sum to ${sum}, which differs from 1.0 by more than ${tolerance * 100}%`);
  }

  // Normalize to exactly 1.0
  return weights.map(w => w / sum);
}
```

**Implicit Cohort Generation** (with fallback and collision safety):
```typescript
function deriveVintageYear(fund: FundInput, timeline: TimelineInput): number {
  // Primary: explicit vintage_year
  if (fund.vintage_year != null) {
    return fund.vintage_year;
  }
  // Fallback: derive from timeline start date
  if (timeline?.start_date) {
    return parseInt(timeline.start_date.substring(0, 4), 10);
  }
  // Last resort: current year (should not happen in well-formed input)
  return new Date().getUTCFullYear();
}

function getDefaultCohort(fund: FundInput, timeline: TimelineInput): Cohort {
  const year = deriveVintageYear(fund, timeline);
  return {
    name: String(year),                           // Display name: "2024"
    id: `_implicit_${year}`,                      // Internal ID: collision-safe
    start_date: `${year}-01-01`,
    end_date: `${year}-12-31`,
    weight: 1.0
  };
}

// In output adapter: map internal id back to display name
function toCohortOutput(cohort: Cohort): CohortOutput {
  return {
    cohort: cohort.name,  // CA-001 expects "2024", not "_implicit_2024"
    amount: cohort.allocation,
  };
}
```

**Collision Rule**: If user provides a cohort with `id: "2024"` and we generate `_implicit_2024`, they are distinct. User cohorts are never auto-prefixed.

---

## 6. CA-005 (dynamic_ratio) Policy

### 6.1 Decision

[ ] **IMPLEMENT**: Define formula below
[x] **DEFER**: Skip with gate in runner

**Rationale**: CA-005 requires NAV (Net Asset Value) calculation which is:
1. Not defined in the truth case schema (no NAV input field)
2. Requires portfolio valuation logic outside Phase 1 scope
3. Note says "adjusts reserve based on NAV changes" but formula is unspecified
4. Expected `reserve_balance: 5` cannot be derived from inputs without NAV formula

For emerging VC managers, `static_pct` policy is sufficient for Phase 1.
Dynamic ratio can be added in Phase 2 when NAV calculation is defined.

### 6.2 Formula (if implementing)

```
dynamic_ratio = ???
```

NAV calculation: ___
Adjustment frequency: ___
Boundary conditions: ___

### 6.3 Deferral Gate (if deferring)

Add to `runner.test.ts`:
```typescript
it.skip('CA-005: dynamic_ratio requires specification', () => {
  // Deferred per CA-SEMANTIC-LOCK.md Section 6
  // TODO: Implement when dynamic_ratio formula is specified
});
```

---

## 7. Plain CLI Path

Ensure implementation works without slash commands:

```bash
# Run all truth cases
pnpm test -- --project=server

# Run only CA truth cases
pnpm test -- tests/unit/truth-cases/runner.test.ts -t "Capital Allocation"

# Run invariant spec tests
pnpm test -- tests/unit/truth-cases/ca-invariants.test.ts
```

---

## 8. Sign-Off Checklist

All items must be checked before Phase 1 begins:

### Section 1: Conservation Identity
- [x] Conservation model chosen (Cash Ledger / Capacity / Hybrid) → **Hybrid** (dual-ledger)
- [x] Term definitions completed (allocations, reserve_balance, available_capacity, deployed) → Section 1.1.1
- [x] Model-specific invariants selected (with explicit variable naming: unit + semantic) → Section 1.2
- [ ] Spec test created with **non-tautological** assertions (derives totals from independent outputs)
- [ ] At least ONE test with **independently-derivable** expected values (hand-calculated from spec)
- [ ] Spec test passing

### Section 2: Time Boundary Rules
- [x] Timezone rule confirmed (UTC date buckets) → Section 2.0
- [x] Period bounds defined (inclusive/exclusive) → Section 2.1 (`[start, end]` inclusive)
- [x] Quarterly definition specified → Section 2.1 (calendar quarters)
- [x] Boundary date assignment rules documented → Section 2.2
- [x] Rebalance trigger semantics defined → Section 2.3 (calendar-based)
- [ ] Timezone spec test created
- [ ] **ANTI-REGRESSION**: No `new Date('YYYY-MM-DD')` in production code (verified by grep)

### Section 3: Unit Normalization
- [x] Canonical internal representation chosen (integer cents recommended) → Section 3.2
- [x] Field-by-field unit table complete → Section 3.3
- [x] Unit inference rules documented → Section 3.4
- [ ] **Million-scale mismatch detector** implemented (ratio-based, not heuristic)
- [x] Inconsistency trap decision made and documented → Section 3.5 (fail with error)
- [ ] Unit inconsistency spec test created

### Section 4: Determinism Contract
- [x] Rounding rules specified (with tolerance for floating point, never `===`) → Section 4.1 (Bankers)
- [x] Allocation algorithm documented (base, remainder, tie-break) → Section 4.2 (Largest remainder)
- [x] Input ordering rules defined → Section 4.3 (Canonical sort key)
- [x] **Output sorting requirements** documented with EXACT sort keys → Section 4.4
- [ ] **ANTI-REGRESSION**: Output arrays always present (never undefined, always `[]` if empty)
- [ ] Determinism spec test created (10 identical runs)
- [ ] Output ordering + presence spec test created
- [ ] **Rounding spec test**: positive/negative half ties (ensures true bankers + symmetric) - test vectors in Section 4.1
- [ ] **Cohort sort key spec test**: empty `start_date: ""` sorts last; numeric `id: 0` doesn't crash; non-canonical date fails adapter - test vectors in Section 4.3

### Section 5-7: Remaining Sections
- [x] Section 5: All semantic definitions complete → Sections 5.1, 5.2, 5.3
- [x] Section 6: CA-005 decision made (implement or defer with skip gate) → **Deferred** to Phase 2
- [ ] Section 7: Plain CLI commands verified working

### Final Verification
- [ ] All spec tests passing: `pnpm test -- tests/unit/truth-cases/ca-invariants.test.ts`
- [ ] No TODO comments remaining in completed sections
- [ ] Grep for prohibited patterns returns zero matches:
  - `grep -r "new Date\('[0-9]" --include="*.ts" client/ server/` → 0 results
  - `grep -r "Date.parse\('[0-9]" --include="*.ts" client/ server/` → 0 results

**Reviewed by**: _______________
**Date**: _______________
**Approved for Phase 1**: [ ] Yes / [ ] No - requires revisions

**Rejection reasons** (if No):
- _______________

---

## Appendix: Alignment with Existing Code

### A.1 reserves-v11.ts Patterns to Adopt

| Pattern | Location | Adopt for CA |
|---------|----------|--------------|
| Integer cents | Throughout | Yes - internal representation |
| Conservation check | `allocated + remaining ≈ available` | Yes - invariant 1 |
| Stable tie-break | Secondary sort by invested amount | Yes - cohort ordering |
| Cap enforcement | `calculateCap()` | Yes - cohort caps |

### A.2 fund-calc.ts Patterns to Adopt

| Pattern | Location | Adopt for CA |
|---------|----------|--------------|
| Period generation | `generatePeriods()` | Yes - time boundary rules |
| Date arithmetic | ISO string handling | Yes - consistent formatting |

### A.3 ER Adapter Patterns to Adopt

| Pattern | Location | Adopt for CA |
|---------|----------|--------------|
| Category routing | Lines 94-97 | Yes - engine dispatch |
| Tolerance validation | `Math.abs() > tolerance` | Yes - numeric comparison |
| Structured result | `ValidationResult` type | Yes - validation output |

### A.4 Code Reuse Policy (GATE)

**RULE**: BAN code import, ENCOURAGE pattern reuse.

| Source File | Action | Rationale |
|-------------|--------|-----------|
| `reserves-v11.ts` | **DO NOT import** | Contains 24 identified anti-patterns; direct import propagates technical debt |
| `reserves-v11.ts` patterns | **DO study and adapt** | Integer cents, conservation checks, tie-break patterns are sound |
| `fund-calc.ts` | **DO NOT import** | Different domain (waterfall); separate evolution path |
| `fund-calc.ts` patterns | **DO study and adapt** | Period generation, date handling patterns are reusable |

**Implementation Guidance**:
```typescript
// WRONG - imports technical debt
import { calculateReserve } from '@/core/reserves-v11';

// CORRECT - reimplements pattern cleanly
// Pattern from reserves-v11: integer cents for conservation
const commitmentCents = Math.round(commitment * unitScale * 100);
const totalAllocatedCents = cohorts.reduce((sum, c) => sum + c.allocationCents, 0);
```

---

## Appendix B: Phase Dependency Diagram

```
Phase 0 (Foundation)                    Phase 1 (Core Engine)
+--------------------------+            +--------------------------+
| - types.ts               |            | - CapitalAllocationEngine|
| - rounding.ts            |----------->| - allocateLRM.ts         |
| - sorting.ts             |            | - invariants.ts          |
| - units.ts               |            | - adapter.ts             |
| - allocateLRM.ts         |            +--------------------------+
+--------------------------+                        |
                                                    v
                                        Phase 2 (Truth Cases)
                                        +--------------------------+
                                        | - truthCaseRunner.test   |
                                        | - 19/20 pass target      |
                                        | - CA-005 deferred        |
                                        +--------------------------+
                                                    |
                                                    v
                                        Phase 3 (API Integration)
                                        +--------------------------+
                                        | - server/routes/ca.ts    |
                                        | - Phoenix integration    |
                                        | - UI components          |
                                        +--------------------------+
```

**Critical Path**: Phase 0 → Phase 1 → Phase 2 (CURRENT) → Phase 3

**Blocking Dependencies**:
- Phase 1 cannot start until Phase 0 utilities are tested
- Phase 2 cannot pass until BigInt overflow is fixed (DONE)
- Phase 3 cannot start until 19/20 truth cases pass

---

## Appendix C: Execution Approval Checklist

### Pre-Implementation Gate (Before Writing Code)

- [ ] CA-SEMANTIC-LOCK.md read completely
- [ ] Conservation model understood (Hybrid: dual-ledger)
- [ ] Term definitions memorized (allocations vs deployed vs reserve)
- [ ] Rounding rules understood (Banker's for scalars, LRM for allocations)
- [ ] Unit inference rules understood (explicit preferred, fail-fast for ambiguous)

### Per-Feature Gate (Before Marking Complete)

- [ ] All unit tests passing
- [ ] TypeScript compiles with no errors
- [ ] No `any` type usage without explicit comment
- [ ] Conservation invariants verified
- [ ] No `new Date('YYYY-MM-DD')` patterns (grep check)

### Pre-Merge Gate (Before PR Approval)

- [ ] Truth case runner: 19/20 minimum pass rate
- [ ] BigInt overflow tests pass (100M, 1B, 10B funds)
- [ ] Determinism test: 10 identical runs
- [ ] No console.warn in production code paths
- [ ] All TODO comments have linked issue

### Phase Completion Gate

| Phase | Completion Criteria |
|-------|---------------------|
| Phase 0 | All utilities exported, unit tests pass |
| Phase 1 | Engine computes reserve_balance correctly for CA-001/002/003 |
| Phase 2 | 19/20 truth cases pass (CA-005 deferred) |
| Phase 3 | API endpoint returns valid response, UI renders |

**Sign-off Required**: Each phase requires explicit approval before proceeding to next.
