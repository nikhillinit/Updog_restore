/**
 * Contract tests for LP Reporting report-package endpoint shapes.
 */
import { describe, expect, it } from 'vitest';

import {
  ReportPackageAssembleRequestSchema,
  ReportPackageAssembleResponseSchema,
  ReportPackageExportContentHashConflictResponseSchema,
  ReportPackageExportNotFoundResponseSchema,
  ReportPackageExportRecordSchema,
  ReportPackageExportStatusSchema,
  ReportPackageGetResponseSchema,
  ReportPackageJsonExportBlockedResponseSchema,
  ReportPackageJsonExportResponseSchema,
  ReportPackageJsonStoredArtifactResponseSchema,
  ReportPackageJsonStoredExportGetResponseSchema,
  ReportPackageJsonStoredExportResponseSchema,
  ReportPackagePayloadSchema,
  ReportPackageRecordSchema,
  ReportPackageRenderModelResponseSchema,
  ReportPackageStatusSchema,
  type LpMetricRunDiagnostics,
  type LpMetricRunResults,
} from '@shared/contracts/lp-reporting';

const xirrDiagnostic = {
  convergence: 'converged',
  iterations: 5,
  method: 'newton',
  boundHit: null,
  failureReason: null,
} as const;

const results: LpMetricRunResults = {
  asOfDate: '2026-03-31',
  currency: 'USD',
  dpi: '0.450000',
  rvpi: '1.250000',
  tvpi: '1.700000',
  moic: '1.700000',
  netIrr: '0.150000',
  grossIrr: '0.180000',
  xirrDiagnostic: {
    net: xirrDiagnostic,
    gross: xirrDiagnostic,
  },
  contributionsTotal: '50000000.000000',
  distributionsTotal: '22500000.000000',
  currentNav: '62500000.000000',
  markConfidenceMix: { high: 8, medium: 3, low: 1 },
};

const diagnostics: LpMetricRunDiagnostics = {
  engineVersion: 'lp-reporting-engine@1.2.0',
  decimalPrecision: 6,
  excludedFutureMarks: [],
  warnings: [],
};

const textHash = 'a'.repeat(64);

const narrativeRef = {
  narrativeType: 'methodology',
  narrativeRunId: 101,
  narrativeVersion: 3,
  approvedBy: 7,
  approvedAt: '2026-05-10T01:00:00.000Z',
  textHash,
} as const;

const payload = {
  payloadVersion: 1,
  results,
  diagnostics,
  sourceEventIds: [1, 2],
  sourceMarkIds: [10],
  evidenceRecordIds: [301],
  narratives: [
    {
      ...narrativeRef,
      effectiveText: 'Approved methodology copy.',
    },
  ],
} as const;

const record = {
  reportPackageId: 501,
  fundId: 1,
  metricRunId: 11,
  status: 'assembled',
  asOfDate: '2026-03-31',
  metricRunVersion: 4,
  metricRunLockedBy: 7,
  metricRunLockedAt: '2026-05-10T00:30:00.000Z',
  narrativeRefs: [narrativeRef],
  payload,
  assembledBy: 7,
  assembledAt: '2026-05-10T01:05:00.000Z',
  version: 1,
  createdAt: '2026-05-10T01:05:00.000Z',
  updatedAt: '2026-05-10T01:05:00.000Z',
} as const;

describe('report package enums', () => {
  it('accepts assembled status only', () => {
    expect(ReportPackageStatusSchema.parse('assembled')).toBe('assembled');
    expect(() => ReportPackageStatusSchema.parse('exported')).toThrow();
  });
});

describe('ReportPackageAssembleRequestSchema', () => {
  it('accepts expected metric-run version and narrative refs only', () => {
    const parsed = ReportPackageAssembleRequestSchema.parse({
      expectedMetricRunVersion: 4,
      expectedNarratives: [
        { narrativeType: 'methodology', narrativeRunId: 101, expectedVersion: 3 },
      ],
    });
    expect(parsed.expectedMetricRunVersion).toBe(4);
  });

  it.each([
    'fundId',
    'metricRunId',
    'reportPackageId',
    'status',
    'assembledBy',
    'assembledAt',
    'payload',
    'narrativeRefs',
    'version',
    'createdAt',
    'updatedAt',
  ])('rejects route-owned field %s', (field) => {
    expect(() =>
      ReportPackageAssembleRequestSchema.parse({
        expectedMetricRunVersion: 4,
        expectedNarratives: [
          { narrativeType: 'methodology', narrativeRunId: 101, expectedVersion: 3 },
        ],
        [field]: field.endsWith('At') ? '2026-05-10T00:00:00.000Z' : 7,
      })
    ).toThrow();
  });
});

