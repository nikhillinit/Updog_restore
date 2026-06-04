# Variance Calculation Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the active variance service refactor by extracting
`VarianceCalculationService` internals into focused, directly tested modules
while preserving the public `server/services/variance-tracking` facade.

**Architecture:** Keep `server/services/variance-tracking.ts` as the
compatibility facade for routes, automation, and existing imports. Extract pure
calculation helpers first, then move `VarianceCalculationService` into
`server/services/variance-tracking/calculation-service.ts` after behavior is
locked. DB reads stay in the service during the pure-helper slices so the first
commits are low-risk and reversible.

**Tech Stack:** TypeScript, Node.js, Drizzle ORM query APIs, Vitest, existing
variance tracking service tests.

---

## Scope

This plan implements the first execution slice from
`docs/superpowers/specs/2026-05-16-refactor-stability-strategy-design.md`.

In scope:

- Extract reserve and pacing diff logic into `variance-diff.ts`.
- Extract sector and stage distribution diff logic into
  `distribution-variance.ts`.
- Extract company variance row construction into `company-variance.ts`.
- Move `VarianceCalculationService` into `calculation-service.ts`.
- Keep all current imports from `server/services/variance-tracking` working.
- Replace or reduce private-method reflection tests with direct module tests.

Out of scope:

- Cleaning `server/routes/variance.ts`.
- Tightening `shared/variance-validation.ts` response schemas.
- Changing API response shapes.
- Changing alert semantics.
- Changing DB schema.
- Starting fee/economics/waterfall consolidation.

## Current Starting Point

The branch already contains these extractions:

- `server/services/variance-tracking/baseline-service.ts`
- `server/services/variance-tracking/alert-helpers.ts`
- `server/services/variance-tracking/alert-management-service.ts`
- `server/services/variance-tracking/db-error-helpers.ts`

The remaining large body is `VarianceCalculationService` in:

- `server/services/variance-tracking.ts`

Existing focused verification has passed:

```powershell
npm test -- tests/unit/services/variance-tracking.test.ts
```

Expected current result: `90 tests` pass.

## File Structure

Create:

- `server/services/variance-tracking/variance-diff.ts` - pure reserve/pacing
  snapshot diff helpers.
- `server/services/variance-tracking/distribution-variance.ts` - pure
  sector/stage count distribution diff helper.
- `server/services/variance-tracking/company-variance.ts` - pure company
  variance row helpers.
- `server/services/variance-tracking/calculation-service.ts` - extracted
  `VarianceCalculationService`.
- `tests/unit/services/variance-tracking/variance-diff.test.ts` - direct tests
  for reserve/pacing diff helpers.
- `tests/unit/services/variance-tracking/distribution-variance.test.ts` - direct
  tests for sector/stage distribution diffs.
- `tests/unit/services/variance-tracking/company-variance.test.ts` - direct
  tests for company variance row helpers.

Modify:

- `server/services/variance-tracking.ts` - shrink to facade imports, exports,
  coordinator, singleton, and `getAttributedKPIs`.
- `tests/unit/services/variance-tracking.test.ts` - keep facade/service behavior
  tests, remove reflection tests only after direct module tests cover the same
  behavior.

Do not modify:

- `server/routes/variance.ts`
- `shared/variance-validation.ts`
- `client/src/pages/variance-tracking.tsx`
- `.claude/discovery.md`
- `docs/superpowers/plans/2026-05-16-variance-tracking-service-extraction.md`

---

## Task 1: Preflight And Behavior Lock

**Files:**

- Read: `server/services/variance-tracking.ts`
- Read: `tests/unit/services/variance-tracking.test.ts`
- Modify: none

- [ ] **Step 1: Confirm only expected dirty files exist**

Run:

```powershell
git status --short
```

Expected before implementation:

```text
 M .claude/discovery.md
?? docs/superpowers/plans/2026-05-16-variance-tracking-service-extraction.md
```

If this implementation plan itself is uncommitted, it will also appear in the
status output. Do not stage `.claude/discovery.md` or the older untracked plan
unless the user explicitly asks.

- [ ] **Step 2: Run the existing service regression suite**

Run:

```powershell
npm test -- tests/unit/services/variance-tracking.test.ts
```

Expected:

```text
tests/unit/services/variance-tracking.test.ts (90 tests) passed
```

If this fails, stop the refactor and fix the baseline before moving code.

- [ ] **Step 3: Inspect current reflection tests that will be replaced**

Run:

```powershell
rg -n "\(service as any\)\.(getCurrentPortfolioMetrics|analyzeCompanyVariances|analyzeSectorVariances|analyzeStageVariances|calculateReserveVariances|calculatePacingVariances)" tests/unit/services/variance-tracking.test.ts
```

Expected matches:

```text
getCurrentPortfolioMetrics
analyzeCompanyVariances
analyzeSectorVariances
analyzeStageVariances
calculateReserveVariances
calculatePacingVariances
```

These matches define the behavior to preserve with direct module tests.

---

## Task 2: Extract Reserve And Pacing Diff Helpers

**Files:**

- Create: `server/services/variance-tracking/variance-diff.ts`
- Create: `tests/unit/services/variance-tracking/variance-diff.test.ts`
- Modify: none in production service yet

- [ ] **Step 1: Write direct tests for reserve and pacing diff behavior**

