/**
 * Fund Mathematics Library
 *
 * Core financial calculations for venture capital fund modeling:
 * - Fee basis timeline computation (integrates with FeeProfile schema)
 * - Capital call/distribution projections
 * - NAV calculations with fee adjustments
 *
 * Used by J-curve engine and construction forecasting.
 */

import Decimal from 'decimal.js';
import type { FeeProfile, FeeBasisType, FeeCalculationContext } from '@shared/schemas/fee-profile';
import { calculateManagementFees, calculateRecyclableFees } from '@shared/schemas/fee-profile';

/**
 * Fee basis data for a single period (quarter)
 */
export interface FeeBasisPeriod {
  /** Quarter number (0-based) */
  quarter: number;

  /** Committed capital (fund size) */
  committedCapital: Decimal;

  /** Called capital cumulative */
  calledCapitalCumulative: Decimal;

  /** Called capital net of distributions */
  calledCapitalNetOfReturns: Decimal;

  /** Invested capital (deployed) */
  investedCapital: Decimal;

  /** Fair market value (portfolio valuation) */
  fairMarketValue: Decimal;

  /** Unrealized cost basis */
  unrealizedCost: Decimal;

  /** Management fees for this period */
  managementFees: Decimal;

  /** Recyclable fees available */
  recyclableFees: Decimal;
}

/**
 * Complete fee basis timeline
 */
export interface FeeBasisTimeline {
  /** Period data by quarter */
  periods: FeeBasisPeriod[];

  /** Total fees over timeline */
  totalFees: Decimal;

  /** Total recyclable fees */
  totalRecyclable: Decimal;
}

/**
 * Configuration for fee basis computation
 */
export interface FeeBasisConfig {
  /** Fund size (committed capital) */
  fundSize: Decimal;

  /** Number of quarters to compute */
  numQuarters: number;

  /** Fee profile (optional - for fee-adjusted NAV) */
  feeProfile?: FeeProfile;

  /** Called capital schedule (cumulative by quarter) */
  calledCapitalSchedule?: Decimal[];

  /** Distribution schedule (cumulative by quarter) */
  distributionSchedule?: Decimal[];

  /** Invested capital schedule (cumulative by quarter) */
  investedCapitalSchedule?: Decimal[];

  /** FMV schedule (by quarter) */
  fmvSchedule?: Decimal[];

  /** Unrealized cost schedule (by quarter) */
  unrealizedCostSchedule?: Decimal[];
}

/**
 * Compute fee basis timeline for J-curve calculations
 *
 * Integrates with FeeProfile schema to handle:
 * - Multiple fee tiers with basis changes
 * - Step-downs by fund year
 * - Fee holidays
 * - Caps (percentage and fixed)
 * - Recycling policies
 *
 * @param config - Fee basis configuration
 * @returns Fee basis timeline with all periods
 */
export function computeFeeBasisTimeline(config: FeeBasisConfig): FeeBasisTimeline {
  const { fundSize, numQuarters, feeProfile } = config;

  const periods: FeeBasisPeriod[] = [];
  let totalFees = new Decimal(0);
  let totalRecyclable = new Decimal(0);
  let cumulativeCalledCapital = new Decimal(0);
  let cumulativeDistributions = new Decimal(0);
  let cumulativeFeesPaid = new Decimal(0);

  for (let q = 0; q < numQuarters; q++) {
    // Get scheduled values or use defaults
    const calledCapital = config.calledCapitalSchedule?.[q] ?? new Decimal(0);
    const distributions = config.distributionSchedule?.[q] ?? new Decimal(0);
    const investedCapital = config.investedCapitalSchedule?.[q] ?? new Decimal(0);
    const fmv = config.fmvSchedule?.[q] ?? new Decimal(0);
    const unrealizedCost = config.unrealizedCostSchedule?.[q] ?? new Decimal(0);

    // Update cumulatives
    cumulativeCalledCapital = calledCapital;
    cumulativeDistributions = distributions;

    // Calculate capital net of returns
    const calledNetOfReturns = cumulativeCalledCapital.minus(cumulativeDistributions);

    // Calculate fees if profile provided
    let managementFees = new Decimal(0);
    let recyclableFees = new Decimal(0);

    if (feeProfile) {
      const context: FeeCalculationContext = {
        committedCapital: fundSize,
        calledCapitalCumulative: cumulativeCalledCapital,
        calledCapitalNetOfReturns: calledNetOfReturns,
        investedCapital,
        fairMarketValue: fmv,
        unrealizedCost,
        currentMonth: q * 3 // Convert quarters to months
      };

      // Calculate management fees for the quarter (3 months)
      const monthlyFees = calculateManagementFees(feeProfile, context);
      managementFees = monthlyFees.times(3);

      cumulativeFeesPaid = cumulativeFeesPaid.plus(managementFees);

      // Calculate recyclable fees
      recyclableFees = calculateRecyclableFees(feeProfile, cumulativeFeesPaid, context);

      totalFees = totalFees.plus(managementFees);
      totalRecyclable = totalRecyclable.plus(recyclableFees);
    }

    periods.push({
      quarter: q,
      committedCapital: fundSize,
      calledCapitalCumulative: cumulativeCalledCapital,
      calledCapitalNetOfReturns: calledNetOfReturns,
      investedCapital,
      fairMarketValue: fmv,
      unrealizedCost,
      managementFees,
      recyclableFees
    });
  }

  return {
    periods,
    totalFees,
    totalRecyclable
  };
}

