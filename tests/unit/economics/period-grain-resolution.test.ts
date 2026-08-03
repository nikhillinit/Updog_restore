/**
 * period-grain-resolution.test.ts
 *
 * Truth cases for ADR-066 (annual versus monthly economics period
 * resolution).
 *
 * Three properties are proven here:
 *
 *   1. Grain invariance - accruing on the canonical monthly grid gives the
 *      same amount as accruing quarterly or annually, so a reporting-grain
 *      change cannot move a served number.
 *   2. Convention sensitivity - the rejected nominal convention (annual rate
 *      divided by 12, then compounded monthly) does move served numbers. The
 *      difference is quantified in the before/after fixture.
 *   3. Composition - the canonical grid anchored on 1 January reproduces
 *      exact calendar quarters, so the existing quarterly waterfall truth
 *      cases sit on the canonical grid unchanged.
 */

import { describe, expect, it } from 'vitest';
import type { FundDraftWriteV1 } from '@shared/contracts/fund-draft-write-v1.contract';
import { Decimal } from '@shared/lib/decimal-config';
import { isExactCalendarQuarterV1 } from '@shared/contracts/internal-economics/effective-fee-expense-bridge-v1.contract';
import { buildEconomicsPeriodSeriesV1, periodRateV1 } from '@shared/lib/economics/period-model-v1';
import { runEconomicsModel } from '@shared/lib/economics/economics-engine';
import fixture from '../../fixtures/economics/period-grain-before-after.json';

const ANCHOR = '2026-01-01';
const COMMITTED_CAPITAL = new Decimal('100000000');
const UNRETURNED_CAPITAL = new Decimal('50000000');
const FEE_RATE = '0.02';
const HURDLE_RATE = '0.08';

function seriesFor(grain: 'monthly' | 'quarterly' | 'annual', horizonMonths: number) {
  return buildEconomicsPeriodSeriesV1({ anchorDate: ANCHOR, grain, horizonMonths });
}

/** Chosen convention: simple fee accrual at the canonical effective rate. */
function accrueFees(grain: 'monthly' | 'quarterly' | 'annual', horizonMonths: number): Decimal {
  return seriesFor(grain, horizonMonths).periods.reduce(
    (total, period) =>
      total.plus(COMMITTED_CAPITAL.times(periodRateV1(FEE_RATE, period, 'simple'))),
    new Decimal(0)
  );
}

/** Chosen convention: compounded preferred return at the canonical effective rate. */
function accruePref(grain: 'monthly' | 'quarterly' | 'annual', horizonMonths: number): Decimal {
  const balance = seriesFor(grain, horizonMonths).periods.reduce(
    (running, period) => running.times(periodRateV1(HURDLE_RATE, period, 'compounded').plus(1)),
    UNRETURNED_CAPITAL
  );
  return balance.minus(UNRETURNED_CAPITAL);
}

/** Rejected convention: nominal annual rate divided by periods, compounded. */
function accruePrefNominal(periodsPerYear: number, years: number): Decimal {
  const periodRate = new Decimal(HURDLE_RATE).div(periodsPerYear);
  return UNRETURNED_CAPITAL.times(periodRate.plus(1).pow(periodsPerYear * years)).minus(
    UNRETURNED_CAPITAL
  );
}

function money(value: Decimal): string {
  return value.toDecimalPlaces(2).toString();
}

