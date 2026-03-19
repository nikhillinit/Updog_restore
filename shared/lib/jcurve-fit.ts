// shared/lib/jcurve-fit.ts
/**
 * Nonlinear least squares curve fitting using Levenberg-Marquardt algorithm
 *
 * Wraps ml-levenberg-marquardt library to fit Gompertz/logistic curves
 * to target TVPI with robust error handling and fallback strategies.
 */

import { levenbergMarquardt, type ParameterizedFunction } from 'ml-levenberg-marquardt';
import { gompertz, logistic } from './jcurve-shapes';

export type CurveKind = 'gompertz' | 'logistic';

export interface FitOptions {
  maxIterations?: number;
}

export interface FitResult {
  params: number[];
  rmse: number;
}

/**
 * Fit TVPI curve to target value using nonlinear least squares
 *
 * @param kind - 'gompertz' or 'logistic'
 * @param xs - Time points (in years)
 * @param ys - Seed TVPI values (piecewise or historical)
 * @param K - Target TVPI at horizon
 * @param opts - Fitting options
 * @returns Fitted parameters and root-mean-square error
 *
 * @example
 * const { params, rmse } = fitTVPI('gompertz', [0, 5, 10], [0.95, 1.5, 2.5], 2.5);
 * // params = [b, c] for gompertz
 * // rmse indicates fit quality (lower is better)
 */
export function fitTVPI(
  kind: CurveKind,
  xs: number[],
  ys: number[],
  K: number,
  opts?: FitOptions
): FitResult {
  const modelFactory =
    (initial: number[]): ParameterizedFunction =>
    (p: number[]) =>
    (t: number) =>
      kind === 'gompertz'
        ? gompertz(t, K, p[0] ?? initial[0] ?? 1, p[1] ?? initial[1] ?? 0.5)
        : logistic(t, K, p[0] ?? initial[0] ?? 0.8, p[1] ?? initial[1] ?? 1);

  // Initial parameter guesses
  const initial =
    kind === 'gompertz'
      ? [1.0, 0.5] // [b, c] - reasonable defaults for 10yr fund
      : [0.8, xs[Math.floor(xs.length / 2)] || 1]; // [r, t0]

  try {
    const result = levenbergMarquardt({ x: xs, y: ys }, modelFactory(initial), {
      initialValues: initial,
      maxIterations: opts?.maxIterations ?? 100,
    });

    const params = result.parameterValues.length > 0 ? result.parameterValues : initial;
    const fittedCurve = modelFactory(initial)(params);
    const sampleCount = Math.max(Math.min(xs.length, ys.length), 1);

    const rmse = Math.sqrt(
      ys.reduce((sum, observed, index) => {
        const x = xs[index];
        if (x === undefined) {
          return sum;
        }

        const residual = observed - fittedCurve(x);
        return sum + residual * residual;
      }, 0) / sampleCount
    );

    return { params, rmse };
  } catch {
    // Fit failed - return initial guess with NaN RMSE
    // Caller should fall back to piecewise path
    return { params: initial, rmse: Number.NaN };
  }
}
