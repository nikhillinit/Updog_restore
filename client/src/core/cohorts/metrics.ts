/**
 * Cohort Metrics Calculation Engine
 *
 * Calculates DPI, TVPI, and IRR from aggregated cash flows.
 * IRR is calculated using XIRR on aggregated cash flows, NOT averaged.
 */

import type { CashFlowEvent, CohortRow, CoverageSummaryType } from '@shared/types';
import { aggregateCashFlowsByDate, calculateCashFlowTotals, hasResidualValue } from './cash-flows';

/**
 * Newton-Raphson XIRR implementation
 *
 * @param cashFlows Array of {date, amount} where negative = outflow, positive = inflow
 * @param guess Initial guess for rate (default 0.1 = 10%)
 * @param maxIterations Maximum iterations
 * @param tolerance Convergence tolerance
 * @returns Annual IRR as decimal (e.g., 0.15 = 15%) or null if cannot converge
 */
export function calculateXIRR(
  cashFlows: Array<{ date: Date; amount: number }>,
  guess = 0.1,
  maxIterations = 100,
  tolerance = 1e-7
): number | null {
  if (cashFlows.length < 2) {
    return null;
  }

  // Check for at least one positive and one negative cash flow
  const hasPositive = cashFlows.some((cf) => cf.amount > 0);
  const hasNegative = cashFlows.some((cf) => cf.amount < 0);

  if (!hasPositive || !hasNegative) {
    return null;
  }

  // Sort by date
  const sorted = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const firstDate = sorted[0]?.date;
  if (!firstDate) {
    return null;
  }

  // Calculate days from first date
  const daysFromStart = sorted.map((cf) => ({
    amount: cf.amount,
    days: (cf.date.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24),
  }));

  // NPV function
  const npv = (rate: number): number => {
    return daysFromStart.reduce((sum, cf) => {
      return sum + cf.amount / Math.pow(1 + rate, cf.days / 365);
    }, 0);
  };

  // NPV derivative function
  const npvDerivative = (rate: number): number => {
    return daysFromStart.reduce((sum, cf) => {
      return sum + ((-cf.days / 365) * cf.amount) / Math.pow(1 + rate, cf.days / 365 + 1);
    }, 0);
  };

  let rate = guess;

  for (let i = 0; i < maxIterations; i++) {
    const currentNPV = npv(rate);
    const currentDerivative = npvDerivative(rate);

    if (Math.abs(currentDerivative) < 1e-10) {
      // Derivative too small, try different approach
      break;
    }

    const newRate = rate - currentNPV / currentDerivative;

    if (Math.abs(newRate - rate) < tolerance) {
      // Converged
      if (newRate < -1 || !isFinite(newRate)) {
        return null; // Invalid result
      }
      return newRate;
    }

    // Guard against runaway rates
    if (newRate > 10 || newRate < -0.99) {
      break;
    }

    rate = newRate;
  }

  // Did not converge, try bisection as fallback
  return bisectionXIRR(sorted, -0.99, 5.0, tolerance, maxIterations);
}

/**
 * Bisection method for XIRR as fallback
 */
function bisectionXIRR(
  cashFlows: Array<{ date: Date; amount: number }>,
  lowerBound: number,
  upperBound: number,
  tolerance: number,
  maxIterations: number
): number | null {
  const firstDate = cashFlows[0]?.date;
  if (!firstDate) {
    return null;
  }

  const daysFromStart = cashFlows.map((cf) => ({
    amount: cf.amount,
    days: (cf.date.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24),
  }));

  const npv = (rate: number): number => {
    return daysFromStart.reduce((sum, cf) => {
      return sum + cf.amount / Math.pow(1 + rate, cf.days / 365);
    }, 0);
  };

  let low = lowerBound;
  let high = upperBound;

  for (let i = 0; i < maxIterations; i++) {
    const mid = (low + high) / 2;
    const npvMid = npv(mid);

    if (Math.abs(npvMid) < tolerance) {
      return mid;
    }

    if (npv(low) * npvMid < 0) {
      high = mid;
    } else {
      low = mid;
    }

    if (high - low < tolerance) {
      return mid;
    }
  }

  return null;
}

/**
 * Calculates DPI (Distributions to Paid-In)
 *
 * @param distributions Total distributions
 * @param paidIn Total paid-in capital
 * @returns DPI ratio or null if no paid-in capital
 */
export function calculateDPI(distributions: number, paidIn: number): number | null {
  if (paidIn === 0) {
    return null;
  }
  return distributions / paidIn;
}

/**
 * Calculates TVPI (Total Value to Paid-In)
 *
 * @param distributions Total distributions
 * @param residualValue Current residual value
 * @param paidIn Total paid-in capital
 * @returns TVPI ratio or null if no paid-in capital
 */
export function calculateTVPI(
  distributions: number,
  residualValue: number,
  paidIn: number
): number | null {
  if (paidIn === 0) {
    return null;
  }
  return (distributions + residualValue) / paidIn;
}

/**
 * Metrics calculation result for a cohort bucket
 */
export interface CohortMetrics {
  paidIn: number;
  distributions: number;
  residualValue: number | undefined;
  dpi: number | null;
  tvpi: number | null;
  irr: number | null;
}

/**
 * Calculates metrics for a group of cash flow events
 *
 * @param events Cash flow events for a cohort bucket
 * @returns Calculated metrics
 */
export function calculateMetricsFromEvents(events: CashFlowEvent[]): CohortMetrics {
  const totals = calculateCashFlowTotals(events);
  const hasResidual = hasResidualValue(events);

  // Aggregate cash flows by date for XIRR
  const aggregated = aggregateCashFlowsByDate(events);

  // Calculate metrics
  const dpi = calculateDPI(totals.distributions, totals.paidIn);
  const tvpi = hasResidual
    ? calculateTVPI(totals.distributions, totals.residualValue, totals.paidIn)
    : null;
  const irr = calculateXIRR(aggregated);

  return {
    paidIn: totals.paidIn,
    distributions: totals.distributions,
    residualValue: hasResidual ? totals.residualValue : undefined,
    dpi,
    tvpi,
    irr,
  };
}

/**
 * Input for cohort row generation
 */
export interface CohortRowInput {
  cohortKey: string;
  sectorId: string;
  sectorName: string;
  events: CashFlowEvent[];
  companyCount: number;
  investmentCount: number;
  coverage: CoverageSummaryType;
  sectorSourceBreakdown: Record<'company_override' | 'mapping' | 'unmapped', number>;
  vintageSourceBreakdown: Record<string, number>;
  shiftedCompanies?: number | undefined;
}

/**
 * Generates a cohort row from input data
 *
 * @param input Cohort row input
 * @returns CohortRow
 */
export function generateCohortRow(input: CohortRowInput): CohortRow {
  const metrics = calculateMetricsFromEvents(input.events);

  return {
    cohortKey: input.cohortKey,
    sectorId: input.sectorId,
    sectorName: input.sectorName,
    counts: {
      companies: input.companyCount,
      investments: input.investmentCount,
    },
    exposure: {
      paidIn: metrics.paidIn,
      distributions: metrics.distributions,
      residualValue: metrics.residualValue,
    },
    performance: {
      dpi: metrics.dpi,
      tvpi: metrics.tvpi,
      irr: metrics.irr,
    },
    coverage: input.coverage,
    provenance: {
      sectorSourceBreakdown: input.sectorSourceBreakdown,
      vintageSourceBreakdown: input.vintageSourceBreakdown,
      shiftedCompanies: input.shiftedCompanies,
    },
  };
}
