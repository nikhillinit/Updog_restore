---
status: ACTIVE
last_updated: 2026-01-19
---

# Capital Allocation Module

**Version**: 1.0.0 **Schema**:
`docs/schemas/capital-allocation-truth-case.schema.json` **ADR**:
`docs/adr/ADR-008-capital-allocation-policy.md`

---

## Domain Summary

This module implements deterministic, auditable allocation of capital across
time and cohorts through three coordinated engines:

- **Reserve Engine**: Maintains liquidity protection via reserve target/floor
  and cash buffer
- **Pacing Engine**: Smooths deployment over time using rolling window with
  carryover of shortfalls
- **Cohort Engine**: Allocates capital across cohorts by weights with caps and
  deterministic spill
- **Core Precedence**: Reserve floor → Pacing target → Cohort allocation (see
  ADR-008)
- **Recycling Integration**: Eligible distributions increase allocable capacity
  after reserve checks
- **Prospective Behavior**: Rule changes (e.g., pacing window adjustments) apply
  from change date forward with no retroactive reallocation
- **Pure Functions**: All engines are stateless with explicit inputs/outputs for
  auditability
- **Schema Versioning**: Semver-tracked with breaking changes requiring major
  version bump

---

## Key Formulas

### Reserve Engine

1. **Reserve target**: `R* = target_reserve_pct × commitment`
2. **Reserve delta (need)**: `ΔR_t = R* - R_t`
3. **Reserve floor**: `floor = max(R*, min_cash_buffer)`
4. **Buffer violation check**: `R_t < floor` triggers allocation reduction

### Pacing Engine

5. **Monthly pacing target**: `P_m = commitment / pacing_window_months`
6. **Carryover from prior period**: `C_t = max(0, P_{t-1} - A_{t-1})`
7. **Adjusted pacing target**: `P̃_t = P_t + C_t`
8. **Quarterly adjustment**: `P_q = P_m × 3` (monthly → quarterly cadence)

### Cohort Engine

9. **Weight normalization**: `w_i_norm = weight_i / Σ(active_weights)`
10. **Pro-rata allocation (pre-caps)**: `alloc_i = w_i_norm × A_t`
11. **Cap enforcement**: `alloc_i_capped = min(alloc_i, max_per_cohort × A_t)`
12. **Spill calculation**: `spill = Σ(alloc_i - alloc_i_capped)`
13. **Bankers' rounding**: Round to nearest even; tie-break to highest remainder
    → lexicographic name (see CA-018 for worked example)

<!-- BEGIN:CASE:CA-018:inputs -->

```json
{
  "fund": {
    "commitment": 10000000,
    "target_reserve_pct": 0.1,
    "reserve_policy": "static_pct",
    "pacing_window_months": 10,
    "vintage_year": 2025
  },
  "timeline": {
    "start_date": "2025-01-01",
    "end_date": "2025-10-31"
  },
  "flows": {
    "contributions": [
      {
        "date": "2025-01-15",
        "amount": 1000000
      }
    ],
    "distributions": []
  },
  "constraints": {
    "min_cash_buffer": 100000,
    "max_allocation_per_cohort": 1,
    "rebalance_frequency": "monthly"
  },
  "cohorts": [
    {
      "name": "A",
      "start_date": "2025-01-01",
      "end_date": "2025-10-31",
      "weight": 0.3333333
    },
    {
      "name": "B",
      "start_date": "2025-01-01",
      "end_date": "2025-10-31",
      "weight": 0.3333333
    },
    {
      "name": "C",
      "start_date": "2025-01-01",
      "end_date": "2025-10-31",
      "weight": 0.3333334
    }
  ]
}
```

<!-- END:CASE:CA-018:inputs -->

<!-- BEGIN:CASE:CA-018:expected -->

```json
{
  "allocations_by_cohort": [
    {
      "cohort": "A",
      "amount": 333333
    },
    {
      "cohort": "B",
      "amount": 333333
    },
    {
      "cohort": "C",
      "amount": 333334
    }
  ],
  "reserve_balance_over_time": [
    {
      "date": "2025-01-31",
      "balance": 1000000
    }
  ],
  "pacing_targets_by_period": [
    {
      "period": "2025-01",
      "target": 1000000
    }
  ],
  "violations": []
}
```

<!-- END:CASE:CA-018:expected -->

---

## Reserve Engine

**Purpose**: Maintain reserve levels before allocating capital to deals.

**Key Rules**:

- Reserve floor **overrides** pacing targets when binding (CA-013 demonstrates
  this precedence)
