import { and, desc, eq, sql } from 'drizzle-orm';

import {
  TASK_CONTRACT_VERSION,
  TaskPatchSchema,
  TaskResponseSchema,
  type TaskCreate,
  type TaskCreateCommandPreimage,
  type TaskPatch,
  type TaskResponse,
} from '@shared/contracts/operating-objects/task.contract';
import { taskUpdateCommands, tasks, type Task } from '@shared/schema/operating-objects';
import { db } from '../../db';
import { parseETag, rowVersionETag } from '../../lib/http-preconditions';
import {
  IdempotentCommandError,
  replayIdempotentCommandIfPresent,
  runIdempotentCommand,
} from '../../lib/idempotent-command';

type TaskDatabase = typeof db;

interface TaskServiceOptions {
  database?: TaskDatabase;
}

export interface TaskRow {
  row: Task;
  /** Postgres xmin system column as text -- opaque per-row concurrency token. */
  xmin: string;
  replayed?: boolean;
}

// Explicit column map + xmin::text (mirrors cash-flow-event-service). List the
// columns rather than rely on an unproven getTableColumns import.
const columnsWithXmin = {
  id: tasks.id,
  fundId: tasks.fundId,
  title: tasks.title,
  status: tasks.status,
  ownerId: tasks.ownerId,
  dueDate: tasks.dueDate,
  description: tasks.description,
  createdBy: tasks.createdBy,
  idempotencyKey: tasks.idempotencyKey,
  requestHash: tasks.requestHash,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
  rowXmin: sql<string>`xmin::text`,
} as const;

type TaskRecordWithXmin = Task & {
  rowXmin: string;
};

function splitXmin(record: TaskRecordWithXmin): TaskRow {
  const { rowXmin, ...row } = record;
  return { row: row as Task, xmin: rowXmin };
}

export function toTaskResponse(row: Task, etag: string): TaskResponse {
  return TaskResponseSchema.parse({
    id: row.id,
    fundId: row.fundId,
    title: row.title,
    status: row.status,
    ownerId: row.ownerId,
    dueDate: row.dueDate,
    description: row.description,
    createdAt: (row.createdAt ?? new Date()).toISOString(),
    updatedAt: (row.updatedAt ?? row.createdAt ?? new Date()).toISOString(),
    etag,
  });
}

interface CreateTaskArgs extends TaskCreate {
  /** Best-effort creator id (nullable users.id FK); NULL when identity is not numeric. */
  createdBy: number | null;
  idempotencyKey: string;
}

function taskCreatePreimage(input: CreateTaskArgs): TaskCreateCommandPreimage {
  return {
    commandKind: 'create_task',
    contractVersion: TASK_CONTRACT_VERSION,
    fundId: input.fundId,
    title: input.title,
    ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
    ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
  };
}

export async function createTask(
  input: CreateTaskArgs,
  options: TaskServiceOptions = {}
): Promise<TaskRow | undefined> {
  const database = options.database ?? db;
  const preimage = taskCreatePreimage(input);

  const result = await runIdempotentCommand<TaskRow>({
    db: database,
    fundId: input.fundId,
    idempotencyKey: input.idempotencyKey,
    contractVersion: TASK_CONTRACT_VERSION,
    request: preimage,
    loadExisting: async () => {
      const [existing] = await database
        .select(columnsWithXmin)
        .from(tasks)
        .where(and(eq(tasks.fundId, input.fundId), eq(tasks.idempotencyKey, input.idempotencyKey)))
        .limit(1);
      if (!existing) return null;
      if (existing.requestHash === null) {
        throw new IdempotentCommandError(
          500,
          'TASK_IDEMPOTENCY_CORRUPT',
          'Task idempotency row is missing its request hash.'
        );
      }
      return { row: splitXmin(existing), requestHash: existing.requestHash };
    },
    insert: async (requestHash) => {
      const [record] = await database
        .insert(tasks)
        .values({
          fundId: input.fundId,
          title: input.title,
          status: 'open',
          ownerId: input.ownerId ?? null,
          dueDate: input.dueDate ?? null,
          description: input.description ?? null,
          createdBy: input.createdBy,
          idempotencyKey: input.idempotencyKey,
          requestHash,
        })
        // Drizzle's pg insert builder does not expose targetWhere for
        // onConflictDoNothing; unqualified DO NOTHING handles the partial
        // unique index and this table has no competing insert key.
        .onConflictDoNothing()
        .returning(columnsWithXmin);
      return record ? splitXmin(record) : null;
    },
  });

  return { ...result.row, replayed: result.replayed };
}

