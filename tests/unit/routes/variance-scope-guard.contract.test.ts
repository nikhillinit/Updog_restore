import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import express from 'express';
import request from 'supertest';

const fundScopeState = vi.hoisted(() => ({
  enforceProvidedFundScope: vi.fn(async () => true),
  getVerifiedFundScope: vi.fn(),
}));

vi.mock('../../../server/lib/auth/provided-fund-scope', () => ({
  enforceProvidedFundScope: fundScopeState.enforceProvidedFundScope,
  getVerifiedFundScope: fundScopeState.getVerifiedFundScope,
}));

const serviceMock = vi.hoisted(() => ({
  baselines: {
    getBaselines: vi.fn(async () => []),
    createBaseline: vi.fn(async () => ({ id: '1' })),
  },
  calculations: {
    getVarianceReportById: vi.fn(async () => null),
    getVarianceReports: vi.fn(async () => []),
    createVarianceReport: vi.fn(async () => ({ id: '1' })),
  },
  alerts: {
    getActiveAlerts: vi.fn(async () => []),
    getAlerts: vi.fn(async () => []),
  },
  setDefaultBaselineAndCleanup: vi.fn(async () => ({})),
}));

vi.mock('../../../server/services/variance-tracking', () => ({
  varianceTrackingService: serviceMock,
}));

vi.mock('../../../server/services/variance-alert-automation', () => ({
  varianceAlertAutomationService: {
    getHealthStatus: vi.fn(async () => ({ ok: true })),
  },
}));

vi.mock('../../../server/lib/route-logger.js', () => ({
  createRouteLogger: () => vi.fn(),
}));

vi.mock('../../../server/middleware/idempotency', () => ({
  idempotency: (...args: unknown[]) => {
    if (typeof args[2] === 'function') {
      (args[2] as Function)();
      return;
    }
    return (_req: Request, _res: Response, next: Function) => next();
  },
}));

import varianceRouter from '../../../server/routes/variance';

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
  app.use(varianceRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

function denyOnce() {
  fundScopeState.enforceProvidedFundScope.mockImplementationOnce(
    async (_req: Request, res: Response) => {
      res.status(403).json({ error: 'Forbidden', code: 'FUND_ACCESS_DENIED' });
      return false;
    }
  );
}

describe('variance route scope guard contracts (A1+A2)', () => {
  beforeEach(() => {
    fundScopeState.enforceProvidedFundScope.mockReset();
    fundScopeState.enforceProvidedFundScope.mockResolvedValue(true);
    vi.clearAllMocks();
  });

  it('GET /variance-reports/:reportId denies cross-fund scope before reading', async () => {
    denyOnce();
    const res = await request(makeApp()).get('/api/funds/2/variance-reports/rpt-1');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'FUND_ACCESS_DENIED' });
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2
    );
    expect(serviceMock.calculations.getVarianceReportById).not.toHaveBeenCalled();
  });

  it('GET /alerts denies cross-fund scope before reading', async () => {
    denyOnce();
    const res = await request(makeApp()).get('/api/funds/2/alerts');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'FUND_ACCESS_DENIED' });
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2
    );
    expect(serviceMock.alerts.getAlerts).not.toHaveBeenCalled();
  });

  it('GET /variance-dashboard denies cross-fund scope before reading', async () => {
    denyOnce();
    const res = await request(makeApp()).get('/api/funds/2/variance-dashboard');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'FUND_ACCESS_DENIED' });
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2
    );
    expect(serviceMock.baselines.getBaselines).not.toHaveBeenCalled();
  });

  it('POST /baselines denies cross-fund scope with forWrite before creation', async () => {
    denyOnce();
    const res = await request(makeApp()).post('/api/funds/2/baselines').send({});
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2,
      { forWrite: true }
    );
    expect(serviceMock.baselines.createBaseline).not.toHaveBeenCalled();
  });

  it('POST /variance-reports denies cross-fund scope with forWrite before creation', async () => {
    denyOnce();
    const res = await request(makeApp()).post('/api/funds/2/variance-reports').send({});
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2,
      { forWrite: true }
    );
    expect(serviceMock.calculations.createVarianceReport).not.toHaveBeenCalled();
  });

  it('POST /baselines denies restricted principals before any write', async () => {
    const res = await request(makeApp('lp')).post('/api/funds/1/baselines').send({});
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceProvidedFundScope).not.toHaveBeenCalled();
    expect(serviceMock.baselines.createBaseline).not.toHaveBeenCalled();
  });

  it('POST /variance-reports denies restricted principals before any write', async () => {
    const res = await request(makeApp('lp')).post('/api/funds/1/variance-reports').send({});
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceProvidedFundScope).not.toHaveBeenCalled();
    expect(serviceMock.calculations.createVarianceReport).not.toHaveBeenCalled();
  });

  it('GET /variance-reports/:reportId enforces scope then reads for allowed fund', async () => {
    const res = await request(makeApp()).get('/api/funds/1/variance-reports/rpt-1');
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      1
    );
    expect(res.status).not.toBe(403);
  });
});
