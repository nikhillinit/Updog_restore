import { describe, expect, it } from 'vitest';

import type { CurrentForecastSeriesPointV1 } from '../../../shared/contracts/current-forecast-v2.contract';
import {
  INTERNAL_ECONOMICS_TERMINAL_RESOLUTION_VERSION,
  TerminalPolicyV1Error,
} from '../../../shared/contracts/internal-economics/terminal-policy-v1.contract';
import { Decimal } from '../../../shared/lib/decimal-config';
import {
  MoneyDecimalStringSchema,
  RatioDecimalStringSchema,
} from '../../../shared/lib/decimal-string';
import {
  INTERNAL_ECONOMICS_CASH_ASSEMBLY_VERSION,
  buildCashAssemblyPeriodGridV1,
  buildCashAssemblyQuarterRowV1,
  createCashAssemblyEngineStateV1,
  resolveCashAssemblyTerminalPeriodV1,
} from '../../../shared/lib/internal-economics/cash-assembly-types-v1';

const ZERO_MONEY = '0.000000';
const ZERO_RATIO = '0.000000000000';
const persistedTerminalResolution = {
  terminalPeriodEnd: '2026-03-31',
  terminalResolutionMethodologyVersion: INTERNAL_ECONOMICS_TERMINAL_RESOLUTION_VERSION,
} as const;

function forecastPoint(
  periodStart: string,
  periodEnd: string,
  source: 'actual' | 'projected'
): CurrentForecastSeriesPointV1 {
  return {
    periodStart,
    periodEnd,
    source,
    deployedUsd: ZERO_MONEY,
    contributionsUsd: ZERO_MONEY,
    distributionsUsd: ZERO_MONEY,
    navUsd: ZERO_MONEY,
    tvpi: ZERO_RATIO,
    dpi: ZERO_RATIO,
    activeCompanyCount: 0,
    projectedCohortCount: 0,
  };
}

describe('cash assembly engine types v1', () => {
  it('exports the frozen engine version', () => {
    expect(INTERNAL_ECONOMICS_CASH_ASSEMBLY_VERSION).toBe('internal-economics-cash-assembly/1.0.0');
  });

  it('creates a Decimal-native engine state with zeroed cumulative accounts', () => {
    const state = createCashAssemblyEngineStateV1({
      openingCashUsd: new Decimal('12.345678901234'),
      unfundedEnvelopeRemainingUsd: new Decimal('987.654321098765'),
    });

    expect(state.openingCashUsd.toString()).toBe('12.345678901234');
    expect(state.unfundedEnvelopeRemainingUsd.toString()).toBe('987.654321098765');

    for (const value of Object.values(state)) {
      expect(Decimal.isDecimal(value)).toBe(true);
    }

    expect(state.cumulativeLpCapitalCallsUsd.isZero()).toBe(true);
    expect(state.cumulativeGpCommitmentCallsUsd.isZero()).toBe(true);
    expect(state.cumulativePortfolioDeploymentsUsd.isZero()).toBe(true);
    expect(state.cumulativeManagementFeesUsd.isZero()).toBe(true);
    expect(state.cumulativeFundExpensesUsd.isZero()).toBe(true);
    expect(state.cumulativeGrossRealizedProceedsUsd.isZero()).toBe(true);
    expect(state.cumulativeLpDistributionsUsd.isZero()).toBe(true);
    expect(state.cumulativeGpInvestmentDistributionsUsd.isZero()).toBe(true);
    expect(state.cumulativeGpCarryDistributionsUsd.isZero()).toBe(true);
  });

  it('builds the exact D9 quarterly row with canonical output scales', () => {
    const row = buildCashAssemblyQuarterRowV1({
      periodStart: '2026-01-01',
      periodEnd: '2026-03-31',
      source: 'projected',
      openingCashUsd: new Decimal('1.2345674'),
      lpCapitalCallUsd: new Decimal('2'),
      gpCommitmentCallUsd: new Decimal('0'),
      portfolioDeploymentUsd: new Decimal('0.25'),
      managementFeesUsd: new Decimal('0.125'),
      fundExpensesUsd: new Decimal('0.0625'),
      grossRealizedProceedsUsd: new Decimal('4'),
      lpDistributionUsd: new Decimal('3'),
      gpInvestmentDistributionUsd: new Decimal('0'),
      gpCarryDistributedUsd: new Decimal('0.8'),
      endingCashUsd: new Decimal('3.9970674'),
      grossNavUsd: new Decimal('10'),
      lpNetNavUsd: new Decimal('9.5'),
      cumulativeLpPaidInUsd: new Decimal('2'),
      cumulativeLpDistributedUsd: new Decimal('3'),
    });

    expect(Object.keys(row)).toEqual([
      'periodStart',
      'periodEnd',
      'source',
      'openingCashUsd',
      'lpCapitalCallUsd',
      'gpCommitmentCallUsd',
      'portfolioDeploymentUsd',
      'managementFeesUsd',
      'fundExpensesUsd',
      'grossRealizedProceedsUsd',
      'lpDistributionUsd',
      'gpInvestmentDistributionUsd',
      'gpCarryDistributedUsd',
      'endingCashUsd',
      'grossNavUsd',
      'lpNetNavUsd',
      'cumulativeLpPaidInUsd',
      'cumulativeLpDistributedUsd',
      'dpi',
      'rvpi',
      'tvpi',
    ]);
    expect(row.openingCashUsd).toBe('1.234567');

    for (const [key, value] of Object.entries(row)) {
      if (key.endsWith('Usd')) {
        expect(MoneyDecimalStringSchema.safeParse(value).success, key).toBe(true);
      }
    }
    for (const value of [row.dpi, row.rvpi, row.tvpi]) {
      expect(RatioDecimalStringSchema.safeParse(value).success).toBe(true);
    }
  });

  it('preserves nullable D9 ratios before positive LP paid-in', () => {
    const row = buildCashAssemblyQuarterRowV1({
      periodStart: '2026-01-01',
      periodEnd: '2026-03-31',
      source: 'actual',
      openingCashUsd: new Decimal(0),
      lpCapitalCallUsd: new Decimal(0),
      gpCommitmentCallUsd: new Decimal(0),
      portfolioDeploymentUsd: new Decimal(0),
      managementFeesUsd: new Decimal(0),
      fundExpensesUsd: new Decimal(0),
      grossRealizedProceedsUsd: new Decimal(0),
      lpDistributionUsd: new Decimal(0),
      gpInvestmentDistributionUsd: new Decimal(0),
      gpCarryDistributedUsd: new Decimal(0),
      endingCashUsd: new Decimal(0),
      grossNavUsd: new Decimal(0),
      lpNetNavUsd: new Decimal(0),
      cumulativeLpPaidInUsd: new Decimal(0),
      cumulativeLpDistributedUsd: new Decimal(0),
    });

    expect(row).toMatchObject({ dpi: null, rvpi: null, tvpi: null });
  });
});

