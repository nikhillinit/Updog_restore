/**
 * Service tests for LP reporting metric-run preview-bound draft commits.
 */
import { describe, expect, it } from 'vitest';

import type { db } from '../../../../server/db';
import {
  buildMetricRunDryRun,
  commitMetricRun,
} from '../../../../server/services/lp-reporting/metric-run-commit-service';
import { cashFlowEvents, lpMetricRuns, valuationMarks } from '@shared/schema/lp-reporting-evidence';
import { users } from '@shared/schema/user';
import type { MetricRunCommitInput } from '../../../../server/services/lp-reporting/metric-run-commit-service';

type MetricRunDatabase = typeof db;

interface FakeCashFlowEvent {
  id: number;
  fundId: number;
  eventType: string;
  amount: string;
  eventDate: Date;
  perspective: string;
  status: string | null;
  reversalOfEventId: number | null;
  sourceHash: string | null;
  importBatchId: number | null;
  updatedAt: Date | null;
}

interface FakeValuationMark {
  id: number;
  fundId: number;
  fairValue: string;
  markDate: string;
  asOfDate: string;
  status: string | null;
  confidenceLevel: string;
  companyId: number | null;
  sourceHash: string | null;
  importBatchId: number | null;
  updatedAt: Date | null;
}

interface FakeMetricRun {
  id: number;
  fundId: number;
  runType: string;
  perspective: string;
  asOfDate: string;
  status: string;
  inputsHash: string;
}

function queryResult<T>(rows: T[]): Promise<T[]> & { limit: (count: number) => Promise<T[]> } {
  const promise = Promise.resolve(rows) as Promise<T[]> & {
    limit: (count: number) => Promise<T[]>;
  };
  promise.limit = (count: number) => Promise.resolve(rows.slice(0, count));
  return promise;
}

class FakeMetricRunDb {
  readonly userIds = new Set<number>([7]);
  readonly events: FakeCashFlowEvent[] = [];
  readonly marks: FakeValuationMark[] = [];
  readonly metricRuns: FakeMetricRun[] = [];
  readonly insertedMetricRows: unknown[] = [];

  dropNextInsert = false;
  nextId = 100;

  asDatabase(): MetricRunDatabase {
    return this as unknown as MetricRunDatabase;
  }

  select(_projection?: unknown) {
    return {
      from: (table: unknown) => ({
        where: (_condition: unknown) => queryResult(this.rowsFor(table)),
      }),
    };
  }

  insert(table: unknown) {
    return {
      values: (row: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: (_projection?: unknown) => {
            if (table !== lpMetricRuns) {
              return Promise.resolve([]);
            }

            const metricRun = {
              id: this.nextId++,
              fundId: row['fundId'] as number,
              runType: row['runType'] as string,
              perspective: row['perspective'] as string,
              asOfDate: row['asOfDate'] as string,
              status: row['status'] as string,
              inputsHash: row['inputsHash'] as string,
            };
            this.metricRuns.push(metricRun);

            if (this.dropNextInsert) {
              this.dropNextInsert = false;
              return Promise.resolve([]);
            }

            this.insertedMetricRows.push(row);
            return Promise.resolve([
              {
                id: metricRun.id,
                status: metricRun.status,
                inputsHash: metricRun.inputsHash,
              },
            ]);
          },
        }),
      }),
    };
  }

  private rowsFor(table: unknown): Array<Record<string, unknown>> {
    if (table === users) {
      return Array.from(this.userIds, (id) => ({ id }));
    }
    if (table === cashFlowEvents) {
      return [...this.events] as unknown as Array<Record<string, unknown>>;
    }
    if (table === valuationMarks) {
      return [...this.marks] as unknown as Array<Record<string, unknown>>;
    }
    if (table === lpMetricRuns) {
      return this.metricRuns.map((row) => ({
        id: row.id,
        status: row.status,
        inputsHash: row.inputsHash,
      }));
    }
    return [];
  }
}

