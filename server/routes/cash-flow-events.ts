import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseFundIdParam } from '@shared/number';
import type { CashFlowEvent } from '@shared/schema/lp-reporting-evidence';
import {
  CashFlowEventResponseSchema,
  LpCapitalCallSchema,
  LpCapitalCallPatchSchema,
  type CashFlowEventResponse,
} from '@shared/contracts/lp-reporting/cash-flow-event.contract';
import { firstString } from '../lib/request-values';
import { enforceProvidedFundScope } from '../lib/auth/provided-fund-scope';
import { parseETag, rowVersionETag } from '../lib/http-preconditions';
import {
  createLpCapitalCallEvent,
  listCashFlowEventsForFund,
  loadCashFlowEvent,
  updateLpCapitalCallDraft,
  approveLpCapitalCallEvent,
  lockLpCapitalCallEvent,
  type CashFlowEventRow,
} from '../services/lp-reporting/cash-flow-event-service';

const router = Router();

// Whitelist mapping, then strict-schema validate so no internal column
// (source_hash, lock/supersede/reversal, provenance) can leak. Money (`amount`)
// is a Drizzle decimal string -- pass through untouched (ADR-011).
function toResponse(row: CashFlowEvent, etag: string): CashFlowEventResponse {
  return CashFlowEventResponseSchema.parse({
    id: row.id,
    fundId: row.fundId,
    eventType: row.eventType,
    amount: row.amount,
    currency: row.currency,
    eventDate: row.eventDate.toISOString(),
    perspective: row.perspective,
    description: row.description,
    payload: row.payload ?? {},
    status: row.status,
    createdAt: (row.createdAt ?? row.eventDate).toISOString(),
    updatedAt: (row.updatedAt ?? row.createdAt ?? row.eventDate).toISOString(),
    etag,
  });
}

// Lifecycle transitions carry no body; the transition is the URL + If-Match.
// Strict-reject any non-empty body (repo contract style); `?? {}` lets a no-body
// POST through (express leaves req.body undefined for an empty request).
const LifecycleBodySchema = z.object({}).strict();

function numericIdentity(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return Number.parseInt(value, 10);
  return null;
}

// Best-effort actor id for lockedBy. JWT subs are not guaranteed numeric and
// lockedBy is a nullable users.id FK, so an unresolved identity stores NULL
// (never 401). enforceProvidedFundScope populates req.user from a verified token.
function resolveActorId(req: Request): number | null {
  return numericIdentity(req.user?.id) ?? numericIdentity(req.user?.sub) ?? null;
}

interface TransitionConfig {
  requiredStatus: 'draft' | 'approved';
  apply: (
    fundId: number,
    eventId: number,
    expectedXmin: string,
    req: Request
  ) => Promise<CashFlowEventRow | undefined>;
}

// Shared draft->approved / approved->locked transition. Mirrors the PATCH guard
// order: parse (400) -> scope (401/403) -> If-Match (428) -> load (404) ->
// status/type (409) -> etag (412) -> atomic apply -> zero-row disambiguation.
async function handleTransition(
  req: Request,
  res: Response,
  config: TransitionConfig
): Promise<Response | void> {
  const fundId = parseFundIdParam(firstString(req.params['fundId']));
  if (fundId === null) {
    return res.status(400).json({ error: 'Invalid fund ID' });
  }
  const eventId = parseFundIdParam(firstString(req.params['eventId']));
  if (eventId === null) {
    return res.status(400).json({ error: 'Invalid event ID' });
  }
  if (!(await enforceProvidedFundScope(req, res, fundId))) {
    return;
  }
  const ifMatch = firstString(req.headers['if-match']);
  if (!ifMatch) {
    return res
      .status(428)
      .json({ error: 'precondition_required', message: 'If-Match header is required' });
  }
  const body = LifecycleBodySchema.safeParse(req.body ?? {});
  if (!body.success) {
    return res.status(400).json({ error: 'Invalid request body', details: body.error.format() });
  }

  const current = await loadCashFlowEvent(fundId, eventId);
  if (!current) {
    return res.status(404).json({ error: 'Event not found' });
  }
  if (current.row.eventType !== 'lp_capital_call' || current.row.status !== config.requiredStatus) {
    return res
      .status(409)
      .json({ error: 'conflict', message: `Event is not ${config.requiredStatus}` });
  }
  const currentEtag = rowVersionETag(current.xmin);
  if (parseETag(ifMatch) !== parseETag(currentEtag)) {
    return res.status(412).json({
      error: 'precondition_failed',
      message: 'Event has been modified',
      current: currentEtag,
    });
  }

  const updated = await config.apply(fundId, eventId, current.xmin, req);
  if (!updated) {
    const recheck = await loadCashFlowEvent(fundId, eventId);
    if (!recheck) {
      return res.status(404).json({ error: 'Event not found' });
    }
    if (
      recheck.row.eventType !== 'lp_capital_call' ||
      recheck.row.status !== config.requiredStatus
    ) {
      return res
        .status(409)
        .json({ error: 'conflict', message: `Event is not ${config.requiredStatus}` });
    }
    return res.status(412).json({
      error: 'precondition_failed',
      message: 'Event has been modified',
      current: rowVersionETag(recheck.xmin),
    });
  }

  return res.status(200).json(toResponse(updated.row, rowVersionETag(updated.xmin)));
}

