# Action Plan

<!-- Breadcrumb Navigation -->

[← INDEX](00-INDEX.md) | [Next Section →](07-METRICS-AND-VERIFICATION.md)

**Read Time**: ~2 minutes

**Date**: 2025-11-26 **Status**: DRAFT **Source**:
STRATEGIC-DOCUMENT-REVIEW-2025-11-26.md (lines 667-727)

---

## Consolidated Recommendations

### Tier 1: CRITICAL (Do Now)

1. **Update PROJECT-UNDERSTANDING.md** (30 min)
   - Fix timestamp: Nov 10 → Nov 26 - Based on
     [timestamp mismatch analysis](03-PROJECT-UNDERSTANDING-ANALYSIS.md#critical-gaps)
   - Update Phase 0A: 15% → 100% complete - Based on
     [status contradiction](05-CROSS-DOCUMENT-SYNTHESIS.md#contradictions-matrix)
   - Correct infrastructure counts (11 packages, 195 scripts, 28 cheatsheets) -
     Based on
     [inventory inflation](03-PROJECT-UNDERSTANDING-ANALYSIS.md#-partially-accurate-sections-60-85)

2. **Resolve Phase 1 Blockers** (2 hours)
   - Run Phase 0 brainstorming (MOIC validation) - Based on
     [blocker #1](02-PHASE1-PLAN-ANALYSIS.md#2-moic-calculation-approach-not-validated)
   - Get Phoenix alignment decision (standalone vs integrated) - Based on
     [blocker #2](02-PHASE1-PLAN-ANALYSIS.md#3-phoenix-alignment-confusion)
   - Add Phase 1.5 (API routes + schemas) - Based on
     [blocker #3](02-PHASE1-PLAN-ANALYSIS.md#4-missing-api-layer)
   - Fix BigInt precision (1M → 100M) - Based on
     [blocker #4](02-PHASE1-PLAN-ANALYSIS.md#2-moic-calculation-approach-not-validated)

3. **Update Phoenix Timeline** (1 hour)
   - Document 3-week IA slippage - Based on
     [Phase 3 analysis](04-PHOENIX-STRATEGY-ANALYSIS.md#phase-3-ia-consolidation-week-1-6)
   - Revise total timeline: 21 weeks → 25-26 weeks - Based on
     [slippage analysis](04-PHOENIX-STRATEGY-ANALYSIS.md#timeline-slippage-analysis)
   - Reset stakeholder expectations

### Tier 2: HIGH PRIORITY (This Week)

4. **Set Up Quality Gates** (1 week)
   - Implement ESLint plugin (24 anti-patterns) - Based on
     [ADR-011 gap](04-PHOENIX-STRATEGY-ANALYSIS.md#vs-decisionsmd-adr-011)
   - Test pre-commit hooks
   - Document bypass procedures

5. **Create Sidecar Migration Prototype** (1 week)
   - Branch: `feat/pnpm-migration-prototype` - Based on
     [Phase 2 analysis](04-PHOENIX-STRATEGY-ANALYSIS.md#phase-2-sidecar-elimination-planned-q1-2026)
   - Test workflows (dev, build, test, lint)
   - Measure install time (verify "3x faster" claim)

6. **Verify Phase 1 Status** (4 hours)
   - Don't just check docs, verify implementation - Based on
     [Documentation ≠ Implementation](05-CROSS-DOCUMENT-SYNTHESIS.md#pattern-documentation--implementation)
   - Run truth cases for XIRR, Fees, Waterfall
   - Document gaps

### Tier 3: MEDIUM PRIORITY (Next 2 Weeks)

7. **Start IA Consolidation** (Week 50)
   - Accept 3-week slippage
   - Focus on Overview KPI binding (demo-able)
   - Parallel: Portfolio table design review

8. **Add Missing Documentation** (2 hours)
   - ADR inventory in PROJECT-UNDERSTANDING
   - Phase 0A completion as 5th quality initiative
   - Cross-reference CAPABILITIES.md

### Tier 4: ONGOING (Process Improvements)

9. **Establish Accuracy Verification Protocol**
   - Add self-verification to session handoff checklist
   - Use git dates, not content dates - Based on
     [temporal displacement pattern](05-CROSS-DOCUMENT-SYNTHESIS.md#pattern-temporal-displacement)
   - Compare docs to git commits before claiming status

10. **Create Timeline Tracking Dashboard**
    - Weekly slippage monitoring
    - Actual vs estimated time tracking - Based on
      [optimistic estimates pattern](05-CROSS-DOCUMENT-SYNTHESIS.md#pattern-optimistic-time-estimates)
    - Adjust future estimates based on actuals
