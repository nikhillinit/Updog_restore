# ADR-008 Ambiguity Resolution Report

**Date**: 2025-12-13 **Phase**: Phoenix Validation Step 5 **Scope**: Capital
Allocation & Exit Recycling (CA/ER truth cases) **Status**: Documentation
Complete, Implementation Gaps Identified

---

## Executive Summary

This report documents the resolution of 4 critical ambiguities identified during
truth case validation (Steps 3-4). All ambiguities have been **documented and
clarified** in `docs/calculations.md`, with implementation gaps tracked for
future work.

**Key Outcomes**:

- 4 ambiguities resolved through documentation
- 2 implementation gaps identified (Pacing Engine, Allocation Orchestrator)
- 1 JSDoc enhancement recommended (exit recycling period boundaries)
- 0 truth case corrections (CA-013, CA-020 errors are implementation gaps, not
  test bugs)

---

## Ambiguities Resolved

### 1. CA-013: Reserve Accounting Model Ambiguity

**Issue**: Truth case expects $15.5M output from $8M input, causing confusion
about reserve_balance semantics.

**Ambiguity**: Does "reserve_balance" mean actual cash on hand, or
target/commitment amount?

**Resolution**: **reserve_balance = actual cash (state variable)**

#### Documentation Updates

**File**: `docs/calculations.md` **Section**: "Reserve Accounting Model"

**Clarifications**:

- **reserve_target**: Policy-driven target amount (calculated)
- **reserve_balance**: Actual cash in reserves (state variable)
- **reserve_needs**: Shortfall requiring replenishment
  (`max(0, target - balance)`)

**CA-013 Explanation**:

- Initial balance: $8M (actual cash)
- Exit proceeds: $7.5M added to reserves
- **Updated balance**: $15.5M ($8M + $7.5M) ← This is the expected output

**Key Principle**: Reserve balance changes over time as cash flows in/out. It's
not a static calculation.

#### Implementation Status

**Current**:

- `client/src/core/reserves/ReserveEngine.ts` (lines 47-107)
- Implements portfolio company reserve allocation (different scope)

**Gap**:

- CA-013 requires fund-level reserve state tracking across time periods
- No time-series reserve balance management implemented

**Impact**: CA-013 truth case **cannot validate** until fund-level reserve
accounting is implemented.

#### Cross-References

- **Evidence Bundle**:
  `docs/validation/ca-er/evidence-bundles/CA-013-reserve-precedence-over-pacing.md`
- **Truth Case**: CA-013 (Reserve Precedence Over Pacing)
- **Related Cases**: CA-001, CA-002, CA-003 (reserve scenarios)

---

### 2. CA-020: Multi-Engine Integration Accounting

**Issue**: -60% variance in cohort allocations reveals unclear coordination
between reserve, pacing, and cohort engines.

**Ambiguity**: How do reserve, pacing, and cohort engines coordinate capital
allocation?

**Resolution**: **Sequential precedence with explicit handoffs**

#### Documentation Updates

**File**: `docs/calculations.md` **Section**: "Multi-Engine Integration"

**Clarifications**:

- **Flow**: Reserve → Pacing → Cohort (strict sequence)
- **Handoffs**:
  1. Reserve outputs `allocable_capital` (after reserve needs met)
  2. Pacing inputs `allocable_capital`, outputs `period_allocation`
     (pacing-limited)
  3. Cohort inputs `period_allocation`, outputs `cohort_allocations[]` (split by
     weights)

**Coordination Contract**:

```typescript
// Pseudocode showing data flow
reserve_output = ReserveEngine(commitment, reserve_target, reserve_balance);
pacing_output = PacingEngine(reserve_output.allocable_capital, pacing_target);
cohort_output = CohortEngine(pacing_output.period_allocation, cohort_weights);
```

#### Implementation Status

**Current**:

- `ReserveEngine.ts`: Portfolio-level reserve allocation (wrong scope)
- `CohortEngine.ts`: Vintage cohort performance metrics (wrong scope)
- `PacingEngine.ts`: **NOT IMPLEMENTED**

**Gap**:

- No orchestration layer sequences the engines
- Each engine operates independently on different data models
- Missing fund-level capital allocation logic

**Required**:

- New file: `client/src/core/allocation/AllocationOrchestrator.ts`
- Implements ADR-008 Section 2.1 (Core Precedence)
- Sequences reserve → pacing → cohort with explicit contracts

