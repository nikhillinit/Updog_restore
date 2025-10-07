/**
 * Reference Formulas - Canonical definitions for validation
 *
 * These formulas serve as the "source of truth" when App and Excel disagree.
 * All formulas use Decimal.js for precision and follow industry-standard definitions.
 *
 * @module reference-formulas
 */

import Decimal from 'decimal.js';
import { toDecimal } from './decimal-utils';
import type { FundModelOutputs } from '@shared/schemas/fund-model';

/**
 * Metric keys for fund performance
 */
export type MetricKey = 'DPI' | 'TVPI' | 'GrossMOIC' | 'NetMOIC' | 'IRR' | 'NAV';

/**
 * Reference formula implementations
 *
 * Each formula includes:
 * - Canonical mathematical definition
 * - Edge case handling (division by zero)
 * - Decimal precision (30 digits)
 */
export const ReferenceFormulas = {
  /**
   * DPI (Distributions to Paid-In)
   *
   * Canonical Definition:
   *   DPI = Total Distributions / Total Capital Called
   *
   * Industry Standard: ILPA reporting standards
   *
   * Edge Cases:
   * - Returns 0 if called capital is 0 (avoid division by zero)
   *
   * @param distributions - Cumulative distributions to LPs
   * @param calledCapital - Cumulative capital called from LPs
   * @returns DPI as decimal (e.g., 0.5 = 50 cents returned per dollar invested)
   *
   * @example
   * // $50M distributed, $100M called
   * const dpi = ReferenceFormulas.DPI(new Decimal(50_000_000), new Decimal(100_000_000));
   * // => 0.5
   */
  DPI: (distributions: Decimal, calledCapital: Decimal): Decimal => {
    if (calledCapital.isZero()) return new Decimal(0);
    return distributions.div(calledCapital);
  },

  /**
   * TVPI (Total Value to Paid-In)
   *
   * Canonical Definition:
   *   TVPI = (Cumulative Distributions + Current NAV) / Total Capital Called
   *
   * Industry Standard: ILPA reporting standards
   *
   * Invariant: TVPI ≥ DPI (total value includes both distributed and unrealized)
   *
   * Edge Cases:
   * - Returns 0 if called capital is 0
   *
   * @param distributions - Cumulative distributions to LPs
   * @param nav - Current net asset value (unrealized portfolio value)
   * @param calledCapital - Cumulative capital called from LPs
   * @returns TVPI as decimal (e.g., 1.5 = 1.5x total value)
   *
   * @example
   * // $50M distributed, $80M NAV, $100M called
   * const tvpi = ReferenceFormulas.TVPI(
   *   new Decimal(50_000_000),
   *   new Decimal(80_000_000),
   *   new Decimal(100_000_000)
   * );
   * // => 1.3 (130% total value)
   */
  TVPI: (distributions: Decimal, nav: Decimal, calledCapital: Decimal): Decimal => {
    if (calledCapital.isZero()) return new Decimal(0);
    return distributions.plus(nav).div(calledCapital);
  },

  /**
   * Gross MOIC (Money-on-Invested-Capital before fees)
   *
   * Canonical Definition:
   *   Gross MOIC = Total Exit Value / Total Invested Capital
   *
   * Note: "Gross" means before management fees and carry
   *
   * Edge Cases:
   * - Returns 0 if invested capital is 0
   *
   * @param exitValue - Total realized exit proceeds
   * @param invested - Total capital invested into companies
   * @returns Gross MOIC as decimal (e.g., 3.0 = 3x gross multiple)
   *
   * @example
   * // $300M exit value, $100M invested
   * const moic = ReferenceFormulas.GrossMOIC(
   *   new Decimal(300_000_000),
   *   new Decimal(100_000_000)
   * );
   * // => 3.0
   */
  GrossMOIC: (exitValue: Decimal, invested: Decimal): Decimal => {
    if (invested.isZero()) return new Decimal(0);
    return exitValue.div(invested);
  },

  /**
   * Net MOIC (Money-on-Invested-Capital after fees)
   *
   * Canonical Definition:
   *   Net MOIC = (Distributions + NAV - Fees) / Total Invested
   *
   * Note: "Net" means after management fees but before carry
   *
   * Invariant: Net MOIC ≤ Gross MOIC (fees reduce returns)
   *
   * Edge Cases:
   * - Returns 0 if invested capital is 0
   *
   * @param distributions - Cumulative distributions to LPs
   * @param nav - Current net asset value
   * @param invested - Total capital invested into companies
   * @param fees - Cumulative management fees paid
   * @returns Net MOIC as decimal (e.g., 2.5 = 2.5x net multiple)
   *
   * @example
   * // $250M total value, $20M fees, $100M invested
   * const moic = ReferenceFormulas.NetMOIC(
   *   new Decimal(150_000_000),  // distributions
   *   new Decimal(100_000_000),  // NAV
   *   new Decimal(100_000_000),  // invested
   *   new Decimal(20_000_000)    // fees
   * );
   * // => 2.3 ((150 + 100 - 20) / 100)
   */
  NetMOIC: (
    distributions: Decimal,
    nav: Decimal,
    invested: Decimal,
    fees: Decimal
  ): Decimal => {
    if (invested.isZero()) return new Decimal(0);
    return distributions.plus(nav).minus(fees).div(invested);
  },
};

