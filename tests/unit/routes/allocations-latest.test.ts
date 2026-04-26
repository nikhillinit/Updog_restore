import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbMock, loggerWarnMock } = vi.hoisted(() => ({
  dbMock: {
    select: vi.fn(),
  },
  loggerWarnMock: vi.fn(),
}));

vi.mock('../../../server/db', () => ({
  db: dbMock,
}));

vi.mock('../../../server/db/pg-circuit', () => ({
  transaction: vi.fn(),
}));

vi.mock('../../../server/lib/logger.js', () => ({
  logger: {
    warn: loggerWarnMock,
    info: vi.fn(),
  },
}));

import allocationsRouter from '../../../server/routes/allocations';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', allocationsRouter);
  return app;
}

function queryChain<T>(result: Promise<T>) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnValue(result),
    limit: vi.fn().mockReturnValue(result),
  };
}

function failingLimitChain(error: Error) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockRejectedValue(error),
    limit: vi.fn().mockRejectedValue(error),
  };
}

describe('latest allocations route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns safe JSON instead of leaking database credential failures', async () => {
    dbMock.select.mockReturnValueOnce(
      failingLimitChain(new Error('password authentication failed for user "mock"'))
    );

    const res = await request(makeApp()).get('/api/funds/1/allocations/latest');

    expect(res.status).toBe(503);
    expect(res.type).toMatch(/json/);
    expect(res.body).toMatchObject({
      error: 'allocation_data_unavailable',
    });
    expect(JSON.stringify(res.body)).not.toContain('mock');
    expect(JSON.stringify(res.body)).not.toContain('password authentication failed');
  });

  it('serves latest allocation state through the schema-backed read path', async () => {
    dbMock.select.mockReturnValueOnce(queryChain(Promise.resolve([{ id: 1 }]))).mockReturnValueOnce(
      queryChain(
        Promise.resolve([
          {
            company_id: 10,
            company_name: 'TechCorp',
            sector: 'AI',
            stage: 'Series A',
            status: 'active',
            invested_amount: '1250000.00',
            planned_reserves_cents: 200_000_000,
            deployed_reserves_cents: 50_000_000,
            allocation_cap_cents: null,
            allocation_reason: 'Follow-on reserve',
            allocation_version: 3,
            last_allocation_at: new Date('2026-04-01T00:00:00.000Z'),
          },
        ])
      )
    );

    const res = await request(makeApp()).get('/api/funds/1/allocations/latest');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fund_id: 1,
      companies: [
        {
          company_id: 10,
          company_name: 'TechCorp',
          invested_amount_cents: 125_000_000,
          planned_reserves_cents: 200_000_000,
          deployed_reserves_cents: 50_000_000,
          allocation_version: 3,
        },
      ],
      metadata: {
        total_planned_cents: 200_000_000,
        total_deployed_cents: 50_000_000,
        companies_count: 1,
        last_updated_at: '2026-04-01T00:00:00.000Z',
      },
    });
  });
});
