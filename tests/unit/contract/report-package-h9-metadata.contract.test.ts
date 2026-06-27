import { describe, expect, it } from 'vitest';
import {
  ReportPackageH9MetadataSchema,
  ReportPackageRecordSchema,
} from '@shared/contracts/lp-reporting/lp-report-package.contract';

const h9 = {
  moicSourceInputHash: 'a'.repeat(64),
  roundEvidenceInputHash: 'b'.repeat(64),
  roundEvidenceAssumptionsHash: 'c'.repeat(64),
  fingerprintHash: 'd'.repeat(64),
  policyVersion: 'h9-policy-v1',
  actionabilityStatus: 'actionable' as const,
};

const validXirrDiagnostic = {
  convergence: 'converged',
  iterations: 5,
  method: 'newton',
  boundHit: null,
  failureReason: null,
} as const;

const baseRecord = {
  reportPackageId: 1,
  fundId: 7,
  metricRunId: 3,
  status: 'assembled' as const,
  asOfDate: '2026-06-01',
  metricRunVersion: 1,
  metricRunLockedBy: 1,
  metricRunLockedAt: '2026-06-01T00:00:00.000Z',
  narrativeRefs: [],
  payload: {
    payloadVersion: 1 as const,
    results: {
      asOfDate: '2026-03-31',
      currency: 'USD',
      dpi: '0.450000',
      rvpi: '1.250000',
      tvpi: '1.700000',
      moic: '1.700000',
      netIrr: '0.150000',
      grossIrr: '0.180000',
      xirrDiagnostic: { net: validXirrDiagnostic, gross: validXirrDiagnostic },
      contributionsTotal: '50000000.000000',
      distributionsTotal: '22500000.000000',
      currentNav: '62500000.000000',
      markConfidenceMix: { high: 8, medium: 3, low: 1 },
    },
    diagnostics: {
      engineVersion: 'lp-reporting-engine@1.2.0',
      decimalPrecision: 6,
      excludedFutureMarks: [900],
      warnings: [{ code: 'LOW_CONFIDENCE_MARKS', message: 'One low-confidence mark.' }],
    },
    sourceEventIds: [],
    sourceMarkIds: [],
    evidenceRecordIds: [],
    narratives: [],
  },
  assembledBy: 1,
  assembledAt: '2026-06-01T00:00:00.000Z',
  version: 1,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

describe('ReportPackageH9MetadataSchema', () => {
  it('accepts a full H9 metadata object', () => {
    expect(ReportPackageH9MetadataSchema.parse(h9)).toEqual(h9);
  });

  it('rejects an unknown actionability status', () => {
    expect(() =>
      ReportPackageH9MetadataSchema.parse({ ...h9, actionabilityStatus: 'bogus' })
    ).toThrow();
  });
});

describe('ReportPackageRecordSchema h9Metadata', () => {
  it('accepts a record with null h9Metadata (legacy)', () => {
    const r = ReportPackageRecordSchema.parse({ ...baseRecord, h9Metadata: null });
    expect(r.h9Metadata).toBeNull();
  });

  it('accepts a record with full h9Metadata', () => {
    const r = ReportPackageRecordSchema.parse({ ...baseRecord, h9Metadata: h9 });
    expect(r.h9Metadata?.fingerprintHash).toBe('d'.repeat(64));
  });
});
