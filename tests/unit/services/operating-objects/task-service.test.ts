import { beforeEach, describe, expect, it, vi } from 'vitest';
import { taskUpdateCommands } from '../../../../shared/schema/operating-objects';
import { parseETag, rowVersionETag } from '../../../../server/lib/http-preconditions';

const captured = vi.hoisted(() => ({
  insertedValues: undefined as unknown,
  updatedValues: undefined as unknown,
  selectRows: [] as unknown[], // list path (.orderBy)
  loadQueue: [] as unknown[][], // each .limit(1) shifts one array (loadTask)
  updateResult: [] as unknown[],
  receiptRows: [] as unknown[],
}));
const dbMock = vi.hoisted(() => {
  const db = {
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
      callback(db)
    ),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((v: unknown) => {
        captured.insertedValues = v;
        if (table === taskUpdateCommands) {
          captured.receiptRows = [v];
          return { returning: vi.fn(async () => captured.receiptRows) };
        }
        return {
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => captured.selectRows),
          })),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((v: unknown) => {
        captured.updatedValues = v;
        return { where: vi.fn(() => ({ returning: vi.fn(async () => captured.updateResult) })) };
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() => {
          const query = {
            orderBy: vi.fn(async () => captured.selectRows),
            limit: vi.fn(async () =>
              table === taskUpdateCommands
                ? captured.receiptRows
                : (captured.loadQueue.shift() ?? [])
            ),
          };
          return { ...query, for: vi.fn(() => query) };
        }),
      })),
    })),
  };
  return { db };
});
vi.mock('../../../../server/db', () => dbMock);

import {
  createTask,
  listTasksForFund,
  loadTask,
  updateTask,
  toTaskResponse,
} from '../../../../server/services/operating-objects/task-service';
import { TASK_CONTRACT_VERSION } from '../../../../shared/contracts/operating-objects/task.contract';
import { canonicalSha256 } from '../../../../shared/lib/canonical-hash';

const record = (o: Record<string, unknown> = {}) => ({
  id: 10,
  fundId: 1,
  title: 'Follow up',
  status: 'open',
  ownerId: null,
  dueDate: null,
  description: null,
  createdBy: null,
  idempotencyKey: null,
  requestHash: null,
  createdAt: new Date('2026-06-16T00:00:00.000Z'),
  updatedAt: new Date('2026-06-16T00:00:00.000Z'),
  rowXmin: '5',
  ...o,
});

// Mirrors taskCreatePreimage: no createdBy, no status -- actor and status are
// excluded from the create hash by contract.
const createHash = (fundId: number, title: string) =>
  canonicalSha256({
    commandKind: 'create_task',
    contractVersion: TASK_CONTRACT_VERSION,
    fundId,
    title,
  });

