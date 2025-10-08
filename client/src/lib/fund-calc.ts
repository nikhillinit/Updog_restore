import type { Decimal} from './decimal-utils';
import { toDecimal, sum, safeDivide, roundRatio, roundPercent } from './decimal-utils';
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
 * @param inputs - Validated fund model inputs (Zod schema enforces feasibility constraints)
 * @returns Complete fund model outputs with period results, company ledger, and KPIs
 */
export function runFundModel(inputs: FundModelInputs): FundModelOutputs {
  // =====================
  // STEP 1: Deploy Companies (Deterministic)
  // =====================
  const companies = deployCompanies(inputs);

  // =====================
  // STEP 2: Run Period-by-Period Simulation
  // =====================
  const periodResults = simulatePeriods(inputs, companies);

  // =====================
  // STEP 3: Calculate Final KPIs
  // =====================
  const kpis = calculateKPIs(periodResults);

  const outputs: FundModelOutputs = {
    periodResults,
    companyLedger: companies,
    kpis,
  };

  return outputs;
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
    const calculatedIrr = calculateIRRFromPeriods(periodResults);
    irr = calculatedIrr ?? 0; // Default to 0 if null
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

// =====================
// INTERNAL IMPLEMENTATION FUNCTIONS
// =====================

import type { CompanyResult } from '@shared/schemas/fund-model';

/**
 * Deploy companies deterministically across stages
 *
 * @param inputs - Fund model inputs
 * @returns Array of company results
 */
function deployCompanies(inputs: FundModelInputs): CompanyResult[] {
  const companies: CompanyResult[] = [];
  let globalCompanyIndex = 0;

  // Deploy companies sequentially by stage (seed → growth)
  inputs.stageAllocations.forEach(stageAlloc => {
    // Calculate capital available for this stage (after reserves)
    const stageCapital = toDecimal(inputs.fundSize).times(stageAlloc.allocationPct);
    const reserveCapital = stageCapital.times(inputs.reservePoolPct);
    const deployableCapital = stageCapital.minus(reserveCapital);

    // Calculate number of companies for this stage
    const avgCheckSize = toDecimal(inputs.averageCheckSizes[stageAlloc.stage] || 0);
    const numCompanies = deployableCapital.dividedToIntegerBy(avgCheckSize).toNumber();

    // Deploy companies with deterministic IDs
    for (let i = 0; i < numCompanies; i++) {
      const companyId = `${stageAlloc.stage}-${String(i + 1).padStart(3, '0')}`;
      const initialInvestment = avgCheckSize.toNumber();

      // Deterministic exit bucket assignment (cycle through buckets)
      const exitBuckets: Array<'failure' | 'acquired' | 'ipo' | 'secondary'> =
        ['failure', 'acquired', 'ipo', 'secondary'];
      const exitBucket = exitBuckets[globalCompanyIndex % 4];

      companies.push({
        companyId,
        stageAtEntry: stageAlloc.stage,
        initialInvestment,
        followOnInvestment: 0,  // Will be calculated during simulation
        totalInvested: initialInvestment,
        ownershipAtExit: 0.15,  // TODO: Make configurable per stage
        exitBucket,
        exitValue: 0,  // Will be calculated at exit
        proceedsToFund: 0,  // Will be calculated at exit
      });

      globalCompanyIndex++;
    }
  });

  return companies;
}

/**
 * Simulate fund periods from 0 to fund term
 *
 * @param inputs - Fund model inputs
 * @param companies - Deployed companies
 * @returns Array of period results
 */
function simulatePeriods(
  inputs: FundModelInputs,
  companies: CompanyResult[]
): PeriodResult[] {
  const periods: PeriodResult[] = [];

  // Calculate total periods based on BOTH longest exit time AND management fee horizon
  // Fix for PR #112 review: Ensure we simulate through full fee period to avoid understating expenses
  const maxExitMonths = Math.max(
    ...inputs.stageAllocations.map(s => inputs.monthsToExit[s.stage] || 0)
  );
  const managementFeeMonths = inputs.managementFeeYears * 12;

  // Use the LONGER of: (1) longest exit time, or (2) management fee horizon
  // This ensures we capture all fees even if exits happen early
  const simulationMonths = Math.max(maxExitMonths, managementFeeMonths);
  const numPeriods = Math.ceil(simulationMonths / inputs.periodLengthMonths);

  // Generate period dates
  const periodDates = generatePeriodDates(
    new Date().toISOString(),  // TODO: Make configurable
    inputs.periodLengthMonths,
    numPeriods + 1
  );

  // Initialize cumulative tracking
  let cumulativeContributions = toDecimal(0);
  let cumulativeDistributions = toDecimal(0);
  let cumulativeInvestments = toDecimal(0);
  let cumulativeManagementFees = toDecimal(0);
  let cumulativeExitProceeds = toDecimal(0);
  let uninvestedCash = toDecimal(0);

  // Period 0: Upfront capital call and initial deployment
  const period0Contributions = toDecimal(inputs.fundSize);
  const period0Fees = calculateManagementFee(
    inputs.fundSize,
    inputs.periodLengthMonths,
    inputs.managementFeeRate,
    inputs.managementFeeYears,
    0
  );
  const period0Investments = sum(companies.map(c => c.initialInvestment));

  cumulativeContributions = cumulativeContributions.plus(period0Contributions);
  cumulativeManagementFees = cumulativeManagementFees.plus(period0Fees);
  cumulativeInvestments = cumulativeInvestments.plus(period0Investments);
  uninvestedCash = period0Contributions.minus(period0Fees).minus(period0Investments);

  const period0NAV = cumulativeInvestments.plus(uninvestedCash);

  const firstPeriod = periodDates[0];
  if (!firstPeriod) {
    throw new Error('Period dates must have at least one period');
  }

  periods.push({
    periodIndex: 0,
    periodStart: firstPeriod.start,
    periodEnd: firstPeriod.end,
    contributions: period0Contributions.toNumber(),
    investments: period0Investments.toNumber(),
    managementFees: period0Fees,
    exitProceeds: 0,
    distributions: 0,  // Policy A: distributions in exit period only
    unrealizedPnl: 0,  // TODO: Add mark-to-market logic
    nav: period0NAV.toNumber(),
    tvpi: roundRatio(safeDivide(period0NAV, cumulativeContributions)),
    dpi: 0,
    irrAnnualized: 0,
  });

  // Periods 1-N: Track progression and exits
  for (let periodIndex = 1; periodIndex <= numPeriods; periodIndex++) {
    const periodMonths = periodIndex * inputs.periodLengthMonths;

    // Calculate exits for this period
    let periodExitProceeds = toDecimal(0);

    companies.forEach(company => {
      const stageExitMonths = inputs.monthsToExit[company.stageAtEntry] || 0;

      // Check if company exits in this period
      if (periodMonths >= stageExitMonths && company.exitValue === 0) {
        // Calculate exit value (deterministic: use average exit multiple for bucket)
        const exitMultiple = getExitMultiple(company.exitBucket);
        const exitValue = toDecimal(company.totalInvested).times(exitMultiple);
        const proceedsToFund = exitValue.times(company.ownershipAtExit);

        company.exitValue = exitValue.toNumber();
        company.proceedsToFund = proceedsToFund.toNumber();

        periodExitProceeds = periodExitProceeds.plus(proceedsToFund);
      }
    });

    // Management fees for this period
    const periodFees = calculateManagementFee(
      inputs.fundSize,
      inputs.periodLengthMonths,
      inputs.managementFeeRate,
      inputs.managementFeeYears,
      periodIndex
    );

    // Policy A: Immediate distribution = exit proceeds
    const periodDistributions = periodExitProceeds;

    // Update cumulative trackers
    cumulativeExitProceeds = cumulativeExitProceeds.plus(periodExitProceeds);
    cumulativeDistributions = cumulativeDistributions.plus(periodDistributions);
    cumulativeManagementFees = cumulativeManagementFees.plus(periodFees);
    uninvestedCash = uninvestedCash.plus(periodExitProceeds).minus(periodDistributions).minus(periodFees);

    // Calculate NAV: remaining investments + uninvested cash
    const remainingInvestments = sum(
      companies
        .filter(c => c.exitValue === 0)
        .map(c => c.totalInvested)
    );
    const periodNAV = remainingInvestments.plus(uninvestedCash);

    // Calculate KPIs for this period
    const periodTVPI = safeDivide(
      cumulativeDistributions.plus(periodNAV),
      cumulativeContributions
    );
    const periodDPI = safeDivide(cumulativeDistributions, cumulativeContributions);

    const currentPeriod = periodDates[periodIndex];
    if (!currentPeriod) continue;

    periods.push({
      periodIndex,
      periodStart: currentPeriod.start,
      periodEnd: currentPeriod.end,
      contributions: 0,  // Only period 0 has contributions
      investments: 0,    // Only period 0 has initial investments
      managementFees: periodFees,
      exitProceeds: periodExitProceeds.toNumber(),
      distributions: periodDistributions.toNumber(),
      unrealizedPnl: 0,  // TODO: Add mark-to-market logic
      nav: periodNAV.toNumber(),
      tvpi: roundRatio(periodTVPI),
      dpi: roundRatio(periodDPI),
      irrAnnualized: 0,  // TODO: Calculate period IRR
    });
  }

  return periods;
}

/**
 * Get deterministic exit multiple for exit bucket
 *
 * @param exitBucket - Exit bucket type
 * @returns Exit multiple
 */
function getExitMultiple(exitBucket: 'failure' | 'acquired' | 'ipo' | 'secondary'): Decimal {
  // Deterministic average exit multiples per bucket
  const multiples: Record<string, Decimal> = {
    failure: toDecimal(0.1),    // 0.1x (90% loss)
    acquired: toDecimal(3.0),   // 3x
    ipo: toDecimal(15.0),       // 15x
    secondary: toDecimal(5.0),  // 5x
  };

  return multiples[exitBucket];
}