**Impact**: CA-020 truth case **cannot validate** until
AllocationOrchestrator.ts is implemented.

#### Cross-References

- **Evidence Bundle**:
  `docs/validation/ca-er/evidence-bundles/CA-020-multi-engine-integration.md`
- **Truth Case**: CA-020 (Multi-Engine Coordination)
- **Related ADR**: ADR-008 Section 2.1 (Core Precedence)

---

### 3. ER-015: Period Boundary Semantics

**Issue**: ADR-008 Section 2.5 doesn't explicitly document inclusive vs
exclusive recycling period logic.

**Ambiguity**: Is `year <= recyclingPeriod` (inclusive) or
`year < recyclingPeriod` (exclusive) intended?

**Resolution**: **INCLUSIVE BOUNDARY** (`year <= recyclingPeriod`)

#### Documentation Updates

**File**: `docs/calculations.md` **Section**: "Exit Recycling Period Boundaries"

**Clarifications**:

- **Operator**: `<=` (inclusive)
- **Business Rule**: "5-year recycling period" means "through year 5" (includes
  boundary)
- **Rationale**: Matches VC fund convention and LP agreement language

**Examples**: | Exit Year | Period | Eligible? | Reason |
|-----------|--------|-----------|--------| | 5 | 5 | YES | 5 <= 5 (boundary
case, INCLUSIVE) | | 6 | 5 | NO | 6 > 5 (beyond period) | | 1 | 0 | NO | 1 > 0
(zero period = no recycling) |

#### Implementation Status

**Current**:

- `client/src/lib/exit-recycling-calculations.ts` (lines 596-601)
- Function: `isExitWithinRecyclingPeriod()`
- **Correctly implements** `return exitYear <= recyclingPeriod;`

**Gap**:

- JSDoc comment doesn't explicitly call out inclusive boundary behavior
- Could cause confusion for future maintainers

**Recommended Enhancement**:

```typescript
/**
 * Check if exit is within recycling period
 *
 * IMPORTANT: Period boundary is INCLUSIVE. An exit in year N is eligible
 * if recyclingPeriod >= N. This matches standard VC fund convention.
 *
 * @example
 * isExitWithinRecyclingPeriod(5, 5) // => true (boundary case)
 * isExitWithinRecyclingPeriod(6, 5) // => false (beyond period)
 */
```

**Impact**: No functional issue. Documentation enhancement only.

#### Cross-References

- **Evidence Bundles**:
  - `docs/validation/ca-er/evidence-bundles/ER-013-period-boundary-inclusive.md`
  - `docs/validation/ca-er/evidence-bundles/ER-014-period-boundary-exclusive.md`
  - `docs/validation/ca-er/evidence-bundles/ER-015-period-within.md`
  - `docs/validation/ca-er/evidence-bundles/ER-016-multi-exit-period.md`
- **Truth Cases**: ER-013, ER-014, ER-015, ER-016
- **Test Coverage**:
  `client/src/lib/__tests__/exit-recycling-calculations.test.ts` (lines 111-166)

---

### 4. ER-010: Zero Rate Edge Case

**Issue**: 0% recycling rate behavior not explicitly documented in ADR-008.

**Ambiguity**: Does eligibility override zero rate (recycle anyway), or does
zero rate short-circuit recycling (nothing recycled)?

**Resolution**: **ZERO RATE SHORT-CIRCUITS RECYCLING**

#### Documentation Updates

**File**: `docs/calculations.md` **Section**: "Zero Rate Edge Cases"

**Clarifications**:

- **Behavior**: `recycledAmount = eligibleProceeds × (rate / 100)` → If rate =
  0, then recycledAmount = 0
- **Eligibility vs Rate**: Eligibility determines WHICH proceeds can be
  recycled; rate determines HOW MUCH of those proceeds are recycled
- **Semantic Distinction**:
  - **Rate = 0%**: Recycling enabled, but policy says "recycle nothing"
  - **Disabled**: Recycling feature turned off entirely (no eligibility checks)

**Behavior Matrix**: | Rate | Within Period? | Eligible Proceeds | Recycled
Amount | Returned to LPs |
|------|----------------|-------------------|-----------------|-----------------|
| 0% | YES | $10M | $0 | $10M | | 0% | NO | $0 | $0 | $10M | | 50% | YES | $10M
| $5M | $5M |

