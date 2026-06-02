import express from 'express';
import type { Request, Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fundScopeState = vi.hoisted(() => ({
  enforceCompanyFundScope: vi.fn(async (_req: Request, _res: Response, _companyId: number) => true),
}));

// Chain-safe db stub: every builder method is a spy; terminal awaits resolve to
// empty/benign values so a neutered guard (negative control) falls through to a
// harmless 404 instead of throwing mid-chain before the assertion runs.
const dbState = vi.hoisted(() => {
  const selectChain: Record<string, unknown> = {};
  selectChain['from'] = vi.fn(() => selectChain);
  selectChain['where'] = vi.fn(() => selectChain);
  selectChain['limit'] = vi.fn(async () => [] as unknown[]);

  const insertChain: Record<string, unknown> = {};
  insertChain['values'] = vi.fn(() => insertChain);
  insertChain['returning'] = vi.fn(async () => [{ id: '00000000-0000-0000-0000-000000000999' }]);

  const deleteChain: Record<string, unknown> = {};
  deleteChain['where'] = vi.fn(async () => undefined);

  const select = vi.fn(() => selectChain);
  const insert = vi.fn(() => insertChain);
  const remove = vi.fn(() => deleteChain);
  const transaction = vi.fn(async () => undefined);
  const findFirst = vi.fn(async () => undefined);
  return { select, insert, remove, transaction, findFirst };
});

vi.mock('../../../server/lib/auth/company-fund-scope', () => ({
  enforceCompanyFundScope: fundScopeState.enforceCompanyFundScope,
}));

vi.mock('../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (_req: Request, _res: Response, next: () => void) => next(),
}));

vi.mock('../../../server/db', () => ({
  db: {
    select: dbState.select,
    insert: dbState.insert,
    delete: dbState.remove,
    transaction: dbState.transaction,
    query: { scenarios: { findFirst: dbState.findFirst } },
  },
}));

import scenarioAnalysisRouter from '../../../server/routes/scenario-analysis';

const SCENARIO_ID = '00000000-0000-0000-0000-000000000101';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', scenarioAnalysisRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

function denyOnce() {
  fundScopeState.enforceCompanyFundScope.mockImplementationOnce(
    async (_req: Request, res: Response) => {
      res.status(403).json({ error: 'Forbidden', code: 'FUND_ACCESS_DENIED' });
      return false;
    }
  );
}

function resetState() {
  fundScopeState.enforceCompanyFundScope.mockReset();
  fundScopeState.enforceCompanyFundScope.mockResolvedValue(true);
  dbState.select.mockClear();
  dbState.insert.mockClear();
  dbState.remove.mockClear();
  dbState.transaction.mockClear();
  dbState.findFirst.mockClear();
}

describe('scenario-analysis route fund-scope contracts', () => {
  beforeEach(() => resetState());

  it('denies a cross-fund scenario read before any db read', async () => {
    denyOnce();
    const res = await request(makeApp()).get(`/api/companies/7/scenarios/${SCENARIO_ID}`);
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceCompanyFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      7
    );
    expect(dbState.select).not.toHaveBeenCalled();
  });

  it('denies a cross-fund scenario create before the write', async () => {
    denyOnce();
    const res = await request(makeApp()).post('/api/companies/7/scenarios').send({ name: 'probe' });
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceCompanyFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      7
    );
    expect(dbState.insert).not.toHaveBeenCalled();
  });

  it('denies a cross-fund scenario update before the read or write', async () => {
    denyOnce();
    const res = await request(makeApp())
      .patch(`/api/companies/7/scenarios/${SCENARIO_ID}`)
      .send({ scenario_id: SCENARIO_ID, cases: [] });
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceCompanyFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      7
    );
    expect(dbState.select).not.toHaveBeenCalled();
    expect(dbState.transaction).not.toHaveBeenCalled();
  });

  it('denies a cross-fund scenario delete before the read or write', async () => {
    denyOnce();
    const res = await request(makeApp()).delete(`/api/companies/7/scenarios/${SCENARIO_ID}`);
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceCompanyFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      7
    );
    expect(dbState.select).not.toHaveBeenCalled();
    expect(dbState.remove).not.toHaveBeenCalled();
  });

  it('denies a cross-fund reserves optimize before the read', async () => {
    denyOnce();
    const res = await request(makeApp())
      .post('/api/companies/7/reserves/optimize')
      .send({ scenario_id: SCENARIO_ID });
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceCompanyFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      7
    );
    expect(dbState.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a non-canonical companyId before the scope check and any read', async () => {
    const res = await request(makeApp()).get(`/api/companies/0/scenarios/${SCENARIO_ID}`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Invalid company ID' });
    expect(fundScopeState.enforceCompanyFundScope).not.toHaveBeenCalled();
    expect(dbState.select).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric companyId on create before the scope check and any write', async () => {
    const res = await request(makeApp())
      .post('/api/companies/abc/scenarios')
      .send({ name: 'probe' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Invalid company ID' });
    expect(fundScopeState.enforceCompanyFundScope).not.toHaveBeenCalled();
    expect(dbState.insert).not.toHaveBeenCalled();
  });
});