Create `tests/unit/services/variance-tracking/variance-diff.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildPacingVarianceResult,
  buildReserveVarianceResult,
  buildStructuredMetricChanges,
  coerceFiniteNumber,
} from '../../../../server/services/variance-tracking/variance-diff';

describe('variance-diff helpers', () => {
  describe('coerceFiniteNumber', () => {
    it('accepts finite numbers and numeric strings', () => {
      expect(coerceFiniteNumber(42)).toBe(42);
      expect(coerceFiniteNumber('42.5')).toBe(42.5);
      expect(coerceFiniteNumber(' 0.25 ')).toBe(0.25);
    });

    it('rejects empty strings, non-numeric strings, infinities, and nullish values', () => {
      expect(coerceFiniteNumber('')).toBeNull();
      expect(coerceFiniteNumber('not-a-number')).toBeNull();
      expect(coerceFiniteNumber(Number.POSITIVE_INFINITY)).toBeNull();
      expect(coerceFiniteNumber(null)).toBeNull();
      expect(coerceFiniteNumber(undefined)).toBeNull();
    });
  });

  describe('buildStructuredMetricChanges', () => {
    it('builds numeric deltas and omits unchanged keys', () => {
      const result = buildStructuredMetricChanges(
        { totalReserves: 600000, reserveRatio: 0.25, unchanged: 'same' },
        { totalReserves: 500000, reserveRatio: 0.2, unchanged: 'same' }
      );

      expect(result.metricDeltas.totalReserves).toEqual({
        current: 600000,
        baseline: 500000,
        delta: 100000,
        deltaPct: 0.2,
      });
      expect(result.metricDeltas.reserveRatio).toEqual({
        current: 0.25,
        baseline: 0.2,
        delta: 0.04999999999999999,
        deltaPct: 0.24999999999999994,
      });
      expect(result.changes).toEqual({});
    });

    it('captures keys present only on one side as non-numeric changes', () => {
      const result = buildStructuredMetricChanges(
        { deploymentRate: 0.9, newMetric: 42 },
        { deploymentRate: 0.8, removedMetric: 99 }
      );

      expect(result.metricDeltas).toEqual({
        deploymentRate: {
          current: 0.9,
          baseline: 0.8,
          delta: 0.09999999999999998,
          deltaPct: 0.12499999999999997,
        },
      });
      expect(result.changes.newMetric).toEqual({ current: 42, baseline: null });
      expect(result.changes.removedMetric).toEqual({
        current: null,
        baseline: 99,
      });
    });

    it('uses null deltaPct when baseline numeric value is zero', () => {
      const result = buildStructuredMetricChanges({ value: 10 }, { value: 0 });

      expect(result.metricDeltas.value).toEqual({
        current: 10,
        baseline: 0,
        delta: 10,
        deltaPct: null,
      });
    });
  });

  describe('buildReserveVarianceResult', () => {
    it('returns hasData false when either side is empty', () => {
      expect(buildReserveVarianceResult({}, { totalReserves: 500000 })).toEqual(
        {
          hasData: false,
          currentReserves: {},
          baselineReserves: {},
          metricDeltas: {},
          changes: {},
        }
      );

      expect(buildReserveVarianceResult({ totalReserves: 600000 }, {})).toEqual(
        {
          hasData: false,
          currentReserves: {},
          baselineReserves: {},
          metricDeltas: {},
          changes: {},
        }
      );
    });

    it('builds reserve deltas when both sides have data', () => {
      const result = buildReserveVarianceResult(
        { totalReserves: 600000, reserveRatio: 0.25 },
        { totalReserves: 500000, reserveRatio: 0.2 }
      );

      expect(result.hasData).toBe(true);
      expect(result.currentReserves).toEqual({
        totalReserves: 600000,
        reserveRatio: 0.25,
      });
      expect(result.baselineReserves).toEqual({
        totalReserves: 500000,
        reserveRatio: 0.2,
      });
      expect(result.metricDeltas.totalReserves.delta).toBe(100000);
      expect(result.changes).toEqual({});
    });
  });

  describe('buildPacingVarianceResult', () => {
    it('returns hasData false when either side is empty', () => {
      expect(buildPacingVarianceResult({}, { deploymentRate: 0.8 })).toEqual({
        hasData: false,
        currentPacing: {},
        baselinePacing: {},
        metricDeltas: {},
        changes: {},
      });

      expect(buildPacingVarianceResult({ deploymentRate: 0.9 }, {})).toEqual({
        hasData: false,
        currentPacing: {},
        baselinePacing: {},
        metricDeltas: {},
        changes: {},
      });
    });

    it('builds pacing deltas when both sides have data', () => {
      const result = buildPacingVarianceResult(
        { deploymentRate: 0.9, quarterlyTarget: 0.8 },
        { deploymentRate: 0.8, quarterlyTarget: 0.75 }
      );

      expect(result.hasData).toBe(true);
      expect(result.currentPacing).toEqual({
        deploymentRate: 0.9,
        quarterlyTarget: 0.8,
      });
      expect(result.baselinePacing).toEqual({
        deploymentRate: 0.8,
        quarterlyTarget: 0.75,
      });
      expect(result.metricDeltas.deploymentRate.deltaPct).toBe(
        0.12499999999999997
      );
      expect(result.changes).toEqual({});
    });
  });
});
```

- [ ] **Step 2: Run the new test and confirm it fails before implementation**

Run:

```powershell
npm test -- tests/unit/services/variance-tracking/variance-diff.test.ts
```

Expected:

```text
FAIL
Cannot find module '../../../../server/services/variance-tracking/variance-diff'
```

- [ ] **Step 3: Create the pure diff helper module**

Create `server/services/variance-tracking/variance-diff.ts`:

```typescript
import { isDeepStrictEqual } from 'node:util';

export interface MetricDelta {
  current: number;
  baseline: number;
  delta: number;
  deltaPct: number | null;
}

export interface StructuredMetricChanges {
  metricDeltas: Record<string, MetricDelta>;
  changes: Record<string, { current: unknown; baseline: unknown }>;
}

export interface ReserveVarianceResult extends StructuredMetricChanges {
  hasData: boolean;
  currentReserves: Record<string, unknown>;
  baselineReserves: Record<string, unknown>;
}

export interface PacingVarianceResult extends StructuredMetricChanges {
  hasData: boolean;
  currentPacing: Record<string, unknown>;
  baselinePacing: Record<string, unknown>;
}

export function coerceFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function buildStructuredMetricChanges(
  currentValues: Record<string, unknown>,
  baselineValues: Record<string, unknown>
): StructuredMetricChanges {
  const metricDeltas: Record<string, MetricDelta> = {};
  const changes: Record<string, { current: unknown; baseline: unknown }> = {};
  const allKeys = new Set([
    ...Object.keys(currentValues),
    ...Object.keys(baselineValues),
  ]);

  for (const key of allKeys) {
    const cur = currentValues[key];
    const base = baselineValues[key];
    if (isDeepStrictEqual(cur, base)) {
      continue;
    }

    const curNumber = coerceFiniteNumber(cur);
    const baseNumber = coerceFiniteNumber(base);
    if (curNumber !== null && baseNumber !== null) {
      const delta = curNumber - baseNumber;
      metricDeltas[key] = {
        current: curNumber,
        baseline: baseNumber,
        delta,
        deltaPct: baseNumber !== 0 ? delta / baseNumber : null,
      };
      continue;
    }

    changes[key] = { current: cur ?? null, baseline: base ?? null };
  }

  return { metricDeltas, changes };
}

export function buildReserveVarianceResult(
  currentReserves: Record<string, unknown>,
  baselineReserves: Record<string, unknown>
): ReserveVarianceResult {
  const hasData =
    Object.keys(currentReserves).length > 0 &&
    Object.keys(baselineReserves).length > 0;

  if (!hasData) {
    return {
      hasData: false,
      currentReserves: {},
      baselineReserves: {},
      metricDeltas: {},
      changes: {},
    };
  }

  const { metricDeltas, changes } = buildStructuredMetricChanges(
    currentReserves,
    baselineReserves
  );

  return {
    hasData: true,
    currentReserves,
    baselineReserves,
    metricDeltas,
    changes,
  };
}

export function buildPacingVarianceResult(
  currentPacing: Record<string, unknown>,
  baselinePacing: Record<string, unknown>
): PacingVarianceResult {
  const hasData =
    Object.keys(currentPacing).length > 0 &&
    Object.keys(baselinePacing).length > 0;

  if (!hasData) {
    return {
      hasData: false,
      currentPacing: {},
      baselinePacing: {},
      metricDeltas: {},
      changes: {},
    };
  }

  const { metricDeltas, changes } = buildStructuredMetricChanges(
    currentPacing,
    baselinePacing
  );

  return {
    hasData: true,
    currentPacing,
    baselinePacing,
    metricDeltas,
    changes,
  };
}
```

