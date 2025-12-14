# Capital Allocation Implementation: Refined Critical Evaluation (v2)

> **SUPERSEDED**: This document has been superseded by:
> - `CA-IMPLEMENTATION-EVALUATION-FINAL.md` (v6) - Current strategic assessment
> - `docs/CA-SEMANTIC-LOCK.md` - Authoritative specification with all decisions locked
>
> This file is retained for historical reference only. Do not use for implementation decisions.

**Date**: 2025-12-14
**Status**: SUPERSEDED (see banner above)
**Reviewer**: Claude Code Analysis

---

## Executive Summary

| Metric | Original Plan | External Analysis | Initial Refined | **Final Refined** |
|--------|---------------|-------------------|-----------------|-------------------|
| **Time Estimate** | 8-12 hours | 340-500 hours | 30-48 hours | **60-100 hours** |
| **Multiplier** | 1x (baseline) | 34-50x | 3-4x | **6-10x** |
| **Recommendation** | Proceed | NO-GO | CONDITIONAL GO | **CONDITIONAL GO** |
| **Fund-level primitives** | Assumed | Missing | Assumed reusable | **Must be built** |

**Revised Verdict**: The external analysis still overestimates (~3-5x too high) but my initial refinement underestimated by ~2x due to incorrect assumption about reusable fund-level primitives. A 60-100 hour estimate (4-6 week sprint) is more realistic.

**Main Risk (v3 insight)**: Not engineering difficulty - **semantic ambiguity** and **determinism** (units/rounding/time boundaries). Phase 0 acceptance gates are the primary risk reducers.

---

## Part A: Claims Confirmed by Additional Review

### CONFIRMED 1: Runner infrastructure exists

The unified runner at `tests/unit/truth-cases/runner.test.ts`:
- Imports CA truth-case JSON (line 63)
- Has "Capital Allocation (Load Only)" suite with `it.skip()` gate (lines 335-347)
- Framework is production-ready; CA execution intentionally deferred

### CONFIRMED 2: Exit Recycling is fully implemented

The adapter at `tests/unit/truth-cases/exit-recycling-adapter.ts`:
- Maps truth-case inputs to production `calculateExitRecycling()`
- Full validation with structured validator
- Runner actively executes all 20 ER cases (lines 350-392)

### CONFIRMED 3: CA truth case complexity is real

The CA truth cases at `docs/capital-allocation.truth-cases.json` genuinely contain:
- `dynamic_ratio` policy (CA-005) - undefined semantics
- Unit variance: `CA-001` uses `100`, `CA-007` uses `100000000`
- Schema variance: simple `reserve_balance` vs time-series `reserve_balance_over_time[]`
- 4 categories requiring different engines: `reserve_engine`, `pacing_engine`, `cohort_engine`, `integration`

---

## Part B: Corrections to My Initial Refinement

### CORRECTION 1: "Core math exists; build thin wrappers" was WRONG

**My original claim**: Production code in `reserves-v11.ts` provides reusable math.

**Reviewer's correction**: `reserves-v11.ts` is **company-level**, not fund-level.

**Evidence verified** (`client/src/lib/reserves-v11.ts`):
```typescript
// Takes companies and ranks by MOIC - COMPANY-LEVEL
function calculateCap(company: Company, config: ReservesConfig): number {
  // Allocates reserves TO individual companies by exit_moic_bps ranking
}
```

**CA truth cases require** (`docs/capital-allocation.truth-cases.json`):
```json
// Fund-level ledger with timeline and flows - DIFFERENT DOMAIN
"inputs": {
  "fund": { "commitment": 100, "target_reserve_pct": 0.2 },
  "timeline": { "start_date": "2024-01-01", "end_date": "2024-12-31" },
  "flows": { "contributions": [...], "distributions": [...] },
  "constraints": { "min_cash_buffer": 1, "rebalance_frequency": "quarterly" }
}
```

**Additional verification**: Checked `fund-calc.ts` and `capital-first.ts`:
- `fund-calc.ts`: Period simulation for company deployment (deployCompanies, simulatePeriods)
- `capital-first.ts`: Portfolio construction by stage allocation (preseed/seed/seriesA)
- **Neither** provides fund-level reserve ledger, pacing targets, or cohort allocation semantics

**Impact**: CA requires genuinely new fund-level calculation module, not wrappers.

---

### CORRECTION 2: "35-40% overlap" specifics were overstated

**My original claims**:
- "Schema structure identical"
- "Both use assertNumericField helper"

**Reviewer's corrections verified**:

