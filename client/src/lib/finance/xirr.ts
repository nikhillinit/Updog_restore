import { brent } from './brent-solver';

export interface CashFlow {
  date: Date; // JS Date (will be normalized to UTC midnight internally)
  amount: number; // negative = contribution, positive = distribution
}

export interface XIRRResult {
  irr: number | null; // annualized rate (e.g., 0.1487); null for invalid inputs
  converged: boolean;
  iterations: number;
  method: 'newton' | 'bisection' | 'brent' | 'none';
}

type XIRRStrategy = 'Hybrid' | 'Newton' | 'Bisection';

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

// Rate bounds: from -99.9999% to +900%
const MIN_RATE = -0.999999;
const MAX_RATE = 9.0;

/**
 * Normalize date to UTC midnight to avoid timezone drift.
 */
function normalizeDate(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
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
    const years = (cf.date.getTime() - t0.getTime()) / YEAR_MS;
    const denom = Math.pow(1 + rate, years);
    return sum + cf.amount / denom;
  }, 0);
}

/**
 * Derivative of NPV with respect to rate (for Newton).
 */
function dNpvAt(rate: number, flows: CashFlow[], t0: Date): number {
  return flows.reduce((sum, cf) => {
    const years = (cf.date.getTime() - t0.getTime()) / YEAR_MS;
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
 * Brent wrapper.
 */
function solveBrent(flows: CashFlow[], t0: Date, tolerance: number): XIRRResult {
  const f = (r: number) => npvAt(r, flows, t0);

  const result = brent(f, -0.95, 15, {
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
 * - 'Hybrid': Newton → Brent → Bisection
 * - 'Newton': Newton only
 * - 'Bisection': Bisection only
 */
export function xirrNewtonBisection(
  flowsIn: CashFlow[],
  guess = 0.1,
  tolerance = 1e-7,
  maxIterations = 100,
  strategy: XIRRStrategy = 'Hybrid'
): XIRRResult {
  // Normalize and sort cash flows by date (UTC midnight)
  const flows: CashFlow[] = [...flowsIn]
    .map((cf) => ({
      date: normalizeDate(cf.date),
      amount: cf.amount,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

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
  if (strategy === 'Newton') {
    return solveNewton(flows, t0, guess, tolerance, maxIterations);
  }

  // Strategy: Bisection only
  if (strategy === 'Bisection') {
    return solveBisection(flows, t0, tolerance, maxIterations);
  }

  // Strategy: Hybrid (Newton → Brent → Bisection)

  const newtonResult = solveNewton(flows, t0, guess, tolerance, maxIterations);

  if (newtonResult.converged) {
    return newtonResult;
  }

  // If Newton used all iterations (timeout), treat that as a hard failure and
  // do not silently "fix" it with fallback.
  const timedOut = newtonResult.iterations >= maxIterations;
  if (timedOut) {
    return newtonResult;
  }

  // Newton failed early (derivative/divergence) → try Brent
  const brentResult = solveBrent(flows, t0, tolerance);
  if (brentResult.converged) {
    return {
      ...brentResult,
      iterations: newtonResult.iterations + brentResult.iterations,
    };
  }

  // Brent also failed → try Bisection
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
