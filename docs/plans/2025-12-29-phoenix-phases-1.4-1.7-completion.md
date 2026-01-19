---
status: HISTORICAL
last_updated: 2026-01-19
---

# Phoenix Phases 1.4-1.7 Completion Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete Phoenix Phase 1 validation by validating Capital Allocation (20 scenarios) and Exit Recycling (20 scenarios), eradicating parseFloat in P0 calculation paths, and completing final validation with documentation sync.

**Architecture:** Leverage existing adapter pattern from fee-adapter.ts and waterfall-ledger-adapter.ts. Create similar adapters for Capital Allocation and Exit Recycling, run truth cases, triage failures, fix truth case errors (not code bugs based on prior pattern), then harden precision and sync documentation.

**Tech Stack:** TypeScript, Vitest, Decimal.js, Zod validation, Phoenix agents

**Status:** Based on Phase 1.3 completion (XIRR 100%, Waterfall 100%, Fees 100%), we follow Phase 1A cleanup path.

---

## Pre-Flight: Fix Test Environment (5 minutes)

### Task 0: Install Missing cross-env Dependency

**Files:**
- Modify: `package.json`

**Step 1: Install cross-env**

```bash
npm install --save-dev cross-env
```

**Step 2: Verify test runner works**

```bash
npm test -- --run 2>&1 | head -30
```

**Expected:** Test runner executes (may have failures, but no `cross-env: not found`)

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "fix(test): install cross-env for test runner compatibility"
```

---

## Phase 1.4: Capital Allocation Validation (3-4 hours)

### Task 1.4.1: Create Capital Allocation Adapter

**Files:**
- Create: `tests/truth-cases/adapters/capital-allocation-adapter.ts`
- Reference: `docs/capital-allocation.truth-cases.json`

**Step 1: Write failing test for adapter loading**

```typescript
// tests/truth-cases/capital-allocation.test.ts
import { describe, it, expect } from 'vitest';
import truthCases from '../../../docs/capital-allocation.truth-cases.json';
import { adaptCapitalAllocationCase } from './adapters/capital-allocation-adapter';