| Claim | Reality |
|-------|---------|
| ER uses `assertNumericField` | FALSE: Uses `Math.abs(...) > tolerance` (lines 202, 216, 243) |
| CA schema matches ER | FALSE: CA has deeper nesting (fund/timeline/flows/constraints/cohorts) |

**ER truth case structure**:
```typescript
{ id, category, input, expectedOutput, tolerance, tags }
```

**CA truth case structure**:
```json
{
  "id": "CA-001",
  "module": "CapitalAllocation",
  "category": "reserve_engine",
  "inputs": {
    "fund": { ... },
    "timeline": { ... },
    "flows": { "contributions": [...], "distributions": [...] },
    "constraints": { ... }
  },
  "expected": { ... },
  "schemaVersion": "1.0.0"
}
```

**Revised overlap assessment**:
- Pattern reuse (category routing, adapter skeleton, runner integration): ~25-30%
- Numeric validation: Different approaches, limited reuse
- Schema mapping: Significantly more complex, ~15% reuse

**Revised total**: ~20-25% structural overlap (not 35-40%)

---

### CORRECTION 3: Unit normalization is incomplete

**My original heuristic**:
```typescript
if (commitment < 1000) commitment *= 1_000_000
```

**Reviewer's correction**: This only addresses `commitment`, but **all monetary fields** have mixed scales:

| Field | Small-scale (CA-001) | Large-scale (CA-007) |
|-------|---------------------|---------------------|
| commitment | 100 | 100000000 |
| contribution amounts | 5, 5, 5, 5 | 10000000, 2000000 |
| min_cash_buffer | 1 | 1000000 |
| expected reserve_balance | 20 | 20000000 |

**Required mitigation**: Normalize ALL monetary fields uniformly:
- Option A: Add explicit `unit` field to schema
- Option B: Detect scale from commitment, apply to all monetary fields
- Option C: Standardize truth cases to single unit (breaking change)

---

### CORRECTION 4: Estimate math mixed effort-hours with calendar time

**My original statement**:
> "73.5h rounds to ~48h with parallel execution"

**Reviewer's correction**: Parallel execution reduces calendar time, not labor hours. Unless multiple engineers work in parallel, effort remains ~73h.

**Corrected calculation**:
```
Single-engineer effort: 60-100 hours
Calendar time (1 FTE): 2-3 weeks full-time, or 4-6 weeks part-time
```

---

## Part C: Updated Risk Assessment

### New risks identified by reviewer

#### Risk 1: Unstated semantics in CA truth cases

Beyond `dynamic_ratio`, the cases embed decisions that must be formalized:

| Semantic | Question | Truth Case Reference |
|----------|----------|---------------------|
| `reserve_balance` | Cash-on-hand or reserved commitment capacity? | CA-001 expected: 20 |
| `rebalance_frequency` | When does rebalancing trigger? | CA-001 constraints |
| Missing `cohorts` | What if cohorts array not present? | CA-001 (no cohorts) vs CA-007 (with cohorts) |
| Allocation precedence | Reserve-first or pacing-first? | Not documented |

**Mitigation**: Add "semantic lock" step (4-6h) to document decisions before coding.

#### Risk 2: No fund-level engine exists

Verified by checking all candidate files:
- `reserves-v11.ts`: Company-level MOIC ranking
- `fund-calc.ts`: Period simulation for company deployment
- `capital-first.ts`: Portfolio stage allocation
- `capital-allocation-calculations.ts`: Exists but different domain

**Mitigation**: Plan for new `capital-allocation-engine.ts` (or equivalent) built truth-case-first.

---

## Part D: Revised Estimate

### Updated methodology

1. **ER Adapter baseline**: 455 lines, 20 cases, 4 categories → ~40-60h effort
2. **CA scope multiplier**: 3 engines + deeper schema + new calculation module → 2.5x ER
3. **Pattern reuse discount**: 20-25% (revised down from 35-40%) → -20%
4. **No fund-level primitives surcharge**: New calculation module required → +30%
5. **Semantic lock overhead**: Formalizing unstated decisions → +6h

### Calculation

```
Base: ER effort × CA multiplier = 50h × 2.5 = 125h (gross)
Pattern discount: -20% = 125h × 0.8 = 100h
Primitives surcharge: +30% = 100h × 1.3 = 130h
Semantic lock: +6h = 136h

Apply optimism correction (engineering estimates typically 1.5x actual):
Conservative range: 136h ÷ 1.5 = 91h (optimistic floor)
With contingency: 91h × 1.1 = 100h (pessimistic ceiling)

Final range: 60-100 hours
```