/**
 * Resolve fee basis amount for a specific basis type and period
 *
 * @param basisType - Type of fee basis
 * @param period - Fee basis period data
 * @returns Basis amount as Decimal
 */
export function resolveFeeBasis(
  basisType: FeeBasisType,
  period: FeeBasisPeriod
): Decimal {
  switch (basisType) {
    case 'committed_capital':
      return period.committedCapital;
    case 'called_capital_cumulative':
      return period.calledCapitalCumulative;
    case 'called_capital_net_of_returns':
      return period.calledCapitalNetOfReturns;
    case 'invested_capital':
      return period.investedCapital;
    case 'fair_market_value':
      return period.fairMarketValue;
    case 'unrealized_cost':
      return period.unrealizedCost;
  }
}

/**
 * Calculate fee-adjusted NAV for a period
 *
 * NAV = FMV - Accrued Fees + Recyclable Fees
 *
 * @param period - Fee basis period
 * @returns Fee-adjusted NAV
 */
export function calculateFeeAdjustedNAV(period: FeeBasisPeriod): Decimal {
  return period.fairMarketValue
    .minus(period.managementFees)
    .plus(period.recyclableFees);
}

/**
 * Calculate standard NAV (no fee adjustment)
 *
 * NAV = FMV
 *
 * @param period - Fee basis period
 * @returns Standard NAV
 */
export function calculateStandardNAV(period: FeeBasisPeriod): Decimal {
  return period.fairMarketValue;
}

/**
 * Project capital call schedule (pacing model)
 *
 * Simple S-curve projection for capital calls over investment period.
 * Used when no actual capital call data exists.
 *
 * @param fundSize - Total committed capital
 * @param investmentPeriodQuarters - Length of investment period
 * @param numQuarters - Total quarters to project
 * @returns Cumulative capital calls by quarter
 */
export function projectCapitalCalls(
  fundSize: Decimal,
  investmentPeriodQuarters: number,
  numQuarters: number
): Decimal[] {
  const schedule: Decimal[] = [];

  for (let q = 0; q < numQuarters; q++) {
    if (q >= investmentPeriodQuarters) {
      // After investment period, no new calls
      schedule.push(fundSize);
    } else {
      // S-curve ramp during investment period
      const progress = q / investmentPeriodQuarters;
      const sCurve = 1 / (1 + Math.exp(-10 * (progress - 0.5)));
      schedule.push(fundSize.times(sCurve));
    }
  }

  return schedule;
}

/**
 * Project distribution schedule (J-curve model)
 *
 * Distributions follow J-curve path with early DPI near zero,
 * then rapid growth during harvest phase.
 *
 * @param fundSize - Total committed capital
 * @param targetTVPI - Target multiple (e.g., 2.5x)
 * @param fundLifeQuarters - Total fund life in quarters
 * @param numQuarters - Quarters to project
 * @returns Cumulative distributions by quarter
 */
export function projectDistributions(
  fundSize: Decimal,
  targetTVPI: number,
  fundLifeQuarters: number,
  numQuarters: number
): Decimal[] {
  const schedule: Decimal[] = [];
  const targetDistributions = fundSize.times(targetTVPI);

  for (let q = 0; q < numQuarters; q++) {
    if (q >= fundLifeQuarters) {
      // After fund life, all distributions complete
      schedule.push(targetDistributions);
    } else {
      // J-curve: slow start, rapid growth in harvest phase
      const progress = q / fundLifeQuarters;

      // Gompertz curve (asymmetric S-curve)
      const a = 1.0; // Upper asymptote
      const b = 0.95; // Displacement
      const c = 0.15; // Growth rate

      const dpiRatio = a * Math.exp(-b * Math.exp(-c * q));
      schedule.push(targetDistributions.times(Math.max(0, dpiRatio)));
    }
  }

  return schedule;
}

/**
 * Calculate TVPI from DPI and NAV
 *
 * TVPI = (Distributions + NAV) / Called Capital
 *
 * @param dpi - Distributions to Paid-In
 * @param nav - Net Asset Value
 * @param calledCapital - Total called capital
 * @returns TVPI multiple
 */
export function calculateTVPI(
  dpi: Decimal,
  nav: Decimal,
  calledCapital: Decimal
): Decimal {
  if (calledCapital.isZero()) {
    return new Decimal(0);
  }

  const totalValue = dpi.plus(nav);
  return totalValue.div(calledCapital);
}

/**
 * Calculate DPI from cumulative distributions
 *
 * DPI = Distributions / Called Capital
 *
 * @param distributions - Cumulative distributions
 * @param calledCapital - Total called capital
 * @returns DPI multiple
 */
export function calculateDPI(
  distributions: Decimal,
  calledCapital: Decimal
): Decimal {
  if (calledCapital.isZero()) {
    return new Decimal(0);
  }

  return distributions.div(calledCapital);
}

/**
 * Calculate RVPI (Residual Value to Paid-In)
 *
 * RVPI = NAV / Called Capital
 *
 * @param nav - Net Asset Value
 * @param calledCapital - Total called capital
 * @returns RVPI multiple
 */
export function calculateRVPI(
  nav: Decimal,
  calledCapital: Decimal
): Decimal {
  if (calledCapital.isZero()) {
    return new Decimal(0);
  }

  return nav.div(calledCapital);
}
