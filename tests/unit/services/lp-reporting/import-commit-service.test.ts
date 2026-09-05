/**
 * Service tests for LP reporting import commit behavior.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { db } from '../../../../server/db';
import {
  commitLedgerImport,
  commitValuationMarkImport,
  ImportCommitError,
} from '../../../../server/services/lp-reporting/import-commit-service';
import {
  runLedgerDryRun,
  runValuationMarkDryRun,
} from '../../../../server/services/lp-reporting/import-reconciliation-service';
import { cashFlowEvents, valuationMarks, vehicles } from '@shared/schema/lp-reporting-evidence';
import { portfolioCompanies } from '@shared/schema/portfolio';
import { users } from '@shared/schema/user';
import { lpFundCommitments } from '@shared/schema-lp-reporting';

type CommitDatabase = typeof db;

function toBase64(csv: string): string {
  return Buffer.from(csv).toString('base64');
}

function queryResult<T>(rows: T[]): Promise<T[]> & { limit: (count: number) => Promise<T[]> } {
  const promise = Promise.resolve(rows) as Promise<T[]> & {
    limit: (count: number) => Promise<T[]>;
  };
  promise.limit = (count: number) => Promise.resolve(rows.slice(0, count));
  return promise;
}

function readSourceHash(row: unknown): string | null {
  if (row !== null && typeof row === 'object') {
    const value = (row as Record<string, unknown>)['sourceHash'];
    return typeof value === 'string' ? value : null;
  }
  return null;
}

class FakeCommitDb {
  readonly userIds = new Set<number>([7]);
  readonly companyIds = new Set<number>([42, 43]);
  readonly vehicleIds = new Set<number>([7]);
  readonly lpIds = new Set<number>([1, 2]);
  readonly cashFlowHashes = new Set<string>();
  readonly valuationHashes = new Set<string>();
  readonly insertedCashFlowRows: unknown[] = [];
  readonly insertedValuationRows: unknown[] = [];

  insertedLimit: number | null = null;
  nextId = 100;

  asDatabase(): CommitDatabase {
    return this as unknown as CommitDatabase;
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
      values: (rows: unknown | unknown[]) => {
        const rowList = Array.isArray(rows) ? rows : [rows];
        return {
          onConflictDoNothing: () => ({
            returning: (_projection?: unknown) => {
              const limit = this.insertedLimit ?? rowList.length;
              const acceptedRows = rowList.slice(0, limit);
              if (table === cashFlowEvents) {
                this.insertedCashFlowRows.push(...acceptedRows);
                for (const row of acceptedRows) {
                  const sourceHash = readSourceHash(row);
                  if (sourceHash) {
                    this.cashFlowHashes.add(sourceHash);
                  }
                }
              }
              if (table === valuationMarks) {
                this.insertedValuationRows.push(...acceptedRows);
                for (const row of acceptedRows) {
                  const sourceHash = readSourceHash(row);
                  if (sourceHash) {
                    this.valuationHashes.add(sourceHash);
                  }
                }
              }
              return Promise.resolve(
                acceptedRows.map((row) => ({
                  id: this.nextId++,
                  sourceHash: readSourceHash(row),
                }))
              );
            },
          }),
        };
      },
    };
  }

  private rowsFor(table: unknown): Array<Record<string, unknown>> {
    if (table === users) {
      return Array.from(this.userIds, (id) => ({ id }));
    }
    if (table === portfolioCompanies) {
      return Array.from(this.companyIds, (id) => ({ id }));
    }
    if (table === vehicles) {
      return Array.from(this.vehicleIds, (id) => ({ id }));
    }
    if (table === lpFundCommitments) {
      return Array.from(this.lpIds, (lpId) => ({ lpId }));
    }
    if (table === cashFlowEvents) {
      return Array.from(this.cashFlowHashes, (sourceHash) => ({ sourceHash }));
    }
    if (table === valuationMarks) {
      return Array.from(this.valuationHashes, (sourceHash) => ({ sourceHash }));
    }
    return [];
  }
}

const ledgerCsv = [
  'event_type,amount,currency,event_date,perspective,company_id,lp_id,vehicle_id,description',
  'lp_capital_call,1000000.000000,USD,2026-01-01,lp_net,,1,,Q1 call',
  'portfolio_investment,250000.000000,USD,2026-01-02,company,42,,7,Seed investment',
].join('\n');

const duplicateLedgerCsv = [
  'event_type,amount,currency,event_date,perspective,company_id,lp_id,vehicle_id,description',
  'lp_capital_call,1000000.000000,USD,2026-01-01,lp_net,,1,,Q1 call',
  'lp_capital_call,1000000.000000,USD,2026-01-01,lp_net,,1,,Q1 call duplicate',
].join('\n');

const valuationCsv = [
  'company_id,mark_date,as_of_date,fair_value,currency,mark_source,confidence_level,valuation_method,cost_basis,vehicle_id',
  '42,2026-03-31,2026-03-31,5000000.000000,USD,financing_round,high,priced_round,3000000.000000,7',
  '43,2026-04-15,2026-04-15,5500000.000000,USD,board_update,high,management_estimate,3000000.000000,',
].join('\n');

const notionLedgerCsv = [
  'Event Type,Amount,Currency,Date,Perspective,Company,LP,Notes',
  'lp_capital_call,1000000.000000,USD,2026-01-01T00:00:00.000Z,lp_net,,1,Notion call',
].join('\n');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-09T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('commitLedgerImport', () => {
  it('commits multiple valid ledger rows and stores row source hashes', async () => {
    const fakeDb = new FakeCommitDb();
    const dryRun = runLedgerDryRun(Buffer.from(ledgerCsv), 'csv', 1);

    const result = await commitLedgerImport(
      {
        fundId: 1,
        sourceType: 'csv',
        payload: toBase64(ledgerCsv),
        previewHash: dryRun.previewHash,
        userId: 7,
      },
      { database: fakeDb.asDatabase() }
    );

    expect(result).toEqual({
      importBatchId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      ),
      previewHash: dryRun.previewHash,
      insertedCount: 2,
      skippedExistingCount: 0,
      skippedDuplicateCount: 0,
      skippedExcludedCount: 0,
      insertedIds: [100, 101],
    });
    expect(fakeDb.insertedCashFlowRows).toEqual([
      {
        fundId: 1,
        eventType: 'lp_capital_call',
        amount: '1000000.000000',
        currency: 'USD',
        eventDate: new Date('2026-01-01T00:00:00.000Z'),
        perspective: 'lp_net',
        payload: {},
        importedFrom: 'csv',
        importBatchId: result.importBatchId,
        sourceHash: '20a3e865e69f6b2d3bc2f1c89d3cf4687d20eaa15d6970c778d5629c229cdfee',
        createdBy: 7,
        lpId: 1,
        description: 'Q1 call',
      },
      {
        fundId: 1,
        eventType: 'portfolio_investment',
        amount: '250000.000000',
        currency: 'USD',
        eventDate: new Date('2026-01-02T00:00:00.000Z'),
        perspective: 'company',
        payload: {},
        importedFrom: 'csv',
        importBatchId: result.importBatchId,
        sourceHash: 'b15a02dfe8f87e3477b8aaf62283bed6ff5d9606f6287f8eb990042203c0e5f1',
        createdBy: 7,
        vehicleId: 7,
        companyId: 42,
        description: 'Seed investment',
      },
    ]);
    expect(
      fakeDb.insertedCashFlowRows.some((row) => readSourceHash(row) === dryRun.previewHash)
    ).toBe(false);
  });

  it('skips intra-payload duplicate ledger rows before insert', async () => {
    const fakeDb = new FakeCommitDb();
    const dryRun = runLedgerDryRun(Buffer.from(duplicateLedgerCsv), 'csv', 1);

    const result = await commitLedgerImport(
      {
        fundId: 1,
        sourceType: 'csv',
        payload: toBase64(duplicateLedgerCsv),
        previewHash: dryRun.previewHash,
        userId: 7,
      },
      { database: fakeDb.asDatabase() }
    );

    expect(result.insertedCount).toBe(1);
    expect(result.skippedDuplicateCount).toBe(1);
    expect(fakeDb.insertedCashFlowRows).toHaveLength(1);
  });

  it('persists sourceType as importedFrom for a notion ledger commit', async () => {
    const fakeDb = new FakeCommitDb();
    const dryRun = runLedgerDryRun(Buffer.from(notionLedgerCsv), 'notion', 1);

    const result = await commitLedgerImport(
      {
        fundId: 1,
        sourceType: 'notion',
        payload: toBase64(notionLedgerCsv),
        previewHash: dryRun.previewHash,
        userId: 7,
      },
      { database: fakeDb.asDatabase() }
    );

    expect(result.insertedCount).toBe(1);
    expect(fakeDb.insertedCashFlowRows).toEqual([
      expect.objectContaining({
        importedFrom: 'notion',
        importBatchId: result.importBatchId,
        sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ]);
  });

  it('replays the same ledger commit as skipped existing rows', async () => {
    const fakeDb = new FakeCommitDb();
    const dryRun = runLedgerDryRun(Buffer.from(ledgerCsv), 'csv', 1);
    const input = {
      fundId: 1,
      sourceType: 'csv' as const,
      payload: toBase64(ledgerCsv),
      previewHash: dryRun.previewHash,
      userId: 7,
    };

    const first = await commitLedgerImport(input, { database: fakeDb.asDatabase() });
    const persistedAfterFirst = fakeDb.insertedCashFlowRows.map((row) => ({
      ...(row as Record<string, unknown>),
    }));
    const replay = await commitLedgerImport(input, { database: fakeDb.asDatabase() });

    expect(replay).toEqual({
      importBatchId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      ),
      previewHash: dryRun.previewHash,
      insertedCount: 0,
      skippedExistingCount: 2,
      skippedDuplicateCount: 0,
      skippedExcludedCount: 0,
      insertedIds: [],
    });
    expect(replay.importBatchId).not.toBe(first.importBatchId);
    expect(fakeDb.insertedCashFlowRows).toEqual(persistedAfterFirst);
    expect(fakeDb.insertedCashFlowRows.map(readSourceHash)).toEqual([
      '20a3e865e69f6b2d3bc2f1c89d3cf4687d20eaa15d6970c778d5629c229cdfee',
      'b15a02dfe8f87e3477b8aaf62283bed6ff5d9606f6287f8eb990042203c0e5f1',
    ]);
  });

  it('counts concurrent conflict skips when the DB inserts fewer rows than requested', async () => {
    const fakeDb = new FakeCommitDb();
    fakeDb.insertedLimit = 1;
    const dryRun = runLedgerDryRun(Buffer.from(ledgerCsv), 'csv', 1);

    const result = await commitLedgerImport(
      {
        fundId: 1,
        sourceType: 'csv',
        payload: toBase64(ledgerCsv),
        previewHash: dryRun.previewHash,
        userId: 7,
      },
      { database: fakeDb.asDatabase() }
    );

    expect(result.insertedCount).toBe(1);
    expect(result.skippedExistingCount).toBe(1);
  });

  it('rejects a preview hash mismatch before inserting', async () => {
    const fakeDb = new FakeCommitDb();

    await expect(
      commitLedgerImport(
        {
          fundId: 1,
          sourceType: 'csv',
          payload: toBase64(ledgerCsv),
          previewHash: 'b'.repeat(64),
          userId: 7,
        },
        { database: fakeDb.asDatabase() }
      )
    ).rejects.toMatchObject({ code: 'PREVIEW_HASH_MISMATCH', status: 409 });
    expect(fakeDb.insertedCashFlowRows).toHaveLength(0);
  });

  it('rejects typed CREATE schema failures without inserting', async () => {
    const fakeDb = new FakeCommitDb();
    const reversalCsv = [
      'event_type,amount,currency,event_date,perspective,company_id,lp_id,vehicle_id,description',
      'reversal,-10.000000,USD,2026-01-01,fund_gross,,,,Missing reversal id',
    ].join('\n');
    const dryRun = runLedgerDryRun(Buffer.from(reversalCsv), 'csv', 1);

    await expect(
      commitLedgerImport(
        {
          fundId: 1,
          sourceType: 'csv',
          payload: toBase64(reversalCsv),
          previewHash: dryRun.previewHash,
          userId: 7,
        },
        { database: fakeDb.asDatabase() }
      )
    ).rejects.toBeInstanceOf(ImportCommitError);
    expect(fakeDb.insertedCashFlowRows).toHaveLength(0);
  });

  it('rejects company IDs that do not belong to the target fund', async () => {
    const fakeDb = new FakeCommitDb();
    fakeDb.companyIds.delete(42);
    const dryRun = runLedgerDryRun(Buffer.from(ledgerCsv), 'csv', 1);

    await expect(
      commitLedgerImport(
        {
          fundId: 1,
          sourceType: 'csv',
          payload: toBase64(ledgerCsv),
          previewHash: dryRun.previewHash,
          userId: 7,
        },
        { database: fakeDb.asDatabase() }
      )
    ).rejects.toMatchObject({ code: 'CROSS_FUND_COMPANY_REFERENCE', status: 403 });
    expect(fakeDb.insertedCashFlowRows).toHaveLength(0);
  });
});

describe('commitValuationMarkImport', () => {
  it('commits multiple valid valuation marks', async () => {
    const fakeDb = new FakeCommitDb();
    const dryRun = runValuationMarkDryRun(Buffer.from(valuationCsv), 'csv', 1);

    const result = await commitValuationMarkImport(
      {
        fundId: 1,
        sourceType: 'csv',
        payload: toBase64(valuationCsv),
        previewHash: dryRun.previewHash,
        userId: 7,
      },
      { database: fakeDb.asDatabase() }
    );

    expect(result.insertedCount).toBe(2);
    expect(result.skippedExistingCount).toBe(0);
    expect(fakeDb.insertedValuationRows).toHaveLength(2);
    expect(fakeDb.insertedValuationRows.every((row) => readSourceHash(row)?.length === 64)).toBe(
      true
    );
    expect(
      fakeDb.insertedValuationRows.some((row) => readSourceHash(row) === dryRun.previewHash)
    ).toBe(false);
  });

  it('skips future-dated valuation marks as excluded rows', async () => {
    const fakeDb = new FakeCommitDb();
    const csv = `${valuationCsv}\n42,2027-01-01,2027-01-01,6000000.000000,USD,financing_round,high,priced_round,3000000.000000,7`;
    const dryRun = runValuationMarkDryRun(Buffer.from(csv), 'csv', 1);

    const result = await commitValuationMarkImport(
      {
        fundId: 1,
        sourceType: 'csv',
        payload: toBase64(csv),
        previewHash: dryRun.previewHash,
        userId: 7,
      },
      { database: fakeDb.asDatabase() }
    );

    expect(result.insertedCount).toBe(2);
    expect(result.skippedExcludedCount).toBe(1);
  });
});
