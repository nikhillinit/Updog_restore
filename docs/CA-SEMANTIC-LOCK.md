# Capital Allocation Semantic Lock

**Status**: TEMPLATE - Requires completion before Phase 1 implementation
**Gate**: Implementation MUST NOT begin until all sections are completed and reviewed

---

## 1. Conservation Identity (MANDATORY)

### 1.1 Choose ONE Conservation Model

| Model | Formula | Use When |
|-------|---------|----------|
| **Cash Ledger** | `starting_cash + contributions - distributions - allocations = ending_reserve_balance` | reserve_balance represents actual cash |
| **Commitment Capacity** | `commitment = reserved_capacity + allocable_capacity + deployed` | reserve_balance represents budgeted capacity |
| **Hybrid** | `reserve_balance` is cash; `allocations_by_cohort` is planned capacity | Mixed semantics |

**DECISION**: [ ] Cash Ledger / [ ] Commitment Capacity / [ ] Hybrid

**Rationale**: _[Document why this model was chosen]_

### 1.1.1 Term Definitions (MANDATORY)

**CRITICAL**: These definitions are referenced by invariants and tests. Ambiguity here propagates everywhere.

| Term | Definition | Represented By |
|------|------------|----------------|
| `allocations` | [ ] Cash deployed into portfolio / [ ] Cash moved to reserves / [ ] Planned capacity / [ ] Cohort allocations (not cash outflow) | Output field(s): ___ |
| `reserve_balance` | [ ] Actual cash on hand / [ ] Reserved commitment capacity / [ ] Hybrid: ___ | Output field: `reserve_balance` |
| `available_capacity` | Formula: ___ (e.g., `commitment - deployed - reserved`) | Derived from: ___ |
| `deployed` | [ ] Cumulative cash outflows / [ ] Cumulative allocated amounts | Tracked in: ___ |

### 1.2 Model-Specific Invariants (Machine-Testable)

**Select the invariants matching your chosen model in 1.1:**

#### Invariant Set A: Cash Ledger Model

```typescript
// INVARIANT 1A: Cash Conservation (Cash Ledger only)
// Must hold at end of every period
const total_allocated = sum(result.allocations_by_cohort.map(c => c.amount));
assert(
  starting_cash + sum(contributions) - sum(distributions) - total_allocated === result.reserve_balance,
  "Cash conservation violation"
);
```

#### Invariant Set B: Commitment Capacity Model

```typescript
// INVARIANT 1B: Capacity Conservation (Commitment Capacity only)
assert(
  commitment === reserved_capacity + allocable_capacity + deployed,
  "Capacity conservation violation"
);

// Where:
// - reserved_capacity = reserve_balance (in capacity model)
// - allocable_capacity = sum(allocations_by_cohort) that are "planned"
// - deployed = cumulative actual deployments
```

#### Invariant Set C: Hybrid Model

```typescript
// INVARIANT 1C-i: Cash component (Hybrid)
assert(
  starting_cash + sum(contributions) - sum(distributions) - sum(cash_outflows) === result.reserve_balance,
  "Cash component violation"
);

// INVARIANT 1C-ii: Capacity component (Hybrid)
assert(
  commitment === sum(result.allocations_by_cohort.map(c => c.amount)) + remaining_capacity,
  "Capacity component violation"
);
```

#### Common Invariants (All Models)

```typescript
// INVARIANT 2: Buffer Constraint
assert(reserve_balance >= min_cash_buffer, "Buffer breach");
// Decision: [ ] Hard (fail) / [ ] Soft (warning + violation flag)

// INVARIANT 3: Allocation Cap
const total_allocated = sum(result.allocations_by_cohort.map(c => c.amount));
assert(total_allocated <= available_capacity, "Over-allocation");

// INVARIANT 4: Non-negativity
assert(reserve_balance >= 0, "Negative reserve");
assert(result.allocations_by_cohort.every(a => a.amount >= 0), "Negative allocation");
// Exception: CA-019 allows negative distributions (capital recall)
```

