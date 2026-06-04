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

function makeApp() {
  const app = express();
  app.use(express.json());
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
      2
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
});
