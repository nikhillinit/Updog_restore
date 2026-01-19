---
status: ACTIVE
last_updated: 2026-01-19
---

# Capital Allocation Implementation: Final Strategic Assessment (v6)

**Date**: 2025-12-14
**Status**: APPROVED FOR EXECUTION
**Reviewer**: Architecture & Semantics Lead

---

## Executive Summary

| Metric | Baseline | Final Plan (v6) |
|--------|----------|-----------------|
| **Time Estimate** | 8-12 hours | **60-100 hours** |
| **Phase 0** | Documentation | **Spec Tests & Acceptance Gates** |
| **Model** | Ambiguous Hybrid | **Commitment-Targeted, Cash-Capped** |

**Verdict**: **CONDITIONAL GO**.
Implementation is blocked until **Phase 0 Acceptance Gates** are cleared.

**Constraint**: All implementation decisions must conform to `docs/CA-SEMANTIC-LOCK.md`. If this document conflicts with the Semantic Lock, the Semantic Lock must be updated first--silent divergence is not permitted.

---

## Part A: Phase 0 - The Acceptance Gates (Blocking)

**Constraint**: No production engine code (`src/engine/*.ts`) may be written until these artifacts exist and pass review.

### Gate 1: The Physics of Conservation

**Deliverable**: `docs/CA-SEMANTIC-LOCK.md` & `tests/unit/truth-cases/ca-invariants.test.ts`

We explicitly adopt a **Dual-Ledger Hybrid Model**. The engine must track two separate states with distinct conservation laws.

#### 1.1 The Cash Ledger (Physical Reality)
*The bank account. Tracks actual dollars. Never inferred.*

*   **Formula**: `ending_cash = starting_cash + contributions - distributions - deployed_cash - fees`
    *   *Phase 1: `fees = 0` (deferred to Phase 2)*
*   **Inputs**: `deployed_cash` is an explicit input (default `0` for Phase 1).
*   **Invariant**: `ending_cash` must never be negative.
*   **Constraint**: Planned Allocations (`allocations_by_cohort`) **NEVER** reduce `ending_cash`. Only `deployed_cash` does.

#### 1.2 The Capacity Ledger (Planning State)
*The strategy. Tracks permission to spend.*

*   **Model**: **Commitment-Targeted, Cash-Capped**.
    *   *We target the full Remaining Commitment, but we are physically constrained by Available Cash.*
*   **Definitions**:
    *   `commitment_remaining = commitment - sum(deployed_cash_by_cohort)` (Unused commitment available for planning)
*   **Formula**:
    ```typescript
    plan_capacity = commitment_remaining           // What we WANT to deploy
    deployable_ceiling = max(0, ending_cash - min_buffer)  // What we CAN deploy now
    allocable_capacity = min(plan_capacity, deployable_ceiling)
    ```
*   **Invariant**: `sum(allocations_by_cohort where type='deployed') <= deployable_ceiling`
*   **Output Distinction**:
    *   `allocations_by_cohort` (type='planned'): Long-horizon plan, capped by `plan_capacity`
    *   `allocations_by_cohort` (type='deployed'): Actual outflows, capped by `deployable_ceiling`

#### 1.3 Flow Semantics (Recycling & Recall)

| Flow Type | Cash Effect | Capacity Effect |
|-----------|-------------|-----------------|
| Contribution (>0) | +cash | None |
| Distribution (>0, recycle=false) | -cash | None |
| Distribution (>0, recycle=true) | -cash | `+commitment_remaining` by recycle amount |
| Distribution (<0, capital recall) | +cash | `+commitment_remaining` (can redeploy recalled capital) |

**Sign Convention**:
- Contributions: Always positive (inflow from LPs)
- Distributions: Positive = outflow to LPs; Negative = capital recall
- Deployed: Always positive (outflow to portfolio)

**Phase 1 Scope**: `recycle_eligible` defaults to `false`. Full recycling logic deferred to Phase 2.

---

### Gate 2: The Enforcement Matrix

**Deliverable**: `docs/CA-ENFORCEMENT.md`

This document must map every constraint to a specific engine behavior. **Each row requires a unit test case.**

| Constraint | Violation | Severity | Enforced? | Binding (success) | Breach (failure) |
|------------|-----------|----------|-----------|-------------------|------------------|
| **Min Cash Buffer** | `buffer_breach` | Warning | **YES** | `violations: []` (silently capped) | `['buffer_breach']` if uncurable even at zero allocation |
| **Cohort Cap** | `cap_exceeded` | Warning | **YES** | `violations: []` (silently clipped & spilled) | N/A (always satisfiable) |
| **Over Allocation** | `over_allocation` | Error | **YES** | `violations: []` (pro-rata clip) | N/A (always satisfiable) |
| **Negative Capacity** | `negative_capacity` | Error | **YES** | N/A | `['negative_capacity']` + throw |
| **Cash Balance** | `negative_cash` | Error | **YES** | N/A | `['negative_cash']` + throw |

**Key distinction**:
- **Binding** = constraint was satisfied by clipping; no violation emitted
- **Breach** = constraint cannot be satisfied; violation emitted and/or error thrown

---

### Gate 3: The Determinism Contract

**Deliverable**: `docs/CA-DETERMINISM.md`

To ensure `allocations` are identical across all runs, we enforce strict ordering and math rules.

#### 3.1 Canonical Cohort Sort Key
*The engine must sort the input list before processing. Input array order is ignored.*