- [ ] **Step 4: Run the direct helper tests**

Run:

```powershell
npm test -- tests/unit/services/variance-tracking/variance-diff.test.ts
```

Expected:

```text
tests/unit/services/variance-tracking/variance-diff.test.ts passed
```

- [ ] **Step 5: Commit the pure helper and tests**

Run:

```powershell
git add server/services/variance-tracking/variance-diff.ts tests/unit/services/variance-tracking/variance-diff.test.ts
git commit -m "Extract variance snapshot diff helpers" -m "Reserve and pacing variance diffing is pure business logic, so it can be tested directly before wiring the service through it." -m "Constraint: Preserve existing variance service behavior and API shapes" -m "Confidence: high" -m "Scope-risk: narrow" -m "Tested: npm test -- tests/unit/services/variance-tracking/variance-diff.test.ts" -m "Co-authored-by: OmX <omx@oh-my-codex.dev>"
```

---

## Task 3: Wire Reserve And Pacing Through Diff Helpers

**Files:**

- Modify: `server/services/variance-tracking.ts`
- Modify: `tests/unit/services/variance-tracking.test.ts`

- [ ] **Step 1: Import the diff helpers**

In `server/services/variance-tracking.ts`, add this import near the other
`./variance-tracking/...` imports:

```typescript
import {
  buildPacingVarianceResult,
  buildReserveVarianceResult,
} from './variance-tracking/variance-diff';
```

Remove this import because the helper module now owns it:

```typescript
import { isDeepStrictEqual } from 'node:util';
```

- [ ] **Step 2: Replace reserve and pacing variance method bodies**

Replace `calculateReserveVariances` with:

```typescript
  private async calculateReserveVariances(fundId: number, baseline: FundBaseline) {
    const currentReserves = (await this.getReserveSnapshot(fundId)) as Record<string, unknown>;
    const baselineReserves = (baseline.reserveAllocation ?? {}) as Record<string, unknown>;

    return buildReserveVarianceResult(currentReserves, baselineReserves);
  }
```

Replace `calculatePacingVariances` with:

```typescript
  private async calculatePacingVariances(fundId: number, baseline: FundBaseline) {
    const currentPacing = (await this.getPacingSnapshot(fundId)) as Record<string, unknown>;
    const baselinePacing = (baseline.pacingMetrics ?? {}) as Record<string, unknown>;

    return buildPacingVarianceResult(currentPacing, baselinePacing);
  }
```

Delete these private methods from `VarianceCalculationService`:

```typescript
  private coerceFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private buildStructuredMetricChanges(
    currentValues: Record<string, unknown>,
    baselineValues: Record<string, unknown>
  ) {
    const metricDeltas: Record<
      string,
      {
        current: number;
        baseline: number;
        delta: number;
        deltaPct: number | null;
      }
    > = {};
    const changes: Record<string, { current: unknown; baseline: unknown }> = {};
    const allKeys = new Set([...Object.keys(currentValues), ...Object.keys(baselineValues)]);

    for (const key of allKeys) {
      const cur = currentValues[key];
      const base = baselineValues[key];
      if (isDeepStrictEqual(cur, base)) {
        continue;
      }

      const curNumber = this.coerceFiniteNumber(cur);
      const baseNumber = this.coerceFiniteNumber(base);
      if (curNumber !== null && baseNumber !== null) {
        const delta = curNumber - baseNumber;
        metricDeltas[key] = {
          current: curNumber,
          baseline: baseNumber,
          delta,
          deltaPct: baseNumber !== 0 ? delta / baseNumber : null,
        };
        continue;
      }

      changes[key] = { current: cur ?? null, baseline: base ?? null };
    }

    return { metricDeltas, changes };
  }
```

- [ ] **Step 3: Keep existing reflection tests for this commit**

Do not delete the reserve and pacing reflection tests yet. They prove that the
service still returns the same shape through its private methods while the
direct tests prove the helper module.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
npm test -- tests/unit/services/variance-tracking/variance-diff.test.ts tests/unit/services/variance-tracking.test.ts
```

Expected:

```text
tests/unit/services/variance-tracking/variance-diff.test.ts passed
tests/unit/services/variance-tracking.test.ts passed
```

- [ ] **Step 5: Run typecheck**

Run:

```powershell
npm run check
```

Expected: TypeScript check passes.

- [ ] **Step 6: Commit the service wiring**

Run:

```powershell
git add server/services/variance-tracking.ts tests/unit/services/variance-tracking.test.ts
git commit -m "Route reserve pacing variance through diff helpers" -m "The service now delegates pure reserve and pacing comparison work to directly tested helpers while keeping DB reads and public service behavior unchanged." -m "Constraint: Keep variance report and API response shapes unchanged" -m "Confidence: high" -m "Scope-risk: narrow" -m "Tested: npm test -- tests/unit/services/variance-tracking/variance-diff.test.ts tests/unit/services/variance-tracking.test.ts" -m "Tested: npm run check" -m "Co-authored-by: OmX <omx@oh-my-codex.dev>"
```

---

## Task 4: Extract Distribution Variance Helper

**Files:**

- Create: `server/services/variance-tracking/distribution-variance.ts`
- Create: `tests/unit/services/variance-tracking/distribution-variance.test.ts`
- Modify: `server/services/variance-tracking.ts`

- [ ] **Step 1: Write direct tests for sector and stage distribution behavior**

Create `tests/unit/services/variance-tracking/distribution-variance.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { analyzeDistributionVariances } from '../../../../server/services/variance-tracking/distribution-variance';

describe('analyzeDistributionVariances', () => {
  it('computes deltas and count-share movement for matching keys', () => {
    const result = analyzeDistributionVariances(
      { Technology: 5, Healthcare: 3 },
      { Technology: 4, Healthcare: 2 }
    );

    expect(result.Technology).toMatchObject({
      current: 5,
      baseline: 4,
      delta: 1,
      deltaPct: 0.25,
    });
    expect(result.Technology.currentCountShare).toBeCloseTo(5 / 8, 10);
    expect(result.Technology.baselineCountShare).toBeCloseTo(4 / 6, 10);
    expect(result.Healthcare.deltaPct).toBe(0.5);
  });

  it('handles keys present only in current', () => {
    const result = analyzeDistributionVariances(
      { Technology: 3, 'Clean Energy': 2 },
      { Technology: 3 }
    );

    expect(result['Clean Energy']).toMatchObject({
      current: 2,
      baseline: 0,
      delta: 2,
      deltaPct: null,
    });
    expect(result['Clean Energy'].currentCountShare).toBeCloseTo(2 / 5, 10);
    expect(result['Clean Energy'].baselineCountShare).toBe(0);
    expect(result['Clean Energy'].countShareDeltaPct).toBeNull();
  });

  it('handles keys present only in baseline', () => {
    const result = analyzeDistributionVariances(
      { Technology: 3 },
      { Technology: 3, Consumer: 2 }
    );

    expect(result.Consumer).toMatchObject({
      current: 0,
      baseline: 2,
      delta: -2,
      deltaPct: -1,
    });
    expect(result.Consumer.countShareDeltaPct).toBe(-1);
  });

  it('returns an empty object for empty inputs', () => {
    expect(analyzeDistributionVariances({}, {})).toEqual({});
  });
});
```

- [ ] **Step 2: Run the new test and confirm it fails before implementation**

Run:

```powershell
npm test -- tests/unit/services/variance-tracking/distribution-variance.test.ts
```

Expected:

```text
FAIL
Cannot find module '../../../../server/services/variance-tracking/distribution-variance'
```

- [ ] **Step 3: Create the distribution helper**

Create `server/services/variance-tracking/distribution-variance.ts`:

```typescript
export interface DistributionVarianceRow {
  current: number;
  baseline: number;
  delta: number;
  deltaPct: number | null;
  currentCountShare: number;
  baselineCountShare: number;
  countShareDelta: number;
  countShareDeltaPct: number | null;
}