- Cash buffer enforcement: `R_t ≥ max(R*, min_cash_buffer)` must hold at all
  times
- Reserve policy options: `static_pct` (default), `dynamic_ratio`,
  `waterfall_dependent`

**Truth Cases**:

- CA-001: Baseline scenario with reserve at target
- CA-002: Underfunded reserve triggers buffer top-up
- CA-013: Reserve floor precedence over monthly pacing (conflict resolution)

<!-- BEGIN:CASE:CA-013:inputs -->

```json
{
  "fund": {
    "commitment": 50000000,
    "target_reserve_pct": 0.25,
    "reserve_policy": "static_pct",
    "pacing_window_months": 24,
    "vintage_year": 2024
  },
  "timeline": {
    "start_date": "2025-01-01",
    "end_date": "2026-12-31"
  },
  "flows": {
    "contributions": [
      {
        "date": "2025-03-01",
        "amount": 8000000
      }
    ],
    "distributions": []
  },
  "constraints": {
    "min_cash_buffer": 5000000,
    "max_allocation_per_cohort": 0.6,
    "rebalance_frequency": "monthly"
  },
  "cohorts": [
    {
      "name": "General",
      "start_date": "2025-01-01",
      "end_date": "2026-12-31",
      "weight": 1
    }
  ]
}
```

<!-- END:CASE:CA-013:inputs -->

<!-- BEGIN:CASE:CA-013:expected -->

```json
{
  "allocations_by_cohort": [
    {
      "cohort": "General",
      "amount": 3000000
    }
  ],
  "reserve_balance_over_time": [
    {
      "date": "2025-03-31",
      "balance": 12500000
    }
  ],
  "pacing_targets_by_period": [
    {
      "period": "2025-03",
      "target": 2083333
    }
  ],
  "violations": ["reserve_floor_override_pacing"]
}
```

<!-- END:CASE:CA-013:expected -->

**Schema References**:

- `docs/schemas/capital-allocation-truth-case.schema.json:52-60` (reserve_policy
  enum)
- `docs/adr/ADR-008-capital-allocation-policy.md:45-72` (precedence rationale)

---

## Pacing Engine

**Purpose**: Smooth deployment across time with rolling window and carryover.

**Key Rules**:

- Rolling window (typically 12-24 months) distributes deployment smoothly
- **Carryover logic**: Shortfalls from period t-1 roll forward to period t
- Cadence options: monthly, quarterly, annual (via `rebalance_frequency`)
- Window changes apply **prospectively** (no retroactive adjustments)

**Truth Cases**:

- CA-008: Monthly pacing baseline (24-month window)
- CA-009: Quarterly pacing with Q1 shortfall carrying to Q2
- CA-012: Comparison of 24-month vs 18-month window assumptions (separate
  scenarios)

**Schema References**:

- `docs/schemas/capital-allocation-truth-case.schema.json:62-66`
  (pacing_window_months)
- `docs/adr/ADR-008-capital-allocation-policy.md:89-110` (pacing mechanics and
  carryover)

**Formulas in Action** (CA-009 example):

<!-- BEGIN:CASE:CA-009:inputs -->

```json
{
  "fund": {
    "commitment": 36000000,
    "target_reserve_pct": 0.1,
    "reserve_policy": "static_pct",
    "pacing_window_months": 18,
    "vintage_year": 2024
  },
  "timeline": {
    "start_date": "2025-01-01",
    "end_date": "2026-06-30"
  },
  "flows": {
    "contributions": [
      {
        "date": "2025-02-10",
        "amount": 3000000
      }
    ],
    "distributions": []
  },
  "constraints": {
    "min_cash_buffer": 500000,
    "max_allocation_per_cohort": 0.65,
    "rebalance_frequency": "quarterly"
  },
  "cohorts": [
    {
      "name": "Core-25",
      "start_date": "2025-01-01",
      "end_date": "2026-06-30",
      "weight": 0.6
    },
    {
      "name": "Growth-25",
      "start_date": "2025-01-01",
      "end_date": "2026-06-30",
      "weight": 0.4
    }
  ]
}
```

<!-- END:CASE:CA-009:inputs -->

<!-- BEGIN:CASE:CA-009:expected -->

```json
{
  "allocations_by_cohort": [
    {
      "cohort": "Core-25",
      "amount": 1200000
    },
    {
      "cohort": "Growth-25",
      "amount": 800000
    }
  ],
  "reserve_balance_over_time": [
    {
      "date": "2025-03-31",
      "balance": 3600000
    }
  ],
  "pacing_targets_by_period": [
    {
      "period": "2025-Q1",
      "target": 6000000
    },
    {
      "period": "2025-Q2",
      "target": 6000000
    }
  ],
  "violations": ["carryover_applied_q2"]
}
```

