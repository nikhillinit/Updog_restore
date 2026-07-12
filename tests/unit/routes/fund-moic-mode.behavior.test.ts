import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  user: null as null | { id: number | string; sub?: string; role: string; fundIds: number[] },
}));
const svc = vi.hoisted(() => ({ updateFundMoicCalculationMode: vi.fn() }));

vi.mock('../../../server/services/fund-calculation-mode-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../server/services/fund-calculation-mode-service')>();
  return { ...actual, updateFundMoicCalculationMode: svc.updateFundMoicCalculationMode };
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
  FundCalculationModeBlockedError,
  FundCalculationModeIdempotencyConflictError,
  FundCalculationModeInProgressError,
  FundCalculationModeVersionConflictError,
} from '../../../server/services/fund-calculation-mode-service';

const preview = {
  calculationKey: 'fund_moic_rankings_exit_probability',
  configuredMode: 'shadow',
  effectiveMode: 'shadow',
  killSwitchActive: false,
  shadowStartedAt: '2026-06-24T00:00:00.000Z',
  eligibleAt: '2026-07-01T00:00:00.000Z',
  residencyDaysRequired: 7,
  residencyStatus: 'pending',
  currentSourceMatchesAccepted: true,
  unreconciledEditsPresent: false,
  blockers: [],
  version: 1,
};
const successResult = { response: preview, replayed: false };
const validBody = { expectedVersion: 0, configuredMode: 'shadow', acceptedReconciliationRunId: 55 };
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

function put(fundId: number | string, options: { key?: string; body?: unknown } = {}) {
  const req = request(buildApp()).put(
    `/api/admin/funds/${fundId}/calculation-modes/fund-moic-rankings`
  );
  if (options.key !== undefined) req.set('Idempotency-Key', options.key);
  return req.send(options.body ?? validBody);
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = null;
  svc.updateFundMoicCalculationMode.mockResolvedValue(successResult);
});