```typescript
function cohortSortKey(c: Cohort): [string, string] {
  return [
    c.start_date ?? '9999-12-31',              // ISO8601 string, missing = far future
    (c.id ?? c.name ?? '').toLowerCase()       // Case-insensitive secondary key
  ];
}
```

1.  **Primary**: `start_date` (Ascending, ISO8601 string compare).
    *   *Null Handling*: Treat missing dates as `'9999-12-31'` (end of line).
2.  **Secondary**: `id` or `name` (Ascending, case-insensitive string compare).

#### 3.2 Rounding & Precision
*   **Internal Math**: Integer Cents (JS safe integer with `Number.isSafeInteger` assertion).
*   **Rounding Rule**: Symmetric Half-Away-From-Zero (`Math.sign(x) * Math.round(Math.abs(x))`).
*   **Allocation Remainder**: **Largest Remainder Method**.
    *   *Tie-break (equal fractional remainders)*: First cohort in Canonical Sort order.
    *   *Enforced by*: CA-018

---

### Gate 4: Architecture & Scale

**Deliverable**: `docs/ADR-001-CA-ARCHITECTURE.md`

*   **Isolation**: Confirm `capital-allocation-engine` is a new module.
*   **Reserves-v11 Policy**:
    *   **BANNED**: Importing code/functions from `reserves-v11.ts` (it is company-level logic).
    *   **ENCOURAGED**: Reusing patterns (e.g., integer cent math, conservation check patterns).
*   **Unit Blindness**: The Engine operates solely on **Normalized Integer Cents**.
    *   *The Adapter* is responsible for scaling inputs (detecting "millions" vs "raw dollars").
    *   *The Engine* throws an error if inputs are not safe integers.

---

## Part B: Implementation Plan (Case-First)

### Dependency Graph
```text
Phase 0 (Gates 1-4) ---blocks---> Phase 1 (Prove Physics)
                                        |
                                        v
                                 Phase 2 (Logic Engine)
                                        |
                                        v
                                 Phase 3 (Integration)
```

### Phase 1: Prove The Physics (15-20h)

**Goal**: Pass Gate 1 & 2 Spec Tests. No full adapter yet.

1.  **Scaffold**: Create `capital-allocation-engine.ts`.
2.  **Test Cash Physics**: Implement CA-003 (Distributions). Verify `reserve_balance` drops, but `allocations` are unaffected.
3.  **Test Capacity Physics**: Implement CA-004 (Buffer Breach). Verify `allocations` are reduced to preserve the buffer.

### Phase 2: The Logic Engine (35-45h)

1.  **Implement Pacing**: Time-series calculations.
2.  **Implement Spill-Over**: CA-014/015 using the **Canonical Sort Key**.
3.  **Implement Rounding**: CA-018 using **Largest Remainder Method**.
4.  **Implement Recycling**: CA-007/CA-020 (if in scope).

### Phase 3: Integration (15-20h)

1.  **Full Adapter**: Wire up the Truth Case JSON to the Engine.
2.  **Regression**: Run all truth cases.

---

## Truth Case Coverage Matrix

| Locked Decision | Enforcing Case | What It Validates |
|-----------------|----------------|-------------------|
| Largest remainder | CA-018 | Dust goes to cohort C (largest fractional), not first |
| Cap spill-over | CA-014, CA-015 | Excess spills to next cohort in sort order |
| Capital recall | CA-019 | Negative distribution handling |
| Recycling | CA-007, CA-020 | `recycle_eligible` restores `commitment_remaining` |
| Buffer precedence | CA-013 | Buffer constraint binds before pacing targets |
| Sort determinism | CA-018 | Input array order ignored; canonical sort applied |

---

## Reconciliation with CA-SEMANTIC-LOCK.md

| Decision | Semantic Lock (current) | This Document | Action Required |
|----------|-------------------------|---------------|-----------------|
| Remainder handling | Largest remainder | Largest remainder | ALIGNED |
| Sort key | By cohort name (alpha) | By start_date, then id | **UPDATE LOCK** |
| Capacity model | Simple Hybrid | Cash-capped Hybrid | **UPDATE LOCK** |
| Fees | Not mentioned | `fees = 0` explicit | **UPDATE LOCK** |
| Recycling | Not mentioned | Deferred, defaults false | **UPDATE LOCK** |
| Binding vs breach | Not mentioned | Explicit distinction | **UPDATE LOCK** |

---

## Execution Approval Checklist

**Do not proceed to Phase 1 Code until all are checked:**

- [ ] `docs/CA-SEMANTIC-LOCK.md`: All decision checkboxes filled & reconciled with this doc
- [ ] `tests/unit/truth-cases/ca-invariants.test.ts`: All spec tests passing
- [ ] `docs/CA-ENFORCEMENT.md`: All constraints mapped with binding/breach behaviors
- [ ] `docs/ADR-001-CA-ARCHITECTURE.md`: Approved by tech lead
- [ ] **Conflict Check**: No divergence between `CA-SEMANTIC-LOCK` and this plan
- [ ] **Truth Case Mapping**: Each locked decision traced to enforcing test case

---

## Future Enhancements (Phase 2+)

- Management fee integration (`fees != 0`)
- Full recycling logic (`recycle_eligible = true` handling)
- Event-based rebalance triggers (for high-volume funds)
- Configurable spill-over policy (pro-rata option)
