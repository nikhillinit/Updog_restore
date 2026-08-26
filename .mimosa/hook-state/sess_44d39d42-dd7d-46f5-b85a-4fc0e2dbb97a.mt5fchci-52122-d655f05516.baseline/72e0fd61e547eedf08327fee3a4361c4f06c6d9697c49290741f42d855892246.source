import type { CurrentForecastSeriesPointV1 } from '../../contracts/current-forecast-v2.contract';
import type { PersistedTerminalResolutionV1 } from '../../contracts/internal-economics/terminal-policy-v1.contract';
import {
  persistedTerminalResolutionFromPolicyV1,
  resolveTerminalPeriodEndV1,
  validatePersistedTerminalResolutionV1,
} from '../../contracts/internal-economics/terminal-policy-v1.contract';
import { Decimal } from '../decimal-config';
import {
  MoneyDecimalStringSchema,
  RatioDecimalStringSchema,
  toFixedDecimalString,
} from '../decimal-string';
import { calculateGuardedRatios } from './ratio-null-guard-v1';

export const INTERNAL_ECONOMICS_CASH_ASSEMBLY_VERSION =
  'internal-economics-cash-assembly/1.0.0' as const;

export interface CashAssemblyEngineStateV1 {
  readonly openingCashUsd: Decimal;
  readonly cumulativeLpCapitalCallsUsd: Decimal;
  readonly cumulativeGpCommitmentCallsUsd: Decimal;
  readonly cumulativePortfolioDeploymentsUsd: Decimal;
  readonly cumulativeManagementFeesUsd: Decimal;
  readonly cumulativeFundExpensesUsd: Decimal;
  readonly cumulativeGrossRealizedProceedsUsd: Decimal;
  readonly cumulativeLpDistributionsUsd: Decimal;
  readonly cumulativeGpInvestmentDistributionsUsd: Decimal;
  readonly cumulativeGpCarryDistributionsUsd: Decimal;
  readonly unfundedEnvelopeRemainingUsd: Decimal;
}

export interface CreateCashAssemblyEngineStateV1Input {
  readonly openingCashUsd: Decimal;
  readonly unfundedEnvelopeRemainingUsd: Decimal;
}

export interface CashAssemblyQuarterInputV1 {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly source: 'actual' | 'projected';
  readonly openingCashUsd: Decimal;
  readonly lpCapitalCallUsd: Decimal;
  readonly gpCommitmentCallUsd: Decimal;
  readonly portfolioDeploymentUsd: Decimal;
  readonly managementFeesUsd: Decimal;
  readonly fundExpensesUsd: Decimal;
  readonly grossRealizedProceedsUsd: Decimal;
  readonly lpDistributionUsd: Decimal;
  readonly gpInvestmentDistributionUsd: Decimal;
  readonly gpCarryDistributedUsd: Decimal;
  readonly endingCashUsd: Decimal;
  readonly grossNavUsd: Decimal;
  readonly lpNetNavUsd: Decimal;
  readonly cumulativeLpPaidInUsd: Decimal;
  readonly cumulativeLpDistributedUsd: Decimal;
}

export interface CashAssemblyQuarterRowV1 {
  periodStart: string;
  periodEnd: string;
  source: 'actual' | 'projected';
  openingCashUsd: string;
  lpCapitalCallUsd: string;
  gpCommitmentCallUsd: string;
  portfolioDeploymentUsd: string;
  managementFeesUsd: string;
  fundExpensesUsd: string;
  grossRealizedProceedsUsd: string;
  lpDistributionUsd: string;
  gpInvestmentDistributionUsd: string;
  gpCarryDistributedUsd: string;
  endingCashUsd: string;
  grossNavUsd: string;
  lpNetNavUsd: string;
  cumulativeLpPaidInUsd: string;
  cumulativeLpDistributedUsd: string;
  dpi: string | null;
  rvpi: string | null;
  tvpi: string | null;
}

export interface CashAssemblyPeriodV1 {
  periodStart: string;
  periodEnd: string;
  source: 'actual' | 'projected';
}

export interface BuildCashAssemblyPeriodGridV1Input {
  readonly forecastSeries: readonly CurrentForecastSeriesPointV1[];
  readonly persistedTerminalResolution: PersistedTerminalResolutionV1;
}

export interface ResolveCashAssemblyTerminalPeriodV1Input {
  readonly termStartDate: string;
  readonly fundLifeYears: string;
}