describe('fund MOIC calculation mode route - behavioral state machine', () => {
  it('401 when unauthenticated, with zero service work', async () => {
    authState.user = null;
    const res = await put(1, { key: 'm-401' });

    expect(res.status).toBe(401);
    expect(svc.updateFundMoicCalculationMode).not.toHaveBeenCalled();
  });

  it('400 on non-numeric fundId via requireFundAccess, with zero service work', async () => {
    authState.user = ADMIN;
    const res = await put('abc', { key: 'm-fund' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Bad Request', message: 'Invalid fund ID' });
    expect(svc.updateFundMoicCalculationMode).not.toHaveBeenCalled();
  });

  it('428 when Idempotency-Key header is missing, with zero service work', async () => {
    authState.user = ADMIN;
    const res = await put(1);

    expect(res.status).toBe(428);
    expect(res.body).toEqual({
      error: 'idempotency_key_required',
      message: 'Idempotency-Key header is required',
    });
    expect(svc.updateFundMoicCalculationMode).not.toHaveBeenCalled();
  });

  it('428 when Idempotency-Key is whitespace only, with zero service work', async () => {
    authState.user = ADMIN;
    const res = await put(1, { key: '   ' });

    expect(res.status).toBe(428);
    expect(res.body).toEqual({
      error: 'idempotency_key_required',
      message: 'Idempotency-Key header is required',
    });
    expect(svc.updateFundMoicCalculationMode).not.toHaveBeenCalled();
  });

  it('400 on invalid configuredMode enum, with zero service work', async () => {
    authState.user = ADMIN;
    const res = await put(1, {
      key: 'm-invalid-enum',
      body: { expectedVersion: 0, configuredMode: 'maybe' },
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_mode_update' });
    expect(svc.updateFundMoicCalculationMode).not.toHaveBeenCalled();
  });

  it('400 on unknown body field, with zero service work', async () => {
    authState.user = ADMIN;
    const res = await put(1, {
      key: 'm-unknown-body',
      body: { ...validBody, surprise: true },
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_mode_update' });
    expect(svc.updateFundMoicCalculationMode).not.toHaveBeenCalled();
  });

  it('400 on negative expectedVersion, with zero service work', async () => {
    authState.user = ADMIN;
    const res = await put(1, {
      key: 'm-negative-version',
      body: { expectedVersion: -1, configuredMode: 'off' },
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_mode_update' });
    expect(svc.updateFundMoicCalculationMode).not.toHaveBeenCalled();
  });

  it('403 for a non-admin who has fund access, with zero service work', async () => {
    authState.user = { id: 102, role: 'analyst', fundIds: [1] };
    const res = await put(1, { key: 'm-role' });

    expect(res.status).toBe(403);
    expect(svc.updateFundMoicCalculationMode).not.toHaveBeenCalled();
  });

  it('403 for a non-admin without fund access, with zero service work', async () => {
    authState.user = { id: 103, role: 'analyst', fundIds: [999] };
    const res = await put(1, { key: 'm-access' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden', message: 'You do not have access to fund 1' });
    expect(svc.updateFundMoicCalculationMode).not.toHaveBeenCalled();
  });

  it('409 when the service reports a stale expected version', async () => {
    authState.user = ADMIN;
    svc.updateFundMoicCalculationMode.mockRejectedValue(
      new FundCalculationModeVersionConflictError(1, 2)
    );
    const res = await put(1, { key: 'm-version' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      error: 'stale_expected_version',
      expectedVersion: 1,
      actualVersion: 2,
    });
  });

  it('409 when the service reports blocked activation', async () => {
    authState.user = ADMIN;
    svc.updateFundMoicCalculationMode.mockRejectedValue(
      new FundCalculationModeBlockedError(['shadow_residency_pending'])
    );
    const res = await put(1, { key: 'm-blocked' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      error: 'mode_activation_blocked',
      blockers: ['shadow_residency_pending'],
    });
  });

  it('409 when the service reports an idempotency conflict', async () => {
    authState.user = ADMIN;
    svc.updateFundMoicCalculationMode.mockRejectedValue(
      new FundCalculationModeIdempotencyConflictError('reused')
    );
    const res = await put(1, { key: 'm-conflict' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'idempotency_conflict' });
  });

  it('409 when the service reports an in-progress idempotency request', async () => {
    authState.user = ADMIN;
    svc.updateFundMoicCalculationMode.mockRejectedValue(new FundCalculationModeInProgressError());
    const res = await put(1, { key: 'm-progress' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'idempotency_request_in_progress' });
  });

  it('200 on successful update', async () => {
    authState.user = ADMIN;
    const res = await put(1, { key: 'm-success' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...preview, replayed: false });
  });

  it('200 propagates service replay status', async () => {
    authState.user = ADMIN;
    svc.updateFundMoicCalculationMode.mockResolvedValue({ ...successResult, replayed: true });
    const res = await put(1, { key: 'm-replay' });

    expect(res.status).toBe(200);
    expect(res.body.replayed).toBe(true);
  });

  it('passes trimmed idempotency key, optionals, fund, mode, and actor to the service', async () => {
    authState.user = ADMIN;
    const res = await put(1, {
      key: '  m-args  ',
      body: {
        expectedVersion: 0,
        configuredMode: 'shadow',
        killSwitchActive: true,
        acceptedReconciliationRunId: 55,
      },
    });

    expect(res.status).toBe(200);
    expect(svc.updateFundMoicCalculationMode).toHaveBeenCalledTimes(1);
    expect(svc.updateFundMoicCalculationMode).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: 1,
        expectedVersion: 0,
        configuredMode: 'shadow',
        killSwitchActive: true,
        acceptedReconciliationRunId: 55,
        idempotencyKey: 'm-args',
        actorId: 101,
      })
    );
  });

  it('omits optional service args when optional body fields are omitted', async () => {
    authState.user = ADMIN;
    const res = await put(1, {
      key: 'm-omitted',
      body: { expectedVersion: 0, configuredMode: 'off' },
    });

    expect(res.status).toBe(200);
    const arg = svc.updateFundMoicCalculationMode.mock.calls[0]?.[0];
    expect(arg).toEqual(
      expect.objectContaining({
        fundId: 1,
        expectedVersion: 0,
        configuredMode: 'off',
        idempotencyKey: 'm-omitted',
        actorId: 101,
      })
    );
    expect(arg).not.toHaveProperty('killSwitchActive');
    expect(arg).not.toHaveProperty('acceptedReconciliationRunId');
  });
});