describe('ReportPackagePayloadSchema', () => {
  it('parses exact metric results, diagnostics, refs, and narrative text', () => {
    const parsed = ReportPackagePayloadSchema.parse(payload);
    expect(parsed.payloadVersion).toBe(1);
    expect(parsed.results.dpi).toBe('0.450000');
    expect(parsed.narratives[0]?.textHash).toBe(textHash);
  });

  it('rejects untyped metric summaries', () => {
    expect(() =>
      ReportPackagePayloadSchema.parse({
        ...payload,
        results: { dpi: '0.450000' },
      })
    ).toThrow();
  });

  it('rejects unknown payload fields', () => {
    expect(() => ReportPackagePayloadSchema.parse({ ...payload, exportUrl: 'x' })).toThrow();
  });
});

describe('ReportPackageRecordSchema', () => {
  it('parses the response record shape', () => {
    const parsed = ReportPackageRecordSchema.parse(record);
    expect(parsed.reportPackageId).toBe(501);
    expect(parsed.status).toBe('assembled');
    expect(parsed.payload.diagnostics.engineVersion).toBe('lp-reporting-engine@1.2.0');
  });

  it('rejects unknown record fields', () => {
    expect(() => ReportPackageRecordSchema.parse({ ...record, downloadUrl: 'nope' })).toThrow();
  });
});

describe('report package response envelopes', () => {
  it('parses nullable GET response', () => {
    expect(ReportPackageGetResponseSchema.parse({ record: null })).toEqual({ record: null });
    expect(ReportPackageGetResponseSchema.parse({ record }).record?.reportPackageId).toBe(501);
  });

  it('parses assemble inserted marker', () => {
    expect(
      ReportPackageAssembleResponseSchema.parse({
        record,
        inserted: false,
      }).inserted
    ).toBe(false);
  });
});

