import { toDecimal, sum, safeDivide, roundRatio, roundPercent } from '@shared/lib/decimal-utils';
import { calculateIRRFromPeriods } from '@shared/lib/finance/xirr';
import type {
  CompanyResult,
  FundModelInputs,
  FundModelOutputs,
  PeriodResult,
} from '@shared/schemas/fund-model';

export function runFundModel(inputs: FundModelInputs): FundModelOutputs {
  const companies = deployCompanies(inputs);
  const periodResults = simulatePeriods(inputs, companies);
  const kpis = calculateKPIs(periodResults);

  return {
    periodResults,
    companyLedger: companies,
    kpis,
  };
}

export function calculateManagementFee(
  fundSize: number,
  periodLengthMonths: number,
  managementFeeRate: number,
  managementFeeYears: number,
  periodIndex: number
): number {
  const periodsPerYear = 12 / periodLengthMonths;
  const periodYears = periodIndex / periodsPerYear;

  if (periodYears >= managementFeeYears) {
    return 0;
  }

  const periodFeeRate = managementFeeRate / periodsPerYear;
  return toDecimal(fundSize).times(periodFeeRate).toNumber();
}

export function calculateKPIs(periodResults: PeriodResult[]): {
  tvpi: number;
  dpi: number;
  irrAnnualized: number;
} {
  const totalDistributions = sum(periodResults.map((period) => period.distributions));
  const totalContributions = sum(periodResults.map((period) => period.contributions));
  const finalNAV = toDecimal(periodResults[periodResults.length - 1]?.nav ?? 0);

  const tvpi = safeDivide(totalDistributions.plus(finalNAV), totalContributions);
  const dpi = safeDivide(totalDistributions, totalContributions);

  let irr = 0;
  try {
    irr = calculateIRRFromPeriods(periodResults) ?? 0;
  } catch (error) {
    console.warn('IRR calculation failed, defaulting to 0:', error);
  }

  return {
    tvpi: roundRatio(tvpi),
    dpi: roundRatio(dpi),
    irrAnnualized: roundPercent(irr),
  };
}

export function generatePeriodDates(
  startDate: string,
  periodLengthMonths: number,
  numPeriods: number
): Array<{ start: string; end: string }> {
  const dates: Array<{ start: string; end: string }> = [];
  const baseDate = new Date(startDate);

  for (let index = 0; index < numPeriods; index++) {
    const periodStart = new Date(baseDate);
    periodStart.setMonth(baseDate.getMonth() + index * periodLengthMonths);
    periodStart.setHours(0, 0, 0, 0);

    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + periodLengthMonths);
    periodEnd.setDate(0);
    periodEnd.setHours(23, 59, 59, 999);

    dates.push({
      start: periodStart.toISOString(),
      end: periodEnd.toISOString(),
    });
  }

  return dates;
}

