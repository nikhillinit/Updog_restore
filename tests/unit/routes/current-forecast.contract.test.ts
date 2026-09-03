import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  getCurrentPlanVersions: vi.fn(),
  mintCurrentPlanVersion: vi.fn(),
  runManualCurrentForecastRecompute: vi.fn(),
  findManualCurrentForecastRecomputeCommandId: vi.fn(async () => 77),
}));

const authState = vi.hoisted(() => ({
  authenticated: true,
  fundAccess: true,
  role: 'admin',
  calls: [] as string[],
}));

const fundScopeState = vi.hoisted(() => ({
  enforceProvidedFundScope: vi.fn(async (_req: Request, res: Response) => {
    if (!authState.fundAccess) {
      res.status(403).json({ error: 'Forbidden', code: 'FUND_ACCESS_DENIED' });
      return false;
    }
    return true;
  }),
}));

vi.mock('express-rate-limit', () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (req: Request, res: Response, next: NextFunction) => {
    authState.calls.push('requireAuth');
    if (!authState.authenticated) return res.sendStatus(401);
    req.user = {
      id: 7,
      sub: '7',
      role: authState.role,
      roles: [authState.role],
      fundIds: [1],
    } as never;
    next();
  },
  requireFundAccess: (_req: Request, res: Response, next: NextFunction) => {
    authState.calls.push('requireFundAccess');
    if (!authState.fundAccess) return res.sendStatus(403);
    next();
  },
  requireWriteRole:
    (roles: readonly string[]) => (_req: Request, res: Response, next: NextFunction) => {
      authState.calls.push('requireWriteRole');
      if (!roles.includes(authState.role)) return res.sendStatus(403);
      next();
    },
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../../server/lib/auth/provided-fund-scope', () => ({
  enforceProvidedFundScope: fundScopeState.enforceProvidedFundScope,
}));

vi.mock('../../../server/services/current-plan-version-service', () => {
  class MockCurrentPlanVersionServiceError extends Error {
    readonly missingFields: readonly string[] | undefined;

    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
      options?: { missingFields?: readonly string[] }
    ) {
      super(message);
      this.name = 'CurrentPlanVersionServiceError';
      this.missingFields = options?.missingFields;
    }
  }

  return {
    CurrentPlanVersionServiceError: MockCurrentPlanVersionServiceError,
    getCurrentPlanVersions: service.getCurrentPlanVersions,
    mintCurrentPlanVersion: service.mintCurrentPlanVersion,
  };
});

vi.mock('../../../server/services/current-forecast-v2-service', () => {
  class MockCurrentForecastV2ServiceError extends Error {
    readonly basisMismatchCode: string | undefined;

    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
      options?: { basisMismatchCode?: string }
    ) {
      super(message);
      this.name = 'CurrentForecastV2ServiceError';
      this.basisMismatchCode = options?.basisMismatchCode;
    }
  }

  return {
    CurrentForecastV2ServiceError: MockCurrentForecastV2ServiceError,
  };
});

vi.mock('../../../server/services/current-forecast-shadow-trigger', () => ({
  runManualCurrentForecastRecompute: service.runManualCurrentForecastRecompute,
  findManualCurrentForecastRecomputeCommandId: service.findManualCurrentForecastRecomputeCommandId,
}));

import currentForecastRouter from '../../../server/routes/current-forecast';
import { CurrentForecastRecomputeOutcomeSchema } from '../../../shared/contracts/current-forecast-v2.contract';
import { IdempotentCommandError } from '../../../server/lib/idempotent-command';
import { CurrentPlanVersionServiceError } from '../../../server/services/current-plan-version-service';

const PLAN_VERSION = {
  contractVersion: 'current-plan-version-v1',
  id: '41',
  fundId: 1,
  version: 1,
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', currentForecastRouter);
  return app;
}

function routeRequests() {
  return [
    () => request(buildApp()).get('/api/funds/1/current-plan-versions'),
    () =>
      request(buildApp())
        .post('/api/funds/1/current-plan-versions')
        .set('Idempotency-Key', 'plan-41')
        .send({}),
    () =>
      request(buildApp())
        .post('/api/funds/1/current-forecast/recompute')
        .set('Idempotency-Key', 'recompute-1')
        .send({}),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.authenticated = true;
  authState.fundAccess = true;
  authState.role = 'admin';
  authState.calls.length = 0;
  fundScopeState.enforceProvidedFundScope.mockClear();
  service.getCurrentPlanVersions.mockResolvedValue([PLAN_VERSION]);
  service.mintCurrentPlanVersion.mockResolvedValue(PLAN_VERSION);
  service.runManualCurrentForecastRecompute.mockResolvedValue({
    status: 'completed',
    shadowReconciliationId: 91,
    replayed: false,
  });
});

