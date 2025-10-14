import { differenceInDays } from 'date-fns';
import { toDecimal } from './decimal-utils';
import type { PeriodResult } from '@shared/schemas/fund-model';

/**
 * XIRR (Extended Internal Rate of Return) Calculator
 *
 * Calculates IRR using Newton-Raphson method with bisection fallback.
 * Matches Excel XIRR function behavior for parity testing.
 *
 * Date Convention: Actual/365 (matches Excel)
 * Hardening: Sign-change assertion + bisection fallback
 *
 * Edge Cases Handled:
 * - No sign change → Returns null (display as "N/A")
 * - Insufficient cashflows → Returns null
 * - Convergence failure → Falls back to bisection, then returns null
 * - Out-of-bounds rates → Returns null
 */

export interface Cashflow {
  date: Date;
  amount: number;
}

/**
 * IRR calculation configuration
 */
export interface IRRConfig {
  /** Maximum Newton-Raphson iterations (default: 100) */
  maxIterations: number;
  /** Convergence tolerance (default: 1e-6) */
  tolerance: number;
  /** Initial guess for Newton-Raphson (default: 0.1 = 10%) */
  initialGuess: number;
  /** Strategy: 'Newton', 'Bisection', or 'Hybrid' (default: 'Hybrid') */
  strategy: 'Newton' | 'Bisection' | 'Hybrid';
  /** Aggregate same-day cashflows before calculation (default: true) */
  sortAndAggregateSameDay: boolean;
}

const DEFAULT_IRR_CONFIG: IRRConfig = {
  maxIterations: 100,
  tolerance: 1e-6,
  initialGuess: 0.1,
  strategy: 'Hybrid',
  sortAndAggregateSameDay: true,
};

const TOLERANCE = 1e-6;
const MAX_ITERATIONS = 100;
const LOWER_BOUND = -0.999;  // Avoid division by zero
const UPPER_BOUND = 10.0;    // 1000% return upper limit

/**
 * Calculate XIRR using Newton-Raphson with bisection fallback
 *
 * @param cashflows - Array of dated cashflows
 * @param guess - Initial guess for IRR (default 0.1 = 10%) - DEPRECATED, use config instead
 * @param config - Optional configuration (default: DEFAULT_IRR_CONFIG)
 * @returns Annualized IRR as decimal (e.g., 0.15 = 15%) or null if undefined
 *
 * Returns null when:
 * - Insufficient cashflows (< 2)
 * - No sign change (all positive or all negative)
 * - Convergence failure in both Newton-Raphson and Bisection
 *
 * @example
 * const cashflows = [
 *   { date: new Date('2025-01-01'), amount: -100000 },
 *   { date: new Date('2025-12-31'), amount: 120000 }
 * ];
 * const irr = calculateXIRR(cashflows); // => ~0.20 (20%)
 *
 * @example
 * // No sign change - returns null
 * const allPositive = [
 *   { date: new Date('2025-01-01'), amount: 100000 },
 *   { date: new Date('2025-12-31'), amount: 120000 }
 * ];
 * const irr = calculateXIRR(allPositive); // => null (display as "N/A")
 */
export function calculateXIRR(
  cashflows: Cashflow[],
  guess: number = 0.1,
  config: Partial<IRRConfig> = {}
): number | null {
  const opts = { ...DEFAULT_IRR_CONFIG, ...config };

  // =====================
  // EDGE CASE: Insufficient cashflows
  // =====================
  if (cashflows.length < 2) {
    console.warn('XIRR requires at least 2 cashflows:', cashflows.length);
    return null; // Return null instead of throwing
  }

  // =====================
  // EDGE CASE: Assert sign change
  // =====================
  const hasPositive = cashflows.some(cf => cf.amount > 0);
  const hasNegative = cashflows.some(cf => cf.amount < 0);

  if (!hasPositive || !hasNegative) {
    console.warn(
      'XIRR requires both positive and negative cashflows. ' +
      `Found: ${hasPositive ? 'positive' : 'no positive'}, ` +
      `${hasNegative ? 'negative' : 'no negative'}`
    );
    return null; // Return null instead of throwing
  }

  // =====================
  // DETERMINISM: Sort and optionally aggregate
  // =====================
  const processed = opts.sortAndAggregateSameDay
    ? aggregateSameDayCashflows(cashflows)
    : [...cashflows].sort((a, b) => a.date.getTime() - b.date.getTime());

  // =====================
  // Execute strategy
  // =====================
  try {
    if (opts.strategy === 'Hybrid') {
      return tryNewtonThenBisection(processed, opts);
    } else if (opts.strategy === 'Newton') {
      return newtonRaphson(processed, opts.initialGuess);
    } else {
      return bisection(processed);
    }
  } catch (err) {
    console.error('XIRR calculation failed:', err);
    return null; // Return null on any error
  }
}

/**
 * Aggregate cashflows that occur on the same day
 *
 * Improves numerical stability by combining same-day transactions.
 */
