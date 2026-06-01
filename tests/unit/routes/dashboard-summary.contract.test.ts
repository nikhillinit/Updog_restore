import express from 'express';
import type { Request, Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fundScopeState = vi.hoisted(() => ({
  enforceProvidedFundScope: vi.fn(async (_req: Request, _res: Response, _fundId: number) => true),
}));

const serviceState = vi.hoisted(() => ({
  getDashboardSummaryReadModel: vi.fn(async (): Promise<unknown> => null),
}));

vi.mock('../../../server/lib/auth/provided-fund-scope', () => ({
  enforceProvidedFundScope: fundScopeState.enforceProvidedFundScope,
}));

vi.mock('../../../server/services/dashboard-summary-read-service', () => ({
  getDashboardSummaryReadModel: serviceState.getDashboardSummaryReadModel,
}));

vi.mock('../../../server/storage', () => ({
  storage: {},
}));

vi.mock('../../../server/lib/logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import dashboardSummaryRouter from '../../../server/routes/dashboard-summary';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: '42',
      sub: '42',
      email: 'admin@example.com',
      role: 'admin',
      roles: ['admin'],
      fundIds: [1],
      ip: '127.0.0.1',
      userAgent: 'vitest',
    };
    next();
  });
  app.use(dashboardSummaryRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

function resetState() {
  fundScopeState.enforceProvidedFundScope.mockReset();
  fundScopeState.enforceProvidedFundScope.mockResolvedValue(true);
  serviceState.getDashboardSummaryReadModel.mockReset();
  serviceState.getDashboardSummaryReadModel.mockResolvedValue(null);
}

describe('dashboard-summary route contracts', () => {
  beforeEach(() => resetState());

  it('rejects invalid fundId before scope check and data read', async () => {
    const response = await request(makeApp()).get('/dashboard-summary/0');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'Invalid fund ID' });
    expect(fundScopeState.enforceProvidedFundScope).not.toHaveBeenCalled();
    expect(serviceState.getDashboardSummaryReadModel).not.toHaveBeenCalled();
  });

  it('rejects non-canonical fundId before scope check and data read', async () => {
    const response = await request(makeApp()).get('/dashboard-summary/01');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'Invalid fund ID' });
    expect(fundScopeState.enforceProvidedFundScope).not.toHaveBeenCalled();
    expect(serviceState.getDashboardSummaryReadModel).not.toHaveBeenCalled();
  });

  it('rejects denied fund scope before data read', async () => {
    fundScopeState.enforceProvidedFundScope.mockImplementationOnce(async (_req, res) => {
      res.status(403).json({
        error: 'Forbidden',
        code: 'FUND_ACCESS_DENIED',
        message: 'You do not have access to fund 2',
      });
      return false;
    });

    const response = await request(makeApp()).get('/dashboard-summary/2');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'Forbidden', code: 'FUND_ACCESS_DENIED' });
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2
    );
    expect(serviceState.getDashboardSummaryReadModel).not.toHaveBeenCalled();
  });

  it('enforces scope for the requested fund then returns the read model', async () => {
    serviceState.getDashboardSummaryReadModel.mockResolvedValueOnce({ fundId: 1, totalValue: 0 });

    const response = await request(makeApp()).get('/dashboard-summary/1');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ fundId: 1, totalValue: 0 });
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      1
    );
    expect(serviceState.getDashboardSummaryReadModel).toHaveBeenCalledTimes(1);
  });
});
