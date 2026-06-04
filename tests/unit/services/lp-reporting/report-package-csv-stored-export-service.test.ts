/**
 * Unit tests for stored LP Reporting package CSV exports.
 */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import type { db } from '../../../../server/db';
import type { MetricRunCommitError } from '../../../../server/services/lp-reporting/metric-run-commit-service';
import {
  buildReportPackageCsv,
  createMetricRunReportPackageStoredCsvExport,
  getMetricRunReportPackageStoredCsvArtifact,
  getMetricRunReportPackageStoredCsvExport,
} from '../../../../server/services/lp-reporting/report-package-csv-stored-export-service';
import type { ReportPackageJsonExportArtifact } from '@shared/contracts/lp-reporting';
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
  nextId: 4101,
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
      name: 'Press, "On" Fund',
      vintageYear: 2024,
      size: null,
    },
    metricSections: [
      {
        sectionId: 'performance',
        title: 'Performance',
        rows: [
          {
            metricId: 'tvpi',
            label: 'TVPI',
            value: '1.700000',
            valueKind: 'multiple',
            currency: null,
          },
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
        approvedBy: null,
        approvedAt: '2026-05-10T01:00:00.000Z',
        textHash: 'a'.repeat(64),
        body: '=SUM(1,2)\r\nNext line',
      },
    ],
    diagnostics: {
      engineVersion: 'lp-reporting-engine@1.2.0',
      decimalPrecision: 6,
      excludedFutureMarks: [5, 2],
      warnings: [{ code: 'W2', message: '@risk' }],
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
      sourceEventIds: [2, 1],
      sourceMarkIds: [10],
      evidenceRecordIds: [301],
      narrativeRunIds: [101],
    },
  },
};

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
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

function seedStoredJson(overrides: Partial<LpReportPackageExport> = {}): LpReportPackageExport {
  const row: LpReportPackageExport = {
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
    ...overrides,
  };
  state.exportRows.push(row);
  return row;
}

beforeEach(() => {
  state.exportRows = [];
  state.insertedRows = [];
  state.users = [7];
  state.nextId = 4101;
  state.dropNextInsert = false;
});