describe('task-service', () => {
  beforeEach(() => {
    captured.insertedValues = undefined;
    captured.updatedValues = undefined;
    captured.selectRows = [];
    captured.loadQueue = [];
    captured.updateResult = [];
    captured.receiptRows = [];
    dbMock.db.insert.mockClear();
    dbMock.db.update.mockClear();
    dbMock.db.select.mockClear();
  });

  it('createTask splits xmin, forces status open, and persists key + hash', async () => {
    captured.selectRows = [record()];
    const out = await createTask({
      fundId: 1,
      title: 'Follow up',
      createdBy: 7,
      idempotencyKey: 'task-key-1',
    });
    expect(out?.xmin).toBe('5');
    expect(out?.row).not.toHaveProperty('rowXmin');
    expect(out?.row.id).toBe(10);
    expect(out?.replayed).toBe(false);
    expect(captured.insertedValues).toMatchObject({
      status: 'open',
      createdBy: 7,
      fundId: 1,
      idempotencyKey: 'task-key-1',
      requestHash: createHash(1, 'Follow up'),
    });
  });

  it('createTask coerces omitted optionals to NULL', async () => {
    captured.selectRows = [record()];
    await createTask({ fundId: 1, title: 'x', createdBy: null, idempotencyKey: 'task-key-1' });
    const v = captured.insertedValues as Record<string, unknown>;
    expect(v['ownerId']).toBeNull();
    expect(v['dueDate']).toBeNull();
    expect(v['description']).toBeNull();
  });

  it('createTask replays the stored row on conflict, across actors (actor excluded from hash)', async () => {
    captured.selectRows = []; // insert loses the race -> DO NOTHING -> no row
    captured.loadQueue = [
      [record({ idempotencyKey: 'task-key-1', requestHash: createHash(1, 'Follow up') })],
    ];
    const out = await createTask({
      fundId: 1,
      title: 'Follow up',
      createdBy: 99, // different actor than the stored row; must still replay
      idempotencyKey: 'task-key-1',
    });
    expect(out?.replayed).toBe(true);
    expect(out?.row.id).toBe(10);
    expect(out?.xmin).toBe('5');
  });

  it('createTask throws 409 IDEMPOTENCY_KEY_REUSE when the stored hash differs', async () => {
    captured.selectRows = [];
    captured.loadQueue = [
      [record({ idempotencyKey: 'task-key-1', requestHash: createHash(1, 'Other title') })],
    ];
    await expect(
      createTask({ fundId: 1, title: 'Follow up', createdBy: null, idempotencyKey: 'task-key-1' })
    ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSE' });
  });

  it('createTask throws 500 TASK_IDEMPOTENCY_CORRUPT when the stored row has no hash', async () => {
    captured.selectRows = [];
    captured.loadQueue = [[record({ idempotencyKey: 'task-key-1', requestHash: null })]];
    await expect(
      createTask({ fundId: 1, title: 'Follow up', createdBy: null, idempotencyKey: 'task-key-1' })
    ).rejects.toMatchObject({ status: 500, code: 'TASK_IDEMPOTENCY_CORRUPT' });
  });

  it('createTask throws 409 IDEMPOTENCY_RACE_UNRESOLVED when neither insert nor reload yields a row', async () => {
    captured.selectRows = [];
    captured.loadQueue = [[]];
    await expect(
      createTask({ fundId: 1, title: 'x', createdBy: null, idempotencyKey: 'task-key-1' })
    ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_RACE_UNRESOLVED' });
  });

  it('listTasksForFund splits xmin for each row (newest-first pass-through)', async () => {
    captured.selectRows = [record({ id: 20, rowXmin: '6' }), record({ id: 11, rowXmin: '7' })];
    const out = await listTasksForFund(1);
    expect(out).toHaveLength(2);
    expect(out[0]?.xmin).toBe('6');
    expect(out[0]?.row).not.toHaveProperty('rowXmin');
    expect(out[1]?.row.id).toBe(11);
  });

  it('loadTask splits xmin and returns the row', async () => {
    captured.loadQueue = [[record({ id: 10, rowXmin: '9' })]];
    const out = await loadTask(1, 10);
    expect(out?.xmin).toBe('9');
    expect(out?.row.id).toBe(10);
    expect(out?.row).not.toHaveProperty('rowXmin');
  });

  it('loadTask returns undefined when no row matches', async () => {
    captured.loadQueue = [[]];
    expect(await loadTask(1, 999)).toBeUndefined();
  });

  const command = (patch: Parameters<typeof updateTask>[0]['patch']) => ({
    fundId: 1,
    taskId: 10,
    ifMatch: rowVersionETag('1'),
    idempotencyKey: 'task-edit-1',
    createdBy: null,
    patch,
  });

  it('updateTask commits the fresh response with only the supplied fields', async () => {
    captured.loadQueue = [[record({ rowXmin: '1' })]];
    captured.updateResult = [record({ rowXmin: '2', title: 'Updated' })];
    const out = await updateTask(command({ title: ' Updated ' }));
    expect(out).toEqual({
      response: toTaskResponse(record({ title: 'Updated' }), rowVersionETag('2')),
      replayed: false,
    });
    expect(captured.updatedValues).toEqual({ title: 'Updated', updatedAt: expect.any(Date) });
    expect(captured.insertedValues).toMatchObject({
      fundId: 1,
      taskId: 10,
      idempotencyKey: 'task-edit-1',
      responseBody: out.response,
      requestHash: canonicalSha256({
        commandKind: 'update_task',
        contractVersion: TASK_CONTRACT_VERSION,
        fundId: 1,
        taskId: 10,
        ifMatch: parseETag(rowVersionETag('1')),
        patch: { title: 'Updated' },
      }),
    });
    expect(dbMock.db.transaction).toHaveBeenCalled();
  });

  it.each([
    { ownerId: null, dueDate: null, description: null },
    { ownerId: 12, dueDate: '2026-07-01', description: 'Follow up' },
    { status: 'done' as const },
    { status: 'open' as const },
  ])('updateTask preserves nullable/date/status patch semantics: %j', async (patch) => {
    captured.loadQueue = [[record({ rowXmin: '1' })]];
    captured.updateResult = [record({ ...patch, rowXmin: '2' })];
    await updateTask(command(patch));
    expect(captured.updatedValues).toEqual({ ...patch, updatedAt: expect.any(Date) });
  });

  it('replays the stored response before checking a later task ETag, across authorized actors', async () => {
    const input = command({ title: 'Updated' });
    captured.loadQueue = [[record({ rowXmin: '1' })]];
    captured.updateResult = [record({ rowXmin: '2', title: 'Updated' })];
    const first = await updateTask(input);
    captured.loadQueue = [[record({ rowXmin: '9', title: 'Later edit' })]];
    dbMock.db.update.mockClear();
    dbMock.db.insert.mockClear();
    expect(await updateTask({ ...input, createdBy: 99 })).toEqual({ ...first, replayed: true });
    expect(dbMock.db.update).not.toHaveBeenCalled();
    expect(dbMock.db.insert).not.toHaveBeenCalled();
  });

  it('refuses a different payload on the same key before stale-ETag rejection', async () => {
    captured.loadQueue = [[record({ rowXmin: '1' })]];
    captured.updateResult = [record({ rowXmin: '2', title: 'Updated' })];
    await updateTask(command({ title: 'Updated' }));
    captured.loadQueue = [[record({ rowXmin: '2' })]];
    dbMock.db.update.mockClear();
    await expect(updateTask(command({ title: 'Different' }))).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSE',
    });
    expect(dbMock.db.update).not.toHaveBeenCalled();
  });

  it('rejects a new stale command without mutation or receipt', async () => {
    captured.loadQueue = [[record({ rowXmin: '9' })]];
    await expect(updateTask(command({ title: 'Updated' }))).rejects.toMatchObject({
      status: 412,
      code: 'precondition_failed',
      details: { current: rowVersionETag('9') },
    });
    expect(dbMock.db.update).not.toHaveBeenCalled();
    expect(dbMock.db.insert).not.toHaveBeenCalled();
  });

  it('returns missing-task refusal without receipt lookup or mutation', async () => {
    await expect(updateTask(command({ title: 'Updated' }))).rejects.toMatchObject({ status: 404 });
    expect(dbMock.db.select).toHaveBeenCalledTimes(1);
    expect(dbMock.db.update).not.toHaveBeenCalled();
  });

  it('rejects an inconsistent fund in a direct service call before database access', async () => {
    await expect(updateTask(command({ fundId: 2, title: 'Updated' }))).rejects.toMatchObject({
      status: 400,
    });
    expect(dbMock.db.select).not.toHaveBeenCalled();
  });
});