export async function listTasksForFund(
  fundId: number,
  options: TaskServiceOptions = {}
): Promise<TaskRow[]> {
  const database = options.database ?? db;
  // Newest-first; hits idx_tasks_fund_created (fund_id, created_at DESC).
  const records = await database
    .select(columnsWithXmin)
    .from(tasks)
    .where(eq(tasks.fundId, fundId))
    .orderBy(desc(tasks.createdAt));
  return records.map(splitXmin);
}

export async function loadTask(
  fundId: number,
  taskId: number,
  options: TaskServiceOptions = {}
): Promise<TaskRow | undefined> {
  const database = options.database ?? db;
  const [record] = await database
    .select(columnsWithXmin)
    .from(tasks)
    .where(and(eq(tasks.fundId, fundId), eq(tasks.id, taskId)))
    .limit(1);
  return record ? splitXmin(record) : undefined;
}

interface UpdateTaskArgs {
  fundId: number;
  taskId: number;
  ifMatch: string;
  idempotencyKey: string;
  createdBy: number | null;
  patch: TaskPatch;
}

/**
 * Serialize commands for one task, replay before checking the current ETag, and
 * commit the xmin-guarded edit with its immutable public response. A failed
 * receipt insert rolls back the edit; retries never reload a newer task result.
 */
export async function updateTask(
  args: UpdateTaskArgs,
  options: TaskServiceOptions = {}
): Promise<{ response: TaskResponse; replayed: boolean }> {
  const database = options.database ?? db;
  const { fundId, taskId, idempotencyKey } = args;
  const { fundId: patchFundId, ...patch } = TaskPatchSchema.parse(args.patch);
  if (patchFundId !== undefined && patchFundId !== fundId) {
    throw new IdempotentCommandError(
      400,
      'FUND_ID_MISMATCH',
      'Body fundId must match the path fundId'
    );
  }
  const request = {
    commandKind: 'update_task',
    contractVersion: TASK_CONTRACT_VERSION,
    fundId,
    taskId,
    ifMatch: parseETag(args.ifMatch),
    patch,
  };

  return database.transaction(async (transaction) => {
    const [current] = await transaction
      .select(columnsWithXmin)
      .from(tasks)
      .where(and(eq(tasks.fundId, fundId), eq(tasks.id, taskId)))
      .for('update')
      .limit(1);
    if (!current) {
      throw new IdempotentCommandError(404, 'TASK_NOT_FOUND', 'Task not found');
    }

    const command = {
      db: transaction,
      fundId,
      idempotencyKey,
      contractVersion: TASK_CONTRACT_VERSION,
      request,
      loadExisting: async () => {
        const [existing] = await transaction
          .select()
          .from(taskUpdateCommands)
          .where(
            and(
              eq(taskUpdateCommands.fundId, fundId),
              eq(taskUpdateCommands.taskId, taskId),
              eq(taskUpdateCommands.idempotencyKey, idempotencyKey)
            )
          )
          .limit(1);
        return existing
          ? {
              row: TaskResponseSchema.parse(existing.responseBody),
              requestHash: existing.requestHash,
            }
          : null;
      },
    };
    const replay = await replayIdempotentCommandIfPresent(command);
    if (replay) return { response: replay.row, replayed: true };

    const currentEtag = rowVersionETag(current.rowXmin);
    if (request.ifMatch !== parseETag(currentEtag)) {
      throw new IdempotentCommandError(412, 'precondition_failed', 'Task has been modified', {
        current: currentEtag,
      });
    }

    const result = await runIdempotentCommand({
      ...command,
      insert: async (requestHash) => {
        const setValues: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
        if (patch.title !== undefined) setValues.title = patch.title;
        if (patch.status !== undefined) setValues.status = patch.status;
        if ('ownerId' in patch) setValues.ownerId = patch.ownerId ?? null;
        // DATE stays a date-only string; absent fields stay untouched and null clears.
        if ('dueDate' in patch) setValues.dueDate = patch.dueDate ?? null;
        if ('description' in patch) setValues.description = patch.description ?? null;

        const [updated] = await transaction
          .update(tasks)
          .set(setValues)
          .where(
            and(eq(tasks.fundId, fundId), eq(tasks.id, taskId), sql`xmin = ${current.rowXmin}::xid`)
          )
          .returning(columnsWithXmin);
        if (!updated) {
          throw new IdempotentCommandError(412, 'precondition_failed', 'Task has been modified', {
            current: currentEtag,
          });
        }
        const response = toTaskResponse(splitXmin(updated).row, rowVersionETag(updated.rowXmin));
        await transaction.insert(taskUpdateCommands).values({
          fundId,
          taskId,
          idempotencyKey,
          requestHash,
          responseBody: response,
          createdBy: args.createdBy,
        });
        return response;
      },
    });
    return { response: result.row, replayed: result.replayed };
  });
}
