/**
 * XIRR (Extended Internal Rate of Return) Calculator
 *
 * Canonical implementation for both client and server use.
 * Provides a 3-tier fallback solver: Newton -> Brent -> Bisection
 *
 * @module shared/lib/finance/xirr
 */

import { brent } from './brent-solver';
import type { PeriodResult } from '@shared/schemas/fund-model';

export interface CashFlow {
  date: Date; // JS Date (will be normalized to UTC midnight internally)
  amount: number; // negative = contribution, positive = distribution
}

/**
 * Cash flow event with string date (for compatibility with selector types)
 */
export interface CashFlowEvent {
  date: string; // ISO date string
  amount: number;
  type?: string; // Optional type metadata
}

export interface XIRRResult {
  irr: number | null; // annualized rate (e.g., 0.1487); null for invalid inputs
  converged: boolean;
  iterations: number;
  method: 'newton' | 'bisection' | 'brent' | 'none';
}

/**
 * Safe XIRR result for UI consumption (never throws)
 */
export interface SafeXIRRResult {
  irr: number | null;
  converged: boolean;
  iterations: number;
  method: string;
  error?: string;
}

type XIRRStrategy = 'hybrid' | 'newton' | 'bisection';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Rate bounds: from -99.9999% to +20,000%
// Extended to handle extreme returns (e.g., 10x in 6 months = ~9,900% IRR)
const MIN_RATE = -0.999999;
const MAX_RATE = 200;

/**
 * Normalize a JS Date to UTC midnight and return the corresponding
 * "Excel-style" serial day number (days since epoch).
 */
function serialDayUtc(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY;
}

/**
 * Excel-compatible Actual/365.25 year fraction with UTC-normalized dates.
 * Uses 365.25 denominator to match Excel XIRR behavior empirically.
 * Note: Excel documentation says 365, but testing shows 365.25 matches output.
 */
function yearFraction(start: Date, current: Date): number {
  const startSerial = serialDayUtc(start);
  const currentSerial = serialDayUtc(current);
  const dayDiff = currentSerial - startSerial;
  return dayDiff / 365.25;
}

/**
 * Clamp IRR into a safe, well-defined range.
 */
function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return rate;
  return Math.max(MIN_RATE, Math.min(MAX_RATE, rate));
}

/**
 * NPV at a given rate.
 * `flows` are assumed to be normalized and sorted by date.
 */
function npvAt(rate: number, flows: CashFlow[], t0: Date): number {
  return flows.reduce((sum, cf) => {
    const years = yearFraction(t0, cf.date);
    const denom = Math.pow(1 + rate, years);
    return sum + cf.amount / denom;
  }, 0);
}

/**
 * Derivative of NPV with respect to rate (for Newton).
 */
function dNpvAt(rate: number, flows: CashFlow[], t0: Date): number {
  return flows.reduce((sum, cf) => {
    const years = yearFraction(t0, cf.date);
    const denom = Math.pow(1 + rate, years + 1);
    return sum - (years * cf.amount) / denom;
  }, 0);
}

/**
 * Newton-Raphson solver.
 * Returns success only if tolerance is met; otherwise returns a failure
 * with method 'newton'.
 */
function solveNewton(
  flows: CashFlow[],
  t0: Date,
  guess: number,
  tolerance: number,
  maxIterations: number
): XIRRResult {
  let rate = clampRate(guess);
  let iterations = 0;

  for (let i = 0; i < maxIterations; i++) {
    iterations = i + 1;

    const f = npvAt(rate, flows, t0);
    if (Math.abs(f) < tolerance) {
      const irr = clampRate(rate);
      return {
        irr,
        converged: true,
        iterations,
        method: 'newton',
      };
    }

    const df = dNpvAt(rate, flows, t0);

    // Derivative too small or invalid: can't progress safely with Newton
    if (!Number.isFinite(df) || Math.abs(df) < 1e-12) {
      return {
        irr: null,
        converged: false,
        iterations,
        method: 'newton',
      };
    }

    const next = rate - f / df;

    // Divergence or non-finite: abandon Newton
    if (!Number.isFinite(next) || Math.abs(next - rate) > 100) {
      return {
        irr: null,
        converged: false,
        iterations,
        method: 'newton',
      };
    }

    rate = clampRate(next);
  }

  // Hit maxIterations without reaching tolerance: timeout
  return {
    irr: null,
    converged: false,
    iterations: maxIterations,
    method: 'newton',
  };
}