function seedHappyPath(
  fakeDb: FakeMetricRunDb,
  fundId = 1
): { eventIds: number[]; markIds: number[] } {
  fakeDb.events.push(
    {
      id: 101,
      fundId,
      eventType: 'lp_capital_call',
      amount: '4000000.000000',
      eventDate: new Date('2024-01-15T00:00:00Z'),
      perspective: 'lp_net',
      status: 'approved',
      reversalOfEventId: null,
      sourceHash: '1'.repeat(64),
      importBatchId: 10,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: 102,
      fundId,
      eventType: 'lp_distribution',
      amount: '1000000.000000',
      eventDate: new Date('2025-06-30T00:00:00Z'),
      perspective: 'lp_net',
      status: 'approved',
      reversalOfEventId: null,
      sourceHash: '2'.repeat(64),
      importBatchId: 10,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    }
  );
  fakeDb.marks.push({
    id: 201,
    fundId,
    fairValue: '4000000.000000',
    markDate: '2026-03-31',
    asOfDate: '2026-03-31',
    status: 'approved',
    confidenceLevel: 'high',
    companyId: 42,
    sourceHash: '3'.repeat(64),
    importBatchId: 11,
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  });
  return { eventIds: [101, 102], markIds: [201] };
}

async function buildCommitInput(
  fakeDb: FakeMetricRunDb,
  sourceIds: { eventIds: number[]; markIds: number[] },
  overrides: Partial<MetricRunCommitInput> = {}
): Promise<MetricRunCommitInput> {
  const request = {
    fundId: 1,
    asOfDate: '2026-03-31',
    runType: 'quarterly_report' as const,
    perspective: 'lp_net' as const,
    sourceEventIds: sourceIds.eventIds,
    sourceMarkIds: sourceIds.markIds,
    ...overrides,
  };
  const preview = await buildMetricRunDryRun(request, { database: fakeDb.asDatabase() });
  return {
    ...request,
    previewHash: overrides.previewHash ?? preview.previewHash,
    userId: overrides.userId ?? 7,
  };
}

