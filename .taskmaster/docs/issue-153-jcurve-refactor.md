# Issue #153: Refactor computeJCurvePath to Reduce Complexity

## Problem Statement

`shared/lib/jcurve.ts::computeJCurvePath` has:
- Cyclomatic complexity ~41 (threshold: 8)
- Function length ~112 lines (threshold: 50)
- Temporary ESLint suppression from PR #145

## Current State Analysis

### Implementation (`shared/lib/jcurve.ts`)

**Function signature:**
```typescript
function computeJCurvePath(
  cfg: JCurveConfig,
  feeTimelinePerPeriod: Decimal[],
  calledSoFar?: Decimal[],
  dpiSoFar?: Decimal[]
): JCurvePath
```

**Returns:**
```typescript
interface JCurvePath {
  tvpi: Decimal[];
  nav: Decimal[];
  dpi: Decimal[];
  calls: Decimal[];
  fees: Decimal[];
  params: Record<string, number | Decimal>;
  fitRMSE?: number;
  sensitivityBands?: { low: Decimal[]; high: Decimal[] };
}
```

**Existing helper functions:**
- `generatePiecewiseSeed(xs, targetTVPI, cfg)` - 24 lines
- `generateCapitalCalls(cfg, N, calledSoFar)` - 42 lines
- `materializeNAVandDPI(tvpi, calledCum, feesCum, cfg, dpiSoFar)` - 57 lines
- `computeSensitivityBands(cfg, params, rmse, N, xs)` - 52 lines
- `cumulativeFromPeriods(periods)` - 9 lines
- `padOrTrimDecimals(arr, n)` - 4 lines

### Test Files - API MISMATCH

**Tests expect:**
```typescript
interface JCurveConfig {
  fundSize: Decimal;
  targetTVPI: number;
  investmentPeriodQuarters: number;
  fundLifeQuarters: number;
  actualTVPIPoints: { quarter: number; tvpi: number }[];
  navCalculationMode?: 'standard' | 'fee-adjusted';
  finalDistributionCoefficient?: number;
}

interface JCurveResult {
  mainPath: { quarter: number; tvpi: number; dpi: number; rvpi: number }[];
  upperBand: { quarter: number; tvpi: number }[];
  lowerBand: { quarter: number; tvpi: number }[];
}
```

**Implementation provides:**
- Different config structure (horizonYears, investYears, kind, step)
- Different return type (arrays of Decimals, not objects with quarter)

## Acceptance Criteria (from Issue)

- [ ] Cyclomatic complexity <= 8 per function
- [ ] Function length <= 50 lines per function
- [ ] Golden tests ensure output parity (before/after refactor)
- [ ] Remove temporary ESLint suppression from `jcurve.ts:71`
- [ ] All existing tests pass

## Proposed Decomposition

### Issue's Suggested Helpers:
1. `normalizeInputs` - validate and set defaults
2. `computeContributions` - capital call logic
3. `computeDistributions` - DPI ramp logic
4. `buildSeries` - TVPI curve generation
5. `smooth` - monotonic sanitization
6. `toMetrics` - final NAV/DPI calculation

### Analysis of Current Code Structure:

The main function (lines 72-183) does:
1. **Setup** (lines 78-82): Period calculation, xs array, K value
2. **TVPI curve generation** (lines 84-152): Branch on piecewise vs fitted
3. **Capital calls** (line 155): Delegate to `generateCapitalCalls`
4. **NAV/DPI materialization** (lines 158-166): Delegate to `materializeNAVandDPI`
5. **Sensitivity bands** (line 169): Delegate to `computeSensitivityBands`
6. **Result assembly** (lines 171-182): Build return object

### Complexity Sources:
- Lines 89-152: Large if/else block for curve fitting
- Lines 97-114: Nested loop with conditionals for calibration
- Lines 139-145: Monotonic sanitization loop

## Strategy Options

### Option A: Extract More Helpers (Minimal Change)
- Extract `fitAndSanitizeTVPI(cfg, xs, K, calledSoFar, dpiSoFar)`
- Extract `normalizeInputs(cfg)` for default handling
- Keep existing helpers

### Option B: Pipeline Pattern (Functional)
```typescript
const result = pipe(
  normalizeConfig(cfg),
  computeTVPICurve,
  computeCapitalCalls,
  materializeMetrics,
  addSensitivityBands,
  assembleResult
);
```

### Option C: Strategy Pattern (OOP)
- Abstract `CurveFitter` with `Gompertz`, `Logistic`, `Piecewise` strategies
- Separate `MetricsMaterializer` class

### Option D: Fix API Mismatch First
- Align tests with actual implementation OR
- Create adapter layer between test API and implementation API

## Open Questions

1. **API Contract**: Should we fix tests to match implementation, or update implementation to match test expectations?
2. **Breaking Changes**: Are there other consumers of `computeJCurvePath` that would break?
3. **Test Coverage**: Can tests run with current implementation? (They use different types)

## Next Steps

1. [ ] Codex consultation for optimal decomposition strategy
2. [ ] Decide API alignment approach
3. [ ] Run existing tests to verify current state
4. [ ] Write golden snapshot tests BEFORE refactoring
5. [ ] Implement decomposition
6. [ ] Verify parity with golden snapshots
7. [ ] Remove ESLint suppression
