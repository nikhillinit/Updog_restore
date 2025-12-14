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

### 1.2 Reference Invariants (Machine-Testable)

These equations MUST hold for all valid states:

```typescript
// INVARIANT 1: Ledger Conservation
// Must hold at end of every period
assert(
  starting_cash + sum(contributions) - sum(distributions) - sum(allocations) === ending_reserve_balance,
  "Conservation violation"
);

// INVARIANT 2: Buffer Constraint
// Hard constraint vs soft warning?
assert(reserve_balance >= min_cash_buffer, "Buffer breach");
// Decision: [ ] Hard (fail) / [ ] Soft (warning + violation flag)

// INVARIANT 3: Allocation Cap
assert(sum(allocations) <= available_capacity, "Over-allocation");

// INVARIANT 4: Non-negativity
assert(reserve_balance >= 0, "Negative reserve");
assert(allocations.every(a => a.amount >= 0), "Negative allocation");
// Exception: CA-019 allows negative distributions (capital recall)
```

### 1.3 Spec Test Requirement

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

    // Conservation check
    const expected_reserve = 0 + 50 + 50 - 20 - result.total_allocated;
    expect(result.reserve_balance).toBe(expected_reserve);
  });
});
```

---

## 2. Time Boundary Rules

### 2.1 Period Definition

| Rule | Decision | Example |
|------|----------|---------|
| Period bounds | [ ] `[start, end]` inclusive / [ ] `[start, end)` exclusive | Q1 = Jan 1 to Mar 31 vs Jan 1 to Apr 1 |
| Quarterly definition | [ ] Calendar quarters / [ ] Rolling 3-month | Q1 = Jan-Mar vs "3 months from start" |
| Period start time | [ ] 00:00:00.000 / [ ] Other | Consistent with fund-calc.ts |
| Period end time | [ ] 23:59:59.999 / [ ] 00:00:00.000 next day | Consistent with fund-calc.ts |

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

### 3.4 Inconsistency Trap

If a truth case has inconsistent scales (e.g., commitment in $M but buffer in raw dollars):

**DECISION**: [ ] Fail with error / [ ] Warn and proceed / [ ] Auto-correct with log

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

### 4.3 Ordering Rules

| Scenario | Deterministic Order |
|----------|---------------------|
| Multiple flows on same date | [ ] By flow type (contrib > distrib) / [ ] By flow ID / [ ] By amount (descending) |
| Multiple cohorts eligible | [ ] By cohort name (alpha) / [ ] By cohort start date / [ ] By cohort weight (descending) |
| Cap spill-over (CA-015) | Excess goes to: [ ] Next cohort in order / [ ] Reserve / [ ] Pro-rata to remaining |

### 4.4 Spec Test: Determinism Verification

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

- [ ] Section 1: Conservation model chosen and documented
- [ ] Section 1.3: Spec test created and passing
- [ ] Section 2: All time boundary rules defined
- [ ] Section 3: Unit table complete, inference rules documented
- [ ] Section 4: Rounding and ordering rules specified
- [ ] Section 4.4: Determinism spec test created
- [ ] Section 5: All semantic definitions complete
- [ ] Section 6: CA-005 decision made (implement or defer)
- [ ] Section 7: Plain CLI commands verified working

**Reviewed by**: _______________
**Date**: _______________
**Approved for Phase 1**: [ ] Yes / [ ] No - requires revisions

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
