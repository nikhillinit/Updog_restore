import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import express from 'express';
import request from 'supertest';

const fundScopeState = vi.hoisted(() => ({
  enforceProvidedFundScope: vi.fn(async (_req: Request, _res: Response, _fundId: number) => true),
}));

const dbState = vi.hoisted(() => ({
  query: vi.fn(async (): Promise<{ rows: unknown[] }> => ({ rows: [] })),
  transaction: vi.fn(async (): Promise<unknown> => ({})),
}));

vi.mock('../../../server/lib/auth/provided-fund-scope', () => ({
  enforceProvidedFundScope: fundScopeState.enforceProvidedFundScope,
}));

vi.mock('../../../server/db/index', () => ({
  query: dbState.query,
  transaction: dbState.transaction,
}));

vi.mock('../../../server/lib/route-logger.js', () => ({
  createRouteLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import reallocationRouter from '../../../server/routes/reallocation';

function makeApp(role = 'partner') {
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
  app.use(reallocationRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

function denyOnce() {
  fundScopeState.enforceProvidedFundScope.mockImplementationOnce(async (_req, res) => {
    res.status(403).json({ error: 'Forbidden', code: 'FUND_ACCESS_DENIED' });
    return false;
  });
}

describe('reallocation route contracts', () => {
  beforeEach(() => {
    fundScopeState.enforceProvidedFundScope.mockReset();
    fundScopeState.enforceProvidedFundScope.mockResolvedValue(true);
    dbState.query.mockReset();
    dbState.query.mockResolvedValue({ rows: [] });
    dbState.transaction.mockReset();
    dbState.transaction.mockResolvedValue({});
  });

  it('POST preview rejects non-canonical fundId before scope check and DB read', async () => {
    const res = await request(makeApp()).post('/api/funds/01/reallocation/preview').send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Invalid fund ID' });
    expect(fundScopeState.enforceProvidedFundScope).not.toHaveBeenCalled();
    expect(dbState.query).not.toHaveBeenCalled();
  });

  it('POST preview denies cross-fund scope before any DB read', async () => {
    denyOnce();
    const res = await request(makeApp()).post('/api/funds/2/reallocation/preview').send({});
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2
    );
    expect(dbState.query).not.toHaveBeenCalled();
  });

  it('POST commit denies cross-fund scope before the write transaction', async () => {
    denyOnce();
    const res = await request(makeApp()).post('/api/funds/2/reallocation/commit').send({});
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2,
      { forWrite: true }
    );
    expect(dbState.transaction).not.toHaveBeenCalled();
  });

  it('POST preview runs the guard for the requested fund before body validation', async () => {
    const res = await request(makeApp()).post('/api/funds/1/reallocation/preview').send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Invalid request body' });
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      1
    );
    expect(dbState.query).not.toHaveBeenCalled();
  });

  it('denies restricted principals before reallocation mutation', async () => {
    const response = await request(makeApp('lp'))
      .post('/api/funds/1/reallocation/commit')
      .send({
        current_version: 1,
        proposed_allocations: [{ company_id: 11, planned_reserves_cents: 1 }],
      });

    expect(response.status).toBe(403);
    expect(dbState.transaction).not.toHaveBeenCalled();
  });

  it.each(['partner', 'admin'])(
    'allows %s to commit reallocation with verified actor',
    async (role) => {
      dbState.transaction.mockResolvedValueOnce({
        new_version: 2,
        updated_count: 1,
        audit_id: 'audit-1',
      });

      const response = await request(makeApp(role))
        .post('/api/funds/1/reallocation/commit')
        .send({
          current_version: 1,
          proposed_allocations: [{ company_id: 11, planned_reserves_cents: 1 }],
          user_id: 999,
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ success: true, audit_id: 'audit-1' });
      expect(dbState.transaction).toHaveBeenCalledTimes(1);
    }
  );
});