<!-- END:CASE:CA-009:expected -->

- Q1 target: 6M, deployed: 4M → carryover = 2M
- Q2 target: 6M + 2M carryover = 8M adjusted target

---

## Cohort Engine

**Purpose**: Allocate period amount across cohorts by weights with caps and
deterministic spill.

**Key Rules**:

1. Filter to **active cohorts only** (`start_date ≤ t ≤ end_date`)
2. Normalize weights across active cohorts
3. Calculate pro-rata allocation for each cohort
4. Apply `max_allocation_per_cohort` cap
5. Reallocate spill to remaining cohorts deterministically
6. Apply bankers' rounding with tie-break rules

**Truth Cases**:

- CA-014: Fixed weights with simple pro-rata split
- CA-015: Cohort cap binding forces spill reallocation
- CA-016: Cohort lifecycle transitions (Alpha closes 06/30, Gamma opens 07/01)

**Schema References**:

- `docs/schemas/capital-allocation-truth-case.schema.json:155-180` (cohorts
  array definition)
- `docs/adr/ADR-008-capital-allocation-policy.md:112-145` (cohort allocation
  algorithm)

**Example** (CA-015 with cap binding):

<!-- BEGIN:CASE:CA-015:inputs -->

```json
{
  "fund": {
    "commitment": 25000000,
    "target_reserve_pct": 0.12,
    "reserve_policy": "static_pct",
    "pacing_window_months": 18,
    "vintage_year": 2025
  },
  "timeline": {
    "start_date": "2025-01-01",
    "end_date": "2026-06-30"
  },
  "flows": {
    "contributions": [
      {
        "date": "2025-02-01",
        "amount": 5000000
      }
    ],
    "distributions": []
  },
  "constraints": {
    "min_cash_buffer": 300000,
    "max_allocation_per_cohort": 0.55,
    "rebalance_frequency": "monthly"
  },
  "cohorts": [
    {
      "name": "Large-Cohort",
      "start_date": "2025-01-01",
      "end_date": "2026-06-30",
      "weight": 0.8
    },
    {
      "name": "Small-Cohort",
      "start_date": "2025-01-01",
      "end_date": "2026-06-30",
      "weight": 0.2
    }
  ]
}
```

<!-- END:CASE:CA-015:inputs -->

<!-- BEGIN:CASE:CA-015:expected -->

```json
{
  "allocations_by_cohort": [
    {
      "cohort": "Large-Cohort",
      "amount": 2750000
    },
    {
      "cohort": "Small-Cohort",
      "amount": 2250000
    }
  ],
  "reserve_balance_over_time": [
    {
      "date": "2025-02-28",
      "balance": 3000000
    }
  ],
  "pacing_targets_by_period": [
    {
      "period": "2025-02",
      "target": 1388889
    }
  ],
  "violations": ["max_per_cohort_cap_bound"]
}
```

<!-- END:CASE:CA-015:expected -->

- Pre-cap: Large cohort = 80%, Small cohort = 20%
- Cap: 55% max per cohort
- Post-cap: Large capped at 55%, spill (25%) reallocated to Small → Small = 45%

---

## Integration & Precedence

**Decision Tree** (conflict resolution order):

1. **Reserve Floor Check**
   - If `R_t < floor`, reduce `A_t` until reserve satisfied
   - Example: CA-013 (reserve precedence over pacing)

2. **Pacing Target Application**
   - Calculate `P̃_t = P_t + C_t` (base + carryover)
   - Allocable amount bounded by pacing constraints

3. **Cohort Allocation**
   - Distribute `A_t` across active cohorts
   - Apply caps and deterministic spill
   - Example: CA-015 (cap enforcement)

**Recycling Integration**:

- Eligible distributions (`recycle_eligible: true`) increase allocable capacity
- Applied **after** reserve floor satisfied
- Example: CA-020 (integration case with recycling + reserve + pacing + caps)

<!-- BEGIN:CASE:CA-020:inputs -->

