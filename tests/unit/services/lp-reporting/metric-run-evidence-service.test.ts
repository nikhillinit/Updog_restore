/**
 * Unit tests for metric-run evidence metadata service.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createMetricRunEvidence,
  listMetricRunEvidence,
} from '../../../../server/services/lp-reporting/metric-run-evidence-service';
import type { MetricRunCommitError } from '../../../../server/services/lp-reporting/metric-run-commit-service';
import type { db } from '../../../../server/db';
import {
  evidenceRecords,
  lpMetricRuns,
  type EvidenceRecord,
  type InsertEvidenceRecord,
  type LpMetricRun,
} from '@shared/schema/lp-reporting-evidence';
import { users } from '@shared/schema/user';

interface State {
  metricRuns: Array<Pick<LpMetricRun, 'id' | 'fundId' | 'status'>>;
  evidence: EvidenceRecord[];
  users: number[];
  insertValues: InsertEvidenceRecord[];
  nextEvidenceId: number;
  dropNextInsert: boolean;
  operations: string[];
}

const state: State = {
  metricRuns: [],
  evidence: [],
  users: [],
  insertValues: [],
  nextEvidenceId: 1000,
  dropNextInsert: false,
  operations: [],
};

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
    materialityLevel: 'medium',
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
    createdAt: new Date('2026-05-10T00:00:00Z'),
    updatedAt: new Date('2026-05-10T00:00:00Z'),
    ...overrides,
  };
}

function rowsFor(table: unknown): unknown[] {
  if (table === lpMetricRuns) {
    return state.metricRuns;
  }
  if (table === evidenceRecords) {
    return state.evidence;
  }
  if (table === users) {
    return state.users.map((id) => ({ id }));
  }
  return [];
}

function queryResult<T>(rows: T[]): Promise<T[]> & { limit: (count: number) => Promise<T[]> } {
  const promise = Promise.resolve(rows) as Promise<T[]> & {
    limit: (count: number) => Promise<T[]>;
  };
  promise.limit = (count: number) => Promise.resolve(rows.slice(0, count));
  return promise;
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
    insert: (table: unknown) => ({
      values: (row: InsertEvidenceRecord) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            state.insertValues.push(row);
            if (state.dropNextInsert || table !== evidenceRecords) {
              state.dropNextInsert = false;
              return [];
            }
            const inserted = evidenceRow({
              id: state.nextEvidenceId++,
              fundId: row.fundId,
              metricRunId: row.metricRunId ?? null,
              idempotencyKey: row.idempotencyKey ?? null,
              evidenceSource: row.evidenceSource,
              sourceDate: row.sourceDate,
              receivedDate: row.receivedDate ?? null,
              expirationDate: row.expirationDate ?? null,
              confidenceLevel: row.confidenceLevel ?? 'medium',
              materialityLevel: row.materialityLevel ?? 'medium',
              confidentiality: row.confidentiality ?? 'internal',
              redactionRequired: row.redactionRequired ?? false,
              documentHash: row.documentHash ?? null,
              valuationPolicyVersion: row.valuationPolicyVersion ?? null,
              description: row.description ?? null,
              internalNotes: row.internalNotes ?? null,
              lpObjection: row.lpObjection ?? null,
              uploadedBy: row.uploadedBy ?? null,
            });
            state.evidence.push(inserted);
            return [inserted];
          },
        }),
      }),
    }),
  } as unknown as typeof db;
}

beforeEach(() => {
  state.metricRuns = [{ id: 11, fundId: 1, status: 'draft' }];
  state.evidence = [];
  state.users = [7];
  state.insertValues = [];
  state.nextEvidenceId = 1000;
  state.dropNextInsert = false;
  state.operations = [];
});

describe('createMetricRunEvidence', () => {
  it('inserts metadata-only evidence for a draft metric run', async () => {
    const result = await createMetricRunEvidence(
      {
        fundId: 1,
        metricRunId: 11,
        userId: 7,
        body: {
          idempotencyKey: 'metric-run-11-evidence-0',
          evidenceSource: 'board_update',
          sourceDate: '2026-03-31',
          materialityLevel: 'high',
          description: 'Q1 board materials',
        },
      },
      { database: makeDatabase() }
    );

    expect(result.inserted).toBe(true);
    expect(result.record.metricRunId).toBe(11);
    expect(result.record.uploadedBy).toBe(7);
    expect(state.insertValues).toHaveLength(1);
    expect(state.insertValues[0]).toMatchObject({
      fundId: 1,
      metricRunId: 11,
      uploadedBy: 7,
      idempotencyKey: 'metric-run-11-evidence-0',
      attachments: [],
      materialityLevel: 'high',
    });
    expect(state.insertValues[0]?.valuationMarkId).toBeUndefined();
    expect(state.insertValues[0]?.companyId).toBeUndefined();
    expect(state.insertValues[0]?.narrativeRunId).toBeUndefined();
    expect(state.insertValues[0]?.approvedBy).toBeUndefined();
    expect(state.operations).toEqual(['transaction', 'lock-parent']);
  });

  it('returns an existing row without inserting when the idempotency key was already used', async () => {
    state.evidence = [evidenceRow()];

    const result = await createMetricRunEvidence(
      {
        fundId: 1,
        metricRunId: 11,
        userId: 7,
        body: {
          idempotencyKey: 'metric-run-11-evidence-0',
          evidenceSource: 'board_update',
          sourceDate: '2026-03-31',
        },
      },
      { database: makeDatabase() }
    );

    expect(result.inserted).toBe(false);
    expect(result.record.id).toBe(1000);
    expect(state.insertValues).toHaveLength(0);
  });

  it('rejects create for non-draft metric runs', async () => {
    state.metricRuns = [{ id: 11, fundId: 1, status: 'approved' }];

    await expect(
      createMetricRunEvidence(
        {
          fundId: 1,
          metricRunId: 11,
          userId: 7,
          body: {
            idempotencyKey: 'metric-run-11-evidence-0',
            evidenceSource: 'board_update',
            sourceDate: '2026-03-31',
          },
        },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject({
      status: 409,
      code: 'METRIC_RUN_NOT_EDITABLE',
    } satisfies Partial<MetricRunCommitError>);
    expect(state.insertValues).toHaveLength(0);
  });
});

describe('listMetricRunEvidence', () => {
  it('lists evidence for non-draft metric runs without applying editability checks', async () => {
    state.metricRuns = [{ id: 11, fundId: 1, status: 'locked' }];
    state.evidence = [evidenceRow(), evidenceRow({ id: 1001, metricRunId: 12 })];

    const result = await listMetricRunEvidence(
      { fundId: 1, metricRunId: 11 },
      { database: makeDatabase() }
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.id).toBe(1000);
  });
});
