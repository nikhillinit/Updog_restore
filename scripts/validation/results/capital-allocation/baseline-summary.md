# Capital Allocation Validation - Baseline Results

**Date**: 2025-10-29
**Branch**: docs/phase1d-capital-allocation
**Evaluation ID**: eval-bs9-2025-10-29T23:37:02
**Model**: Claude 3.7 Sonnet (claude-3-7-sonnet-20250219)

---

## Executive Summary

✅ **Validation Status**: PASSED
✅ **Pass Rate**: 100.00%
✅ **Test Cases**: 2/2 passed
✅ **Duration**: 24 seconds
✅ **Concurrency**: 4

---

## Test Results

### Test Case 1: Capital Allocation Documentation
- **Document Type**: `capital_allocation`
- **Status**: ✅ PASS
- **File**: `docs/notebooklm-sources/capital-allocation.md`

### Test Case 2: ADR-008 Architectural Decision
- **Document Type**: `architectural_decision`
- **Status**: ✅ PASS
- **File**: `docs/adr/ADR-008-capital-allocation-policy.md`

---

## Token Usage

| Category | Tokens |
|----------|--------|
| Total | 21,660 |
| Prompt | 19,293 |
| Completion | 2,367 |

---

## Validation Configuration

- **Config**: `scripts/validation/capital-allocation-validation.yaml`
- **Prompt Function**: `scripts/validation/prompts.py:capital_allocation_prompt()`
- **Custom Scorer**: `scripts/validation/doc_domain_scorer.mjs`
- **Provider**: Anthropic Claude 3.7 Sonnet
- **Max Tokens**: 8192
- **Temperature**: 0

---

## Files Validated

1. **Primary Documentation**
   `docs/notebooklm-sources/capital-allocation.md` (200+ lines, 13 formulas)

2. **Architectural Decision Record**
   `docs/adr/ADR-008-capital-allocation-policy.md` (564 lines)

---

## Truth Cases Coverage

- **Cases Included**: 6 (CA-001 through CA-006)
- **Schema Version**: 1.0.0
- **Categories Covered**:
  - Reserve Engine: CA-001, CA-002, CA-003, CA-004
  - Pacing Engine: CA-005
  - Cohort Engine: CA-006

---

## Key Findings

### ✅ Strengths
1. Both documentation files passed validation
2. Complete validation framework operational
3. Schema validation successful (all 6 truth cases)
4. Proper cross-references to schema and ADR documents
5. Formula documentation present (13 formulas documented)
6. Truth case references included

### 📋 Expected Phase 2 Improvements
(Based on checkpoint analysis)

1. **Domain Coverage**: Add 4 missing keywords (pacing window specifics, cohort weight formulas, cash buffer details, spill reallocation examples)
2. **Schema Vocabulary**: Increase mentions of underrepresented terms (recycle_eligible, min_cash_buffer, max_allocation_per_cohort, violation codes)
3. **Code References**: Replace 3-5 placeholder anchors with 15+ actual implementation file:line anchors
4. **Formula Depth**: Add worked examples for CA-009 (pacing), CA-013 (precedence), CA-015 (cohort caps)

---

## Comparison to Phase 1B/1C

| Metric | Phase 1B (Fees) | Phase 1C (Exit Recycling) | Phase 1D (Capital Allocation) |
|--------|-----------------|---------------------------|-------------------------------|
| Pass Rate | 100% | 100% | 100% ✅ |
| Duration | 1m25s | 1m29s | 24s ⚡ |
| Tokens | 38,759 | 44,253 | 21,660 |
| Test Cases | 2 | 2 | 2 |

**Note**: Faster execution and lower token usage due to skeleton documentation (200 lines vs 500-700 lines in 1B/1C).

---

## Next Steps (Phase 2 Expansion)

1. Add 14 remaining truth cases (CA-007 through CA-020)
2. Expand documentation to 500-700 lines with worked examples
3. Add 15+ implementation file:line anchors
4. Include step-by-step walkthroughs for key scenarios
5. Re-run validation targeting 90%+ domain scores

---

**Status**: ✅ Phase 1D checkpoint complete - foundation validated
**Blocker**: None (API credits restored)
**Quality**: Production-ready framework
**Recommendation**: Proceed to Phase 2 expansion or merge checkpoint
