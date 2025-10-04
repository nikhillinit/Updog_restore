import { Decimal, toDecimal, sum, safeDivide, roundRatio, roundPercent } from './decimal-utils';
import { calculateIRRFromPeriods } from './xirr';
import type { FundModelInputs, FundModelOutputs, PeriodResult } from '@shared/schemas/fund-model';

/**
 * Fund Calculation Engine (Deterministic)
 *
 * This is the main entry point for the deterministic fund modeling engine.
 * It processes fund inputs and returns period results, company ledger, and KPIs.
 *
 * Version: 1.0.0 (Stub for PR #2 - full implementation in subsequent PRs)
 *
 * Key Features:
 * - Deterministic (no RNG) - same inputs always produce same outputs
 * - Policy A: Immediate distribution (distributions = exitProceeds each period)
 * - Upfront capital call (100% at period 0)
 * - Management fees only (with horizon limit)
 */

/**
 * Run fund model calculation (deterministic, no RNG)
 *
 * NOTE: This is a STUB implementation for PR #2 to enable CSV export testing.
 * Full implementation will be added in subsequent PRs.
 *
 * @param inputs - Validated fund model inputs (Zod schema enforces feasibility constraints)
 * @returns Complete fund model outputs with period results, company ledger, and KPIs
 */
export function runFundModel(inputs: FundModelInputs): FundModelOutputs {
  // TODO: Full implementation in next PR
  // For now, throw error to indicate stub status
  throw new Error(
    'Fund calculation engine not yet implemented. ' +
    'This is a stub for PR #2 to enable CSV export route development. ' +
    'Full deterministic engine will be implemented in PR #3.'
  );
}

/**
 * Calculate management fee for a given period
 *
 * Implements fees v1: management fees on committed capital with horizon limit.
 * Fees stop after managementFeeYears (default 10).
 *
 * @param fundSize - Total committed capital
 * @param periodLengthMonths - Length of each period (e.g., 3 for quarterly)
 * @param managementFeeRate - Annual fee rate (e.g., 0.02 = 2%)
 * @param managementFeeYears - Number of years to charge fees (default 10)
 * @param periodIndex - Current period index (0-based)
 * @returns Management fee amount for this period
 *
 * @example
 * // Quarterly fees, 2% annual, 10-year horizon
 * const fee = calculateManagementFee(100_000_000, 3, 0.02, 10, 0);
 * // => 500,000 (0.5% per quarter)
 */
export function calculateManagementFee(
  fundSize: number,
  periodLengthMonths: number,
  managementFeeRate: number,
  managementFeeYears: number,
  periodIndex: number
): number {
  // Calculate period as fraction of year
  const periodsPerYear = 12 / periodLengthMonths;
  const periodYears = periodIndex / periodsPerYear;

  // Stop charging fees after managementFeeYears (horizon limit)
  if (periodYears >= managementFeeYears) {
    return 0;
  }

  // Pro-rate annual fee to period
  const periodFeeRate = managementFeeRate / periodsPerYear;
  return toDecimal(fundSize).times(periodFeeRate).toNumber();
}

/**
 * Calculate KPIs from period results
 *
 * Calculates TVPI, DPI, and IRR based on complete period results.
 * Uses Decimal.js for precision and XIRR for IRR calculation.
 *
 * @param periodResults - Array of period results from fund model
 * @returns KPIs object with TVPI, DPI, and annualized IRR
 *
 * @example
 * const kpis = calculateKPIs(periodResults);
 * // => { tvpi: 2.5432, dpi: 1.2345, irrAnnualized: 18.25 }
 */
