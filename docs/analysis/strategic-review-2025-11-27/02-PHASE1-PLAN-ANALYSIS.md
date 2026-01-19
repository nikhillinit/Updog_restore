---
status: ACTIVE
last_updated: 2026-01-19
---

# Phase 1 Orchestration Plan Analysis

<!-- Breadcrumb Navigation -->

[← INDEX](00-INDEX.md) | [Next Section →](03-PROJECT-UNDERSTANDING-ANALYSIS.md)

**Read Time**: ~4 minutes

**Date**: 2025-11-26 **Status**: DRAFT **Source**:
STRATEGIC-DOCUMENT-REVIEW-2025-11-26.md (lines 36-196)

---

## Document 1: Phase 1 Orchestration Plan Analysis

**File**:
`docs/sessions/SESSION-HANDOFF-2025-11-20-PHASE1-AGENT-ORCHESTRATION-PLAN.md`
**Date Created**: 2025-11-20 **Agent**: general-purpose (Sonnet model)
**Analysis Time**: ~15 minutes

### Executive Summary

**VERDICT: NOT READY FOR EXECUTION**

The Phase 1 orchestration plan demonstrates excellent agent-first methodology
awareness but contains **4 critical blockers** that must be resolved before
execution (see [Action Plan](06-ACTION-PLAN.md#tier-1-critical-do-now) for
resolution steps):

1. **Phase 0 brainstorming not completed** (marked "AWAITING USER APPROVAL")
2. **Phoenix alignment undefined** (standalone vs integrated approach)
3. **API layer missing** from implementation plan
4. **BigInt precision inconsistency** (6-decimal vs 8-decimal conflict)

**Time Estimate Assessment**: Plan claims 12-16 hours but realistic estimate is
**20-28 hours** (40-75% underestimated). See
[time estimate analysis](05-CROSS-DOCUMENT-SYNTHESIS.md#pattern-optimistic-time-estimates)
for systematic pattern across all documents.

### Key Findings

#### 1. Workflow Violation Correctly Identified

The document demonstrates **excellent meta-awareness** by acknowledging it
initially violated CAPABILITIES.md (mandatory first step), then self-corrected
to use agent orchestration. This reflexive improvement is commendable.

**HOWEVER**: The plan still contains execution gaps despite this correction.

#### 2. MOIC Calculation Approach Not Validated

**Problem**: Phase 0 (brainstorming) is marked "AWAITING USER APPROVAL" (lines
128-148), meaning the core technical decision hasn't been made yet.

**Impact**:

- ADR draft (lines 644-682) claims decision already made
- Implementation plan proceeds as if approach validated
- BigInt scaling strategy conflicts with existing code

**Evidence**:

```typescript
Existing code (lot-service.ts:259): SCALE = BigInt(100_000_000)  // 8 decimals
Proposed (ADR draft line 666):      SCALE = 1,000,000             // 6 decimals
```

**Risk**: Silent calculation errors for fractional shares < 0.00001

#### 3. Phoenix Alignment Confusion

**Plan Claims** (line 835):

```text
Phoenix Phase 3 (Week 5-6): Portfolio route consolidation
Our Work: Builds modular components that fit into unified /portfolio route
```

**Phoenix Reality**
([Phoenix doc lines 258-364](04-PHOENIX-STRATEGY-ANALYSIS.md#phase-3-ia-consolidation-week-1-6)):

```text
Phase 3: Information Architecture Consolidation (Week 1-6)
Target: Consolidate /investments, /investment-table, /cap-table
Lot tracking: NOT MENTIONED in Phoenix timeline
```

**Mismatch**:

- Phoenix Phase 3 is Week 1-6 (not Week 5-6) - see
  [timeline analysis](04-PHOENIX-STRATEGY-ANALYSIS.md#timeline-slippage-analysis)
- Lot MOIC tracking is a NEW feature, not part of consolidation
- Risk of competing /portfolio implementations

#### 4. Missing API Layer

The plan creates:

- ✅ Backend services (LotService, MOICCalculator)
- ✅ Frontend hooks (useLots, useCreateLot, useLotMOIC)
- ✅ React components (LotTracking, MOICBreakdown)
- ❌ **API routes** (GET /api/funds/:fundId/portfolio/lots)
- ❌ **Zod schemas** (ListLotsRequestSchema, MOICResponseSchema)

**Impact**: Backend services can't be tested without routes.

#### 5. Time Estimate Optimism

| Task                        | Claimed       | Realistic     | Variance |
| --------------------------- | ------------- | ------------- | -------- |
| Phase 1a (Lot service)      | 2-3 hrs       | 4-6 hrs       | +100%    |
| Phase 1b (MOIC calculator)  | 2-3 hrs       | 3-5 hrs       | +67%     |
| Phase 2b (React components) | 2-3 hrs       | 4-6 hrs       | +100%    |
| **Total**                   | **12-16 hrs** | **20-28 hrs** | **+75%** |

**Drivers**:

- TDD rigor underestimated (RED-GREEN-REFACTOR cycles)
- Component integration complexity (shadcn/ui + TanStack Query)
- Debugging time not budgeted (always 20-30% of estimate)

### Critical Gaps

1. **Cursor pagination complexity underestimated**
   - Multi-field cursors (investmentId + createdAt + id) require
     encoding/decoding logic
   - Existing LotService has stub:
     `throw new Error('Not implemented: encodeCursor()')`
   - Security validation missing (cursor must belong to same investmentId)

2. **Coding Pairs integration is vaporware**
   - Extensively described (lines 723-795) but zero executable prompts
   - No integration points in Phase 1 task prompts
   - Agents won't use this workflow without explicit calls

3. **Test baseline constraint** (74.8% pass rate)
   - Adding 50 new tests increases denominator
   - Even if all pass, margin shrinks
   - Example: 998/1337 = 74.7% → 1048/1387 = 75.5% (still OK but tight)

### Recommendations

**IMMEDIATE (Before Execution Approval):**

1. **RUN PHASE 0 BRAINSTORMING** (30 min):

   ```typescript
   Skill(
     'brainstorming',
     `
     Design MOIC calculation system:
   
     KEY QUESTIONS:
     1. Precision: 6-decimal (1M scale) or 8-decimal (100M scale)?
        Constraint: Cost basis uses 100M scale (lot-service.ts:259)
     2. Edge cases: Zero cost basis, negative values, empty arrays?
     3. Blended MOIC: Simple or weighted average? Why?
     4. Performance: On-demand or cached for 1000+ lots?
   `
   );
   ```

2. **CLARIFY PHOENIX ALIGNMENT** (15 min):
   - Question: "Is lot MOIC tracking standalone OR part of Phoenix /portfolio?"
   - If integrated: Coordinate with Phoenix Phase 3 timeline
   - If standalone: Define navigation placement

3. **ADD MISSING API LAYER** (10 min):

   ```text
   Phase 1.5: API Route Implementation (2-3 hours)
   - Create server/routes/portfolio-lots.ts
   - Create shared/schemas/portfolio-lots.ts
   - Integrate with existing portfolio route
   ```

4. **FIX BIGINT PRECISION** (5 min):
   - Change 1,000,000 → 100,000,000 in ADR draft
   - Update MOICCalculator prompts to match

**DURING EXECUTION:**

5. Make TDD workflow explicit in prompts (use
   `Skill("test-driven-development")`)
6. Integrate Coding Pairs with executable prompts (add `Task()` calls)
7. Add verification checkpoints after each phase

### Risk Assessment

| Risk                           | Severity | Probability | Mitigation                      |
| ------------------------------ | -------- | ----------- | ------------------------------- |
| MOIC calculation not validated | **P0**   | 100%        | Run Phase 0 brainstorming FIRST |
| Phoenix alignment undefined    | **P0**   | 80%         | Get user decision NOW           |
| API layer missing              | **P0**   | 100%        | Add Phase 1.5 to plan           |
| Time estimates too low         | **P1**   | 70%         | Revise to 20-28 hours           |
| Cursor pagination complexity   | **P1**   | 60%         | Create reusable helper library  |
| BigInt precision mismatch      | **P1**   | 50%         | Fix before implementation       |

**Final Verdict**: PLAN STATUS - NOT READY FOR EXECUTION