### 1.3 Spec Test Requirement

**CRITICAL**: Invariant tests MUST compute totals from **independent outputs** (e.g., sum of arrays), NOT from a `total_*` scalar emitted by the same function. Self-referential tests are tautological.

Create `tests/unit/truth-cases/ca-invariants.test.ts` with:

```typescript
describe('CA Conservation Invariants', () => {
  it('micro-ledger: 2 contributions + 1 distribution conserves', () => {
    const input = {
      starting_cash: 0,
      contributions: [{ date: '2024-03-31', amount: 50 }, { date: '2024-06-30', amount: 50 }],
      distributions: [{ date: '2024-09-30', amount: 20 }],
      target_reserve_pct: 0.2,
    };
    const result = calculateReserve(input);

    // CORRECT: Derive total_allocated from INDEPENDENT output array
    const total_allocated = result.allocations_by_cohort.reduce(
      (sum, cohort) => sum + cohort.amount,
      0
    );

    // Conservation check using derived value
    const expected_reserve = 0 + 50 + 50 - 20 - total_allocated;
    expect(result.reserve_balance).toBe(expected_reserve);

    // ALSO assert the allocation itself matches expected behavior
    // (This prevents the function from "making up" both values consistently)
    expect(total_allocated).toBe(64); // 80% of (100 - 20) based on target_reserve_pct
  });

  it('conservation holds across multiple periods', () => {
    // Test that running balance + allocations = inputs at each checkpoint
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

```typescript
// CORRECT: UTC parsing
const date = new Date('2024-03-31T00:00:00.000Z');

