import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  user: null as null | { id: number | string; sub?: string; role: string; fundIds: number[] },
}));
const svc = vi.hoisted(() => ({ updateFundMoicInputs: vi.fn() }));

vi.mock('../../../server/services/fund-moic-input-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../server/services/fund-moic-input-service')>();
  return { ...actual, updateFundMoicInputs: svc.updateFundMoicInputs };
});

vi.mock('../../../server/lib/auth/jwt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/lib/auth/jwt')>();
  return {
    ...actual,
    requireAuth: () => (req: Request, res: Response, next: NextFunction) => {
      if (!authState.user) return res.sendStatus(401);
      (req as Request & { user: unknown }).user = { ...authState.user };
      next();
    },
  };
});

import fundMoicRouter from '../../../server/routes/fund-moic';
import {
  FundMoicInputIdempotencyConflictError,
  FundMoicInputInProgressError,
  FundMoicInputNotFoundError,
  FundMoicInputVersionConflictError,
} from '../../../server/services/fund-moic-input-service';

const validBody = { expectedVersion: 3, exitProbability: 0.8, exitMoicBps: 35000 };
const successResult = {
  response: {
    fundId: 1,
    companyId: 12,
    allocationVersion: 4,
    exitProbability: 0.8,
    exitMoicBps: 35000,
  },
  replayed: false,
};
const ADMIN = { id: 101, role: 'admin', fundIds: [1] };

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', fundMoicRouter);
  app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) =>
    res.status(500).json({ error: 'internal_error' })
  );
  return app;
}

function put(
  fundId: number | string,
  companyId: number | string,
  options: { key?: string; body?: unknown } = {}
) {
  const req = request(buildApp()).put(
    `/api/admin/funds/${fundId}/moic-inputs/portfolio-companies/${companyId}`
  );
  if (options.key !== undefined) req.set('Idempotency-Key', options.key);
  return req.send(options.body ?? validBody);
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = null;
  svc.updateFundMoicInputs.mockResolvedValue(successResult);
});

