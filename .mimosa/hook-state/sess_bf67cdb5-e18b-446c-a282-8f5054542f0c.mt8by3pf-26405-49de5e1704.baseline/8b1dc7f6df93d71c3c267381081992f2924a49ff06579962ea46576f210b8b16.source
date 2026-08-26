import { describe, expect, it } from 'vitest';

import type { TaskEvidenceTarget } from '../../../../shared/contracts/operating-objects/task-evidence-link.contract';
import {
  TaskEvidenceLinkServiceError,
  createTaskEvidenceLinkWithPorts,
  type TaskEvidenceLinkPorts,
  type TaskEvidenceLinkRecord,
} from '../../../../server/services/operating-objects/task-evidence-link-service';
import { IdempotentCommandError } from '../../../../server/lib/idempotent-command';

class FakePorts implements TaskEvidenceLinkPorts {
  tasks = new Set(['1:2']);
  targets = new Set(['1:analysis_reference:11', '1:internal_economics_run:12']);
  rows = new Map<string, { row: TaskEvidenceLinkRecord; requestHash: string }>();
  nextId = 1;

  async assertTaskOwned(fundId: number, taskId: number) {
    if (!this.tasks.has(`${fundId}:${taskId}`)) {
      throw new TaskEvidenceLinkServiceError(404, 'TASK_NOT_FOUND', 'Task not found.');
    }
  }

  async assertTargetOwned(fundId: number, target: TaskEvidenceTarget) {
    if (!this.targets.has(`${fundId}:${target.kind}:${target.id}`)) {
      throw new TaskEvidenceLinkServiceError(404, 'EVIDENCE_TARGET_NOT_FOUND', 'Target not found.');
    }
  }

  async createIdempotent(input: Parameters<TaskEvidenceLinkPorts['createIdempotent']>[0]) {
    await Promise.resolve();
    const key = `${input.fundId}:${input.taskId}:${input.idempotencyKey}`;
    const requestHash = JSON.stringify(input.preimage);
    const existing = this.rows.get(key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new IdempotentCommandError(
          409,
          'IDEMPOTENCY_KEY_REUSE',
          'Idempotency-Key was already used for a different request.'
        );
      }
      return { row: existing.row, replayed: true };
    }

    const row: TaskEvidenceLinkRecord = {
      id: this.nextId++,
      fundId: input.fundId,
      taskId: input.taskId,
      targetKind: input.target.kind,
      analysisReferenceId: input.target.kind === 'analysis_reference' ? input.target.id : null,
      economicsRunId: input.target.kind === 'internal_economics_run' ? input.target.id : null,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      createdBy: input.actorId,
      createdAt: new Date('2026-08-01T12:00:00.000Z'),
    };
    this.rows.set(key, { row, requestHash });
    return { row, replayed: false };
  }
}

function input(overrides: Partial<Parameters<typeof createTaskEvidenceLinkWithPorts>[1]> = {}) {
  return {
    fundId: 1,
    taskId: 2,
    target: { kind: 'analysis_reference' as const, id: 11 },
    actorId: 7,
    idempotencyKey: 'evidence-1',
    ...overrides,
  };
}

describe('task evidence link service', () => {
  it('creates then replays the same strict public response', async () => {
    const ports = new FakePorts();
    const created = await createTaskEvidenceLinkWithPorts(ports, input());
    const replay = await createTaskEvidenceLinkWithPorts(ports, input());

    expect(created.replayed).toBe(false);
    expect(replay).toEqual({ ...created, replayed: true });
    expect(ports.rows).toHaveLength(1);
    expect(Object.keys(created.evidenceLink).sort()).toEqual(
      ['contractVersion', 'createdAt', 'fundId', 'linkId', 'target', 'taskId'].sort()
    );
  });

  it('excludes actor from the preimage and preserves original creator on cross-actor replay', async () => {
    const ports = new FakePorts();
    const created = await createTaskEvidenceLinkWithPorts(ports, input({ actorId: 7 }));
    const replay = await createTaskEvidenceLinkWithPorts(ports, input({ actorId: 8 }));

    expect(replay.evidenceLink).toEqual(created.evidenceLink);
    expect([...ports.rows.values()][0]?.row.createdBy).toBe(7);
  });

  it('conflicts when a scoped key is reused for another target', async () => {
    const ports = new FakePorts();
    await createTaskEvidenceLinkWithPorts(ports, input());

    await expect(
      createTaskEvidenceLinkWithPorts(
        ports,
        input({ target: { kind: 'internal_economics_run', id: 12 } })
      )
    ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSE' });
  });

  it('supports both target variants', async () => {
    const ports = new FakePorts();
    const economics = await createTaskEvidenceLinkWithPorts(
      ports,
      input({
        idempotencyKey: 'evidence-2',
        target: { kind: 'internal_economics_run', id: 12 },
      })
    );

    expect(economics.evidenceLink.target).toEqual({ kind: 'internal_economics_run', id: 12 });
  });

  it('rejects missing or cross-fund task and target ownership before create', async () => {
    const ports = new FakePorts();

    await expect(
      createTaskEvidenceLinkWithPorts(ports, input({ taskId: 99 }))
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'TASK_NOT_FOUND',
    });
    await expect(
      createTaskEvidenceLinkWithPorts(ports, input({ fundId: 2 }))
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(ports.rows).toHaveLength(0);
  });

  it('collapses concurrent identical requests to one row and one response identity', async () => {
    const ports = new FakePorts();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => createTaskEvidenceLinkWithPorts(ports, input()))
    );

    expect(ports.rows).toHaveLength(1);
    expect(new Set(results.map((result) => result.evidenceLink.linkId))).toEqual(new Set([1]));
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
  });
});