export function analyzeDistributionVariances(
  current: Record<string, number>,
  baseline: Record<string, number>
): Record<string, DistributionVarianceRow> {
  const allKeys = new Set([...Object.keys(current), ...Object.keys(baseline)]);
  const currentTotal = Object.values(current).reduce(
    (sum, value) => sum + value,
    0
  );
  const baselineTotal = Object.values(baseline).reduce(
    (sum, value) => sum + value,
    0
  );
  const result: Record<string, DistributionVarianceRow> = {};

  for (const key of allKeys) {
    const cur = current[key] ?? 0;
    const base = baseline[key] ?? 0;
    const delta = cur - base;
    const deltaPct = base !== 0 ? delta / base : null;
    const currentCountShare = currentTotal > 0 ? cur / currentTotal : 0;
    const baselineCountShare = baselineTotal > 0 ? base / baselineTotal : 0;
    const countShareDelta = currentCountShare - baselineCountShare;
    const countShareDeltaPct =
      baselineCountShare !== 0 ? countShareDelta / baselineCountShare : null;

    result[key] = {
      current: cur,
      baseline: base,
      delta,
      deltaPct,
      currentCountShare,
      baselineCountShare,
      countShareDelta,
      countShareDeltaPct,
    };
  }

  return result;
}
```

- [ ] **Step 4: Wire sector and stage methods through the helper**

In `server/services/variance-tracking.ts`, add:

```typescript
import { analyzeDistributionVariances } from './variance-tracking/distribution-variance';
```

Replace `analyzeSectorVariances` with:

```typescript
  private analyzeSectorVariances(current: Record<string, number>, baseline: Record<string, number>) {
    return analyzeDistributionVariances(current, baseline);
  }
```

Replace `analyzeStageVariances` with:

```typescript
  private analyzeStageVariances(current: Record<string, number>, baseline: Record<string, number>) {
    return analyzeDistributionVariances(current, baseline);
  }
```

Delete the private `analyzeDistributionVariances` method from
`VarianceCalculationService`.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm test -- tests/unit/services/variance-tracking/distribution-variance.test.ts tests/unit/services/variance-tracking.test.ts
```

Expected: both test files pass.

- [ ] **Step 6: Commit the distribution helper**

Run:

```powershell
git add server/services/variance-tracking.ts server/services/variance-tracking/distribution-variance.ts tests/unit/services/variance-tracking/distribution-variance.test.ts
git commit -m "Extract distribution variance helper" -m "Sector and stage variance calculations now share a direct-tested helper instead of living as private service methods." -m "Constraint: Preserve sector and stage variance output shape" -m "Confidence: high" -m "Scope-risk: narrow" -m "Tested: npm test -- tests/unit/services/variance-tracking/distribution-variance.test.ts tests/unit/services/variance-tracking.test.ts" -m "Co-authored-by: OmX <omx@oh-my-codex.dev>"
```

---

## Task 5: Extract Company Variance Row Helpers

**Files:**

- Create: `server/services/variance-tracking/company-variance.ts`
- Create: `tests/unit/services/variance-tracking/company-variance.test.ts`
- Modify: `server/services/variance-tracking.ts`

- [ ] **Step 1: Write direct company variance tests**

