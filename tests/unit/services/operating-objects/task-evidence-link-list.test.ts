import { and, asc, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { taskEvidenceLinks } from '../../../../shared/schema/operating-objects';
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
    const limit = vi.fn(async () => rows);
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    const database = { select };

    const result = await listTaskEvidenceLinks(1, 2, { database: database as never });

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
});
