# J-Curve Complexity Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor `computeJCurvePath` to reduce cyclomatic complexity from ~41 to <=8 and function length from ~112 to <=50 lines.

**Architecture:** Extract 3 focused helper functions (`sanitizeMonotonicCurve`, `calibrateToActualCalls`, `buildFittedTVPICurve`) that encapsulate the main complexity sources while leveraging existing modules (`fitTVPI`, `gompertz`, `logistic`). Use golden snapshot tests to ensure output parity.

**Tech Stack:** TypeScript, Decimal.js, Vitest (snapshot testing)

---

## Task 1: Create Golden Snapshot Test

**Files:**
- Create: `tests/unit/jcurve-refactor-golden.test.ts`
- Reference: `shared/lib/jcurve.ts`

**Step 1: Write the golden snapshot test**

```typescript
/**
 * Golden snapshot tests for computeJCurvePath refactoring
 * Captures current output to ensure parity after refactor
 */
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { computeJCurvePath, type JCurveConfig } from '@shared/lib/jcurve';

describe('computeJCurvePath golden snapshots', () => {
  const baseConfig: JCurveConfig = {
    kind: 'gompertz',
    horizonYears: 10,
    investYears: 5,
    targetTVPI: new Decimal(2.5),
    startTVPI: new Decimal(0.95),
    step: 'quarter',
    pacingStrategy: 'flat',
    distributionLag: 7,
    finalDistributionCoefficient: 0.7,
    navCalculationMode: 'standard',
  };

  const feeTimeline = Array.from({ length: 40 }, () => new Decimal(0.005));

  it('should match snapshot for gompertz curve', () => {
    const result = computeJCurvePath(baseConfig, feeTimeline);

    // Convert Decimals to numbers for stable snapshots
    const snapshot = {
      tvpi: result.tvpi.map(d => d.toNumber()),
      nav: result.nav.map(d => d.toNumber()),
      dpi: result.dpi.map(d => d.toNumber()),
      calls: result.calls.map(d => d.toNumber()),
      params: Object.fromEntries(
        Object.entries(result.params).map(([k, v]) =>
          [k, v instanceof Decimal ? v.toNumber() : v]
        )
      ),
      fitRMSE: result.fitRMSE,
    };

    expect(snapshot).toMatchSnapshot();
  });

  it('should match snapshot for logistic curve', () => {
    const logisticConfig: JCurveConfig = { ...baseConfig, kind: 'logistic' };
    const result = computeJCurvePath(logisticConfig, feeTimeline);

    const snapshot = {
      tvpi: result.tvpi.map(d => d.toNumber()),
      nav: result.nav.map(d => d.toNumber()),
      dpi: result.dpi.map(d => d.toNumber()),
      params: Object.fromEntries(
        Object.entries(result.params).map(([k, v]) =>
          [k, v instanceof Decimal ? v.toNumber() : v]
        )
      ),
      fitRMSE: result.fitRMSE,
    };

    expect(snapshot).toMatchSnapshot();
  });

  it('should match snapshot for piecewise curve', () => {
    const piecewiseConfig: JCurveConfig = { ...baseConfig, kind: 'piecewise' };
    const result = computeJCurvePath(piecewiseConfig, feeTimeline);

    const snapshot = {
      tvpi: result.tvpi.map(d => d.toNumber()),
      nav: result.nav.map(d => d.toNumber()),
      dpi: result.dpi.map(d => d.toNumber()),
    };

    expect(snapshot).toMatchSnapshot();
  });

  it('should match snapshot with calledSoFar calibration', () => {
    const calledSoFar = Array.from({ length: 8 }, (_, i) => new Decimal(0.1 + i * 0.02));
    const dpiSoFar = Array.from({ length: 8 }, () => new Decimal(0));

    const result = computeJCurvePath(baseConfig, feeTimeline, calledSoFar, dpiSoFar);

    const snapshot = {
      tvpi: result.tvpi.map(d => d.toNumber()),
      dpi: result.dpi.map(d => d.toNumber()),
      fitRMSE: result.fitRMSE,
    };

    expect(snapshot).toMatchSnapshot();
  });

  it('should match snapshot for fee-adjusted NAV mode', () => {
    const feeAdjustedConfig: JCurveConfig = {
      ...baseConfig,
      navCalculationMode: 'fee-adjusted'
    };
    const result = computeJCurvePath(feeAdjustedConfig, feeTimeline);

    const snapshot = {
      nav: result.nav.map(d => d.toNumber()),
    };

    expect(snapshot).toMatchSnapshot();
  });
});
```

**Step 2: Run test to generate initial snapshots**

