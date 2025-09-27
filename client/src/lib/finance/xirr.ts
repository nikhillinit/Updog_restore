export interface CashFlow {
  date: Date;       // JS Date
  amount: number;   // negative = contribution, positive = distribution
}
export interface XIRRResult {
  irr: number | null;      // annualized rate (e.g., 0.1487)
  converged: boolean;
  iterations: number;
  method: 'newton' | 'bisection' | 'none';
}

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

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
  const hasNeg = flows.some(cf => cf.amount < 0);
  const hasPos = flows.some(cf => cf.amount > 0);
  if (!hasNeg || !hasPos) return { irr: null, converged: false, iterations: 0, method: 'none' };

  // Newton
  let rate = guess;
  for (let i = 0; i < maxIterations; i++) {
    const f = npvAt(rate, flows, t0);
    if (Math.abs(f) < tolerance) {
      // basic sanity: bound the IRR to [-0.99, 50] (allow for very high returns)
      if (rate < -0.99 || rate > 50) return { irr: null, converged: false, iterations: i, method: 'newton' };
      return { irr: rate, converged: true, iterations: i, method: 'newton' };
    }
    const df = dNpvAt(rate, flows, t0);
    if (Math.abs(df) < 1e-12) break; // derivative too small; fallback
    const next = rate - f / df;
    // keep bounded to avoid numeric runaway, but allow higher upper bound
    rate = Math.min(50, Math.max(-0.99, next));
  }

  // Bisection fallback on a bracket that changes sign
  let lo = -0.99, hi = 50.0; // Increased upper bound for high returns
  let fLo = npvAt(lo, flows, t0), fHi = npvAt(hi, flows, t0);

  // Try to find a valid bracket by expanding the search range
  if (fLo * fHi > 0) {
    // Try even higher upper bound for extreme cases
    hi = 100.0;
    fHi = npvAt(hi, flows, t0);
    if (fLo * fHi > 0) {
      // still cannot bracket a root -> give up
      return { irr: null, converged: false, iterations: maxIterations, method: 'bisection' };
    }
  }
  for (let i = 0; i < maxIterations; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npvAt(mid, flows, t0);
    if (Math.abs(fMid) < tolerance || Math.abs(hi - lo) < tolerance) {
      return { irr: mid, converged: true, iterations: i, method: 'bisection' };
    }
    const signChange = fLo * fMid < 0;
    if (signChange) {
      hi = mid; fHi = fMid;
    } else {
      lo = mid; fLo = fMid;
    }
  }
  return { irr: null, converged: false, iterations: maxIterations, method: 'bisection' };
}