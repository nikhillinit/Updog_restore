import { Router } from 'express';
import type { Request, Response } from 'express';
import { parseFundIdParam } from '@shared/number';
import type { CashFlowEvent } from '@shared/schema/lp-reporting-evidence';
import {
  CashFlowEventResponseSchema,
  LpCapitalCallSchema,
  type CashFlowEventResponse,
} from '@shared/contracts/lp-reporting/cash-flow-event.contract';
import { firstString } from '../lib/request-values';
import { enforceProvidedFundScope } from '../lib/auth/provided-fund-scope';
import {
  createLpCapitalCallEvent,
  listCashFlowEventsForFund,
} from '../services/lp-reporting/cash-flow-event-service';

const router = Router();

// Whitelist mapping: build the exact response shape, then validate through the
// strict schema so no internal column (source_hash, lock/supersede/reversal,
// provenance) can ever leak. Money (`amount`) is a Drizzle decimal string -- pass
// it through untouched (ADR-011).
function toResponse(row: CashFlowEvent): CashFlowEventResponse {
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

    // Phase 1 accepts ONLY lp_capital_call; a different eventType fails the
    // literal discriminator and is rejected here as a 400.
    const parsed = LpCapitalCallSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }

    // Confused-deputy guard: the path fundId is authoritative.
    if (parsed.data.fundId !== fundId) {
      return res.status(400).json({
        error: 'fundId mismatch',
        message: 'Body fundId must match the path fundId',
      });
    }

    const row = await createLpCapitalCallEvent({ ...parsed.data, fundId });

    if (!row) {
      return res.status(500).json({ error: 'Failed to create cash flow event' });
    }

    return res.status(201).json(toResponse(row));
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

    return res.status(200).json({ data: rows.map(toResponse) });
  } catch {
    return res.status(500).json({ error: 'Failed to list cash flow events' });
  }
});

export default router;
