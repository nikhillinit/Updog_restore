// shared/lib/jcurve.ts
/**
 * J-Curve Engine (REVISED with all fixes applied)
 *
 * IMPORTANT ASSUMPTIONS & LIMITATIONS:
 *
 * 1. **Distribution Coefficient**: Configurable via `finalDistributionCoefficient`
 *    (default 0.7 = 70%). This is a heuristic; actual distribution % varies by fund strategy.
 *
 * 2. **NAV Calculation**: Two modes available:
 *    - 'standard' (default): NAV = Total Value - DPI
 *    - 'fee-adjusted': NAV = Total Value - DPI - Fees (non-standard)
 *
 * 3. **Curve Fitting**: Gompertz/logistic curves fitted to target TVPI. Check `fitRMSE`
 *    for fit quality; use piecewise fallback for low-confidence scenarios.
 *
 * 4. **Sensitivity Bands**: Parameter perturbation analysis, NOT statistical confidence intervals.
 *
 * VALIDATION REQUIRED:
 * - Compare against Excel/Python golden datasets
 * - Validate with domain experts for your fund strategy
 * - Consider Monte Carlo for true probabilistic forecasting
 */

import Decimal from 'decimal.js';
import { fitTVPI } from './jcurve-fit';
import { gompertz, logistic } from './jcurve-shapes';

export type CurveKind = 'gompertz' | 'logistic' | 'piecewise';
export type PacingStrategy = 'front-loaded' | 'flat' | 'back-loaded';
export type Step = 'quarter' | 'year';
export type NavCalculationMode = 'standard' | 'fee-adjusted';

export interface JCurveConfig {
  kind: CurveKind;
  horizonYears: number;
  investYears: number;
  targetTVPI: Decimal;
  startTVPI?: Decimal;
  step: Step;
  pacingStrategy?: PacingStrategy;
  distributionLag?: number;
  confidenceEpsilon?: number;
  /** Fraction of total value eventually distributed (default 0.7 = 70%) */
  finalDistributionCoefficient?: number;
  /** NAV calculation mode: 'standard' (default) or 'fee-adjusted' */
  navCalculationMode?: NavCalculationMode;
}

export interface JCurvePath {
  tvpi: Decimal[];
  nav: Decimal[];
  dpi: Decimal[];
  calls: Decimal[];
  fees: Decimal[];
  params: Record<string, number | Decimal>;
  fitRMSE?: number;
  /** Sensitivity bands - NOT probabilistic confidence intervals */
  sensitivityBands?: { low: Decimal[]; high: Decimal[] };
}

/**
 * Compute J-curve path with TVPI, NAV, DPI projections
 *
 * @param cfg - Configuration with all assumptions explicit
 * @param feeTimelinePerPeriod - Per-period management fees (length N)
 * @param calledSoFar - Optional: actual capital calls to-date (Current mode)
 * @param dpiSoFar - Optional: actual distributions to-date (Current mode)
 * @returns Complete J-curve path with sensitivity bands
 */
 