describe('cash assembly period grid v1', () => {
  it('sorts the pinned forecast series and truncates it at the resolved terminal period', () => {
    const grid = buildCashAssemblyPeriodGridV1({
      forecastSeries: [
        forecastPoint('2026-04-01', '2026-06-30', 'projected'),
        forecastPoint('2025-10-01', '2025-12-31', 'actual'),
        forecastPoint('2026-01-01', '2026-03-31', 'projected'),
      ],
      persistedTerminalResolution,
    });

    expect(grid).toEqual([
      {
        periodStart: '2025-10-01',
        periodEnd: '2025-12-31',
        source: 'actual',
      },
      {
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
        source: 'projected',
      },
    ]);
  });

  it('rejects a forecast ending before the terminal period with the typed error', () => {
    const action = () =>
      buildCashAssemblyPeriodGridV1({
        forecastSeries: [forecastPoint('2025-10-01', '2025-12-31', 'projected')],
        persistedTerminalResolution,
      });

    expect(action).toThrowError(TerminalPolicyV1Error);
    expect(action).toThrowError(expect.objectContaining({ code: 'FORECAST_HORIZON_SHORT' }));
  });

  it('rejects a forecast that crosses the terminal period without an exact point', () => {
    const action = () =>
      buildCashAssemblyPeriodGridV1({
        forecastSeries: [
          forecastPoint('2025-10-01', '2025-12-31', 'projected'),
          forecastPoint('2026-04-01', '2026-06-30', 'projected'),
        ],
        persistedTerminalResolution,
      });

    expect(action).toThrowError(TerminalPolicyV1Error);
    expect(action).toThrowError(
      expect.objectContaining({ code: 'FORECAST_TERMINAL_PERIOD_UNREPRESENTABLE' })
    );
  });

  it('rejects a duplicate exact terminal point as unrepresentable', () => {
    const action = () =>
      buildCashAssemblyPeriodGridV1({
        forecastSeries: [
          forecastPoint('2026-01-01', '2026-03-31', 'projected'),
          forecastPoint('2026-01-01', '2026-03-31', 'projected'),
        ],
        persistedTerminalResolution,
      });

    expect(action).toThrowError(TerminalPolicyV1Error);
    expect(action).toThrowError(
      expect.objectContaining({ code: 'FORECAST_TERMINAL_PERIOD_UNREPRESENTABLE' })
    );
  });

  it('rejects a fund life that cannot resolve to whole calendar quarters', () => {
    const action = () =>
      resolveCashAssemblyTerminalPeriodV1({
        termStartDate: '2025-03-31',
        fundLifeYears: '1.1',
      });

    expect(action).toThrowError(TerminalPolicyV1Error);
    expect(action).toThrowError(
      expect.objectContaining({ code: 'FUND_LIFE_GRID_UNREPRESENTABLE' })
    );
  });
});