Run: `npx vitest run tests/unit/jcurve-refactor-golden.test.ts -u`
Expected: PASS, snapshots created in `tests/unit/__snapshots__/`

**Step 3: Verify snapshots were created**

Run: `ls tests/unit/__snapshots__/jcurve-refactor-golden.test.ts.snap`
Expected: File exists

**Step 4: Run test without -u to confirm snapshots match**

Run: `npx vitest run tests/unit/jcurve-refactor-golden.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add tests/unit/jcurve-refactor-golden.test.ts tests/unit/__snapshots__/
git commit -m "test: add golden snapshots for jcurve refactoring (Issue #153)"
```

---

## Task 2: Extract sanitizeMonotonicCurve Helper

**Files:**
- Modify: `shared/lib/jcurve.ts:353-372` (add new function before `cumulativeFromPeriods`)
- Reference: Lines 134-145 in current `computeJCurvePath`

**Step 1: Write test for sanitizeMonotonicCurve**

Add to `tests/unit/jcurve-refactor-golden.test.ts`:

```typescript
import { sanitizeMonotonicCurve } from '@shared/lib/jcurve';

describe('sanitizeMonotonicCurve', () => {
  it('should enforce monotonically non-decreasing values', () => {
    const input = [
      new Decimal(1.0),
      new Decimal(1.2),
      new Decimal(1.1), // dip - should be corrected
      new Decimal(1.5),
    ];
    const result = sanitizeMonotonicCurve(input, new Decimal(0.9), new Decimal(1.5));

    expect(result.map(d => d.toNumber())).toEqual([1.0, 1.2, 1.2, 1.5]);
  });

  it('should clamp start value to minimum', () => {
    const input = [new Decimal(0.5), new Decimal(1.0)];
    const result = sanitizeMonotonicCurve(input, new Decimal(0.9), new Decimal(1.0));

    expect(result[0].toNumber()).toBe(0.9);
  });

  it('should set end value exactly', () => {
    const input = [new Decimal(1.0), new Decimal(2.0)];
    const result = sanitizeMonotonicCurve(input, new Decimal(0.9), new Decimal(2.5));

    expect(result[result.length - 1].toNumber()).toBe(2.5);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/jcurve-refactor-golden.test.ts -t "sanitizeMonotonicCurve"`
Expected: FAIL with "sanitizeMonotonicCurve is not exported"

**Step 3: Implement sanitizeMonotonicCurve**

Add to `shared/lib/jcurve.ts` before `cumulativeFromPeriods` function (around line 373):

```typescript
/**
 * Ensure curve values are monotonically non-decreasing with clamped endpoints.
 *
 * @param values - Array of curve values (Decimal)
 * @param startMin - Minimum value for first element
 * @param endValue - Exact value for last element
 * @returns Sanitized curve with monotonic guarantee
 */
export function sanitizeMonotonicCurve(
  values: Decimal[],
  startMin: Decimal,
  endValue: Decimal
): Decimal[] {
  if (values.length === 0) return [];

  const result = [...values];

  // Clamp start to minimum
  const firstVal = result[0];
  if (firstVal) {
    result[0] = Decimal.max(firstVal, startMin);
  }

  // Set end value exactly
  result[result.length - 1] = endValue;

  // Enforce monotonic non-decreasing
  for (let i = 1; i < result.length; i++) {
    const current = result[i];
    const previous = result[i - 1];
    if (current && previous && current.lt(previous)) {
      result[i] = previous;
    }
  }

  return result;
}
```

**Step 4: Export the function**

The function is already exported with `export function`. Verify the import works.

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/jcurve-refactor-golden.test.ts -t "sanitizeMonotonicCurve"`
Expected: PASS (3 tests)

**Step 6: Run golden tests to ensure no regression**

Run: `npx vitest run tests/unit/jcurve-refactor-golden.test.ts`
Expected: PASS (all 8 tests)

**Step 7: Commit**

```bash
git add shared/lib/jcurve.ts tests/unit/jcurve-refactor-golden.test.ts
git commit -m "refactor: extract sanitizeMonotonicCurve helper (Issue #153)"
```

---

## Task 3: Extract calibrateToActualCalls Helper

**Files:**
- Modify: `shared/lib/jcurve.ts` (add new function)
- Reference: Lines 97-114 in current `computeJCurvePath`

**Step 1: Write test for calibrateToActualCalls**

Add to `tests/unit/jcurve-refactor-golden.test.ts`:

```typescript
import { calibrateToActualCalls, cumulativeFromPeriods } from '@shared/lib/jcurve';