```json
{
  "fund": {
    "commitment": 40000000,
    "target_reserve_pct": 0.2,
    "reserve_policy": "static_pct",
    "pacing_window_months": 24,
    "vintage_year": 2024
  },
  "timeline": {
    "start_date": "2025-01-01",
    "end_date": "2026-12-31"
  },
  "flows": {
    "contributions": [
      {
        "date": "2025-04-01",
        "amount": 5000000
      }
    ],
    "distributions": [
      {
        "date": "2025-05-01",
        "amount": 2000000,
        "recycle_eligible": true
      }
    ]
  },
  "constraints": {
    "min_cash_buffer": 4000000,
    "max_allocation_per_cohort": 0.5,
    "rebalance_frequency": "monthly"
  },
  "cohorts": [
    {
      "name": "A",
      "start_date": "2025-01-01",
      "end_date": "2026-12-31",
      "weight": 0.6
    },
    {
      "name": "B",
      "start_date": "2025-01-01",
      "end_date": "2026-12-31",
      "weight": 0.4
    }
  ]
}
```

<!-- END:CASE:CA-020:inputs -->

<!-- BEGIN:CASE:CA-020:expected -->

```json
{
  "allocations_by_cohort": [
    {
      "cohort": "A",
      "amount": 2500000
    },
    {
      "cohort": "B",
      "amount": 2500000
    }
  ],
  "reserve_balance_over_time": [
    {
      "date": "2025-04-30",
      "balance": 8000000
    },
    {
      "date": "2025-05-31",
      "balance": 10000000
    }
  ],
  "pacing_targets_by_period": [
    {
      "period": "2025-04",
      "target": 1666667
    },
    {
      "period": "2025-05",
      "target": 1666667
    }
  ],
  "violations": ["reserve_floor_precedence_over_pacing", "recycling_applied"]
}
```

<!-- END:CASE:CA-020:expected -->

**Precedence Rationale** (from ADR-008):

- **Why Reserve > Pacing**: Liquidity protection is non-negotiable; prevents
  cash shortfalls
- **Why Pacing > Cohort**: Deployment smoothness prevents vintage concentration
  before fairness
- **Why deterministic spill**: Audit trail requires reproducible allocations

---

## Adversarial & Edge Cases

| Case ID | Scenario                    | Expected Behavior                                | Validation Point                   |
| ------- | --------------------------- | ------------------------------------------------ | ---------------------------------- |
| CA-004  | Zero contributions          | Reserve maintained; no deployment                | Handles null deployment gracefully |
| CA-013  | Reserve overrides pacing    | Deployment deferred until reserve satisfied      | Precedence rule enforcement        |
| CA-015  | Cohort cap binding          | Deterministic spill to remaining cohorts         | Cap enforcement + spill algorithm  |
| CA-016  | Cohort lifecycle transition | Active cohorts only; no retroactive reallocation | Date-based filtering correctness   |

---

## Schema Reference

**Location**: `docs/schemas/capital-allocation-truth-case.schema.json`
**Version**: 1.0.0 (Draft-07 JSON Schema)

**Core Input Structures**:

- `fund`: commitment, target_reserve_pct, reserve_policy, pacing_window_months,
  vintage_year
- `timeline`: start_date, end_date
- `flows`: contributions[] (non-negative), distributions[] (allows negative for
  recalls per ADR-008)

**Capital Recalls Example** (CA-019):

<!-- BEGIN:CASE:CA-019:inputs -->

```json
{
  "fund": {
    "commitment": 12000000,
    "target_reserve_pct": 0.1,
    "reserve_policy": "static_pct",
    "pacing_window_months": 12,
    "vintage_year": 2024
  },
  "timeline": {
    "start_date": "2025-02-01",
    "end_date": "2025-12-31"
  },
  "flows": {
    "contributions": [
      {
        "date": "2025-02-15",
        "amount": 1200000
      }
    ],
    "distributions": [
      {
        "date": "2025-03-10",
        "amount": -200000,
        "recycle_eligible": false
      }
    ]
  },
  "constraints": {
    "min_cash_buffer": 200000,
    "max_allocation_per_cohort": 0.75,
    "rebalance_frequency": "monthly"
  },
  "cohorts": [
    {
      "name": "North",
      "start_date": "2025-02-01",
      "end_date": "2025-12-31",
      "weight": 0.5
    },
    {
      "name": "South",
      "start_date": "2025-02-01",
      "end_date": "2025-12-31",
      "weight": 0.5
    }
  ]
}
```

<!-- END:CASE:CA-019:inputs -->

<!-- BEGIN:CASE:CA-019:expected -->

