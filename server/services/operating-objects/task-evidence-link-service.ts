import { and, asc, eq } from 'drizzle-orm';

import {
  TASK_EVIDENCE_LINK_CONTRACT_VERSION,
  TaskEvidenceLinkV1Schema,
  type TaskEvidenceLinkV1,
  type TaskEvidenceTarget,
} from '@shared/contracts/operating-objects/task-evidence-link.contract';
import { taskEvidenceLinks, tasks, type TaskEvidenceLink } from '@shared/schema/operating-objects';
import { db } from '../../db';
import {
  FundScopeError,
  assertOwnedByFund,
  type FundScopedOwnershipDatabase,
} from '../../lib/fund-scoped-ownership';
import { runIdempotentCommand } from '../../lib/idempotent-command';

type TaskEvidenceDatabase = typeof db;

export type TaskEvidenceLinkRecord = TaskEvidenceLink;

export class TaskEvidenceLinkServiceError extends Error {
  readonly status: number;

  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'TaskEvidenceLinkServiceError';
    this.status = statusCode;
  }
}

export interface TaskEvidenceCommandPreimage extends Record<string, unknown> {
  commandKind: 'create_task_evidence_link';
  contractVersion: typeof TASK_EVIDENCE_LINK_CONTRACT_VERSION;
  fundId: number;
  taskId: number;
  target: TaskEvidenceTarget;
}

export interface TaskEvidenceLinkPorts {
  assertTaskOwned(fundId: number, taskId: number): Promise<void>;
  assertTargetOwned(fundId: number, target: TaskEvidenceTarget): Promise<void>;
  createIdempotent(input: {
    fundId: number;
    taskId: number;
    target: TaskEvidenceTarget;
    actorId: number | null;
    idempotencyKey: string;
    preimage: TaskEvidenceCommandPreimage;
  }): Promise<{ row: TaskEvidenceLinkRecord; replayed: boolean }>;
}

export interface CreateTaskEvidenceLinkInput {
  fundId: number;
  taskId: number;
  target: TaskEvidenceTarget;
  actorId: number | null;
  idempotencyKey: string;
}

export interface CreateTaskEvidenceLinkResult {
  evidenceLink: TaskEvidenceLinkV1;
  replayed: boolean;
}

function targetFromRow(row: TaskEvidenceLinkRecord): TaskEvidenceTarget {
  if (row.targetKind === 'analysis_reference' && row.analysisReferenceId !== null) {
    return { kind: 'analysis_reference', id: row.analysisReferenceId };
  }
  if (row.targetKind === 'internal_economics_run' && row.economicsRunId !== null) {
    return { kind: 'internal_economics_run', id: row.economicsRunId };
  }
  throw new TaskEvidenceLinkServiceError(
    500,
    'TASK_EVIDENCE_LINK_CORRUPT',
    'Stored task evidence target is inconsistent.'
  );
}

export function toTaskEvidenceLinkContract(row: TaskEvidenceLinkRecord): TaskEvidenceLinkV1 {
  return TaskEvidenceLinkV1Schema.parse({
    contractVersion: TASK_EVIDENCE_LINK_CONTRACT_VERSION,
    linkId: row.id,
    fundId: row.fundId,
    taskId: row.taskId,
    target: targetFromRow(row),
    createdAt: row.createdAt.toISOString(),
  });
}

export async function listTaskEvidenceLinks(
  fundId: number,
  taskId: number,
  options: { database?: TaskEvidenceDatabase } = {}
): Promise<TaskEvidenceLinkV1[]> {
  const database = options.database ?? db;
  const rows = await database
    .select()
    .from(taskEvidenceLinks)
    .where(and(eq(taskEvidenceLinks.fundId, fundId), eq(taskEvidenceLinks.taskId, taskId)))
    .orderBy(asc(taskEvidenceLinks.id))
    .limit(100);
  return rows.map(toTaskEvidenceLinkContract);
}

