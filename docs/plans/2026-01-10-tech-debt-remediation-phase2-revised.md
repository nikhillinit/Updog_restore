# Technical Debt Remediation Phase 2 - Revised Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Reduce technical debt score from 650 to <400 by completing schema
split, eliminating precision risks in financial calculations, and strengthening
quality gates.

**Revision Date:** 2026-01-10 **Revision Reason:** Expanded scope based on
codebase audit findings

**Architecture:** Incremental refactoring with staged rollout. Each task follows
TDD cycle (RED-GREEN-REFACTOR) with frequent commits. Decimal.js already
installed - ready for precision work.

**Tech Stack:** TypeScript, Drizzle ORM, Zod validation, ESLint, Vitest,
Decimal.js

---

## Leverage Existing Dev Tools & Assets (ULTRATHINK ADDITION)

**Available capabilities that accelerate this plan:**

| Asset                        | Type  | Usage                                      |
| ---------------------------- | ----- | ------------------------------------------ |
| `phoenix-precision-guard`    | Skill | Invoke for parseFloat replacement workflow |
| `financial-calc-correctness` | Skill | Tolerance documentation, mass conservation |
| `tech-debt-tracker`          | Skill | Generate SQALE metrics before/after        |
| `phoenix-precision-guardian` | Agent | Dispatch for Batch B execution             |
| `parity-auditor`             | Agent | Verify no Excel parity regression          |

**Integration points in plan:**

1. **Before Batch B:** Run `tech-debt-tracker scan` for baseline SQALE index
2. **During B1-B6:** Use `phoenix-precision-guard` skill patterns for parseFloat
   triage
3. **After each file:** Run `parity-auditor` to verify no regression
4. **After Batch B:** Generate comparative debt metrics showing improvement

**Slash commands available:**

- `/fix-auto` - Auto-repair lint/format issues after changes
- `/phoenix-truth` - Run deterministic truth cases for validation
- `/pre-commit-check` - Validate before commits
- `/test-smart` - Run only affected tests for fast feedback

**Agent dispatch pattern for Batch B:**

```bash
# Use Task tool to launch phoenix-precision-guardian for each file
Task(subagent_type="phoenix-precision-guardian",
     prompt="Replace parseFloat in variance-tracking.ts with Decimal.js using toDecimal utility")
```

---

## What's Changed from Original Plan

| Aspect               | Original     | Revised                | Reason                          |
| -------------------- | ------------ | ---------------------- | ------------------------------- |
| parseFloat scope     | 13 in 1 file | 77+ in 12 files        | Audit revealed broader issue    |
| eslint-disable scope | 107 total    | 162 in production code | Excluded archives/docs          |
| Batch A              | 5 tasks      | COMPLETED              | PR #373 ready to merge          |
| Batch B              | 4 tasks      | 6 tasks (tiered)       | Prioritized by financial impact |
| Batch C              | 3 tasks      | 4 tasks                | Added validation step           |

---

## Phase Overview