Create `tests/unit/services/variance-tracking/company-variance.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  analyzeCompanyVarianceRows,
  extractBaselineCompanySnapshots,
  getCompanyVarianceRiskLevel,
  sumInvestmentAmounts,
} from '../../../../server/services/variance-tracking/company-variance';

describe('company-variance helpers', () => {
  it('sums investment amounts while skipping null amounts', () => {
    const total = sumInvestmentAmounts([
      { amount: '200000.00' },
      { amount: null },
      { amount: 50000 },
    ]);

    expect(total.toString()).toBe('250000');
  });

  it('classifies company valuation risk by absolute percentage magnitude', () => {
    expect(getCompanyVarianceRiskLevel(null)).toBe('medium');
    expect(getCompanyVarianceRiskLevel('0.09')).toBe('low');
    expect(getCompanyVarianceRiskLevel('0.10')).toBe('medium');
    expect(getCompanyVarianceRiskLevel('0.25')).toBe('high');
    expect(getCompanyVarianceRiskLevel('0.50')).toBe('critical');
    expect(getCompanyVarianceRiskLevel('-0.50')).toBe('critical');
  });

  it('extracts full companySnapshots before legacy topPerformers', () => {
    const baseline = {
      companySnapshots: [
        {
          companyId: 1,
          companyName: 'AlphaCo',
          sector: 'Technology',
          stage: 'Series A',
          status: 'active',
          currentValuation: '500000.00',
          investedCapital: '200000.00',
        },
      ],
      topPerformers: [
        { id: 99, name: 'LegacyCo', sector: 'Legacy', currentValuation: '1' },
      ],
    };

    const result = extractBaselineCompanySnapshots(baseline);

    expect(result.source).toBe('full_snapshot');
    expect(result.companies).toHaveLength(1);
    expect(result.companies[0]).toMatchObject({
      portfolioCompanyId: 1,
      companyId: 1,
      name: 'AlphaCo',
      sector: 'Technology',
      stage: 'Series A',
      status: 'active',
    });
    expect(result.companies[0].currentValuation?.toString()).toBe('500000');
    expect(result.companies[0].investedCapital?.toString()).toBe('200000');
  });

  it('computes matched company variance rows from legacy topPerformers', () => {
    const baseline = {
      topPerformers: [
        {
          id: 1,
          name: 'AlphaCo',
          sector: 'Technology',
          currentValuation: '500000.00',
        },
        {
          id: 2,
          name: 'BetaCo',
          sector: 'Healthcare',
          currentValuation: '400000.00',
        },
      ],
    };

    const rows = analyzeCompanyVarianceRows(
      [
        {
          id: 1,
          name: 'AlphaCo',
          sector: 'Technology',
          currentValuation: '600000.00',
          investments: [{ amount: '210000.00' }],
        },
        {
          id: 2,
          name: 'BetaCo',
          sector: 'Healthcare',
          currentValuation: '350000.00',
          investments: [{ amount: '180000.00' }],
        },
        {
          id: 3,
          name: 'GammaCo',
          sector: 'FinTech',
          currentValuation: '200000.00',
          investments: [],
        },
      ],
      baseline
    );

    expect(rows).toHaveLength(2);

    const alpha = rows.find((row) => row.companyId === 1);
    expect(alpha).toMatchObject({
      companyName: 'AlphaCo',
      sector: 'Technology',
      changeType: 'matched',
      baselineValuation: '500000',
      currentValuation: '600000',
      valuationVariance: '100000',
      valuationVariancePct: '0.2',
      currentInvestedCapital: '210000',
      riskLevel: 'medium',
    });

    const beta = rows.find((row) => row.companyId === 2);
    expect(beta).toMatchObject({
      companyName: 'BetaCo',
      changeType: 'matched',
      valuationVariance: '-50000',
      valuationVariancePct: '-0.125',
      currentInvestedCapital: '180000',
      riskLevel: 'medium',
    });
  });

  it('classifies added and removed companies when full snapshots are present', () => {
    const baseline = {
      companySnapshots: [
        {
          companyId: 1,
          companyName: 'AlphaCo',
          sector: 'Technology',
          stage: 'Series A',
          status: 'active',
          currentValuation: '500000.00',
          investedCapital: '200000.00',
        },
        {
          companyId: 2,
          companyName: 'BetaCo',
          sector: 'Healthcare',
          stage: 'Series B',
          status: 'active',
          currentValuation: '400000.00',
          investedCapital: '150000.00',
        },
      ],
    };

    const rows = analyzeCompanyVarianceRows(
      [
        {
          id: 1,
          name: 'AlphaCo',
          sector: 'Technology',
          stage: 'Series A',
          status: 'active',
          currentValuation: '650000.00',
          investments: [{ amount: '220000.00' }],
        },
        {
          id: 3,
          name: 'GammaCo',
          sector: 'FinTech',
          stage: 'Seed',
          status: 'active',
          currentValuation: '250000.00',
          investments: [{ amount: '90000.00' }],
        },
      ],
      baseline
    );

    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.companyId === 1)).toMatchObject({
      changeType: 'matched',
      valuationVariance: '150000',
      baselineInvestedCapital: '200000',
      currentInvestedCapital: '220000',
      riskLevel: 'high',
    });
    expect(rows.find((row) => row.companyId === 3)).toMatchObject({
      changeType: 'added',
      baselineValuation: null,
      currentValuation: '250000',
      valuationVariance: '250000',
      valuationVariancePct: null,
      riskLevel: 'medium',
    });
    expect(rows.find((row) => row.companyId === 2)).toMatchObject({
      changeType: 'removed',
      currentValuation: null,
      valuationVariance: '-400000',
      valuationVariancePct: '-1',
      riskLevel: 'critical',
    });
  });

  it('returns no rows when baseline has no company source', () => {
    expect(analyzeCompanyVarianceRows([], { topPerformers: null })).toEqual([]);
    expect(analyzeCompanyVarianceRows([], { topPerformers: [] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the new test and confirm it fails before implementation**

Run:

```powershell
npm test -- tests/unit/services/variance-tracking/company-variance.test.ts
```

Expected:

```text
FAIL
Cannot find module '../../../../server/services/variance-tracking/company-variance'
```

- [ ] **Step 3: Create `company-variance.ts`**

Create `server/services/variance-tracking/company-variance.ts` with the helper
functions moved from `server/services/variance-tracking.ts`:

```typescript
import { Decimal, toDecimal } from '@shared/lib/decimal-utils';
import type { CompanyVarianceRow } from '@shared/variance-validation';

export interface InvestmentAmountLike {
  amount?: string | number | null;
}

export interface CurrentCompanyLike {
  id: number;
  name: string;
  sector: string;
  stage?: string | null;
  status?: string | null;
  currentValuation?: string | number | null;
  investments?: InvestmentAmountLike[] | null;
}

export interface BaselineCompanySnapshot {
  portfolioCompanyId: number;
  companyId: number;
  name: string;
  sector: string;
  stage: string | null;
  status: string | null;
  currentValuation: Decimal | null;
  investedCapital: Decimal | null;
}

export type BaselineCompanySnapshotSource =
  | 'full_snapshot'
  | 'legacy_top_performers'
  | 'none';

export function sumInvestmentAmounts(
  investmentRows: InvestmentAmountLike[] | null | undefined
): Decimal {
  if (!investmentRows?.length) {
    return new Decimal(0);
  }

  return investmentRows.reduce<Decimal>((sum, investmentRow) => {
    if (investmentRow.amount == null) {
      return sum;
    }

    return sum.plus(toDecimal(String(investmentRow.amount)));
  }, new Decimal(0));
}

export function getCompanyVarianceRiskLevel(
  changePct: Decimal | string | number | null
): 'low' | 'medium' | 'high' | 'critical' {
  if (changePct === null) {
    return 'medium';
  }

  const magnitude = toDecimal(changePct).abs();
  if (magnitude.gte(0.5)) {
    return 'critical';
  }
  if (magnitude.gte(0.25)) {
    return 'high';
  }
  if (magnitude.gte(0.1)) {
    return 'medium';
  }

  return 'low';
}

export function withLegacyValuationAliases(
  valuationVariance: string | null,
  valuationVariancePct: string | null
): Pick<
  CompanyVarianceRow,
  | 'valuationChange'
  | 'valuationChangePct'
  | 'valuationVariance'
  | 'valuationVariancePct'
> {
  return {
    valuationChange: valuationVariance,
    valuationChangePct: valuationVariancePct,
    valuationVariance,
    valuationVariancePct,
  };
}