/**
 * Brent wrapper with adaptive bracket expansion.
 * Expands upper bound until a sign change is found or MAX_RATE is reached.
 */
function solveBrent(flows: CashFlow[], t0: Date, tolerance: number): XIRRResult {
  const f = (r: number) => npvAt(r, flows, t0);

  // Adaptive bracket expansion for extreme IRRs
  const lo = -0.95;
  let hi = 15;
  const fLo = f(lo);
  let fHi = f(hi);

  // Expand upper bound until sign change or MAX_RATE reached
  while (Number.isFinite(fHi) && fLo * fHi > 0 && hi < MAX_RATE) {
    hi = Math.min(hi * 2, MAX_RATE);
    fHi = f(hi);
  }

  // Cannot bracket a root - return failure
  if (!Number.isFinite(fHi) || fLo * fHi > 0) {
    return {
      irr: null,
      converged: false,
      iterations: 0,
      method: 'brent',
    };
  }

  const result = brent(f, lo, hi, {
    tolerance: Math.min(tolerance, 1e-8),
    maxIterations: 200,
  });

  if (result.converged && result.root !== null && Number.isFinite(result.root)) {
    const irr = clampRate(result.root);
    return {
      irr,
      converged: true,
      iterations: result.iterations,
      method: 'brent',
    };
  }

  return {
    irr: null,
    converged: false,
    iterations: result.iterations,
    method: 'brent',
  };
}

/**
 * Bisection solver (last resort).
 */
function solveBisection(
  flows: CashFlow[],
  t0: Date,
  tolerance: number,
  maxIterations: number
): XIRRResult {
  let lo = -0.99;
  let hi = 50.0; // wide upper bound; final IRR is still clamped
  let fLo = npvAt(lo, flows, t0);
  let fHi = npvAt(hi, flows, t0);

  // Try to ensure a sign change; expand upper bound if needed
  if (fLo * fHi > 0) {
    hi = 100.0;
    fHi = npvAt(hi, flows, t0);
    if (fLo * fHi > 0) {
      // Cannot bracket a root
      return {
        irr: null,
        converged: false,
        iterations: 0,
        method: 'bisection',
      };
    }
  }

  let iterations = 0;

  for (let i = 0; i < maxIterations; i++) {
    iterations = i + 1;
    const mid = (lo + hi) / 2;
    const fMid = npvAt(mid, flows, t0);

    if (Math.abs(fMid) < tolerance || Math.abs(hi - lo) < tolerance) {
      const irr = clampRate(mid);
      return {
        irr,
        converged: true,
        iterations,
        method: 'bisection',
      };
    }

    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }

  return {
    irr: null,
    converged: false,
    iterations,
    method: 'bisection',
  };
}

/**
 * XIRR solver with configurable strategy:
 * - 'hybrid': Newton -> Brent -> Bisection
 * - 'newton': Newton only
 * - 'bisection': Bisection only
 */