| Batch | Focus            | Tasks   | Risk Level | Status         |
| ----- | ---------------- | ------- | ---------- | -------------- |
| A     | Schema Split     | 5 tasks | MEDIUM     | DONE (PR #373) |
| B     | Precision Safety | 6 tasks | HIGH       | PENDING        |
| C     | Quality Gates    | 4 tasks | LOW        | PENDING        |

**CHECKPOINT** after each batch for review.

---

## Risk Mitigation Matrix

| Risk                                            | Probability | Impact | Mitigation                  |
| ----------------------------------------------- | ----------- | ------ | --------------------------- |
| Decimal.js API misuse                           | MEDIUM      | HIGH   | Write precision tests FIRST |
| parseFloat in hot paths causing perf regression | LOW         | MEDIUM | Benchmark before/after      |
| Breaking existing variance calculations         | MEDIUM      | HIGH   | Golden file tests           |
| eslint-disable removal causing type errors      | LOW         | LOW    | Fix types before removing   |

---

## Batch A: Schema Split - COMPLETED

**Status:** Done - 7 commits in PR #373

| Task                                          | Status | Commit     |
| --------------------------------------------- | ------ | ---------- |
| A0: Prerequisite verification                 | DONE   | (analysis) |
| A1: Fund schema module                        | DONE   | 3b746ab    |
| A2: Portfolio schema module                   | DONE   | 2364889    |
| A3: Scenario schema module                    | DONE   | 39b9a82    |
| A4: Schema index                              | DONE   | c2c0992    |
| A5: Runtime smoke test                        | DONE   | d94d738    |
| Security fix: Remove duplicate insert schemas | DONE   | 03adf4e    |

**Action Required:** Merge PR #373 before proceeding to Batch B.

---

## Batch B: Precision Safety (Expanded)

**Problem:** 77+ `parseFloat` usages in financial calculation paths risk
precision loss for large dollar amounts and percentage calculations.

**Solution:** Staged replacement with Decimal.js, prioritized by financial
impact.

### Task B0: Precision Baseline and Configuration (ULTRATHINK ADDITION)

**Files:**

- Verify: `package.json` (Decimal.js version)
- Create: `server/lib/decimal-config.ts` (precision configuration)
- Create: `tests/__snapshots__/variance-baseline.snap` (golden values)

**Step 1: Verify Decimal.js version and configuration**

```bash
npm list decimal.js
```

Expected: decimal.js@10.x.x or higher

**Step 2: Create precision configuration file**

Location: `server/lib/decimal-config.ts`

```typescript
/**
 * Decimal.js precision configuration for financial calculations
 *
 * Uses IEEE 754 decimal128 precision (34 significant digits)
 * with banker's rounding for financial accuracy.
 *
 * @module server/lib/decimal-config
 */
import Decimal from 'decimal.js';

// Configure globally ONCE at startup
Decimal.set({
  precision: 34, // IEEE 754 decimal128 - handles any financial amount
  rounding: Decimal.ROUND_HALF_EVEN, // Banker's rounding for unbiased financial calculations
  toExpNeg: -18, // Smallest exponent before switching to exponential notation
  toExpPos: 18, // Largest exponent before switching to exponential notation
  minE: -9e15, // Minimum exponent
  maxE: 9e15, // Maximum exponent
});

export { Decimal };
```

**Step 3: Create precision baseline snapshot**

```bash
npm test -- --run variance-tracking --update-snapshot
```

**Step 4: Run performance baseline**

```bash
npm run bench -- variance-tracking 2>&1 | tee /tmp/precision-baseline.txt
```

**Step 5: Commit baseline**

```bash
git add server/lib/decimal-config.ts tests/__snapshots__/
git commit -m "chore(precision): add Decimal.js IEEE 754 configuration and baseline"
```

---

### Tier 1: Critical Financial Paths (P0)

These files directly compute LP-facing metrics.

**EXECUTION ORDER (ULTRATHINK OPTIMIZATION):**

1. B0.5: decimal-utils (foundation - all others depend on this)
2. B3: lp-queries (HIGHEST PRIORITY - LP-facing reports)
3. B1: variance-tracking (most instances, internal metrics)
4. B2: monte-carlo-simulation (complex calculation paths)

#### Task B1: Variance Tracking Precision (13 instances)

**Files:**

- Modify: `server/services/variance-tracking.ts`
- Create: `tests/unit/services/variance-tracking-precision.test.ts`

**parseFloat instances to replace:**

| Line    | Current Code                                 | Purpose             |
| ------- | -------------------------------------------- | ------------------- |
| 193     | `parseFloat(inv.amount.toString())`          | Investment sum      |
| 215     | `parseFloat(b.currentValuation!.toString())` | Valuation sort      |
| 356     | `parseFloat(insights.overallScore)`          | Score tracking      |
| 361     | `parseFloat(insights.dataQualityScore)`      | Quality score       |
| 434     | `parseFloat(current.totalValue.toString())`  | Value comparison    |
| 435     | `parseFloat(baseline.totalValue.toString())` | Baseline comparison |
| 443     | `parseFloat(current.irr.toString())`         | IRR variance        |
| 448     | `parseFloat(current.multiple.toString())`    | Multiple variance   |
| 453     | `parseFloat(current.dpi.toString())`         | DPI variance        |
| 458     | `parseFloat(current.tvpi.toString())`        | TVPI variance       |
| 618     | `parseFloat(rule.thresholdValue.toString())` | Threshold check     |
| 905-906 | `parseFloat(alertData.*.toString())`         | Alert values        |

**Step 1: Create precision test (RED)**

Location: `tests/unit/services/variance-tracking-precision.test.ts`

```typescript
/**
 * Variance Tracking Precision Tests
 *
 * Verifies financial calculations maintain precision with Decimal.js
 */
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';

describe('Variance Tracking Precision', () => {
  describe('Investment Amount Calculations', () => {
    it('maintains precision for large investment sums', () => {
      // Amounts that would lose precision with parseFloat
      const amounts = [
        '123456789.123456789',
        '987654321.987654321',
        '555555555.555555555',
      ];

      const sum = amounts.reduce(
        (acc, amt) => acc.plus(new Decimal(amt)),
        new Decimal(0)
      );

      // Expected: 1666666666.666666665
      expect(sum.toString()).toBe('1666666666.666666665');
    });

    it('handles currency floating point edge cases', () => {
      // Classic: 0.1 + 0.2 !== 0.3 in JavaScript
      const a = new Decimal('0.1');
      const b = new Decimal('0.2');
      const result = a.plus(b);

      expect(result.toString()).toBe('0.3');
      expect(result.eq('0.3')).toBe(true);
    });
  });

  // ULTRATHINK ADDITION: Edge case tests
  describe('Edge Cases (ULTRATHINK ADDITION)', () => {
    it('handles NaN input gracefully', () => {
      const result = toDecimal(NaN, '0');
      expect(result.toString()).toBe('0');
    });

    it('handles Infinity input gracefully', () => {
      const result = toDecimal(Infinity, '0');
      expect(result.toString()).toBe('0');
    });

    it('handles negative zero correctly', () => {
      const result = toDecimal(-0);
      expect(result.toString()).toBe('0');
      expect(result.isZero()).toBe(true);
    });

    it('preserves precision when toNumber() would lose it', () => {
      const big = new Decimal('12345678901234567890.123');
      // toNumber() loses precision for very large numbers
      expect(big.toNumber()).not.toBe(12345678901234567890.123);
      // toString() preserves it
      expect(big.toString()).toBe('12345678901234567890.123');
    });

    it('handles scientific notation strings', () => {
      const result = toDecimal('1.5e10');
      expect(result.toString()).toBe('15000000000');
    });
  });

  describe('IRR/TVPI Variance Calculations', () => {
    it('calculates IRR variance with high precision', () => {
      const currentIrr = new Decimal('0.15234567890123456');
      const baselineIrr = new Decimal('0.15234567890123450');

      const variance = currentIrr.minus(baselineIrr);

      // Should detect 6e-17 difference
      expect(variance.toString()).toBe('0.000000000000000006');
      expect(variance.isZero()).toBe(false);
    });

    it('calculates TVPI variance correctly', () => {
      const current = new Decimal('2.345678901234567');
      const baseline = new Decimal('2.345678901234560');

      const variance = current.minus(baseline);
      const percentChange = variance.div(baseline).mul(100);

      expect(variance.gt(0)).toBe(true);
      expect(percentChange.toFixed(15)).not.toBe('0.000000000000000');
    });
  });

  describe('Threshold Comparisons', () => {
    it('correctly compares values near threshold', () => {
      const threshold = new Decimal('0.05'); // 5% threshold
      const value = new Decimal('0.0500000000000001');

      // parseFloat would consider these equal
      expect(value.gt(threshold)).toBe(true);
    });
  });
});
```

**Step 2: Run test to establish baseline**

```bash
npm test -- --run variance-tracking-precision.test.ts
```

Expected: Tests should PASS (Decimal.js API verification)

**Step 3: Create Decimal utility helper**

Location: `server/lib/decimal-utils.ts`

```typescript
/**
 * Decimal.js utilities for financial calculations
 *
 * Provides safe conversion from various input types to Decimal.
 * Use these helpers instead of parseFloat for financial paths.
 *
 * @module server/lib/decimal-utils
 */
import Decimal from 'decimal.js';

// Configure Decimal.js for financial calculations
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9,
  toExpPos: 20,
});

/**
 * Safely convert value to Decimal
 * Handles: string, number, Decimal, null, undefined
 */
export function toDecimal(
  value: string | number | Decimal | null | undefined,
  fallback = '0'
): Decimal {
  if (value === null || value === undefined) {
    return new Decimal(fallback);
  }
  if (value instanceof Decimal) {
    return value;
  }
  try {
    return new Decimal(value.toString());
  } catch {
    return new Decimal(fallback);
  }
}

/**
 * Sum an array of values as Decimals
 */
export function sumDecimals(
  values: (string | number | Decimal | null | undefined)[]
): Decimal {
  return values.reduce(
    (acc: Decimal, val) => acc.plus(toDecimal(val)),
    new Decimal(0)
  );
}

/**
 * Calculate variance between two values
 */
export function decimalVariance(
  current: string | number | Decimal | null | undefined,
  baseline: string | number | Decimal | null | undefined
): Decimal {
  return toDecimal(current).minus(toDecimal(baseline));
}

/**
 * Compare value against threshold
 */
export function exceedsThreshold(
  value: string | number | Decimal | null | undefined,
  threshold: string | number | Decimal | null | undefined
): boolean {
  return toDecimal(value).abs().gt(toDecimal(threshold));
}
```

**Step 4: Replace parseFloat in variance-tracking.ts**

Example transformation:

```typescript
// BEFORE (line 193)
const totalInvested =
  company.investments.reduce(
    (compSum, inv) => compSum + parseFloat(inv.amount.toString()),
    0
  ) || 0;

// AFTER
import { toDecimal, sumDecimals } from '../lib/decimal-utils';

const totalInvested = sumDecimals(
  company.investments.map((inv) => inv.amount)
).toNumber();
```

```typescript
// BEFORE (line 443)
calculations.irrVariance =
  parseFloat(current.irr.toString()) - parseFloat(baseline.irr.toString());

// AFTER
import { decimalVariance } from '../lib/decimal-utils';

calculations.irrVariance = decimalVariance(
  current.irr,
  baseline.irr
).toNumber();
```

**Step 5: Run existing variance tracking tests**

```bash
npm test -- --run variance-tracking
```

Expected: All existing tests pass

**Step 6: Commit**

```bash
git add server/lib/decimal-utils.ts server/services/variance-tracking.ts tests/unit/services/variance-tracking-precision.test.ts
git commit -m "fix(precision): replace parseFloat with Decimal.js in variance-tracking

- Add decimal-utils helper library
- Replace 13 parseFloat calls with precision-safe Decimal operations
- Add precision test suite for variance calculations"
```

---

#### Task B2: Monte Carlo Simulation Precision (10 instances)

**Files:**

- Modify: `server/services/monte-carlo-simulation.ts`
- Test: Existing Monte Carlo tests

**parseFloat instances (lines):** 332, 505, 506, 507, 610, 611, 896

**Step 1: Identify each usage**

```bash
grep -n "parseFloat" server/services/monte-carlo-simulation.ts
```

**Step 2: Apply same Decimal.js pattern**

```typescript
// BEFORE
const baselineTotalValue = parseFloat(baseline.totalValue.toString());

// AFTER
import { toDecimal } from '../lib/decimal-utils';

const baselineTotalValue = toDecimal(baseline.totalValue).toNumber();
```

**Step 3: Run Monte Carlo tests**

```bash
npm test -- --run monte-carlo
```

**Step 4: Commit**

```bash
git add server/services/monte-carlo-simulation.ts
git commit -m "fix(precision): replace parseFloat with Decimal.js in monte-carlo-simulation"
```

---

#### Task B3: LP Queries Precision (13 instances)

**Files:**

- Modify: `server/services/lp-queries.ts`

**Critical:** These values are shown directly to LPs in reports.

**parseFloat instances (lines):** 384-388, 391, 394, 478-482

**Pattern:** All are metric conversions (IRR, MOIC, DPI, RVPI, TVPI)

```typescript
// BEFORE
irr: parseFloat(snapshot.irr?.toString() || '0'),
moic: parseFloat(snapshot.moic?.toString() || '1'),

// AFTER
import { toDecimal } from '../lib/decimal-utils';

irr: toDecimal(snapshot.irr, '0').toNumber(),
moic: toDecimal(snapshot.moic, '1').toNumber(),
```

**Commit:**

```bash
git commit -m "fix(precision): replace parseFloat with Decimal.js in lp-queries"
```

---

### Tier 2: Calculation Engines (P1)

Lower priority - internal calculations that feed into Tier 1.

#### Task B4: Projected Metrics Calculator (8 instances)

**Files:** `server/services/projected-metrics-calculator.ts`

**Lines:** 158, 161, 190, 191, 433, 438, 439

**Step 1: Replace using same pattern**

**Step 2: Commit**

```bash
git commit -m "fix(precision): replace parseFloat with Decimal.js in projected-metrics-calculator"
```

---

#### Task B5: Monte Carlo Engine (Streaming) (11 instances)

**Files:** `server/services/streaming-monte-carlo-engine.ts`

**Lines:** 815, 816, 842, 868, 872, 876, 904

**Pattern:** Same as monte-carlo-simulation.ts

---

#### Task B6: Reserve Optimization Calculator (5 instances)

**Files:** `server/services/reserve-optimization-calculator.ts`

**Lines:** 475, 489, 491, 597, 648

---

**CHECKPOINT B:** Precision safety complete.

**Verification:**

- [ ] All 60 parseFloat calls in P0/P1 files replaced
- [ ] Decimal-utils library created and tested
- [ ] No performance regression (benchmark critical paths)
- [ ] All existing tests pass
- [ ] New precision tests pass

**Rollback Instructions:**

```bash
# View Batch B commits
git log --oneline -10

# If precision changes cause issues:
git revert HEAD~6..HEAD --no-commit
git commit -m "revert: rollback Decimal.js changes due to [ISSUE]"
```

---

## Batch C: Quality Gates (Refined Scope)

**Problem:** 162 `eslint-disable` statements in production code bypass quality
rules.

**Scope Breakdown:**

- Server code: 122 occurrences across 57 files
- Client code: 40 occurrences across 24 files
- Type declaration files (\*.d.ts): ~35 (KEEP - necessary for type augmentation)
- Actual removable: ~127

### Task C0: Verify Current Lint State

**Step 1: Run lint and capture baseline**

```bash
npm run lint 2>&1 | tee /tmp/lint-baseline.txt
```

**Step 2: Document current warning/error count**

```bash
echo "Baseline lint issues: $(grep -c 'warning\|error' /tmp/lint-baseline.txt || echo 0)"
```

---

### Task C1: Create eslint-disable Audit Document

**Files:**

- Create: `docs/tech-debt/eslint-disable-audit.md`

**Step 1: Generate categorized list**

```bash
# Production code only (exclude *.d.ts, tests, archives)
grep -rn "eslint-disable" server/ client/src/ \
  --include="*.ts" --include="*.tsx" \
  | grep -v ".d.ts" \
  | grep -v ".test." \
  | grep -v "archive/" \
  > /tmp/eslint-audit.txt

wc -l /tmp/eslint-audit.txt
```

**Step 2: Create audit document**

Location: `docs/tech-debt/eslint-disable-audit.md`

```markdown
# ESLint Disable Audit

**Date:** 2026-01-10 **Auditor:** Claude Code **Total Production Disables:**
~127

## Categories

### KEEP (Type Augmentation) - ~35 items

These are in \*.d.ts files for Express, WebSocket, and other type augmentations.
Required for TypeScript module augmentation.

### REMOVE (Quick Fix) - Target: 40 items

| File | Line | Rule | Fix Strategy |
| ---- | ---- | ---- | ------------ |
| ...  | ...  | ...  | ...          |

### REFACTOR (Requires Type Work) - ~50 items

| File | Line | Rule | Required Change |
| ---- | ---- | ---- | --------------- |
| ...  | ...  | ...  | ...             |

### JUSTIFY (Keep with Comment) - ~20 items

| File | Line | Rule | Justification |
| ---- | ---- | ---- | ------------- |
| ...  | ...  | ...  | ...           |
```

**Step 3: Commit audit**

```bash
git add docs/tech-debt/eslint-disable-audit.md
git commit -m "docs(tech-debt): create eslint-disable audit for 127 production statements"
```

---

### Task C2: Remove Unnecessary eslint-disable (Batch 1: 20 items)

**Target:** Server middleware and routes (highest confidence removals)

**Files likely to have easy fixes:**

- `server/middleware/*.ts` - Often just need proper async types
- `server/routes/*.ts` - Often need Zod schema types

**Step 1: Fix each identified item**

Example:

```typescript
// BEFORE
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = req.body;

// AFTER
import { z } from 'zod';
const bodySchema = z.object({ ... });
const data = bodySchema.parse(req.body);
```

**Step 2: Verify lint passes**

```bash
npm run lint
```

**Step 3: Commit**

```bash
git commit -m "fix(lint): remove 20 unnecessary eslint-disable statements in server/"
```

---

### Task C3: Remove Unnecessary eslint-disable (Batch 2: 20 items)

**Target:** Client hooks and utilities

**Files:**

- `client/src/hooks/*.ts`
- `client/src/utils/*.ts`
- `client/src/lib/*.ts`

**Same pattern as C2**

**Commit:**

```bash
git commit -m "fix(lint): remove 20 unnecessary eslint-disable statements in client/"
```

---

### Task C4: Add Justification Comments to Remaining Disables

**Target:** All KEEP and JUSTIFY items from audit

**Pattern:**

```typescript
// BEFORE
// eslint-disable-next-line @typescript-eslint/no-namespace

// AFTER
// eslint-disable-next-line @typescript-eslint/no-namespace -- Express module augmentation requires namespace
```

**Commit:**

```bash
git commit -m "docs(lint): add justification comments to 50+ remaining eslint-disable statements"
```

---

**CHECKPOINT C:** Quality gates complete.

**Verification:**

- [ ] 40 eslint-disable statements removed
- [ ] Remaining 87 have justification comments
- [ ] `npm run lint` passes with 0 new warnings
- [ ] Audit document created and categorized

---

## Execution Summary

### Success Metrics

| Metric                | Before | After Batch A | After Batch B | After Batch C | Target |
| --------------------- | ------ | ------------- | ------------- | ------------- | ------ |
| schema.ts lines       | 3,108  | ~2,600        | ~2,600        | ~2,600        | <2,500 |
| parseFloat (P0/P1)    | 60     | 60            | 0             | 0             | 0      |
| eslint-disable (prod) | 162    | 162           | 162           | ~122          | <100   |
| Debt Score            | 650    | ~550          | ~480          | ~400          | <400   |

### Commit History (Expected)

**Batch A (DONE - PR #373):**

```
refactor(schema): extract fund tables to dedicated module
refactor(schema): extract portfolio tables to dedicated module
refactor(schema): extract scenario tables to dedicated module
refactor(schema): add schema index for direct module imports
test(schema): add runtime smoke test for schema integrity
fix(types): replace any with unknown in type guards
fix(schema): remove duplicate insert schemas to prevent omit rule bypass
```

**Batch B (PENDING):**

```
fix(precision): add decimal-utils helper library
fix(precision): replace parseFloat with Decimal.js in variance-tracking
fix(precision): replace parseFloat with Decimal.js in monte-carlo-simulation
fix(precision): replace parseFloat with Decimal.js in lp-queries
fix(precision): replace parseFloat with Decimal.js in projected-metrics-calculator
fix(precision): replace parseFloat with Decimal.js in streaming-monte-carlo-engine
fix(precision): replace parseFloat with Decimal.js in reserve-optimization-calculator
```

**Batch C (PENDING):**

```
docs(tech-debt): create eslint-disable audit
fix(lint): remove 20 eslint-disable in server/
fix(lint): remove 20 eslint-disable in client/
docs(lint): add justification comments to remaining disables
```

---

## Execution Approach

**Recommended: Subagent-Driven with Checkpoints**

1. **Merge PR #373** (Batch A) - Prerequisite
2. **Execute Batch B** tasks B1-B6 sequentially
   - Create decimal-utils first (dependency for all)
   - Checkpoint after B3 (critical LP-facing code)
3. **Execute Batch C** tasks C0-C4
   - Audit first, then staged removals

**Alternative: Parallel Execution**

- Batch B and C are independent after PR #373 merge
- Can run Batch B (precision) and Batch C (lint) in parallel sessions

---

## Dependencies and Prerequisites

```
PR #373 (Batch A) ──► Batch B (Precision)
                  └──► Batch C (Quality Gates)

Batch B Internal:
  B1 (decimal-utils) ──► B2, B3, B4, B5, B6 (all use utils)

Batch C Internal:
  C0 (baseline) ──► C1 (audit) ──► C2, C3 ──► C4 (justify)
```

---

## Appendix: File Impact Summary

### Batch B Files

| File                               | parseFloat Count | Priority |
| ---------------------------------- | ---------------- | -------- |
| variance-tracking.ts               | 13               | P0       |
| monte-carlo-simulation.ts          | 10               | P0       |
| lp-queries.ts                      | 13               | P0       |
| projected-metrics-calculator.ts    | 8                | P1       |
| streaming-monte-carlo-engine.ts    | 11               | P1       |
| reserve-optimization-calculator.ts | 5                | P1       |
| **Total**                          | **60**           |          |

### Batch C Files (Top Contributors)

| File                       | eslint-disable Count |
| -------------------------- | -------------------- |
| scenarioGeneratorWorker.ts | 12                   |
| ai-orchestrator.ts         | 7                    |
| Multiple \*.d.ts files     | 5 each               |
| routes.ts                  | 3                    |
| xlsx-generation-service.ts | 3                    |

---

**Plan saved to:**
`docs/plans/2026-01-10-tech-debt-remediation-phase2-revised.md`