**Business Justification**: Allows funds to change rates over time (e.g.,
"recycling paused") without changing eligibility logic.

#### Implementation Status

**Current**:

- `client/src/lib/exit-recycling-calculations.ts` (lines 251-259)
- Function: `calculateRecyclingFromExit()`
- **Correctly implements** implicit zero-rate short-circuit

**Gap**:

- No explicit JSDoc comment explaining zero-rate behavior
- No dedicated test case for 0% rate with eligible exit (behavior is implicit)

**Recommended Enhancement**:

```typescript
/**
 * Calculate recycling from a single exit event
 *
 * EDGE CASE: If recyclingRate = 0%, all proceeds return to LPs even if
 * exit is within the recycling period. Zero rate means "no recycling"
 * regardless of eligibility.
 */
```

**Test Coverage Gap**:

- **Needed**: Explicit test case for
  `recyclingRate = 0, exitYear = 3, recyclingPeriod = 5`
- **Expected**: `recycledAmount = 0, returnedToLPs = fundProceeds`

**Impact**: No functional issue. Documentation and test coverage enhancement
recommended.

#### Cross-References

- **Evidence Bundle**:
  `docs/validation/ca-er/evidence-bundles/ER-010-zero-rate.md`
- **Truth Case**: ER-010 (Zero Recycling Rate)
- **Test File**: `client/src/lib/__tests__/exit-recycling-calculations.test.ts`
  (no explicit zero-rate test)

---

## Implementation Gaps Summary

### High Priority (Blocks Truth Case Validation)

1. **PacingEngine.ts** - NOT IMPLEMENTED
   - **Blocks**: CA-009, CA-010, CA-011, CA-012, CA-013, CA-020
   - **ADR Reference**: ADR-008 Section 2.3 (Pacing with Carryover)
   - **Location**: `client/src/core/pacing/PacingEngine.ts` (create)

2. **AllocationOrchestrator.ts** - NOT IMPLEMENTED
   - **Blocks**: CA-020 (Multi-Engine Integration)
   - **ADR Reference**: ADR-008 Section 2.1 (Core Precedence)
   - **Location**: `client/src/core/allocation/AllocationOrchestrator.ts`
     (create)
   - **Dependencies**: Requires PacingEngine.ts, fund-level reserve state
     tracking

3. **Fund-Level Reserve State Tracking** - PARTIAL IMPLEMENTATION
   - **Blocks**: CA-013 (Reserve Precedence Over Pacing)
   - **Current**: Portfolio-level reserve allocation only
   - **Needed**: Time-series reserve balance management
   - **Location**: Extend `client/src/core/reserves/ReserveEngine.ts`

### Medium Priority (Documentation/Testing)

4. **JSDoc Enhancements**
   - `isExitWithinRecyclingPeriod()` - Document inclusive boundary behavior
   - `calculateRecyclingFromExit()` - Document zero-rate edge case
   - **Impact**: Reduces maintainer confusion
   - **Effort**: 30 minutes

5. **Test Coverage Gaps**
   - Zero-rate explicit test case (ER-010 scenario)
   - **Impact**: Implicit behavior should be explicit
   - **Effort**: 1 hour

---

## Documentation Artifacts Created

### Primary Artifact

**File**: `docs/calculations.md` **Purpose**: Canonical calculation semantics
reference **Sections**:

1. Reserve Accounting Model (CA-013 ambiguity)
2. Exit Recycling Period Boundaries (ER-015 ambiguity)
3. Zero Rate Edge Cases (ER-010 ambiguity)
4. Multi-Engine Integration (CA-020 ambiguity)
5. Implementation References

**Cross-References**:

- ADR-008 (authoritative policy)
- Truth cases (validation scenarios)
- Evidence bundles (diagnostic reports)
- Implementation files (code locations)

### Secondary Artifact

**File**: `docs/validation/ca-er/adr-ambiguity-resolution.md` (this file)
**Purpose**: Step 5 resolution report **Sections**:

- Executive Summary
- 4 Ambiguity Resolutions (detailed)
- Implementation Gaps Summary
- Documentation Artifacts
- Next Steps

---

## Next Steps

### Immediate (Step 6: Precision Baseline)

1. **Proceed to Step 6** - Ambiguity resolution complete
2. **Use calculations.md** - Reference for implementation semantics
3. **Skip CA-013, CA-020** - Cannot validate until implementation gaps resolved

