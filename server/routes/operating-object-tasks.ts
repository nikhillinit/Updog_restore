import { Router } from 'express';
import type { Request, Response } from 'express';
import { parseFundIdParam } from '@shared/number';
import {
  TaskCreateSchema,
  TaskPatchSchema,
  TaskResponseSchema,
  type TaskResponse,
} from '@shared/contracts/operating-objects/task.contract';
import type { Task } from '@shared/schema/operating-objects';
import { firstString } from '../lib/request-values';
import { enforceProvidedFundScope } from '../lib/auth/provided-fund-scope';
import { parseETag, rowVersionETag } from '../lib/http-preconditions';
import {
  createTask,
  listTasksForFund,
  loadTask,
  updateTask,
} from '../services/operating-objects/task-service';

const router = Router();

function numericIdentity(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return Number.parseInt(value, 10);
  return null;
}

// Best-effort creator id. JWT subs are not guaranteed numeric and created_by is a
// nullable users.id FK, so an unresolved identity stores NULL (never 401).
// enforceProvidedFundScope populates req.user from a verified token.
function resolveActorId(req: Request): number | null {
  return numericIdentity(req.user?.id) ?? numericIdentity(req.user?.sub) ?? null;
}

// Whitelist map -> strict-schema validate so no internal column (created_by) can
// leak. dueDate is a Drizzle `date` (already a string); timestamps are Date -> ISO.
function toResponse(row: Task, etag: string): TaskResponse {
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

router['post']('/api/funds/:fundId/tasks', async (req: Request, res: Response) => {
  try {
    const fundId = parseFundIdParam(firstString(req.params['fundId']));
    if (fundId === null) {
      return res.status(400).json({ error: 'Invalid fund ID' });
    }
    if (!(await enforceProvidedFundScope(req, res, fundId))) {
      return;
    }
    const parsed = TaskCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid request body', details: parsed.error.format() });
    }
    if (parsed.data.fundId !== fundId) {
      return res
        .status(400)
        .json({ error: 'fundId mismatch', message: 'Body fundId must match the path fundId' });
    }
    const created = await createTask({ ...parsed.data, createdBy: resolveActorId(req) });
    if (!created) {
      return res.status(500).json({ error: 'Failed to create task' });
    }
    return res.status(201).json(toResponse(created.row, rowVersionETag(created.xmin)));
  } catch {
    return res.status(500).json({ error: 'Failed to create task' });
  }
});

router['get']('/api/funds/:fundId/tasks', async (req: Request, res: Response) => {
  try {
    const fundId = parseFundIdParam(firstString(req.params['fundId']));
    if (fundId === null) {
      return res.status(400).json({ error: 'Invalid fund ID' });
    }
    if (!(await enforceProvidedFundScope(req, res, fundId))) {
      return;
    }
    const rows = await listTasksForFund(fundId);
    return res
      .status(200)
      .json({ data: rows.map((r) => toResponse(r.row, rowVersionETag(r.xmin))) });
  } catch {
    return res.status(500).json({ error: 'Failed to list tasks' });
  }
});

// Edit fields + status under optimistic concurrency. Error order mirrors
// cash-flow-events: parse (400) -> scope (403) -> If-Match present (428) -> body
// (400) -> fundId-match (400) -> load (404) -> etag (412) -> atomic apply ->
// zero-row disambiguation. NO 409: tasks have no immutable state, transitions are
// free, so a zero-row update after a passing precondition means concurrent
// modify (412) or delete (404) only.
router['patch']('/api/funds/:fundId/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const fundId = parseFundIdParam(firstString(req.params['fundId']));
    if (fundId === null) {
      return res.status(400).json({ error: 'Invalid fund ID' });
    }
    // taskId reuses the same canonical positive-integer parser.
    const taskId = parseFundIdParam(firstString(req.params['taskId']));
    if (taskId === null) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }
    if (!(await enforceProvidedFundScope(req, res, fundId))) {
      return;
    }
    // If-Match required, checked BEFORE body validation (mirrors cash-flow-events).
    const ifMatch = firstString(req.headers['if-match']);
    if (!ifMatch) {
      return res
        .status(428)
        .json({ error: 'precondition_required', message: 'If-Match header is required' });
    }
    const parsed = TaskPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid request body', details: parsed.error.format() });
    }
    if (parsed.data.fundId !== undefined && parsed.data.fundId !== fundId) {
      return res
        .status(400)
        .json({ error: 'fundId mismatch', message: 'Body fundId must match the path fundId' });
    }

    const current = await loadTask(fundId, taskId);
    if (!current) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const currentEtag = rowVersionETag(current.xmin);
    if (parseETag(ifMatch) !== parseETag(currentEtag)) {
      return res.status(412).json({
        error: 'precondition_failed',
        message: 'Task has been modified',
        current: currentEtag,
      });
    }

    const updated = await updateTask({
      fundId,
      taskId,
      expectedXmin: current.xmin,
      patch: parsed.data,
    });
    if (!updated) {
      // Atomic update touched zero rows after a passing precondition -- disambiguate.
      const recheck = await loadTask(fundId, taskId);
      if (!recheck) {
        return res.status(404).json({ error: 'Task not found' });
      }
      return res.status(412).json({
        error: 'precondition_failed',
        message: 'Task has been modified',
        current: rowVersionETag(recheck.xmin),
      });
    }

    return res.status(200).json(toResponse(updated.row, rowVersionETag(updated.xmin)));
  } catch {
    return res.status(500).json({ error: 'Failed to update task' });
  }
});

export default router;