export function extractBaselineCompanySnapshots(baseline: {
  companySnapshots?: unknown;
  topPerformers?: unknown;
}): {
  source: BaselineCompanySnapshotSource;
  companies: BaselineCompanySnapshot[];
} {
  const rawCompanySnapshots = baseline.companySnapshots;

  if (Array.isArray(rawCompanySnapshots)) {
    const companies = rawCompanySnapshots
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }

        const record = entry as Record<string, unknown>;
        const rawPortfolioCompanyId =
          record['portfolioCompanyId'] ?? record['companyId'] ?? record['id'];
        const portfolioCompanyId =
          typeof rawPortfolioCompanyId === 'number'
            ? rawPortfolioCompanyId
            : Number(rawPortfolioCompanyId);
        if (!Number.isInteger(portfolioCompanyId) || portfolioCompanyId <= 0) {
          return null;
        }

        const rawValuation = record['currentValuation'] ?? record['valuation'];
        const rawInvestedCapital = record['investedCapital'];

        return {
          portfolioCompanyId,
          companyId: portfolioCompanyId,
          name:
            typeof record['companyName'] === 'string'
              ? record['companyName']
              : typeof record['name'] === 'string'
                ? record['name']
                : '',
          sector: typeof record['sector'] === 'string' ? record['sector'] : '',
          stage: typeof record['stage'] === 'string' ? record['stage'] : null,
          status:
            typeof record['status'] === 'string' ? record['status'] : null,
          currentValuation:
            rawValuation === null || rawValuation === undefined
              ? null
              : toDecimal(String(rawValuation)),
          investedCapital:
            rawInvestedCapital === null || rawInvestedCapital === undefined
              ? null
              : toDecimal(String(rawInvestedCapital)),
        };
      })
      .filter(
        (company): company is BaselineCompanySnapshot => company !== null
      );

    if (companies.length > 0) {
      return { source: 'full_snapshot', companies };
    }
  }

  const rawPerformers = baseline.topPerformers;
  let baselineCompanies: Array<{
    id: number;
    name?: string;
    sector?: string;
    stage?: string | null;
    status?: string | null;
    currentValuation?: string | number | null;
    valuation?: number | null;
    investedCapital?: string | number | null;
  }> = [];

  if (Array.isArray(rawPerformers)) {
    baselineCompanies = rawPerformers as typeof baselineCompanies;
  } else if (
    rawPerformers &&
    typeof rawPerformers === 'object' &&
    Array.isArray((rawPerformers as Record<string, unknown>)['companies'])
  ) {
    baselineCompanies = (rawPerformers as Record<string, unknown>)[
      'companies'
    ] as typeof baselineCompanies;
  }

  if (baselineCompanies.length === 0) {
    return { source: 'none', companies: [] };
  }

  return {
    source: 'legacy_top_performers',
    companies: baselineCompanies
      .map((company) => {
        const rawValuation = company.currentValuation ?? company.valuation;
        return {
          portfolioCompanyId: company.id,
          companyId: company.id,
          name: company.name ?? '',
          sector: company.sector ?? '',
          stage: company.stage ?? null,
          status: company.status ?? null,
          currentValuation:
            rawValuation === null || rawValuation === undefined
              ? null
              : toDecimal(String(rawValuation)),
          investedCapital:
            company.investedCapital === null ||
            company.investedCapital === undefined
              ? null
              : toDecimal(String(company.investedCapital)),
        };
      })
      .filter((company) => company.portfolioCompanyId > 0),
  };
}

export function analyzeCompanyVarianceRows(
  companies: CurrentCompanyLike[],
  baseline: {
    companySnapshots?: unknown;
    topPerformers?: unknown;
  }
): CompanyVarianceRow[] {
  const { source, companies: baselineCompanies } =
    extractBaselineCompanySnapshots(baseline);
  if (baselineCompanies.length === 0) {
    return [];
  }

  const baselineMap = new Map<number, BaselineCompanySnapshot>();
  for (const baselineCompany of baselineCompanies) {
    baselineMap.set(baselineCompany.portfolioCompanyId, baselineCompany);
  }

  if (baselineMap.size === 0) {
    return [];
  }

  const variances: CompanyVarianceRow[] = [];
  const matchedCompanyIds = new Set<number>();

  for (const company of companies) {
    const baselineEntry = baselineMap.get(company.id);
    const currentInvestedCapital = sumInvestmentAmounts(company.investments);
    if (!baselineEntry) {
      if (source !== 'full_snapshot' || company.currentValuation == null) {
        continue;
      }

      const currentVal = toDecimal(String(company.currentValuation));
      variances.push({
        companyId: company.id,
        companyName: company.name,
        sector: company.sector,
        stage: company.stage ?? null,
        status: company.status ?? null,
        changeType: 'added',
        baselineValuation: null,
        currentValuation: currentVal.toString(),
        baselineInvestedCapital: null,
        currentInvestedCapital: currentInvestedCapital.toString(),
        ...withLegacyValuationAliases(currentVal.toString(), null),
        riskLevel: getCompanyVarianceRiskLevel(null),
      });
      continue;
    }

    if (
      company.currentValuation == null ||
      baselineEntry.currentValuation == null
    ) {
      continue;
    }

    matchedCompanyIds.add(company.id);
    const currentVal = toDecimal(String(company.currentValuation));
    const baseVal = baselineEntry.currentValuation;

    if (baseVal.isZero()) {
      continue;
    }

    const change = currentVal.minus(baseVal);
    const changePct = change.div(baseVal);

    variances.push({
      companyId: company.id,
      companyName: company.name,
      sector: company.sector,
      stage: company.stage ?? null,
      status: company.status ?? null,
      changeType: 'matched',
      baselineValuation: baseVal.toString(),
      currentValuation: currentVal.toString(),
      baselineInvestedCapital:
        baselineEntry.investedCapital?.toString() ?? null,
      currentInvestedCapital: currentInvestedCapital.toString(),
      ...withLegacyValuationAliases(change.toString(), changePct.toString()),
      riskLevel: getCompanyVarianceRiskLevel(changePct),
    });
  }

  if (source === 'full_snapshot') {
    for (const [companyId, baselineEntry] of baselineMap.entries()) {
      if (
        matchedCompanyIds.has(companyId) ||
        baselineEntry.currentValuation == null
      ) {
        continue;
      }

      const baseVal = baselineEntry.currentValuation;
      const change = baseVal.negated();
      const changePct = baseVal.isZero() ? null : new Decimal(-1);

      variances.push({
        companyId,
        companyName: baselineEntry.name,
        sector: baselineEntry.sector,
        stage: baselineEntry.stage,
        status: baselineEntry.status,
        changeType: 'removed',
        baselineValuation: baseVal.toString(),
        currentValuation: null,
        baselineInvestedCapital:
          baselineEntry.investedCapital?.toString() ?? null,
        currentInvestedCapital: null,
        ...withLegacyValuationAliases(
          change.toString(),
          changePct?.toString() ?? null
        ),
        riskLevel: getCompanyVarianceRiskLevel(changePct),
      });
    }
  }

  return variances;
}
```

- [ ] **Step 4: Wire `VarianceCalculationService` through the company helper**

In `server/services/variance-tracking.ts`, add:

```typescript
import {
  analyzeCompanyVarianceRows,
  sumInvestmentAmounts,
} from './variance-tracking/company-variance';
```

Then delete the local `sumInvestmentAmounts`, `withLegacyValuationAliases`,
`getCompanyVarianceRiskLevel`, and `extractBaselineCompanySnapshots` helper
implementations from `server/services/variance-tracking.ts`.

Replace `analyzeCompanyVariances` with:

```typescript
  private async analyzeCompanyVariances(fundId: number, baseline: FundBaseline, _asOfDate: Date) {
    const companies =
      (await db.query.portfolioCompanies.findMany({
        where: eq(portfolioCompanies.fundId, fundId),
        with: {
          investments: true,
        },
      })) ?? [];

    return analyzeCompanyVarianceRows(companies, baseline);
  }
```

Keep `sumInvestmentAmounts` imported because `getCurrentPortfolioMetrics` still
uses it.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm test -- tests/unit/services/variance-tracking/company-variance.test.ts tests/unit/services/variance-tracking.test.ts
```

Expected: both test files pass.

- [ ] **Step 6: Run typecheck**

Run:

```powershell
npm run check
```

Expected: TypeScript check passes. If
`analyzeCompanyVarianceRows(companies, baseline)` has type friction from Drizzle
relation inference, add a narrow local adapter in `analyzeCompanyVariances`:

```typescript
return analyzeCompanyVarianceRows(
  companies.map((company) => ({
    id: company.id,
    name: company.name,
    sector: company.sector,
    stage: company.stage,
    status: company.status,
    currentValuation: company.currentValuation,
    investments: Array.isArray(company.investments) ? company.investments : [],
  })),
  baseline
);
```

Do not use `any`.

- [ ] **Step 7: Commit the company helper**

Run:

```powershell
git add server/services/variance-tracking.ts server/services/variance-tracking/company-variance.ts tests/unit/services/variance-tracking/company-variance.test.ts
git commit -m "Extract company variance row helpers" -m "Company variance row construction now lives in a direct-tested helper while the service keeps ownership of the current portfolio DB read." -m "Constraint: Preserve legacy valuation alias fields and added removed matched row shapes" -m "Confidence: medium" -m "Scope-risk: moderate" -m "Tested: npm test -- tests/unit/services/variance-tracking/company-variance.test.ts tests/unit/services/variance-tracking.test.ts" -m "Tested: npm run check" -m "Co-authored-by: OmX <omx@oh-my-codex.dev>"
```

---

## Task 6: Move VarianceCalculationService Into Its Own Module

**Files:**

- Create: `server/services/variance-tracking/calculation-service.ts`
- Modify: `server/services/variance-tracking.ts`
- Modify: `tests/unit/services/variance-tracking.test.ts`

- [ ] **Step 1: Create `calculation-service.ts` with the service class**

Create `server/services/variance-tracking/calculation-service.ts`.

Move the remaining `VarianceCalculationService` class from
`server/services/variance-tracking.ts` into the new file. The new file should
start with this import block, adjusted only if TypeScript reports an unused
import:

```typescript
import { db } from '../../db';
import {
  buildPacingVarianceResult,
  buildReserveVarianceResult,
} from './variance-diff';
import { analyzeDistributionVariances } from './distribution-variance';
import {
  analyzeCompanyVarianceRows,
  sumInvestmentAmounts,
} from './company-variance';
import {
  normalizeTriggeredAlertSeverity,
  type TriggeredAlertData,
} from './alert-helpers';
import { Decimal, toDecimal } from '@shared/lib/decimal-utils';
import {
  alertRules,
  fundBaselines,
  fundMetrics,
  fundSnapshots,
  portfolioCompanies,
  varianceReports,
} from '@shared/schema';
import type {
  FundBaseline,
  InsertVarianceReport,
  VarianceReport,
} from '@shared/schema';
import { and, desc, eq, lte } from 'drizzle-orm';
import { buildAlertRuleEvaluation } from '../variance-alert-evaluation';
import type { VarianceSnapshot } from '../variance-alert-evaluation';
import {
  recordSystemError,
  recordVarianceReportGenerated,
  startVarianceCalculation,
  updateDataQualityScore,
  updateFundVarianceScore,
} from '../../metrics/variance-metrics';
```

The class export line in the new file must be:

```typescript
export class VarianceCalculationService {
```

- [ ] **Step 2: Update the facade imports and exports**

In `server/services/variance-tracking.ts`, add:

```typescript
import { VarianceCalculationService } from './variance-tracking/calculation-service';
```

Add the public re-export:

```typescript
export { VarianceCalculationService };
```

Remove imports from `server/services/variance-tracking.ts` that are now only
used by `calculation-service.ts`, including:

```typescript
import { Decimal, toDecimal } from '@shared/lib/decimal-utils';
import {
  normalizeTriggeredAlertSeverity,
  type TriggeredAlertData,
} from './variance-tracking/alert-helpers';
import {
  alertRules,
  varianceReports,
  portfolioCompanies,
  fundSnapshots,
} from '@shared/schema';
import type { Investment, InsertVarianceReport } from '@shared/schema';
import { lte } from 'drizzle-orm';
import { buildAlertRuleEvaluation } from './variance-alert-evaluation';
import {
  recordVarianceReportGenerated,
  updateFundVarianceScore,
  updateDataQualityScore,
  recordSystemError,
  startVarianceCalculation,
} from '../metrics/variance-metrics';
```

Keep these facade imports because `VarianceTrackingService` and
`getAttributedKPIs` still use them:

```typescript
import { db } from '../db';
import { AlertManagementService } from './variance-tracking/alert-management-service';
import { BaselineService } from './variance-tracking/baseline-service';
import { fundMetrics } from '@shared/schema';
import type {
  FundBaseline,
  PerformanceAlert,
  VarianceReport,
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { VarianceAlertEvaluationService } from './variance-alert-evaluation';
import { SYSTEM_ACTOR_ID } from '@shared/constants/system-actor';
```

- [ ] **Step 3: Confirm facade shape**

After moving the class, `server/services/variance-tracking.ts` should still
include:

```typescript
export { BaselineService };
export { AlertManagementService };
export { VarianceCalculationService };
export type { BaselineCreationMode } from './variance-tracking/baseline-service';
```

And the coordinator should still instantiate the calculation service:

```typescript
  constructor() {
    this.baselines = new BaselineService();
    this.calculations = new VarianceCalculationService();
    this.alerts = new AlertManagementService();
    this.alertEvaluation = new VarianceAlertEvaluationService(
      this.baselines,
      this.calculations,
      this.alerts
    );
  }
```

- [ ] **Step 4: Run service and helper tests**

Run:

```powershell
npm test -- tests/unit/services/variance-tracking.test.ts tests/unit/services/variance-tracking/variance-diff.test.ts tests/unit/services/variance-tracking/distribution-variance.test.ts tests/unit/services/variance-tracking/company-variance.test.ts
```

Expected: all listed test files pass.

- [ ] **Step 5: Run API and automation regression tests**

Run:

```powershell
npm test -- tests/unit/api/variance-tracking-api.test.ts tests/unit/services/variance-alert-automation.test.ts
```

Expected: both test files pass.

- [ ] **Step 6: Run typecheck**

Run:

```powershell
npm run check
```

Expected: TypeScript check passes.

- [ ] **Step 7: Commit the service move**

Run:

```powershell
git add server/services/variance-tracking.ts server/services/variance-tracking/calculation-service.ts tests/unit/services/variance-tracking.test.ts
git commit -m "Move variance calculation service behind facade" -m "The public variance-tracking module remains the import facade while the calculation service moves into the focused variance-tracking service directory." -m "Constraint: Keep BaselineService AlertManagementService VarianceCalculationService VarianceTrackingService and varianceTrackingService exported from the facade" -m "Confidence: high" -m "Scope-risk: moderate" -m "Tested: npm test -- tests/unit/services/variance-tracking.test.ts tests/unit/services/variance-tracking/variance-diff.test.ts tests/unit/services/variance-tracking/distribution-variance.test.ts tests/unit/services/variance-tracking/company-variance.test.ts" -m "Tested: npm test -- tests/unit/api/variance-tracking-api.test.ts tests/unit/services/variance-alert-automation.test.ts" -m "Tested: npm run check" -m "Co-authored-by: OmX <omx@oh-my-codex.dev>"
```

---

## Task 7: Remove Replaced Reflection Tests

**Files:**

- Modify: `tests/unit/services/variance-tracking.test.ts`