describe('ReportPackageRenderModelResponseSchema', () => {
  const renderModelResponse = {
    renderModel: {
      renderModelVersion: 1,
      source: {
        reportPackageId: record.reportPackageId,
        fundId: record.fundId,
        metricRunId: record.metricRunId,
        reportPackageStatus: record.status,
        asOfDate: record.asOfDate,
        metricRunVersion: record.metricRunVersion,
        metricRunLockedBy: record.metricRunLockedBy,
        metricRunLockedAt: record.metricRunLockedAt,
        assembledBy: record.assembledBy,
        assembledAt: record.assembledAt,
        packageVersion: record.version,
        payloadVersion: record.payload.payloadVersion,
      },
      fundDisplay: {
        fundId: 1,
        name: 'Press On Fund I',
        vintageYear: 2024,
        size: '100000000.00',
      },
      metricSections: [
        {
          sectionId: 'performance',
          title: 'Performance',
          rows: [
            {
              metricId: 'dpi',
              label: 'DPI',
              value: '0.450000',
              valueKind: 'multiple',
              currency: null,
            },
          ],
        },
      ],
      narrativeSections: [
        {
          sectionId: 'methodology',
          title: 'Methodology',
          narrativeType: 'methodology',
          narrativeRunId: 101,
          narrativeVersion: 3,
          approvedBy: 7,
          approvedAt: '2026-05-10T01:00:00.000Z',
          textHash,
          body: 'Approved methodology copy.',
        },
      ],
      diagnostics: {
        engineVersion: diagnostics.engineVersion,
        decimalPrecision: diagnostics.decimalPrecision,
        excludedFutureMarks: [],
        warnings: diagnostics.warnings,
        xirr: results.xirrDiagnostic,
      },
      references: {
        sourceEventIds: [1, 2],
        sourceMarkIds: [10],
        evidenceRecordIds: [301],
        narrativeRunIds: [101],
      },
    },
  } as const;

  it('parses renderer-facing package shape without nullable record semantics', () => {
    const parsed = ReportPackageRenderModelResponseSchema.parse(renderModelResponse);

    expect(parsed.renderModel.source.reportPackageId).toBe(501);
    expect(parsed.renderModel.fundDisplay.name).toBe('Press On Fund I');
    expect(parsed.renderModel.metricSections[0]?.rows[0]?.metricId).toBe('dpi');
  });

  it.each(['record', 'downloadUrl', 'fileUrl', 'signedUrl', 'storageKey', 'queueJobId'])(
    'rejects non-render field %s',
    (field) => {
      expect(() =>
        ReportPackageRenderModelResponseSchema.parse({
          ...renderModelResponse,
          [field]: 'not-render-model',
        })
      ).toThrow();
    }
  );

  it('parses JSON export success with deterministic artifact metadata', () => {
    const parsed = ReportPackageJsonExportResponseSchema.parse({
      export: {
        exportVersion: 1,
        format: 'json',
        source: renderModelResponse.renderModel.source,
        renderModel: renderModelResponse.renderModel,
        contentHashAlgorithm: 'sha256',
        contentHash: 'b'.repeat(64),
      },
    });

    expect(parsed.export.source.reportPackageId).toBe(501);
    expect(parsed.export.format).toBe('json');
    expect(parsed.export.contentHashAlgorithm).toBe('sha256');
  });

  it.each(['exportedAt', 'storageKey', 'signedUrl', 'queueJobId'])(
    'rejects JSON export lifecycle field %s',
    (field) => {
      expect(() =>
        ReportPackageJsonExportResponseSchema.parse({
          export: {
            exportVersion: 1,
            format: 'json',
            source: renderModelResponse.renderModel.source,
            renderModel: renderModelResponse.renderModel,
            contentHashAlgorithm: 'sha256',
            contentHash: 'b'.repeat(64),
            [field]: 'not-a-handoff-field',
          },
        })
      ).toThrow();
    }
  );

  it('parses JSON export blocker responses without artifact fields', () => {
    const blocked = ReportPackageJsonExportBlockedResponseSchema.parse({
      error: 'REPORT_PACKAGE_JSON_EXPORT_BLOCKED',
      message: 'Report package JSON export is blocked by readiness checks.',
      blockers: [
        {
          code: 'EVIDENCE_REFERENCE_INVALID',
          message: 'One or more evidence references could not be resolved.',
          evidenceRecordIds: [301],
        },
      ],
    });

    expect(blocked.blockers[0]?.code).toBe('EVIDENCE_REFERENCE_INVALID');
    expect(() =>
      ReportPackageJsonExportBlockedResponseSchema.parse({
        ...blocked,
        renderModel: renderModelResponse.renderModel,
      })
    ).toThrow();
  });

  it('parses stored JSON export metadata and rejects artifact or delivery fields', () => {
    expect(ReportPackageExportStatusSchema.parse('ready')).toBe('ready');
    expect(() => ReportPackageExportStatusSchema.parse('queued')).toThrow();

    const record = ReportPackageExportRecordSchema.parse({
      reportPackageExportId: 4100,
      fundId: 1,
      metricRunId: 500,
      reportPackageId: 501,
      format: 'json',
      exportVersion: 1,
      status: 'ready',
      contentHashAlgorithm: 'sha256',
      contentHash: 'd'.repeat(64),
      artifactSizeBytes: 1234,
      createdBy: 7,
      readyAt: '2026-05-10T04:00:00.000Z',
      createdAt: '2026-05-10T04:00:00.000Z',
      updatedAt: '2026-05-10T04:00:00.000Z',
    });

    expect(record.status).toBe('ready');
    for (const field of ['artifactPayload', 'storageKey', 'signedUrl', 'publicUrl']) {
      expect(() =>
        ReportPackageExportRecordSchema.parse({
          ...record,
          [field]: field,
        })
      ).toThrow();
    }
  });

  it('parses stored JSON export create, metadata, artifact, and error envelopes', () => {
    const record = ReportPackageExportRecordSchema.parse({
      reportPackageExportId: 4100,
      fundId: 1,
      metricRunId: 500,
      reportPackageId: 501,
      format: 'json',
      exportVersion: 1,
      status: 'ready',
      contentHashAlgorithm: 'sha256',
      contentHash: 'd'.repeat(64),
      artifactSizeBytes: 1234,
      createdBy: 7,
      readyAt: '2026-05-10T04:00:00.000Z',
      createdAt: '2026-05-10T04:00:00.000Z',
      updatedAt: '2026-05-10T04:00:00.000Z',
    });

    const created = ReportPackageJsonStoredExportResponseSchema.parse({
      record,
      inserted: true,
    });
    expect(created.inserted).toBe(true);
    expect(
      ReportPackageJsonStoredExportGetResponseSchema.parse({ record: null }).record
    ).toBeNull();
    expect(
      ReportPackageJsonStoredArtifactResponseSchema.parse({
        record,
        export: {
          exportVersion: 1,
          format: 'json',
          source: renderModelResponse.renderModel.source,
          renderModel: renderModelResponse.renderModel,
          contentHashAlgorithm: 'sha256',
          contentHash: 'd'.repeat(64),
        },
      }).export.contentHash
    ).toBe('d'.repeat(64));

    expect(
      ReportPackageExportNotFoundResponseSchema.parse({
        error: 'REPORT_PACKAGE_EXPORT_NOT_FOUND',
        message: 'Stored report package JSON export was not found.',
      }).error
    ).toBe('REPORT_PACKAGE_EXPORT_NOT_FOUND');
    expect(
      ReportPackageExportContentHashConflictResponseSchema.parse({
        error: 'EXPORT_CONTENT_HASH_CONFLICT',
        message: 'Stored report package JSON export does not match.',
        storedContentHash: 'd'.repeat(64),
        currentContentHash: 'e'.repeat(64),
      }).currentContentHash
    ).toBe('e'.repeat(64));
  });
});
