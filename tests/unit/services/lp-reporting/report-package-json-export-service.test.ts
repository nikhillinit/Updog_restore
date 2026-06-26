/**
 * Unit tests for LP Reporting report-package JSON export service.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { db } from '../../../../server/db';
import type { MetricRunCommitError } from '../../../../server/services/lp-reporting/metric-run-commit-service';
import {
  canonicalJson,
  getMetricRunReportPackageJsonExport,
  sha256CanonicalJson,
} from '../../../../server/services/lp-reporting/report-package-json-export-service';
import {
  ReportPackageJsonExportArtifactSchema,
  type ReportPackageJsonExportResponse,
} from '@shared/contracts/lp-reporting';
import { evidenceRecords, type EvidenceRecord } from '@shared/schema/lp-reporting-evidence';
import {
  H9ExportBlockedError,
  type H9ExportSurface,
} from '../../../../server/services/lp-reporting/h9-export-gate';

interface State {
  evidenceRows: EvidenceRecord[];
  writeCalls: string[];
}

const state: State = {
  evidenceRows: [],
  writeCalls: [],
};

const validXirrDiagnostic = {
  convergence: 'converged',
  iterations: 5,
  method: 'newton',
  boundHit: null,
  failureReason: null,
} as const;

const renderModel = {
  renderModelVersion: 1,
  source: {
    reportPackageId: 501,
    fundId: 1,
    metricRunId: 11,
    reportPackageStatus: 'assembled',
    asOfDate: '2026-03-31',
    metricRunVersion: 4,
    metricRunLockedBy: 7,
    metricRunLockedAt: '2026-05-10T02:00:00.000Z',
    assembledBy: 7,
    assembledAt: '2026-05-10T03:00:00.000Z',
    packageVersion: 1,
    payloadVersion: 1,
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
      approvedAt: '2026-05-10T02:30:00.000Z',
      textHash: 'a'.repeat(64),
      body: 'Approved methodology copy.',
    },
  ],
  diagnostics: {
    engineVersion: 'lp-reporting-engine@1.2.0',
    decimalPrecision: 6,
    excludedFutureMarks: [],
    warnings: [],
    xirr: {
      net: validXirrDiagnostic,
      gross: validXirrDiagnostic,
    },
  },
  references: {
    sourceEventIds: [101, 102],
    sourceMarkIds: [201],
    evidenceRecordIds: [301, 300, 301],
    narrativeRunIds: [101],
  },
} as const;

function evidenceRow(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: 300,
    fundId: 1,
    valuationMarkId: null,
    companyId: null,
    metricRunId: 11,
    narrativeRunId: null,
    idempotencyKey: `evidence-${overrides.id ?? 300}`,
    evidenceSource: 'board_update',
    sourceDate: '2026-03-31',
    receivedDate: null,
    expirationDate: null,
    confidenceLevel: 'high',
    materialityLevel: 'high',
    confidentiality: 'lp_shareable',
    redactionRequired: false,
    documentHash: null,
    valuationPolicyVersion: null,
    description: null,
    internalNotes: null,
    lpObjection: null,
    attachments: [],
    uploadedBy: null,
    approvedBy: null,
    approvedAt: null,
    createdAt: new Date('2026-05-10T00:00:00Z'),
    updatedAt: new Date('2026-05-10T00:00:00Z'),
    ...overrides,
  };
}

function rowsFor(table: unknown): unknown[] {
  if (table === evidenceRecords) return state.evidenceRows;
  return [];
}

function makeDatabase(): typeof db {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => Promise.resolve(rowsFor(table)),
      }),
    }),
    insert: () => {
      state.writeCalls.push('insert');
      throw new Error('JSON export service must not insert rows');
    },
    update: () => {
      state.writeCalls.push('update');
      throw new Error('JSON export service must not update rows');
    },
    execute: async () => {
      state.writeCalls.push('execute');
      return [];
    },
  } as unknown as typeof db;
}

function artifactFrom(response: ReportPackageJsonExportResponse) {
  const { contentHash, contentHashAlgorithm, ...artifact } = response.export;
  return { artifact, contentHash, contentHashAlgorithm };
}

beforeEach(() => {
  state.evidenceRows = [evidenceRow({ id: 300 }), evidenceRow({ id: 301 })];
  state.writeCalls = [];
});

describe('getMetricRunReportPackageJsonExport', () => {
  it('returns a deterministic JSON handoff over the render model without writes', async () => {
    const renderModelService = vi.fn(async () => ({ renderModel }));

    const response = await getMetricRunReportPackageJsonExport(
      { fundId: 1, metricRunId: 11 },
      { database: makeDatabase(), renderModelService }
    );

    const { artifact, contentHash, contentHashAlgorithm } = artifactFrom(response);
    expect(response.export.exportVersion).toBe(1);
    expect(response.export.format).toBe('json');
    expect(response.export.source.reportPackageId).toBe(501);
    expect(response.export.renderModel.references.evidenceRecordIds).toEqual([301, 300, 301]);
    expect(contentHashAlgorithm).toBe('sha256');
    expect(contentHash).toBe(
      sha256CanonicalJson(ReportPackageJsonExportArtifactSchema.parse(artifact))
    );
    expect(renderModelService).toHaveBeenCalledWith(
      { fundId: 1, metricRunId: 11 },
      { database: expect.any(Object), h9Surface: 'live_json_export' }
    );
    expect(state.writeCalls).toEqual([]);
  });

  it('blocks the live JSON export with surface live_json_export when H9 has drifted', async () => {
    const renderModelService = vi.fn(
      async (_input: unknown, opts: { h9Surface?: H9ExportSurface }) => {
        throw new H9ExportBlockedError(
          opts.h9Surface ?? 'render_model',
          'H9_FINGERPRINT_STALE',
          'stale'
        );
      }
    );

    await expect(
      getMetricRunReportPackageJsonExport(
        { fundId: 1, metricRunId: 11 },
        { database: makeDatabase(), renderModelService }
      )
    ).rejects.toMatchObject({ code: 'H9_FINGERPRINT_STALE', surface: 'live_json_export' });
  });

  it('collapses missing and out-of-scope evidence into EVIDENCE_REFERENCE_INVALID', async () => {
    state.evidenceRows = [
      evidenceRow({ id: 300 }),
      evidenceRow({ id: 301, fundId: 2 }),
      evidenceRow({ id: 302, metricRunId: 22 }),
    ];

    await expect(
      getMetricRunReportPackageJsonExport(
        { fundId: 1, metricRunId: 11 },
        { database: makeDatabase(), renderModelService: vi.fn(async () => ({ renderModel })) }
      )
    ).rejects.toMatchObject<Partial<MetricRunCommitError>>({
      status: 409,
      code: 'REPORT_PACKAGE_JSON_EXPORT_BLOCKED',
      details: [
        {
          code: 'EVIDENCE_REFERENCE_INVALID',
          evidenceRecordIds: [301],
        },
      ],
    });
    expect(state.writeCalls).toEqual([]);
  });

  it('blocks same-scope restricted and redaction-required evidence specifically', async () => {
    state.evidenceRows = [
      evidenceRow({ id: 300, confidentiality: 'restricted' }),
      evidenceRow({ id: 301, redactionRequired: true }),
    ];

    await expect(
      getMetricRunReportPackageJsonExport(
        { fundId: 1, metricRunId: 11 },
        { database: makeDatabase(), renderModelService: vi.fn(async () => ({ renderModel })) }
      )
    ).rejects.toMatchObject<Partial<MetricRunCommitError>>({
      status: 409,
      code: 'REPORT_PACKAGE_JSON_EXPORT_BLOCKED',
      details: [
        {
          code: 'EVIDENCE_RESTRICTED',
          evidenceRecordId: 300,
        },
        {
          code: 'EVIDENCE_REDACTION_REQUIRED',
          evidenceRecordId: 301,
        },
      ],
    });
    expect(state.writeCalls).toEqual([]);
  });
});

describe('canonicalJson', () => {
  it('sorts object keys and rejects unsupported values', () => {
    expect(canonicalJson({ b: 2, a: [3, { d: 4, c: 5 }] })).toBe('{"a":[3,{"c":5,"d":4}],"b":2}');
    expect(() => canonicalJson({ a: undefined })).toThrow(/undefined field/);
    expect(() => canonicalJson(new Date('2026-05-10T00:00:00Z'))).toThrow(/non-plain/);
  });
});