describe('current-forecast route contract', () => {
  it('rejects a non-numeric fund ID on every route before service work', async () => {
    const responses = await Promise.all([
      request(buildApp()).get('/api/funds/not-a-number/current-plan-versions'),
      request(buildApp())
        .post('/api/funds/not-a-number/current-plan-versions')
        .set('Idempotency-Key', 'invalid-fund-probe')
        .send({}),
      request(buildApp())
        .post('/api/funds/not-a-number/current-forecast/recompute')
        .set('Idempotency-Key', 'invalid-fund-recompute')
        .send({}),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: 'Invalid parameter' });
    }
    expect(service.getCurrentPlanVersions).not.toHaveBeenCalled();
    expect(service.mintCurrentPlanVersion).not.toHaveBeenCalled();
    expect(service.runManualCurrentForecastRecompute).not.toHaveBeenCalled();
  });

  it('enforces authentication, write roles, and verified write fund scope', async () => {
    authState.authenticated = false;
    for (const send of routeRequests()) {
      const response = await send();
      expect(response.status).toBe(401);
    }
    expect(authState.calls).toEqual(['requireAuth', 'requireAuth', 'requireAuth']);

    authState.authenticated = true;
    authState.fundAccess = false;
    authState.calls.length = 0;
    for (const send of routeRequests()) {
      const response = await send();
      expect(response.status).toBe(403);
    }
    expect(authState.calls).toEqual([
      'requireAuth',
      'requireFundAccess',
      'requireAuth',
      'requireWriteRole',
      'requireAuth',
      'requireWriteRole',
    ]);
    expect(service.getCurrentPlanVersions).not.toHaveBeenCalled();
    expect(service.mintCurrentPlanVersion).not.toHaveBeenCalled();
    expect(service.runManualCurrentForecastRecompute).not.toHaveBeenCalled();
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledTimes(2);
  });

  it.each(['partner', 'admin', 'analyst'])(
    'allows %s through both forecast writes',
    async (role) => {
      authState.role = role;

      const planResponse = await request(buildApp())
        .post('/api/funds/1/current-plan-versions')
        .set('Idempotency-Key', `plan-${role}`)
        .send({});
      const recomputeResponse = await request(buildApp())
        .post('/api/funds/1/current-forecast/recompute')
        .set('Idempotency-Key', `recompute-${role}`)
        .send({});

      expect(planResponse.status).toBe(200);
      expect(recomputeResponse.status).toBe(201);
    }
  );

  it('denies restricted principals before forecast mutation', async () => {
    authState.role = 'viewer';

    const responses = await Promise.all([
      request(buildApp())
        .post('/api/funds/1/current-plan-versions')
        .set('Idempotency-Key', 'restricted-plan')
        .send({}),
      request(buildApp())
        .post('/api/funds/1/current-forecast/recompute')
        .set('Idempotency-Key', 'restricted-recompute')
        .send({}),
    ]);

    expect(responses.map((response) => response.status)).toEqual([403, 403]);
    expect(service.mintCurrentPlanVersion).not.toHaveBeenCalled();
    expect(service.runManualCurrentForecastRecompute).not.toHaveBeenCalled();
  });

  it('GET returns current plan versions from the service', async () => {
    const response = await request(buildApp()).get('/api/funds/1/current-plan-versions');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([PLAN_VERSION]);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(service.getCurrentPlanVersions).toHaveBeenCalledWith({ fundId: 1 });
  });

  it('POST current-plan-versions validates its body', async () => {
    const response = await request(buildApp())
      .post('/api/funds/1/current-plan-versions')
      .set('Idempotency-Key', 'plan-41')
      .send({ unexpected: true });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'invalid_current_plan_version_request' });
    expect(service.mintCurrentPlanVersion).not.toHaveBeenCalled();
  });

  it('POST current-plan-versions mints a version with validated input', async () => {
    const response = await request(buildApp())
      .post('/api/funds/1/current-plan-versions')
      .set('Idempotency-Key', ' plan-41 ')
      .send({ asOfDate: '2026-07-21' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(PLAN_VERSION);
    expect(service.mintCurrentPlanVersion).toHaveBeenCalledWith({
      fundId: 1,
      idempotencyKey: 'plan-41',
      actorId: 7,
      asOfDate: '2026-07-21',
    });
  });

  it('POST recompute enforces Idempotency-Key before service work', async () => {
    const missing = await request(buildApp())
      .post('/api/funds/1/current-forecast/recompute')
      .send({});
    const invalid = await request(buildApp())
      .post('/api/funds/1/current-forecast/recompute')
      .set('Idempotency-Key', 'contains space')
      .send({});

    expect(missing.status).toBe(428);
    expect(missing.body).toMatchObject({ error: 'IDEMPOTENCY_KEY_REQUIRED' });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ error: 'INVALID_IDEMPOTENCY_KEY' });
    expect(service.runManualCurrentForecastRecompute).not.toHaveBeenCalled();
  });

  it.each([
    ['fresh completed', { status: 'completed', shadowReconciliationId: 91, replayed: false }, 201],
    [
      'replayed completed',
      { status: 'completed', shadowReconciliationId: 91, replayed: true },
      200,
    ],
    ['fresh skipped', { status: 'skipped', replayed: false }, 200],
    ['fresh failed', { status: 'failed', failureCode: 'execution_error', replayed: false }, 200],
  ] as const)('POST recompute returns %s outcome', async (_label, outcome, expectedStatus) => {
    service.runManualCurrentForecastRecompute.mockResolvedValueOnce(outcome);

    const response = await request(buildApp())
      .post('/api/funds/1/current-forecast/recompute')
      .set('Idempotency-Key', ' recompute-1 ')
      .send({});

    expect(response.status).toBe(expectedStatus);
    expect(response.body).toEqual(outcome);
    expect(service.runManualCurrentForecastRecompute).toHaveBeenCalledWith({
      fundId: 1,
      idempotencyKey: 'recompute-1',
      actorId: 7,
    });
  });

  it('POST recompute body parses under the shared outcome contract', async () => {
    service.runManualCurrentForecastRecompute.mockResolvedValueOnce({
      status: 'completed',
      shadowReconciliationId: 91,
      replayed: true,
    });

    const response = await request(buildApp())
      .post('/api/funds/1/current-forecast/recompute')
      .set('Idempotency-Key', 'recompute-contract')
      .send({});

    expect(response.status).toBe(200);
    expect(CurrentForecastRecomputeOutcomeSchema.parse(response.body)).toEqual(response.body);
  });

  it('POST recompute fails closed when the service outcome violates the contract', async () => {
    service.runManualCurrentForecastRecompute.mockResolvedValueOnce({
      status: 'completed',
      replayed: false,
    });

    const response = await request(buildApp())
      .post('/api/funds/1/current-forecast/recompute')
      .set('Idempotency-Key', 'recompute-malformed')
      .send({});

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'recompute_outcome_contract_violation',
      message: 'Recompute outcome failed contract validation',
    });
    expect(service.findManualCurrentForecastRecomputeCommandId).toHaveBeenCalledWith({
      fundId: 1,
      idempotencyKey: 'recompute-malformed',
    });
  });

  it.each(['RECOMPUTE_IN_FLIGHT', 'IDEMPOTENCY_KEY_REUSE'])(
    'POST recompute propagates %s as 409',
    async (code) => {
      service.runManualCurrentForecastRecompute.mockRejectedValueOnce(
        new IdempotentCommandError(409, code, 'Conflict')
      );

      const response = await request(buildApp())
        .post('/api/funds/1/current-forecast/recompute')
        .set('Idempotency-Key', 'recompute-conflict')
        .send({});

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: code, message: 'Conflict' });
    }
  );

  it('maps typed current-plan service errors to their route status', async () => {
    service.mintCurrentPlanVersion.mockRejectedValueOnce(
      new CurrentPlanVersionServiceError(
        422,
        'PLAN_DERIVATION_INCOMPLETE',
        'Current plan derivation is incomplete.',
        { missingFields: ['fundSize'] }
      )
    );

    const response = await request(buildApp())
      .post('/api/funds/1/current-plan-versions')
      .set('Idempotency-Key', 'incomplete-plan')
      .send({});

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      error: 'PLAN_DERIVATION_INCOMPLETE',
      message: 'Current plan derivation is incomplete.',
      details: { missingFields: ['fundSize'] },
    });
  });
});