- [ ] **Step 1: Remove reflection-only tests now covered by direct module
      tests**

In `tests/unit/services/variance-tracking.test.ts`, remove these `describe`
blocks after Task 6 passes:

```typescript
describe('analyzeSectorVariances (via reflection)', () => {
  // remove this entire block
});

describe('analyzeStageVariances (via reflection)', () => {
  // remove this entire block
});

describe('calculateReserveVariances (via reflection)', () => {
  // remove this entire block
});

describe('calculatePacingVariances (via reflection)', () => {
  // remove this entire block
});
```

Keep these reflection tests for now because they still exercise service-owned DB
read orchestration:

```typescript
describe('getCurrentPortfolioMetrics (via reflection)', () => {
  // keep until portfolio read extraction is planned
});

describe('analyzeCompanyVariances (via reflection)', () => {
  // keep until the DB read wrapper is covered through a public or injected seam
});
```

- [ ] **Step 2: Confirm direct module tests cover removed behavior**

Run:

```powershell
npm test -- tests/unit/services/variance-tracking/distribution-variance.test.ts tests/unit/services/variance-tracking/variance-diff.test.ts
```

Expected: both test files pass.

- [ ] **Step 3: Run the service suite**

Run:

```powershell
npm test -- tests/unit/services/variance-tracking.test.ts
```

Expected: service suite passes with fewer total tests than the previous 90
because direct module tests now own the removed private-method cases.

- [ ] **Step 4: Commit reflection test cleanup**

Run:

```powershell
git add tests/unit/services/variance-tracking.test.ts
git commit -m "Retire replaced variance reflection tests" -m "Direct module tests now cover distribution reserve and pacing diff behavior, so the service suite no longer needs to bind those private methods through any casts." -m "Constraint: Keep reflection coverage only where the service still owns DB read orchestration" -m "Confidence: high" -m "Scope-risk: narrow" -m "Tested: npm test -- tests/unit/services/variance-tracking/distribution-variance.test.ts tests/unit/services/variance-tracking/variance-diff.test.ts" -m "Tested: npm test -- tests/unit/services/variance-tracking.test.ts" -m "Co-authored-by: OmX <omx@oh-my-codex.dev>"
```

---

## Task 8: Final Verification

**Files:**

- Modify: none unless verification exposes issues

- [ ] **Step 1: Run the full variance extraction test set**

Run:

```powershell
npm test -- tests/unit/services/variance-tracking.test.ts tests/unit/services/variance-tracking/variance-diff.test.ts tests/unit/services/variance-tracking/distribution-variance.test.ts tests/unit/services/variance-tracking/company-variance.test.ts tests/unit/api/variance-tracking-api.test.ts tests/unit/services/variance-alert-automation.test.ts
```

Expected: all listed tests pass.

- [ ] **Step 2: Run typecheck**

Run:

```powershell
npm run check
```

Expected: TypeScript check passes.

- [ ] **Step 3: Run lint**

Run:

```powershell
npm run lint
```

Expected: lint passes. If lint fails only on files touched by this plan, fix
those failures. If lint exposes unrelated pre-existing failures, record them in
the final report and run targeted lint on changed files:

```powershell
npx eslint server/services/variance-tracking.ts server/services/variance-tracking/calculation-service.ts server/services/variance-tracking/variance-diff.ts server/services/variance-tracking/distribution-variance.ts server/services/variance-tracking/company-variance.ts tests/unit/services/variance-tracking.test.ts tests/unit/services/variance-tracking/variance-diff.test.ts tests/unit/services/variance-tracking/distribution-variance.test.ts tests/unit/services/variance-tracking/company-variance.test.ts --no-cache
```

- [ ] **Step 4: Run the delivery gate**

Run:

```powershell
npm run validate:core
```

Expected: validation passes.

- [ ] **Step 5: Inspect final diff scope**

Run:

```powershell
git status --short
git diff --stat
```

Expected changed files are limited to:

```text
server/services/variance-tracking.ts
server/services/variance-tracking/calculation-service.ts
server/services/variance-tracking/company-variance.ts
server/services/variance-tracking/distribution-variance.ts
server/services/variance-tracking/variance-diff.ts
tests/unit/services/variance-tracking.test.ts
tests/unit/services/variance-tracking/company-variance.test.ts
tests/unit/services/variance-tracking/distribution-variance.test.ts
tests/unit/services/variance-tracking/variance-diff.test.ts
```

`.claude/discovery.md` and
`docs/superpowers/plans/2026-05-16-variance-tracking-service-extraction.md` may
still appear as unrelated local files. Do not stage them.

- [ ] **Step 6: Write final implementation summary**

Use this summary shape:

```text
Changed files:
- server/services/variance-tracking.ts
- server/services/variance-tracking/calculation-service.ts
- server/services/variance-tracking/company-variance.ts
- server/services/variance-tracking/distribution-variance.ts
- server/services/variance-tracking/variance-diff.ts
- tests/unit/services/variance-tracking.test.ts
- tests/unit/services/variance-tracking/company-variance.test.ts
- tests/unit/services/variance-tracking/distribution-variance.test.ts
- tests/unit/services/variance-tracking/variance-diff.test.ts

Simplifications made:
- Moved reserve/pacing diff logic into direct-tested pure helpers.
- Moved sector/stage distribution diff logic into a direct-tested pure helper.
- Moved company variance row construction into direct-tested helper functions.
- Moved VarianceCalculationService into a focused module while preserving the facade.
- Reduced private-method reflection tests where direct module tests now own behavior.

Verification:
- npm test -- tests/unit/services/variance-tracking.test.ts tests/unit/services/variance-tracking/variance-diff.test.ts tests/unit/services/variance-tracking/distribution-variance.test.ts tests/unit/services/variance-tracking/company-variance.test.ts tests/unit/api/variance-tracking-api.test.ts tests/unit/services/variance-alert-automation.test.ts
- npm run check
- npm run lint
- npm run validate:core

Remaining risks:
- Route mapper cleanup remains a follow-up.
- shared/variance-validation contract tightening remains a follow-up.
- Fee/economics/waterfall consolidation remains a separate strategic follow-up.
```

---

## Acceptance Criteria

- `server/services/variance-tracking.ts` remains the public facade.
- Existing consumers can still import `BaselineService`,
  `AlertManagementService`, `VarianceCalculationService`,
  `VarianceTrackingService`, `varianceTrackingService`, and `getAttributedKPIs`
  from `server/services/variance-tracking`.
- `VarianceCalculationService` lives in
  `server/services/variance-tracking/calculation-service.ts`.
- Reserve/pacing diff behavior is direct-tested in `variance-diff.test.ts`.
- Sector/stage distribution behavior is direct-tested in
  `distribution-variance.test.ts`.
- Company variance row behavior is direct-tested in `company-variance.test.ts`.
- No API response shapes change.
- No DB schema changes.
- No alert semantics change.
- Minimum verification and `validate:core` pass before merge.

## Follow-Up Plans

Create separate plans after this one is complete:

1. Variance route mapper and logger cleanup.
2. Variance response contract tightening.
3. Fee/economics/waterfall boundary consolidation.