// WRONG: Local time parsing (nondeterministic across timezones)
const date = new Date('2024-03-31'); // Behavior varies by system timezone
```

**Spec test (timezone boundary)**:
```typescript
it('boundary date assignment is timezone-independent', () => {
  // This test would fail if local time parsing is used in certain timezones
  const flow = { date: '2024-03-31', amount: 100 };
  const q1End = '2024-03-31';

  // Flow on Q1 end date should consistently belong to Q1 (or Q2, per decision)
  const assignment = assignFlowToPeriod(flow, q1End);
  expect(assignment.period).toBe('Q1'); // Or 'Q2' - but deterministic
});
```

### 2.1 Period Definition

| Rule | Decision | Example |
|------|----------|---------|
| Period bounds | [ ] `[start, end]` inclusive / [ ] `[start, end)` exclusive | Q1 = Jan 1 to Mar 31 vs Jan 1 to Apr 1 |
| Quarterly definition | [ ] Calendar quarters / [ ] Rolling 3-month | Q1 = Jan-Mar vs "3 months from start" |
| Period start time | [ ] 00:00:00.000Z (UTC) / [ ] Other | Consistent with fund-calc.ts |
| Period end time | [ ] 23:59:59.999Z (UTC) / [ ] 00:00:00.000Z next day | Consistent with fund-calc.ts |

### 2.2 Boundary Date Assignment

When a flow occurs on a period boundary date:

| Scenario | Decision |
|----------|----------|
| Flow on period end date | [ ] Belongs to ending period / [ ] Belongs to next period |
| Flow on period start date | [ ] Belongs to starting period / [ ] Belongs to previous period |
| Multiple flows same date | Processing order: [ ] Contributions first / [ ] Distributions first / [ ] Chronological by timestamp / [ ] Stable sort by ID |

### 2.3 Rebalance Trigger

| Trigger Type | Decision |
|--------------|----------|
| Calendar-based | [ ] Every period end / [ ] Specific dates |
| Event-based | [ ] After each flow / [ ] After net flow exceeds threshold |
| Hybrid | [ ] Calendar + event |

**rebalance_frequency mapping**:
- `"quarterly"`: _[Define exact behavior]_
- `"monthly"`: _[Define exact behavior]_
- `"annual"`: _[Define exact behavior]_

---

## 3. Unit + Precision Table

### 3.1 Canonical Internal Representation

**DECISION**: [ ] Integer cents / [ ] Decimal dollars (2 places) / [ ] Decimal dollars (4 places)

**Rationale**: Integer cents recommended for determinism (matches reserves-v11 pattern)

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

### 3.4 Cross-Field Sanity Check (MANDATORY)

**CRITICAL**: Heuristic inference can silently mis-scale edge cases. Add a sanity check.

After inferring scale from commitment, verify other fields are consistent:

```typescript
function validateUnitConsistency(input: TruthCaseInput, inferredScale: number): void {
  const commitment_scaled = input.fund.commitment * inferredScale;

  // Check each monetary field is in plausible range relative to commitment
  const checkField = (value: number, fieldName: string) => {
    const value_scaled = value * inferredScale;

    // If field is > 10x commitment or commitment is > 1000x field, likely inconsistent
    if (value_scaled > commitment_scaled * 10 || commitment_scaled > value_scaled * 1000) {
      // This catches: commitment=100 ($M) but buffer=1000000 (raw dollars)
      throw new Error(
        `Unit inconsistency detected: ${fieldName}=${value} appears inconsistent with commitment=${input.fund.commitment} at scale=${inferredScale}`
      );
    }
  };

  // Check all monetary fields
  checkField(input.constraints.min_cash_buffer, 'min_cash_buffer');
  input.flows.contributions.forEach((c, i) => checkField(c.amount, `contributions[${i}].amount`));
  input.flows.distributions.forEach((d, i) => checkField(d.amount, `distributions[${i}].amount`));
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

**DECISION**: [ ] Fail with error (recommended) / [ ] Warn and proceed / [ ] Auto-correct with log

---

## 4. Determinism Contract

### 4.1 Rounding Rules

| Context | Rounding Method | Precision |
|---------|-----------------|-----------|
| Intermediate calculations | [ ] Bankers / [ ] Half-up / [ ] Truncate | Full precision (no rounding) |
| Final allocation amounts | [ ] Bankers / [ ] Half-up | [ ] Cents / [ ] Dollars |
| Percentage calculations | [ ] Bankers / [ ] Half-up | 4 decimal places |
| When rounding occurs | [ ] Per-event / [ ] End-of-period only | |

**Alignment with runner**: Use same approach as `assertNumericField()` in helpers.ts

### 4.2 Allocation Algorithm

When allocating to multiple cohorts:

| Step | Rule |
|------|------|
| 1. Base allocation | Pro-rata by cohort weight |
| 2. Remainder handling | [ ] Largest remainder method / [ ] First cohort / [ ] Last cohort |
| 3. Tie-break (equal remainders) | [ ] Stable sort by cohort name / [ ] By cohort index / [ ] By cohort start date |

### 4.3 Ordering Rules (Input Processing)

| Scenario | Deterministic Order |
|----------|---------------------|
| Multiple flows on same date | [ ] By flow type (contrib > distrib) / [ ] By flow ID / [ ] By amount (descending) |
| Multiple cohorts eligible | [ ] By cohort name (alpha) / [ ] By cohort start date / [ ] By cohort weight (descending) |
| Cap spill-over (CA-015) | Excess goes to: [ ] Next cohort in order / [ ] Reserve / [ ] Pro-rata to remaining |

### 4.4 Output Sorting Requirements (MANDATORY)

**CRITICAL**: Even if computation is deterministic, output arrays can become nondeterministic due to:
- Object key iteration order
- Map iteration order
- Insertion order dependent on input ordering
- Unstable sorts

**All output arrays MUST be sorted by explicit keys:**

| Output Array | Sort Key | Order |
|--------------|----------|-------|
| `reserve_balance_over_time[]` | `date` | Ascending (earliest first) |
| `allocations_by_cohort[]` | `cohort` identifier (name or start_date) | Ascending (alphabetical or chronological) |
| `pacing_targets_by_period[]` | `period` | Ascending (earliest first) |
| `violations[]` | `(severity, type, period, cohort)` | Severity desc, then stable sort by type/period/cohort |

**Implementation requirement**:
```typescript
// ALWAYS sort output arrays before returning
function formatOutput(result: InternalResult): TruthCaseOutput {
  return {
    reserve_balance: result.reserve_balance,
    allocations_by_cohort: result.allocations
      .sort((a, b) => a.cohort.localeCompare(b.cohort)), // Deterministic sort
    violations: result.violations
      .sort((a, b) => b.severity - a.severity || a.type.localeCompare(b.type)),
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
| `reserve_balance` | [ ] Cash on hand / [ ] Reserved commitment capacity / [ ] Other: ___ | [ ] Cash / [ ] Capacity |
| `allocations_by_cohort[].amount` | [ ] Actual deployed cash / [ ] Planned allocation / [ ] Committed capacity | [ ] Cash / [ ] Plan |
| `violations[]` | Conditions that trigger a violation entry | See 5.2 |

### 5.2 Violation Conditions

| Violation Type | Trigger Condition | Severity |
|----------------|-------------------|----------|
| `buffer_breach` | `reserve_balance < min_cash_buffer` | [ ] Error / [ ] Warning |
| `over_allocation` | `sum(allocations) > available` | [ ] Error / [ ] Warning |
| `cap_exceeded` | `cohort_allocation > cohort_cap` | [ ] Error / [ ] Warning |
| `negative_balance` | `reserve_balance < 0` | [ ] Error / [ ] Warning |

### 5.3 Cohort Handling

| Scenario | Behavior |
|----------|----------|
| No cohorts array (CA-001 style) | [ ] Single implicit "default" cohort / [ ] Error |
| Empty cohorts array | [ ] Single implicit cohort / [ ] Zero allocation / [ ] Error |
| Cohort weights don't sum to 1.0 | [ ] Normalize / [ ] Error / [ ] Warn and proceed |

---

## 6. CA-005 (dynamic_ratio) Policy

### 6.1 Decision

[ ] **IMPLEMENT**: Define formula below
[ ] **DEFER**: Skip with gate in runner (recommended if formula unclear)

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
- [ ] Conservation model chosen (Cash Ledger / Capacity / Hybrid)
- [ ] Term definitions completed (allocations, reserve_balance, available_capacity, deployed)
- [ ] Model-specific invariants selected
- [ ] Spec test created with **non-tautological** assertions (derives totals from independent outputs)
- [ ] Spec test passing

### Section 2: Time Boundary Rules
- [ ] Timezone rule confirmed (UTC date buckets)
- [ ] Period bounds defined (inclusive/exclusive)
- [ ] Quarterly definition specified
- [ ] Boundary date assignment rules documented
- [ ] Rebalance trigger semantics defined
- [ ] Timezone spec test created

### Section 3: Unit Normalization
- [ ] Canonical internal representation chosen (integer cents recommended)
- [ ] Field-by-field unit table complete
- [ ] Unit inference rules documented
- [ ] **Cross-field sanity check** implemented
- [ ] Inconsistency trap decision made and documented
- [ ] Unit inconsistency spec test created

### Section 4: Determinism Contract
- [ ] Rounding rules specified
- [ ] Allocation algorithm documented (base, remainder, tie-break)
- [ ] Input ordering rules defined
- [ ] **Output sorting requirements** documented for all arrays
- [ ] Determinism spec test created (10 identical runs)
- [ ] Output ordering spec test created

### Section 5-7: Remaining Sections
- [ ] Section 5: All semantic definitions complete
- [ ] Section 6: CA-005 decision made (implement or defer with skip gate)
- [ ] Section 7: Plain CLI commands verified working

### Final Verification
- [ ] All spec tests passing: `pnpm test -- tests/unit/truth-cases/ca-invariants.test.ts`
- [ ] No TODO comments remaining in completed sections

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
