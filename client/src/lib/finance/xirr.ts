import { brent } from './brent-solver';

export interface CashFlow {
  date: Date; // JS Date (normalized to UTC midnight)
  amount: number; // negative = contribution, positive = distribution
}
export interface XIRRResult {
  irr: number | null; // annualized rate (e.g., 0.1487); null for invalid inputs
  converged: boolean;
  iterations: number;
  method: 'newton' | 'bisection' | 'brent' | 'none';
}

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Normalize date to UTC midnight to avoid timezone drift
 */
function normalizeDate(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

// Helper: NPV at rate
function npvAt(rate: number, flows: CashFlow[], t0: Date): number {
  return flows.reduce((sum: any, cf: any) => {
    const years = (cf.date.getTime() - t0.getTime()) / YEAR_MS;
    return sum + cf.amount / Math.pow(1 + rate, years);
  }, 0);
}

// Derivative of NPV wrt rate
function dNpvAt(rate: number, flows: CashFlow[], t0: Date): number {
  return flows.reduce((sum: any, cf: any) => {
    const years = (cf.date.getTime() - t0.getTime()) / YEAR_MS;
    return sum - (years * cf.amount) / Math.pow(1 + rate, years + 1);
  }, 0);
}

export function xirrNewtonBisection(
  flowsIn: CashFlow[],
  guess = 0.1,
  tolerance = 1e-7,
  maxIterations = 100
): XIRRResult {
  const flows = [...flowsIn].sort((a: any, b: any) => a.date.getTime() - b.date.getTime());
  if (flows.length < 2) return { irr: null, converged: false, iterations: 0, method: 'none' };
  const t0 = flows[0]!.date;

  // Quick sanity: need at least one negative and one positive
  const hasNeg = flows.some((cf) => cf.amount < 0);
  const hasPos = flows.some((cf) => cf.amount > 0);
  if (!hasNeg || !hasPos) return { irr: null, converged: false, iterations: 0, method: 'none' };

  // 1. Try Newton-Raphson (fast)
  let rate = guess;
  let newtonIterations = 0;
  for (let i = 0; i < maxIterations; i++) {
    newtonIterations = i + 1;
    const f = npvAt(rate, flows, t0);
    if (Math.abs(f) < tolerance) {
      // Validate result is within reasonable bounds
      if (rate < -0.999999 || rate > 1000) {
        console.warn(`XIRR: Newton converged to out-of-bounds rate: ${rate}`);
        break; // Fall through to Brent
      }
      return { irr: rate, converged: true, iterations: newtonIterations, method: 'newton' };
    }
    const df = dNpvAt(rate, flows, t0);
    // Derivative too small or rate diverging - switch to Brent
    if (Math.abs(df) < 1e-12) break;

    const next = rate - f / df;
    // Check for divergence
    if (!Number.isFinite(next) || Math.abs(next - rate) > 100) break;

    // Clip to reasonable bounds
    rate = Math.min(1000, Math.max(-0.999999, next));
  }

  // 2. Try Brent's method (more robust)
  const brentResult = brent(
    (r) => npvAt(r, flows, t0),
    -0.95, // Lower bound: ~-95% (allow for losses)
    15, // Upper bound: 1500% (allow for high returns)
    { tolerance: 1e-8, maxIterations: 200 }
  );

  if (brentResult.converged && brentResult.root !== null) {
    return {
      irr: brentResult.root,
      converged: true,
      iterations: newtonIterations + brentResult.iterations,
      method: 'brent',
    };
  }

  // 3. Last resort: bisection
  let lo = -0.99,
    hi = 50.0;
  let fLo = npvAt(lo, flows, t0),
    fHi = npvAt(hi, flows, t0);

  // Try to find a valid bracket by expanding the search range
  if (fLo * fHi > 0) {
    // Try even higher upper bound for extreme cases
    hi = 100.0;
    fHi = npvAt(hi, flows, t0);
    if (fLo * fHi > 0) {
      // Cannot bracket a root
      console.warn('XIRR: Cannot bracket root - no sign change found');
      return {
        irr: null,
        converged: false,
        iterations: newtonIterations + maxIterations,
        method: 'bisection',
      };
    }
  }
  for (let i = 0; i < maxIterations; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npvAt(mid, flows, t0);
    if (Math.abs(fMid) < tolerance || Math.abs(hi - lo) < tolerance) {
      return {
        irr: mid,
        converged: true,
        iterations: newtonIterations + i + 1,
        method: 'bisection',
      };
    }
    const signChange = fLo * fMid < 0;
    if (signChange) {
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
    iterations: newtonIterations + maxIterations,
    method: 'bisection',
  };
}
