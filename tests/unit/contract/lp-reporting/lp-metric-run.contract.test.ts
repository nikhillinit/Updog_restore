/**
 * Contract tests for LpMetricRunCreateSchema (LP Reporting Phase 0.3,
 * with Phase 1.1 locked resultsJson + diagnosticsJson shapes).
 */
import { describe, expect, it } from 'vitest';

import {
  LpMetricRunCreateSchema,
  LpMetricRunPerspectiveSchema,
  LpMetricRunStatusSchema,
  LpMetricRunTypeSchema,
  LatestMetricRunResponseSchema,
  MetricRunApproveRequestSchema,
  MetricRunCommitRequestSchema,
  MetricRunCommitResponseSchema,
  MetricRunDetailResponseSchema,
  MetricRunDryRunRequestSchema,
  MetricRunDryRunResponseSchema,
  MetricRunLifecycleResponseSchema,
  MetricRunLockRequestSchema,
  type LpMetricRunResults,
  type XirrDiagnostic,
} from '@shared/contracts/lp-reporting/lp-metric-run.contract';

const validXirrDiagnostic: XirrDiagnostic = {
  convergence: 'converged',
  iterations: 8,
  method: 'newton',
  boundHit: null,
  failureReason: null,
};

const validResults: LpMetricRunResults = {
  asOfDate: '2026-03-31',
  currency: 'USD',
  dpi: '0.500000',
  rvpi: '1.250000',
  tvpi: '1.750000',
  moic: '1.750000',
  netIrr: '0.148700',
  grossIrr: '0.182300',
  xirrDiagnostic: { net: validXirrDiagnostic, gross: validXirrDiagnostic },
  contributionsTotal: '10000000.000000',
  distributionsTotal: '5000000.000000',
  currentNav: '12500000.000000',
  markConfidenceMix: { high: 5, medium: 2, low: 1 },
};

const happyPath = {
  fundId: 1,
  asOfDate: '2026-03-31',
  runType: 'quarterly_report' as const,
  perspective: 'lp_net' as const,
  inputsHash: 'abc123def456',
  methodologyVersion: 'v1.0.0',
  calculationVersion: 'v1.0.0',
  resultsJson: validResults,
};

const validDiagnostics = {
  engineVersion: 'lp-reporting-engine@1.1.0',
  decimalPrecision: 6,
  excludedFutureMarks: [],
  warnings: [],
};

const hex64 = 'a'.repeat(64);

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

  it('resultsJson rejects arbitrary unknown shape (Phase 1.1 locked the schema)', () => {
    expect(() =>
      LpMetricRunCreateSchema.parse({
        ...happyPath,
        resultsJson: { whatever: ['anything', 1, true, null, { nested: true }] },
      })
    ).toThrow();
  });

  it('diagnosticsJson is optional and conforms to LpMetricRunDiagnosticsSchema', () => {
    const parsed = LpMetricRunCreateSchema.parse({
      ...happyPath,
      diagnosticsJson: {
        engineVersion: 'lp-reporting-engine@1.1.0',
        decimalPrecision: 6,
      },
    });
    expect(parsed.diagnosticsJson?.engineVersion).toBe('lp-reporting-engine@1.1.0');
    expect(parsed.diagnosticsJson?.warnings).toEqual([]);
  });
});

