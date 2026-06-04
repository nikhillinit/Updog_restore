import express from 'express';
import type { Request, Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fundScopeState = vi.hoisted(() => ({
  enforceProvidedFundScope: vi.fn(),
  getVerifiedFundScope: vi.fn(),
}));

const storageState = vi.hoisted(() => ({
  getActivities: vi.fn(),
  createActivity: vi.fn(),
}));

vi.mock('../../../server/lib/auth/provided-fund-scope', () => ({
  enforceProvidedFundScope: fundScopeState.enforceProvidedFundScope,
  getVerifiedFundScope: fundScopeState.getVerifiedFundScope,
}));

vi.mock('../../../server/storage', () => ({
  storage: storageState,
}));

import activitiesRouter from '../../../server/routes/activities';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', activitiesRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

function activityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    fundId: 1,
    companyId: 1,
    type: 'investment',
    title: 'Activity',
    description: null,
    amount: null,
    activityDate: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function resetState() {
  fundScopeState.enforceProvidedFundScope.mockReset();
  fundScopeState.enforceProvidedFundScope.mockResolvedValue(true);
  fundScopeState.getVerifiedFundScope.mockReset();
  fundScopeState.getVerifiedFundScope.mockResolvedValue({ unrestricted: true, fundIds: [] });
  storageState.getActivities.mockReset();
  storageState.getActivities.mockResolvedValue([]);
  storageState.createActivity.mockReset();
}

describe('activities route contracts', () => {
  beforeEach(() => resetState());

  it('GET /api/activities denies an out-of-scope explicit fundId before any read', async () => {
    fundScopeState.enforceProvidedFundScope.mockImplementationOnce(
      async (_req: Request, res: Response) => {
        res.status(403).json({ error: 'Forbidden', code: 'FUND_ACCESS_DENIED' });
        return false;
      }
    );

    const response = await request(makeApp()).get('/api/activities?fundId=2');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'Forbidden', code: 'FUND_ACCESS_DENIED' });
    expect(storageState.getActivities).not.toHaveBeenCalled();
  });

  it('GET /api/activities reads only the in-scope explicit fundId', async () => {
    storageState.getActivities.mockResolvedValueOnce([activityRow({ fundId: 5 })]);

    const response = await request(makeApp()).get('/api/activities?fundId=5');

    expect(response.status).toBe(200);
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      5
    );
    expect(storageState.getActivities).toHaveBeenCalledWith(5);
  });

  it('GET /api/activities rejects an invalid fundId before scope or read', async () => {
    const response = await request(makeApp()).get('/api/activities?fundId=0');

    expect(response.status).toBe(400);
    expect(fundScopeState.enforceProvidedFundScope).not.toHaveBeenCalled();
    expect(storageState.getActivities).not.toHaveBeenCalled();
  });

  it("GET /api/activities without fundId reads only a restricted caller's funds", async () => {
    fundScopeState.getVerifiedFundScope.mockResolvedValueOnce({
      unrestricted: false,
      fundIds: [1, 3],
    });
    storageState.getActivities.mockResolvedValueOnce([activityRow({ fundId: 1 })]);

    const response = await request(makeApp()).get('/api/activities');

    expect(response.status).toBe(200);
    expect(storageState.getActivities).toHaveBeenCalledWith([1, 3]);
  });

  it('GET /api/activities without fundId reads all funds for an unrestricted admin', async () => {
    fundScopeState.getVerifiedFundScope.mockResolvedValueOnce({ unrestricted: true, fundIds: [] });
    storageState.getActivities.mockResolvedValueOnce([activityRow()]);

    const response = await request(makeApp()).get('/api/activities');

    expect(response.status).toBe(200);
    expect(storageState.getActivities).toHaveBeenCalledWith();
  });

  it('GET /api/activities without fundId returns 401 when scope cannot be verified', async () => {
    fundScopeState.getVerifiedFundScope.mockResolvedValueOnce(null);

    const response = await request(makeApp()).get('/api/activities');

    expect(response.status).toBe(401);
    expect(storageState.getActivities).not.toHaveBeenCalled();
  });
});