export async function createTaskEvidenceLinkWithPorts(
  ports: TaskEvidenceLinkPorts,
  input: CreateTaskEvidenceLinkInput
): Promise<CreateTaskEvidenceLinkResult> {
  await ports.assertTaskOwned(input.fundId, input.taskId);
  await ports.assertTargetOwned(input.fundId, input.target);

  const preimage: TaskEvidenceCommandPreimage = {
    commandKind: 'create_task_evidence_link',
    contractVersion: TASK_EVIDENCE_LINK_CONTRACT_VERSION,
    fundId: input.fundId,
    taskId: input.taskId,
    target: input.target,
  };
  const result = await ports.createIdempotent({ ...input, preimage });
  return {
    evidenceLink: toTaskEvidenceLinkContract(result.row),
    replayed: result.replayed,
  };
}

function createTaskEvidenceLinkPorts(database: TaskEvidenceDatabase): TaskEvidenceLinkPorts {
  return {
    async assertTaskOwned(fundId, taskId) {
      const [task] = await database
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.fundId, fundId)))
        .limit(1);
      if (!task) {
        throw new TaskEvidenceLinkServiceError(404, 'TASK_NOT_FOUND', 'Task not found.');
      }
    },

    async assertTargetOwned(fundId, target) {
      try {
        await assertOwnedByFund({
          db: database as unknown as FundScopedOwnershipDatabase,
          fundId,
          ref:
            target.kind === 'analysis_reference'
              ? { kind: 'analysis_reference', id: target.id }
              : { kind: 'lp_economics_run', id: target.id },
        });
      } catch (error) {
        if (error instanceof FundScopeError) {
          throw new TaskEvidenceLinkServiceError(
            404,
            'EVIDENCE_TARGET_NOT_FOUND',
            'Evidence target not found.'
          );
        }
        throw error;
      }
    },

    async createIdempotent(input) {
      const loadExisting = async () => {
        const [existing] = await database
          .select()
          .from(taskEvidenceLinks)
          .where(
            and(
              eq(taskEvidenceLinks.fundId, input.fundId),
              eq(taskEvidenceLinks.taskId, input.taskId),
              eq(taskEvidenceLinks.idempotencyKey, input.idempotencyKey)
            )
          )
          .limit(1);
        return existing ? { row: existing, requestHash: existing.requestHash } : null;
      };

      return runIdempotentCommand<TaskEvidenceLinkRecord>({
        db: database,
        fundId: input.fundId,
        idempotencyKey: input.idempotencyKey,
        contractVersion: TASK_EVIDENCE_LINK_CONTRACT_VERSION,
        request: input.preimage,
        loadExisting,
        insert: async (requestHash) => {
          const [inserted] = await database
            .insert(taskEvidenceLinks)
            .values({
              fundId: input.fundId,
              taskId: input.taskId,
              targetKind: input.target.kind,
              analysisReferenceId:
                input.target.kind === 'analysis_reference' ? input.target.id : null,
              economicsRunId:
                input.target.kind === 'internal_economics_run' ? input.target.id : null,
              idempotencyKey: input.idempotencyKey,
              requestHash,
              createdBy: input.actorId,
            })
            .onConflictDoNothing({
              target: [
                taskEvidenceLinks.fundId,
                taskEvidenceLinks.taskId,
                taskEvidenceLinks.idempotencyKey,
              ],
            })
            .returning();
          return inserted ?? null;
        },
      });
    },
  };
}

export async function createTaskEvidenceLink(
  input: CreateTaskEvidenceLinkInput,
  options: { database?: TaskEvidenceDatabase } = {}
): Promise<CreateTaskEvidenceLinkResult> {
  const database = options.database ?? db;
  return database.transaction(async (transaction) =>
    createTaskEvidenceLinkWithPorts(
      createTaskEvidenceLinkPorts(transaction as unknown as TaskEvidenceDatabase),
      input
    )
  );
}
