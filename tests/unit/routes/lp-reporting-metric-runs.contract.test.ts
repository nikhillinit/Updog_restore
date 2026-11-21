/*
 * Real-guard contract: requireAuth is mocked to inject req.user; requireWriteRole and
 * requireFundAccess are real guards. Exact 403 assertions prove denial happens before
 * request parsing or durable work.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  role: 'partner',
  fundIds: [1] as number[],
  lpId: undefined as number | undefined,
}));

const dbState = vi.hoisted(() => {
  const calls = { select: 0, insert: 0, update: 0, delete: 0 };

  function chain() {
    const p = new Proxy(function chainTarget() {}, {
      get(_target, prop: string | symbol) {
        if (prop === 'then') {
          return (resolve: (value: unknown[]) => void) => resolve([]);
        }
        return () => p;
      },
      apply() {
        return p;
      },
    });
    return p;
  }

  const db = {
    select: (..._args: unknown[]) => {
      calls.select += 1;
      return chain();
    },
    insert: (..._args: unknown[]) => {
      calls.insert += 1;
      return chain();
    },
    update: (..._args: unknown[]) => {
      calls.update += 1;
      return chain();
    },
    delete: (..._args: unknown[]) => {
      calls.delete += 1;
      return chain();
    },
  };

  return { db, calls };
});

vi.mock('../../../server/lib/auth/jwt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/lib/auth/jwt')>();
  return {
    ...actual,
    requireAuth: () => (req: Request, _res: Response, next: NextFunction) => {
      req.user = {
        id: 'u1',
        sub: 'u1',
        email: 'u@example.com',
        role: authState.role,
        roles: [authState.role],
        ip: '127.0.0.1',
        userAgent: 'vitest',
        fundIds: [...authState.fundIds],
        ...(authState.lpId !== undefined && { lpId: authState.lpId }),
      };
      next();
    },
  };
});

vi.mock('express-rate-limit', () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../../server/db', () => ({ db: dbState.db }));

import metricRunsRouter from '../../../server/routes/lp-reporting/metric-runs';

function makeApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(metricRunsRouter);
  return app;
}

function resetDbCalls() {
  dbState.calls.select = 0;
  dbState.calls.insert = 0;
  dbState.calls.update = 0;
  dbState.calls.delete = 0;
}

type DeniedEndpoint =
  | { method: 'POST'; path: string; body: Record<string, never> }
  | { method: 'GET'; path: string }
  | { method: 'PATCH'; path: string; body: Record<string, never> };

async function requestEndpoint(endpoint: DeniedEndpoint) {
  const app = makeApp();

  if (endpoint.method === 'GET') {
    return request(app).get(endpoint.path);
  }
  if (endpoint.method === 'POST') {
    return request(app).post(endpoint.path).send(endpoint.body);
  }
  return request(app).patch(endpoint.path).send(endpoint.body);
}

describe('lp-reporting metric-runs fund-scope guard contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbCalls();
    authState.role = 'partner';
    authState.fundIds = [1];
    authState.lpId = undefined;
  });

  it.each<DeniedEndpoint>([
    { method: 'POST', path: '/api/funds/1/metric-runs/commit', body: {} },
    {
      method: 'POST',
      path: '/api/funds/1/metric-runs/123/report-package/exports/json',
      body: {},
    },
    {
      method: 'POST',
      path: '/api/funds/1/metric-runs/123/report-package/exports/csv',
      body: {},
    },
    { method: 'POST', path: '/api/funds/1/metric-runs/123/report-package', body: {} },
    { method: 'POST', path: '/api/funds/1/metric-runs/123/evidence-records', body: {} },
    { method: 'POST', path: '/api/funds/1/metric-runs/123/narrative-runs', body: {} },
    {
      method: 'PATCH',
      path: '/api/funds/1/metric-runs/123/narrative-runs/456',
      body: {},
    },
    {
      method: 'POST',
      path: '/api/funds/1/metric-runs/123/narrative-runs/456/review',
      body: {},
    },
    {
      method: 'POST',
      path: '/api/funds/1/metric-runs/123/narrative-runs/456/approve',
      body: {},
    },
  ])('denies LP-linked partner token write $method $path before db work', async (endpoint) => {
    authState.role = 'partner';
    authState.fundIds = [1];
    authState.lpId = 7;

    const res = await requestEndpoint(endpoint);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: 'Forbidden',
      code: 'TEAM_WRITE_REQUIRED',
      message: 'A team write role is required for this operation',
    });
    expect(dbState.calls.select).toBe(0);
    expect(dbState.calls.insert).toBe(0);
    expect(dbState.calls.update).toBe(0);
    expect(dbState.calls.delete).toBe(0);
  });

  it.each<DeniedEndpoint>([
    {
      method: 'POST',
      path: '/api/funds/1/metric-runs/123/report-package/exports/json',
      body: {},
    },
    {
      method: 'POST',
      path: '/api/funds/1/metric-runs/123/report-package/exports/csv',
      body: {},
    },
    {
      method: 'POST',
      path: '/api/funds/1/metric-runs/123/narrative-runs/456/review',
      body: {},
    },
    {
      method: 'POST',
      path: '/api/funds/1/metric-runs/123/narrative-runs/456/approve',
      body: {},
    },
  ])('denies analyst partner-only write $method $path before db work', async (endpoint) => {
    authState.role = 'analyst';

    const res = await requestEndpoint(endpoint);

    expect(res.status).toBe(403);
    expect(res.body).toEqual(
      expect.objectContaining({
        code: 'WRITE_ROLE_REQUIRED',
      })
    );
    expect(dbState.calls.select).toBe(0);
    expect(dbState.calls.insert).toBe(0);
    expect(dbState.calls.update).toBe(0);
    expect(dbState.calls.delete).toBe(0);
  });

  it.each<DeniedEndpoint>([
    { method: 'POST', path: '/api/funds/1/metric-runs/commit', body: {} },
    { method: 'POST', path: '/api/funds/1/metric-runs/123/report-package', body: {} },
    { method: 'POST', path: '/api/funds/1/metric-runs/123/evidence-records', body: {} },
    { method: 'POST', path: '/api/funds/1/metric-runs/123/narrative-runs', body: {} },
    {
      method: 'PATCH',
      path: '/api/funds/1/metric-runs/123/narrative-runs/456',
      body: {},
    },
  ])('allows analyst routine write through role boundary $method $path', async (endpoint) => {
    authState.role = 'analyst';

    const res = await requestEndpoint(endpoint);

    expect(res.status).not.toBe(403);
    expect(dbState.calls.select).toBe(0);
    expect(dbState.calls.insert).toBe(0);
    expect(dbState.calls.update).toBe(0);
    expect(dbState.calls.delete).toBe(0);
  });

  // Writes stay fund-scoped: a cross-fund mutation is denied before any db work.
  it.each<DeniedEndpoint>([
    { method: 'POST', path: '/api/funds/2/metric-runs/commit', body: {} },
    {
      method: 'PATCH',
      path: '/api/funds/2/metric-runs/123/narrative-runs/456',
      body: {},
    },
  ])('denies cross-fund write $method $path before db work', async (endpoint) => {
    const res = await requestEndpoint(endpoint);

    expect(res.status).toBe(403);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: 'Forbidden',
        code: 'FUND_ACCESS_DENIED',
        message: 'You do not have access to fund 2',
      })
    );
    expect(dbState.calls.select).toBe(0);
    expect(dbState.calls.insert).toBe(0);
    expect(dbState.calls.update).toBe(0);
    expect(dbState.calls.delete).toBe(0);
  });

  // Universal read: a team member may read another fund's metric-runs (safe methods).
  it.each<DeniedEndpoint>([
    { method: 'GET', path: '/api/funds/2/metric-runs/123' },
    { method: 'GET', path: '/api/funds/2/metric-runs/123/evidence-records' },
  ])('allows a team member cross-fund read $method $path', async (endpoint) => {
    const res = await requestEndpoint(endpoint);

    expect(res.status).not.toBe(403);
  });

  it('allows same-fund metric-run requests past the guard', async () => {
    const res = await request(makeApp()).get('/api/funds/1/metric-runs/latest');

    expect(res.status).not.toBe(403);
  });

  it.each<DeniedEndpoint>([
    { method: 'POST', path: '/api/funds/2/metric-runs/123/report-package/exports/json', body: {} },
    { method: 'POST', path: '/api/funds/2/metric-runs/123/report-package/exports/csv', body: {} },
  ])('denies cross-fund report-package write $method $path before db work', async (endpoint) => {
    const res = await requestEndpoint(endpoint);

    expect(res.status).toBe(403);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: 'Forbidden',
        code: 'FUND_ACCESS_DENIED',
        message: 'You do not have access to fund 2',
      })
    );
    expect(dbState.calls.insert).toBe(0);
  });

  it.each<DeniedEndpoint>([
    { method: 'GET', path: '/api/funds/2/metric-runs/123/report-package/render-model' },
    { method: 'GET', path: '/api/funds/2/metric-runs/123/report-package/export/json' },
    { method: 'GET', path: '/api/funds/2/metric-runs/123/report-package/exports/json' },
    { method: 'GET', path: '/api/funds/2/metric-runs/123/report-package/exports/json/artifact' },
    { method: 'GET', path: '/api/funds/2/metric-runs/123/report-package/exports/csv' },
    { method: 'GET', path: '/api/funds/2/metric-runs/123/report-package/exports/csv/artifact' },
  ])('allows team-member cross-fund report-package read $method $path', async (endpoint) => {
    const res = await requestEndpoint(endpoint);

    expect(res.status).not.toBe(403);
  });
});