describe('economics period grain resolution (ADR-066)', () => {
  describe('grain invariance of the chosen convention', () => {
    it('accrues the same management fee at every grain over a whole year', () => {
      const annual = accrueFees('annual', 12);
      expect(money(annual)).toBe('2000000');
      expect(money(accrueFees('quarterly', 12))).toBe('2000000');
      expect(money(accrueFees('monthly', 12))).toBe('2000000');
    });

    it('accrues the same management fee at every grain over a fund life', () => {
      const annual = accrueFees('annual', 120);
      expect(money(annual)).toBe('20000000');
      expect(money(accrueFees('quarterly', 120))).toBe('20000000');
      expect(money(accrueFees('monthly', 120))).toBe('20000000');
    });

    it('accrues the same compounded preferred return at every grain', () => {
      expect(money(accruePref('annual', 12))).toBe('4000000');
      expect(money(accruePref('quarterly', 12))).toBe('4000000');
      expect(money(accruePref('monthly', 12))).toBe('4000000');
    });

    it('keeps multi-year compounded preferred return grain-invariant', () => {
      const annual = accruePref('annual', 60);
      expect(money(accruePref('quarterly', 60))).toBe(money(annual));
      expect(money(accruePref('monthly', 60))).toBe(money(annual));
    });
  });

  describe('partial-period behaviour', () => {
    it('accrues a half-year stub at half the annual fee', () => {
      // 2026-2035 is 10 whole years; the stub covers 2036-01-01 to 2036-06-30.
      const stub = accrueFees('annual', 126).minus(accrueFees('annual', 120));
      expect(money(stub)).toBe(fixture.partialPeriod.stubFeeUsd);
    });

    it('agrees on the stub amount whichever grain accrues it', () => {
      const annualStub = accrueFees('annual', 126).minus(accrueFees('annual', 120));
      const monthlyStub = accrueFees('monthly', 126).minus(accrueFees('monthly', 120));
      const quarterlyStub = accrueFees('quarterly', 126).minus(accrueFees('quarterly', 120));
      expect(money(monthlyStub)).toBe(money(annualStub));
      expect(money(quarterlyStub)).toBe(money(annualStub));
    });

    it('records what day-count proration would have served instead', () => {
      const stub = accrueFees('annual', 126).minus(accrueFees('annual', 120));
      const dayCountStub = COMMITTED_CAPITAL.times('0.02').times(182).div(366);
      expect(money(dayCountStub)).toBe(fixture.partialPeriod.rejectedDayCountStubFeeUsd);
      expect(money(stub.minus(dayCountStub))).toBe(fixture.partialPeriod.differenceUsd);
    });
  });

  describe('quantified difference against the rejected nominal convention', () => {
    it('matches the recorded one-year preferred-return difference', () => {
      const chosen = accruePref('monthly', 12);
      const rejected = accruePrefNominal(12, 1);
      expect(money(chosen)).toBe(fixture.prefOneYear.chosenUsd);
      expect(money(rejected)).toBe(fixture.prefOneYear.rejectedNominalMonthlyUsd);
      expect(money(rejected.minus(chosen))).toBe(fixture.prefOneYear.differenceUsd);
    });

    it('matches the recorded ten-year preferred-return difference', () => {
      const chosen = accruePref('monthly', 120);
      const rejected = accruePrefNominal(12, 10);
      expect(money(chosen)).toBe(fixture.prefTenYears.chosenUsd);
      expect(money(rejected)).toBe(fixture.prefTenYears.rejectedNominalMonthlyUsd);
      expect(money(rejected.minus(chosen))).toBe(fixture.prefTenYears.differenceUsd);
    });

    it('shows the quarterly nominal convention drifting less but still drifting', () => {
      const chosen = accruePref('quarterly', 12);
      const rejected = accruePrefNominal(4, 1);
      expect(money(rejected.minus(chosen))).toBe(fixture.prefOneYearQuarterly.differenceUsd);
      expect(new Decimal(fixture.prefOneYearQuarterly.differenceUsd).gt(0)).toBe(true);
    });
  });

  describe('composition with the existing quarterly grid', () => {
    it('reproduces exact calendar quarters from a 1 January anchor', () => {
      const quarters = buildEconomicsPeriodSeriesV1({
        anchorDate: '2026-01-01',
        grain: 'quarterly',
        horizonMonths: 12,
      }).periods;

      expect(quarters.map((period) => [period.periodStart, period.periodEnd])).toEqual([
        ['2026-01-01', '2026-03-31'],
        ['2026-04-01', '2026-06-30'],
        ['2026-07-01', '2026-09-30'],
        ['2026-10-01', '2026-12-31'],
      ]);
      quarters.forEach((period) => {
        expect(isExactCalendarQuarterV1(period.periodStart, period.periodEnd)).toBe(true);
      });
    });

    it('covers each calendar quarter with exactly three canonical months', () => {
      const months = buildEconomicsPeriodSeriesV1({
        anchorDate: '2026-01-01',
        grain: 'monthly',
        horizonMonths: 12,
      }).periods;
      const quarters = buildEconomicsPeriodSeriesV1({
        anchorDate: '2026-01-01',
        grain: 'quarterly',
        horizonMonths: 12,
      }).periods;

      quarters.forEach((quarter, index) => {
        const covering = months.slice(index * 3, index * 3 + 3);
        expect(covering).toHaveLength(3);
        expect(covering[0]!.periodStart).toBe(quarter.periodStart);
        expect(covering[2]!.periodEnd).toBe(quarter.periodEnd);
      });
    });
  });

  describe('served economics rows', () => {
    it('dates every annual row with canonical period bounds', () => {
      const result = runEconomicsModel(draftForGrainProof());

      expect(result.annual[0]?.periodStart).toBe('2026-01-01');
      expect(result.annual[0]?.periodEnd).toBe('2026-12-31');
      expect(result.annual.at(-1)?.periodEnd).toBe('2035-12-31');
      result.annual.forEach((row, offset) => {
        expect(row.periodStart).toBe(`${2026 + offset}-01-01`);
      });
    });

    it('serves the recorded baseline amounts unchanged', () => {
      const result = runEconomicsModel(draftForGrainProof());

      expect(result.annual[0]?.feesPaidToManager).toBe(fixture.servedBaseline.year1FeesUsd);
      expect(result.summary.totalManagementFees).toBe(
        fixture.servedBaseline.totalManagementFeesUsd
      );
      expect(result.summary.totalLpDistributions).toBe(
        fixture.servedBaseline.totalLpDistributionsUsd
      );
      expect(result.summary.finalTvpi).toBe(fixture.servedBaseline.finalTvpi);
      expect(result.checks.passed).toBe(true);
    });
  });
});

function draftForGrainProof(): FundDraftWriteV1 {
  return {
    fundName: 'Grain Proof Fund',
    fundSize: 100_000_000,
    vintageYear: 2026,
    fundLife: 10,
    investmentPeriod: 5,
    economicsAssumptions: {
      version: 'v1',
      timeline: { fundLifeYears: 10, period: 'annual', vintageYear: 2026 },
      feeModel: {
        source: 'economics_override',
        tiers: [
          {
            id: 'fee-1',
            name: 'Management fee',
            rate: 0.02,
            basis: 'committed_capital',
            startYear: 1,
          },
        ],
      },
      expenseModel: { source: 'economics_override', annualExpenses: [] },
      exitModel: {
        mode: 'cohort',
        cohort: {
          exitDistributionByYear: [0, 0, 0, 0, 0, 0.1, 0.2, 0.2, 0.2, 0.3],
          grossMultiple: 3,
          lossRatio: 0.3,
        },
      },
      waterfallModel: {
        type: 'american',
        carryPct: 0.2,
        hurdleRate: 0.08,
        prefType: 'compounded',
        prefCompounding: 'annual',
        prefCatchUp: true,
        catchUpRate: 1,
        catchUpTargetCarryPct: 0.2,
        clawbackEnabled: true,
        clawbackTrigger: 'final_liquidation',
        escrowPct: 0,
        feeOffsetTreatment: 'none',
      },
    },
  } as FundDraftWriteV1;
}
