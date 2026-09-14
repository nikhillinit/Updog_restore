import { Router } from 'express';
import type { Request, Response } from 'express';
import { parseFundIdParam } from '@shared/number';
import {
  TaskCreateSchema,
  TaskPatchSchema,
} from '@shared/contracts/operating-objects/task.contract';
import {
  TaskEvidenceLinkCreateRequestSchema,
  TaskEvidenceLinkListQuerySchema,
  TaskEvidenceLinkListResponseSchema,
} from '@shared/contracts/operating-objects/task-evidence-link.contract';
import { firstString } from '../lib/request-values';
import { enforceProvidedFundScope, enforceTeamWriteRole } from '../lib/auth/provided-fund-scope';
import { rowVersionETag } from '../lib/http-preconditions';
import { IdempotentCommandError } from '../lib/idempotent-command';
import { parseInternalEconomicsIdempotencyKey } from '../lib/internal-economics-idempotency-key';
import {
  createTask,
  listTasksForFund,
  toTaskResponse,
  updateTask,
} from '../services/operating-objects/task-service';
import {
  TaskEvidenceLinkServiceError,
  createTaskEvidenceLink,
  listTaskEvidenceLinks,
} from '../services/operating-objects/task-evidence-link-service';

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

router['post']('/api/funds/:fundId/tasks', async (req: Request, res: Response) => {
  try {
    const fundId = parseFundIdParam(firstString(req.params['fundId']));
    if (fundId === null) {
      return res.status(400).json({ error: 'Invalid fund ID' });
    }
    if (!(await enforceProvidedFundScope(req, res, fundId, { forWrite: true }))) {
      return;
    }
    if (!enforceTeamWriteRole(req, res)) {
      return;
    }
    const parsedKey = parseInternalEconomicsIdempotencyKey(req.headers['idempotency-key']);
    if (parsedKey.kind === 'missing') {
      return res.status(428).json({
        error: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required.',
      });
    }
    if (parsedKey.kind === 'invalid') {
      return res.status(400).json({
        error: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key must contain 1 to 128 RFC token characters.',
      });
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
    const created = await createTask({
      ...parsed.data,
      createdBy: resolveActorId(req),
      idempotencyKey: parsedKey.value,
    });
    if (!created) {
      return res.status(500).json({ error: 'Failed to create task' });
    }
    return res
      .status(created.replayed ? 200 : 201)
      .json(toTaskResponse(created.row, rowVersionETag(created.xmin)));
  } catch (error) {
    if (error instanceof IdempotentCommandError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
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
      .json({ data: rows.map((r) => toTaskResponse(r.row, rowVersionETag(r.xmin))) });
  } catch {
    return res.status(500).json({ error: 'Failed to list tasks' });
  }
});

router['get'](
  '/api/funds/:fundId/tasks/:taskId/evidence-links',
  async (req: Request, res: Response) => {
    try {
      const fundId = parseFundIdParam(firstString(req.params['fundId']));
      if (fundId === null) {
        return res.status(400).json({ error: 'Invalid fund ID' });
      }
      const taskId = parseFundIdParam(firstString(req.params['taskId']));
      if (taskId === null) {
        return res.status(400).json({ error: 'Invalid task ID' });
      }
      const parsedQuery = TaskEvidenceLinkListQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        return res.status(400).json({
          error: 'INVALID_TASK_EVIDENCE_LINK_QUERY',
          message: 'Task evidence link listing does not accept query parameters.',
        });
      }
      if (!(await enforceProvidedFundScope(req, res, fundId))) {
        return;
      }

      const data = await listTaskEvidenceLinks(fundId, taskId);
      const response = TaskEvidenceLinkListResponseSchema.parse({ data });
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json(response);
    } catch (error) {
      if (error instanceof TaskEvidenceLinkServiceError) {
        return res.status(error.statusCode).json({ error: error.code, message: error.message });
      }
      return res.status(500).json({ error: 'Failed to list task evidence links' });
    }
  }
);

router['post'](
  '/api/funds/:fundId/tasks/:taskId/evidence-links',
  async (req: Request, res: Response) => {
    try {
      const fundId = parseFundIdParam(firstString(req.params['fundId']));
      if (fundId === null) {
        return res.status(400).json({ error: 'Invalid fund ID' });
      }
      const taskId = parseFundIdParam(firstString(req.params['taskId']));
      if (taskId === null) {
        return res.status(400).json({ error: 'Invalid task ID' });
      }
      if (!(await enforceProvidedFundScope(req, res, fundId, { forWrite: true }))) {
        return;
      }
      if (!enforceTeamWriteRole(req, res)) {
        return;
      }

      const parsedKey = parseInternalEconomicsIdempotencyKey(req.headers['idempotency-key']);
      if (parsedKey.kind === 'missing') {
        return res.status(428).json({
          error: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'Idempotency-Key header is required.',
        });
      }
      if (parsedKey.kind === 'invalid') {
        return res.status(400).json({
          error: 'INVALID_IDEMPOTENCY_KEY',
          message: 'Idempotency-Key must contain 1 to 128 RFC token characters.',
        });
      }

      const parsedBody = TaskEvidenceLinkCreateRequestSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({
          error: 'INVALID_TASK_EVIDENCE_LINK_BODY',
          message: 'Request body does not satisfy the task evidence contract.',
        });
      }

      const result = await createTaskEvidenceLink({
        fundId,
        taskId,
        target: parsedBody.data.target,
        actorId: resolveActorId(req),
        idempotencyKey: parsedKey.value,
      });
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(result.replayed ? 200 : 201).json(result.evidenceLink);
    } catch (error) {
      if (error instanceof TaskEvidenceLinkServiceError) {
        return res.status(error.statusCode).json({ error: error.code, message: error.message });
      }
      if (error instanceof IdempotentCommandError) {
        return res.status(error.status).json({ error: error.code, message: error.message });
      }
      return res.status(500).json({ error: 'Failed to create task evidence link' });
    }
  }
);

// Authorization precedes receipt access. Exact command replay precedes the
// current ETag check; a new command still requires optimistic concurrency.
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
    if (!(await enforceProvidedFundScope(req, res, fundId, { forWrite: true }))) {
      return;
    }
    if (!enforceTeamWriteRole(req, res)) {
      return;
    }
    // If-Match required, checked BEFORE body validation (mirrors cash-flow-events).
    const ifMatch = firstString(req.headers['if-match']);
    if (!ifMatch) {
      return res
        .status(428)
        .json({ error: 'precondition_required', message: 'If-Match header is required' });
    }
    const parsedKey = parseInternalEconomicsIdempotencyKey(req.headers['idempotency-key']);
    if (parsedKey.kind === 'missing') {
      return res.status(428).json({
        error: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required.',
      });
    }
    if (parsedKey.kind === 'invalid') {
      return res.status(400).json({
        error: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key must contain 1 to 128 RFC token characters.',
      });
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

    const updated = await updateTask({
      fundId,
      taskId,
      ifMatch,
      idempotencyKey: parsedKey.value,
      createdBy: resolveActorId(req),
      patch: parsed.data,
    });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(updated.response);
  } catch (error) {
    if (error instanceof IdempotentCommandError) {
      if (error.status === 404) return res.status(404).json({ error: error.message });
      return res.status(error.status).json({
        error: error.code,
        message: error.message,
        ...(error.status === 412 ? { current: error.details?.['current'] } : {}),
      });
    }
    return res.status(500).json({ error: 'Failed to update task' });
  }
});

export default router;
