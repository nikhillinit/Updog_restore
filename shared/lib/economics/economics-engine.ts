import Decimal from '@shared/lib/decimal-config';
import { calculateCanonicalIrr, type CashFlow } from '@shared/lib/finance/xirr';
import type { FundDraftWriteV1 } from '@shared/contracts/fund-draft-write-v1.contract';
import {
  EconomicsAssumptionsV1Schema,
  EconomicsFeeBasisSchema,
  type EconomicsAnnualRowV1,
  type EconomicsAssumptionsV1,
  type EconomicsExpenseV1,
  type EconomicsFeeBasis,
  type EconomicsFeeTierV1,
  type EconomicsInvariantReportV1,
  type EconomicsResultV1,
  type EconomicsSummaryV1,
} from '@shared/contracts/economics-v1.contract';

export interface EconomicsValidationIssue {
  path: string[];
  message: string;
}

export class EconomicsInputValidationError extends Error {
  readonly issues: EconomicsValidationIssue[];

  constructor(issues: EconomicsValidationIssue[]) {
    super(issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
    this.name = 'EconomicsInputValidationError';
    this.issues = issues;
  }
}

export class EconomicsInvariantError extends Error {
  readonly checks: EconomicsInvariantReportV1;

  constructor(checks: EconomicsInvariantReportV1) {
    super('Economics invariants failed');
    this.name = 'EconomicsInvariantError';
    this.checks = checks;
  }
}

interface NormalizedEconomicsConfig {
  fundSize: Decimal;
  fundLifeYears: number;
  investmentPeriodYears: number;
  vintageYear: number;
  feeTiers: EconomicsFeeTierV1[];
  expenses: EconomicsExpenseV1[];
  exitModel: NonNullable<EconomicsAssumptionsV1['exitModel']>;
  recycling: NonNullable<EconomicsAssumptionsV1['recyclingModel']>;
  waterfall: NonNullable<EconomicsAssumptionsV1['waterfallModel']>;
  gpCommitmentAmount: Decimal;
  gpCommitmentPct: Decimal;
  gpParticipatesInInvestmentReturns: boolean;
  gpCallSchedule: number[] | null;
}

interface FeeBasisContext {
  committedCapital: Decimal;
  calledCapitalCumulative: Decimal;
  calledCapitalNetOfReturns: Decimal;
  investedCapital: Decimal;
  fairMarketValue: Decimal;
  unrealizedCost: Decimal;
}

interface WaterfallAllocation {
  lpDistributions: Decimal;
  gpInvestmentDistributions: Decimal;
  gpCarryDistributed: Decimal;
  gpCarryEscrowed: Decimal;
  gpCarryReleasedFromEscrow: Decimal;
  clawbackPaid: Decimal;
  prefPaid: Decimal;
  returnedCapital: Decimal;
}

const DEFAULT_FUND_LIFE_YEARS = 10;
const DEFAULT_INVESTMENT_PERIOD_YEARS = 5;
const MONEY_DP = 2;
const RATIO_DP = 6;

function issue(path: string[], message: string): EconomicsValidationIssue {
  return { path, message };
}

function asDecimal(value: number | string | Decimal | null | undefined): Decimal {
  if (value instanceof Decimal) return value;
  if (value == null) return new Decimal(0);
  return new Decimal(value);
}

function toMoney(value: Decimal): number {
  return Number(value.toDecimalPlaces(MONEY_DP).toString());
}

function toRatio(value: Decimal): number {
  return Number(value.toDecimalPlaces(RATIO_DP).toString());
}

function percentToRatio(value: number | null | undefined): number {
  if (value == null) return 0;
  return value > 1 ? value / 100 : value;
}

function recyclingCapToRatio(
  value: number | null | undefined,
  fundSize: number | string | undefined
): number {
  if (value == null || value <= 0) return 0;
  if (value <= 1) return value;
  if (value <= 100) return value / 100;
  const denominator = Number(fundSize ?? 0);
  return denominator > 0 ? value / denominator : 0;
}

function monthToYear(month: number): number {
  return Math.max(1, Math.floor(Math.max(0, month - 1) / 12) + 1);
}

function legacyPeriodToYear(period: number): number {
  return period <= 20 ? Math.max(1, Math.ceil(period)) : monthToYear(period);
}

function normalizeLegacyFeeBasis(basis: string, path: string[]): EconomicsFeeBasis {
  const candidate = String(basis);
  if (EconomicsFeeBasisSchema.safeParse(candidate).success) {
    return candidate as EconomicsFeeBasis;
  }

  const aliases: Record<string, EconomicsFeeBasis> = {
    gross_cumulative_called: 'called_capital_cumulative',
    net_cumulative_called: 'called_capital_net_of_returns',
    cumulative_invested: 'invested_capital',
    unrealized_investments: 'unrealized_cost',
  };
  const mapped = aliases[candidate];
  if (mapped) return mapped;

  throw new EconomicsInputValidationError([
    issue(path, `Unsupported economics fee basis: ${candidate}`),
  ]);
}

function assertApproximateSchedule(schedule: number[] | undefined, path: string[]): void {
  if (!schedule) return;
  const total = schedule.reduce((sum, item) => sum + item, 0);
  if (schedule.length === 0 || total <= 0) {
    throw new EconomicsInputValidationError([issue(path, 'schedule must have a positive sum')]);
  }
  if (Math.abs(total - 1) > 0.01) {
    throw new EconomicsInputValidationError([
      issue(path, 'schedule ratios must sum approximately to 1.0'),
    ]);
  }
}

function normalizeDistribution(distribution: number[], years: number): Decimal[] {
  const raw = Array.from({ length: years }, (_, index) => new Decimal(distribution[index] ?? 0));
  const sum = raw.reduce((acc, item) => acc.plus(item), new Decimal(0));
  if (sum.lte(0)) return Array.from({ length: years }, () => new Decimal(0));
  return raw.map((item) => item.div(sum));
}

function defaultExitDistribution(fundLifeYears: number, investmentPeriodYears: number): number[] {
  const distribution = Array.from({ length: fundLifeYears }, () => 0);
  const start = Math.min(fundLifeYears, Math.max(1, investmentPeriodYears + 1));
  const count = fundLifeYears - start + 1;
  if (count <= 0) {
    distribution[fundLifeYears - 1] = 1;
    return distribution;
  }
  for (let year = start; year <= fundLifeYears; year++) {
    distribution[year - 1] = 1 / count;
  }
  return distribution;
}

function normalizeFeeTiers(input: FundDraftWriteV1, assumptions: EconomicsAssumptionsV1) {
  const explicitTiers = assumptions.feeModel?.tiers;
  if (explicitTiers && explicitTiers.length > 0) return explicitTiers;

  if (input.feeProfiles && input.feeProfiles.length > 0) {
    return input.feeProfiles.flatMap((profile, profileIndex) =>
      profile.feeTiers.map((tier, tierIndex) => {
        const startYear = monthToYear(tier.startMonth + 1);
        const normalizedTier: EconomicsFeeTierV1 = {
          id: tier.id,
          name: tier.name,
          rate: percentToRatio(tier.percentage),
          basis: normalizeLegacyFeeBasis(tier.feeBasis, [
            'feeProfiles',
            String(profileIndex),
            'feeTiers',
            String(tierIndex),
            'feeBasis',
          ]),
          startYear,
          ...(tier.endMonth != null && { endYear: monthToYear(tier.endMonth) }),
          ...(tier.recyclingPercentage != null && {
            recyclingEligiblePct: percentToRatio(tier.recyclingPercentage),
          }),
        };
        return normalizedTier;
      })
    );
  }

  const defaultRate = assumptions.feeModel?.defaultRate ?? percentToRatio(input.managementFeeRate);
  if (defaultRate <= 0) {
    throw new EconomicsInputValidationError([
      issue(['feeModel'], 'At least one management-fee tier or defaultRate is required'),
    ]);
  }

  return [
    {
      id: 'default-management-fee',
      name: 'Management Fee',
      rate: defaultRate,
      basis: assumptions.feeModel?.defaultBasis ?? 'committed_capital',
      startYear: 1,
    },
  ] satisfies EconomicsFeeTierV1[];
}

function normalizeExpenses(input: FundDraftWriteV1, assumptions: EconomicsAssumptionsV1) {
  const explicitExpenses = assumptions.expenseModel?.annualExpenses;
  if (explicitExpenses) return explicitExpenses;

  return (input.fundExpenses ?? []).map(
    (expense): EconomicsExpenseV1 => ({
      id: expense.id,
      category: expense.category,
      amount: expense.monthlyAmount * 12,
      startYear: monthToYear(expense.startMonth + 1),
      ...(expense.endMonth != null && { endYear: monthToYear(expense.endMonth) }),
    })
  );
}

function defaultRecycling(
  input: FundDraftWriteV1
): NonNullable<EconomicsAssumptionsV1['recyclingModel']> {
  const recyclingType = input.recyclingType ?? 'exits';
  const sources: Array<'management_fees' | 'exit_proceeds'> = [];
  if (recyclingType === 'fees' || recyclingType === 'both') sources.push('management_fees');
  if (recyclingType === 'exits' || recyclingType === 'both') sources.push('exit_proceeds');

  return {
    enabled: input.recyclingEnabled ?? false,
    sources,
    capPctOfCommitments: recyclingCapToRatio(input.recyclingCap ?? 0, input.fundSize),
    ...(input.recyclingPeriod != null && {
      eligibleThroughYear: legacyPeriodToYear(input.recyclingPeriod),
    }),
    exitProceedsRecyclePct: percentToRatio(input.exitRecyclingRate ?? 0),
    timing: 'before_waterfall',
  };
}

function defaultWaterfall(
  input: FundDraftWriteV1
): NonNullable<EconomicsAssumptionsV1['waterfallModel']> {
  if (input.waterfallType === 'hybrid') {
    throw new EconomicsInputValidationError([
      issue(['waterfallType'], 'GP economics P0 supports american waterfall only'),
    ]);
  }

  const primaryTier =
    input.waterfallTiers?.find((tier) => tier.gpSplit > 0) ?? input.waterfallTiers?.[0];
  return {
    type: 'american',
    carryPct: percentToRatio(primaryTier?.gpSplit ?? input.carriedInterest ?? 20),
    hurdleRate: percentToRatio(primaryTier?.preferredReturn ?? 8),
    prefType: primaryTier?.preferredReturn === 0 ? 'none' : 'compounded',
    prefCompounding: 'annual',
    prefCatchUp: (primaryTier?.catchUp ?? 0) > 0,
    catchUpRate: percentToRatio(primaryTier?.catchUp ?? 100),
    catchUpTargetCarryPct: percentToRatio(primaryTier?.gpSplit ?? input.carriedInterest ?? 20),
    clawbackEnabled: true,
    clawbackTrigger: 'final_liquidation',
    escrowPct: 0,
    feeOffsetTreatment: 'none',
  };
}

export function hasEconomicsAssumptions(input: FundDraftWriteV1): boolean {
  return input.economicsAssumptions != null;
}

export function normalizeEconomicsConfig(input: FundDraftWriteV1): NormalizedEconomicsConfig {
  const assumptionsResult = EconomicsAssumptionsV1Schema.safeParse(input.economicsAssumptions);
  if (!assumptionsResult.success) {
    throw new EconomicsInputValidationError(
      assumptionsResult.error.issues.map((zodIssue) =>
        issue(zodIssue.path.map(String), zodIssue.message)
      )
    );
  }
  const assumptions = assumptionsResult.data;

  const fundSize = asDecimal(input.fundSize);
  if (fundSize.lte(0)) {
    throw new EconomicsInputValidationError([
      issue(['fundSize'], 'fundSize must be positive for economics calculations'),
    ]);
  }

  const fundLifeYears =
    assumptions.timeline?.fundLifeYears ?? input.fundLife ?? DEFAULT_FUND_LIFE_YEARS;
  const investmentPeriodYears = Math.min(
    fundLifeYears,
    input.investmentPeriod ?? DEFAULT_INVESTMENT_PERIOD_YEARS
  );
  const vintageYear =
    assumptions.timeline?.vintageYear ?? input.vintageYear ?? new Date().getFullYear();

  const exitModel =
    assumptions.exitModel ??
    ({
      mode: 'cohort',
      cohort: {
        exitDistributionByYear: defaultExitDistribution(fundLifeYears, investmentPeriodYears),
        grossMultiple: input.targetMetrics?.targetTVPI ?? 2.5,
        lossRatio: 0,
      },
    } satisfies NonNullable<EconomicsAssumptionsV1['exitModel']>);

  if (exitModel.mode === 'cohort') {
    assertApproximateSchedule(exitModel.cohort?.exitDistributionByYear, [
      'exitModel',
      'cohort',
      'exitDistributionByYear',
    ]);
  }

  const gpModel = assumptions.gpCommitmentModel;
  assertApproximateSchedule(gpModel?.callSchedule, ['gpCommitmentModel', 'callSchedule']);
  let commitmentAmount = new Decimal(0);
  if (gpModel?.commitmentAmount != null) {
    commitmentAmount = asDecimal(gpModel.commitmentAmount);
  } else if (gpModel?.commitmentPct != null) {
    commitmentAmount = fundSize.times(gpModel.commitmentPct);
  } else if (input.gpCommitment != null) {
    commitmentAmount = asDecimal(input.gpCommitment);
  }

  const gpCommitmentAmount = Decimal.min(Decimal.max(commitmentAmount, new Decimal(0)), fundSize);
  const gpCommitmentPct = fundSize.gt(0) ? gpCommitmentAmount.div(fundSize) : new Decimal(0);

  return {
    fundSize,
    fundLifeYears,
    investmentPeriodYears,
    vintageYear,
    feeTiers: normalizeFeeTiers(input, assumptions),
    expenses: normalizeExpenses(input, assumptions),
    exitModel,
    recycling: assumptions.recyclingModel ?? defaultRecycling(input),
    waterfall: assumptions.waterfallModel ?? defaultWaterfall(input),
    gpCommitmentAmount,
    gpCommitmentPct,
    gpParticipatesInInvestmentReturns: gpModel?.participatesInInvestmentReturns ?? true,
    gpCallSchedule: gpModel?.callSchedule ?? null,
  };
}

function amountForFeeBasis(basis: EconomicsFeeBasis, context: FeeBasisContext): Decimal {
  switch (basis) {
    case 'committed_capital':
      return context.committedCapital;
    case 'called_capital_cumulative':
      return context.calledCapitalCumulative;
    case 'called_capital_net_of_returns':
      return context.calledCapitalNetOfReturns;
    case 'invested_capital':
      return context.investedCapital;
    case 'fair_market_value':
      return context.fairMarketValue;
    case 'unrealized_cost':
      return context.unrealizedCost;
  }
}

function calculateManagementFeeForYear(
  year: number,
  tiers: EconomicsFeeTierV1[],
  context: FeeBasisContext
): Decimal {
  return tiers.reduce((total, tier) => {
    const active = year >= tier.startYear && (tier.endYear == null || year <= tier.endYear);
    if (!active) return total;
    return total.plus(amountForFeeBasis(tier.basis, context).times(tier.rate));
  }, new Decimal(0));
}

function calculateExpenseForYear(year: number, expenses: EconomicsExpenseV1[]): Decimal {
  return expenses.reduce((total, expense) => {
    const active =
      year >= expense.startYear && (expense.endYear == null || year <= expense.endYear);
    if (!active) return total;
    const growthYears = Math.max(0, year - expense.startYear);
    const multiplier = new Decimal(1).plus(expense.growthRate ?? 0).pow(growthYears);
    return total.plus(asDecimal(expense.amount).times(multiplier));
  }, new Decimal(0));
}

function calculateGrossExitProceeds(
  year: number,
  config: NormalizedEconomicsConfig,
  totalInvestableCost: Decimal
): Decimal {
  if (config.exitModel.mode === 'deal') {
    return (config.exitModel.deals ?? []).reduce((total, deal) => {
      if (deal.exitYear !== year || deal.writeOff) return total;
      return total.plus(deal.exitProceeds);
    }, new Decimal(0));
  }

  const cohort = config.exitModel.cohort;
  if (!cohort) return new Decimal(0);
  const distribution = normalizeDistribution(cohort.exitDistributionByYear, config.fundLifeYears);
  const exitRatio = distribution[year - 1] ?? new Decimal(0);
  const grossExitValue = totalInvestableCost
    .times(1 - cohort.lossRatio)
    .times(cohort.grossMultiple);
  return grossExitValue.times(exitRatio);
}

function calculateRecycledProceeds(params: {
  year: number;
  config: NormalizedEconomicsConfig;
  grossExitProceeds: Decimal;
  cumulativeEligibleFees: Decimal;
  recycledFeesToDate: Decimal;
  recycledToDate: Decimal;
}): { recycled: Decimal; feeRecyclingUsed: Decimal } {
  const {
    year,
    config,
    grossExitProceeds,
    cumulativeEligibleFees,
    recycledFeesToDate,
    recycledToDate,
  } = params;
  const recycling = config.recycling;
  if (!recycling.enabled || recycling.timing !== 'before_waterfall') {
    return { recycled: new Decimal(0), feeRecyclingUsed: new Decimal(0) };
  }
  if (recycling.eligibleThroughYear != null && year > recycling.eligibleThroughYear) {
    return { recycled: new Decimal(0), feeRecyclingUsed: new Decimal(0) };
  }

  const cap = config.fundSize.times(recycling.capPctOfCommitments);
  const remainingCap = Decimal.max(new Decimal(0), cap.minus(recycledToDate));
  const feePool = recycling.sources.includes('management_fees')
    ? Decimal.max(new Decimal(0), cumulativeEligibleFees.minus(recycledFeesToDate))
    : new Decimal(0);
  const exitPool = recycling.sources.includes('exit_proceeds')
    ? grossExitProceeds.times(recycling.exitProceedsRecyclePct ?? 0)
    : new Decimal(0);
  const recycled = Decimal.min(grossExitProceeds, feePool.plus(exitPool), remainingCap);
  return { recycled, feeRecyclingUsed: Decimal.min(recycled, feePool) };
}

function allocateInvestorAmount(amount: Decimal, gpShare: Decimal, gpParticipates: boolean) {
  if (!gpParticipates || gpShare.lte(0)) {
    return { lp: amount, gp: new Decimal(0) };
  }
  const gp = amount.times(gpShare);
  return { lp: amount.minus(gp), gp };
}

function allocateWaterfall(params: {
  distributableProceeds: Decimal;
  unreturnedCapital: Decimal;
  prefBalance: Decimal;
  waterfall: NormalizedEconomicsConfig['waterfall'];
  gpShare: Decimal;
  gpParticipates: boolean;
  escrowBalance: Decimal;
  isFinalYear: boolean;
}): WaterfallAllocation {
  const {
    distributableProceeds,
    unreturnedCapital,
    prefBalance,
    waterfall,
    gpShare,
    gpParticipates,
    escrowBalance,
    isFinalYear,
  } = params;

  let remaining = distributableProceeds;
  const returnedCapital = Decimal.min(remaining, unreturnedCapital);
  remaining = remaining.minus(returnedCapital);
  const capitalSplit = allocateInvestorAmount(returnedCapital, gpShare, gpParticipates);

  const prefPaid = Decimal.min(remaining, prefBalance);
  remaining = remaining.minus(prefPaid);
  const prefSplit = allocateInvestorAmount(prefPaid, gpShare, gpParticipates);

  let gpCarry = new Decimal(0);
  if (waterfall.prefCatchUp && waterfall.catchUpRate > 0 && prefPaid.gt(0)) {
    const targetPct = new Decimal(waterfall.catchUpTargetCarryPct);
    const denominator = Decimal.max(new Decimal(0.000001), new Decimal(1).minus(targetPct));
    const catchUpTarget = prefPaid.times(targetPct).div(denominator);
    const catchUpGrossNeeded = catchUpTarget.div(waterfall.catchUpRate);
    const catchUpGross = Decimal.min(remaining, catchUpGrossNeeded);
    gpCarry = gpCarry.plus(catchUpGross.times(waterfall.catchUpRate));
    const catchUpLp = catchUpGross.times(new Decimal(1).minus(waterfall.catchUpRate));
    remaining = remaining.minus(catchUpGross);
    capitalSplit.lp = capitalSplit.lp.plus(catchUpLp);
  }

  const residualCarry = remaining.times(waterfall.carryPct);
  const residualInvestorDistribution = remaining.minus(residualCarry);
  const residualSplit = allocateInvestorAmount(
    residualInvestorDistribution,
    gpShare,
    gpParticipates
  );
  gpCarry = gpCarry.plus(residualCarry);

  const gpCarryEscrowed = gpCarry.times(waterfall.escrowPct);
  const gpCarryReleasedFromEscrow = isFinalYear
    ? escrowBalance.plus(gpCarryEscrowed)
    : new Decimal(0);

  return {
    lpDistributions: capitalSplit.lp.plus(prefSplit.lp).plus(residualSplit.lp),
    gpInvestmentDistributions: capitalSplit.gp.plus(prefSplit.gp).plus(residualSplit.gp),
    gpCarryDistributed: gpCarry.minus(gpCarryEscrowed),
    gpCarryEscrowed,
    gpCarryReleasedFromEscrow,
    clawbackPaid: new Decimal(0),
    prefPaid,
    returnedCapital,
  };
}

function dateForYear(vintageYear: number, year: number): Date {
  return new Date(Date.UTC(vintageYear + year - 1, 11, 31));
}

function sumRows(rows: EconomicsAnnualRowV1[], field: keyof EconomicsAnnualRowV1): Decimal {
  return rows.reduce((total, row) => {
    const value = row[field];
    return typeof value === 'number' ? total.plus(value) : total;
  }, new Decimal(0));
}

function buildSummary(
  config: NormalizedEconomicsConfig,
  rows: EconomicsAnnualRowV1[]
): EconomicsSummaryV1 {
  const totalLpPaidIn = sumRows(rows, 'lpCapitalCalls');
  const totalGpCommitmentCalled = sumRows(rows, 'gpCommitmentCalls');
  const totalManagementFees = sumRows(rows, 'feesPaidToManager');
  const totalExpenses = sumRows(rows, 'expensesPaid');
  const totalRecycled = sumRows(rows, 'recycledProceeds');
  const totalLpDistributions = sumRows(rows, 'lpDistributions');
  const totalGpInvestmentDistributions = sumRows(rows, 'gpInvestmentDistributions');
  const totalGpCarryDistributed = sumRows(rows, 'gpCarryDistributed').plus(
    sumRows(rows, 'gpCarryReleasedFromEscrow')
  );
  const finalRow = rows[rows.length - 1];
  const finalDpi = new Decimal(finalRow?.dpi ?? 0);
  const finalRvpi = new Decimal(finalRow?.rvpi ?? 0);
  const finalTvpi = new Decimal(finalRow?.tvpi ?? 0);
  const escrowAvailable = sumRows(rows, 'gpCarryEscrowed');
  const eligibleProfit = Decimal.max(
    new Decimal(0),
    totalLpDistributions
      .plus(totalGpInvestmentDistributions)
      .plus(totalGpCarryDistributed)
      .minus(totalLpPaidIn)
      .minus(totalGpCommitmentCalled)
  );
  const targetCarry = eligibleProfit.times(config.waterfall.carryPct);
  const finalClawbackDue = config.waterfall.clawbackEnabled
    ? Decimal.max(new Decimal(0), totalGpCarryDistributed.minus(targetCarry))
    : new Decimal(0);

  const grossCashFlows: CashFlow[] = rows.map((row) => ({
    date: dateForYear(config.vintageYear, row.year),
    amount: -row.lpCapitalCalls - row.gpCommitmentCalls + row.grossExitProceeds,
  }));
  if (finalRow && finalRow.grossNav > 0) {
    grossCashFlows.push({
      date: dateForYear(config.vintageYear, finalRow.year),
      amount: finalRow.grossNav,
    });
  }

  const lpCashFlows: CashFlow[] = rows.map((row) => ({
    date: dateForYear(config.vintageYear, row.year),
    amount: -row.lpCapitalCalls + row.lpDistributions,
  }));
  if (finalRow && finalRow.lpNetNav > 0) {
    lpCashFlows.push({
      date: dateForYear(config.vintageYear, finalRow.year),
      amount: finalRow.lpNetNav,
    });
  }

  const gpCashFlows: CashFlow[] = rows.map((row) => ({
    date: dateForYear(config.vintageYear, row.year),
    amount:
      -row.gpCommitmentCalls +
      row.gpInvestmentDistributions +
      row.feesPaidToManager +
      row.gpCarryDistributed +
      row.gpCarryReleasedFromEscrow -
      row.clawbackPaid,
  }));

  return {
    grossIrr: calculateCanonicalIrr(grossCashFlows),
    lpNetIrr: calculateCanonicalIrr(lpCashFlows),
    gpNetIrr: calculateCanonicalIrr(gpCashFlows),
    totalLpPaidIn: toMoney(totalLpPaidIn),
    totalGpCommitmentCalled: toMoney(totalGpCommitmentCalled),
    totalManagementFees: toMoney(totalManagementFees),
    totalExpenses: toMoney(totalExpenses),
    totalRecycled: toMoney(totalRecycled),
    totalLpDistributions: toMoney(totalLpDistributions),
    totalGpInvestmentDistributions: toMoney(totalGpInvestmentDistributions),
    totalGpCarryDistributed: toMoney(totalGpCarryDistributed),
    totalGpFeeIncome: toMoney(totalManagementFees),
    finalDpi: toRatio(finalDpi),
    finalRvpi: toRatio(finalRvpi),
    finalTvpi: toRatio(finalTvpi),
    finalClawbackDue: toMoney(finalClawbackDue),
    maxEscrowAvailable: toMoney(escrowAvailable),
    netGpCarryAfterClawback: toMoney(totalGpCarryDistributed.minus(finalClawbackDue)),
  };
}

function validateInvariants(rows: EconomicsAnnualRowV1[]): EconomicsInvariantReportV1 {
  const tolerance = 0.01;
  const errors: EconomicsInvariantReportV1['errors'] = [];

  for (const row of rows) {
    const sources = new Decimal(row.beginningCash)
      .plus(row.lpCapitalCalls)
      .plus(row.gpCommitmentCalls)
      .plus(row.grossExitProceeds);
    const uses = new Decimal(row.investments)
      .plus(row.feesPaidToManager)
      .plus(row.expensesPaid)
      .plus(row.lpDistributions)
      .plus(row.gpInvestmentDistributions)
      .plus(row.gpCarryDistributed)
      .plus(row.gpCarryEscrowed)
      .minus(row.gpCarryReleasedFromEscrow)
      .plus(row.endingCash);
    const delta = sources.minus(uses);
    if (delta.abs().gt(tolerance)) {
      errors.push({
        year: row.year,
        code: 'PERIOD_CASH_RECONCILIATION_FAILED',
        message: 'Period cash sources and uses do not reconcile',
        delta: toMoney(delta),
      });
    }

    const distributable = new Decimal(row.grossExitProceeds).minus(row.recycledProceeds);
    const distributions = new Decimal(row.lpDistributions)
      .plus(row.gpInvestmentDistributions)
      .plus(row.gpCarryDistributed)
      .plus(row.gpCarryEscrowed)
      .minus(row.gpCarryReleasedFromEscrow);
    const distributionDelta = distributable.minus(distributions);
    if (distributionDelta.abs().gt(tolerance)) {
      errors.push({
        year: row.year,
        code: 'DISTRIBUTION_RECONCILIATION_FAILED',
        message: 'Distributable proceeds do not reconcile to distributions',
        delta: toMoney(distributionDelta),
      });
    }
  }

  return {
    passed: errors.length === 0,
    tolerance,
    errors,
  };
}

export function runEconomicsModel(input: FundDraftWriteV1): EconomicsResultV1 {
  if (!hasEconomicsAssumptions(input)) {
    throw new EconomicsInputValidationError([
      issue(['economicsAssumptions'], 'economicsAssumptions are required'),
    ]);
  }

  const config = normalizeEconomicsConfig(input);
  const totalInvestableCost = config.fundSize;
  const annualCall = config.fundSize.div(config.fundLifeYears);
  const gpShare = config.gpCommitmentPct;

  let beginningCash = new Decimal(0);
  let calledCapitalCumulative = new Decimal(0);
  let capitalReturned = new Decimal(0);
  let investedCapital = new Decimal(0);
  let unrealizedCost = new Decimal(0);
  let grossNav = new Decimal(0);
  let unreturnedCapital = new Decimal(0);
  let prefBalance = new Decimal(0);
  let gpCommitmentCalledToDate = new Decimal(0);
  let cumulativeEligibleFees = new Decimal(0);
  let recycledFeesToDate = new Decimal(0);
  let recycledToDate = new Decimal(0);
  let escrowBalance = new Decimal(0);

  const rows: EconomicsAnnualRowV1[] = [];

  for (let year = 1; year <= config.fundLifeYears; year++) {
    const totalCapitalCall = annualCall;
    const requestedGpCommitmentCall = config.gpCallSchedule
      ? config.gpCommitmentAmount.times(config.gpCallSchedule[year - 1] ?? 0)
      : totalCapitalCall.times(gpShare);
    const remainingGpCommitment = Decimal.max(
      new Decimal(0),
      config.gpCommitmentAmount.minus(gpCommitmentCalledToDate)
    );
    const gpCommitmentCalls = Decimal.min(requestedGpCommitmentCall, remainingGpCommitment);
    const lpCapitalCalls = totalCapitalCall.minus(gpCommitmentCalls);
    gpCommitmentCalledToDate = gpCommitmentCalledToDate.plus(gpCommitmentCalls);
    calledCapitalCumulative = calledCapitalCumulative.plus(totalCapitalCall);
    unreturnedCapital = unreturnedCapital.plus(totalCapitalCall);

    const feeBasisContext: FeeBasisContext = {
      committedCapital: config.fundSize,
      calledCapitalCumulative,
      calledCapitalNetOfReturns: Decimal.max(
        new Decimal(0),
        calledCapitalCumulative.minus(capitalReturned)
      ),
      investedCapital,
      fairMarketValue: grossNav,
      unrealizedCost,
    };
    const feesPaidToManager = calculateManagementFeeForYear(year, config.feeTiers, feeBasisContext);
    const expensesPaid = calculateExpenseForYear(year, config.expenses);
    cumulativeEligibleFees = cumulativeEligibleFees.plus(feesPaidToManager);

    const grossExitProceeds = calculateGrossExitProceeds(year, config, totalInvestableCost);
    const { recycled: recycledProceeds, feeRecyclingUsed } = calculateRecycledProceeds({
      year,
      config,
      grossExitProceeds,
      cumulativeEligibleFees,
      recycledFeesToDate,
      recycledToDate,
    });
    recycledFeesToDate = recycledFeesToDate.plus(feeRecyclingUsed);
    recycledToDate = recycledToDate.plus(recycledProceeds);

    const distributableProceeds = grossExitProceeds.minus(recycledProceeds);
    const prefAccrualBase =
      config.waterfall.prefType === 'compounded'
        ? unreturnedCapital.plus(prefBalance)
        : unreturnedCapital;
    const prefAccrual =
      config.waterfall.prefType === 'none'
        ? new Decimal(0)
        : prefAccrualBase.times(config.waterfall.hurdleRate);
    prefBalance = prefBalance.plus(prefAccrual);

    const waterfall = allocateWaterfall({
      distributableProceeds,
      unreturnedCapital,
      prefBalance,
      waterfall: config.waterfall,
      gpShare,
      gpParticipates: config.gpParticipatesInInvestmentReturns,
      escrowBalance,
      isFinalYear: year === config.fundLifeYears,
    });
    unreturnedCapital = Decimal.max(
      new Decimal(0),
      unreturnedCapital.minus(waterfall.returnedCapital)
    );
    prefBalance = Decimal.max(new Decimal(0), prefBalance.minus(waterfall.prefPaid));
    capitalReturned = capitalReturned.plus(waterfall.returnedCapital);
    escrowBalance = escrowBalance
      .plus(waterfall.gpCarryEscrowed)
      .minus(waterfall.gpCarryReleasedFromEscrow);

    const investments = Decimal.max(
      new Decimal(0),
      beginningCash
        .plus(totalCapitalCall)
        .plus(recycledProceeds)
        .minus(feesPaidToManager)
        .minus(expensesPaid)
    );
    investedCapital = investedCapital.plus(investments);

    const costExited =
      config.exitModel.mode === 'cohort' && config.exitModel.cohort?.grossMultiple
        ? grossExitProceeds.div(Math.max(config.exitModel.cohort.grossMultiple, 0.000001))
        : grossExitProceeds;
    unrealizedCost = Decimal.max(
      new Decimal(0),
      unrealizedCost.plus(investments).minus(costExited)
    );
    grossNav = Decimal.max(new Decimal(0), grossNav.plus(investments).minus(costExited));

    const endingCash = new Decimal(0);
    const sourceTotal = beginningCash.plus(totalCapitalCall).plus(grossExitProceeds);
    const useTotal = investments
      .plus(feesPaidToManager)
      .plus(expensesPaid)
      .plus(waterfall.lpDistributions)
      .plus(waterfall.gpInvestmentDistributions)
      .plus(waterfall.gpCarryDistributed)
      .plus(waterfall.gpCarryEscrowed)
      .minus(waterfall.gpCarryReleasedFromEscrow)
      .plus(endingCash);
    const conservationDelta = sourceTotal.minus(useTotal);

    const cumulativeLpPaidIn = rows.reduce(
      (total, row) => total.plus(row.lpCapitalCalls),
      lpCapitalCalls
    );
    const cumulativeLpDistributions = rows.reduce(
      (total, row) => total.plus(row.lpDistributions),
      waterfall.lpDistributions
    );
    const lpNetNav = grossNav.times(new Decimal(1).minus(gpShare));
    const dpi = cumulativeLpPaidIn.gt(0)
      ? cumulativeLpDistributions.div(cumulativeLpPaidIn)
      : new Decimal(0);
    const rvpi = cumulativeLpPaidIn.gt(0) ? lpNetNav.div(cumulativeLpPaidIn) : new Decimal(0);

    rows.push({
      year,
      lpCapitalCalls: toMoney(lpCapitalCalls),
      gpCommitmentCalls: toMoney(gpCommitmentCalls),
      grossExitProceeds: toMoney(grossExitProceeds),
      beginningCash: toMoney(beginningCash),
      investments: toMoney(investments),
      feesPaidToManager: toMoney(feesPaidToManager),
      expensesPaid: toMoney(expensesPaid),
      recycledProceeds: toMoney(recycledProceeds),
      endingCash: toMoney(endingCash),
      lpDistributions: toMoney(waterfall.lpDistributions),
      gpInvestmentDistributions: toMoney(waterfall.gpInvestmentDistributions),
      gpCarryDistributed: toMoney(waterfall.gpCarryDistributed),
      gpCarryEscrowed: toMoney(waterfall.gpCarryEscrowed),
      gpCarryReleasedFromEscrow: toMoney(waterfall.gpCarryReleasedFromEscrow),
      clawbackPaid: toMoney(waterfall.clawbackPaid),
      grossNav: toMoney(grossNav),
      lpNetNav: toMoney(lpNetNav),
      dpi: toRatio(dpi),
      rvpi: toRatio(rvpi),
      tvpi: toRatio(dpi.plus(rvpi)),
      conservationDelta: toMoney(conservationDelta),
    });

    beginningCash = endingCash;
  }

  const checks = validateInvariants(rows);
  if (!checks.passed) {
    throw new EconomicsInvariantError(checks);
  }

  return {
    version: 'v1',
    annual: rows,
    summary: buildSummary(config, rows),
    checks,
  };
}