**Note**: Lower bound (60h) assumes skilled engineer with full context. Upper bound (100h) accounts for onboarding, debugging, and iteration.

---

## Part E: Revised Recommendation

### CONDITIONAL GO (conditions tightened - v3)

**CRITICAL**: Phase 0 is an **acceptance gate**, not a documentation task. Implementation MUST NOT begin until all gates pass.

---

### Gate 1: Semantic Lock (Acceptance Gate, 6-8h)

The semantic lock is the **primary risk reducer**. CA truth cases encode policy, not just inputs/outputs. They include multiple engines, mixed temporal cadences, explicit rounding behavior (CA-018), capital recalls (CA-019), and recycling semantics (CA-020).

**CRITICAL (v4)**: A doc-only gate is easy to "declare done" while leaving ambiguity. The semantic lock must be **machine-testable**.

**Required deliverables**:

1. **`docs/CA-SEMANTIC-LOCK.md`** - Complete template (see `docs/CA-SEMANTIC-LOCK.md`)
2. **`tests/unit/truth-cases/ca-invariants.test.ts`** - Spec tests encoding semantic decisions

#### 1.1 Conservation Law (MANDATORY + MACHINE-TESTABLE)

Define ONE conserved quantity and reconcile each case against it:

| Conservation Model | Formula | Applies To |
|-------------------|---------|------------|
| Cash ledger | `beginning_cash + net_flows - allocations = ending_reserve_balance` | CA-001 to CA-006 |
| Commitment capacity | `commitment = reserved_capacity + allocable_capacity + deployed` | CA-007 to CA-012 |
| Hybrid | `reserve_balance` is cash, `allocations_by_cohort` is planned capacity | TBD |

**Gate requirement**: Explicitly state which fields are **cash** vs **plan/capacity** vs **cumulative**. Without this, implementation becomes "fit code to 20 unrelated outputs."

#### 1.2 Period Boundary Rules (Time Bucketing Critical)

The biggest determinism bugs in finance models are **period bucketing** bugs. These must be locked:

- [ ] Period bounds: `[start, end]` inclusive vs `[start, end)` exclusive
- [ ] Quarterly definition: Calendar quarters vs rolling 3-month windows
- [ ] Boundary date assignment: Flow on period end → belongs to which period?
- [ ] Same-date flow ordering: Contributions first? Distributions first? By ID?
- [ ] Rebalance trigger: Calendar date, event-based, or threshold?

**Align with**: `fund-calc.ts` period generation (00:00:00.000 start, 23:59:59.999 end)

#### 1.3 Semantic Definitions

- [ ] `reserve_balance`: Cash-on-hand OR reserved commitment capacity?
- [ ] `rebalance_frequency`: Event trigger semantics
- [ ] Cohort-absent handling (CA-001 style vs CA-007+ style)
- [ ] `dynamic_ratio` formula (CA-005): Fully specify OR defer with skip gate

---

### Gate 2: Determinism Contract (Acceptance Gate, 3-4h)

CA-018 explicitly requires rounding/tie-break determinism. CA-015 requires deterministic cohort cap spill behavior.

**Required deliverables**:

#### 2.1 Rounding Rules

- [ ] Rounding method: Bankers (round-half-even) vs half-up
- [ ] Precision: Integer cents vs 2-decimal dollars vs 4-decimal
- [ ] Align with existing `Decimal.js` contract in runner

#### 2.2 Allocation Algorithm

- [ ] Remainder allocation rule (e.g., largest remainder method)
- [ ] Tie-break rule (e.g., stable sort by cohort name/index)
- [ ] Spill-over ordering when cohort cap exceeded

**Gate requirement**: Single deterministic algorithm documented. No "it passes locally but fails in CI" allowed.

---

### Gate 3: Unit Contract (Acceptance Gate, 2-3h)

Truth cases mix scales: `commitment: 100` (implied millions) vs `commitment: 100000000` (raw dollars). ALL monetary fields have this variance.

**CRITICAL (v4)**: Do ALL unit normalization at the **adapter boundary**, not inside the engine. Adapter emits typed "normalized input" (internally consistent); engine accepts ONLY normalized inputs.

**Required deliverables** (choose one, in order of robustness):

| Option | Approach | Robustness |
|--------|----------|------------|
| A (best) | Standardize truth cases to raw dollars | HIGH - breaking change but cleanest |
| B | Add explicit `unit`/`currencyScale` field to schema | HIGH - schema change |
| C (minimum) | Infer from commitment, apply to ALL fields, log inconsistencies | MEDIUM - requires violation trap |

