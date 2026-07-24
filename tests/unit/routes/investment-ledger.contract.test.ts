// Default import on purpose: node-setup.ts vi.mock('fs') stubs named exports,
// while its actual-module spread preserves `default` as the real fs module.
import fs from 'node:fs';
import path from 'node:path';

import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const serviceState = vi.hoisted(() => ({
  createFinancingEvent: vi.fn(),
  recordFinancingTranche: vi.fn(),
  correctFinancingTranche: vi.fn(),
  loadFinancingEventDetail: vi.fn(),
}));

// The factory must export every symbol the route imports, or the route module
// throws at load time rather than failing a single assertion.
vi.mock('../../../server/services/investment-ledger/financing-event-service', () => ({
  createFinancingEvent: serviceState.createFinancingEvent,
  recordFinancingTranche: serviceState.recordFinancingTranche,
  correctFinancingTranche: serviceState.correctFinancingTranche,
  loadFinancingEventDetail: serviceState.loadFinancingEventDetail,
}));

vi.mock('../../../server/lib/auth/jwt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/lib/auth/jwt')>();
  return {
    ...actual,
    requireAuth: () => (req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: unknown }).user = { id: 3 };
      next();
    },
    requireFundAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
  };
});

import investmentLedgerRouter from '../../../server/routes/investment-ledger';

const EVENT = {
  id: 100,
  fundId: 7,
  companyIdentityId: 11,
  eventKey: 'series-a-2026',
};

const TRANCHE = { id: 500, fundId: 7, trancheKey: 'first-close', version: 1 };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(investmentLedgerRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

const eventBody = {
  companyIdentityId: 11,
  eventKey: 'series-a-2026',
  roundName: 'Series A',
  securityType: 'equity',
  eventDate: '2026-02-01',
  currency: 'USD',
  postMoneyValuation: '40000000.000000',
};

const trancheBody = {
  trancheKey: 'first-close',
  closingDate: '2026-02-01',
  securityType: 'equity',
  investmentAmount: '2500000.000000',
  pricePerShare: '4.250000',
};

beforeEach(() => {
  serviceState.createFinancingEvent.mockReset();
  serviceState.recordFinancingTranche.mockReset();
  serviceState.correctFinancingTranche.mockReset();
  serviceState.loadFinancingEventDetail.mockReset();
});

describe('investment-ledger routes', () => {
  it('rejects a write with no Idempotency-Key before it inspects the body', async () => {
    const response = await request(makeApp())
      .post('/api/funds/7/investment-ledger/financing-events')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_IDEMPOTENCY_KEY');
    expect(serviceState.createFinancingEvent).not.toHaveBeenCalled();
  });

  it('rejects an Idempotency-Key longer than 128 characters', async () => {
    const response = await request(makeApp())
      .post('/api/funds/7/investment-ledger/financing-events')
      .set('Idempotency-Key', 'k'.repeat(129))
      .send(eventBody);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_IDEMPOTENCY_KEY');
    expect(serviceState.createFinancingEvent).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric fundId', async () => {
    const response = await request(makeApp())
      .post('/api/funds/abc/investment-ledger/financing-events')
      .set('Idempotency-Key', 'evt-1')
      .send(eventBody);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_FUND_ID');
    expect(serviceState.createFinancingEvent).not.toHaveBeenCalled();
  });

  it('returns 201 on a first event write and 200 on a replay', async () => {
    serviceState.createFinancingEvent.mockResolvedValueOnce({ value: EVENT, replayed: false });
    const created = await request(makeApp())
      .post('/api/funds/7/investment-ledger/financing-events')
      .set('Idempotency-Key', 'evt-1')
      .send(eventBody);

    expect(created.status).toBe(201);
    expect(created.body).toEqual(EVENT);
    expect(serviceState.createFinancingEvent).toHaveBeenCalledWith(
      expect.objectContaining({ fundId: 7, actorId: 3, idempotencyKey: 'evt-1' })
    );

    serviceState.createFinancingEvent.mockResolvedValueOnce({ value: EVENT, replayed: true });
    const replayed = await request(makeApp())
      .post('/api/funds/7/investment-ledger/financing-events')
      .set('Idempotency-Key', 'evt-1')
      .send(eventBody);

    expect(replayed.status).toBe(200);
  });

  it('records a tranche against the parsed event id', async () => {
    serviceState.recordFinancingTranche.mockResolvedValueOnce({
      value: TRANCHE,
      replayed: false,
    });

    const response = await request(makeApp())
      .post('/api/funds/7/investment-ledger/financing-events/100/tranches')
      .set('Idempotency-Key', 'tr-1')
      .send(trancheBody);

    expect(response.status).toBe(201);
    expect(serviceState.recordFinancingTranche).toHaveBeenCalledWith(
      expect.objectContaining({ fundId: 7, eventId: 100, idempotencyKey: 'tr-1' })
    );
  });

  it('rejects a non-numeric tranche id on the correction route', async () => {
    const response = await request(makeApp())
      .post('/api/funds/7/investment-ledger/tranches/not-a-number/corrections')
      .set('Idempotency-Key', 'fix-1')
      .send(trancheBody);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_TRANCHE_ID');
    expect(serviceState.correctFinancingTranche).not.toHaveBeenCalled();
  });

  it('surfaces a service conflict with its own status and code', async () => {
    serviceState.correctFinancingTranche.mockRejectedValueOnce(
      Object.assign(new Error('Only the current tranche version can be corrected.'), {
        status: 409,
        statusCode: 409,
        code: 'FINANCING_TRANCHE_NOT_CURRENT',
      })
    );

    const response = await request(makeApp())
      .post('/api/funds/7/investment-ledger/tranches/500/corrections')
      .set('Idempotency-Key', 'fix-1')
      .send(trancheBody);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('FINANCING_TRANCHE_NOT_CURRENT');
  });

  it('serves the fund-scoped event detail read', async () => {
    const detail = { event: EVENT, headTranches: [TRANCHE], versionHistory: [TRANCHE] };
    serviceState.loadFinancingEventDetail.mockResolvedValueOnce(detail);

    const response = await request(makeApp()).get(
      '/api/funds/7/investment-ledger/financing-events/100'
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual(detail);
    expect(serviceState.loadFinancingEventDetail).toHaveBeenCalledWith(7, 100);
  });

  it('keeps persistence behind the service (no ../db import)', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'server', 'routes', 'investment-ledger.ts'),
      'utf8'
    );

    expect(source).not.toMatch(/from\s+'\.\.\/db'/);
    expect(source).not.toMatch(/from\s+"\.\.\/db"/);
  });
});
