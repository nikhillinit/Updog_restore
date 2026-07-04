/**
 * Unit tests for stored LP Reporting package JSON exports.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { db } from '../../../../server/db';
import type { MetricRunCommitError } from '../../../../server/services/lp-reporting/metric-run-commit-service';
import { ReportPackageJsonExportBlockedError } from '../../../../server/services/lp-reporting/report-package-json-export-service';
import {
  createMetricRunReportPackageStoredJsonExport,
  getMetricRunReportPackageStoredJsonArtifact,
  getMetricRunReportPackageStoredJsonExport,
} from '../../../../server/services/lp-reporting/report-package-json-stored-export-service';
import {
  ReportPackageJsonExportArtifactSchema,
  type ReportPackageJsonExportArtifact,
  type ReportPackageJsonExportResponse,
  type ReportPackageRenderSource,
} from '@shared/contracts/lp-reporting';
import {
  lpMetricRuns,
  lpReportPackageExports,
  lpReportPackages,
  type LpReportPackageExport,
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

const H9_FP = 'd'.repeat(64);
const CURRENT_OK = {
  actionability: 'actionable' as const,
  sourceFingerprint: { fingerprintHash: H9_FP, policyVersion: 'h9-policy-v1' },
};
const storedPackageRow = {
  h9MoicSourceInputHash: 'a'.repeat(64),
  h9RoundEvidenceInputHash: 'b'.repeat(64),
  h9RoundEvidenceAssumptionsHash: 'c'.repeat(64),
  h9FingerprintHash: H9_FP,
  h9PolicyVersion: 'h9-policy-v1',
  h9ActionabilityStatus: 'actionable',
};
const H9_STAMP = {
  fingerprintHash: H9_FP,
  policyVersion: 'h9-policy-v1',
  actionabilityStatus: 'actionable' as const,
};

interface State {
  exportRows: LpReportPackageExport[];
  metricRuns: MetricRunStatusRow[];
  insertedRows: unknown[];
  statusUpdates: unknown[];
  users: number[];
  nextId: number;
  dropNextInsert: boolean;
}

interface MetricRunStatusRow {
  id: number;
  fundId: number;
  status: string;
  version: number;
  updatedAt: Date;
  lockedBy: number | null;
  lockedAt: Date | null;
}

const state: State = {
  exportRows: [],
  metricRuns: [],
  insertedRows: [],
  statusUpdates: [],
  users: [7],
  nextId: 4100,
  dropNextInsert: false,
};

const artifact: ReportPackageJsonExportArtifact = {
  exportVersion: 1,
  format: 'json',
  source: {
    reportPackageId: 3000,
    fundId: 1,
    metricRunId: 500,
    reportPackageStatus: 'assembled',
    asOfDate: '2026-03-31',
    metricRunVersion: 3,
    metricRunLockedBy: 7,
    metricRunLockedAt: '2026-05-10T02:00:00.000Z',
    assembledBy: 7,
    assembledAt: '2026-05-10T03:00:00.000Z',
    packageVersion: 1,
    payloadVersion: 1,
    h9Stamp: H9_STAMP,
  },
  renderModel: {
    renderModelVersion: 1,
    source: {
      reportPackageId: 3000,
      fundId: 1,
      metricRunId: 500,
      reportPackageStatus: 'assembled',
      asOfDate: '2026-03-31',
      metricRunVersion: 3,
      metricRunLockedBy: 7,
      metricRunLockedAt: '2026-05-10T02:00:00.000Z',
      assembledBy: 7,
      assembledAt: '2026-05-10T03:00:00.000Z',
      packageVersion: 1,
      payloadVersion: 1,
      h9Stamp: H9_STAMP,
    },
    fundDisplay: {
      fundId: 1,
      name: 'Press On Fund I',
      vintageYear: 2024,
      size: '100000000.00',
    },
    metricSections: [],
    narrativeSections: [],
    diagnostics: {
      engineVersion: 'lp-reporting-engine@1.2.0',
      decimalPrecision: 6,
      excludedFutureMarks: [],
      warnings: [],
      xirr: {
        net: {
          convergence: 'converged',
          iterations: 5,
          method: 'newton',
          boundHit: null,
          failureReason: null,
        },
        gross: {
          convergence: 'converged',
          iterations: 4,
          method: 'newton',
          boundHit: null,
          failureReason: null,
        },
      },
    },
    references: {
      sourceEventIds: [],
      sourceMarkIds: [],
      evidenceRecordIds: [],
      narrativeRunIds: [],
    },
  },
};

function legacyRenderSource(source: ReportPackageRenderSource) {
  return {
    reportPackageId: source.reportPackageId,
    fundId: source.fundId,
    metricRunId: source.metricRunId,
    reportPackageStatus: source.reportPackageStatus,
    asOfDate: source.asOfDate,
    metricRunVersion: source.metricRunVersion,
    metricRunLockedBy: source.metricRunLockedBy,
    metricRunLockedAt: source.metricRunLockedAt,
    assembledBy: source.assembledBy,
    assembledAt: source.assembledAt,
    packageVersion: source.packageVersion,
    payloadVersion: source.payloadVersion,
  };
}

function legacyArtifactPayload() {
  return {
    ...artifact,
    source: legacyRenderSource(artifact.source),
    renderModel: {
      ...artifact.renderModel,
      source: legacyRenderSource(artifact.renderModel.source),
    },
  };
}

function makeResponse(hash = 'c'.repeat(64)): ReportPackageJsonExportResponse {
  return {
    export: {
      ...artifact,
      contentHashAlgorithm: 'sha256',
      contentHash: hash,
    },
  };
}

function rowsFor(table: unknown): unknown[] {
  if (table === users) return state.users.map((id) => ({ id }));
  if (table === lpMetricRuns) return [...state.metricRuns];
  if (table === lpReportPackageExports) return [...state.exportRows];
  if (table === lpReportPackages) return [storedPackageRow];
  return [];
}

function queryResult<T>(rows: T[]): Promise<T[]> & { limit: () => Promise<T[]> } {
  const promise = Promise.resolve(rows) as Promise<T[]> & { limit: () => Promise<T[]> };
  promise.limit = () => Promise.resolve(rows);
  return promise;
}

function makeDatabase(): typeof db {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => queryResult(rowsFor(table)),
      }),
    }),
    insert: (table: unknown) => ({
      values: (row: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (table !== lpReportPackageExports || state.dropNextInsert) {
              state.dropNextInsert = false;
              return [];
            }
            const duplicate = state.exportRows.find(
              (candidate) =>
                candidate.reportPackageId === row['reportPackageId'] &&
                candidate.format === row['format'] &&
                candidate.exportVersion === row['exportVersion']
            );
            if (duplicate) return [];

            const now = new Date('2026-05-10T04:00:00Z');
            const stored: LpReportPackageExport = {
              id: state.nextId++,
              fundId: row['fundId'] as number,
              metricRunId: row['metricRunId'] as number,
              reportPackageId: row['reportPackageId'] as number,
              format: row['format'] as string,
              exportVersion: row['exportVersion'] as number,
              status: row['status'] as string,
              contentHashAlgorithm: row['contentHashAlgorithm'] as string,
              contentHash: row['contentHash'] as string,
              artifactPayload: row['artifactPayload'],
              artifactSizeBytes: row['artifactSizeBytes'] as number,
              createdBy: row['createdBy'] as number,
              readyAt: (row['readyAt'] as Date | undefined) ?? now,
              createdAt: (row['createdAt'] as Date | undefined) ?? now,
              updatedAt: (row['updatedAt'] as Date | undefined) ?? now,
            };
            state.exportRows.push(stored);
            state.insertedRows.push(row);
            return [stored];
          },
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            if (table !== lpMetricRuns) {
              return [];
            }
            const current = state.metricRuns.find((row) => row.id === 500 && row.fundId === 1);
            if (!current || current.status !== 'locked') {
              return [];
            }
            const updated: MetricRunStatusRow = {
              ...current,
              status: values['status'] as string,
              updatedAt: values['updatedAt'] as Date,
            };
            state.metricRuns = state.metricRuns.map((row) =>
              row.id === updated.id && row.fundId === updated.fundId ? updated : row
            );
            state.statusUpdates.push(values);
            return [updated];
          },
        }),
      }),
    }),
  } as unknown as typeof db;
}

beforeEach(() => {
  ReportPackageJsonExportArtifactSchema.parse(artifact);
  state.exportRows = [];
  state.metricRuns = [
    {
      id: 500,
      fundId: 1,
      status: 'locked',
      version: 3,
      updatedAt: new Date('2026-05-10T02:00:00Z'),
      lockedBy: 7,
      lockedAt: new Date('2026-05-10T02:00:00Z'),
    },
  ];
  state.insertedRows = [];
  state.statusUpdates = [];
  state.users = [7];
  state.nextId = 4100;
  state.dropNextInsert = false;
  resolveForFund.mockResolvedValue(CURRENT_OK);
});

describe('stored report package JSON exports', () => {
  it('creates a ready stored export from the deterministic JSON handoff', async () => {
    const liveExport = vi.fn(async () => makeResponse());

    const response = await createMetricRunReportPackageStoredJsonExport(
      { fundId: 1, metricRunId: 500, userId: 7 },
      { database: makeDatabase(), jsonExportService: liveExport }
    );

    expect(response.inserted).toBe(true);
    expect(response.record.reportPackageExportId).toBe(4100);
    expect(response.record.contentHash).toBe('c'.repeat(64));
    expect(response.record.artifactSizeBytes).toBeGreaterThan(0);
    expect(state.insertedRows).toHaveLength(1);
    expect(state.statusUpdates).toHaveLength(1);
    expect(state.statusUpdates[0]).toMatchObject({ status: 'exported' });
    expect(state.metricRuns[0]).toMatchObject({
      status: 'exported',
      version: 3,
      lockedBy: 7,
      lockedAt: new Date('2026-05-10T02:00:00Z'),
    });
    const inserted = state.insertedRows[0] as { artifactPayload: unknown };
    const persistedArtifact = ReportPackageJsonExportArtifactSchema.parse(inserted.artifactPayload);
    expect(persistedArtifact.source.h9Stamp).toEqual(H9_STAMP);
    expect(persistedArtifact.renderModel.source.h9Stamp).toEqual(H9_STAMP);
    expect(liveExport).toHaveBeenCalledWith(
      { fundId: 1, metricRunId: 500 },
      { database: expect.any(Object) }
    );
  });

  it('returns the existing row on idempotent replay without updating it', async () => {
    const database = makeDatabase();
    const liveExport = vi.fn(async () => makeResponse());

    const first = await createMetricRunReportPackageStoredJsonExport(
      { fundId: 1, metricRunId: 500, userId: 7 },
      { database, jsonExportService: liveExport }
    );
    const second = await createMetricRunReportPackageStoredJsonExport(
      { fundId: 1, metricRunId: 500, userId: 7 },
      { database, jsonExportService: liveExport }
    );

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(second.record.reportPackageExportId).toBe(first.record.reportPackageExportId);
    expect(state.insertedRows).toHaveLength(1);
    expect(state.statusUpdates).toHaveLength(1);
    expect(state.metricRuns[0]?.status).toBe('exported');
  });

  it('replays an already exported metric run without a second status update', async () => {
    state.metricRuns[0] = { ...state.metricRuns[0]!, status: 'exported' };
    state.exportRows.push({
      id: 4100,
      fundId: 1,
      metricRunId: 500,
      reportPackageId: 3000,
      format: 'json',
      exportVersion: 1,
      status: 'ready',
      contentHashAlgorithm: 'sha256',
      contentHash: 'c'.repeat(64),
      artifactPayload: artifact,
      artifactSizeBytes: 1000,
      createdBy: 7,
      readyAt: new Date('2026-05-10T04:00:00Z'),
      createdAt: new Date('2026-05-10T04:00:00Z'),
      updatedAt: new Date('2026-05-10T04:00:00Z'),
    });

    const response = await createMetricRunReportPackageStoredJsonExport(
      { fundId: 1, metricRunId: 500, userId: 7 },
      { database: makeDatabase(), jsonExportService: vi.fn(async () => makeResponse()) }
    );

    expect(response.inserted).toBe(false);
    expect(state.metricRuns[0]?.status).toBe('exported');
    expect(state.statusUpdates).toHaveLength(0);
  });

  it('replay catches up a locked pre-PR-3 stored JSON export row to exported', async () => {
    state.exportRows.push({
      id: 4100,
      fundId: 1,
      metricRunId: 500,
      reportPackageId: 3000,
      format: 'json',
      exportVersion: 1,
      status: 'ready',
      contentHashAlgorithm: 'sha256',
      contentHash: 'c'.repeat(64),
      artifactPayload: artifact,
      artifactSizeBytes: 1000,
      createdBy: 7,
      readyAt: new Date('2026-05-10T04:00:00Z'),
      createdAt: new Date('2026-05-10T04:00:00Z'),
      updatedAt: new Date('2026-05-10T04:00:00Z'),
    });

    const response = await createMetricRunReportPackageStoredJsonExport(
      { fundId: 1, metricRunId: 500, userId: 7 },
      { database: makeDatabase(), jsonExportService: vi.fn(async () => makeResponse()) }
    );

    expect(response.inserted).toBe(false);
    expect(state.statusUpdates).toHaveLength(1);
    expect(state.metricRuns[0]).toMatchObject({ status: 'exported', version: 3 });
  });

  it('rejects hash drift on the same package natural key', async () => {
    const database = makeDatabase();
    await createMetricRunReportPackageStoredJsonExport(
      { fundId: 1, metricRunId: 500, userId: 7 },
      { database, jsonExportService: vi.fn(async () => makeResponse('c'.repeat(64))) }
    );

    await expect(
      createMetricRunReportPackageStoredJsonExport(
        { fundId: 1, metricRunId: 500, userId: 7 },
        { database, jsonExportService: vi.fn(async () => makeResponse('d'.repeat(64))) }
      )
    ).rejects.toMatchObject({
      status: 409,
      code: 'EXPORT_CONTENT_HASH_CONFLICT',
      storedContentHash: 'c'.repeat(64),
      currentContentHash: 'd'.repeat(64),
    });
    expect(state.insertedRows).toHaveLength(1);
  });

  it('keeps legacy pre-stamp rows on the hash-conflict path during create replay', async () => {
    state.exportRows.push({
      id: 4100,
      fundId: 1,
      metricRunId: 500,
      reportPackageId: 3000,
      format: 'json',
      exportVersion: 1,
      status: 'ready',
      contentHashAlgorithm: 'sha256',
      contentHash: 'b'.repeat(64),
      artifactPayload: legacyArtifactPayload(),
      artifactSizeBytes: 1000,
      createdBy: 7,
      readyAt: new Date('2026-05-10T04:00:00Z'),
      createdAt: new Date('2026-05-10T04:00:00Z'),
      updatedAt: new Date('2026-05-10T04:00:00Z'),
    });

    await expect(
      createMetricRunReportPackageStoredJsonExport(
        { fundId: 1, metricRunId: 500, userId: 7 },
        { database: makeDatabase(), jsonExportService: vi.fn(async () => makeResponse()) }
      )
    ).rejects.toMatchObject({
      status: 409,
      code: 'EXPORT_CONTENT_HASH_CONFLICT',
      storedContentHash: 'b'.repeat(64),
      currentContentHash: 'c'.repeat(64),
    });
    expect(state.insertedRows).toHaveLength(0);
  });

  it('reloads an existing row after an insert race', async () => {
    const database = makeDatabase();
    await createMetricRunReportPackageStoredJsonExport(
      { fundId: 1, metricRunId: 500, userId: 7 },
      { database, jsonExportService: vi.fn(async () => makeResponse()) }
    );
    state.dropNextInsert = true;

    const replay = await createMetricRunReportPackageStoredJsonExport(
      { fundId: 1, metricRunId: 500, userId: 7 },
      { database, jsonExportService: vi.fn(async () => makeResponse()) }
    );

    expect(replay.inserted).toBe(false);
    expect(replay.record.reportPackageExportId).toBe(4100);
  });

  it('does not insert when the live JSON handoff is blocked', async () => {
    await expect(
      createMetricRunReportPackageStoredJsonExport(
        { fundId: 1, metricRunId: 500, userId: 7 },
        {
          database: makeDatabase(),
          jsonExportService: vi.fn(async () => {
            throw new ReportPackageJsonExportBlockedError([
              {
                code: 'EVIDENCE_REDACTION_REQUIRED',
                message: 'Evidence requires redaction before the JSON handoff can be produced.',
                evidenceRecordId: 1000,
              },
            ]);
          }),
        }
      )
    ).rejects.toMatchObject<Partial<MetricRunCommitError>>({
      status: 409,
      code: 'REPORT_PACKAGE_JSON_EXPORT_BLOCKED',
    });
    expect(state.insertedRows).toHaveLength(0);
  });

  it('re-gates stored JSON metadata and artifact reads before serving export rows', async () => {
    state.metricRuns[0] = { ...state.metricRuns[0]!, status: 'draft' };
    state.exportRows.push({
      id: 4100,
      fundId: 1,
      metricRunId: 500,
      reportPackageId: 3000,
      format: 'json',
      exportVersion: 1,
      status: 'ready',
      contentHashAlgorithm: 'sha256',
      contentHash: 'c'.repeat(64),
      artifactPayload: artifact,
      artifactSizeBytes: 1000,
      createdBy: 7,
      readyAt: new Date('2026-05-10T04:00:00Z'),
      createdAt: new Date('2026-05-10T04:00:00Z'),
      updatedAt: new Date('2026-05-10T04:00:00Z'),
    });

    await expect(
      getMetricRunReportPackageStoredJsonExport(
        { fundId: 1, metricRunId: 500 },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject<Partial<MetricRunCommitError>>({
      status: 409,
      code: 'METRIC_RUN_NOT_EXPORTABLE',
    });
    await expect(
      getMetricRunReportPackageStoredJsonArtifact(
        { fundId: 1, metricRunId: 500 },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject<Partial<MetricRunCommitError>>({
      status: 409,
      code: 'METRIC_RUN_NOT_EXPORTABLE',
    });
  });

  it('returns nullable metadata before create and immutable artifact after create', async () => {
    const database = makeDatabase();
    const metadataBefore = await getMetricRunReportPackageStoredJsonExport(
      { fundId: 1, metricRunId: 500 },
      { database }
    );
    expect(metadataBefore.record).toBeNull();

    await expect(
      getMetricRunReportPackageStoredJsonArtifact({ fundId: 1, metricRunId: 500 }, { database })
    ).rejects.toMatchObject({
      status: 404,
      code: 'REPORT_PACKAGE_EXPORT_NOT_FOUND',
    });

    await createMetricRunReportPackageStoredJsonExport(
      { fundId: 1, metricRunId: 500, userId: 7 },
      { database, jsonExportService: vi.fn(async () => makeResponse()) }
    );

    const artifactResponse = await getMetricRunReportPackageStoredJsonArtifact(
      { fundId: 1, metricRunId: 500 },
      { database, jsonExportService: vi.fn(async () => makeResponse('d'.repeat(64))) }
    );

    expect(artifactResponse.record.reportPackageExportId).toBe(4100);
    expect(artifactResponse.export.contentHash).toBe('c'.repeat(64));
    expect(artifactResponse.export.source.reportPackageId).toBe(3000);
  });

  it('returns a structured contract error when reading a legacy pre-stamp artifact row', async () => {
    state.exportRows.push({
      id: 4100,
      fundId: 1,
      metricRunId: 500,
      reportPackageId: 3000,
      format: 'json',
      exportVersion: 1,
      status: 'ready',
      contentHashAlgorithm: 'sha256',
      contentHash: 'b'.repeat(64),
      artifactPayload: legacyArtifactPayload(),
      artifactSizeBytes: 1000,
      createdBy: 7,
      readyAt: new Date('2026-05-10T04:00:00Z'),
      createdAt: new Date('2026-05-10T04:00:00Z'),
      updatedAt: new Date('2026-05-10T04:00:00Z'),
    });

    await expect(
      getMetricRunReportPackageStoredJsonArtifact(
        { fundId: 1, metricRunId: 500 },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject<Partial<MetricRunCommitError>>({
      status: 500,
      code: 'REPORT_PACKAGE_EXPORT_ROW_INVALID',
    });
  });

  it('serves the stored JSON artifact when H9 matches', async () => {
    const database = makeDatabase();
    await createMetricRunReportPackageStoredJsonExport(
      { fundId: 1, metricRunId: 500, userId: 7 },
      { database, jsonExportService: vi.fn(async () => makeResponse()) }
    );
    const res = await getMetricRunReportPackageStoredJsonArtifact(
      { fundId: 1, metricRunId: 500 },
      { database }
    );
    expect(res.export).toBeDefined();
  });

  it('blocks the stored JSON artifact with surface stored_json_export when H9 has drifted', async () => {
    const database = makeDatabase();
    await createMetricRunReportPackageStoredJsonExport(
      { fundId: 1, metricRunId: 500, userId: 7 },
      { database, jsonExportService: vi.fn(async () => makeResponse()) }
    );
    resolveForFund.mockResolvedValue({
      actionability: 'actionable',
      sourceFingerprint: { fingerprintHash: 'e'.repeat(64), policyVersion: 'h9-policy-v1' },
    });
    await expect(
      getMetricRunReportPackageStoredJsonArtifact({ fundId: 1, metricRunId: 500 }, { database })
    ).rejects.toMatchObject({ code: 'H9_FINGERPRINT_STALE', surface: 'stored_json_export' });
  });
});
