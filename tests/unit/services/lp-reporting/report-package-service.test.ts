/**
 * Unit tests for LP Reporting report-package assembly service.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { db } from '../../../../server/db';
import type { MetricRunCommitError } from '../../../../server/services/lp-reporting/metric-run-commit-service';
import {
  assembleMetricRunReportPackage,
  getMetricRunReportPackage,
} from '../../../../server/services/lp-reporting/report-package-service';
import {
  evidenceRecords,
  lpMetricRuns,
  lpReportPackages,
  narrativeRuns,
  type EvidenceRecord,
  type InsertLpReportPackage,
  type LpMetricRun,
  type LpReportPackage,
  type NarrativeRun,
} from '@shared/schema/lp-reporting-evidence';
import { users } from '@shared/schema/user';

const { resolveForFund } = vi.hoisted(() => ({ resolveForFund: vi.fn() }));

vi.mock('../../../../server/services/fund-calculation-mode-service', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../../server/services/fund-calculation-mode-service')
    >();
  return { ...actual, createMoicActionabilityResolver: () => ({ resolveForFund }) };
});

const H9_RESULT = {
  sourceFingerprintMatches: true,
  actionability: 'actionable' as const,
  actionabilityStatus: 'actionable' as const,
  sourceFingerprint: {
    moicSourceInputHash: 'a'.repeat(64),
    roundEvidenceInputHash: 'b'.repeat(64),
    roundEvidenceAssumptionsHash: 'c'.repeat(64),
    fingerprintHash: 'd'.repeat(64),
    policyVersion: 'h9-policy-v1',
  },
  acceptedReconciliationRunId: 42,
};

const validXirrDiagnostic = {
  convergence: 'converged',
  iterations: 5,
  method: 'newton',
  boundHit: null,
  failureReason: null,
} as const;

function validResults() {
  return {
    asOfDate: '2026-03-31',
    currency: 'USD',
    dpi: '0.450000',
    rvpi: '1.250000',
    tvpi: '1.700000',
    moic: '1.700000',
    netIrr: '0.150000',
    grossIrr: '0.180000',
    xirrDiagnostic: {
      net: validXirrDiagnostic,
      gross: validXirrDiagnostic,
    },
    contributionsTotal: '50000000.000000',
    distributionsTotal: '22500000.000000',
    currentNav: '62500000.000000',
    markConfidenceMix: { high: 8, medium: 3, low: 1 },
  };
}

function validDiagnostics() {
  return {
    engineVersion: 'lp-reporting-engine@1.2.0',
    decimalPrecision: 6,
    excludedFutureMarks: [900],
    warnings: [{ code: 'LOW_CONFIDENCE_MARKS', message: 'One low-confidence mark.' }],
  };
}

interface State {
  metricRuns: LpMetricRun[];
  narratives: NarrativeRun[];
  evidence: EvidenceRecord[];
  reportPackages: LpReportPackage[];
  users: number[];
  insertedPackages: InsertLpReportPackage[];
  operations: string[];
  nextPackageId: number;
  dropNextInsert: boolean;
}

const state: State = {
  metricRuns: [],
  narratives: [],
  evidence: [],
  reportPackages: [],
  users: [],
  insertedPackages: [],
  operations: [],
  nextPackageId: 500,
  dropNextInsert: false,
};

function metricRunRow(overrides: Partial<LpMetricRun> = {}): LpMetricRun {
  return {
    id: 11,
    fundId: 1,
    vehicleId: null,
    asOfDate: '2026-03-31',
    runType: 'quarterly_report',
    perspective: 'lp_net',
    status: 'locked',
    inputsHash: 'a'.repeat(64),
    sourceEventIds: [101, 102],
    sourceMarkIds: [201],
    sourceEvidenceIds: [],
    resultsJson: validResults(),
    diagnosticsJson: validDiagnostics(),
    methodologyVersion: 'lp-reporting-methodology-v1',
    calculationVersion: 'lp-reporting-metrics-engine-1.0.0',
    generatedBy: 7,
    approvedBy: 7,
    approvedAt: new Date('2026-05-10T01:00:00Z'),
    lockedBy: 7,
    lockedAt: new Date('2026-05-10T02:00:00Z'),
    exportedAt: null,
    version: 4,
    createdAt: new Date('2026-05-10T00:00:00Z'),
    updatedAt: new Date('2026-05-10T02:00:00Z'),
    ...overrides,
  };
}

function narrativeRow(
  narrativeType: NarrativeRun['narrativeType'],
  id: number,
  overrides: Partial<NarrativeRun> = {}
): NarrativeRun {
  return {
    id,
    fundId: 1,
    metricRunId: 11,
    asOfDate: '2026-03-31',
    narrativeType,
    generatedText: `${narrativeType} generated text.`,
    editedText: `${narrativeType} approved text.`,
    status: 'approved',
    generatedBy: 7,
    editedBy: 7,
    reviewedBy: 7,
    reviewedAt: new Date('2026-05-10T02:15:00Z'),
    approvedBy: 7,
    approvedAt: new Date('2026-05-10T02:30:00Z'),
    exportedAt: null,
    version: 3,
    createdAt: new Date('2026-05-10T02:05:00Z'),
    updatedAt: new Date('2026-05-10T02:30:00Z'),
    ...overrides,
  };
}

function evidenceRow(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: 301,
    fundId: 1,
    valuationMarkId: null,
    companyId: null,
    metricRunId: 11,
    narrativeRunId: null,
    idempotencyKey: 'idem-1',
    evidenceSource: 'board_update',
    sourceDate: '2026-03-31',
    receivedDate: null,
    expirationDate: null,
    confidenceLevel: 'medium',
    materialityLevel: 'medium',
    confidentiality: 'internal',
    redactionRequired: false,
    documentHash: null,
    valuationPolicyVersion: null,
    description: null,
    internalNotes: null,
    lpObjection: null,
    attachments: [],
    uploadedBy: 7,
    approvedBy: null,
    approvedAt: null,
    createdAt: new Date('2026-05-10T01:30:00Z'),
    updatedAt: new Date('2026-05-10T01:30:00Z'),
    ...overrides,
  };
}

function expectedNarratives() {
  return state.narratives.map((row) => ({
    narrativeType: row.narrativeType,
    narrativeRunId: row.id,
    expectedVersion: row.version,
  }));
}

function rowsFor(table: unknown): unknown[] {
  if (table === lpMetricRuns) return state.metricRuns;
  if (table === narrativeRuns) return state.narratives;
  if (table === evidenceRecords) return state.evidence;
  if (table === lpReportPackages) return state.reportPackages;
  if (table === users) return state.users.map((id) => ({ id }));
  return [];
}

function queryResult<T>(rows: T[]): Promise<T[]> & { limit: (count: number) => Promise<T[]> } {
  const promise = Promise.resolve(rows) as Promise<T[]> & {
    limit: (count: number) => Promise<T[]>;
  };
  promise.limit = () => Promise.resolve(rows);
  return promise;
}

function makePackage(row: InsertLpReportPackage): LpReportPackage {
  return {
    id: state.nextPackageId++,
    fundId: row.fundId,
    metricRunId: row.metricRunId,
    status: row.status ?? 'assembled',
    asOfDate: row.asOfDate,
    metricRunVersion: row.metricRunVersion,
    metricRunLockedBy: row.metricRunLockedBy ?? null,
    metricRunLockedAt: row.metricRunLockedAt ?? null,
    narrativeRefs: row.narrativeRefs,
    payload: row.payload,
    assembledBy: row.assembledBy,
    assembledAt: row.assembledAt ?? new Date('2026-05-10T03:00:00Z'),
    version: row.version ?? 1,
    createdAt: row.createdAt ?? new Date('2026-05-10T03:00:00Z'),
    updatedAt: row.updatedAt ?? new Date('2026-05-10T03:00:00Z'),
    h9MoicSourceInputHash: row.h9MoicSourceInputHash ?? null,
    h9RoundEvidenceInputHash: row.h9RoundEvidenceInputHash ?? null,
    h9RoundEvidenceAssumptionsHash: row.h9RoundEvidenceAssumptionsHash ?? null,
    h9FingerprintHash: row.h9FingerprintHash ?? null,
    h9PolicyVersion: row.h9PolicyVersion ?? null,
    h9ActionabilityStatus: row.h9ActionabilityStatus ?? null,
  };
}

function makeDatabase(): typeof db {
  return {
    transaction: async (callback: (tx: typeof db) => Promise<unknown>) => {
      state.operations.push('transaction');
      return callback(makeDatabase());
    },
    execute: async () => {
      state.operations.push('lock-row');
      return [];
    },
    select: () => ({
      from: (table: unknown) => ({
        where: () => queryResult(rowsFor(table)),
      }),
    }),
    insert: (table: unknown) => ({
      values: (row: InsertLpReportPackage) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (table !== lpReportPackages) return [];
            const existing = state.reportPackages.find(
              (candidate) => candidate.metricRunId === row.metricRunId
            );
            if (existing) return [];
            const inserted = makePackage(row);
            state.reportPackages.push(inserted);
            if (state.dropNextInsert) {
              state.dropNextInsert = false;
              return [];
            }
            state.insertedPackages.push(row);
            return [inserted];
          },
        }),
      }),
    }),
  } as unknown as typeof db;
}

beforeEach(() => {
  state.metricRuns = [metricRunRow()];
  state.narratives = [
    narrativeRow('no_dpi', 100),
    narrativeRow('methodology', 101),
    narrativeRow('portfolio_update', 102),
    narrativeRow('risk_disclosure', 103),
  ];
  state.evidence = [evidenceRow()];
  state.reportPackages = [];
  state.users = [7];
  state.insertedPackages = [];
  state.operations = [];
  state.nextPackageId = 500;
  state.dropNextInsert = false;
  resolveForFund.mockResolvedValue(H9_RESULT);
});

describe('getMetricRunReportPackage', () => {
  it('returns null when no package exists', async () => {
    const response = await getMetricRunReportPackage(
      { fundId: 1, metricRunId: 11 },
      { database: makeDatabase() }
    );

    expect(response.record).toBeNull();
  });
});

describe('assembleMetricRunReportPackage', () => {
  it('assembles one package from locked metric run and approved narratives', async () => {
    const response = await assembleMetricRunReportPackage(
      {
        fundId: 1,
        metricRunId: 11,
        userId: 7,
        body: { expectedMetricRunVersion: 4, expectedNarratives: expectedNarratives() },
      },
      { database: makeDatabase() }
    );

    expect(response.inserted).toBe(true);
    expect(response.record.status).toBe('assembled');
    expect(response.record.metricRunVersion).toBe(4);
    expect(response.record.payload.results.dpi).toBe('0.450000');
    expect(response.record.payload.evidenceRecordIds).toEqual([301]);
    expect(response.record.payload.narratives).toHaveLength(4);
    expect(state.operations).toEqual([
      'transaction',
      'lock-row',
      'lock-row',
      'lock-row',
      'lock-row',
      'lock-row',
    ]);
  });

  it('stamps the resolved H9 fingerprint onto the assembled package', async () => {
    const response = await assembleMetricRunReportPackage(
      {
        fundId: 1,
        metricRunId: 11,
        userId: 7,
        body: { expectedMetricRunVersion: 4, expectedNarratives: expectedNarratives() },
      },
      { database: makeDatabase() }
    );

    expect(response.inserted).toBe(true);
    expect(response.record.h9Metadata).toMatchObject({
      fingerprintHash: 'd'.repeat(64),
      policyVersion: 'h9-policy-v1',
      actionabilityStatus: 'actionable',
      moicSourceInputHash: 'a'.repeat(64),
    });
    expect(resolveForFund).toHaveBeenCalledWith(1);
  });

  it('returns inserted false for same-input retry without rewriting the package', async () => {
    const database = makeDatabase();
    const first = await assembleMetricRunReportPackage(
      {
        fundId: 1,
        metricRunId: 11,
        userId: 7,
        body: { expectedMetricRunVersion: 4, expectedNarratives: expectedNarratives() },
      },
      { database }
    );

    const second = await assembleMetricRunReportPackage(
      {
        fundId: 1,
        metricRunId: 11,
        userId: 7,
        body: { expectedMetricRunVersion: 4, expectedNarratives: expectedNarratives() },
      },
      { database }
    );

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(second.record.reportPackageId).toBe(first.record.reportPackageId);
    expect(second.record.assembledAt).toBe(first.record.assembledAt);
    expect(state.insertedPackages).toHaveLength(1);
  });

  it('converts a unique-index insert race into inserted false when refs match', async () => {
    state.dropNextInsert = true;
    const response = await assembleMetricRunReportPackage(
      {
        fundId: 1,
        metricRunId: 11,
        userId: 7,
        body: { expectedMetricRunVersion: 4, expectedNarratives: expectedNarratives() },
      },
      { database: makeDatabase() }
    );

    expect(response.inserted).toBe(false);
    expect(response.record.reportPackageId).toBe(500);
  });

  it('rejects non-locked metric runs', async () => {
    state.metricRuns = [metricRunRow({ status: 'approved' })];

    await expect(
      assembleMetricRunReportPackage(
        {
          fundId: 1,
          metricRunId: 11,
          userId: 7,
          body: { expectedMetricRunVersion: 4, expectedNarratives: expectedNarratives() },
        },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject<Partial<MetricRunCommitError>>({
      status: 409,
      code: 'METRIC_RUN_STATUS_CONFLICT',
    });
  });

  it('rejects stale metric-run versions', async () => {
    await expect(
      assembleMetricRunReportPackage(
        {
          fundId: 1,
          metricRunId: 11,
          userId: 7,
          body: { expectedMetricRunVersion: 3, expectedNarratives: expectedNarratives() },
        },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject<Partial<MetricRunCommitError>>({
      status: 409,
      code: 'METRIC_RUN_VERSION_CONFLICT',
    });
  });

  it('rejects missing narrative types', async () => {
    const refs = expectedNarratives().filter((ref) => ref.narrativeType !== 'risk_disclosure');

    await expect(
      assembleMetricRunReportPackage(
        {
          fundId: 1,
          metricRunId: 11,
          userId: 7,
          body: { expectedMetricRunVersion: 4, expectedNarratives: refs },
        },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject<Partial<MetricRunCommitError>>({
      status: 409,
      code: 'REPORT_PACKAGE_NARRATIVE_SET_INVALID',
    });
  });

  it('rejects duplicate narrative types', async () => {
    const refs = expectedNarratives().map((ref) =>
      ref.narrativeType === 'methodology' ? { ...ref, narrativeType: 'no_dpi' as const } : ref
    );

    await expect(
      assembleMetricRunReportPackage(
        {
          fundId: 1,
          metricRunId: 11,
          userId: 7,
          body: { expectedMetricRunVersion: 4, expectedNarratives: refs },
        },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject<Partial<MetricRunCommitError>>({
      status: 409,
      code: 'REPORT_PACKAGE_NARRATIVE_SET_INVALID',
    });
  });

  it('rejects extra narrative refs beyond the required set', async () => {
    const refs = [
      ...expectedNarratives(),
      { narrativeType: 'no_dpi' as const, narrativeRunId: 100, expectedVersion: 3 },
    ];

    await expect(
      assembleMetricRunReportPackage(
        {
          fundId: 1,
          metricRunId: 11,
          userId: 7,
          body: { expectedMetricRunVersion: 4, expectedNarratives: refs },
        },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject<Partial<MetricRunCommitError>>({
      status: 409,
      code: 'REPORT_PACKAGE_NARRATIVE_SET_INVALID',
    });
  });

  it('rejects stale narrative versions', async () => {
    const refs = expectedNarratives().map((ref) =>
      ref.narrativeType === 'methodology' ? { ...ref, expectedVersion: 2 } : ref
    );

    await expect(
      assembleMetricRunReportPackage(
        {
          fundId: 1,
          metricRunId: 11,
          userId: 7,
          body: { expectedMetricRunVersion: 4, expectedNarratives: refs },
        },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject<Partial<MetricRunCommitError>>({
      status: 409,
      code: 'NARRATIVE_RUN_VERSION_CONFLICT',
    });
  });

  it('rejects narrative refs outside the route scope', async () => {
    state.narratives = state.narratives.map((row) =>
      row.narrativeType === 'methodology' ? { ...row, fundId: 2 } : row
    );

    await expect(
      assembleMetricRunReportPackage(
        {
          fundId: 1,
          metricRunId: 11,
          userId: 7,
          body: { expectedMetricRunVersion: 4, expectedNarratives: expectedNarratives() },
        },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject<Partial<MetricRunCommitError>>({
      status: 404,
      code: 'NARRATIVE_RUN_NOT_FOUND',
    });
  });

  it('rejects narrative refs from another metric run', async () => {
    state.narratives = state.narratives.map((row) =>
      row.narrativeType === 'methodology' ? { ...row, metricRunId: 12 } : row
    );

    await expect(
      assembleMetricRunReportPackage(
        {
          fundId: 1,
          metricRunId: 11,
          userId: 7,
          body: { expectedMetricRunVersion: 4, expectedNarratives: expectedNarratives() },
        },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject<Partial<MetricRunCommitError>>({
      status: 404,
      code: 'NARRATIVE_RUN_NOT_FOUND',
    });
  });

  it('rejects narrative refs whose row type does not match the requested type', async () => {
    const refs = expectedNarratives().map((ref) => {
      if (ref.narrativeType === 'no_dpi') return { ...ref, narrativeRunId: 101 };
      if (ref.narrativeType === 'methodology') return { ...ref, narrativeRunId: 100 };
      return ref;
    });

    await expect(
      assembleMetricRunReportPackage(
        {
          fundId: 1,
          metricRunId: 11,
          userId: 7,
          body: { expectedMetricRunVersion: 4, expectedNarratives: refs },
        },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject<Partial<MetricRunCommitError>>({
      status: 404,
      code: 'NARRATIVE_RUN_NOT_FOUND',
    });
  });

  it('rejects unapproved narrative refs', async () => {
    state.narratives = state.narratives.map((row) =>
      row.narrativeType === 'portfolio_update'
        ? { ...row, status: 'reviewed', approvedAt: null }
        : row
    );

    await expect(
      assembleMetricRunReportPackage(
        {
          fundId: 1,
          metricRunId: 11,
          userId: 7,
          body: { expectedMetricRunVersion: 4, expectedNarratives: expectedNarratives() },
        },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject<Partial<MetricRunCommitError>>({
      status: 409,
      code: 'NARRATIVE_RUN_STATUS_CONFLICT',
    });
  });

  it('rejects approved narratives with empty effective text', async () => {
    state.narratives = state.narratives.map((row) =>
      row.narrativeType === 'risk_disclosure' ? { ...row, editedText: '   ' } : row
    );

    await expect(
      assembleMetricRunReportPackage(
        {
          fundId: 1,
          metricRunId: 11,
          userId: 7,
          body: { expectedMetricRunVersion: 4, expectedNarratives: expectedNarratives() },
        },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject<Partial<MetricRunCommitError>>({
      status: 409,
      code: 'NARRATIVE_RUN_TEXT_REQUIRED',
    });
  });

  it('rejects an existing package with different refs', async () => {
    const database = makeDatabase();
    await assembleMetricRunReportPackage(
      {
        fundId: 1,
        metricRunId: 11,
        userId: 7,
        body: { expectedMetricRunVersion: 4, expectedNarratives: expectedNarratives() },
      },
      { database }
    );
    state.reportPackages[0] = {
      ...state.reportPackages[0]!,
      narrativeRefs: [],
    };

    await expect(
      assembleMetricRunReportPackage(
        {
          fundId: 1,
          metricRunId: 11,
          userId: 7,
          body: { expectedMetricRunVersion: 4, expectedNarratives: expectedNarratives() },
        },
        { database }
      )
    ).rejects.toMatchObject<Partial<MetricRunCommitError>>({
      status: 409,
      code: 'REPORT_PACKAGE_ALREADY_ASSEMBLED',
    });
  });

  it('rejects an existing package with a different metric-run version', async () => {
    const database = makeDatabase();
    await assembleMetricRunReportPackage(
      {
        fundId: 1,
        metricRunId: 11,
        userId: 7,
        body: { expectedMetricRunVersion: 4, expectedNarratives: expectedNarratives() },
      },
      { database }
    );
    state.reportPackages[0] = {
      ...state.reportPackages[0]!,
      metricRunVersion: 3,
    };

    await expect(
      assembleMetricRunReportPackage(
        {
          fundId: 1,
          metricRunId: 11,
          userId: 7,
          body: { expectedMetricRunVersion: 4, expectedNarratives: expectedNarratives() },
        },
        { database }
      )
    ).rejects.toMatchObject<Partial<MetricRunCommitError>>({
      status: 409,
      code: 'REPORT_PACKAGE_ALREADY_ASSEMBLED',
    });
  });
});