### Short-Term (Week 1)

1. **JSDoc Enhancement**
   - Update `isExitWithinRecyclingPeriod()` JSDoc (30 min)
   - Update `calculateRecyclingFromExit()` JSDoc (30 min)
   - **Priority**: Medium (documentation quality)

2. **Test Coverage**
   - Add explicit zero-rate test case (1 hour)
   - **Priority**: Medium (testing completeness)

### Medium-Term (Sprint Planning)

1. **PacingEngine.ts Implementation**
   - **Effort**: 2-3 days (implementation + tests)
   - **Priority**: High (blocks 6 truth cases)
   - **ADR Reference**: ADR-008 Section 2.3

2. **AllocationOrchestrator.ts Implementation**
   - **Effort**: 3-5 days (implementation + tests + integration)
   - **Priority**: High (blocks CA-020, enables multi-engine coordination)
   - **Dependencies**: PacingEngine.ts, fund-level reserve state
   - **ADR Reference**: ADR-008 Section 2.1

3. **Fund-Level Reserve State Tracking**
   - **Effort**: 2-3 days (extend ReserveEngine.ts)
   - **Priority**: High (blocks CA-013)
   - **Scope**: Time-series reserve balance management

### Long-Term (Backlog)

1. **CA-013, CA-020 Re-Validation**
   - After PacingEngine.ts and AllocationOrchestrator.ts implemented
   - Re-run Phoenix truth validation (Steps 3-4)
   - Update evidence bundles with actual vs expected comparisons

2. **ADR-008 Amendment**
   - Incorporate calculations.md clarifications into ADR-008
   - Add explicit sections for ambiguities resolved in this report
   - Version bump: 1.0.0 → 1.1.0 (clarifications, not breaking changes)

---

## Approval

**Prepared By**: Claude Code (Phoenix Validation Agent) **Review Status**: Draft
**Stakeholders**:

- Capital Allocation Working Group (policy interpretation)
- Engineering Team (implementation gaps)
- QA Team (test coverage)

**Approvals Required**:

- [ ] Capital Allocation WG (confirm semantic interpretations)
- [ ] Engineering Lead (prioritize implementation gaps)
- [ ] QA Lead (validate test coverage plan)

---

## Appendices

### Appendix A: Evidence Bundle Cross-Reference

| Ambiguity                | Evidence Bundle                          | Truth Case(s) | Status     |
| ------------------------ | ---------------------------------------- | ------------- | ---------- |
| Reserve Accounting       | CA-013-reserve-precedence-over-pacing.md | CA-013        | Documented |
| Multi-Engine Integration | CA-020-multi-engine-integration.md       | CA-020        | Documented |
| Period Boundaries        | ER-013, ER-014, ER-015, ER-016 (4 files) | ER-013-016    | Documented |
| Zero Rate                | ER-010-zero-rate.md                      | ER-010        | Documented |

### Appendix B: ADR-008 Section Mapping

| Ambiguity                | ADR-008 Section             | Gap Type                   |
| ------------------------ | --------------------------- | -------------------------- |
| Reserve Accounting       | 2.2 (Reserve Policy)        | Terminology ambiguity      |
| Multi-Engine Integration | 2.1 (Core Precedence)       | Integration logic missing  |
| Period Boundaries        | 2.5 (Recycling Integration) | Boundary semantics unclear |
| Zero Rate                | 2.5 (Recycling Integration) | Edge case undocumented     |

### Appendix C: Implementation File Locations

| Component               | File                                                   | Lines   | Status                      |
| ----------------------- | ------------------------------------------------------ | ------- | --------------------------- |
| Reserve Engine          | `client/src/core/reserves/ReserveEngine.ts`            | 1-190   | Partial (portfolio scope)   |
| Cohort Engine           | `client/src/core/cohorts/CohortEngine.ts`              | 1-252   | Partial (performance scope) |
| Exit Recycling          | `client/src/lib/exit-recycling-calculations.ts`        | 596-601 | Complete                    |
| Pacing Engine           | `client/src/core/pacing/PacingEngine.ts`               | N/A     | NOT IMPLEMENTED             |
| Allocation Orchestrator | `client/src/core/allocation/AllocationOrchestrator.ts` | N/A     | NOT IMPLEMENTED             |

---

**Document Version**: 1.0 **Last Updated**: 2025-12-13 **Next Review**: After
implementation gaps resolved