describe('commitMetricRun', () => {
  it('inserts one lp_metric_runs draft row on the happy path', async () => {
    const fakeDb = new FakeMetricRunDb();
    const sourceIds = seedHappyPath(fakeDb);
    const input = await buildCommitInput(fakeDb, sourceIds);

    const result = await commitMetricRun(input, { database: fakeDb.asDatabase() });

    expect(result.inserted).toBe(true);
    expect(result.metricRunId).toBe(100);
    expect(result.status).toBe('draft');
    expect(result.inputsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(fakeDb.insertedMetricRows).toHaveLength(1);
  });

  it('returns the existing row for a repeated identical commit', async () => {
    const fakeDb = new FakeMetricRunDb();
    const sourceIds = seedHappyPath(fakeDb);
    const input = await buildCommitInput(fakeDb, sourceIds);

    const first = await commitMetricRun(input, { database: fakeDb.asDatabase() });
    const replay = await commitMetricRun(input, { database: fakeDb.asDatabase() });

    expect(first.inserted).toBe(true);
    expect(replay.inserted).toBe(false);
    expect(replay.metricRunId).toBe(first.metricRunId);
    expect(fakeDb.insertedMetricRows).toHaveLength(1);
  });

  it('rejects stale source-row fingerprints with PREVIEW_HASH_MISMATCH', async () => {
    const fakeDb = new FakeMetricRunDb();
    const sourceIds = seedHappyPath(fakeDb);
    const input = await buildCommitInput(fakeDb, sourceIds);
    fakeDb.events[0] = { ...fakeDb.events[0]!, updatedAt: new Date('2026-02-01T00:00:00Z') };

    await expect(commitMetricRun(input, { database: fakeDb.asDatabase() })).rejects.toMatchObject({
      code: 'PREVIEW_HASH_MISMATCH',
      status: 409,
    });
    expect(fakeDb.insertedMetricRows).toHaveLength(0);
  });

  it('rejects changed computed results with PREVIEW_HASH_MISMATCH', async () => {
    const fakeDb = new FakeMetricRunDb();
    const sourceIds = seedHappyPath(fakeDb);
    const input = await buildCommitInput(fakeDb, sourceIds);
    fakeDb.marks[0] = { ...fakeDb.marks[0]!, fairValue: '4500000.000000' };

    await expect(commitMetricRun(input, { database: fakeDb.asDatabase() })).rejects.toMatchObject({
      code: 'PREVIEW_HASH_MISMATCH',
      status: 409,
    });
    expect(fakeDb.insertedMetricRows).toHaveLength(0);
  });

  it('rejects cross-fund event IDs before write', async () => {
    const fakeDb = new FakeMetricRunDb();
    const sourceIds = seedHappyPath(fakeDb);
    const input = await buildCommitInput(fakeDb, sourceIds);
    fakeDb.events[0] = { ...fakeDb.events[0]!, fundId: 99 };

    await expect(commitMetricRun(input, { database: fakeDb.asDatabase() })).rejects.toMatchObject({
      code: 'CROSS_FUND_RESOURCE',
      status: 403,
    });
    expect(fakeDb.insertedMetricRows).toHaveLength(0);
  });

  it('rejects cross-fund valuation mark IDs before write', async () => {
    const fakeDb = new FakeMetricRunDb();
    const sourceIds = seedHappyPath(fakeDb);
    const input = await buildCommitInput(fakeDb, sourceIds);
    fakeDb.marks[0] = { ...fakeDb.marks[0]!, fundId: 99 };

    await expect(commitMetricRun(input, { database: fakeDb.asDatabase() })).rejects.toMatchObject({
      code: 'CROSS_FUND_RESOURCE',
      status: 403,
    });
    expect(fakeDb.insertedMetricRows).toHaveLength(0);
  });

  it('rejects vehicle perspective before write', async () => {
    const fakeDb = new FakeMetricRunDb();
    const sourceIds = seedHappyPath(fakeDb);

    await expect(
      commitMetricRun(
        {
          fundId: 1,
          asOfDate: '2026-03-31',
          runType: 'quarterly_report',
          perspective: 'vehicle',
          sourceEventIds: sourceIds.eventIds,
          sourceMarkIds: sourceIds.markIds,
          previewHash: 'a'.repeat(64),
          userId: 7,
        },
        { database: fakeDb.asDatabase() }
      )
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_PERSPECTIVE', status: 400 });
    expect(fakeDb.insertedMetricRows).toHaveLength(0);
  });

  it('rejects unresolved numeric app users before write', async () => {
    const fakeDb = new FakeMetricRunDb();
    const sourceIds = seedHappyPath(fakeDb);
    const input = await buildCommitInput(fakeDb, sourceIds);
    fakeDb.userIds.clear();

    await expect(commitMetricRun(input, { database: fakeDb.asDatabase() })).rejects.toMatchObject({
      code: 'AUTH_USER_ID_UNRESOLVED',
      status: 401,
    });
    expect(fakeDb.insertedMetricRows).toHaveLength(0);
  });

  it('rejects invalid create rows before insert', async () => {
    const fakeDb = new FakeMetricRunDb();
    const sourceIds = seedHappyPath(fakeDb);
    const input = await buildCommitInput(fakeDb, sourceIds, {
      runType: 'not_a_run_type' as MetricRunCommitInput['runType'],
    });

    await expect(commitMetricRun(input, { database: fakeDb.asDatabase() })).rejects.toThrow();
    expect(fakeDb.insertedMetricRows).toHaveLength(0);
  });

  it('handles DB unique conflicts as idempotent existing results', async () => {
    const fakeDb = new FakeMetricRunDb();
    const sourceIds = seedHappyPath(fakeDb);
    const input = await buildCommitInput(fakeDb, sourceIds);
    fakeDb.dropNextInsert = true;

    const result = await commitMetricRun(input, { database: fakeDb.asDatabase() });

    expect(result.inserted).toBe(false);
    expect(result.metricRunId).toBe(100);
    expect(fakeDb.insertedMetricRows).toHaveLength(0);
    expect(fakeDb.metricRuns).toHaveLength(1);
  });
});