function aggregateSameDayCashflows(cashflows: Cashflow[]): Cashflow[] {
  const byDate = new Map<string, number>();

  for (const cf of cashflows) {
    const key = cf.date.toISOString().split('T')[0]; // YYYY-MM-DD
    if (!key) throw new Error('Invalid date key from toISOString');
    byDate.set(key, (byDate.get(key) ?? 0) + cf.amount);
  }

  return Array.from(byDate.entries())
    .map(([dateStr, amount]) => ({
      date: new Date(dateStr),
      amount,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Try Newton-Raphson first, fall back to bisection on failure
 */
function tryNewtonThenBisection(cashflows: Cashflow[], opts: IRRConfig): number {
  try {
    return newtonRaphson(cashflows, opts.initialGuess);
  } catch (err) {
    console.warn('Newton-Raphson failed, falling back to bisection:', err instanceof Error ? err.message : err);
    return bisection(cashflows);
  }
}

/**
 * Newton-Raphson method for IRR
 *
 * Fast convergence when initial guess is good.
 * May fail on pathological cases (throws error).
 */
function newtonRaphson(cashflows: Cashflow[], guess: number): number {
  let rate = guess;
  const firstCashflow = cashflows[0];
  if (!firstCashflow) throw new Error('No cashflows provided');

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const { npv, derivative } = cashflows.reduce(
      (acc, cf) => {
        const days = differenceInDays(cf.date, firstCashflow.date);
        const years = toDecimal(days).dividedBy(365);  // Actual/365
        const discount = toDecimal(1).plus(rate).pow(years.toNumber());

        const pv = toDecimal(cf.amount).dividedBy(discount);
        const dvdt = pv.times(years).dividedBy(toDecimal(1).plus(rate));

        return {
          npv: acc.npv.plus(pv),
          derivative: acc.derivative.minus(dvdt),
        };
      },
      { npv: toDecimal(0), derivative: toDecimal(0) }
    );

    // Check convergence
    if (Math.abs(npv.toNumber()) < TOLERANCE) {
      return rate;
    }

    // Check for zero derivative (would cause division by zero)
    if (derivative.eq(0)) {
      throw new Error('Newton-Raphson derivative is zero');
    }

    // Update rate
    rate = rate - npv.dividedBy(derivative).toNumber();

    // Prevent runaway rates
    if (rate < LOWER_BOUND || rate > UPPER_BOUND) {
      throw new Error(
        `Newton-Raphson rate out of bounds: ${rate.toFixed(4)} ` +
        `(bounds: ${LOWER_BOUND} to ${UPPER_BOUND})`
      );
    }
  }

  throw new Error(
    `Newton-Raphson did not converge after ${MAX_ITERATIONS} iterations`
  );
}

/**
 * Bisection method for IRR
 *
 * Slower but guaranteed to converge if solution exists.
 */
function bisection(cashflows: Cashflow[]): number {
  let low = LOWER_BOUND;
  let high = UPPER_BOUND;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const mid = (low + high) / 2;
    const npv = calculateNPV(cashflows, mid);

    if (Math.abs(npv) < TOLERANCE) {
      return mid;
    }

    const npvLow = calculateNPV(cashflows, low);

    // If npvLow and npv have same sign, move low bound
    if ((npvLow > 0 && npv > 0) || (npvLow < 0 && npv < 0)) {
      low = mid;
    } else {
      high = mid;
    }

    // Check convergence by interval size
    if (high - low < TOLERANCE) {
      return mid;
    }
  }

  throw new Error(
    `Bisection did not converge after ${MAX_ITERATIONS} iterations`
  );
}

/**
 * Calculate Net Present Value for a given rate
 */
function calculateNPV(cashflows: Cashflow[], rate: number): number {
  const firstCashflow = cashflows[0];
  if (!firstCashflow) throw new Error('No cashflows provided');

  return cashflows.reduce((npv, cf) => {
    const days = differenceInDays(cf.date, firstCashflow.date);
    const years = toDecimal(days).dividedBy(365);  // Actual/365
    const discount = toDecimal(1).plus(rate).pow(years.toNumber());
    const pv = toDecimal(cf.amount).dividedBy(discount);
    return npv.plus(pv);
  }, toDecimal(0)).toNumber();
}

/**
 * Build cashflow schedule from period results
 *
 * Uses period-end dates for deterministic Excel parity.
 * Follows Policy A: Immediate distribution (distributions in period received).
 *
 * @param periodResults - Array of period results from fund model
 * @returns Array of cashflows for XIRR calculation
 */
export function buildCashflowSchedule(periodResults: PeriodResult[]): Cashflow[] {
  const cashflows: Cashflow[] = [];

  periodResults.forEach(period => {
    const date = new Date(period.periodEnd);  // Use period-end for Excel parity

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

  // =====================
  // Add final NAV as terminal cashflow
  // =====================
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
  return calculateXIRR(cashflows);
}
