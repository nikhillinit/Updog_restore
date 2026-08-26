// shared/lib/jcurve-shapes.ts
/**
 * Mathematical shape functions for J-curve fitting
 *
 * Gompertz and logistic curves are industry-standard S-curve models
 * used for portfolio value progression in venture capital.
 */

/**
 * Gompertz function - asymmetric S-curve
 *
 * K: carrying capacity (target TVPI)
 * b: displacement along x-axis
 * c: growth rate
 *
 * Properties:
 * - Faster growth in early periods
 * - Slower approach to asymptote
 * - Well-suited for VC portfolios with early momentum
 */
export const gompertz = (t: number, K: number, b: number, c: number): number =>
  K * Math.exp(-b * Math.exp(-c * t));

/**
 * Logistic function - symmetric S-curve
 *
 * K: carrying capacity (target TVPI)
 * r: growth rate
 * t0: midpoint of growth period
 *
 * Properties:
 * - Symmetric around midpoint
 * - Smooth acceleration and deceleration
 * - Well-suited for portfolios with steady pacing
 */
export const logistic = (t: number, K: number, r: number, t0: number): number =>
  K / (1 + Math.exp(-r * (t - t0)));
