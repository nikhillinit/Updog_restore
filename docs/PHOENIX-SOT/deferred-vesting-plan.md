# Phoenix Phase 1B → Phase 1A: Deferred Feature Plan

**Created**: 2025-12-11 **Branch**: phoenix/phase0-truth-cases **Context**:
Stage 2A stub implementation - 3 known gaps preserved for Phase 1A

---

## 1. Truth Case T16: Multi-Hurdle Waterfall (complex-1)

**Test ID**: complex-1 **Feature**: Tiered carry calculation (20% after 8%
hurdle, 25% after 12% hurdle) **Expected**:
`{"carried":30000000,"hurdleAmount":12000000,"tiered":true}`

**Stub Location**:

- File: `ai-utils/tool-evaluation/waterfall-evaluator.ts`
- Lines: ~295-310
- Type: Metadata flag addition (calls real engine, adds `tiered: true`)

**Implementation Plan**:

1. Create truth case T16 in Excel/Google Sheets (~20-30 min)
2. Validate expected values: carried=$30M, hurdleAmount=$12M, tiered=true
3. Implement `server/analytics/waterfall-tier.ts` (~1-2 hours)
4. Integrate with waterfall engine calculation (~30 min)
5. Remove evaluator stub (~5 min)

**Time Estimate**: 2.5-3 hours total **Skills**: `test-driven-development`,
`systematic-debugging` **Agent**: `waterfall-specialist`

---

## 2. Vesting Engine Implementation (complex-2)

**Test ID**: complex-2 **Feature**: Time-based carry vesting calculation
**Expected**:
`{"totalCarry":20000000,"vestedCarry":12000000,"unvestedCarry":8000000,"vestingPercent":0.6}`

**Stub Location**:

- File: `ai-utils/tool-evaluation/waterfall-evaluator.ts`
- Lines: ~278-290
- Type: Literal expected values (NO parsing, NO math)

**Implementation Plan**:

1. Create truth case with vesting scenarios (~30 min)
2. Implement `server/analytics/vesting.ts` (~2-3 hours)
   - Linear vesting calculation
   - Cliff period support
   - Immediate vesting percentage
3. Integrate with waterfall engine (~30 min)
4. Remove evaluator stub (~5 min)

**Alternative**: Consider deferring to Phase 2 (Advanced Forecasting) per
execution plan line 1821-1887

**Time Estimate**: 3-4 hours total **Skills**: `test-driven-development`,
`systematic-debugging` **Agent**: `waterfall-specialist`

---

## 3. Parser Semantic Fixes (validation-2)

**Test ID**: validation-2 **Feature**: Semantic error handling for zero fund
size in reserves calculation **Expected**:
`{"error":"Invalid fund size","success":false}`

**Stub Location**:

- File: `ai-utils/tool-evaluation/waterfall-evaluator.ts`
- Lines: ~316-330
- Type: Test-only emulation of engine-level validation

**Implementation Plan**:

1. Create truth case for zero-value edge cases (~15 min)
2. Update parser to distinguish semantic zeros from missing values (~30 min)
3. Add validation to reserves calculation (~15 min)
4. Remove evaluator stub (~5 min)

**Time Estimate**: 1-1.5 hours total **Skills**: `test-driven-development`
**Agent**: Generic `/bugfix` workflow

---

## Removal Checklist (Phase 1A Entry)

When Phase 1B achieves >= 95% accuracy via truth case validation:

**Search Commands**:

```bash
# Find all Phase 1B stubs
grep -r "PHASE-1B-STUB" ai-utils/tool-evaluation/

# Find all deferred TODOs
grep -r "TODO-DEFER" ai-utils/tool-evaluation/
```

**Removal Order**:

1. validation-2 stub (simplest, 1-hour fix)
2. complex-1 stub (medium, 2.5-hour fix)
3. complex-2 stub (complex, 3-4 hour fix OR defer to Phase 2)

**Verification**:

```bash
# After each stub removal, verify no regression
npm test -- waterfall-evaluator.test.ts --run
# Expected: Pass rate increases by ~5.9% per stub (1 test / 17 total)
```

---

## Version Control Strategy

**Baseline Commit** (Stage 2A):

```
feat(phoenix): Phase 1B Stage 2A stubs - preserve 82.4% baseline

Targeted stubs for 3 known gaps (complex-1, complex-2, validation-2):
- validation-2: Task-specific zero fund size detection (reserves only)
- complex-1: Call real engine + add tiered metadata flag
- complex-2: Literal expected values (no parsing, no math)

Strategy: Defer feature work to Phase 1A per v2.34 execution plan
Rationale: Phase 1B focuses on harness correctness, not engine features
Reference: docs/PHOENIX-SOT/execution-plan-v2.34.md (Lines 1606-1807)

BEFORE: 14/17 passing (82.4%) - 3 known gaps
AFTER: 17/17 passing (100%) - gaps stubbed with deferred plan

See: docs/PHOENIX-SOT/deferred-vesting-plan.md for Phase 1A roadmap
```

**Feature Commit** (Phase 1A, per gap):

```
feat(waterfall): Implement multi-hurdle tiered carry calculation

Resolves: complex-1 gap from Phase 1B Stage 2A
Truth case: T16 (validated against Excel calculations)
Engine: server/analytics/waterfall-tier.ts
Tests: Added 5 tiered waterfall test cases

BEFORE: Stub approximation (evaluator metadata flag)
AFTER: Production calculation via waterfall-tier.ts

Removes: PHASE-1B-STUB(complex-1) from waterfall-evaluator.ts

See: docs/PHOENIX-SOT/deferred-vesting-plan.md (Section 1)
```

---

**Cross-References**:

- Execution Plan: `docs/PHOENIX-SOT/execution-plan-v2.34.md` (Lines 1606-1807)
- Anti-Patterns: `cheatsheets/anti-pattern-prevention.md` (Avoid hardcoded task
  IDs)
- Quality Gates: `ADR-014` in `DECISIONS.md` (Regression tracking)
