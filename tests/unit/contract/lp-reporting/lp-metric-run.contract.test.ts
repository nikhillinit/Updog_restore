/**
 * Contract tests for LpMetricRunCreateSchema (LP Reporting Phase 0.3).
 */
import { describe, expect, it } from 'vitest';

import {
  LpMetricRunCreateSchema,
  LpMetricRunPerspectiveSchema,
  LpMetricRunStatusSchema,
  LpMetricRunTypeSchema,
} from '@shared/contracts/lp-reporting/lp-metric-run.contract';

const happyPath = {
  fundId: 1,
  asOfDate: '2026-03-31',
  runType: 'quarterly_report' as const,
  perspective: 'lp_net' as const,
  inputsHash: 'abc123def456',
  methodologyVersion: 'v1.0.0',
  calculationVersion: 'v1.0.0',
  resultsJson: { dpi: 0.5 },
};

describe('LpMetricRunCreateSchema -- round-trip', () => {
  it('accepts a minimal happy path', () => {
    expect(() => LpMetricRunCreateSchema.parse(happyPath)).not.toThrow();
  });

  it('accepts populated source ID arrays', () => {
    expect(() =>
      LpMetricRunCreateSchema.parse({
        ...happyPath,
        sourceEventIds: [1, 2, 3],
        sourceMarkIds: [10],
        sourceEvidenceIds: [],
      })
    ).not.toThrow();
  });

  it('resultsJson accepts arbitrary unknown shape (Phase 1 fills the schema)', () => {
    expect(() =>
      LpMetricRunCreateSchema.parse({
        ...happyPath,
        resultsJson: { whatever: ['anything', 1, true, null, { nested: true }] },
      })
    ).not.toThrow();
  });

  it('diagnosticsJson is optional', () => {
    const parsed = LpMetricRunCreateSchema.parse({
      ...happyPath,
      diagnosticsJson: { warnings: ['none'] },
    });
    expect(parsed.diagnosticsJson).toEqual({ warnings: ['none'] });
  });
});

describe('.strict() rejects unknown top-level keys', () => {
  it('rejects bogus key', () => {
    expect(() => LpMetricRunCreateSchema.parse({ ...happyPath, bogus: 'x' })).toThrow();
  });
});

describe('Enum coverage', () => {
  it.each(['quarterly_report', 'fundraise_pack', 'internal_review', 'lp_update'])(
    'accepts LpMetricRunTypeSchema value %s',
    (v) => {
      expect(() => LpMetricRunTypeSchema.parse(v)).not.toThrow();
    }
  );

  it('rejects an unknown run type', () => {
    expect(() => LpMetricRunTypeSchema.parse('drive_by_estimate')).toThrow();
  });

  it.each(['lp_net', 'fund_gross', 'vehicle'])(
    'accepts LpMetricRunPerspectiveSchema value %s',
    (v) => {
      expect(() => LpMetricRunPerspectiveSchema.parse(v)).not.toThrow();
    }
  );

  it('rejects an unknown perspective', () => {
    expect(() => LpMetricRunPerspectiveSchema.parse('company')).toThrow();
  });

  it.each(['draft', 'approved', 'locked', 'exported', 'superseded'])(
    'accepts LpMetricRunStatusSchema value %s',
    (v) => {
      expect(() => LpMetricRunStatusSchema.parse(v)).not.toThrow();
    }
  );

  it('rejects an unknown status', () => {
    expect(() => LpMetricRunStatusSchema.parse('pending')).toThrow();
  });
});

describe('Source ID arrays default to empty', () => {
  it('all three default to []', () => {
    const parsed = LpMetricRunCreateSchema.parse(happyPath);
    expect(parsed.sourceEventIds).toEqual([]);
    expect(parsed.sourceMarkIds).toEqual([]);
    expect(parsed.sourceEvidenceIds).toEqual([]);
  });

  it('rejects negative IDs in source arrays', () => {
    expect(() =>
      LpMetricRunCreateSchema.parse({
        ...happyPath,
        sourceEventIds: [-1],
      })
    ).toThrow();
  });

  it('rejects non-integer IDs in source arrays', () => {
    expect(() =>
      LpMetricRunCreateSchema.parse({
        ...happyPath,
        sourceMarkIds: [1.5],
      })
    ).toThrow();
  });
});

describe('Required fields', () => {
  it('rejects missing inputsHash', () => {
    const { inputsHash: _omit, ...rest } = happyPath;
    expect(() => LpMetricRunCreateSchema.parse(rest)).toThrow();
  });

  it('rejects missing methodologyVersion', () => {
    const { methodologyVersion: _omit, ...rest } = happyPath;
    expect(() => LpMetricRunCreateSchema.parse(rest)).toThrow();
  });

  it('rejects missing calculationVersion', () => {
    const { calculationVersion: _omit, ...rest } = happyPath;
    expect(() => LpMetricRunCreateSchema.parse(rest)).toThrow();
  });

  it('status defaults to draft', () => {
    const parsed = LpMetricRunCreateSchema.parse(happyPath);
    expect(parsed.status).toBe('draft');
  });
});
