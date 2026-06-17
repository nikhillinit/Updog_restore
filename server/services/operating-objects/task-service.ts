import { desc, eq, sql } from 'drizzle-orm';

import { db } from '../../db';
import type { TaskCreate } from '@shared/contracts/operating-objects/task.contract';
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