export function calculateKPIs(periodResults: PeriodResult[]): {
  tvpi: number;
  dpi: number;
  irrAnnualized: number;
} {
  // Calculate cumulative totals
  const totalDistributions = sum(periodResults.map(p => p.distributions));
  const totalContributions = sum(periodResults.map(p => p.contributions));

  // Get final NAV
  const finalNAV = toDecimal(periodResults[periodResults.length - 1]?.nav ?? 0);

  // Calculate TVPI = (cumulative distributions + ending NAV) / cumulative contributions
  const tvpi = safeDivide(totalDistributions.plus(finalNAV), totalContributions);

  // Calculate DPI = cumulative distributions / cumulative contributions
  const dpi = safeDivide(totalDistributions, totalContributions);

  // Calculate IRR using XIRR
  let irr = 0;
  try {
    irr = calculateIRRFromPeriods(periodResults);
  } catch (err) {
    // If IRR calculation fails (e.g., no cashflows), default to 0
    console.warn('IRR calculation failed, defaulting to 0:', err);
  }

  return {
    tvpi: roundRatio(tvpi),
    dpi: roundRatio(dpi),
    irrAnnualized: roundPercent(irr),
  };
}

/**
 * Generate period dates based on fund start date and period length
 *
 * @param startDate - Fund start date (ISO 8601 string)
 * @param periodLengthMonths - Length of each period in months
 * @param numPeriods - Total number of periods to generate
 * @returns Array of period start/end dates
 *
 * @example
 * const dates = generatePeriodDates('2025-01-01', 3, 4);
 * // => [
 * //   { start: '2025-01-01T00:00:00.000Z', end: '2025-03-31T23:59:59.999Z' },
 * //   { start: '2025-04-01T00:00:00.000Z', end: '2025-06-30T23:59:59.999Z' },
 * //   ...
 * // ]
 */
export function generatePeriodDates(
  startDate: string,
  periodLengthMonths: number,
  numPeriods: number
): Array<{ start: string; end: string }> {
  const dates: Array<{ start: string; end: string }> = [];
  const baseDate = new Date(startDate);

  for (let i = 0; i < numPeriods; i++) {
    // Calculate period start
    const periodStart = new Date(baseDate);
    periodStart.setMonth(baseDate.getMonth() + (i * periodLengthMonths));
    periodStart.setHours(0, 0, 0, 0);

    // Calculate period end (last moment of last day of period)
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + periodLengthMonths);
    periodEnd.setDate(0); // Last day of previous month
    periodEnd.setHours(23, 59, 59, 999);

    dates.push({
      start: periodStart.toISOString(),
      end: periodEnd.toISOString(),
    });
  }

  return dates;
}

/**
 * Validate fund model inputs against feasibility constraints
 *
 * This is a runtime check in addition to Zod schema validation.
 * Useful for providing detailed error messages to users.
 *
 * @param inputs - Fund model inputs to validate
 * @returns Array of error messages (empty if valid)
 */
export function validateInputs(inputs: FundModelInputs): string[] {
  const errors: string[] = [];

  // Check: Stage allocations sum to 100%
  const allocSum = inputs.stageAllocations.reduce((s, a) => s + a.allocationPct, 0);
  if (Math.abs(allocSum - 1.0) > 1e-6) {
    errors.push(`Stage allocations must sum to 100%. Current: ${(allocSum * 100).toFixed(2)}%`);
  }

  // Check: Check sizes <= stage allocations
  inputs.stageAllocations.forEach(stage => {
    const stageCapital = inputs.fundSize * stage.allocationPct;
    const avgCheck = inputs.averageCheckSizes[stage.stage];
    if (avgCheck && avgCheck > stageCapital) {
      errors.push(
        `Check size for ${stage.stage} ($${(avgCheck / 1e6).toFixed(2)}M) ` +
        `exceeds stage allocation ($${(stageCapital / 1e6).toFixed(2)}M)`
      );
    }
  });

  // Check: Graduation time < Exit time
  inputs.stageAllocations.forEach(stage => {
    const gradTime = inputs.monthsToGraduate[stage.stage];
    const exitTime = inputs.monthsToExit[stage.stage];
    if (gradTime && exitTime && gradTime >= exitTime) {
      errors.push(
        `Graduation time for ${stage.stage} (${gradTime} months) ` +
        `must be less than exit time (${exitTime} months)`
      );
    }
  });

  return errors;
}