export function validateInputs(inputs: FundModelInputs): string[] {
  const errors: string[] = [];
  const allocSum = inputs.stageAllocations.reduce(
    (sum, allocation) => sum + allocation.allocationPct,
    0
  );

  if (Math.abs(allocSum - 1.0) > 1e-6) {
    errors.push(`Stage allocations must sum to 100%. Current: ${(allocSum * 100).toFixed(2)}%`);
  }

  inputs.stageAllocations.forEach((stage) => {
    const stageCapital = inputs.fundSize * stage.allocationPct;
    const avgCheck = inputs.averageCheckSizes[stage.stage];
    if (avgCheck && avgCheck > stageCapital) {
      errors.push(
        `Check size for ${stage.stage} ($${(avgCheck / 1e6).toFixed(2)}M) ` +
          `exceeds stage allocation ($${(stageCapital / 1e6).toFixed(2)}M)`
      );
    }
  });

  inputs.stageAllocations.forEach((stage) => {
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

function deployCompanies(inputs: FundModelInputs): CompanyResult[] {
  const companies: CompanyResult[] = [];
  let globalCompanyIndex = 0;

  inputs.stageAllocations.forEach((stageAllocation) => {
    const stageCapital = toDecimal(inputs.fundSize).times(stageAllocation.allocationPct);
    const reserveCapital = stageCapital.times(inputs.reservePoolPct);
    const deployableCapital = stageCapital.minus(reserveCapital);
    const avgCheckSize = toDecimal(inputs.averageCheckSizes[stageAllocation.stage] || 0);
    const numCompanies = deployableCapital.dividedToIntegerBy(avgCheckSize).toNumber();

    for (let index = 0; index < numCompanies; index++) {
      const companyId = `${stageAllocation.stage}-${String(index + 1).padStart(3, '0')}`;
      const exitBuckets: Array<'failure' | 'acquired' | 'ipo' | 'secondary'> = [
        'failure',
        'acquired',
        'ipo',
        'secondary',
      ];

      companies.push({
        companyId,
        stageAtEntry: stageAllocation.stage,
        initialInvestment: avgCheckSize.toNumber(),
        followOnInvestment: 0,
        totalInvested: avgCheckSize.toNumber(),
        ownershipAtExit: 0.15,
        exitBucket: exitBuckets[globalCompanyIndex % 4] ?? 'failure',
        exitValue: 0,
        proceedsToFund: 0,
      });

      globalCompanyIndex++;
    }
  });

  return companies;
}

function simulatePeriods(inputs: FundModelInputs, companies: CompanyResult[]): PeriodResult[] {
  const periods: PeriodResult[] = [];
  const maxExitMonths = Math.max(
    ...inputs.stageAllocations.map((stage) => inputs.monthsToExit[stage.stage] || 0)
  );
  const managementFeeMonths = inputs.managementFeeYears * 12;
  const simulationMonths = Math.max(maxExitMonths, managementFeeMonths);
  const numPeriods = Math.ceil(simulationMonths / inputs.periodLengthMonths);
  const periodDates = generatePeriodDates(
    new Date().toISOString(),
    inputs.periodLengthMonths,
    numPeriods + 1
  );

  let cumulativeContributions = toDecimal(0);
  let cumulativeDistributions = toDecimal(0);
  let cumulativeInvestments = toDecimal(0);
  let cumulativeManagementFees = toDecimal(0);
  let cumulativeExitProceeds = toDecimal(0);
  let uninvestedCash = toDecimal(0);

  const period0Contributions = toDecimal(inputs.fundSize);
  const period0Fees = calculateManagementFee(
    inputs.fundSize,
    inputs.periodLengthMonths,
    inputs.managementFeeRate,
    inputs.managementFeeYears,
    0
  );
  const period0Investments = sum(companies.map((company) => company.initialInvestment));

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
    distributions: 0,
    unrealizedPnl: 0,
    nav: period0NAV.toNumber(),
    tvpi: roundRatio(safeDivide(period0NAV, cumulativeContributions)),
    dpi: 0,
    irrAnnualized: 0,
  });

  for (let periodIndex = 1; periodIndex <= numPeriods; periodIndex++) {
    const periodMonths = periodIndex * inputs.periodLengthMonths;
    let periodExitProceeds = toDecimal(0);

    companies.forEach((company) => {
      const stageExitMonths = inputs.monthsToExit[company.stageAtEntry] || 0;
      if (periodMonths >= stageExitMonths && company.exitValue === 0) {
        const exitValue = toDecimal(company.totalInvested).times(
          getExitMultiple(company.exitBucket)
        );
        const proceedsToFund = exitValue.times(company.ownershipAtExit);

        company.exitValue = exitValue.toNumber();
        company.proceedsToFund = proceedsToFund.toNumber();
        periodExitProceeds = periodExitProceeds.plus(proceedsToFund);
      }
    });

    const periodFees = calculateManagementFee(
      inputs.fundSize,
      inputs.periodLengthMonths,
      inputs.managementFeeRate,
      inputs.managementFeeYears,
      periodIndex
    );

    const periodDistributions = periodExitProceeds;

    cumulativeExitProceeds = cumulativeExitProceeds.plus(periodExitProceeds);
    cumulativeDistributions = cumulativeDistributions.plus(periodDistributions);
    cumulativeManagementFees = cumulativeManagementFees.plus(periodFees);
    uninvestedCash = uninvestedCash
      .plus(periodExitProceeds)
      .minus(periodDistributions)
      .minus(periodFees);

    const remainingInvestments = sum(
      companies.filter((company) => company.exitValue === 0).map((company) => company.totalInvested)
    );
    const periodNAV = remainingInvestments.plus(uninvestedCash);
    const periodTVPI = safeDivide(cumulativeDistributions.plus(periodNAV), cumulativeContributions);
    const periodDPI = safeDivide(cumulativeDistributions, cumulativeContributions);

    const currentPeriod = periodDates[periodIndex];
    if (!currentPeriod) {
      continue;
    }

    periods.push({
      periodIndex,
      periodStart: currentPeriod.start,
      periodEnd: currentPeriod.end,
      contributions: 0,
      investments: 0,
      managementFees: periodFees,
      exitProceeds: periodExitProceeds.toNumber(),
      distributions: periodDistributions.toNumber(),
      unrealizedPnl: 0,
      nav: periodNAV.toNumber(),
      tvpi: roundRatio(periodTVPI),
      dpi: roundRatio(periodDPI),
      irrAnnualized: 0,
    });
  }

  return periods;
}

function getExitMultiple(exitBucket: 'failure' | 'acquired' | 'ipo' | 'secondary') {
  const multiples = {
    failure: toDecimal(0.1),
    acquired: toDecimal(3.0),
    ipo: toDecimal(15.0),
    secondary: toDecimal(5.0),
  };

  return multiples[exitBucket] ?? toDecimal(0.1);
}
