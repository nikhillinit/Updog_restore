import express, { type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Route-layer H9 invalidation wiring for the investment-create handler (no
// dedicated service function: it calls storage.createInvestment inline). The
// handler must bust H9 artifacts after a successful create. Storage + fund
// scope are mocked; mirrors tests/unit/routes/cash-flow-events.contract.test.ts.

const { invalidateH9Artifacts } = vi.hoisted(() => ({
  invalidateH9Artifacts: vi.fn(async () => undefined),
}));
const fundScope = vi.hoisted(() => ({
  enforceProvidedFundScope: vi.fn(async (_req: Request, _res: Response, _fundId: number) => true),
}));
const storageMock = vi.hoisted(() => ({ createInvestment: vi.fn() }));

vi.mock('../../../server/services/h9-artifact-invalidation-service', () => ({
  invalidateH9Artifacts,
}));

vi.mock('../../../server/lib/auth/provided-fund-scope', () => ({
  enforceProvidedFundScope: fundScope.enforceProvidedFundScope,
}));

vi.mock('../../../server/storage', () => ({
  storage: { createInvestment: storageMock.createInvestment },
  UnsupportedStorageOperationError: class UnsupportedStorageOperationError extends Error {
    code = 'unsupported_storage_operation';
  },
}));

// Override only insertInvestmentSchema so the JSON body validates (the real
// drizzle-zod schema maps investmentDate to z.date(), which cannot be carried
// over JSON). All other @shared/schema exports stay real; this isolates the
// route's invalidation wiring as the unit under test.
vi.mock('@shared/schema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/schema')>();
  const { z } = await import('zod');
  return { ...actual, insertInvestmentSchema: z.object({ fundId: z.number() }) };
});

import investmentsRouter from '../../../server/routes/investments';

const FUND_ID = 7;

function body() {
  return {
    fundId: FUND_ID,
    investmentDate: '2026-06-01T00:00:00.000Z',
    amount: '1000000',
    round: 'Series A',
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(investmentsRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  fundScope.enforceProvidedFundScope.mockResolvedValue(true);
  storageMock.createInvestment.mockResolvedValue({ id: 1, ...body() });
});

describe('investment create route -> H9 invalidation wiring', () => {
  it('invalidates H9 artifacts after a successful investment create', async () => {
    const res = await request(buildApp()).post('/investments').send(body());

    expect(res.status).toBe(201);
    expect(invalidateH9Artifacts).toHaveBeenCalledWith(FUND_ID);
  });
});