export function computeJCurvePath(
  cfg: JCurveConfig,
  feeTimelinePerPeriod: Decimal[],
  calledSoFar?: Decimal[],
  dpiSoFar?: Decimal[]
): JCurvePath {
  const periodsPerYear = cfg.step === 'quarter' ? 4 : 1;
  const N = Math.ceil(cfg.horizonYears * periodsPerYear);
  const xs = Array.from({ length: N + 1 }, (_, i) => i / periodsPerYear);
  const K = cfg.targetTVPI.toNumber();
  const startTVPI = cfg.startTVPI?.toNumber() ?? 0.95;

  // Step 1: Generate/fit TVPI curve
  let tvpiDecimals: Decimal[];
  let paramsRecord: Record<string, number | Decimal> = {};
  let rmse: number | undefined;

  if (cfg.kind === 'piecewise') {
    const seed = generatePiecewiseSeed(xs, K, cfg);
    tvpiDecimals = seed.map(v => new Decimal(v));
    rmse = undefined;
  } else {
    const ysSeed = generatePiecewiseSeed(xs, K, cfg);

    // Calibrate to actuals if provided (Current mode)
    if (calledSoFar && calledSoFar.length > 0) {
      const calledCum = cumulativeFromPeriods(calledSoFar);
      const dpiCum = dpiSoFar
        ? cumulativeFromPeriods(dpiSoFar)
        : Array(calledCum.length).fill(new Decimal(0));

      for (let i = 0; i < Math.min(calledSoFar.length, ysSeed.length); i++) {
        const called = calledCum[i + 1];
        if (called && called.gt(0)) {
          // Crude observed TVPI approximation
          const dpiVal = dpiCum[i + 1];
          if (dpiVal) {
            const approxTvpi = 1 + dpiVal.div(called).toNumber();
            ysSeed[i] = approxTvpi || ysSeed[i];
          }
        }
      }
    }

    const fit = fitTVPI(
      cfg.kind === 'gompertz' ? 'gompertz' : 'logistic',
      xs,
      ysSeed,
      K,
      { maxIterations: 200 }
    );
    rmse = fit.rmse;

    const tvpiArr = xs.map(t =>
      new Decimal(
        cfg.kind === 'gompertz'
          ? gompertz(t, K, fit.params[0] ?? 1, fit.params[1] ?? 0.5)
          : logistic(t, K, fit.params[0] ?? 0.8, fit.params[1] ?? 1)
      )
    );

    // Sanitize: monotonic + endpoints
    const firstElem = tvpiArr[0];
    if (firstElem) {
      tvpiArr[0] = Decimal.max(firstElem, new Decimal(startTVPI));
    }
    tvpiArr[tvpiArr.length - 1] = new Decimal(K);
    for (let i = 1; i < tvpiArr.length; i++) {
      const current = tvpiArr[i];
      const previous = tvpiArr[i - 1];
      if (current && previous && current.lt(previous)) {
        tvpiArr[i] = previous;
      }
    }

    tvpiDecimals = tvpiArr;
    paramsRecord =
      cfg.kind === 'gompertz'
        ? { b: fit.params[0] ?? 1, c: fit.params[1] ?? 0.5 }
        : { r: fit.params[0] ?? 0.8, t0: fit.params[1] ?? 1 };
  }

  // Step 2: Generate capital calls (normalized)
  const calls = generateCapitalCalls(cfg, N, calledSoFar);

  // Step 3: Materialize NAV & DPI
  const calledCumFull = cumulativeFromPeriods(calls);
  const feesCum = cumulativeFromPeriods(feeTimelinePerPeriod);
  const { nav, dpi } = materializeNAVandDPI(
    tvpiDecimals,
    calledCumFull,
    feesCum,
    cfg,
    dpiSoFar
  );

  // Step 4: Sensitivity bands
  const sensitivityBands = computeSensitivityBands(cfg, paramsRecord, rmse, N, xs);

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

/**
 * Result from building a fitted TVPI curve
 */
export interface FittedCurveResult {
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

/* ---------------------- Internal Helpers ---------------------- */

function generatePiecewiseSeed(
  xs: number[],
  targetTVPI: number,
  cfg: JCurveConfig
): number[] {
  const out: number[] = [];
  const investFrac = Math.max(0, Math.min(1, cfg.investYears / cfg.horizonYears));
  const holdingFrac = 0.5;
  const harvestStart = Math.min(1, investFrac + holdingFrac);
  const start = cfg.startTVPI?.toNumber() ?? 1.0;

  for (const t of xs) {
    const tNorm = t / cfg.horizonYears;
    if (tNorm <= investFrac) {
      const v = start - (start - 0.9) * (tNorm / Math.max(1e-9, investFrac));
      out.push(v);
    } else if (tNorm <= harvestStart) {
      const frac = (tNorm - investFrac) / Math.max(1e-9, harvestStart - investFrac);
      out.push(0.9 + (targetTVPI - 0.9) * frac);
    } else {
      out.push(targetTVPI);
    }
  }
  return out;
}

function generateCapitalCalls(
  cfg: JCurveConfig,
  N: number,
  calledSoFar?: Decimal[]
): Decimal[] {
  const periodsPerYear = cfg.step === 'quarter' ? 4 : 1;
  const investPeriods = Math.max(1, Math.ceil(cfg.investYears * periodsPerYear));
  const prefix = (calledSoFar ?? []).slice(0, investPeriods);
  const calls: Decimal[] = [];

  for (let i = 0; i < investPeriods; i++) {
    if (i < prefix.length) {
      const prefixVal = prefix[i];
      calls.push(new Decimal(prefixVal ?? 0));
      continue;
    }
    let w = 1;
    if (cfg.pacingStrategy === 'front-loaded')
      w = 1.5 - i / Math.max(1, investPeriods - 1);
    if (cfg.pacingStrategy === 'back-loaded')
      w = 0.5 + i / Math.max(1, investPeriods - 1);
    calls.push(new Decimal(w));
  }

  for (let i = investPeriods; i < N; i++) calls.push(new Decimal(0));

  // Normalize sum to 1
  const prefixSum = calls
    .slice(0, investPeriods)
    .reduce((s, v) => s.plus(v), new Decimal(0));
  if (prefixSum.gt(0)) {
    for (let i = 0; i < investPeriods; i++) {
      const callVal = calls[i];
      if (callVal) calls[i] = callVal.div(prefixSum);
    }
  } else {
    for (let i = 0; i < investPeriods; i++)
      calls[i] = new Decimal(1 / investPeriods);
  }

  while (calls.length < N) calls.push(new Decimal(0));
  return calls.slice(0, N);
}

function materializeNAVandDPI(
  tvpi: Decimal[],
  calledCum: Decimal[],
  feesCum: Decimal[],
  cfg: JCurveConfig,
  dpiSoFar?: Decimal[]
): { nav: Decimal[]; dpi: Decimal[] } {
  const N = tvpi.length - 1;
  const periodsPerYear = cfg.step === 'quarter' ? 4 : 1;
  const distLagPeriods = Math.round(
    (cfg.distributionLag ?? cfg.investYears + 2) * periodsPerYear
  );
  const finalDistCoef = cfg.finalDistributionCoefficient ?? 0.7;
  const navMode: NavCalculationMode = cfg.navCalculationMode ?? 'standard';

  const nav: Decimal[] = [];
  const dpi: Decimal[] = [];

  for (let i = 0; i < N; i++) {
    const called = calledCum[i + 1] ?? new Decimal(0);
    const tvpiVal = tvpi[i + 1] ?? new Decimal(0);
    const totalValue = tvpiVal.mul(called);
    const feesToDate = feesCum[i + 1] ?? new Decimal(0);

    // DPI ramp logic
    let dpiVal = new Decimal(0);
    if (i + 1 < distLagPeriods) {
      const dpiSoFarVal = dpiSoFar?.[i];
      dpiVal = dpiSoFarVal ? new Decimal(dpiSoFarVal) : new Decimal(0);
    } else {
      const rampFrac = Math.min(
        1,
        (i + 1 - distLagPeriods + 1) / Math.max(1, N - distLagPeriods + 1)
      );
      const targetDPI = totalValue.mul(finalDistCoef).mul(rampFrac);
      dpiVal = targetDPI;
    }

    // Ensure monotonic
    const lastDpi = dpi[dpi.length - 1];
    if (lastDpi && dpiVal.lt(lastDpi))
      dpiVal = lastDpi;
    dpi.push(dpiVal);

    // NAV calculation modes
    let navVal: Decimal;
    if (navMode === 'fee-adjusted') {
      // Non-standard: subtract fees explicitly
      navVal = Decimal.max(new Decimal(0), totalValue.minus(dpiVal).minus(feesToDate));
    } else {
      // Standard: NAV = Total Value - DPI
      navVal = Decimal.max(new Decimal(0), totalValue.minus(dpiVal));
    }
    nav.push(navVal);
  }

  return { nav, dpi };
}

/**
 * Compute sensitivity bands via parameter perturbation
 * NOTE: These are NOT statistical confidence intervals
 */
function computeSensitivityBands(
  cfg: JCurveConfig,
  params: Record<string, number | Decimal>,
  rmse: number | undefined,
  N: number,
  xs: number[]
): { low: Decimal[]; high: Decimal[] } | undefined {
  if (!rmse || isNaN(rmse)) return undefined;
  const eps = cfg.confidenceEpsilon ?? Math.min(0.1, rmse * 2);
  const K = cfg.targetTVPI.toNumber();
  const low: Decimal[] = [];
  const high: Decimal[] = [];

  if (cfg.kind === 'gompertz') {
    const b = Number(params['b'] ?? 1);
    const c = Number(params['c'] ?? 0.5);
    for (const t of xs) {
      low.push(new Decimal(gompertz(t, K, b * (1 + eps), c * (1 - eps))));
      high.push(new Decimal(gompertz(t, K, b * (1 - eps), c * (1 + eps))));
    }
  } else if (cfg.kind === 'logistic') {
    // FIXED: Use correct logistic parameter names
    const r = Number(params['r'] ?? 0.8);
    const t0 = Number(params['t0'] ?? xs.length / 2);
    for (const t of xs) {
      low.push(new Decimal(logistic(t, K, r * (1 - eps), t0 * (1 + eps))));
      high.push(new Decimal(logistic(t, K, r * (1 + eps), t0 * (1 - eps))));
    }
  } else {
    return undefined;
  }

  // Sanitize: monotonic + clamp endpoints
  for (let i = 1; i < low.length; i++) {
    const lowCurrent = low[i];
    const lowPrevious = low[i - 1];
    const highCurrent = high[i];
    const highPrevious = high[i - 1];

    if (lowCurrent && lowPrevious && lowCurrent.lt(lowPrevious)) {
      low[i] = lowPrevious;
    }
    if (highCurrent && highPrevious && highCurrent.lt(highPrevious)) {
      high[i] = highPrevious;
    }
  }
  const lowFirst = low[0];
  if (lowFirst) {
    low[0] = Decimal.max(lowFirst, new Decimal(cfg.startTVPI?.toNumber() ?? 0.9));
  }
  high[high.length - 1] = new Decimal(K);
  return { low, high };
}

export function cumulativeFromPeriods(periods: Decimal[]): Decimal[] {
  const out: Decimal[] = [new Decimal(0)];
  for (const v of periods) {
    const last = out[out.length - 1];
    if (last) {
      out.push(last.plus(v));
    }
  }
  return out;
}

function padOrTrimDecimals(arr: Decimal[], n: number): Decimal[] {
  const out = (arr ?? []).slice(0, n);
  while (out.length < n) out.push(new Decimal(0));
  return out;
}