describe('Metric-run dry-run and commit endpoint contracts', () => {
  it('parses a strict dry-run request', () => {
    const parsed = MetricRunDryRunRequestSchema.parse({
      asOfDate: '2026-03-31',
      runType: 'quarterly_report',
      perspective: 'lp_net',
      sourceEventIds: [2, 1],
      sourceMarkIds: [10],
    });

    expect(parsed.sourceEventIds).toEqual([2, 1]);
    expect(parsed.sourceMarkIds).toEqual([10]);
    expect(parsed.sourceMarkSelection).toBe('explicit');
  });

  it('accepts active_as_of only when sourceMarkIds is empty', () => {
    const parsed = MetricRunDryRunRequestSchema.parse({
      asOfDate: '2026-03-31',
      runType: 'quarterly_report',
      perspective: 'lp_net',
      sourceMarkSelection: 'active_as_of',
    });

    expect(parsed.sourceMarkSelection).toBe('active_as_of');
    expect(parsed.sourceMarkIds).toEqual([]);
  });

  it('rejects active_as_of with explicit sourceMarkIds', () => {
    expect(() =>
      MetricRunDryRunRequestSchema.parse({
        asOfDate: '2026-03-31',
        runType: 'quarterly_report',
        perspective: 'lp_net',
        sourceMarkSelection: 'active_as_of',
        sourceMarkIds: [10],
      })
    ).toThrow(/sourceMarkIds must be empty/);
  });

  it('dry-run response wrapper requires results, diagnostics, inputsHash, runType, and previewHash', () => {
    const parsed = MetricRunDryRunResponseSchema.parse({
      results: validResults,
      diagnostics: validDiagnostics,
      inputsHash: hex64,
      runType: 'quarterly_report',
      previewHash: hex64,
    });

    expect(parsed.previewHash).toBe(hex64);
    expect(parsed.inputsHash).toBe(hex64);
  });

  it('commit request requires the original request fields plus previewHash', () => {
    const parsed = MetricRunCommitRequestSchema.parse({
      asOfDate: '2026-03-31',
      runType: 'quarterly_report',
      perspective: 'fund_gross',
      sourceEventIds: [],
      sourceMarkIds: [],
      previewHash: hex64,
    });

    expect(parsed.previewHash).toBe(hex64);
  });

  it('commit request rejects client-submitted results, diagnostics, and generatedBy', () => {
    expect(() =>
      MetricRunCommitRequestSchema.parse({
        asOfDate: '2026-03-31',
        runType: 'quarterly_report',
        perspective: 'lp_net',
        previewHash: hex64,
        results: validResults,
      })
    ).toThrow();

    expect(() =>
      MetricRunCommitRequestSchema.parse({
        asOfDate: '2026-03-31',
        runType: 'quarterly_report',
        perspective: 'lp_net',
        previewHash: hex64,
        diagnostics: validDiagnostics,
      })
    ).toThrow();

    expect(() =>
      MetricRunCommitRequestSchema.parse({
        asOfDate: '2026-03-31',
        runType: 'quarterly_report',
        perspective: 'lp_net',
        previewHash: hex64,
        generatedBy: 7,
      })
    ).toThrow();
  });

  it('commit response distinguishes inserted and idempotent existing rows', () => {
    const inserted = MetricRunCommitResponseSchema.parse({
      metricRunId: 10,
      status: 'draft',
      inputsHash: hex64,
      previewHash: hex64,
      inserted: true,
    });
    const existing = MetricRunCommitResponseSchema.parse({
      metricRunId: 10,
      status: 'draft',
      inputsHash: hex64,
      previewHash: hex64,
      inserted: false,
    });

    expect(inserted.inserted).toBe(true);
    expect(existing.inserted).toBe(false);
  });

  it('rejects unknown write-path keys', () => {
    expect(() =>
      MetricRunCommitResponseSchema.parse({
        metricRunId: 10,
        status: 'draft',
        inputsHash: hex64,
        previewHash: hex64,
        inserted: true,
        unexpected: true,
      })
    ).toThrow();
  });
});

describe('Metric-run lifecycle endpoint contracts', () => {
  const detail = {
    metricRunId: 17,
    fundId: 7,
    asOfDate: '2026-03-31',
    runType: 'quarterly_report',
    perspective: 'lp_net',
    status: 'draft',
    inputsHash: hex64,
    sourceEventIds: [1, 2],
    sourceMarkIds: [10],
    sourceEvidenceIds: [],
    evidenceCount: 0,
    generatedBy: 7,
    approvedBy: null,
    approvedAt: null,
    lockedBy: null,
    lockedAt: null,
    exportedAt: null,
    version: 1,
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
  };

  it('approve request requires a positive expectedVersion and rejects unknown keys', () => {
    expect(MetricRunApproveRequestSchema.parse({ expectedVersion: 1 })).toEqual({
      expectedVersion: 1,
    });
    expect(() => MetricRunApproveRequestSchema.parse({ expectedVersion: 0 })).toThrow();
    expect(() =>
      MetricRunApproveRequestSchema.parse({ expectedVersion: 1, status: 'draft' })
    ).toThrow();
  });

  it('lock request requires a positive expectedVersion and rejects unknown keys', () => {
    expect(MetricRunLockRequestSchema.parse({ expectedVersion: 2 })).toEqual({
      expectedVersion: 2,
    });
    expect(() => MetricRunLockRequestSchema.parse({ expectedVersion: -1 })).toThrow();
    expect(() => MetricRunLockRequestSchema.parse({ expectedVersion: 2, lockedBy: 7 })).toThrow();
  });

  it('detail response includes lifecycle fields and evidence snapshot fields', () => {
    const parsed = MetricRunDetailResponseSchema.parse({
      ...detail,
      status: 'approved',
      sourceEvidenceIds: [1000],
      evidenceCount: 1,
      approvedBy: 7,
      approvedAt: '2026-05-10T01:00:00.000Z',
      version: 2,
    });

    expect(parsed.sourceEvidenceIds).toEqual([1000]);
    expect(parsed.evidenceCount).toBe(1);
    expect(parsed.version).toBe(2);
    expect(parsed.lockedBy).toBeNull();
  });

  it('lifecycle response wraps detail plus changed flag', () => {
    const parsed = MetricRunLifecycleResponseSchema.parse({
      metricRun: detail,
      changed: true,
    });

    expect(parsed.metricRun.metricRunId).toBe(17);
    expect(parsed.changed).toBe(true);
  });

  it('latest response accepts null and strict detail payloads', () => {
    expect(LatestMetricRunResponseSchema.parse({ metricRun: null })).toEqual({
      metricRun: null,
    });
    expect(LatestMetricRunResponseSchema.parse({ metricRun: detail }).metricRun?.version).toBe(1);
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
