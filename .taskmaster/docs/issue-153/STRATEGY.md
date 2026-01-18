# Issue #153: Final Refactoring Strategy

## Summary

Refactor `computeJCurvePath` using a **hybrid approach** that extracts 3 focused helpers while leveraging existing modules (`fitTVPI`, `gompertz`, `logistic`).

## Codex Recommendation vs Final Strategy

| Aspect | Codex Suggested | Final Strategy | Rationale |
|--------|-----------------|----------------|-----------|
| New functions | 7 | 3 | Avoid over-engineering |
| Strategy pattern | Yes (3 curve functions) | No | Already have `fitTVPI` polymorphism |
| Calibration extraction | Yes | Yes (simplified) | Good isolation |
| Monotonic sanitization | Yes | Yes | Generic, reusable |

## Approved Extractions

### 1. `sanitizeMonotonicCurve`

```typescript
/**
 * Ensure curve values are monotonically non-decreasing with clamped endpoints.
 *
 * @param values - Array of curve values (Decimal)
 * @param startValue - Minimum value for first element
 * @param endValue - Exact value for last element
 * @returns Sanitized curve with monotonic guarantee
 */
function sanitizeMonotonicCurve(
  values: Decimal[],
  startValue: Decimal,
  endValue: Decimal
): Decimal[] {
  // ~10 lines, complexity ~2
}
```

**Extracts:** Lines 134-145 (sanitization loop)

### 2. `calibrateToActualCalls`

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
function calibrateToActualCalls(
  ysSeed: number[],
  calledSoFar: Decimal[],
  dpiSoFar?: Decimal[]
): number[] {
  // ~15 lines, complexity ~4
}
```

**Extracts:** Lines 97-114 (calibration loop)

### 3. `buildFittedTVPICurve`

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
 * @param cfg - J-curve configuration
 * @param xs - Time points array
 * @param K - Target TVPI (number)
 * @param startTVPI - Starting TVPI value
 * @param calledSoFar - Optional actual capital calls
 * @param dpiSoFar - Optional actual distributions
 * @returns Fitted curve with parameters and RMSE
 */
function buildFittedTVPICurve(
  cfg: JCurveConfig,
  xs: number[],
  K: number,
  startTVPI: number,
  calledSoFar?: Decimal[],
  dpiSoFar?: Decimal[]
): FittedCurveResult {
  // ~45 lines, complexity ~6
  // Internally calls: calibrateToActualCalls, fitTVPI, gompertz/logistic, sanitizeMonotonicCurve
}
```

**Extracts:** Lines 93-152 (entire fitted branch)

## Refactored `computeJCurvePath` Structure

```typescript
export function computeJCurvePath(
  cfg: JCurveConfig,
  feeTimelinePerPeriod: Decimal[],
  calledSoFar?: Decimal[],
  dpiSoFar?: Decimal[]
): JCurvePath {
  // Setup (~5 lines)
  const periodsPerYear = cfg.step === 'quarter' ? 4 : 1;
  const N = Math.ceil(cfg.horizonYears * periodsPerYear);
  const xs = Array.from({ length: N + 1 }, (_, i) => i / periodsPerYear);
  const K = cfg.targetTVPI.toNumber();
  const startTVPI = cfg.startTVPI?.toNumber() ?? 0.95;

  // TVPI generation (~10 lines)
  let tvpiDecimals: Decimal[];
  let paramsRecord: Record<string, number | Decimal> = {};
  let rmse: number | undefined;

  if (cfg.kind === 'piecewise') {
    tvpiDecimals = generatePiecewiseSeed(xs, K, cfg).map(v => new Decimal(v));
  } else {
    const result = buildFittedTVPICurve(cfg, xs, K, startTVPI, calledSoFar, dpiSoFar);
    tvpiDecimals = result.tvpi;
    paramsRecord = result.params;
    rmse = result.rmse;
  }

  // Delegates (~5 lines)
  const calls = generateCapitalCalls(cfg, N, calledSoFar);
  const calledCumFull = cumulativeFromPeriods(calls);
  const feesCum = cumulativeFromPeriods(feeTimelinePerPeriod);
  const { nav, dpi } = materializeNAVandDPI(tvpiDecimals, calledCumFull, feesCum, cfg, dpiSoFar);
  const sensitivityBands = computeSensitivityBands(cfg, paramsRecord, rmse, N, xs);

  // Result assembly (~10 lines)
  return {
    tvpi: tvpiDecimals,
    nav,
    dpi,
    calls,
    fees: padOrTrimDecimals(feeTimelinePerPeriod, N),
    params: paramsRecord,
    ...(rmse !== undefined ? { fitRMSE: rmse } : {}),
    ...(sensitivityBands !== undefined ? { sensitivityBands } : {}),
  };
}
```

**Expected metrics:**
- Lines: ~35-40 (down from 112)
- Complexity: ~5-6 (down from 41)

## Implementation Order

1. **First:** Run existing tests to understand API mismatch
2. **Second:** Create golden snapshot test (capture current output)
3. **Third:** Extract `sanitizeMonotonicCurve` (simplest, no dependencies)
4. **Fourth:** Extract `calibrateToActualCalls` (isolated logic)
5. **Fifth:** Extract `buildFittedTVPICurve` (combines above)
6. **Sixth:** Refactor main function to use new helpers
7. **Seventh:** Verify golden test parity
8. **Eighth:** Remove ESLint suppression
9. **Ninth:** Run full test suite, submit PR

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Output drift | Golden snapshot test before/after |
| Floating point precision | Use Decimal.js throughout |
| Calibration convergence | Preserve exact loop logic |
| Test failures from API mismatch | Investigate test API first |

## Resolved: API Mismatch

**Finding:** Tests in `tests/shared/*.spec.ts` are **orphaned/stale**:
- Not included in vitest.config.ts (expects `tests/unit/**/*.test.ts`)
- Use `.spec.ts` extension vs project convention `.test.ts`
- Use outdated API (`mainPath`, `fundSize`) vs current implementation

**Resolution:**
1. **Do NOT update orphaned tests** - they're likely from an earlier prototype
2. **Create new golden tests** in `tests/unit/jcurve-refactor.test.ts` using actual API
3. Use snapshot testing to capture current output before refactoring

**Updated Implementation Order:**
1. ~~Run existing tests~~ → Skip (orphaned)
2. **Create new golden test** capturing current `computeJCurvePath` output
3. Extract `sanitizeMonotonicCurve`
4. Extract `calibrateToActualCalls`
5. Extract `buildFittedTVPICurve`
6. Refactor main function
7. Verify golden test parity
8. Remove ESLint suppression
9. Submit PR (optionally delete orphaned tests)