describe('Capital Allocation Truth Cases', () => {
  it('loads all 20 truth cases', () => {
    expect(truthCases).toHaveLength(20);
  });

  it('adapts CA01 to production function signature', () => {
    const adapted = adaptCapitalAllocationCase(truthCases[0]);
    expect(adapted.input).toBeDefined();
    expect(adapted.expected).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/truth-cases/capital-allocation.test.ts --run
```

**Expected:** FAIL - Adapter not found

**Step 3: Implement adapter (following fee-adapter.ts pattern)**

```typescript
// tests/truth-cases/adapters/capital-allocation-adapter.ts
import type { CapitalAllocationInput, CapitalAllocationResult } from '@shared/types';

interface TruthCase {
  scenario: string;
  description?: string;
  input: {
    fundSize: number;
    deploymentSchedule: Array<{ quarter: number; amount: number }>;
    stageAllocations?: Record<string, number>;
    // ... other fields from truth case JSON
  };
  expected: {
    totalDeployed: number;
    remainingCapital: number;
    quarterlyBreakdown?: Array<{
      quarter: number;
      deployed: number;
      cumulative: number;
    }>;
    // ... other expected fields
  };
}

export function adaptCapitalAllocationCase(tc: TruthCase): {
  input: CapitalAllocationInput;
  expected: CapitalAllocationResult;
  scenario: string;
} {
  // Scale from $M (truth case) to $ (production)
  const SCALE = 1_000_000;

  return {
    scenario: tc.scenario,
    input: {
      fundSize: tc.input.fundSize * SCALE,
      deploymentSchedule: tc.input.deploymentSchedule.map(d => ({
        quarter: d.quarter,
        amount: d.amount * SCALE,
      })),
      stageAllocations: tc.input.stageAllocations,
    },
    expected: {
      totalDeployed: tc.expected.totalDeployed * SCALE,
      remainingCapital: tc.expected.remainingCapital * SCALE,
      quarterlyBreakdown: tc.expected.quarterlyBreakdown?.map(q => ({
        quarter: q.quarter,
        deployed: q.deployed * SCALE,
        cumulative: q.cumulative * SCALE,
      })),
    },
  };
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- tests/truth-cases/capital-allocation.test.ts --run
```

**Expected:** PASS

**Step 5: Commit**

```bash
git add tests/truth-cases/
git commit -m "feat(truth-cases): add capital allocation adapter following fee-adapter pattern"
```

---

### Task 1.4.2: Map Production Code to Truth Cases

**Objective:** Identify which functions implement capital allocation calculations.

**Step 1: Search for capital allocation functions**

```bash
rg "allocat" --type ts server/ client/src/core/ shared/ | head -50
rg "deployCapital|capitalAllocation" --type ts server/ client/
```

**Step 2: Document code mapping**

| Truth Case Field | Production Function | File:Line |
|------------------|---------------------|-----------|
| totalDeployed | TBD | TBD |
| remainingCapital | TBD | TBD |
| quarterlyBreakdown | TBD | TBD |

**Step 3: Update adapter to call production functions**

Modify `capital-allocation-adapter.ts` to import and use actual production functions.

---

### Task 1.4.3: Run Capital Allocation Truth Cases

**Files:**
- Modify: `tests/truth-cases/capital-allocation.test.ts`

**Step 1: Write full test suite**

```typescript
import { describe, it, expect } from 'vitest';
import truthCases from '../../../docs/capital-allocation.truth-cases.json';
import { adaptCapitalAllocationCase } from './adapters/capital-allocation-adapter';
import { calculateCapitalAllocation } from '@/core/capitalAllocation'; // Production function

describe('Capital Allocation Truth Cases (20 scenarios)', () => {
  truthCases.forEach((tc, index) => {
    it(`CA${String(index + 1).padStart(2, '0')}: ${tc.scenario}`, () => {
      const { input, expected } = adaptCapitalAllocationCase(tc);
      const result = calculateCapitalAllocation(input);

      // Use toBeCloseTo for numeric comparisons (6 decimal precision)
      expect(result.totalDeployed).toBeCloseTo(expected.totalDeployed, 6);
      expect(result.remainingCapital).toBeCloseTo(expected.remainingCapital, 6);

      // Validate quarterly breakdown if present
      if (expected.quarterlyBreakdown) {
        expected.quarterlyBreakdown.forEach((eq, qi) => {
          expect(result.quarterlyBreakdown[qi].deployed).toBeCloseTo(eq.deployed, 6);
          expect(result.quarterlyBreakdown[qi].cumulative).toBeCloseTo(eq.cumulative, 6);
        });
      }
    });
  });
});
```

**Step 2: Run truth case suite**

```bash
npm test -- tests/truth-cases/capital-allocation.test.ts --run --reporter=verbose
```

**Step 3: Capture results**

Record pass/fail counts in `docs/phase0-validation-report.md`:

```markdown
| Capital Allocation | 20 | X/20 | X% | TBD | [PASS/FAIL] | Phase 1.4 |
```

---

### Task 1.4.4: Triage Capital Allocation Failures

**Objective:** Classify each failure as CODE BUG, TRUTH CASE ERROR, or MISSING FEATURE.

**Agent Invocation:**

```bash
Task("phoenix-capital-allocation-analyst", "Classify CA failures - determine if truth case errors or code bugs")
```

**Step 1: For each failure, analyze:**

1. Compare expected vs actual values
2. Check if expected value is arithmetically correct
3. Trace production code to understand calculation
4. Classify: `TRUTH_CASE_ERROR` (like XIRR/Fees) or `CODE_BUG`

**Step 2: Document in `docs/failure-triage.md`**

```markdown
### Capital Allocation Failures

| Test ID | Error Type | Root Cause | Fix Location |
|---------|------------|------------|--------------|
| CA01 | TRUTH_CASE_ERROR | Expected totalDeployed wrong | docs/capital-allocation.truth-cases.json |
| CA15 | TRUTH_CASE_ERROR | quarterlyBreakdown sum mismatch | docs/capital-allocation.truth-cases.json |
```

---

### Task 1.4.5: Fix Capital Allocation Truth Cases

**Based on Task 1.4.4 triage, fix truth case errors.**

**Step 1: For each TRUTH_CASE_ERROR, correct expected value**

Edit `docs/capital-allocation.truth-cases.json` with corrected expected values.

**Step 2: Re-run truth cases after each fix**

```bash
npm test -- tests/truth-cases/capital-allocation.test.ts -t "CA01"
```

**Step 3: Commit after all fixes**

```bash
git add docs/capital-allocation.truth-cases.json
git commit -m "fix(truth-cases): correct CA expected values (X corrections)"
```

---

### Task 1.4.6: Validate Capital Allocation 100%

**Gate Criteria:** 20/20 passing (100%)

**Step 1: Run full suite**

```bash
npm test -- tests/truth-cases/capital-allocation.test.ts --run
```

**Expected:** 20 passed, 0 failed

**Step 2: Update docs/phase0-validation-report.md**

```markdown
| Capital Allocation | 20 | 20 | **100%** | N/A | [PASS] **VALIDATED** | Phase 1.4 Complete |
```

**Step 3: Commit**

```bash
git add docs/phase0-validation-report.md
git commit -m "docs: Capital Allocation validation complete (20/20 passing)"
```

---

## Phase 1.5: Exit Recycling Validation (3-4 hours)

### Task 1.5.1: Create Exit Recycling Adapter

**Files:**
- Create: `tests/truth-cases/adapters/exit-recycling-adapter.ts`
- Reference: `docs/exit-recycling.truth-cases.json`

**Step 1: Write failing test for adapter**

```typescript
// tests/truth-cases/exit-recycling.test.ts
import { describe, it, expect } from 'vitest';
import truthCases from '../../../docs/exit-recycling.truth-cases.json';
import { adaptExitRecyclingCase } from './adapters/exit-recycling-adapter';

describe('Exit Recycling Truth Cases', () => {
  it('loads all truth cases', () => {
    expect(truthCases.length).toBeGreaterThan(0);
  });

  it('adapts ER01 to production function signature', () => {
    const adapted = adaptExitRecyclingCase(truthCases[0]);
    expect(adapted.input).toBeDefined();
    expect(adapted.expected).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/truth-cases/exit-recycling.test.ts --run
```

**Step 3: Implement adapter**

```typescript
// tests/truth-cases/adapters/exit-recycling-adapter.ts
export function adaptExitRecyclingCase(tc: TruthCase): {
  input: ExitRecyclingInput;
  expected: ExitRecyclingResult;
  scenario: string;
} {
  const SCALE = 1_000_000;

  return {
    scenario: tc.scenario,
    input: {
      exitProceeds: tc.input.exitProceeds * SCALE,
      recyclingCap: tc.input.recyclingCap,
      recyclingWindow: tc.input.recyclingWindow,
      takeRate: tc.input.takeRate,
      existingRecycled: (tc.input.existingRecycled ?? 0) * SCALE,
    },
    expected: {
      recycledAmount: tc.expected.recycledAmount * SCALE,
      distributedAmount: tc.expected.distributedAmount * SCALE,
      recyclingCapRemaining: tc.expected.recyclingCapRemaining * SCALE,
    },
  };
}
```

**Step 4: Run test to verify it passes**

**Step 5: Commit**

```bash
git add tests/truth-cases/
git commit -m "feat(truth-cases): add exit recycling adapter"
```

---

### Task 1.5.2: Map Exit Recycling Production Code

**Step 1: Search for recycling functions**

```bash
rg "recycl" --type ts server/ client/src/core/ shared/
```

**Step 2: Document code mapping**

---

### Task 1.5.3: Run Exit Recycling Truth Cases

**Pattern:** Same as Task 1.4.3

---

### Task 1.5.4: Triage Exit Recycling Failures

**Agent Invocation:**

```bash
Task("phoenix-capital-allocation-analyst", "Classify ER failures - expect TRUTH_CASE_ERROR pattern from prior modules")
```

---

### Task 1.5.5: Fix Exit Recycling Truth Cases

**Pattern:** Same as Task 1.4.5

---

### Task 1.5.6: Validate Exit Recycling 100%

**Gate Criteria:** 20/20 passing (100%)

---

## Phase 1.6: Precision Hardening (2 hours)

### Task 1.6.1: Scan for parseFloat in P0 Paths

**Agent Invocation:**

```bash
Task("phoenix-precision-guardian", "Scan server/analytics/ and client/src/core/engines/ for parseFloat - report P0 violations")
```

**Step 1: Search for parseFloat**

```bash
rg "parseFloat" server/analytics/ client/src/core/ shared/lib/
```

**Step 2: Classify each occurrence**

| File | Line | Context | Priority | Action |
|------|------|---------|----------|--------|
| server/analytics/xirr.ts | 45 | Calculation | P0 | Replace with Decimal |
| client/src/core/engines/reserve.ts | 89 | Calculation | P0 | Replace with Decimal |
| server/routes/config.ts | 12 | ENV parsing | P1 | Replace with parseInt |

---

### Task 1.6.2: Replace parseFloat with Decimal.js in P0 Files

**Files:** Files identified in Task 1.6.1 as P0

**Step 1: For each P0 file, replace parseFloat**

```typescript
// BEFORE
const amount = parseFloat(input);

// AFTER
import Decimal from 'decimal.js';
const amount = new Decimal(input);
```

**Step 2: Run truth cases after each file modification**

```bash
npm test -- tests/truth-cases/ --run
```

**Step 3: Commit after all P0 files cleaned**

```bash
git add server/analytics/ client/src/core/
git commit -m "refactor(calc): replace parseFloat with Decimal.js in P0 paths"
```

---

### Task 1.6.3: Add Precision Validation Test

**Files:**
- Create: `tests/unit/precision.test.ts`

**Step 1: Write precision test**

```typescript
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';

describe('Decimal.js Precision', () => {
  it('maintains precision in chained operations', () => {
    const a = new Decimal('0.1');
    const b = new Decimal('0.2');
    const result = a.plus(b).toString();
    expect(result).toBe('0.3'); // NOT '0.30000000000000004'
  });

  it('maintains precision in large calculations', () => {
    const capital = new Decimal('100000000'); // $100M
    const rate = new Decimal('0.08'); // 8%
    const fee = capital.times(rate);
    expect(fee.toString()).toBe('8000000');
  });
});
```

**Step 2: Run test**

```bash
npm test -- tests/unit/precision.test.ts --run
```

**Step 3: Commit**

```bash
git add tests/unit/precision.test.ts
git commit -m "test: add Decimal.js precision validation"
```

---

## Phase 1.7: Final Validation & Documentation (1-2 hours)

### Task 1.7.1: Run Full Truth Case Suite

**Step 1: Run all 119 truth cases**

```bash
npm test -- tests/truth-cases/ --run --reporter=verbose
```

**Step 2: Capture results**

| Module | Scenarios | Passing | Pass Rate |
|--------|-----------|---------|-----------|
| XIRR | 51 | 51 | 100% |
| Waterfall (Tier) | 15 | 15 | 100% |
| Waterfall (Ledger) | 14 | 14 | 100% |
| Fees | 10 | 10 | 100% |
| Capital Allocation | 20 | 20 | 100% |
| Exit Recycling | 20 | 20 | 100% |
| **TOTAL** | **130** | **130** | **100%** |

---

### Task 1.7.2: Update Documentation

**Agent Invocation:**

```bash
Task("phoenix-docs-scribe", "Sync docs/calculations.md with validated truth cases - add capital allocation and exit recycling sections")
```

**Files:**
- Modify: `docs/phase0-validation-report.md`
- Modify: `CHANGELOG.md`

**Step 1: Update phase0-validation-report.md with final module status**

**Step 2: Add CHANGELOG entry**

```markdown
## [Unreleased] - 2025-12-29

### Added

- **Phase 1.4 Complete: Capital Allocation Validation**
  - 20/20 truth cases passing (100%)
  - Created capital-allocation-adapter.ts
  - X truth case corrections applied

- **Phase 1.5 Complete: Exit Recycling Validation**
  - 20/20 truth cases passing (100%)
  - Created exit-recycling-adapter.ts
  - X truth case corrections applied

- **Phase 1.6 Complete: Precision Hardening**
  - Replaced parseFloat with Decimal.js in P0 calculation paths
  - Added precision validation test suite
  - X files hardened

### Fixed

- Installed cross-env for test runner compatibility
```

---

### Task 1.7.3: Phase Gate Verification

**MANDATORY before proceeding to Phase 2**

**Step 1: Run verification checklist**

```markdown
## Phase 1 Completion Checklist

- [ ] Truth case pass rate: 130/130 (100%)
- [ ] No parseFloat in P0 calculation paths
- [ ] All TypeScript errors in P0 files: 0
- [ ] Build succeeds: `npm run build`
- [ ] Lint clean in P0 files: `npm run lint`
- [ ] CHANGELOG.md updated
- [ ] docs/phase0-validation-report.md current
```

**Step 2: Run deploy-check**

```bash
npm run check && npm run build && npm test
```

**Step 3: Commit and push**

```bash
git add .
git commit -m "feat(phoenix): Phase 1 complete - all 130 truth cases validated"
git push -u origin claude/review-execution-plan-Gdzo2
```

---

## Execution Strategy

### Batched Sequential with Review Checkpoints

**Batch 1 (Environment + Capital Allocation):** Tasks 0, 1.4.1-1.4.6
- Duration: ~4 hours
- Checkpoint: Capital Allocation 20/20 passing

**Batch 2 (Exit Recycling):** Tasks 1.5.1-1.5.6
- Duration: ~3 hours
- Checkpoint: Exit Recycling 20/20 passing

**Batch 3 (Precision + Final):** Tasks 1.6.1-1.6.3, 1.7.1-1.7.3
- Duration: ~2 hours
- Checkpoint: Phase 1 gate criteria met

### Agent Delegation Summary

| Phase | Agent | Task |
|-------|-------|------|
| 1.4.4 | phoenix-capital-allocation-analyst | Classify CA failures |
| 1.5.4 | phoenix-capital-allocation-analyst | Classify ER failures |
| 1.6.1 | phoenix-precision-guardian | Scan for parseFloat |
| 1.7.2 | phoenix-docs-scribe | Sync documentation |

### Time Estimates

| Phase | Tasks | Estimated Duration |
|-------|-------|-------------------|
| 0 (Pre-flight) | 1 | 5 minutes |
| 1.4 (Capital Allocation) | 6 | 3-4 hours |
| 1.5 (Exit Recycling) | 6 | 3-4 hours |
| 1.6 (Precision) | 3 | 2 hours |
| 1.7 (Final) | 3 | 1-2 hours |
| **TOTAL** | **19** | **9-12 hours** |

---

## Risk Mitigation

### Risk 1: Capital Allocation has CODE_BUG (not TRUTH_CASE_ERROR)

**Mitigation:** Prior modules (XIRR, Fees, Waterfall) all had 100% TRUTH_CASE_ERROR pattern. If code bug found:
1. Invoke `systematic-debugging` skill
2. Follow Phase 1B bug fix workflow
3. Use `/bugfix` command

### Risk 2: Exit Recycling has complex edge cases

**Mitigation:** Review `docs/notebooklm-sources/exit-recycling.md` (91% validation score) for domain knowledge. Invoke `waterfall-specialist` if recycling logic overlaps with waterfall.

### Risk 3: parseFloat eradication causes test failures

**Mitigation:** Run truth cases after each file modification. Decimal.js maintains higher precision, so failures indicate truth case expected values need more precision (update toBeCloseTo tolerance).

---

## Success Criteria

Upon completion of Phase 1.7:

- [ ] All 130 truth cases passing (100%)
- [ ] Capital Allocation: 20/20 (100%)
- [ ] Exit Recycling: 20/20 (100%)
- [ ] parseFloat eliminated from P0 paths
- [ ] Precision validation tests passing
- [ ] Documentation synced
- [ ] CHANGELOG updated
- [ ] Ready for Phase 2 (Advanced Forecasting)

---

## Appendix A: Available Specialized Dev Tooling

### Slash Commands (.claude/commands/)

| Command | Description | When to Use |
|---------|-------------|-------------|
| `/phoenix-truth` | Run deterministic truth case suite (119 scenarios) | Task 1.4.3, 1.5.3, 1.7.1 |
| `/fix-auto` | Automated lint, format, and simple test repair | After any code changes |
| `/test-smart` | Intelligent test selection based on file changes | Quick feedback on specific modules |
| `/deploy-check` | Comprehensive pre-deployment validation | Task 1.7.3 (final gate) |
| `/pre-commit-check` | Validate code quality before commit | Before each commit |
| `/phoenix-phase2` | Phase 2 probabilistic features | After Phase 1 completion |
| `/phoenix-prob-report` | Format Monte Carlo artifact into PR summary | Phase 2+ only |

### Phoenix-Specific Skills (.claude/skills/)

| Skill | File | When to Use |
|-------|------|-------------|
| `phoenix-capital-exit-investigator` | `/SKILL.md` | Tasks 1.4.*, 1.5.* - CA/ER validation |
| `phoenix-precision-guard` | `/SKILL.md` | Task 1.6.* - parseFloat eradication |
| `phoenix-truth-case-orchestrator` | `/SKILL.md` | All truth case validation |
| `phoenix-docs-sync` | `/SKILL.md` | Task 1.7.2 - Documentation updates |
| `phoenix-waterfall-ledger-semantics` | `/SKILL.md` | If waterfall edge cases found |
| `phoenix-xirr-fees-validator` | `/SKILL.md` | If XIRR/fees regressions |
| `phoenix-advanced-forecasting` | `/SKILL.md` | Phase 2 only |
| `phoenix-reserves-optimizer` | `/SKILL.md` | Phase 2 only |
| `phoenix-brand-reporting` | `/SKILL.md` | Phase 3+ only |

### General Skills (.claude/skills/)

| Skill | Description | When to Use |
|-------|-------------|-------------|
| `systematic-debugging` | 4-phase bug investigation | If CODE_BUG found in triage |
| `root-cause-tracing` | Trace data flow to find cause | Deep debugging |
| `task-decomposition` | Break complex tasks into subtasks | Planning future phases |
| `writing-plans` | Create detailed TDD implementation plans | New feature planning |
| `dispatching-parallel-agents` | Run independent tasks in parallel | Batch 2 CA+ER validation |
| `iterative-improvement` | Small cycles with verification | Phase 1.6 precision work |
| `multi-model-consensus` | Cross-validate complex decisions | High-stakes fixes |
| `extended-thinking-framework` | Deep analytical reasoning | Complex triage decisions |

### Workflow Engine Skills (.claude/skills/workflow-engine/)

| Skill | Description | When to Use |
|-------|-------------|-------------|
| `code-formatter` | Code style enforcement | After any code changes |
| `documentation-sync` | Keep docs aligned with code | Task 1.7.2 |
| `security-scanner` | Security vulnerability detection | Before final gate |
| `test-first-change` | TDD workflow enforcement | All implementation tasks |
| `dependency-guardian` | Dependency security & updates | Pre-flight check |
| `tech-debt-tracker` | Track and manage technical debt | parseFloat tracking |

### Phoenix Agents (.claude/agents/)

| Agent | Primary Use | Invoke With |
|-------|-------------|-------------|
| `phoenix-truth-case-runner` | Run truth case suite | `Task("phoenix-truth-case-runner", "...")` |
| `phoenix-precision-guardian` | parseFloat eradication | `Task("phoenix-precision-guardian", "...")` |
| `waterfall-specialist` | Waterfall edge cases | `Task("waterfall-specialist", "...")` |
| `xirr-fees-validator` | XIRR/fees Excel parity | `Task("xirr-fees-validator", "...")` |
| `phoenix-capital-allocation-analyst` | CA/ER investigation | `Task("phoenix-capital-allocation-analyst", "...")` |
| `phoenix-docs-scribe` | Documentation sync | `Task("phoenix-docs-scribe", "...")` |
| `phoenix-probabilistic-engineer` | Phase 2 forecasting | Phase 2+ only |
| `phoenix-reserves-optimizer` | Reserve allocation | Phase 2+ only |
| `phoenix-brand-reporting-stylist` | Brand consistency | Phase 3+ only |

### Domain Knowledge Sources (docs/notebooklm-sources/)

| Source | Validation Score | Topics Covered |
|--------|-----------------|----------------|
| `xirr.md` | 91% | XIRR calculation, sign conventions |
| `waterfall.md` | 95% | Tier/ledger semantics, clawback |
| `fees.md` | 91% | Fee bases, timing, step-down |
| `capital-allocation.md` | 91% | Deployment, stage allocations |
| `exit-recycling.md` | 91% | Take rate, cap, window |
| `reserves/*.md` (4 files) | 95-99% | Phase 2 engine specs |
| `pacing/*.md` (4 files) | 95-99% | Phase 2 engine specs |
| `cohorts/*.md` (3 files) | 95-99% | Phase 2 engine specs |
| `monte-carlo/*.md` (4 files) | 95-99% | Phase 2 simulation specs |

### Quick Reference: Phase 1.4-1.7 Tooling Map

```
Phase 1.4 (Capital Allocation)
|-- Command: /phoenix-truth focus=capital
|-- Skill: phoenix-capital-exit-investigator
|-- Agent: phoenix-capital-allocation-analyst
|-- Domain: docs/notebooklm-sources/capital-allocation.md
+-- Verify: /test-smart capital-allocation

Phase 1.5 (Exit Recycling)
|-- Command: /phoenix-truth focus=recycling
|-- Skill: phoenix-capital-exit-investigator
|-- Agent: phoenix-capital-allocation-analyst
|-- Domain: docs/notebooklm-sources/exit-recycling.md
+-- Verify: /test-smart exit-recycling

Phase 1.6 (Precision Hardening)
|-- Command: /fix-auto
|-- Skill: phoenix-precision-guard
|-- Agent: phoenix-precision-guardian
|-- Workflow: tech-debt-tracker
+-- Verify: /pre-commit-check

Phase 1.7 (Final Validation)
|-- Command: /phoenix-truth (all)
|-- Command: /deploy-check
|-- Skill: phoenix-docs-sync
|-- Agent: phoenix-docs-scribe
+-- Gate: All 130 truth cases passing
```

---

**Plan Created:** 2025-12-29
**Author:** Claude Code (using task-decomposition + writing-plans skills)
**Status:** Ready for Execution

---

## Execution Commands

**Start Execution (Recommended):**

```bash
# Option 1: Use executing-plans skill (if available)
# Reference this plan file and execute task-by-task

# Option 2: Subagent-driven execution
Task("general-purpose", "Execute docs/plans/2025-12-29-phoenix-phases-1.4-1.7-completion.md - start with Task 0")

# Option 3: Manual step-by-step
# Follow each task in order, marking completed in TodoWrite
```

**Monitor Progress:**

```bash
# Check truth case status
/phoenix-truth focus=all

# Verify quality gates
/deploy-check

# Smart test selection
/test-smart
```

**Quick Validation Commands:**

```bash
# Fix test environment (Task 0)
npm install --save-dev cross-env

# Run Capital Allocation truth cases
npm test -- tests/truth-cases/capital-allocation.test.ts --run

# Run Exit Recycling truth cases
npm test -- tests/truth-cases/exit-recycling.test.ts --run

# Scan for parseFloat
rg "parseFloat" server/analytics/ client/src/core/

# Final validation
npm run check && npm run build && npm test
```
