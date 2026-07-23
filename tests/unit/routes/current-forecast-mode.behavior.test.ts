import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  user: null as null | { id: number; role: string; fundIds: number[] },
}));
const svc = vi.hoisted(() => ({ updateCurrentForecastCalculationMode: vi.fn() }));

vi.mock('../../../server/services/fund-calculation-mode-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../server/services/fund-calculation-mode-service')>();
  return {
    ...actual,
    updateCurrentForecastCalculationMode: svc.updateCurrentForecastCalculationMode,
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

const preview = {
  calculationKey: 'current_forecast',
  configuredMode: 'off',
  effectiveMode: 'off',
  killSwitchActive: false,
  shadowStartedAt: null,
  eligibleAt: null,
  residencyDaysRequired: 7,
  residencyStatus: 'not_applicable',
  currentSourceMatchesAccepted: false,
  unreconciledEditsPresent: false,
  blockers: [],
  version: 1,
};
const validBody = { expectedVersion: 0, configuredMode: 'off' };
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

function put(options: { key?: string; body?: unknown } = {}) {
  const req = request(buildApp()).put('/api/admin/funds/1/calculation-modes/current-forecast');
  if (options.key !== undefined) req.set('Idempotency-Key', options.key);
  return req.send(options.body ?? validBody);
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = ADMIN;
  svc.updateCurrentForecastCalculationMode.mockResolvedValue({
    response: preview,
    replayed: false,
  });
});

describe('current-forecast calculation mode route', () => {
  it('requires the admin role', async () => {
    authState.user = { id: 102, role: 'analyst', fundIds: [1] };

    const response = await put({ key: 'forecast-role' });

    expect(response.status).toBe(403);
    expect(svc.updateCurrentForecastCalculationMode).not.toHaveBeenCalled();
  });

  it('returns 428 when Idempotency-Key is missing', async () => {
    const response = await put();

    expect(response.status).toBe(428);
    expect(response.body).toEqual({
      error: 'idempotency_key_required',
      message: 'Idempotency-Key header is required',
    });
    expect(svc.updateCurrentForecastCalculationMode).not.toHaveBeenCalled();
  });

  it('returns 400 when the body is invalid', async () => {
    const response = await put({
      key: 'forecast-invalid',
      body: { expectedVersion: 0, configuredMode: 'off', unexpected: true },
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'invalid_mode_update' });
    expect(svc.updateCurrentForecastCalculationMode).not.toHaveBeenCalled();
  });

  it('refuses off|shadow -> on: only the activation command may write on', async () => {
    const response = await put({
      key: 'forecast-on',
      body: { expectedVersion: 0, configuredMode: 'on' },
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: 'activation_command_required' });
    expect(svc.updateCurrentForecastCalculationMode).not.toHaveBeenCalled();
  });

  it('writes off mode and returns the preview with replay status', async () => {
    const response = await put({ key: '  forecast-off  ' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ...preview, replayed: false });
    expect(svc.updateCurrentForecastCalculationMode).toHaveBeenCalledWith({
      fundId: 1,
      expectedVersion: 0,
      configuredMode: 'off',
      idempotencyKey: 'forecast-off',
      actorId: 101,
    });
  });
});
