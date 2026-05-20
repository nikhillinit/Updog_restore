import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryChain = PromiseLike<unknown[]> & {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

type MutationChain = PromiseLike<unknown[]> & {
  values: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
};

const mockState = vi.hoisted(() => {
  const state = {
    selectResults: [] as unknown[][],
    insertReturningResults: [] as unknown[][],
    updateReturningResults: [] as unknown[][],
    insertValues: [] as unknown[],
    updateSets: [] as unknown[],
  };

  function next(queue: unknown[][]): unknown[] {
    return queue.shift() ?? [];
  }

  function thenFor(result: unknown[]): QueryChain['then'] {
    return (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected);
  }

  function makeQuery(result: unknown[]): QueryChain {
    const query = {
      from: vi.fn(() => query),
      where: vi.fn(() => query),
      orderBy: vi.fn(() => query),
      limit: vi.fn(() => Promise.resolve(result)),
      then: thenFor(result),
    } as QueryChain;

    return query;
  }

  function makeInsertMutation(table: unknown): MutationChain {
    const result: unknown[] = [];
    const mutation = {
      values: vi.fn((payload: unknown) => {
        state.insertValues.push({ table, payload });
        return mutation;
      }),
      set: vi.fn(() => mutation),
      where: vi.fn(() => mutation),
      returning: vi.fn(() => Promise.resolve(next(state.insertReturningResults))),
      then: thenFor(result),
    } as MutationChain;

    return mutation;
  }

  function makeUpdateMutation(table: unknown): MutationChain {
    const result: unknown[] = [];
    const mutation = {
      values: vi.fn(() => mutation),
      set: vi.fn((payload: unknown) => {
        state.updateSets.push({ table, payload });
        return mutation;
      }),
      where: vi.fn(() => mutation),
      returning: vi.fn(() => Promise.resolve(next(state.updateReturningResults))),
      then: thenFor(result),
    } as MutationChain;

    return mutation;
  }

  const db = {
    select: vi.fn(() => makeQuery(next(state.selectResults))),
    insert: vi.fn((table: unknown) => makeInsertMutation(table)),
    update: vi.fn((table: unknown) => makeUpdateMutation(table)),
  };

  return { db, state };
});

vi.mock('../../../server/db', () => ({
  db: mockState.db,
}));

import {
  bulkUpdateStatus,
  confirmImport,
  previewImport,
  type ImportDealRowInput,
} from '../../../server/services/deal-pipeline-service';

function resetDbMock() {
  mockState.state.selectResults = [];
  mockState.state.insertReturningResults = [];
  mockState.state.updateReturningResults = [];
  mockState.state.insertValues = [];
  mockState.state.updateSets = [];
  mockState.db.select.mockClear();
  mockState.db.insert.mockClear();
  mockState.db.update.mockClear();
}

function importRow(companyName: string): ImportDealRowInput {
  return {
    companyName,
    sector: 'SaaS',
    stage: 'Seed',
    sourceType: 'Referral',
  };
}

function payloadAt(index: number) {
  const entry = mockState.state.insertValues[index] as { payload?: unknown } | undefined;
  return entry?.payload;
}

describe('deal pipeline service', () => {
  beforeEach(() => {
    resetDbMock();
  });

  it('previews import duplicates without writing deals', async () => {
    mockState.state.selectResults.push([
      { id: 11, companyName: 'Acme AI', stage: 'Seed', fundId: 1 },
    ]);

    const result = await previewImport({
      rawRowCount: 2,
      valid: [
        { index: 0, data: importRow('Acme AI') },
        { index: 1, data: importRow('Beta Cloud') },
      ],
      invalid: [],
      fundId: 1,
    });

    expect(result).toMatchObject({
      total: 2,
      valid: 2,
      invalid: 0,
      duplicates: 1,
      toImport: 1,
      duplicateRows: [{ index: 0, existingId: 11, companyName: 'Acme AI' }],
    });
    expect(mockState.db.insert).not.toHaveBeenCalled();
    expect(mockState.db.update).not.toHaveBeenCalled();
  });

  it('confirms import with skip-duplicates while inserting only new rows', async () => {
    mockState.state.selectResults.push([{ companyName: 'Acme AI' }]);

    const result = await confirmImport({
      rows: [importRow('Acme AI'), importRow('Beta Cloud')],
      fundId: 1,
      mode: 'skip_duplicates',
    });

    expect(result).toMatchObject({
      imported: 1,
      skipped: 1,
      failed: 0,
      total: 2,
    });
    expect(mockState.state.insertValues).toHaveLength(1);
    expect(payloadAt(0)).toMatchObject({
      fundId: 1,
      companyName: 'Beta Cloud',
      status: 'lead',
      priority: 'medium',
    });
  });

  it('bulk-updates status idempotently and reports missing deals', async () => {
    mockState.state.selectResults.push([
      { id: 1, status: 'qualified' },
      { id: 2, status: 'lead' },
    ]);

    const result = await bulkUpdateStatus({
      dealIds: [1, 2, 3],
      status: 'qualified',
      notes: 'service contract',
    });

    expect(result).toEqual({
      updatedIds: [1, 2],
      failed: [{ id: 3, reason: 'Deal not found' }],
    });
    expect(mockState.state.updateSets).toHaveLength(1);
    expect(mockState.state.insertValues).toHaveLength(1);
    expect(payloadAt(0)).toMatchObject({
      opportunityId: 2,
      title: 'Bulk Status Change: lead -> qualified',
      description: 'service contract',
    });
  });
});