describe('stored report package CSV exports', () => {
  it('serializes deterministic spreadsheet-safe CSV bytes', () => {
    const csv = buildReportPackageCsv(artifact);

    expect(csv.charCodeAt(0)).not.toBe(0xfeff);
    expect(csv.endsWith('\n')).toBe(true);
    expect(csv.endsWith('\n\n')).toBe(false);
    expect(csv).not.toContain('\r');
    expect(csv).toContain('"Press, ""On"" Fund"');
    expect(csv).toContain('Fund,Size,[null]');
    expect(csv.indexOf('Metrics: Performance,DPI')).toBeLessThan(
      csv.indexOf('Metrics: Performance,TVPI')
    );
    expect(csv).toContain('"\'=SUM(1,2)\nNext line"');
    expect(csv).toContain("Diagnostics warning,W2,'@risk");
  });

  it('creates CSV only from a stored route-scoped JSON export row', async () => {
    const source = seedStoredJson();
    const database = makeDatabase();

    const response = await createMetricRunReportPackageStoredCsvExport(
      { fundId: 1, metricRunId: 500, userId: 7 },
      { database }
    );

    expect(response.inserted).toBe(true);
    expect(response.record.reportPackageExportId).toBe(4101);
    expect(response.record.format).toBe('csv');
    expect(response.sourceJsonExportId).toBe(source.id);
    expect(response.sourceJsonContentHash).toBe(source.contentHash);
    expect(response.contentType).toBe('text/csv; charset=utf-8');
    expect(response.filename).toBe('lp-report-package-1-500-csv-v1.csv');
    expect(state.insertedRows).toHaveLength(1);

    const inserted = state.insertedRows[0] as {
      artifactPayload: unknown;
      artifactSizeBytes: number;
    };
    const payload = inserted.artifactPayload as { csv: string };
    expect(inserted.artifactSizeBytes).toBe(Buffer.byteLength(payload.csv, 'utf8'));
    expect(state.exportRows.find((row) => row.format === 'csv')?.contentHash).toBe(
      sha256(payload.csv)
    );
  });

  it('requires a stored JSON source in the same route scope', async () => {
    seedStoredJson({ fundId: 2, metricRunId: 500 });

    await expect(
      createMetricRunReportPackageStoredCsvExport(
        { fundId: 1, metricRunId: 500, userId: 7 },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject<Partial<MetricRunCommitError>>({
      status: 409,
      code: 'REPORT_PACKAGE_CSV_SOURCE_JSON_EXPORT_REQUIRED',
    });
    expect(state.insertedRows).toHaveLength(0);
  });

  it('returns the existing CSV row on idempotent replay without updating it', async () => {
    seedStoredJson();
    const database = makeDatabase();

    const first = await createMetricRunReportPackageStoredCsvExport(
      { fundId: 1, metricRunId: 500, userId: 7 },
      { database }
    );
    const second = await createMetricRunReportPackageStoredCsvExport(
      { fundId: 1, metricRunId: 500, userId: 7 },
      { database }
    );

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(second.record.reportPackageExportId).toBe(first.record.reportPackageExportId);
    expect(state.insertedRows).toHaveLength(1);
  });

  it('rejects hash drift on the same package CSV natural key', async () => {
    seedStoredJson();
    const csv = buildReportPackageCsv(artifact);
    state.exportRows.push({
      id: 4101,
      fundId: 1,
      metricRunId: 500,
      reportPackageId: 3000,
      format: 'csv',
      exportVersion: 1,
      status: 'ready',
      contentHashAlgorithm: 'sha256',
      contentHash: 'd'.repeat(64),
      artifactPayload: {
        exportVersion: 1,
        format: 'csv',
        sourceJsonExportId: 4100,
        sourceJsonContentHash: 'c'.repeat(64),
        contentType: 'text/csv; charset=utf-8',
        filename: 'lp-report-package-1-500-csv-v1.csv',
        csv,
      },
      artifactSizeBytes: Buffer.byteLength(csv, 'utf8'),
      createdBy: 7,
      readyAt: new Date('2026-05-10T04:00:00Z'),
      createdAt: new Date('2026-05-10T04:00:00Z'),
      updatedAt: new Date('2026-05-10T04:00:00Z'),
    });

    await expect(
      createMetricRunReportPackageStoredCsvExport(
        { fundId: 1, metricRunId: 500, userId: 7 },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject({
      status: 409,
      code: 'EXPORT_CONTENT_HASH_CONFLICT',
      storedContentHash: 'd'.repeat(64),
      currentContentHash: sha256(csv),
    });
    expect(state.insertedRows).toHaveLength(0);
  });

  it('reads nullable metadata and stored CSV artifacts without recomputing', async () => {
    seedStoredJson();
    const database = makeDatabase();
    const before = await getMetricRunReportPackageStoredCsvExport(
      { fundId: 1, metricRunId: 500 },
      { database }
    );
    expect(before.record).toBeNull();

    await expect(
      getMetricRunReportPackageStoredCsvArtifact({ fundId: 1, metricRunId: 500 }, { database })
    ).rejects.toMatchObject({
      status: 404,
      code: 'REPORT_PACKAGE_EXPORT_NOT_FOUND',
    });

    await createMetricRunReportPackageStoredCsvExport(
      { fundId: 1, metricRunId: 500, userId: 7 },
      { database }
    );
    const metadata = await getMetricRunReportPackageStoredCsvExport(
      { fundId: 1, metricRunId: 500 },
      { database }
    );
    const artifactResponse = await getMetricRunReportPackageStoredCsvArtifact(
      { fundId: 1, metricRunId: 500 },
      { database }
    );

    expect(metadata.record?.format).toBe('csv');
    expect(artifactResponse.record.reportPackageExportId).toBe(4101);
    expect(artifactResponse.csv.csv).toBe(buildReportPackageCsv(artifact));
  });
});
