import { Router } from 'express';
import type { Request, Response } from 'express';
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
        return res
          .status(412)
          .json({
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

export default router;