router['post']('/api/funds/:fundId/cash-flow-events', async (req: Request, res: Response) => {
  try {
    const fundId = parseFundIdParam(firstString(req.params['fundId']));
    if (fundId === null) {
      return res.status(400).json({ error: 'Invalid fund ID' });
    }
    if (!(await enforceProvidedFundScope(req, res, fundId))) {
      return;
    }
    const parsed = LpCapitalCallSchema.safeParse(req.body);
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
    const created = await createLpCapitalCallEvent({ ...parsed.data, fundId });
    if (!created) {
      return res.status(500).json({ error: 'Failed to create cash flow event' });
    }
    return res.status(201).json(toResponse(created.row, rowVersionETag(created.xmin)));
  } catch {
    return res.status(500).json({ error: 'Failed to create cash flow event' });
  }
});

router['get']('/api/funds/:fundId/cash-flow-events', async (req: Request, res: Response) => {
  try {
    const fundId = parseFundIdParam(firstString(req.params['fundId']));
    if (fundId === null) {
      return res.status(400).json({ error: 'Invalid fund ID' });
    }
    if (!(await enforceProvidedFundScope(req, res, fundId))) {
      return;
    }
    const rows = await listCashFlowEventsForFund(fundId);
    return res
      .status(200)
      .json({ data: rows.map((r) => toResponse(r.row, rowVersionETag(r.xmin))) });
  } catch {
    return res.status(500).json({ error: 'Failed to list cash flow events' });
  }
});

router['patch'](
  '/api/funds/:fundId/cash-flow-events/:eventId',
  async (req: Request, res: Response) => {
    try {
      const fundId = parseFundIdParam(firstString(req.params['fundId']));
      if (fundId === null) {
        return res.status(400).json({ error: 'Invalid fund ID' });
      }
      // eventId reuses the same canonical positive-integer parser.
      const eventId = parseFundIdParam(firstString(req.params['eventId']));
      if (eventId === null) {
        return res.status(400).json({ error: 'Invalid event ID' });
      }
      if (!(await enforceProvidedFundScope(req, res, fundId))) {
        return;
      }
      const ifMatch = firstString(req.headers['if-match']);
      if (!ifMatch) {
        return res
          .status(428)
          .json({ error: 'precondition_required', message: 'If-Match header is required' });
      }
      const parsed = LpCapitalCallPatchSchema.safeParse(req.body);
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

      const current = await loadCashFlowEvent(fundId, eventId);
      if (!current) {
        return res.status(404).json({ error: 'Event not found' });
      }
      if (current.row.eventType !== 'lp_capital_call' || current.row.status !== 'draft') {
        return res
          .status(409)
          .json({ error: 'conflict', message: 'Event is not an editable draft' });
      }
      const currentEtag = rowVersionETag(current.xmin);
      if (parseETag(ifMatch) !== parseETag(currentEtag)) {
        return res.status(412).json({
          error: 'precondition_failed',
          message: 'Event has been modified',
          current: currentEtag,
        });
      }

      const updated = await updateLpCapitalCallDraft({
        fundId,
        eventId,
        expectedXmin: current.xmin,
        currentRow: current.row,
        patch: parsed.data,
      });

      if (!updated) {
        // Atomic update touched zero rows after a passing precondition -- disambiguate.
        const recheck = await loadCashFlowEvent(fundId, eventId);
        if (!recheck) {
          return res.status(404).json({ error: 'Event not found' });
        }
        if (recheck.row.eventType !== 'lp_capital_call' || recheck.row.status !== 'draft') {
          return res
            .status(409)
            .json({ error: 'conflict', message: 'Event is not an editable draft' });
        }
        return res.status(412).json({
          error: 'precondition_failed',
          message: 'Event has been modified',
          current: rowVersionETag(recheck.xmin),
        });
      }

      return res.status(200).json(toResponse(updated.row, rowVersionETag(updated.xmin)));
    } catch {
      return res.status(500).json({ error: 'Failed to update cash flow event' });
    }
  }
);

router['post'](
  '/api/funds/:fundId/cash-flow-events/:eventId/approve',
  async (req: Request, res: Response) => {
    try {
      await handleTransition(req, res, {
        requiredStatus: 'draft',
        apply: (fundId, eventId, expectedXmin) =>
          approveLpCapitalCallEvent({ fundId, eventId, expectedXmin }),
      });
    } catch {
      return res.status(500).json({ error: 'Failed to approve cash flow event' });
    }
  }
);

router['post'](
  '/api/funds/:fundId/cash-flow-events/:eventId/lock',
  async (req: Request, res: Response) => {
    try {
      await handleTransition(req, res, {
        requiredStatus: 'approved',
        apply: (fundId, eventId, expectedXmin, request) =>
          lockLpCapitalCallEvent({
            fundId,
            eventId,
            expectedXmin,
            lockedBy: resolveActorId(request),
          }),
      });
    } catch {
      return res.status(500).json({ error: 'Failed to lock cash flow event' });
    }
  }
);

export default router;