/**
 * Compute all reference metrics from fund model outputs
 *
 * This function extracts the final period results and computes
 * all reference metrics for validation purposes.
 *
 * @param outputs - Fund model outputs from runFundModel()
 * @returns Record of all reference metrics as Decimal values
 *
 * @example
 * const outputs = runFundModel(inputs);
 * const ref = computeReferenceMetrics(outputs);
 * console.log(ref.TVPI.toNumber()); // => 1.3
 */
export function computeReferenceMetrics(
  outputs: FundModelOutputs
): Record<MetricKey, Decimal> {
  // Use final period for cumulative values
  const lastPeriod = outputs.periodResults[outputs.periodResults.length - 1];

  if (!lastPeriod) {
    throw new Error('Fund model outputs must contain at least one period');
  }

  const calledCapital = toDecimal(lastPeriod.capitalCalledCumulative ?? 0);
  const distributions = toDecimal(lastPeriod.distributionsCumulative ?? 0);
  const nav = toDecimal(lastPeriod.navEnd ?? 0);
  const invested = toDecimal(lastPeriod.investedCapital ?? 0);
  const fees = toDecimal(lastPeriod.feesCumulative ?? 0);

  return {
    DPI: ReferenceFormulas.DPI(distributions, calledCapital),
    TVPI: ReferenceFormulas.TVPI(distributions, nav, calledCapital),
    GrossMOIC: ReferenceFormulas.GrossMOIC(distributions.plus(nav), invested),
    NetMOIC: ReferenceFormulas.NetMOIC(distributions, nav, invested, fees),
    IRR: toDecimal(outputs.kpis.irrAnnualized ?? 0), // From XIRR calculation
    NAV: nav,
  };
}

/**
 * Validate invariants across reference metrics
 *
 * Checks mathematical relationships that must always hold:
 * - TVPI ≥ DPI (total value includes unrealized)
 * - Gross MOIC ≥ Net MOIC (fees reduce returns)
 * - NAV ≥ 0 (cannot have negative assets)
 *
 * @param metrics - Computed reference metrics
 * @returns Array of invariant violations (empty if all pass)
 *
 * @example
 * const metrics = computeReferenceMetrics(outputs);
 * const violations = validateInvariants(metrics);
 * if (violations.length > 0) {
 *   console.error('Invariant violations:', violations);
 * }
 */
export function validateInvariants(
  metrics: Record<MetricKey, Decimal>
): string[] {
  const violations: string[] = [];

  // TVPI ≥ DPI
  if (metrics.TVPI.lt(metrics.DPI)) {
    violations.push(
      `TVPI (${metrics.TVPI.toFixed(4)}) < DPI (${metrics.DPI.toFixed(4)})`
    );
  }

  // Gross MOIC ≥ Net MOIC
  if (metrics.GrossMOIC.lt(metrics.NetMOIC)) {
    violations.push(
      `Gross MOIC (${metrics.GrossMOIC.toFixed(4)}) < Net MOIC (${metrics.NetMOIC.toFixed(4)})`
    );
  }

  // NAV ≥ 0
  if (metrics.NAV.lt(0)) {
    violations.push(`NAV (${metrics.NAV.toFixed(2)}) < 0`);
  }

  return violations;
}