export function xirrNewtonBisection(
  flowsIn: CashFlow[],
  guess = 0.1,
  tolerance = 1e-7,
  maxIterations = 100,
  strategy: XIRRStrategy = 'hybrid'
): XIRRResult {
  // Sort cash flows by date (UTC normalization happens in yearFraction)
  const flows: CashFlow[] = [...flowsIn].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Need at least two flows
  if (flows.length < 2) {
    return { irr: null, converged: false, iterations: 0, method: 'none' };
  }

  const t0 = flows[0]!.date;

  // Require at least one negative and one positive cashflow
  const hasNeg = flows.some((cf) => cf.amount < 0);
  const hasPos = flows.some((cf) => cf.amount > 0);
  if (!hasNeg || !hasPos) {
    return { irr: null, converged: false, iterations: 0, method: 'none' };
  }

  // Strategy: Newton only
  if (strategy === 'newton') {
    return solveNewton(flows, t0, guess, tolerance, maxIterations);
  }

  // Strategy: Bisection only
  if (strategy === 'bisection') {
    return solveBisection(flows, t0, tolerance, maxIterations);
  }

  // Strategy: Hybrid (Newton -> Brent -> Bisection)

  const newtonResult = solveNewton(flows, t0, guess, tolerance, maxIterations);

  if (newtonResult.converged) {
    return newtonResult;
  }

  // Newton failed (timeout, divergence, or derivative issue) -> try Brent
  // Note: We always try fallbacks regardless of Newton failure mode
  const brentResult = solveBrent(flows, t0, tolerance);
  if (brentResult.converged) {
    return {
      ...brentResult,
      iterations: newtonResult.iterations + brentResult.iterations,
    };
  }

  // Brent also failed -> try Bisection
  const bisectionResult = solveBisection(flows, t0, tolerance, maxIterations);
  if (bisectionResult.converged) {
    return {
      ...bisectionResult,
      iterations: newtonResult.iterations + bisectionResult.iterations,
    };
  }

  // All methods failed; report Newton failure by default
  return newtonResult;
}

// ============================================================================
// SAFE WRAPPERS (for UI use - never throw, return null on failure)
// ============================================================================

/**
 * Safe XIRR calculation - never throws, returns null IRR on failure.
 * Use this in React components and selectors to prevent UI crashes.
 *
 * @param cashFlows - Array of cash flow events (with string dates)
 * @param guess - Initial guess (default 0.1 = 10%)
 * @returns SafeXIRRResult with irr (null on failure), optional error message
 */
export function safeXIRR(cashFlows: CashFlowEvent[], guess = 0.1): SafeXIRRResult {
  try {
    // Convert string dates to Date objects
    const flows: CashFlow[] = cashFlows.map((cf) => ({
      date: new Date(cf.date),
      amount: cf.amount,
    }));

    // Guard: Invalid Date produces NaN which poisons solver bracket checks
    if (flows.some((cf) => isNaN(cf.date.getTime()))) {
      return {
        irr: null,
        converged: false,
        iterations: 0,
        method: 'none',
        error: 'Invalid date in cash flows',
      };
    }

    const result = xirrNewtonBisection(flows, guess);
    return {
      irr: result.irr,
      converged: result.converged,
      iterations: result.iterations,
      method: result.method,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown XIRR calculation error';
    return {
      irr: null,
      converged: false,
      iterations: 0,
      method: 'none',
      error: errorMessage,
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS (for fund model integration)
// ============================================================================

/**
 * Build cashflow schedule from period results
 *
 * Uses period-end dates for deterministic Excel parity.
 * Follows Policy A: Immediate distribution (distributions in period received).
 *
 * @param periodResults - Array of period results from fund model
 * @returns Array of cashflows for XIRR calculation
 */
export function buildCashflowSchedule(periodResults: PeriodResult[]): CashFlow[] {
  const cashflows: CashFlow[] = [];

  periodResults.forEach((period) => {
    const date = new Date(period.periodEnd); // Use period-end for Excel parity

    // Contributions are negative (outflows from LP perspective)
    if (period.contributions > 0) {
      cashflows.push({
        date,
        amount: -period.contributions,
      });
    }

    // Distributions are positive (inflows to LP)
    if (period.distributions > 0) {
      cashflows.push({
        date,
        amount: period.distributions,
      });
    }
  });

  // Add final NAV as terminal cashflow
  const finalPeriod = periodResults[periodResults.length - 1];
  if (finalPeriod && finalPeriod.nav > 0) {
    cashflows.push({
      date: new Date(finalPeriod.periodEnd),
      amount: finalPeriod.nav,
    });
  }

  return cashflows;
}

/**
 * Calculate IRR from period results
 *
 * Convenience function that builds cashflow schedule and calculates XIRR.
 *
 * @param periodResults - Array of period results from fund model
 * @returns Annualized IRR as decimal (e.g., 0.15 = 15%), or null if calculation fails
 */
export function calculateIRRFromPeriods(periodResults: PeriodResult[]): number | null {
  const cashflows = buildCashflowSchedule(periodResults);
  const result = xirrNewtonBisection(cashflows);
  return result.irr;
}
