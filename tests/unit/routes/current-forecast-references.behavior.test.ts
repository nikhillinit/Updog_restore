import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  user: null as null | { id: number; role: string; fundIds: number[] },
}));
const svc = vi.hoisted(() => ({
  createRollbackCurrentForecastReference: vi.fn(),
  activateCurrentForecast: vi.fn(),
}));

vi.mock('../../../server/services/current-forecast-reference-service', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../server/services/current-forecast-reference-service')
    >();
  return {
    ...actual,
    createRollbackCurrentForecastReference: svc.createRollbackCurrentForecastReference,
    activateCurrentForecast: svc.activateCurrentForecast,
  };
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

import {
  CurrentForecastActivationBlockedError,
  CurrentForecastReferenceError,
} from '../../../server/services/current-forecast-reference-service';
import { FundCalculationModeVersionConflictError } from '../../../server/services/fund-calculation-mode-service';
import currentForecastRouter from '../../../server/routes/current-forecast';

const ADMIN = { id: 101, role: 'admin', fundIds: [1] };

const referenceRecord = {
  id: 50,
  fundId: 1,
  calculationKey: 'current_forecast',
  fundSnapshotId: 11,
  currentPlanVersionId: 21,
  financialFactsSnapshotId: 31,
  inputHash: 'a'.repeat(64),
  resultHash: 'b'.repeat(64),
  assumptionsHash: 'c'.repeat(64),
  engineVersion: 'current-forecast-v2-engine/1.0.0',
  methodologyVersion: 'cohort-projection-v2/1.0.0',
  candidate: true,
  supersededByReferenceId: null,
  reason: 'roll back to pre-incident head',
  createdBy: 101,
  createdAt: '2026-07-22T00:00:00.000Z',
};

const activationResponse = {
  calculationKey: 'current_forecast',
  configuredMode: 'on',
  activatedAt: '2026-07-22T00:00:00.000Z',
  cutoverReferenceId: 50,
  version: 4,
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', currentForecastRouter);
  app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) =>
    res.status(500).json({ error: 'internal_error' })
  );
  return app;
}

function post(path: string, options: { key?: string; body?: unknown } = {}) {
  const req = request(buildApp()).post(path);
  if (options.key !== undefined) req.set('Idempotency-Key', options.key);
  return req.send(options.body ?? {});
}

const REFERENCES_PATH = '/api/admin/funds/1/current-forecast/references';
const ACTIVATE_PATH = '/api/admin/funds/1/current-forecast/activate';
const validReferencesBody = { sourceReferenceId: 40, reason: 'roll back to pre-incident head' };
const validActivateBody = { referenceId: 50, expectedVersion: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = ADMIN;
  svc.createRollbackCurrentForecastReference.mockResolvedValue({
    row: referenceRecord,
    replayed: false,
  });
  svc.activateCurrentForecast.mockResolvedValue({
    response: activationResponse,
    replayed: false,
  });
});

describe('POST /api/admin/funds/:fundId/current-forecast/references', () => {
  it('requires the admin role', async () => {
    authState.user = { id: 102, role: 'analyst', fundIds: [1] };

    const response = await post(REFERENCES_PATH, { key: 'ref-role', body: validReferencesBody });

    expect(response.status).toBe(403);
    expect(svc.createRollbackCurrentForecastReference).not.toHaveBeenCalled();
  });

  it('returns 428 when Idempotency-Key is missing', async () => {
    const response = await post(REFERENCES_PATH, { body: validReferencesBody });

    expect(response.status).toBe(428);
    expect(response.body).toEqual({
      error: 'idempotency_key_required',
      message: 'Idempotency-Key header is required',
    });
    expect(svc.createRollbackCurrentForecastReference).not.toHaveBeenCalled();
  });

  it('returns 400 when the body is invalid', async () => {
    const response = await post(REFERENCES_PATH, {
      key: 'ref-invalid',
      body: { ...validReferencesBody, unexpected: true },
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'invalid_reference_request' });
    expect(svc.createRollbackCurrentForecastReference).not.toHaveBeenCalled();
  });

  it('creates the rollback candidate and returns it with replay status', async () => {
    const response = await post(REFERENCES_PATH, {
      key: '  ref-happy  ',
      body: validReferencesBody,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reference: referenceRecord, replayed: false });
    expect(svc.createRollbackCurrentForecastReference).toHaveBeenCalledWith({
      fundId: 1,
      sourceReferenceId: 40,
      reason: 'roll back to pre-incident head',
      idempotencyKey: 'ref-happy',
      createdBy: 101,
    });
  });

  it('maps reference_not_found to 404', async () => {
    svc.createRollbackCurrentForecastReference.mockRejectedValue(
      new CurrentForecastReferenceError(404, 'reference_not_found', 'missing reference')
    );

    const response = await post(REFERENCES_PATH, { key: 'ref-404', body: validReferencesBody });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'reference_not_found', message: 'missing reference' });
  });
});

describe('POST /api/admin/funds/:fundId/current-forecast/activate', () => {
  it('requires the admin role', async () => {
    authState.user = { id: 102, role: 'analyst', fundIds: [1] };

    const response = await post(ACTIVATE_PATH, { key: 'act-role', body: validActivateBody });

    expect(response.status).toBe(403);
    expect(svc.activateCurrentForecast).not.toHaveBeenCalled();
  });

  it('returns 428 when Idempotency-Key is missing', async () => {
    const response = await post(ACTIVATE_PATH, { body: validActivateBody });

    expect(response.status).toBe(428);
    expect(svc.activateCurrentForecast).not.toHaveBeenCalled();
  });

  it('returns 400 when the body is invalid', async () => {
    const response = await post(ACTIVATE_PATH, {
      key: 'act-invalid',
      body: { referenceId: 50 },
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'invalid_activation_request' });
    expect(svc.activateCurrentForecast).not.toHaveBeenCalled();
  });

  it('activates and returns the activation event with replay status', async () => {
    const response = await post(ACTIVATE_PATH, { key: 'act-happy', body: validActivateBody });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ...activationResponse, replayed: false });
    expect(svc.activateCurrentForecast).toHaveBeenCalledWith({
      fundId: 1,
      referenceId: 50,
      expectedVersion: 3,
      idempotencyKey: 'act-happy',
      actorId: 101,
    });
  });

  it('maps a version conflict to 409', async () => {
    svc.activateCurrentForecast.mockRejectedValue(
      new FundCalculationModeVersionConflictError(3, 5)
    );

    const response = await post(ACTIVATE_PATH, { key: 'act-conflict', body: validActivateBody });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: 'stale_expected_version',
      expectedVersion: 3,
      actualVersion: 5,
    });
  });

  it('maps activation blockers to 409 with the blocker list', async () => {
    svc.activateCurrentForecast.mockRejectedValue(
      new CurrentForecastActivationBlockedError(['shadow_green_required'])
    );

    const response = await post(ACTIVATE_PATH, { key: 'act-blocked', body: validActivateBody });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: 'activation_blocked',
      blockers: ['shadow_green_required'],
    });
  });

  it('maps already_activated to 409', async () => {
    svc.activateCurrentForecast.mockRejectedValue(
      new CurrentForecastReferenceError(409, 'already_activated', 'already activated')
    );

    const response = await post(ACTIVATE_PATH, { key: 'act-twice', body: validActivateBody });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'already_activated', message: 'already activated' });
  });
});
