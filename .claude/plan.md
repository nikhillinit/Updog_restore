# Improved Phoenix Capital Allocation Truth Case Verification Plan

## Plan Summary

This plan improves the original verification approach by adding automation, clearer methodology, and realistic risk assessment based on actual codebase investigation.

---

## Critical Findings from Investigation

### Current State Assessment

| Aspect | Finding | Impact |
|--------|---------|--------|
| **Truth Cases Exist** | CA-001 to CA-020 (20), ER-001 to ER-020 (20) | POSITIVE: Data exists |
| **Engine Implementations** | ReserveEngine, PacingEngine, CohortEngine: **NOT YET IMPLEMENTED** | CRITICAL: No code to test against |
| **Test Runner Status** | `runner.test.ts` loads but skips execution (Phase 1B+ gate) | Expected behavior |
| **Schema Validation** | `capital-allocation-truth-case.schema.json` exists (287 lines) | Can automate structural validation |
| **ADR-008 Coverage** | 564 lines, comprehensive formulas and precedence rules | POSITIVE: Reference material complete |
| **Tolerance Standards** | CA: 4 decimals (0.01%), ER: 2 decimals (0.01 tolerance) | Per CLAUDE.md conventions |

### Key Gap: No Production Code to Validate

The original plan assumes code exists to verify against. **The engines are not yet implemented:**

```typescript
// From ADR-008 Section 9.3 - ALL marked as "(planned)"
- Reserve Engine: `client/src/core/reserves/ReserveEngine.ts` (planned)
- Pacing Engine: `client/src/core/pacing/PacingEngine.ts` (planned)
- Cohort Engine: `client/src/core/cohorts/CohortEngine.ts` (planned)
```

---

## Recommended Improvements

### 1. Reframe Verification Goal

**Original Goal:** Verify truth case accuracy against code
**Revised Goal:** Verify truth case *internal consistency* and *formula correctness* per ADR-008

This is more valuable because:
- Truth cases will be the specification for future engine implementations
- Catching errors now prevents compounding mistakes during implementation
- Validates the test data before relying on it

### 2. Replace Manual Spot-Checks with Systematic Validation

**Original:** 3 arbitrary scenarios per module (6 total)
**Improved:** Structured validation across all categories with automated pre-filtering

#### Phase 2A: Automated Structural Validation (NEW)

Run JSON Schema validation on all 40 truth cases:

```bash
# Validate capital allocation cases
npx ajv validate -s docs/schemas/capital-allocation-truth-case.schema.json \
                 -d docs/capital-allocation.truth-cases.json

# Exit recycling needs schema (create if missing)
```

**Deliverable:** Schema compliance report (pass/fail per case)

#### Phase 2B: Formula Verification by Category

Instead of arbitrary spot-checks, verify **one case per formula type**:

| Category | Test Case | Formula to Verify | ADR-008 Reference |
|----------|-----------|-------------------|-------------------|
| **Reserve: Static** | CA-001 | `reserve = commitment × target_reserve_pct` | Section 2.2 |
| **Reserve: Floor** | CA-004 | `max(reserve_target, min_cash_buffer)` | Section 2.2 |
| **Reserve: Precedence** | CA-013 | Reserve overrides pacing | Section 2.1 |
| **Pacing: Carryover** | CA-009 | `Ct = max(0, P_{t-1} - A_{t-1})` | Section 2.3 |
| **Pacing: Monthly** | CA-008 | `target = commitment / pacing_window_months` | Section 2.3 |
| **Cohort: Pro-rata** | CA-014 | `amount = total × (weight / sum_weights)` | Section 2.4 |
| **Cohort: Cap Spill** | CA-015 | Cap enforcement + deterministic spill | Section 2.4 |
| **Cohort: Rounding** | CA-018 | Bankers' rounding with tie-break | Section 2.4 |
| **Integration** | CA-020 | All engines coordinate | Section 2.5 |
| **ER: Capacity** | ER-001 | `maxRecyclable = fundSize × cap%` | Notes field |
| **ER: Schedule** | ER-005 | Cumulative tracking with rate application | Notes field |
| **ER: Period Boundary** | ER-015 | Inclusive boundary (year <= period) | Notes field |

**Total: 12 cases (vs 6 in original plan) with formula justification**

### 3. Add Explicit Manual Calculation Templates

For each verification, provide the exact calculation steps:

#### Example: CA-013 (Reserve Precedence) Verification Template

```
INPUTS:
- commitment: 50,000,000
- target_reserve_pct: 0.25
- min_cash_buffer: 5,000,000
- contribution (2025-03-01): 8,000,000
- pacing_window_months: 24

STEP 1: Calculate Reserve Target
reserve_target = commitment × target_reserve_pct
               = 50,000,000 × 0.25
               = 12,500,000

STEP 2: Calculate Reserve Floor
reserve_floor = max(reserve_target, min_cash_buffer)
              = max(12,500,000, 5,000,000)
              = 12,500,000

STEP 3: Calculate Pacing Target
monthly_target = commitment / pacing_window_months
               = 50,000,000 / 24
               = 2,083,333.33

STEP 4: Apply Precedence Rule
available_after_reserve = contribution - reserve_floor
                        = 8,000,000 - 12,500,000
                        = -4,500,000 (negative means reserve not satisfied)

Since reserve takes precedence:
- Reserve gets: 8,000,000 (all available)
- Allocation gets: 0 (reserve not satisfied)

Wait - this contradicts expected output!

EXPECTED (from JSON):
- reserve_balance: 12,500,000
- allocations_by_cohort: [{"cohort": "General", "amount": 3,000,000}]

DISCREPANCY IDENTIFIED: Expected allocation of 3M requires additional capital source.
Review: Is there prior reserve balance assumed?
```