describe('fund MOIC admin input route - behavioral state machine', () => {
  it('401 when unauthenticated, with zero service work', async () => {
    authState.user = null;
    const res = await put(1, 12, { key: 'k-401' });

    expect(res.status).toBe(401);
    expect(svc.updateFundMoicInputs).not.toHaveBeenCalled();
  });

  it('400 on non-numeric fundId via requireFundAccess, with zero service work', async () => {
    authState.user = ADMIN;
    const res = await put('abc', 12, { key: 'k-fund' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Bad Request', message: 'Invalid fund ID' });
    expect(svc.updateFundMoicInputs).not.toHaveBeenCalled();
  });

  it('400 on invalid company id, with zero service work', async () => {
    authState.user = ADMIN;
    const res = await put(1, 'abc', { key: 'k-company' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'invalid_company_id',
      message: 'Company ID must be a positive integer',
    });
    expect(svc.updateFundMoicInputs).not.toHaveBeenCalled();
  });

  it('428 when Idempotency-Key header is missing, with zero service work', async () => {
    authState.user = ADMIN;
    const res = await put(1, 12);

    expect(res.status).toBe(428);
    expect(res.body).toEqual({
      error: 'idempotency_key_required',
      message: 'Idempotency-Key header is required',
    });
    expect(svc.updateFundMoicInputs).not.toHaveBeenCalled();
  });

  it('428 when Idempotency-Key is whitespace only, with zero service work', async () => {
    authState.user = ADMIN;
    const res = await put(1, 12, { key: '   ' });

    expect(res.status).toBe(428);
    expect(res.body).toEqual({
      error: 'idempotency_key_required',
      message: 'Idempotency-Key header is required',
    });
    expect(svc.updateFundMoicInputs).not.toHaveBeenCalled();
  });

  it('400 on invalid body, with zero service work', async () => {
    authState.user = ADMIN;
    const res = await put(1, 12, {
      key: 'k-invalid-body',
      body: { expectedVersion: 3, exitProbability: 1.5, exitMoicBps: 35000 },
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_moic_input_update' });
    expect(svc.updateFundMoicInputs).not.toHaveBeenCalled();
  });

  it('400 on unknown body field, with zero service work', async () => {
    authState.user = ADMIN;
    const res = await put(1, 12, {
      key: 'k-unknown-body',
      body: { ...validBody, surprise: true },
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_moic_input_update' });
    expect(svc.updateFundMoicInputs).not.toHaveBeenCalled();
  });

  it('403 for a non-admin who has fund access, with zero service work', async () => {
    authState.user = { id: 102, role: 'analyst', fundIds: [1] };
    const res = await put(1, 12, { key: 'k-role' });

    expect(res.status).toBe(403);
    expect(svc.updateFundMoicInputs).not.toHaveBeenCalled();
  });

  it('403 for an admin without fund access, with zero service work', async () => {
    authState.user = { id: 101, role: 'admin', fundIds: [999] };
    const res = await put(1, 12, { key: 'k-access' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden', message: 'You do not have access to fund 1' });
    expect(svc.updateFundMoicInputs).not.toHaveBeenCalled();
  });

  it('404 when the service reports a missing MOIC input row', async () => {
    authState.user = ADMIN;
    svc.updateFundMoicInputs.mockRejectedValue(new FundMoicInputNotFoundError(1, 12));
    const res = await put(1, 12, { key: 'k-404' });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'moic_input_not_found' });
  });

  it('409 when the service reports a stale expected version', async () => {
    authState.user = ADMIN;
    svc.updateFundMoicInputs.mockRejectedValue(new FundMoicInputVersionConflictError(3, 5));
    const res = await put(1, 12, { key: 'k-version' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      error: 'stale_expected_version',
      expectedVersion: 3,
      actualVersion: 5,
    });
  });

  it('409 when the service reports an idempotency conflict', async () => {
    authState.user = ADMIN;
    svc.updateFundMoicInputs.mockRejectedValue(new FundMoicInputIdempotencyConflictError('reused'));
    const res = await put(1, 12, { key: 'k-conflict' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'idempotency_conflict' });
  });

  it('409 when the service reports an in-progress idempotency request', async () => {
    authState.user = ADMIN;
    svc.updateFundMoicInputs.mockRejectedValue(new FundMoicInputInProgressError());
    const res = await put(1, 12, { key: 'k-progress' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'idempotency_request_in_progress' });
  });

  it('200 on successful update', async () => {
    authState.user = ADMIN;
    const res = await put(1, 12, { key: 'k-success' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      fundId: 1,
      companyId: 12,
      allocationVersion: 4,
      exitProbability: 0.8,
      exitMoicBps: 35000,
      replayed: false,
    });
  });

  it('200 propagates service replay status', async () => {
    authState.user = ADMIN;
    svc.updateFundMoicInputs.mockResolvedValue({ ...successResult, replayed: true });
    const res = await put(1, 12, { key: 'k-replay' });

    expect(res.status).toBe(200);
    expect(res.body.replayed).toBe(true);
  });

  it('passes trimmed idempotency key, body fields, fund, company, and actor to the service', async () => {
    authState.user = ADMIN;
    const res = await put(1, 12, { key: '  k-args  ' });

    expect(res.status).toBe(200);
    expect(svc.updateFundMoicInputs).toHaveBeenCalledTimes(1);
    expect(svc.updateFundMoicInputs).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: 1,
        companyId: 12,
        expectedVersion: 3,
        exitProbability: 0.8,
        exitMoicBps: 35000,
        idempotencyKey: 'k-args',
        actorId: 101,
      })
    );
  });

  it('normalizes string identity claims to numeric actorId', async () => {
    authState.user = { id: '101', sub: '101', role: 'admin', fundIds: [1] };
    const res = await put(1, 12, { key: 'k-actor' });

    expect(res.status).toBe(200);
    expect(svc.updateFundMoicInputs).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 101 })
    );
  });
});