function zeroMoney(): Decimal {
  return new Decimal(0);
}

function formatMoney(value: Decimal): string {
  return MoneyDecimalStringSchema.parse(toFixedDecimalString(value, 6));
}

function formatRatio(value: Decimal | null): string | null {
  return value === null ? null : RatioDecimalStringSchema.parse(toFixedDecimalString(value, 12));
}

export function createCashAssemblyEngineStateV1(
  input: CreateCashAssemblyEngineStateV1Input
): CashAssemblyEngineStateV1 {
  return {
    openingCashUsd: input.openingCashUsd,
    cumulativeLpCapitalCallsUsd: zeroMoney(),
    cumulativeGpCommitmentCallsUsd: zeroMoney(),
    cumulativePortfolioDeploymentsUsd: zeroMoney(),
    cumulativeManagementFeesUsd: zeroMoney(),
    cumulativeFundExpensesUsd: zeroMoney(),
    cumulativeGrossRealizedProceedsUsd: zeroMoney(),
    cumulativeLpDistributionsUsd: zeroMoney(),
    cumulativeGpInvestmentDistributionsUsd: zeroMoney(),
    cumulativeGpCarryDistributionsUsd: zeroMoney(),
    unfundedEnvelopeRemainingUsd: input.unfundedEnvelopeRemainingUsd,
  };
}

export function buildCashAssemblyQuarterRowV1(
  input: CashAssemblyQuarterInputV1
): CashAssemblyQuarterRowV1 {
  const ratios = calculateGuardedRatios(
    input.cumulativeLpDistributedUsd,
    input.lpNetNavUsd,
    input.cumulativeLpPaidInUsd
  );

  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    source: input.source,
    openingCashUsd: formatMoney(input.openingCashUsd),
    lpCapitalCallUsd: formatMoney(input.lpCapitalCallUsd),
    gpCommitmentCallUsd: formatMoney(input.gpCommitmentCallUsd),
    portfolioDeploymentUsd: formatMoney(input.portfolioDeploymentUsd),
    managementFeesUsd: formatMoney(input.managementFeesUsd),
    fundExpensesUsd: formatMoney(input.fundExpensesUsd),
    grossRealizedProceedsUsd: formatMoney(input.grossRealizedProceedsUsd),
    lpDistributionUsd: formatMoney(input.lpDistributionUsd),
    gpInvestmentDistributionUsd: formatMoney(input.gpInvestmentDistributionUsd),
    gpCarryDistributedUsd: formatMoney(input.gpCarryDistributedUsd),
    endingCashUsd: formatMoney(input.endingCashUsd),
    grossNavUsd: formatMoney(input.grossNavUsd),
    lpNetNavUsd: formatMoney(input.lpNetNavUsd),
    cumulativeLpPaidInUsd: formatMoney(input.cumulativeLpPaidInUsd),
    cumulativeLpDistributedUsd: formatMoney(input.cumulativeLpDistributedUsd),
    dpi: ratios.dpi === null ? null : formatRatio(new Decimal(ratios.dpi)),
    rvpi: ratios.rvpi === null ? null : formatRatio(new Decimal(ratios.rvpi)),
    tvpi: ratios.tvpi === null ? null : formatRatio(new Decimal(ratios.tvpi)),
  };
}

export function resolveCashAssemblyTerminalPeriodV1(
  input: ResolveCashAssemblyTerminalPeriodV1Input
): PersistedTerminalResolutionV1 {
  return persistedTerminalResolutionFromPolicyV1(resolveTerminalPeriodEndV1(input));
}

export function buildCashAssemblyPeriodGridV1(
  input: BuildCashAssemblyPeriodGridV1Input
): CashAssemblyPeriodV1[] {
  const terminalResolution = validatePersistedTerminalResolutionV1({
    persisted: input.persistedTerminalResolution,
    forecastPeriodEnds: input.forecastSeries.map((point) => point.periodEnd),
  });

  return input.forecastSeries
    .filter((point) => point.periodEnd <= terminalResolution.terminalPeriodEnd)
    .map(({ periodStart, periodEnd, source }) => ({ periodStart, periodEnd, source }))
    .sort(
      (left, right) =>
        left.periodEnd.localeCompare(right.periodEnd) ||
        left.periodStart.localeCompare(right.periodStart) ||
        left.source.localeCompare(right.source)
    );
}
