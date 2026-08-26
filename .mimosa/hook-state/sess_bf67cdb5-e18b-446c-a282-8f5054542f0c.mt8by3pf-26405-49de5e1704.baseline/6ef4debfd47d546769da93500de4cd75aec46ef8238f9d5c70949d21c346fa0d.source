import express from 'express';
import type { Request, Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fundScopeState = vi.hoisted(() => ({
  enforceProvidedFundScope: vi.fn(),
}));

vi.mock('../../../server/lib/auth/provided-fund-scope', () => ({
  enforceProvidedFundScope: fundScopeState.enforceProvidedFundScope,
}));

import cashflowRouter from '../../../server/routes/cashflow';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/cashflow', cashflowRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

type Method = 'get' | 'post' | 'put' | 'delete';

function call(method: Method, path: string, body?: unknown) {
  const agent = request(makeApp());
  switch (method) {
    case 'get':
      return agent.get(path);
    case 'post':
      return agent.post(path).send(body ?? {});
    case 'put':
      return agent.put(path).send(body ?? {});
    case 'delete':
      return agent.delete(path);
  }
}

const denyImpl = async (_req: Request, res: Response) => {
  res.status(403).json({ error: 'Forbidden', code: 'FUND_ACCESS_DENIED' });
  return false;
};

function resetState() {
  fundScopeState.enforceProvidedFundScope.mockReset();
  fundScopeState.enforceProvidedFundScope.mockResolvedValue(true);
}

const guardedEndpoints: Array<{ name: string; method: Method; path: string }> = [
  { name: 'GET /:fundId/transactions', method: 'get', path: '/api/cashflow/2/transactions' },
  { name: 'POST /:fundId/transactions', method: 'post', path: '/api/cashflow/2/transactions' },
  {
    name: 'PUT /:fundId/transactions/:transactionId',
    method: 'put',
    path: '/api/cashflow/2/transactions/tx-1',
  },
  {
    name: 'DELETE /:fundId/transactions/:transactionId',
    method: 'delete',
    path: '/api/cashflow/2/transactions/tx-1',
  },
  { name: 'GET /:fundId/capital-calls', method: 'get', path: '/api/cashflow/2/capital-calls' },
  { name: 'POST /:fundId/capital-calls', method: 'post', path: '/api/cashflow/2/capital-calls' },
  {
    name: 'GET /:fundId/liquidity-forecast',
    method: 'get',
    path: '/api/cashflow/2/liquidity-forecast',
  },
  { name: 'GET /:fundId/cash-position', method: 'get', path: '/api/cashflow/2/cash-position' },
  {
    name: 'GET /:fundId/recurring-expenses',
    method: 'get',
    path: '/api/cashflow/2/recurring-expenses',
  },
  {
    name: 'POST /:fundId/recurring-expenses',
    method: 'post',
    path: '/api/cashflow/2/recurring-expenses',
  },
];

describe('cashflow route fund-scope contracts', () => {
  beforeEach(() => resetState());

  describe.each(guardedEndpoints)('$name', ({ method, path }) => {
    it('denies an out-of-scope fund with 403 before any store access', async () => {
      fundScopeState.enforceProvidedFundScope.mockImplementationOnce(denyImpl);

      const response = await call(method, path);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ error: 'Forbidden', code: 'FUND_ACCESS_DENIED' });
      expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        2
      );
    });
  });

  it('allows an in-scope fund to read transactions (guard called with numeric fundId)', async () => {
    const response = await call('get', '/api/cashflow/7/transactions');

    expect(response.status).toBe(200);
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      7
    );
  });

  it('rejects a non-canonical fundId before scope or store access', async () => {
    const response = await call('get', '/api/cashflow/01/transactions');

    expect(response.status).toBe(400);
    expect(fundScopeState.enforceProvidedFundScope).not.toHaveBeenCalled();
  });

  it('does not persist a transaction when the fund scope is denied', async () => {
    fundScopeState.enforceProvidedFundScope.mockImplementationOnce(denyImpl);
    const denied = await call('post', '/api/cashflow/8/transactions', {
      type: 'capital_call',
      amount: 1000,
      plannedDate: '2026-01-01T00:00:00.000Z',
      status: 'planned',
    });
    expect(denied.status).toBe(403);

    const read = await call('get', '/api/cashflow/8/transactions');
    expect(read.status).toBe(200);
    expect(read.body.data.transactions).toHaveLength(0);
  });
});
