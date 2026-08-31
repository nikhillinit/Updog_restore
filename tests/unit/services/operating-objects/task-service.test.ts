import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  insertedValues: undefined as unknown,
  updatedValues: undefined as unknown,
  selectRows: [] as unknown[], // list path (.orderBy)
  loadQueue: [] as unknown[][], // each .limit(1) shifts one array (loadTask)
  updateResult: [] as unknown[], // .returning({ id })
}));
const dbMock = vi.hoisted(() => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn((v: unknown) => {
        captured.insertedValues = v;
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
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(async () => captured.selectRows),
          limit: vi.fn(async () =>
            captured.loadQueue.length > 0 ? captured.loadQueue.shift() : []
          ),
        })),
      })),
    })),
  },
}));
vi.mock('../../../../server/db', () => dbMock);

import {
  createTask,
  listTasksForFund,
  loadTask,
  updateTask,
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

  it('updateTask sets only provided fields + updatedAt and reloads the fresh xmin', async () => {
    captured.updateResult = [{ id: 10 }];
    captured.loadQueue = [[record({ rowXmin: '2', title: 'Updated' })]];
    const out = await updateTask({
      fundId: 1,
      taskId: 10,
      expectedXmin: '1',
      patch: { title: 'Updated' },
    });
    expect(out?.xmin).toBe('2'); // post-update reload, NOT the preloaded xmin
    expect(out?.row.title).toBe('Updated');
    const v = captured.updatedValues as Record<string, unknown>;
    expect(v['title']).toBe('Updated');
    expect(v['updatedAt']).toBeInstanceOf(Date);
    expect('ownerId' in v).toBe(false);
    expect('dueDate' in v).toBe(false);
    expect('description' in v).toBe(false);
  });

  it('updateTask clears nullable fields on explicit null (in-semantics)', async () => {
    captured.updateResult = [{ id: 10 }];
    captured.loadQueue = [[record()]];
    await updateTask({
      fundId: 1,
      taskId: 10,
      expectedXmin: '1',
      patch: { ownerId: null, dueDate: null, description: null },
    });
    const v = captured.updatedValues as Record<string, unknown>;
    expect(v['ownerId']).toBeNull();
    expect(v['dueDate']).toBeNull();
    expect(v['description']).toBeNull();
  });

  it('updateTask writes dueDate as a date-only string, never a Date', async () => {
    captured.updateResult = [{ id: 10 }];
    captured.loadQueue = [[record({ dueDate: '2026-07-01' })]];
    await updateTask({
      fundId: 1,
      taskId: 10,
      expectedXmin: '1',
      patch: { dueDate: '2026-07-01' },
    });
    const v = captured.updatedValues as Record<string, unknown>;
    expect(typeof v['dueDate']).toBe('string');
    expect(v['dueDate']).toBe('2026-07-01');
  });

  it('updateTask sets status verbatim (free transition)', async () => {
    captured.updateResult = [{ id: 10 }];
    captured.loadQueue = [[record({ status: 'done' })]];
    await updateTask({
      fundId: 1,
      taskId: 10,
      expectedXmin: '1',
      patch: { status: 'done' },
    });
    expect((captured.updatedValues as Record<string, unknown>)['status']).toBe('done');
  });

  it('updateTask returns undefined and does NOT reload when zero rows update', async () => {
    captured.updateResult = [];
    const out = await updateTask({
      fundId: 1,
      taskId: 10,
      expectedXmin: '1',
      patch: { title: 'x' },
    });
    expect(out).toBeUndefined();
    expect(dbMock.db.select).not.toHaveBeenCalled(); // no reload on the zero-row path
  });
});
