import { describe, expect, it } from 'vitest';

import {
  ANALYSIS_PERIOD_KINDS,
  ANALYSIS_REFERENCE_CONTRACT_VERSION,
  AnalysisBasisSchema,
  AnalysisDraftSaveRequestSchema,
  AnalysisDraftV1Schema,
  AnalysisPeriodSchema,
  AnalysisReferenceV1Schema,
  MIXED_FACTS_BASIS,
  QuarterlyDraftRunRequestSchema,
  enumerateDueQuarterlyPeriods,
  isCalendarQuarterPeriod,
  previousQuarter,
  quarterOf,
  quarterPeriod,
  quarterlyDedupeKey,
} from '../../../../shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract';

const BASIS = {
  financialFactsSnapshotId: 41,
  knowledgeCutoff: '2026-07-02T00:00:00.000Z',
  forecastFundSnapshotId: 902,
  reserveReferenceId: null,
  economicsReferenceId: null,
};

const Q2_2026 = {
  periodKind: 'quarterly' as const,
  periodStart: '2026-04-01',
  periodEnd: '2026-06-30',
};

describe('analysis reference snapshot v1 contract', () => {
  it('pins the contract version and error code', () => {
    expect(ANALYSIS_REFERENCE_CONTRACT_VERSION).toBe('analysis-reference-snapshot-v1');
    expect(MIXED_FACTS_BASIS).toBe('MIXED_FACTS_BASIS');
    expect(ANALYSIS_PERIOD_KINDS).toEqual(['quarterly', 'manual']);
  });

  describe('calendar quarter helpers', () => {
    it('derives inclusive UTC bounds for every quarter', () => {
      expect(quarterPeriod(2026, 1)).toEqual({
        periodKind: 'quarterly',
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
      });
      expect(quarterPeriod(2026, 2)).toEqual({
        periodKind: 'quarterly',
        periodStart: '2026-04-01',
        periodEnd: '2026-06-30',
      });
      expect(quarterPeriod(2026, 3)).toEqual({
        periodKind: 'quarterly',
        periodStart: '2026-07-01',
        periodEnd: '2026-09-30',
      });
      expect(quarterPeriod(2026, 4)).toEqual({
        periodKind: 'quarterly',
        periodStart: '2026-10-01',
        periodEnd: '2026-12-31',
      });
    });

    it('handles the leap-year Q1 boundary', () => {
      expect(quarterPeriod(2028, 1).periodEnd).toBe('2028-03-31');
      expect(quarterPeriod(2024, 1).periodEnd).toBe('2024-03-31');
    });

    it('rejects an out-of-range quarter', () => {
      expect(() => quarterPeriod(2026, 5)).toThrow(RangeError);
      expect(() => quarterPeriod(2026, 0)).toThrow(RangeError);
    });

    it('locates the quarter containing a UTC instant', () => {
      expect(quarterOf(new Date('2026-07-27T12:00:00.000Z'))).toEqual({ year: 2026, quarter: 3 });
      expect(quarterOf(new Date('2026-01-01T00:00:00.000Z'))).toEqual({ year: 2026, quarter: 1 });
      expect(quarterOf(new Date('2026-12-31T23:59:59.999Z'))).toEqual({ year: 2026, quarter: 4 });
    });

    it('rolls the year backwards at Q1', () => {
      expect(previousQuarter(2026, 1)).toEqual({ year: 2025, quarter: 4 });
      expect(previousQuarter(2026, 3)).toEqual({ year: 2026, quarter: 2 });
    });

    it('recognises exact calendar quarters and nothing else', () => {
      expect(isCalendarQuarterPeriod('2026-04-01', '2026-06-30')).toBe(true);
      expect(isCalendarQuarterPeriod('2026-04-01', '2026-06-29')).toBe(false);
      expect(isCalendarQuarterPeriod('2026-05-01', '2026-07-31')).toBe(false);
      expect(isCalendarQuarterPeriod('2026-04-02', '2026-06-30')).toBe(false);
    });
  });

  describe('quarterlyDedupeKey', () => {
    it('is fund-scoped and period-scoped', () => {
      expect(quarterlyDedupeKey(7, '2026-04-01', '2026-06-30')).toBe(
        'quarterly:7:2026-04-01:2026-06-30'
      );
    });

    it('separates funds and periods so replay cannot collide across them', () => {
      const a = quarterlyDedupeKey(7, '2026-04-01', '2026-06-30');
      const b = quarterlyDedupeKey(8, '2026-04-01', '2026-06-30');
      const c = quarterlyDedupeKey(7, '2026-01-01', '2026-03-31');
      expect(new Set([a, b, c]).size).toBe(3);
    });
  });

  describe('enumerateDueQuarterlyPeriods', () => {
    it('returns the immediately preceding quarter on the first UTC day after quarter-end', () => {
      expect(enumerateDueQuarterlyPeriods(new Date('2026-07-01T00:00:00.000Z'), 30)).toEqual([
        Q2_2026,
      ]);
    });

    it('returns nothing on the last day of the quarter -- it is not yet due', () => {
      expect(enumerateDueQuarterlyPeriods(new Date('2026-06-30T23:59:59.999Z'), 30)).toEqual([]);
    });

    it('still returns the period later in the catch-up window', () => {
      expect(enumerateDueQuarterlyPeriods(new Date('2026-07-30T00:00:00.000Z'), 30)).toEqual([
        Q2_2026,
      ]);
    });

    it('drops a period once it falls outside the catch-up bound', () => {
      expect(enumerateDueQuarterlyPeriods(new Date('2026-07-31T00:00:00.000Z'), 30)).toEqual([]);
    });

    it('enumerates ALL past-due periods oldest-first, not just the latest (D5)', () => {
      const periods = enumerateDueQuarterlyPeriods(new Date('2026-07-27T00:00:00.000Z'), 400);

      expect(periods.length).toBeGreaterThan(1);
      expect(periods[0]).toEqual(quarterPeriod(2025, 2));
      expect(periods[periods.length - 1]).toEqual(Q2_2026);

      const starts = periods.map((period) => period.periodStart);
      expect([...starts].sort()).toEqual(starts);
    });

    it('never returns a period whose quarter has not ended', () => {
      const now = new Date('2026-07-27T00:00:00.000Z');
      for (const period of enumerateDueQuarterlyPeriods(now, 3650)) {
        expect(Date.parse(`${period.periodEnd}T00:00:00.000Z`)).toBeLessThan(now.getTime());
      }
    });

    it('is independent of the host timezone offset within the same UTC day', () => {
      const early = enumerateDueQuarterlyPeriods(new Date('2026-07-01T00:00:00.000Z'), 30);
      const late = enumerateDueQuarterlyPeriods(new Date('2026-07-01T23:59:59.999Z'), 30);
      expect(early).toEqual(late);
    });

    it('rejects a non-positive catch-up bound', () => {
      expect(() => enumerateDueQuarterlyPeriods(new Date('2026-07-01T00:00:00.000Z'), 0)).toThrow(
        RangeError
      );
    });
  });

  describe('AnalysisPeriodSchema', () => {
    it('accepts an exact calendar quarter', () => {
      expect(AnalysisPeriodSchema.parse(Q2_2026)).toEqual(Q2_2026);
    });

    it('rejects a quarterly period that is not a calendar quarter', () => {
      const result = AnalysisPeriodSchema.safeParse({
        periodKind: 'quarterly',
        periodStart: '2026-04-01',
        periodEnd: '2026-07-31',
      });
      expect(result.success).toBe(false);
    });

    it('allows an arbitrary manual period', () => {
      const manual = { periodKind: 'manual', periodStart: '2026-04-15', periodEnd: '2026-05-14' };
      expect(AnalysisPeriodSchema.parse(manual)).toEqual(manual);
    });

    it('rejects an inverted period regardless of kind', () => {
      expect(
        AnalysisPeriodSchema.safeParse({
          periodKind: 'manual',
          periodStart: '2026-05-14',
          periodEnd: '2026-04-15',
        }).success
      ).toBe(false);
    });
  });

  describe('AnalysisBasisSchema', () => {
    it('accepts null reserve and economics pins (Waves E/F are optional)', () => {
      expect(AnalysisBasisSchema.parse(BASIS)).toEqual(BASIS);
    });

    it('accepts a null forecast pin', () => {
      expect(
        AnalysisBasisSchema.parse({ ...BASIS, forecastFundSnapshotId: null }).forecastFundSnapshotId
      ).toBeNull();
    });

    it('requires a facts snapshot -- it is the anchor of the one basis', () => {
      const { financialFactsSnapshotId: _omitted, ...withoutAnchor } = BASIS;
      expect(AnalysisBasisSchema.safeParse(withoutAnchor).success).toBe(false);
    });

    it('rejects unknown keys', () => {
      expect(AnalysisBasisSchema.safeParse({ ...BASIS, extra: 1 }).success).toBe(false);
    });
  });

  describe('draft and reference records', () => {
    const draft = {
      contractVersion: ANALYSIS_REFERENCE_CONTRACT_VERSION,
      draftId: 3,
      fundId: 7,
      period: Q2_2026,
      basis: BASIS,
      sourceReferenceId: null,
      savedAt: null,
      version: 1,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    };

    const reference = {
      contractVersion: ANALYSIS_REFERENCE_CONTRACT_VERSION,
      referenceId: 11,
      fundId: 7,
      period: Q2_2026,
      basis: BASIS,
      mixedBasisAtSave: false,
      supersedesReferenceId: null,
      sourceDraftId: 3,
      createdBy: 5,
      createdAt: '2026-07-02T00:00:00.000Z',
    };

    it('round-trips a draft', () => {
      expect(AnalysisDraftV1Schema.parse(draft)).toEqual(draft);
    });

    it('round-trips a reference and its supersession lineage', () => {
      expect(AnalysisReferenceV1Schema.parse(reference)).toEqual(reference);
      expect(
        AnalysisReferenceV1Schema.parse({
          ...reference,
          referenceId: 12,
          supersedesReferenceId: 11,
        }).supersedesReferenceId
      ).toBe(11);
    });

    it('carries mixedBasisAtSave so the warning can render on every load (R34-d)', () => {
      expect(
        AnalysisReferenceV1Schema.parse({ ...reference, mixedBasisAtSave: true }).mixedBasisAtSave
      ).toBe(true);
    });

    it('has no approval, recipient, or export field', () => {
      const referenceKeys = Object.keys(AnalysisReferenceV1Schema.shape);
      const draftKeys = Object.keys(AnalysisDraftV1Schema.shape);
      for (const forbidden of ['approvedBy', 'approvedAt', 'status', 'recipients', 'exportedAt']) {
        expect(referenceKeys).not.toContain(forbidden);
        expect(draftKeys).not.toContain(forbidden);
      }
    });
  });

  describe('request schemas', () => {
    it('defaults the mixed-basis override to off', () => {
      expect(AnalysisDraftSaveRequestSchema.parse({})).toEqual({ acknowledgeMixedBasis: false });
    });

    it('accepts an explicit mixed-basis acknowledgement', () => {
      expect(AnalysisDraftSaveRequestSchema.parse({ acknowledgeMixedBasis: true })).toEqual({
        acknowledgeMixedBasis: true,
      });
    });

    it('accepts an empty admin trigger body', () => {
      expect(QuarterlyDraftRunRequestSchema.parse({})).toEqual({});
    });

    it('requires both period bounds together on the admin trigger', () => {
      expect(QuarterlyDraftRunRequestSchema.safeParse({ periodStart: '2026-04-01' }).success).toBe(
        false
      );
    });

    it('refuses an explicit period combined with a lookback', () => {
      expect(
        QuarterlyDraftRunRequestSchema.safeParse({
          periodStart: '2026-04-01',
          periodEnd: '2026-06-30',
          catchupDays: 90,
        }).success
      ).toBe(false);
    });
  });
});
