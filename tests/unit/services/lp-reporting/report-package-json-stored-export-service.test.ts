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
import type {
  ReportPackageJsonExportArtifact,
  ReportPackageJsonExportResponse,
} from '@shared/contracts/lp-reporting';
import {
  lpReportPackageExports,
  type LpReportPackageExport,
} from '@shared/schema/lp-reporting-evidence';
import { users } from '@shared/schema/user';

interface State {
  exportRows: LpReportPackageExport[];
  insertedRows: unknown[];
  users: number[];
  nextId: number;
  dropNextInsert: boolean;
}

const state: State = {
  exportRows: [],
  insertedRows: [],
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
  if (table === lpReportPackageExports) return [...state.exportRows];
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
  } as unknown as typeof db;
}

beforeEach(() => {
  state.exportRows = [];
  state.insertedRows = [];
  state.users = [7];
  state.nextId = 4100;
  state.dropNextInsert = false;
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
});