describe('calibrateToActualCalls', () => {
  it('should adjust seed values based on actual calls', () => {
    const ysSeed = [1.0, 0.95, 0.92, 0.90];
    const calledSoFar = [
      new Decimal(0.25),
      new Decimal(0.25),
    ];
    const dpiSoFar = [
      new Decimal(0),
      new Decimal(0.05),
    ];

    const result = calibrateToActualCalls(ysSeed, calledSoFar, dpiSoFar);

    // Should modify first 2 values based on observed TVPI
    expect(result.length).toBe(4);
    expect(typeof result[0]).toBe('number');
  });

  it('should handle empty calledSoFar', () => {
    const ysSeed = [1.0, 0.95];
    const calledSoFar: Decimal[] = [];

    const result = calibrateToActualCalls(ysSeed, calledSoFar);

    expect(result).toEqual(ysSeed);
  });

  it('should handle undefined dpiSoFar', () => {
    const ysSeed = [1.0, 0.95, 0.92];
    const calledSoFar = [new Decimal(0.3)];

    const result = calibrateToActualCalls(ysSeed, calledSoFar, undefined);

    expect(result.length).toBe(3);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/jcurve-refactor-golden.test.ts -t "calibrateToActualCalls"`
Expected: FAIL with "calibrateToActualCalls is not exported"

**Step 3: Implement calibrateToActualCalls**

Add to `shared/lib/jcurve.ts` after `sanitizeMonotonicCurve`:

```typescript
/**
 * Adjust seed TVPI values based on actual capital calls and distributions.
 * Used for "Current mode" when historical data is available.
 *
 * @param ysSeed - Initial TVPI seed values
 * @param calledSoFar - Actual capital calls (periods)
 * @param dpiSoFar - Actual distributions (periods, optional)
 * @returns Calibrated seed values
 */
export function calibrateToActualCalls(
  ysSeed: number[],
  calledSoFar: Decimal[],
  dpiSoFar?: Decimal[]
): number[] {
  if (!calledSoFar || calledSoFar.length === 0) {
    return ysSeed;
  }

  const result = [...ysSeed];
  const calledCum = cumulativeFromPeriods(calledSoFar);
  const dpiCum = dpiSoFar
    ? cumulativeFromPeriods(dpiSoFar)
    : Array(calledCum.length).fill(new Decimal(0));

  for (let i = 0; i < Math.min(calledSoFar.length, result.length); i++) {
    const called = calledCum[i + 1];
    if (called && called.gt(0)) {
      const dpiVal = dpiCum[i + 1];
      if (dpiVal) {
        const approxTvpi = 1 + dpiVal.div(called).toNumber();
        result[i] = approxTvpi || result[i];
      }
    }
  }

  return result;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/jcurve-refactor-golden.test.ts -t "calibrateToActualCalls"`
Expected: PASS (3 tests)

**Step 5: Run golden tests to ensure no regression**

Run: `npx vitest run tests/unit/jcurve-refactor-golden.test.ts`
Expected: PASS (all 11 tests)

**Step 6: Commit**

```bash
git add shared/lib/jcurve.ts tests/unit/jcurve-refactor-golden.test.ts
git commit -m "refactor: extract calibrateToActualCalls helper (Issue #153)"
```

---

## Task 4: Extract buildFittedTVPICurve Helper

**Files:**
- Modify: `shared/lib/jcurve.ts` (add new function)
- Reference: Lines 93-152 in current `computeJCurvePath`

**Step 1: Write test for buildFittedTVPICurve**

Add to `tests/unit/jcurve-refactor-golden.test.ts`:

```typescript
import { buildFittedTVPICurve } from '@shared/lib/jcurve';

describe('buildFittedTVPICurve', () => {
  const baseConfig: JCurveConfig = {
    kind: 'gompertz',
    horizonYears: 10,
    investYears: 5,
    targetTVPI: new Decimal(2.5),
    startTVPI: new Decimal(0.95),
    step: 'quarter',
  };

  it('should build gompertz curve with correct structure', () => {
    const xs = Array.from({ length: 41 }, (_, i) => i / 4);
    const result = buildFittedTVPICurve(baseConfig, xs, 2.5, 0.95);

    expect(result.tvpi.length).toBe(41);
    expect(result.params).toHaveProperty('b');
    expect(result.params).toHaveProperty('c');
    expect(typeof result.rmse).toBe('number');
  });

  it('should build logistic curve with correct params', () => {
    const logisticConfig: JCurveConfig = { ...baseConfig, kind: 'logistic' };
    const xs = Array.from({ length: 41 }, (_, i) => i / 4);
    const result = buildFittedTVPICurve(logisticConfig, xs, 2.5, 0.95);

    expect(result.params).toHaveProperty('r');
    expect(result.params).toHaveProperty('t0');
  });

  it('should handle calibration with actuals', () => {
    const xs = Array.from({ length: 41 }, (_, i) => i / 4);
    const calledSoFar = [new Decimal(0.2), new Decimal(0.2)];
    const dpiSoFar = [new Decimal(0), new Decimal(0)];

    const result = buildFittedTVPICurve(
      baseConfig, xs, 2.5, 0.95, calledSoFar, dpiSoFar
    );

    expect(result.tvpi.length).toBe(41);
    expect(result.rmse).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/jcurve-refactor-golden.test.ts -t "buildFittedTVPICurve"`
Expected: FAIL with "buildFittedTVPICurve is not exported"

**Step 3: Implement buildFittedTVPICurve**

Add to `shared/lib/jcurve.ts` after `calibrateToActualCalls`:

```typescript
interface FittedCurveResult {
  tvpi: Decimal[];
  params: Record<string, number | Decimal>;
  rmse?: number;
}

/**
 * Generate TVPI curve using Gompertz or Logistic fitting.
 * Handles calibration to actuals and monotonic sanitization.
 *
 * @param cfg - J-curve configuration (must have kind 'gompertz' or 'logistic')
 * @param xs - Time points array
 * @param K - Target TVPI (number)
 * @param startTVPI - Starting TVPI value
 * @param calledSoFar - Optional actual capital calls
 * @param dpiSoFar - Optional actual distributions
 * @returns Fitted curve with parameters and RMSE
 */
export function buildFittedTVPICurve(
  cfg: JCurveConfig,
  xs: number[],
  K: number,
  startTVPI: number,
  calledSoFar?: Decimal[],
  dpiSoFar?: Decimal[]
): FittedCurveResult {
  // Generate seed and calibrate if actuals provided
  let ysSeed = generatePiecewiseSeed(xs, K, cfg);
  if (calledSoFar && calledSoFar.length > 0) {
    ysSeed = calibrateToActualCalls(ysSeed, calledSoFar, dpiSoFar);
  }

  // Fit curve to seed
  const fit = fitTVPI(
    cfg.kind === 'gompertz' ? 'gompertz' : 'logistic',
    xs,
    ysSeed,
    K,
    { maxIterations: 200 }
  );

  // Generate TVPI array from fitted parameters
  const tvpiArr = xs.map(t =>
    new Decimal(
      cfg.kind === 'gompertz'
        ? gompertz(t, K, fit.params[0] ?? 1, fit.params[1] ?? 0.5)
        : logistic(t, K, fit.params[0] ?? 0.8, fit.params[1] ?? 1)
    )
  );

  // Sanitize curve
  const sanitized = sanitizeMonotonicCurve(
    tvpiArr,
    new Decimal(startTVPI),
    new Decimal(K)
  );

  // Build params record
  const params: Record<string, number | Decimal> =
    cfg.kind === 'gompertz'
      ? { b: fit.params[0] ?? 1, c: fit.params[1] ?? 0.5 }
      : { r: fit.params[0] ?? 0.8, t0: fit.params[1] ?? 1 };

  return {
    tvpi: sanitized,
    params,
    rmse: fit.rmse,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/jcurve-refactor-golden.test.ts -t "buildFittedTVPICurve"`
Expected: PASS (3 tests)

**Step 5: Run golden tests to ensure no regression**

Run: `npx vitest run tests/unit/jcurve-refactor-golden.test.ts`
Expected: PASS (all 14 tests)

**Step 6: Commit**

```bash
git add shared/lib/jcurve.ts tests/unit/jcurve-refactor-golden.test.ts
git commit -m "refactor: extract buildFittedTVPICurve helper (Issue #153)"
```

---

## Task 5: Refactor computeJCurvePath to Use New Helpers

**Files:**
- Modify: `shared/lib/jcurve.ts:72-183`

**Step 1: Rewrite computeJCurvePath using extracted helpers**

Replace the current function body (lines 72-183) with:

```typescript
export function computeJCurvePath(
  cfg: JCurveConfig,
  feeTimelinePerPeriod: Decimal[],
  calledSoFar?: Decimal[],
  dpiSoFar?: Decimal[]
): JCurvePath {
  // Setup
  const periodsPerYear = cfg.step === 'quarter' ? 4 : 1;
  const N = Math.ceil(cfg.horizonYears * periodsPerYear);
  const xs = Array.from({ length: N + 1 }, (_, i) => i / periodsPerYear);
  const K = cfg.targetTVPI.toNumber();
  const startTVPI = cfg.startTVPI?.toNumber() ?? 0.95;

  // Generate TVPI curve
  let tvpiDecimals: Decimal[];
  let paramsRecord: Record<string, number | Decimal> = {};
  let rmse: number | undefined;

  if (cfg.kind === 'piecewise') {
    const seed = generatePiecewiseSeed(xs, K, cfg);
    tvpiDecimals = seed.map(v => new Decimal(v));
  } else {
    const result = buildFittedTVPICurve(cfg, xs, K, startTVPI, calledSoFar, dpiSoFar);
    tvpiDecimals = result.tvpi;
    paramsRecord = result.params;
    rmse = result.rmse;
  }

  // Generate capital calls
  const calls = generateCapitalCalls(cfg, N, calledSoFar);

  // Materialize NAV & DPI
  const calledCumFull = cumulativeFromPeriods(calls);
  const feesCum = cumulativeFromPeriods(feeTimelinePerPeriod);
  const { nav, dpi } = materializeNAVandDPI(
    tvpiDecimals,
    calledCumFull,
    feesCum,
    cfg,
    dpiSoFar
  );

  // Sensitivity bands
  const sensitivityBands = computeSensitivityBands(cfg, paramsRecord, rmse, N, xs);

  // Assemble result
  const feesOut = padOrTrimDecimals(feeTimelinePerPeriod, N);

  return {
    tvpi: tvpiDecimals,
    nav,
    dpi,
    calls,
    fees: feesOut,
    params: paramsRecord,
    ...(rmse !== undefined ? { fitRMSE: rmse } : {}),
    ...(sensitivityBands !== undefined ? { sensitivityBands } : {}),
  };
}
```

**Step 2: Run golden tests to verify parity**

Run: `npx vitest run tests/unit/jcurve-refactor-golden.test.ts`
Expected: PASS (all tests, snapshots match)

**Step 3: Count lines and verify metrics**

Run: `sed -n '72,120p' shared/lib/jcurve.ts | wc -l`
Expected: ~48 lines (under 50 threshold)

**Step 4: Commit**

```bash
git add shared/lib/jcurve.ts
git commit -m "refactor: simplify computeJCurvePath using extracted helpers (Issue #153)"
```

---

## Task 6: Remove ESLint Suppression

**Files:**
- Modify: `shared/lib/jcurve.ts:71`

**Step 1: Check for existing suppression**

Run: `grep -n "eslint-disable" shared/lib/jcurve.ts`
Expected: Line with complexity suppression (if present)

**Step 2: Remove suppression comment if present**

If a suppression comment exists on line 71, remove it.

**Step 3: Run ESLint to verify complexity is under threshold**

Run: `npx eslint shared/lib/jcurve.ts --rule 'complexity: [error, 8]' --rule 'max-lines-per-function: [error, 50]'`
Expected: No errors

**Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add shared/lib/jcurve.ts
git commit -m "refactor: remove ESLint complexity suppression (Issue #153)"
```

---

## Task 7: Final Verification and PR

**Files:**
- None (verification only)

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 2: Run type check**

Run: `npm run check`
Expected: No TypeScript errors

**Step 3: Run lint**

Run: `npm run lint`
Expected: No lint errors

**Step 4: Verify complexity metrics**

Run: `npx eslint shared/lib/jcurve.ts --format json | jq '.[] | .messages'`
Expected: Empty array (no violations)

**Step 5: Push branch and create PR**

```bash
git push -u origin refactor/issue-153-jcurve-complexity
gh pr create --title "refactor: reduce computeJCurvePath complexity (Issue #153)" --body "$(cat <<'EOF'
## Summary
- Reduced cyclomatic complexity from ~41 to ~5
- Reduced function length from ~112 to ~48 lines
- Extracted 3 focused helpers: `sanitizeMonotonicCurve`, `calibrateToActualCalls`, `buildFittedTVPICurve`
- Added golden snapshot tests to ensure output parity
- Removed temporary ESLint suppression

## Test plan
- [x] Golden snapshot tests verify output parity
- [x] Unit tests for extracted helpers
- [x] Full test suite passes
- [x] ESLint complexity check passes

Closes #153

Generated with Claude Code
EOF
)"
```

---

## Summary

| Task | Description | Commits |
|------|-------------|---------|
| 1 | Golden snapshot tests | 1 |
| 2 | Extract sanitizeMonotonicCurve | 1 |
| 3 | Extract calibrateToActualCalls | 1 |
| 4 | Extract buildFittedTVPICurve | 1 |
| 5 | Refactor main function | 1 |
| 6 | Remove ESLint suppression | 1 |
| 7 | Final verification and PR | 0 |

**Total commits:** 6
**Estimated time:** 30-45 minutes
