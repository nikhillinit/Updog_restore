/**
 * Unit tests for LP Reporting metric-run approval and lock lifecycle.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  approveMetricRun,
  getLatestMetricRun,
  getMetricRunDetail,
  lockMetricRun,
} from '../../../../server/services/lp-reporting/metric-run-lifecycle-service';
import type { MetricRunCommitError } from '../../../../server/services/lp-reporting/metric-run-commit-service';
import type { db } from '../../../../server/db';
import {
  evidenceRecords,
  lpMetricRuns,
  type EvidenceRecord,
  type LpMetricRun,
} from '@shared/schema/lp-reporting-evidence';

interface State {
  metricRuns: LpMetricRun[];
  evidence: EvidenceRecord[];
  operations: string[];
}

const state: State = {
  metricRuns: [],
  evidence: [],
  operations: [],
};

const hex64 = 'a'.repeat(64);
const now = new Date('2026-05-10T00:00:00.000Z');

function metricRun(overrides: Partial<LpMetricRun> = {}): LpMetricRun {
  return {
    id: 11,
    fundId: 1,
    vehicleId: null,
    asOfDate: '2026-03-31',
    runType: 'quarterly_report',
    perspective: 'lp_net',
    status: 'draft',
    inputsHash: hex64,
    sourceEventIds: [],
    sourceMarkIds: [],
    sourceEvidenceIds: [],
    resultsJson: {},
    diagnosticsJson: {},
    methodologyVersion: 'lp-reporting-methodology-v1',
    calculationVersion: 'lp-reporting-metrics-engine-1.0.0',
    generatedBy: 7,
    approvedBy: null,
    approvedAt: null,
    lockedBy: null,
    lockedAt: null,
    exportedAt: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as LpMetricRun;
}

function evidenceRow(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: 1000,
    fundId: 1,
    valuationMarkId: null,
    companyId: null,
    metricRunId: 11,
    narrativeRunId: null,
    idempotencyKey: 'metric-run-11-evidence-0',
    evidenceSource: 'board_update',
    sourceDate: '2026-03-31',
    receivedDate: null,
    expirationDate: null,
    confidenceLevel: 'medium',
    materialityLevel: 'high',
    confidentiality: 'internal',
    redactionRequired: false,
    documentHash: null,
    valuationPolicyVersion: null,
    description: 'Q1 board materials',
    internalNotes: null,
    lpObjection: null,
    attachments: [],
    uploadedBy: 7,
    approvedBy: null,
    approvedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as EvidenceRecord;
}

function queryResult<T>(rows: T[]): Promise<T[]> & { limit: (count: number) => Promise<T[]> } {
  const promise = Promise.resolve(rows) as Promise<T[]> & {
    limit: (count: number) => Promise<T[]>;
  };
  promise.limit = (count: number) => Promise.resolve(rows.slice(0, count));
  return promise;
}

function rowsFor(table: unknown): unknown[] {
  if (table === lpMetricRuns) {
    return [...state.metricRuns];
  }
  if (table === evidenceRecords) {
    return [...state.evidence];
  }
  return [];
}

function makeDatabase(): typeof db {
  return {
    transaction: async (callback: (tx: typeof db) => Promise<unknown>) => {
      state.operations.push('transaction');
      return callback(makeDatabase());
    },
    execute: async () => {
      state.operations.push('lock-parent');
      return [];
    },
    select: () => ({
      from: (table: unknown) => ({
        where: () => queryResult(rowsFor(table)),
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Partial<LpMetricRun>) => ({
        where: () => ({
          returning: async () => {
            if (table !== lpMetricRuns) {
              return [];
            }
            const current = state.metricRuns.find((row) => row.id === 11 && row.fundId === 1);
            if (!current) {
              return [];
            }
            const nextVersion = values.version;
            const expectedVersion =
              typeof nextVersion === 'number' && Number.isInteger(nextVersion)
                ? nextVersion - 1
                : current.version;
            const validApprove =
              values.status === 'approved' &&
              current.status === 'draft' &&
              current.version === expectedVersion;
            const validLock =
              values.status === 'locked' &&
              current.status === 'approved' &&
              current.version === expectedVersion;
            if (!validApprove && !validLock) {
              return [];
            }
            const updated = { ...current, ...values } as LpMetricRun;
            state.metricRuns = state.metricRuns.map((row) =>
              row.id === updated.id ? updated : row
            );
            return [updated];
          },
        }),
      }),
    }),
  } as unknown as typeof db;
}

beforeEach(() => {
  state.metricRuns = [metricRun()];
  state.evidence = [
    evidenceRow(),
    evidenceRow({ id: 1001, idempotencyKey: 'metric-run-11-evidence-1' }),
  ];
  state.operations = [];
});

describe('approveMetricRun', () => {
  it('approves a draft metric run with evidence and snapshots evidence IDs', async () => {
    const result = await approveMetricRun(
      { fundId: 1, metricRunId: 11, userId: 7, expectedVersion: 1 },
      { database: makeDatabase() }
    );

    expect(result.changed).toBe(true);
    expect(result.metricRun.status).toBe('approved');
    expect(result.metricRun.version).toBe(2);
    expect(result.metricRun.approvedBy).toBe(7);
    expect(result.metricRun.sourceEvidenceIds).toEqual([1000, 1001]);
    expect(result.metricRun.evidenceCount).toBe(2);
    expect(state.operations).toEqual(['transaction', 'lock-parent']);
  });

  it('rejects approval without evidence', async () => {
    state.evidence = [];

    await expect(
      approveMetricRun(
        { fundId: 1, metricRunId: 11, userId: 7, expectedVersion: 1 },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject({
      status: 409,
      code: 'METRIC_RUN_EVIDENCE_REQUIRED',
    } satisfies Partial<MetricRunCommitError>);
  });

  it('rejects approval when expectedVersion is stale', async () => {
    state.metricRuns = [metricRun({ version: 3 })];

    await expect(
      approveMetricRun(
        { fundId: 1, metricRunId: 11, userId: 7, expectedVersion: 1 },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject({
      status: 409,
      code: 'METRIC_RUN_VERSION_CONFLICT',
    } satisfies Partial<MetricRunCommitError>);
  });

  it('returns changed=false only for a strict same-user retry', async () => {
    state.metricRuns = [
      metricRun({
        status: 'approved',
        approvedBy: 7,
        approvedAt: now,
        sourceEvidenceIds: [1000],
        version: 2,
      }),
    ];

    const result = await approveMetricRun(
      { fundId: 1, metricRunId: 11, userId: 7, expectedVersion: 1 },
      { database: makeDatabase() }
    );

    expect(result.changed).toBe(false);
    expect(result.metricRun.status).toBe('approved');
  });
});

describe('lockMetricRun', () => {
  it('locks an approved metric run and records lock attribution', async () => {
    state.metricRuns = [
      metricRun({
        status: 'approved',
        approvedBy: 7,
        approvedAt: now,
        sourceEvidenceIds: [1000, 1001],
        version: 2,
      }),
    ];

    const result = await lockMetricRun(
      { fundId: 1, metricRunId: 11, userId: 8, expectedVersion: 2 },
      { database: makeDatabase() }
    );

    expect(result.changed).toBe(true);
    expect(result.metricRun.status).toBe('locked');
    expect(result.metricRun.lockedBy).toBe(8);
    expect(result.metricRun.version).toBe(3);
    expect(result.metricRun.sourceEvidenceIds).toEqual([1000, 1001]);
  });

  it('rejects lock before approval', async () => {
    await expect(
      lockMetricRun(
        { fundId: 1, metricRunId: 11, userId: 8, expectedVersion: 1 },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject({
      status: 409,
      code: 'METRIC_RUN_STATUS_CONFLICT',
    } satisfies Partial<MetricRunCommitError>);
  });
});

describe('getLatestMetricRun', () => {
  it('returns the latest exact-context row and ignores other contexts', async () => {
    state.metricRuns = [
      metricRun({ id: 9, createdAt: new Date('2026-05-09T00:00:00.000Z') }),
      metricRun({ id: 12, createdAt: new Date('2026-05-10T00:00:00.000Z') }),
      metricRun({
        id: 99,
        runType: 'fundraise_pack',
        createdAt: new Date('2026-05-11T00:00:00.000Z'),
      }),
    ];

    const result = await getLatestMetricRun(
      {
        fundId: 1,
        asOfDate: '2026-03-31',
        runType: 'quarterly_report',
        perspective: 'lp_net',
      },
      { database: makeDatabase() }
    );

    expect(result.metricRun?.metricRunId).toBe(12);
  });

  it('returns null when no exact context matches', async () => {
    const result = await getLatestMetricRun(
      {
        fundId: 1,
        asOfDate: '2026-03-31',
        runType: 'fundraise_pack',
        perspective: 'lp_net',
      },
      { database: makeDatabase() }
    );

    expect(result.metricRun).toBeNull();
  });
});

describe('getMetricRunDetail', () => {
  it('returns the requested metric run by ID even when a newer same-context run exists', async () => {
    state.metricRuns = [
      metricRun({ id: 11, createdAt: new Date('2026-05-09T00:00:00.000Z') }),
      metricRun({
        id: 12,
        status: 'approved',
        version: 2,
        createdAt: new Date('2026-05-10T00:00:00.000Z'),
      }),
    ];

    const result = await getMetricRunDetail(
      {
        fundId: 1,
        metricRunId: 11,
      },
      { database: makeDatabase() }
    );

    expect(result.metricRunId).toBe(11);
    expect(result.status).toBe('draft');
    expect(result.evidenceCount).toBe(2);
  });
});
