import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  user: null as null | { id: number; role: string; fundIds: number[] },
}));
const svc = vi.hoisted(() => ({ resumeCurrentForecast: vi.fn() }));

vi.mock('../../../server/services/current-forecast-resume-command', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../server/services/current-forecast-resume-command')
    >();
  return {
    ...actual,
    resumeCurrentForecast: svc.resumeCurrentForecast,
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

import currentForecastRouter from '../../../server/routes/current-forecast';
import { CurrentForecastResumePreCutoverError } from '../../../server/services/current-forecast-resume-command';
import { FundCalculationModeVersionConflictError } from '../../../server/services/fund-calculation-mode-service';

const responseBody = {
  calculationKey: 'current_forecast',
  configuredMode: 'on',
  killSwitchActive: false,
  activatedAt: '2026-07-01T00:00:00.000Z',
  cutoverReferenceId: 41,
  version: 4,
};
const ADMIN = { id: 101, role: 'admin', fundIds: [1] };

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', currentForecastRouter);
  app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) =>
    res.status(500).json({ error: 'internal_error' })
  );
  return app;
}

function post(options: { key?: string; body?: unknown } = {}) {
  const req = request(buildApp()).post(
    '/api/admin/funds/1/calculation-modes/current-forecast/resume'
  );
  if (options.key !== undefined) req.set('Idempotency-Key', options.key);
  return req.send(options.body ?? { expectedVersion: 3 });
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = ADMIN;
  svc.resumeCurrentForecast.mockResolvedValue({ response: responseBody, replayed: false });
});

describe('current-forecast resume route', () => {
  it('requires the admin role', async () => {
    authState.user = { id: 102, role: 'analyst', fundIds: [1] };

    const result = await post({ key: 'resume-role' });

    expect(result.status).toBe(403);
    expect(svc.resumeCurrentForecast).not.toHaveBeenCalled();
  });

  it('returns 428 when Idempotency-Key is missing', async () => {
    const result = await post();

    expect(result.status).toBe(428);
    expect(result.body).toEqual({
      error: 'idempotency_key_required',
      message: 'Idempotency-Key header is required',
    });
    expect(svc.resumeCurrentForecast).not.toHaveBeenCalled();
  });

  it('re-arms and returns the command response', async () => {
    const result = await post({ key: '  resume-1  ' });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ...responseBody, replayed: false });
    expect(svc.resumeCurrentForecast).toHaveBeenCalledWith({
      fundId: 1,
      expectedVersion: 3,
      idempotencyKey: 'resume-1',
      actorId: 101,
    });
  });

  it('maps pre-cutover rejection to 409', async () => {
    svc.resumeCurrentForecast.mockRejectedValue(new CurrentForecastResumePreCutoverError(1));

    const result = await post({ key: 'resume-pre-cutover' });

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ error: 'resume_requires_post_activation' });
  });

  it('maps expected-version conflicts to 409', async () => {
    svc.resumeCurrentForecast.mockRejectedValue(new FundCalculationModeVersionConflictError(3, 4));

    const result = await post({ key: 'resume-stale' });

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({
      error: 'stale_expected_version',
      expectedVersion: 3,
      actualVersion: 4,
    });
  });

  it('returns replayed true for same-key command replay', async () => {
    svc.resumeCurrentForecast.mockResolvedValue({ response: responseBody, replayed: true });

    const result = await post({ key: 'resume-replay' });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ...responseBody, replayed: true });
  });
});
