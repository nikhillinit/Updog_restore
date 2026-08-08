import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import express from 'express';
import request from 'supertest';

const fundScopeState = vi.hoisted(() => ({
  enforceProvidedFundScope: vi.fn(async (_req: Request, _res: Response, _fundId: number) => true),
}));

const serviceState = vi.hoisted(() => ({
  createPending: vi.fn(),
  markCompleted: vi.fn(),
  markFailed: vi.fn(),
  getHistoryByFund: vi.fn(async (): Promise<unknown[]> => []),
  getById: vi.fn(async (): Promise<unknown> => null),
}));

vi.mock('../../../server/lib/auth/provided-fund-scope', () => ({
  enforceProvidedFundScope: fundScopeState.enforceProvidedFundScope,
}));

vi.mock('../../../server/services/sensitivity-run-service', () => ({
  sensitivityRunService: {
    createPending: serviceState.createPending,
    markCompleted: serviceState.markCompleted,
    markFailed: serviceState.markFailed,
    getHistoryByFund: serviceState.getHistoryByFund,
    getById: serviceState.getById,
  },
}));

import sensitivityRouter from '../../../server/routes/sensitivity';

function makeApp(role = 'admin') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: '42',
      sub: '42',
      email: `${role}@example.com`,
      role,
      roles: [role],
      fundIds: [1],
      ip: '127.0.0.1',
      userAgent: 'vitest',
    };
    next();
  });
  app.use(sensitivityRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

function denyOnce() {
  fundScopeState.enforceProvidedFundScope.mockImplementationOnce(async (_req, res) => {
    res.status(403).json({ error: 'Forbidden', code: 'FUND_ACCESS_DENIED' });
    return false;
  });
}

describe('sensitivity route contracts', () => {
  beforeEach(() => {
    fundScopeState.enforceProvidedFundScope.mockReset();
    fundScopeState.enforceProvidedFundScope.mockResolvedValue(true);
    serviceState.createPending.mockReset();
    serviceState.getHistoryByFund.mockReset();
    serviceState.getHistoryByFund.mockResolvedValue([]);
    serviceState.getById.mockReset();
    serviceState.getById.mockResolvedValue(null);
  });

  it('GET runs rejects non-canonical fundId before scope check and history read', async () => {
    const res = await request(makeApp()).get('/funds/01/sensitivity/runs');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'INVALID_FUND_ID' });
    expect(fundScopeState.enforceProvidedFundScope).not.toHaveBeenCalled();
    expect(serviceState.getHistoryByFund).not.toHaveBeenCalled();
  });

  it('POST one-way denies cross-fund scope before creating a run', async () => {
    denyOnce();
    const res = await request(makeApp()).post('/funds/2/sensitivity/one-way').send({});
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2,
      { forWrite: true }
    );
    expect(serviceState.createPending).not.toHaveBeenCalled();
  });

  it('denies restricted principals before creating a one-way run', async () => {
    const res = await request(makeApp('lp')).post('/funds/1/sensitivity/one-way').send({});

    expect(res.status).toBe(403);
    expect(fundScopeState.enforceProvidedFundScope).not.toHaveBeenCalled();
    expect(serviceState.createPending).not.toHaveBeenCalled();
  });

  it.each(['partner', 'admin', 'analyst'])('allows %s to create a one-way run', async (role) => {
    serviceState.createPending.mockResolvedValueOnce({ id: 1 });
    const res = await request(makeApp(role))
      .post('/funds/1/sensitivity/one-way')
      .send({
        variableId: 'reserve_pool_pct',
        range: { min: 0.1, max: 0.4 },
        steps: 4,
        metricId: 'tvpi',
      });

    expect(res.status).not.toBe(403);
    expect(serviceState.createPending).toHaveBeenCalledTimes(1);
  });

  it('POST two-way denies cross-fund scope before creating a run', async () => {
    denyOnce();
    const res = await request(makeApp()).post('/funds/2/sensitivity/two-way').send({});
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2
    );
    expect(serviceState.createPending).not.toHaveBeenCalled();
  });

  it('POST stress denies cross-fund scope before creating a run', async () => {
    denyOnce();
    const res = await request(makeApp()).post('/funds/2/sensitivity/stress').send({});
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2
    );
    expect(serviceState.createPending).not.toHaveBeenCalled();
  });

  it('GET runs denies cross-fund scope before reading history', async () => {
    denyOnce();
    const res = await request(makeApp()).get('/funds/2/sensitivity/runs');
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2
    );
    expect(serviceState.getHistoryByFund).not.toHaveBeenCalled();
  });

  it('GET runs/:runId denies cross-fund scope before reading the run', async () => {
    denyOnce();
    const res = await request(makeApp()).get('/funds/2/sensitivity/runs/5');
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2
    );
    expect(serviceState.getById).not.toHaveBeenCalled();
  });

  it('GET runs enforces scope for the requested fund then returns history', async () => {
    const res = await request(makeApp()).get('/funds/1/sensitivity/runs');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ runs: [] });
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      1
    );
    expect(serviceState.getHistoryByFund).toHaveBeenCalledTimes(1);
  });
});
