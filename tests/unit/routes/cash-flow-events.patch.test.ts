import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import express from 'express';
import request from 'supertest';
import { rowVersionETag } from '../../../server/lib/http-preconditions';

const fundScopeState = vi.hoisted(() => ({
  enforceProvidedFundScope: vi.fn(async (_req: Request, _res: Response, _fundId: number) => true),
}));
const svc = vi.hoisted(() => ({
  loadCashFlowEvent: vi.fn(),
  updateLpCapitalCallDraft: vi.fn(),
  createLpCapitalCallEvent: vi.fn(),
  listCashFlowEventsForFund: vi.fn(),
}));

vi.mock('../../../server/lib/auth/provided-fund-scope', () => ({
  enforceProvidedFundScope: fundScopeState.enforceProvidedFundScope,
}));
vi.mock('../../../server/services/lp-reporting/cash-flow-event-service', () => svc);

import cashFlowEventsRouter from '../../../server/routes/cash-flow-events';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cashFlowEventsRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    fundId: 1,
    eventType: 'lp_capital_call',
    amount: '1250000.000000',
    currency: 'USD',
    eventDate: new Date('2026-06-15T00:00:00.000Z'),
    perspective: 'lp_net',
    description: null,
    payload: { callNumber: 1 },
    status: 'draft',
    createdAt: new Date('2026-06-15T00:00:00.000Z'),
    updatedAt: new Date('2026-06-15T00:00:00.000Z'),
    ...overrides,
  };
}

const PATH = '/api/funds/1/cash-flow-events/10';

describe('cash-flow-events PATCH route contract', () => {
  beforeEach(() => {
    fundScopeState.enforceProvidedFundScope.mockReset();
    fundScopeState.enforceProvidedFundScope.mockResolvedValue(true);
    svc.loadCashFlowEvent.mockReset();
    svc.updateLpCapitalCallDraft.mockReset();
  });

  it('rejects a non-canonical eventId with 400 before scope/load', async () => {
    const res = await request(makeApp())
      .patch('/api/funds/1/cash-flow-events/01')
      .set('If-Match', '"x"')
      .send({ amount: '5' });
    expect(res.status).toBe(400);
    expect(fundScopeState.enforceProvidedFundScope).not.toHaveBeenCalled();
    expect(svc.loadCashFlowEvent).not.toHaveBeenCalled();
  });

  it('denies cross-fund scope with 403 before load', async () => {
    fundScopeState.enforceProvidedFundScope.mockImplementationOnce(async (_req, res) => {
      res.status(403).json({ error: 'Forbidden' });
      return false;
    });
    const res = await request(makeApp()).patch(PATH).set('If-Match', '"x"').send({ amount: '5' });
    expect(res.status).toBe(403);
    expect(svc.loadCashFlowEvent).not.toHaveBeenCalled();
  });

  it('returns 428 when If-Match is missing', async () => {
    const res = await request(makeApp()).patch(PATH).send({ amount: '5' });
    expect(res.status).toBe(428);
    expect(svc.loadCashFlowEvent).not.toHaveBeenCalled();
  });

  it('returns 400 for an empty patch body', async () => {
    const res = await request(makeApp()).patch(PATH).set('If-Match', '"x"').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 for unknown top-level keys', async () => {
    const res = await request(makeApp())
      .patch(PATH)
      .set('If-Match', '"x"')
      .send({ status: 'approved' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when body fundId mismatches the path', async () => {
    const res = await request(makeApp())
      .patch(PATH)
      .set('If-Match', '"x"')
      .send({ fundId: 2, amount: '5' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the event does not exist', async () => {
    svc.loadCashFlowEvent.mockResolvedValueOnce(undefined);
    const res = await request(makeApp()).patch(PATH).set('If-Match', '"x"').send({ amount: '5' });
    expect(res.status).toBe(404);
  });

  it('returns 409 for a non-draft row', async () => {
    svc.loadCashFlowEvent.mockResolvedValueOnce({
      row: draftRow({ status: 'approved' }),
      xmin: '5',
    });
    const res = await request(makeApp())
      .patch(PATH)
      .set('If-Match', rowVersionETag('5'))
      .send({ amount: '5' });
    expect(res.status).toBe(409);
    expect(svc.updateLpCapitalCallDraft).not.toHaveBeenCalled();
  });

  it('returns 412 for a stale If-Match', async () => {
    svc.loadCashFlowEvent.mockResolvedValueOnce({ row: draftRow(), xmin: '5' });
    const res = await request(makeApp())
      .patch(PATH)
      .set('If-Match', rowVersionETag('999'))
      .send({ amount: '5' });
    expect(res.status).toBe(412);
    expect(svc.updateLpCapitalCallDraft).not.toHaveBeenCalled();
  });

  it('200s a happy draft edit and returns a fresh etag', async () => {
    svc.loadCashFlowEvent.mockResolvedValueOnce({ row: draftRow(), xmin: '5' });
    svc.updateLpCapitalCallDraft.mockResolvedValueOnce({
      row: draftRow({ amount: '7.000000' }),
      xmin: '6',
    });
    const res = await request(makeApp())
      .patch(PATH)
      .set('If-Match', rowVersionETag('5'))
      .send({ amount: '7' });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe('7.000000');
    expect(res.body.etag).toBe(rowVersionETag('6'));
    expect(res.body).not.toHaveProperty('sourceHash');
    expect(res.body).not.toHaveProperty('lockedAt');
  });

  it('disambiguates a zero-row update to 412 (token changed under us)', async () => {
    svc.loadCashFlowEvent
      .mockResolvedValueOnce({ row: draftRow(), xmin: '5' })
      .mockResolvedValueOnce({ row: draftRow(), xmin: '7' });
    svc.updateLpCapitalCallDraft.mockResolvedValueOnce(undefined);
    const res = await request(makeApp())
      .patch(PATH)
      .set('If-Match', rowVersionETag('5'))
      .send({ amount: '7' });
    expect(res.status).toBe(412);
    expect(res.body.current).toBe(rowVersionETag('7'));
  });
});
