import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '../../db';
import type { TaskCreate, TaskPatch } from '@shared/contracts/operating-objects/task.contract';
import { tasks, type Task } from '@shared/schema/operating-objects';

type TaskDatabase = typeof db;

interface TaskServiceOptions {
  database?: TaskDatabase;
}

export interface TaskRow {
  row: Task;
  /** Postgres xmin system column as text -- opaque per-row concurrency token. */
  xmin: string;
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
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
  rowXmin: sql<string>`xmin::text`,
} as const;

function splitXmin(record: Task & { rowXmin: string }): TaskRow {
  const { rowXmin, ...row } = record;
  return { row: row as Task, xmin: rowXmin };
}

interface CreateTaskArgs extends TaskCreate {
  /** Best-effort creator id (nullable users.id FK); NULL when identity is not numeric. */
  createdBy: number | null;
}

export async function createTask(
  input: CreateTaskArgs,
  options: TaskServiceOptions = {}
): Promise<TaskRow | undefined> {
  const database = options.database ?? db;
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
    })
    .returning(columnsWithXmin);

  return record ? splitXmin(record) : undefined;
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
  expectedXmin: string;
  patch: TaskPatch;
}

/**
 * Atomic edit. WHERE pins fund/id/xmin (NO status gate -- any task is editable;
 * transitions are free). A concurrently-modified or deleted row updates zero rows
 * -> returns undefined so the caller disambiguates (404 vs 412). Sets only the
 * provided fields plus updatedAt. title/status use `!== undefined` (never null);
 * the nullable fields use `'key' in patch` so an explicit null clears and an
 * absent key is untouched. dueDate is a DATE column (date-only string) and is
 * written VERBATIM -- never `new Date()` (the cash_event mirror does that for its
 * timestamp eventDate; here it would TZ-shift / datetime-serialize). On success
 * reloads for the fresh post-update xmin so the response etag rotates.
 */
export async function updateTask(
  args: UpdateTaskArgs,
  options: TaskServiceOptions = {}
): Promise<TaskRow | undefined> {
  const database = options.database ?? db;
  const { fundId, taskId, expectedXmin, patch } = args;

  const setValues: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) setValues.title = patch.title;
  if (patch.status !== undefined) setValues.status = patch.status;
  if ('ownerId' in patch) setValues.ownerId = patch.ownerId ?? null;
  if ('dueDate' in patch) setValues.dueDate = patch.dueDate ?? null;
  if ('description' in patch) setValues.description = patch.description ?? null;

  const updated = await database
    .update(tasks)
    .set(setValues)
    .where(and(eq(tasks.fundId, fundId), eq(tasks.id, taskId), sql`xmin = ${expectedXmin}::xid`))
    .returning({ id: tasks.id });

  if (updated.length === 0) return undefined;
  // Reload for the fresh row + fresh xmin token (post-update); etag rotates.
  return loadTask(fundId, taskId, options);
}