**This template reveals potential truth case errors!**

### 4. Add Cross-Case Consistency Checks (NEW)

Verify truth cases don't contradict each other:

| Check | Cases | Expected Relationship |
|-------|-------|----------------------|
| Reserve target formula | CA-001, CA-003, CA-013 | Same formula, different inputs |
| Pacing with/without carryover | CA-008 vs CA-009 | CA-009 should show carryover_applied violation |
| Cohort weights sum | CA-014, CA-018 | Weights should approximately sum to 1.0 |
| ER cap enforcement | ER-006, ER-007, ER-011 | Same cap logic, different scenarios |

### 5. Revised Confidence Upgrade Criteria

**Original Criteria (vague):**
- MEDIUM: 100% pass
- INVESTIGATE: 67-83%
- REBUILD: ≤50%

**Improved Criteria (specific):**

| Level | Schema Valid | Formula Correct | Cross-Consistent | Recommendation |
|-------|--------------|-----------------|------------------|----------------|
| **HIGH** | 100% | 12/12 | No contradictions | Proceed to engine implementation |
| **MEDIUM** | 100% | 10-11/12 | Minor issues | Fix identified issues, re-verify |
| **LOW** | <100% or | <10/12 | Major contradictions | Deep review with domain experts |

### 6. Realistic Risk Assessment

**Original:** "LOW RISK - Framework validated"

**Revised:**

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Truth cases contain calculation errors | **MEDIUM** | HIGH | Manual formula verification (this plan) |
| Schema allows invalid states | LOW | MEDIUM | Schema validation phase |
| ADR-008 formulas ambiguous | **MEDIUM** | HIGH | Cross-reference multiple cases per formula |
| No engine code to test against | **CERTAIN** | BLOCKING | Plan for engine implementation first |
| Exit Recycling schema missing | **CONFIRMED** | LOW | Create ER schema before validation |

---

## Recommended Execution Steps

### Phase 1: Preparation [~30 min]

1. Create exit-recycling-truth-case.schema.json (missing!)
2. Run automated schema validation on both JSON files
3. Document any schema failures

### Phase 2: Formula Verification [~2-3 hours]

For each of the 12 selected cases:
1. Copy manual calculation template
2. Fill in inputs from JSON
3. Calculate step-by-step using ADR-008 formulas
4. Compare to expected outputs
5. Document discrepancies with severity rating

### Phase 3: Cross-Consistency Check [~1 hour]

1. Extract shared parameters across related cases
2. Verify consistent behavior patterns
3. Flag any contradictions

### Phase 4: Confidence Determination [~30 min]

1. Tally results by category
2. Apply improved criteria matrix
3. Generate confidence report with specific findings

### Phase 5: Remediation Plan [if needed]

1. For each discrepancy, determine root cause:
   - Truth case error → Fix JSON
   - ADR-008 ambiguity → Clarify policy
   - Understanding gap → Consult domain expert
2. Re-run affected verifications

---

## Deliverables

1. **Schema Validation Report** - Pass/fail for all 40 cases
2. **Formula Verification Workbook** - 12 manual calculations with step-by-step
3. **Discrepancy Log** - Any expected vs calculated mismatches
4. **Cross-Consistency Matrix** - Related case comparison
5. **Confidence Upgrade Report** - Final recommendation with evidence
6. **Updated docs/phase0-validation-report.md** - Add CA/ER sections

---

## Key Differences from Original Plan

| Aspect | Original | Improved |
|--------|----------|----------|
| Validation approach | Manual spot-check (6 cases) | Systematic formula verification (12 cases) + automation |
| Case selection | Arbitrary | One per formula type (traceable to ADR-008) |
| Schema validation | Not mentioned | Automated as Phase 2A |
| Calculation method | "Manually calculate" | Explicit templates with steps |
| Cross-consistency | Not mentioned | Dedicated phase |
| Risk assessment | "LOW" | Realistic with identified gaps |
| Deliverables | Report + recommendation | 6 specific artifacts |
| ER tolerance | "2 decimal places" | Confirmed: 0.01 per JSON |
| CA tolerance | "4 decimal places" | Confirmed: Per CLAUDE.md conventions |

---

## Implementation Note

**IMPORTANT:** This plan validates the *truth cases* themselves, not the engine implementations (which don't exist yet). The goal is to ensure the test data is correct before building code against it.

After this verification completes with HIGH confidence, the next step would be implementing the engines and running the test harness in `runner.test.ts`.
