import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  insertedValues: undefined as unknown,
  selectRows: [] as unknown[],
}));
const dbMock = vi.hoisted(() => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn((v: unknown) => {
        captured.insertedValues = v;
        return { returning: vi.fn(async () => captured.selectRows) };
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(async () => captured.selectRows),
        })),
      })),
    })),
  },
}));
vi.mock('../../../../server/db', () => dbMock);

import {
  createTask,
  listTasksForFund,
} from '../../../../server/services/operating-objects/task-service';

const record = (o: Record<string, unknown> = {}) => ({
  id: 10,
  fundId: 1,
  title: 'Follow up',
  status: 'open',
  ownerId: null,
  dueDate: null,
  description: null,
  createdBy: null,
  createdAt: new Date('2026-06-16T00:00:00.000Z'),
  updatedAt: new Date('2026-06-16T00:00:00.000Z'),
  rowXmin: '5',
  ...o,
});

describe('task-service', () => {
  beforeEach(() => {
    captured.insertedValues = undefined;
    captured.selectRows = [];
    dbMock.db.insert.mockClear();
    dbMock.db.select.mockClear();
  });

  it('createTask splits xmin from the inserted row and forces status open', async () => {
    captured.selectRows = [record()];
    const out = await createTask({ fundId: 1, title: 'Follow up', createdBy: 7 });
    expect(out?.xmin).toBe('5');
    expect(out?.row).not.toHaveProperty('rowXmin');
    expect(out?.row.id).toBe(10);
    expect(captured.insertedValues).toMatchObject({ status: 'open', createdBy: 7, fundId: 1 });
  });

  it('createTask coerces omitted optionals to NULL', async () => {
    captured.selectRows = [record()];
    await createTask({ fundId: 1, title: 'x', createdBy: null });
    const v = captured.insertedValues as Record<string, unknown>;
    expect(v['ownerId']).toBeNull();
    expect(v['dueDate']).toBeNull();
    expect(v['description']).toBeNull();
  });

  it('createTask returns undefined when the insert yields no row', async () => {
    captured.selectRows = [];
    const out = await createTask({ fundId: 1, title: 'x', createdBy: null });
    expect(out).toBeUndefined();
  });

  it('listTasksForFund splits xmin for each row (newest-first pass-through)', async () => {
    captured.selectRows = [record({ id: 20, rowXmin: '6' }), record({ id: 11, rowXmin: '7' })];
    const out = await listTasksForFund(1);
    expect(out).toHaveLength(2);
    expect(out[0]?.xmin).toBe('6');
    expect(out[0]?.row).not.toHaveProperty('rowXmin');
    expect(out[1]?.row.id).toBe(11);
  });
});
