import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import express from 'express';
import request from 'supertest';

const fundScopeState = vi.hoisted(() => ({
  enforceProvidedFundScope: vi.fn(async (_req: Request, _res: Response, _fundId: number) => true),
}));

const serviceState = vi.hoisted(() => ({
  createPending: vi.fn(),
  markCompleted: vi.fn(),
  markFailed: vi.fn(),
  getHistoryByFund: vi.fn(async (): Promise<unknown[]> => []),
  getById: vi.fn(async (): Promise<unknown> => null),
}));

vi.mock('../../../server/lib/auth/provided-fund-scope', () => ({
  enforceProvidedFundScope: fundScopeState.enforceProvidedFundScope,
}));

vi.mock('../../../server/services/sensitivity-run-service', () => ({
  sensitivityRunService: {
    createPending: serviceState.createPending,
    markCompleted: serviceState.markCompleted,
    markFailed: serviceState.markFailed,
    getHistoryByFund: serviceState.getHistoryByFund,
    getById: serviceState.getById,
  },
}));

import sensitivityRouter from '../../../server/routes/sensitivity';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: '42',
      sub: '42',
      email: 'admin@example.com',
      role: 'admin',
      roles: ['admin'],
      fundIds: [1],
      ip: '127.0.0.1',
      userAgent: 'vitest',
    };
    next();
  });
  app.use(sensitivityRouter);
  return app;
}

describe('sensitivity cursor validation (A5)', () => {
  beforeEach(() => {
    fundScopeState.enforceProvidedFundScope.mockReset();
    fundScopeState.enforceProvidedFundScope.mockResolvedValue(true);
    serviceState.getHistoryByFund.mockReset();
    serviceState.getHistoryByFund.mockResolvedValue([]);
  });

  it('rejects cursorCreatedAt without cursorId', async () => {
    const res = await request(makeApp()).get(
      '/funds/1/sensitivity/runs?cursorCreatedAt=2026-01-01T00:00:00Z'
    );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'INVALID_CURSOR',
      message: expect.stringContaining('both be provided'),
    });
    expect(serviceState.getHistoryByFund).not.toHaveBeenCalled();
  });

  it('rejects cursorId without cursorCreatedAt', async () => {
    const res = await request(makeApp()).get('/funds/1/sensitivity/runs?cursorId=10');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'INVALID_CURSOR' });
    expect(serviceState.getHistoryByFund).not.toHaveBeenCalled();
  });

  it('rejects a non-ISO cursorCreatedAt', async () => {
    const res = await request(makeApp()).get(
      '/funds/1/sensitivity/runs?cursorCreatedAt=not-a-date&cursorId=5'
    );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'INVALID_CURSOR',
      message: expect.stringContaining('ISO 8601'),
    });
  });

  it('rejects cursorCreatedAt that parses but is not ISO-prefixed', async () => {
    const res = await request(makeApp()).get(
      '/funds/1/sensitivity/runs?cursorCreatedAt=Jan 1, 2026&cursorId=5'
    );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'INVALID_CURSOR' });
  });

  it('rejects cursorId=0', async () => {
    const res = await request(makeApp()).get(
      '/funds/1/sensitivity/runs?cursorCreatedAt=2026-01-01T00:00:00Z&cursorId=0'
    );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'INVALID_CURSOR',
      message: expect.stringContaining('positive integer'),
    });
  });

  it('rejects cursorId with trailing non-digits (e.g. 1x)', async () => {
    const res = await request(makeApp()).get(
      '/funds/1/sensitivity/runs?cursorCreatedAt=2026-01-01T00:00:00Z&cursorId=1x'
    );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'INVALID_CURSOR' });
  });

  it('rejects negative cursorId', async () => {
    const res = await request(makeApp()).get(
      '/funds/1/sensitivity/runs?cursorCreatedAt=2026-01-01T00:00:00Z&cursorId=-5'
    );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'INVALID_CURSOR' });
  });

  it('rejects cursorId beyond Number.MAX_SAFE_INTEGER', async () => {
    const res = await request(makeApp()).get(
      `/funds/1/sensitivity/runs?cursorCreatedAt=2026-01-01T00:00:00Z&cursorId=${Number.MAX_SAFE_INTEGER + 10}`
    );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'INVALID_CURSOR' });
  });

  it('rejects date-only cursorCreatedAt (no time component)', async () => {
    const res = await request(makeApp()).get(
      '/funds/1/sensitivity/runs?cursorCreatedAt=2026-01-15&cursorId=5'
    );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'INVALID_CURSOR' });
  });

  it('rejects cursorCreatedAt that auto-normalizes to a different instant', async () => {
    const res = await request(makeApp()).get(
      '/funds/1/sensitivity/runs?cursorCreatedAt=2026-02-30T00:00:00.000Z&cursorId=5'
    );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'INVALID_CURSOR' });
  });

  it('rejects space-separated timestamp', async () => {
    const res = await request(makeApp()).get(
      '/funds/1/sensitivity/runs?cursorCreatedAt=2026-01-15 12:00:00&cursorId=5'
    );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'INVALID_CURSOR' });
  });

  it('accepts valid cursor pair and passes to service', async () => {
    const res = await request(makeApp()).get(
      '/funds/1/sensitivity/runs?cursorCreatedAt=2026-01-01T00:00:00Z&cursorId=42'
    );
    expect(res.status).toBe(200);
    expect(serviceState.getHistoryByFund).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        cursor: { createdAt: '2026-01-01T00:00:00Z', id: 42 },
      })
    );
  });

  it('omits cursor when neither param is present', async () => {
    const res = await request(makeApp()).get('/funds/1/sensitivity/runs');
    expect(res.status).toBe(200);
    expect(serviceState.getHistoryByFund).toHaveBeenCalledWith(
      1,
      expect.not.objectContaining({ cursor: expect.anything() })
    );
  });
});