**Gate requirement**:
- Document canonical internal representation (integer cents recommended - matches reserves-v11)
- Create Unit + Precision Table (per field) - see `docs/CA-SEMANTIC-LOCK.md` Section 3
- Include "truth case inconsistent" violation handling (fail? warn? auto-correct?)

---

### Gate 4: Architecture Decision (1h)

- [ ] ADR confirming new `capital-allocation-engine.ts` (not wrapping existing)
- [ ] ADR documenting that `reserves-v11` is company-level, not CA source

---

### Implementation Approach: Case-First, Not Adapter-First

**CRITICAL CHANGE**: Do NOT build a big adapter skeleton first.

**Correct sequence**:
1. Lock semantics for CA-002/003/004/006 (simplest reserve cases)
2. Build smallest engine surface that satisfies those 4 cases
3. Only then build adapter to translate JSON to engine calls
4. Unskip CA execution in runner only when reserve_engine passes consistently
5. Expand to pacing_engine, cohort_engine, integration

**Rationale**: "Big adapter skeleton + debug everything" kills feasibility. "Prove semantics with 1-2 cases, then expand" is robust.

---

### Success Criteria

- 18/20 CA cases passing (allow CA-005 deferral + 1 edge case)
- No regressions in existing test suites
- New engine has >80% test coverage
- All four gates documented and reviewed before Phase 1 begins

### Exit Criteria (when to pause)

- If reserve_engine (4 core cases) exceeds 15h → semantic lock incomplete
- If >2 cases fail due to undocumented semantics → return to Gate 1
- If determinism issues (flaky tests) → return to Gate 2
- If unit inconsistencies cause failures → return to Gate 3

---

## Part F: Comparison Matrix (Updated)

| Factor | Original (8-12h) | External (340-500h) | Initial Refined (30-48h) | **Final Refined (60-100h)** |
|--------|-----------------|---------------------|-------------------------|---------------------------|
| Infrastructure | Assumed | "Build scratch" | Verified exists | **Verified exists** |
| ER Adapter | "Create new" | "Not implemented" | Already done | **Already done** |
| Pattern reuse | Not addressed | "0%" | "35-40%" | **20-25%** |
| Fund-level primitives | Assumed | Missing | Assumed reusable | **Must be built** |
| Unit normalization | Not addressed | Flagged | "Simple heuristic" | **All fields needed** |
| Domain complexity | Underestimated | Correctly ID'd | Acknowledged | **Acknowledged** |
| Estimate accuracy | Too optimistic | Too pessimistic | Still optimistic | **Evidence-based** |

---

## Part G: Recommended Plan (Revised - Case-First Approach)

### Phase 0: Acceptance Gates (12-16h) - BLOCKING

**MUST COMPLETE BEFORE ANY IMPLEMENTATION**

| Gate | Deliverable | Time | Status |
|------|-------------|------|--------|
| Gate 1 | `docs/CA-SEMANTIC-LOCK.md` with conservation law, period rules, definitions | 6-8h | [ ] |
| Gate 2 | Determinism contract (rounding, allocation algorithm, tie-break) | 3-4h | [ ] |
| Gate 3 | Unit contract (canonical representation, inference rules, violation trap) | 2-3h | [ ] |
| Gate 4 | Architecture ADR (new engine, reserves-v11 exclusion) | 1h | [ ] |

**Gate review**: All four documents reviewed before Phase 1 begins. If any gate incomplete, do not proceed.

---

### Phase 1: Prove Semantics with Core Cases (15-20h)

**Objective**: Validate semantic lock with 4 simplest cases before building full adapter.

**Week 1: Minimal viable engine**

| Task | Description | Cases | Gate Check |
|------|-------------|-------|------------|
| 1.1 | Create minimal `capital-allocation-engine.ts` with reserve calculation | - | Architecture |
| 1.2 | Implement CA-002 (underfunded reserve) | CA-002 | Conservation |
| 1.3 | Implement CA-003 (distribution reduces balance) | CA-003 | Conservation |
| 1.4 | Implement CA-004 (buffer breach) | CA-004 | Period rules |
| 1.5 | Implement CA-006 (multiple cohorts) | CA-006 | Determinism |

**Checkpoint**: 4/4 core cases passing with deterministic results. If not, return to Phase 0.

---

### Phase 2: Reserve Engine Completion (10-15h)

**Week 1-2: Expand reserve_engine coverage**

| Task | Description | Cases |
|------|-------------|-------|
| 2.1 | Build CA adapter skeleton (only after Phase 1 proves semantics) | - |
| 2.2 | Implement CA-001 (baseline static reserve) | CA-001 |
| 2.3 | Implement CA-005 OR defer with skip gate | CA-005 (dynamic_ratio) |
| 2.4 | Implement CA-013 (reserve edge case) | CA-013 |
| 2.5 | Unskip reserve_engine in runner | - |

