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
  approveLpCapitalCallEvent: vi.fn(),
  lockLpCapitalCallEvent: vi.fn(),
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

function row(overrides: Record<string, unknown> = {}) {
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

interface Variant {
  op: 'approve' | 'lock';
  source: 'draft' | 'approved';
  target: 'approved' | 'locked';
  fn: () => ReturnType<typeof vi.fn>;
  wrongStatuses: string[];
}

const VARIANTS: Variant[] = [
  {
    op: 'approve',
    source: 'draft',
    target: 'approved',
    fn: () => svc.approveLpCapitalCallEvent,
    wrongStatuses: ['approved', 'locked', 'reversed'],
  },
  {
    op: 'lock',
    source: 'approved',
    target: 'locked',
    fn: () => svc.lockLpCapitalCallEvent,
    wrongStatuses: ['draft', 'locked', 'reversed'],
  },
];

describe('cash-flow-events lifecycle route contract', () => {
  beforeEach(() => {
    fundScopeState.enforceProvidedFundScope.mockReset();
    fundScopeState.enforceProvidedFundScope.mockResolvedValue(true);
    svc.loadCashFlowEvent.mockReset();
    svc.approveLpCapitalCallEvent.mockReset();
    svc.lockLpCapitalCallEvent.mockReset();
  });

  for (const v of VARIANTS) {
    const PATH = `/api/funds/1/cash-flow-events/10/${v.op}`;
    describe(v.op, () => {
      it('rejects a non-canonical eventId with 400 before scope/load', async () => {
        const res = await request(makeApp())
          .post(`/api/funds/1/cash-flow-events/01/${v.op}`)
          .set('If-Match', '"x"');
        expect(res.status).toBe(400);
        expect(fundScopeState.enforceProvidedFundScope).not.toHaveBeenCalled();
        expect(svc.loadCashFlowEvent).not.toHaveBeenCalled();
      });

      it('denies cross-fund scope with 403 before load', async () => {
        fundScopeState.enforceProvidedFundScope.mockImplementationOnce(async (_req, res) => {
          res.status(403).json({ error: 'Forbidden' });
          return false;
        });
        const res = await request(makeApp()).post(PATH).set('If-Match', '"x"');
        expect(res.status).toBe(403);
        expect(svc.loadCashFlowEvent).not.toHaveBeenCalled();
      });

      it('returns 428 when If-Match is missing', async () => {
        const res = await request(makeApp()).post(PATH);
        expect(res.status).toBe(428);
        expect(svc.loadCashFlowEvent).not.toHaveBeenCalled();
      });

      it('returns 404 when the event does not exist', async () => {
        svc.loadCashFlowEvent.mockResolvedValueOnce(undefined);
        const res = await request(makeApp()).post(PATH).set('If-Match', '"x"');
        expect(res.status).toBe(404);
      });

      for (const wrong of v.wrongStatuses) {
        it(`returns 409 when the row status is ${wrong} (not ${v.source})`, async () => {
          svc.loadCashFlowEvent.mockResolvedValueOnce({ row: row({ status: wrong }), xmin: '5' });
          const res = await request(makeApp()).post(PATH).set('If-Match', rowVersionETag('5'));
          expect(res.status).toBe(409);
          expect(v.fn()).not.toHaveBeenCalled();
        });
      }

      it('rejects a non-empty body with 400 before load', async () => {
        const res = await request(makeApp())
          .post(PATH)
          .set('If-Match', rowVersionETag('5'))
          .send({ status: 'approved' });
        expect(res.status).toBe(400);
        expect(svc.loadCashFlowEvent).not.toHaveBeenCalled();
      });

      it('returns 409 for a non-lp_capital_call row', async () => {
        svc.loadCashFlowEvent.mockResolvedValueOnce({
          row: row({ status: v.source, eventType: 'fund_expense' }),
          xmin: '5',
        });
        const res = await request(makeApp()).post(PATH).set('If-Match', rowVersionETag('5'));
        expect(res.status).toBe(409);
        expect(v.fn()).not.toHaveBeenCalled();
      });

      it('returns 412 for a stale If-Match', async () => {
        svc.loadCashFlowEvent.mockResolvedValueOnce({ row: row({ status: v.source }), xmin: '5' });
        const res = await request(makeApp()).post(PATH).set('If-Match', rowVersionETag('999'));
        expect(res.status).toBe(412);
        expect(v.fn()).not.toHaveBeenCalled();
      });

      it(`200s a happy ${v.op} and returns a fresh etag + ${v.target} status`, async () => {
        svc.loadCashFlowEvent.mockResolvedValueOnce({ row: row({ status: v.source }), xmin: '5' });
        v.fn().mockResolvedValueOnce({ row: row({ status: v.target }), xmin: '6' });
        const res = await request(makeApp()).post(PATH).set('If-Match', rowVersionETag('5'));
        expect(res.status).toBe(200);
        expect(res.body.status).toBe(v.target);
        expect(res.body.etag).toBe(rowVersionETag('6'));
        expect(res.body).not.toHaveProperty('sourceHash');
        expect(res.body).not.toHaveProperty('lockedBy');
      });

      it('disambiguates a zero-row apply to 412 (token changed, still source status)', async () => {
        svc.loadCashFlowEvent
          .mockResolvedValueOnce({ row: row({ status: v.source }), xmin: '5' })
          .mockResolvedValueOnce({ row: row({ status: v.source }), xmin: '7' });
        v.fn().mockResolvedValueOnce(undefined);
        const res = await request(makeApp()).post(PATH).set('If-Match', rowVersionETag('5'));
        expect(res.status).toBe(412);
        expect(res.body.current).toBe(rowVersionETag('7'));
      });

      it('disambiguates a zero-row apply to 404 (row vanished on recheck)', async () => {
        svc.loadCashFlowEvent
          .mockResolvedValueOnce({ row: row({ status: v.source }), xmin: '5' })
          .mockResolvedValueOnce(undefined);
        v.fn().mockResolvedValueOnce(undefined);
        const res = await request(makeApp()).post(PATH).set('If-Match', rowVersionETag('5'));
        expect(res.status).toBe(404);
      });

      it('disambiguates a zero-row apply to 409 (status changed on recheck)', async () => {
        svc.loadCashFlowEvent
          .mockResolvedValueOnce({ row: row({ status: v.source }), xmin: '5' })
          .mockResolvedValueOnce({ row: row({ status: v.target }), xmin: '7' });
        v.fn().mockResolvedValueOnce(undefined);
        const res = await request(makeApp()).post(PATH).set('If-Match', rowVersionETag('5'));
        expect(res.status).toBe(409);
      });
    });
  }

  it('lock passes a numeric req.user identity through as lockedBy', async () => {
    fundScopeState.enforceProvidedFundScope.mockImplementationOnce(async (req) => {
      req.user = {
        id: '42',
        sub: '42',
        email: 'a@b.c',
        roles: [],
        fundIds: [],
        ip: 'x',
        userAgent: 'y',
      };
      return true;
    });
    svc.loadCashFlowEvent.mockResolvedValueOnce({ row: row({ status: 'approved' }), xmin: '5' });
    svc.lockLpCapitalCallEvent.mockResolvedValueOnce({ row: row({ status: 'locked' }), xmin: '6' });
    await request(makeApp())
      .post('/api/funds/1/cash-flow-events/10/lock')
      .set('If-Match', rowVersionETag('5'))
      .expect(200);
    expect(svc.lockLpCapitalCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({ fundId: 1, eventId: 10, expectedXmin: '5', lockedBy: 42 })
    );
  });

  it('lock stores NULL lockedBy when identity is absent', async () => {
    svc.loadCashFlowEvent.mockResolvedValueOnce({ row: row({ status: 'approved' }), xmin: '5' });
    svc.lockLpCapitalCallEvent.mockResolvedValueOnce({ row: row({ status: 'locked' }), xmin: '6' });
    await request(makeApp())
      .post('/api/funds/1/cash-flow-events/10/lock')
      .set('If-Match', rowVersionETag('5'))
      .expect(200);
    expect(svc.lockLpCapitalCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({ lockedBy: null })
    );
  });
});
