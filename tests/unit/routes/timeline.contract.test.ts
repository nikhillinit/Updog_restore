import express from 'express';
import type { Request, Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fundScopeState = vi.hoisted(() => ({
  enforceProvidedFundScope: vi.fn(async (_req: Request, _res: Response, _fundId: number) => true),
}));

const dbState = vi.hoisted(() => ({
  findFirst: vi.fn(async (): Promise<unknown> => null),
}));

vi.mock('../../../server/lib/auth/provided-fund-scope', () => ({
  enforceProvidedFundScope: fundScopeState.enforceProvidedFundScope,
}));

vi.mock('../../../server/db', () => ({
  db: { query: { funds: { findFirst: dbState.findFirst } } },
}));

vi.mock('../../../server/metrics', () => ({
  recordBusinessMetric: vi.fn(),
}));

vi.mock('../../../server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../server/services/time-travel-analytics', () => ({
  TimeTravelAnalyticsService: class {},
}));

vi.mock('../../../server/middleware/validation', () => ({
  validateRequest: () => (_req: Request, _res: Response, next: () => void) => next(),
}));

vi.mock('../../../server/middleware/async', () => ({
  asyncHandler: (fn: unknown) => fn,
}));

import { createTimelineRouter } from '../../../server/routes/timeline';

function makeService() {
  return {
    getTimelineEvents: vi.fn(async () => ({ events: [] })),
    getStateAtTime: vi.fn(async () => ({ state: {} })),
    compareStates: vi.fn(async () => ({ diff: {} })),
    getLatestEvents: vi.fn(async () => ({ events: [] })),
  };
}

function makeApp(service: ReturnType<typeof makeService>) {
  const app = express();
  app.use(express.json());
  app.use('/api/timeline', createTimelineRouter(service as never));
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

function denyOnce() {
  fundScopeState.enforceProvidedFundScope.mockImplementationOnce(async (_req, res) => {
    res.status(403).json({ error: 'Forbidden', code: 'FUND_ACCESS_DENIED' });
    return false;
  });
}

const ISO1 = '2026-01-01T00:00:00.000Z';
const ISO2 = '2026-02-01T00:00:00.000Z';

describe('timeline route contracts', () => {
  let service: ReturnType<typeof makeService>;

  beforeEach(() => {
    fundScopeState.enforceProvidedFundScope.mockReset();
    fundScopeState.enforceProvidedFundScope.mockResolvedValue(true);
    dbState.findFirst.mockReset();
    dbState.findFirst.mockResolvedValue(null);
    service = makeService();
  });

  it('GET /:fundId denies cross-fund scope before reading events', async () => {
    denyOnce();
    const res = await request(makeApp(service)).get('/api/timeline/2');
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2
    );
    expect(service.getTimelineEvents).not.toHaveBeenCalled();
  });

  it('GET /:fundId/state denies cross-fund scope before reading state', async () => {
    denyOnce();
    const res = await request(makeApp(service)).get(`/api/timeline/2/state?timestamp=${ISO1}`);
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2
    );
    expect(service.getStateAtTime).not.toHaveBeenCalled();
  });

  it('POST /:fundId/snapshot denies cross-fund scope before fund existence read', async () => {
    denyOnce();
    const res = await request(makeApp(service)).post('/api/timeline/2/snapshot').send({});
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2
    );
    expect(dbState.findFirst).not.toHaveBeenCalled();
  });

  it('GET /:fundId/compare denies cross-fund scope before comparing states', async () => {
    denyOnce();
    const res = await request(makeApp(service)).get(
      `/api/timeline/2/compare?timestamp1=${ISO1}&timestamp2=${ISO2}`
    );
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2
    );
    expect(service.compareStates).not.toHaveBeenCalled();
  });

  it('GET /:fundId enforces scope for the requested fund then returns events', async () => {
    const res = await request(makeApp(service)).get('/api/timeline/1');
    expect(res.status).toBe(200);
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      1
    );
    expect(service.getTimelineEvents).toHaveBeenCalledTimes(1);
  });
});
