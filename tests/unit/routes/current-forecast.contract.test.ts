import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  getCurrentPlanVersions: vi.fn(),
  mintCurrentPlanVersion: vi.fn(),
  runCurrentForecastV2: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  authenticated: true,
  fundAccess: true,
  calls: [] as string[],
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
      role: 'admin',
      roles: ['admin'],
      fundIds: [1],
    } as never;
    next();
  },
  requireFundAccess: (_req: Request, res: Response, next: NextFunction) => {
    authState.calls.push('requireFundAccess');
    if (!authState.fundAccess) return res.sendStatus(403);
    next();
  },
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
    runCurrentForecastV2: service.runCurrentForecastV2,
  };
});

import currentForecastRouter from '../../../server/routes/current-forecast';
import { CurrentPlanVersionServiceError } from '../../../server/services/current-plan-version-service';

const PLAN_VERSION = {
  contractVersion: 'current-plan-version-v1',
  id: '41',
  fundId: 1,
  version: 1,
};

const FORECAST = {
  contractVersion: 'current-forecast-v2',
  fundId: 1,
  currentPlanVersionId: '41',
  financialFactsSnapshotId: '31',
  clock: '2026-07-22T18:24:32.051Z',
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
    () => request(buildApp()).post('/api/funds/1/current-forecast/runs').send({}),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.authenticated = true;
  authState.fundAccess = true;
  authState.calls.length = 0;
  service.getCurrentPlanVersions.mockResolvedValue([PLAN_VERSION]);
  service.mintCurrentPlanVersion.mockResolvedValue(PLAN_VERSION);
  service.runCurrentForecastV2.mockResolvedValue(FORECAST);
});

describe('current-forecast route contract', () => {
  it('rejects a non-numeric fund ID on every route before service work', async () => {
    const responses = await Promise.all([
      request(buildApp()).get('/api/funds/not-a-number/current-plan-versions'),
      request(buildApp())
        .post('/api/funds/not-a-number/current-plan-versions')
        .set('Idempotency-Key', 'invalid-fund-probe')
        .send({}),
      request(buildApp()).post('/api/funds/not-a-number/current-forecast/runs').send({}),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: 'Invalid parameter' });
    }
    expect(service.getCurrentPlanVersions).not.toHaveBeenCalled();
    expect(service.mintCurrentPlanVersion).not.toHaveBeenCalled();
    expect(service.runCurrentForecastV2).not.toHaveBeenCalled();
  });

  it('enforces requireAuth and requireFundAccess on every route', async () => {
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
      'requireFundAccess',
      'requireAuth',
      'requireFundAccess',
    ]);
    expect(service.getCurrentPlanVersions).not.toHaveBeenCalled();
    expect(service.mintCurrentPlanVersion).not.toHaveBeenCalled();
    expect(service.runCurrentForecastV2).not.toHaveBeenCalled();
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

  it('POST current-forecast runs validates its body', async () => {
    const response = await request(buildApp())
      .post('/api/funds/1/current-forecast/runs')
      .send({ clock: 'not-a-date-time' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'invalid_current_forecast_request' });
    expect(service.runCurrentForecastV2).not.toHaveBeenCalled();
  });

  it('POST current-forecast runs returns the service result', async () => {
    const response = await request(buildApp()).post('/api/funds/1/current-forecast/runs').send({
      currentPlanVersionId: '41',
      financialFactsSnapshotId: '31',
      clock: '2026-07-22T18:24:32.051Z',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(FORECAST);
    expect(service.runCurrentForecastV2).toHaveBeenCalledWith({
      fundId: 1,
      currentPlanVersionId: '41',
      financialFactsSnapshotId: '31',
      clock: '2026-07-22T18:24:32.051Z',
    });
  });

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
