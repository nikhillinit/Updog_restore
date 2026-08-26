import { and, asc, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { taskEvidenceLinks, tasks } from '../../../../shared/schema/operating-objects';
import { listTaskEvidenceLinks } from '../../../../server/services/operating-objects/task-evidence-link-service';

const rows = [
  {
    id: 3,
    fundId: 1,
    taskId: 2,
    targetKind: 'analysis_reference' as const,
    analysisReferenceId: 11,
    economicsRunId: null,
    idempotencyKey: 'internal-one',
    requestHash: 'a'.repeat(64),
    createdBy: 7,
    createdAt: new Date('2026-08-01T12:00:00.000Z'),
  },
  {
    id: 9,
    fundId: 1,
    taskId: 2,
    targetKind: 'internal_economics_run' as const,
    analysisReferenceId: null,
    economicsRunId: 12,
    idempotencyKey: 'internal-two',
    requestHash: 'b'.repeat(64),
    createdBy: 8,
    createdAt: new Date('2026-08-01T13:00:00.000Z'),
  },
];

describe('task evidence link listing', () => {
  it('returns at most 100 scoped rows in immutable link-id order as strict DTOs', async () => {
    const taskLimit = vi.fn(async () => [{ id: 2 }]);
    const taskWhere = vi.fn(() => ({ limit: taskLimit }));
    const taskFrom = vi.fn(() => ({ where: taskWhere }));
    const limit = vi.fn(async () => rows);
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn().mockReturnValueOnce({ from: taskFrom }).mockReturnValueOnce({ from });
    const database = { select };

    const result = await listTaskEvidenceLinks(1, 2, { database: database as never });

    expect(taskFrom).toHaveBeenCalledWith(tasks);
    expect(taskWhere).toHaveBeenCalledWith(and(eq(tasks.id, 2), eq(tasks.fundId, 1)));
    expect(taskLimit).toHaveBeenCalledWith(1);
    expect(from).toHaveBeenCalledWith(taskEvidenceLinks);
    expect(where).toHaveBeenCalledWith(
      and(eq(taskEvidenceLinks.fundId, 1), eq(taskEvidenceLinks.taskId, 2))
    );
    expect(orderBy).toHaveBeenCalledWith(asc(taskEvidenceLinks.id));
    expect(limit).toHaveBeenCalledWith(100);
    expect(result).toEqual([
      {
        contractVersion: 'task-evidence-link/1.0.0',
        linkId: 3,
        fundId: 1,
        taskId: 2,
        target: { kind: 'analysis_reference', id: 11 },
        createdAt: '2026-08-01T12:00:00.000Z',
      },
      {
        contractVersion: 'task-evidence-link/1.0.0',
        linkId: 9,
        fundId: 1,
        taskId: 2,
        target: { kind: 'internal_economics_run', id: 12 },
        createdAt: '2026-08-01T13:00:00.000Z',
      },
    ]);
    expect(Object.keys(result[0] ?? {}).sort()).toEqual(
      ['contractVersion', 'createdAt', 'fundId', 'linkId', 'target', 'taskId'].sort()
    );
  });

  it('returns TASK_NOT_FOUND without querying evidence when task does not exist', async () => {
    const evidenceFrom = vi.fn();
    const taskLimit = vi.fn(async () => []);
    const taskWhere = vi.fn(() => ({ limit: taskLimit }));
    const taskFrom = vi.fn(() => ({ where: taskWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: taskFrom })
      .mockReturnValue({ from: evidenceFrom });

    await expect(
      listTaskEvidenceLinks(1, 999, { database: { select } as never })
    ).rejects.toMatchObject({
      status: 404,
      statusCode: 404,
      code: 'TASK_NOT_FOUND',
      message: 'Task not found.',
    });

    expect(taskWhere).toHaveBeenCalledWith(and(eq(tasks.id, 999), eq(tasks.fundId, 1)));
    expect(select).toHaveBeenCalledTimes(1);
    expect(evidenceFrom).not.toHaveBeenCalled();
  });

  it('returns TASK_NOT_FOUND without querying evidence when task belongs to another fund', async () => {
    const evidenceFrom = vi.fn();
    const taskLimit = vi.fn(async () => []);
    const taskWhere = vi.fn(() => ({ limit: taskLimit }));
    const taskFrom = vi.fn(() => ({ where: taskWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: taskFrom })
      .mockReturnValue({ from: evidenceFrom });

    await expect(
      listTaskEvidenceLinks(2, 2, { database: { select } as never })
    ).rejects.toMatchObject({
      status: 404,
      statusCode: 404,
      code: 'TASK_NOT_FOUND',
      message: 'Task not found.',
    });

    expect(taskWhere).toHaveBeenCalledWith(and(eq(tasks.id, 2), eq(tasks.fundId, 2)));
    expect(select).toHaveBeenCalledTimes(1);
    expect(evidenceFrom).not.toHaveBeenCalled();
  });
});