```json
{
  "allocations_by_cohort": [
    {
      "cohort": "North",
      "amount": 500000
    },
    {
      "cohort": "South",
      "amount": 500000
    }
  ],
  "reserve_balance_over_time": [
    {
      "date": "2025-03-31",
      "balance": 1000000
    }
  ],
  "pacing_targets_by_period": [
    {
      "period": "2025-02",
      "target": 1000000
    }
  ],
  "violations": ["capital_recall_processed"]
}
```

<!-- END:CASE:CA-019:expected -->

- `constraints`: min_cash_buffer, max_allocation_per_cohort, rebalance_frequency
- `cohorts`: [{name, start_date, end_date, weight}]

**Expected Output Structures**:

- `reserve_balance`: number
- `allocations_by_cohort`: [{cohort, amount}]
- `pacing_targets`: [{period, target}] (optional)
- `violations`: string[] (for adversarial test documentation)

**Design Decision** (ADR-008):

- Negative `distribution.amount` represents capital recalls/clawbacks
- Trade-off: mathematical simplicity vs semantic clarity
- Future migration: explicit `capitalRecall` transaction type in v2.0

---

## Truth Cases Coverage

**Location**: `docs/capital-allocation.truth-cases.json` **Count**: 20 cases
(CA-001 through CA-020) **Schema Version**: 1.0.0

### Current Coverage

| Category       | Case IDs                                       | Focus                                                                                                 |
| -------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Reserve Engine | CA-001, CA-002, CA-003, CA-004, CA-007, CA-013 | Baseline, underfunded, overfunded, zero contributions, year-end cutoff, reserve precedence            |
| Pacing Engine  | CA-005, CA-008, CA-009, CA-010, CA-011, CA-012 | Dynamic ratio, monthly pacing, quarterly carryover, front-loaded pipeline, drought, window comparison |
| Cohort Engine  | CA-006, CA-014, CA-015, CA-016, CA-017, CA-018 | Large distribution, pro-rata split, cap binding, lifecycle, rebalance frequency, rounding tie-breaks  |
| Integration    | CA-019, CA-020                                 | Capital recalls, multi-engine coordination with recycling                                             |

---

## Validation Framework

**Config**: `scripts/validation/capital-allocation-validation.yaml` **Prompt**:
`scripts/validation/prompts.py:capital_allocation_prompt()` **Scorer**:
`scripts/validation/doc_domain_scorer.mjs`

**Scoring Dimensions**:

1. Domain Concept Coverage (30%): Capital allocation keywords (12 terms)
2. Schema Vocabulary Alignment (25%): Schema field mentions
3. Code Reference Completeness (25%): `file:line` anchor count
4. Truth Case Overlap (20%): Mentions of specific test cases

**Contradiction Detection**: 10% penalty for negative statements (e.g., "reserve
does not override pacing")

**Target Scores**:

- Primary documentation: ≥90% (matching Phase 1B/1C standard)
- ADR documents: ≥85% (relaxed schema vocabulary weighting)

---

## References

### Schema & Data

- **Schema**: `docs/schemas/capital-allocation-truth-case.schema.json` (v1.0.0)
- **Truth Cases**: `docs/capital-allocation.truth-cases.json` (6 cases
  currently, 20 planned)
- **Validator**: `scripts/validation/capital-allocation-validation.yaml`

### Architecture Decisions

- **ADR-008**: Capital Allocation Policy (precedence, pacing, cohorts,
  recycling)
- **Related**: ADR-006 (Fee Calculation), ADR-007 (Exit Recycling)

### Validation Tools

- **Prompt**: `scripts/validation/prompts.py:capital_allocation_prompt()`
- **Scorer**: `scripts/validation/doc_domain_scorer.mjs`
- **Truth case validator**: `scripts/validate-ca-cases.mjs`

---

## Future Enhancements

**Phase 2 Expansion** (pending checkpoint approval):

- Add 14 remaining truth cases (CA-007 through CA-020)
- Expand each engine section with pseudocode and worked examples
- Add 15+ implementation `file:line` anchors
- Include step-by-step walkthroughs for CA-009, CA-013, CA-015

**Schema v2.0** (technical debt):

- Introduce explicit `capitalRecall` transaction type
- Replace negative distributions with semantic transaction types
- Add `status` field to cohorts for lifecycle modeling
- Support time-varying pacing windows

**Tooling**:

- Symbolic anchoring system (@doc-anchor annotations)
- CLI tool for anchor validation and maintenance
- Behavioral validation (code execution tests)

---

**Document Version**: 1.0.0 (checkpoint skeleton) **Last Updated**: 2025-10-29
**Status**: Phase 1 checkpoint - ready for validation feedback