**Checkpoint**: 7/7 reserve_engine cases passing (or 6/7 with CA-005 deferred).

---

### Phase 3: Pacing Engine (20-25h)

**Week 2-3: Time-series output handling**

| Task | Description | Cases |
|------|-------------|-------|
| 3.1 | Extend engine for time-series outputs (`reserve_balance_over_time[]`) | - |
| 3.2 | Implement pacing target calculation | - |
| 3.3 | Implement CA-007 through CA-012 | CA-007 to CA-012 |
| 3.4 | Validate unit normalization across large-number cases | - |

**Checkpoint**: 13/13 cases passing (reserve + pacing).

---

### Phase 4: Cohort Engine (15-20h)

**Week 3-4: Cohort lifecycle and determinism**

| Task | Description | Cases |
|------|-------------|-------|
| 4.1 | Implement cohort lifecycle state machine | - |
| 4.2 | Implement CA-014, CA-015 (cohort caps, spill behavior) | CA-014, CA-015 |
| 4.3 | Implement CA-016, CA-017 (lifecycle transitions) | CA-016, CA-017 |
| 4.4 | Implement CA-018 (rounding/tie-break - determinism critical) | CA-018 |
| 4.5 | Implement CA-019 (capital recall / negative distributions) | CA-019 |

**Checkpoint**: 19/19 cases passing (reserve + pacing + cohort).

---

### Phase 5: Integration + Validation (5-8h)

**Week 4: Final integration**

| Task | Description | Cases |
|------|-------------|-------|
| 5.1 | Implement CA-020 (integration with recycling semantics) | CA-020 |
| 5.2 | Full suite validation | All 20 |
| 5.3 | Regression check against existing modules | - |
| 5.4 | Documentation and cleanup | - |

**Final checkpoint**: 18-20/20 cases passing. `/deploy-check` green.

---

## Appendix: Evidence Summary

| Claim | Status | Evidence |
|-------|--------|----------|
| Runner exists | CONFIRMED | `runner.test.ts` lines 1-472 |
| ER adapter exists | CONFIRMED | `exit-recycling-adapter.ts` 455 lines |
| CA JSON wired | CONFIRMED | `runner.test.ts` line 63 |
| reserves-v11 is company-level | CONFIRMED | Function signature: `calculateCap(company: Company, ...)` |
| fund-calc.ts is not CA engine | CONFIRMED | Focuses on deployCompanies, simulatePeriods |
| capital-first.ts is not CA engine | CONFIRMED | Portfolio stage allocation, not reserve ledger |
| ER uses assertNumericField | WRONG | Uses `Math.abs(...) > tolerance` |
| CA schema matches ER | WRONG | CA has deeper nesting (fund/timeline/flows/constraints) |

---

## Conclusion

The external analysis's 340-500h estimate remains too pessimistic (~3-5x high), but my initial 30-48h estimate was too optimistic (~2x low) due to:

1. Incorrect assumption that existing code provides reusable fund-level primitives
2. Overstated pattern reuse (35-40% → 20-25%)
3. Incomplete unit normalization scope
4. Mixing effort-hours with calendar time

**v3 Improvements** (based on robustness review):

5. Phase 0 elevated from "documentation task" to **acceptance gate**
6. Added **conservation law** requirement (cash vs capacity vs hybrid)
7. Added **determinism contract** (rounding, allocation algorithm, tie-break)
8. Changed from **adapter-first** to **case-first** implementation approach
9. Added explicit **gate-return checkpoints** (if 4 core cases fail → return to Phase 0)

**v4 Improvements** (based on final robustness review):

10. Semantic lock must be **machine-testable** (spec tests, not just docs)
11. Added **time boundary rules** (period bucketing is major bug source)
12. Unit normalization at **adapter boundary** (engine accepts only normalized inputs)
13. Created comprehensive **CA-SEMANTIC-LOCK.md template** with invariants + unit table
14. Added **plain CLI path** requirement (pnpm test must work without slash commands)

**Final recommendation**: CONDITIONAL GO with 60-100 hour budget (4-6 weeks). The conditions are hardened: four acceptance gates must pass (with machine-testable spec tests) before any implementation begins. The main risk is not engineering difficulty but **semantic ambiguity**.

Neither 8-12h nor 340-500h reflects reality. 60-100h is the evidence-based middle ground, **contingent on Phase 0 producing an enforceable spec**.
