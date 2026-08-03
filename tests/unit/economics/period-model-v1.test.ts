import { describe, expect, it } from 'vitest';
import { Decimal } from '@shared/lib/decimal-config';
import {
  CANONICAL_ECONOMICS_ACCRUAL_GRAIN,
  ECONOMICS_PERIOD_MODEL_VERSION,
  EconomicsPeriodModelV1Error,
  EconomicsPeriodSeriesV1Schema,
} from '@shared/contracts/economics-period-v1.contract';
import {
  addDaysV1,
  addMonthsV1,
  aggregateEconomicsPeriodRowsV1,
  buildEconomicsPeriodSeriesV1,
  monthsPerPeriodV1,
  periodRateV1,
} from '@shared/lib/economics/period-model-v1';

describe('economics canonical period model V1', () => {
  it('declares monthly as the authoritative accrual grain', () => {
    expect(CANONICAL_ECONOMICS_ACCRUAL_GRAIN).toBe('monthly');
    expect(monthsPerPeriodV1('monthly')).toBe(1);
    expect(monthsPerPeriodV1('quarterly')).toBe(3);
    expect(monthsPerPeriodV1('annual')).toBe(12);
  });

  describe('period dating', () => {
    it('builds contiguous anniversary-based monthly periods', () => {
      const series = buildEconomicsPeriodSeriesV1({
        anchorDate: '2026-01-01',
        grain: 'monthly',
        horizonMonths: 12,
      });

      expect(series.version).toBe(ECONOMICS_PERIOD_MODEL_VERSION);
      expect(series.periods).toHaveLength(12);
      expect(series.periods[0]).toMatchObject({
        index: 1,
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
        dayCount: 31,
        partial: false,
      });
      expect(series.periods[1]).toMatchObject({
        periodStart: '2026-02-01',
        periodEnd: '2026-02-28',
      });
      expect(series.periods[11]).toMatchObject({
        periodStart: '2026-12-01',
        periodEnd: '2026-12-31',
      });
      expect(EconomicsPeriodSeriesV1Schema.parse(series)).toEqual(series);
    });

    it('anchors periods on a non-calendar term start date', () => {
      const series = buildEconomicsPeriodSeriesV1({
        anchorDate: '2026-04-15',
        grain: 'quarterly',
        horizonMonths: 6,
      });

      expect(series.periods).toHaveLength(2);
      expect(series.periods[0]).toMatchObject({
        periodStart: '2026-04-15',
        periodEnd: '2026-07-14',
      });
      expect(series.periods[1]).toMatchObject({
        periodStart: '2026-07-15',
        periodEnd: '2026-10-14',
      });
    });

    it('clamps an end-of-month anchor to short months', () => {
      expect(addMonthsV1('2026-01-31', 1)).toBe('2026-02-28');
      expect(addMonthsV1('2024-01-31', 1)).toBe('2024-02-29');
      expect(addMonthsV1('2026-01-31', 12)).toBe('2027-01-31');
    });

    it('never emits overlapping or gapped periods', () => {
      const series = buildEconomicsPeriodSeriesV1({
        anchorDate: '2026-01-31',
        grain: 'monthly',
        horizonMonths: 14,
      });

      series.periods.slice(1).forEach((period, offset) => {
        const previous = series.periods[offset]!;
        expect(period.periodStart).toBe(addDaysV1(previous.periodEnd, 1));
      });
    });
  });

  describe('partial-period behaviour', () => {
    it('marks a short trailing period and prorates it by canonical months', () => {
      const series = buildEconomicsPeriodSeriesV1({
        anchorDate: '2026-01-01',
        grain: 'quarterly',
        horizonMonths: 4,
      });

      expect(series.periods).toHaveLength(2);
      expect(series.periods[0]).toMatchObject({
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
        partial: false,
        prorationFactor: '1',
        yearFraction: '0.25',
      });

      const trailing = series.periods[1]!;
      expect(trailing).toMatchObject({
        periodStart: '2026-04-01',
        periodEnd: '2026-04-30',
        partial: true,
      });
      // One canonical month of a three-month grain, whatever the day counts say.
      expect(trailing.monthsCovered).toBe(1);
      expect(Number(trailing.prorationFactor)).toBeCloseTo(1 / 3, 20);
      expect(Number(trailing.yearFraction)).toBeCloseTo(1 / 12, 20);
      // Day counts are reported but do not prorate: April is 30 days inside a
      // 91-day Q2 (2026-04-01 to 2026-06-30).
      expect(trailing.dayCount).toBe(30);
      expect(trailing.fullPeriodDayCount).toBe(91);
    });

    it('prorates a stub identically whichever grain reports it', () => {
      const annualStub = buildEconomicsPeriodSeriesV1({
        anchorDate: '2036-01-01',
        grain: 'annual',
        horizonMonths: 6,
      }).periods[0]!;
      const monthlyStub = buildEconomicsPeriodSeriesV1({
        anchorDate: '2036-01-01',
        grain: 'monthly',
        horizonMonths: 6,
      }).periods;

      const monthlyYearFraction = monthlyStub.reduce(
        (total, period) => total.plus(period.yearFraction),
        new Decimal(0)
      );
      // 1/12 does not terminate in decimal, so summing twelfths leaves a
      // residue at the 28th significant digit. That is 22 orders of magnitude
      // below the 6 dp canonical money scale.
      expect(monthlyYearFraction.toDecimalPlaces(25).toString()).toBe(annualStub.yearFraction);
      expect(annualStub.yearFraction).toBe('0.5');
    });

    it('reports a full period as unprorated regardless of month length', () => {
      const series = buildEconomicsPeriodSeriesV1({
        anchorDate: '2026-01-01',
        grain: 'monthly',
        horizonMonths: 3,
      });

      series.periods.forEach((period) => {
        expect(period.partial).toBe(false);
        expect(period.prorationFactor).toBe('1');
        expect(Number(period.yearFraction)).toBeCloseTo(1 / 12, 12);
      });
    });

    it('rejects a non-positive horizon', () => {
      expect(() =>
        buildEconomicsPeriodSeriesV1({
          anchorDate: '2026-01-01',
          grain: 'monthly',
          horizonMonths: 0,
        })
      ).toThrowError(EconomicsPeriodModelV1Error);
    });

    it('rejects an unparseable anchor date', () => {
      expect(() =>
        buildEconomicsPeriodSeriesV1({
          anchorDate: '2026-02-30',
          grain: 'monthly',
          horizonMonths: 12,
        })
      ).toThrowError(EconomicsPeriodModelV1Error);
    });
  });

  describe('rate application', () => {
    const annual = buildEconomicsPeriodSeriesV1({
      anchorDate: '2026-01-01',
      grain: 'annual',
      horizonMonths: 12,
    }).periods[0]!;
    const months = buildEconomicsPeriodSeriesV1({
      anchorDate: '2026-01-01',
      grain: 'monthly',
      horizonMonths: 12,
    }).periods;

    it('applies a simple rate pro rata over the year fraction', () => {
      expect(periodRateV1('0.02', annual, 'simple').toString()).toBe('0.02');
      const monthlySum = months.reduce(
        (total, period) => total.plus(periodRateV1('0.02', period, 'simple')),
        periodRateV1('0', annual, 'simple')
      );
      expect(monthlySum.toDecimalPlaces(20).toString()).toBe('0.02');
    });

    it('keeps compounded accrual grain-invariant', () => {
      const compoundedMonthly = months.reduce(
        (factor, period) => factor.times(periodRateV1('0.08', period, 'compounded').plus(1)),
        periodRateV1('0', annual, 'simple').plus(1)
      );
      expect(compoundedMonthly.minus(1).toDecimalPlaces(18).toString()).toBe(
        periodRateV1('0.08', annual, 'compounded').toDecimalPlaces(18).toString()
      );
    });

    it('prorates a partial period rate by its year fraction', () => {
      const partial = buildEconomicsPeriodSeriesV1({
        anchorDate: '2026-01-01',
        grain: 'annual',
        horizonMonths: 6,
      }).periods[0]!;

      expect(partial.partial).toBe(true);
      expect(Number(periodRateV1('0.02', partial, 'simple').toString())).toBeCloseTo(
        0.02 * Number(partial.yearFraction),
        15
      );
    });
  });

  describe('aggregation', () => {
    const series = buildEconomicsPeriodSeriesV1({
      anchorDate: '2026-01-01',
      grain: 'monthly',
      horizonMonths: 12,
    });
    const rows = series.periods.map((period, offset) => ({
      managementFees: '100',
      beginningCash: String(offset * 10),
      grossNav: String((offset + 1) * 1000),
      dpi: '0.5',
      periodEnd: period.periodEnd,
    }));
    const fields = {
      managementFees: 'flow',
      beginningCash: 'stock_start',
      grossNav: 'stock_end',
    } as const;

    it('sums flows, keeps boundary stocks, and regroups to annual', () => {
      const groups = aggregateEconomicsPeriodRowsV1({
        series,
        rows,
        targetGrain: 'annual',
        fields,
      });

      expect(groups).toHaveLength(1);
      expect(groups[0]?.period).toMatchObject({
        grain: 'annual',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        partial: false,
      });
      expect(groups[0]?.sourceIndices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      expect(groups[0]?.values).toEqual({
        managementFees: '1200',
        beginningCash: '0',
        grossNav: '12000',
      });
    });

    it('regroups to quarterly with the same flow total as annual', () => {
      const quarters = aggregateEconomicsPeriodRowsV1({
        series,
        rows,
        targetGrain: 'quarterly',
        fields,
      });

      expect(quarters).toHaveLength(4);
      expect(quarters.map((group) => group.values.managementFees)).toEqual([
        '300',
        '300',
        '300',
        '300',
      ]);
      expect(quarters[0]?.period.periodEnd).toBe('2026-03-31');
      expect(quarters[3]?.values.grossNav).toBe('12000');
    });

    it('is a no-op when the target grain equals the source grain', () => {
      const groups = aggregateEconomicsPeriodRowsV1({
        series,
        rows,
        targetGrain: 'monthly',
        fields,
      });

      expect(groups).toHaveLength(12);
      expect(groups[5]?.values.managementFees).toBe('100');
    });

    it('emits a partial trailing group when the source does not fill the target', () => {
      const shortSeries = buildEconomicsPeriodSeriesV1({
        anchorDate: '2026-01-01',
        grain: 'monthly',
        horizonMonths: 14,
      });
      const shortRows = shortSeries.periods.map(() => ({
        managementFees: '100',
        beginningCash: '0',
        grossNav: '1000',
      }));

      const groups = aggregateEconomicsPeriodRowsV1({
        series: shortSeries,
        rows: shortRows,
        targetGrain: 'annual',
        fields,
      });

      expect(groups).toHaveLength(2);
      expect(groups[1]?.period.partial).toBe(true);
      expect(groups[1]?.values.managementFees).toBe('200');
      expect(groups[1]?.sourceIndices).toEqual([12, 13]);
    });

    it('refuses to aggregate a ratio field', () => {
      expect(() =>
        aggregateEconomicsPeriodRowsV1({
          series,
          rows,
          targetGrain: 'annual',
          fields: { ...fields, dpi: 'ratio_derived' },
        })
      ).toThrowError(
        expect.objectContaining({ code: 'RATIO_AGGREGATION_FORBIDDEN' }) as unknown as Error
      );
    });

    it('refuses to split a coarse grain into a finer one', () => {
      const annualSeries = buildEconomicsPeriodSeriesV1({
        anchorDate: '2026-01-01',
        grain: 'annual',
        horizonMonths: 12,
      });

      expect(() =>
        aggregateEconomicsPeriodRowsV1({
          series: annualSeries,
          rows: [{ managementFees: '1200', beginningCash: '0', grossNav: '1000' }],
          targetGrain: 'monthly',
          fields,
        })
      ).toThrowError(
        expect.objectContaining({ code: 'GRAIN_DOWNSCALE_FORBIDDEN' }) as unknown as Error
      );
    });

    it('refuses a row count that does not match the series', () => {
      expect(() =>
        aggregateEconomicsPeriodRowsV1({
          series,
          rows: rows.slice(0, 5),
          targetGrain: 'annual',
          fields,
        })
      ).toThrowError(
        expect.objectContaining({ code: 'PERIOD_ROW_COUNT_MISMATCH' }) as unknown as Error
      );
    });

    it('refuses a field that is absent from every row', () => {
      expect(() =>
        aggregateEconomicsPeriodRowsV1({
          series,
          rows,
          targetGrain: 'annual',
          fields: { ...fields, missingField: 'flow' },
        })
      ).toThrowError(
        expect.objectContaining({ code: 'UNKNOWN_AGGREGATION_FIELD' }) as unknown as Error
      );
    });
  });
});
