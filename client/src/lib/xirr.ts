import { differenceInDays } from 'date-fns';
import { Decimal, toDecimal } from './decimal-utils';
import type { PeriodResult } from '@shared/schemas/fund-model';

/**
 * XIRR (Extended Internal Rate of Return) Calculator
 *
 * Calculates IRR using Newton-Raphson method with bisection fallback.
 * Matches Excel XIRR function behavior for parity testing.
 *
 * Date Convention: Actual/365 (matches Excel)
 * Hardening: Sign-change assertion + bisection fallback
 */

export interface Cashflow {
  date: Date;
  amount: number;
}

const TOLERANCE = 1e-6;
const MAX_ITERATIONS = 100;
const LOWER_BOUND = -0.999;  // Avoid division by zero
const UPPER_BOUND = 10.0;    // 1000% return upper limit

/**
 * Calculate XIRR using Newton-Raphson with bisection fallback
 *
 * @param cashflows - Array of dated cashflows
 * @param guess - Initial guess for IRR (default 0.1 = 10%)
 * @returns Annualized IRR as decimal (e.g., 0.15 = 15%)
 * @throws Error if insufficient cashflows or no sign change
 *
 * @example
 * const cashflows = [
 *   { date: new Date('2025-01-01'), amount: -100000 },
 *   { date: new Date('2025-12-31'), amount: 120000 }
 * ];
 * const irr = calculateXIRR(cashflows); // => ~0.20 (20%)
 */
export function calculateXIRR(
  cashflows: Cashflow[],
  guess: number = 0.1
): number {
  // =====================
  // EDGE CASE: Insufficient cashflows
  // =====================
  if (cashflows.length < 2) {
    throw new Error(
      'XIRR requires at least 2 cashflows. ' +
      `Provided: ${cashflows.length}`
    );
  }

  // =====================
  // EDGE CASE: Assert sign change
  // =====================
  const hasPositive = cashflows.some(cf => cf.amount > 0);
  const hasNegative = cashflows.some(cf => cf.amount < 0);

  if (!hasPositive || !hasNegative) {
    throw new Error(
      'XIRR requires both positive and negative cashflows. ' +
      `Found: ${hasPositive ? 'positive' : 'no positive'}, ` +
      `${hasNegative ? 'negative' : 'no negative'}`
    );
  }

  // =====================
  // DETERMINISM: Sort by date
  // =====================
  const sorted = [...cashflows].sort((a, b) =>
    a.date.getTime() - b.date.getTime()
  );

  // =====================
  // TRY: Newton-Raphson first (fast)
  // =====================
  try {
    return newtonRaphson(sorted, guess);
  } catch (err) {
    // =====================
    // FALLBACK: Bisection method (slow but reliable)
    // =====================
    console.warn(
      'Newton-Raphson failed to converge, falling back to bisection method',
      err instanceof Error ? err.message : err
    );
    return bisection(sorted);
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

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const { npv, derivative } = cashflows.reduce(
      (acc, cf) => {
        const days = differenceInDays(cf.date, cashflows[0].date);
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
  return cashflows.reduce((npv, cf) => {
    const days = differenceInDays(cf.date, cashflows[0].date);
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
 * @returns Annualized IRR as decimal (e.g., 0.15 = 15%)
 */
export function calculateIRRFromPeriods(periodResults: PeriodResult[]): number {
  const cashflows = buildCashflowSchedule(periodResults);
  return calculateXIRR(cashflows);
}
