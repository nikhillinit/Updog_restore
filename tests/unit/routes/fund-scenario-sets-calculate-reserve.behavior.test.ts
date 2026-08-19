import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  user: null as null | { id: number; role: string; email?: string },
}));
const svc = vi.hoisted(() => ({ executeReserveCalculationCommand: vi.fn() }));

vi.mock('../../../server/services/fund-scenario-calculation-command-service', () => ({
  executeReserveCalculationCommand: svc.executeReserveCalculationCommand,
}));

vi.mock('../../../server/lib/auth/jwt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/lib/auth/jwt')>();
  return {
    ...actual,
    requireAuth: () => (req: Request, res: Response, next: NextFunction) => {
      if (!authState.user) return res.sendStatus(401);
      (req as Request & { user: unknown }).user = { ...authState.user };
      next();
    },
    requireWriteRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
    requireFundAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
  };
});

import fundScenarioSetsRouter from '../../../server/routes/fund-scenario-sets';
import { createHttpError } from '../../../server/services/fund-scenario-set-service';

const SCENARIO_SET_ID = '3d9f1f36-7b53-4de4-9f6f-2f4f9a6f9a01';
const QUEUED_RESPONSE = {
  fundId: 7,
  scenarioSetId: SCENARIO_SET_ID,
  calculationMode: 'async_reserve_allocation',
  status: 'queued',
  jobId: `reserve-scenario-7-${SCENARIO_SET_ID}-scenario-input-hash-v1-${'a'.repeat(64)}__run__6f1b0f52-8d4f-4a3c-9c1e-0d5a3f4b6c7d`,
  correlationId: '0b2f7d38-6c58-4f9c-a2be-6a1d2c3e4f50',
};
const WRITER = { id: 101, role: 'partner', email: 'writer@example.com' };

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', fundScenarioSetsRouter);
  return app;
}

function post(options: { key?: string; body?: unknown; path?: string } = {}) {
  const req = request(buildApp()).post(
    options.path ?? `/api/funds/7/scenario-sets/${SCENARIO_SET_ID}/calculate-reserve`
  );
  if (options.key !== undefined) req.set('Idempotency-Key', options.key);
  return req.send(options.body ?? { calculationMode: 'async_reserve_allocation' });
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = WRITER;
  svc.executeReserveCalculationCommand.mockResolvedValue(QUEUED_RESPONSE);
});

describe('calculate-reserve idempotent command route', () => {
  it('returns 428 when Idempotency-Key is missing', async () => {
    const result = await post();

    expect(result.status).toBe(428);
    expect(result.body).toEqual({
      error: 'idempotency_key_required',
      message: 'Idempotency-Key header is required',
    });
    expect(svc.executeReserveCalculationCommand).not.toHaveBeenCalled();
  });

  it('returns 400 validation_error for a blank Idempotency-Key', async () => {
    const result = await post({ key: '   ' });

    expect(result.status).toBe(400);
    expect(result.body).toEqual({
      error: 'validation_error',
      message: 'Idempotency-Key must contain 1 to 128 RFC token characters',
    });
    expect(svc.executeReserveCalculationCommand).not.toHaveBeenCalled();
  });

  it('returns 400 validation_error for a non-token-safe Idempotency-Key', async () => {
    const result = await post({ key: 'bad key with spaces' });

    expect(result.status).toBe(400);
    expect(result.body).toEqual({
      error: 'validation_error',
      message: 'Idempotency-Key must contain 1 to 128 RFC token characters',
    });
    expect(svc.executeReserveCalculationCommand).not.toHaveBeenCalled();
  });

  it('returns 400 validation_error for an Idempotency-Key longer than 128 characters', async () => {
    const result = await post({ key: 'k'.repeat(129) });

    expect(result.status).toBe(400);
    expect(result.body).toEqual({
      error: 'validation_error',
      message: 'Idempotency-Key must contain 1 to 128 RFC token characters',
    });
    expect(svc.executeReserveCalculationCommand).not.toHaveBeenCalled();
  });

  it('returns the existing validation body for an invalid request payload', async () => {
    const result = await post({
      key: 'valid-key-1',
      body: { calculationMode: 'unsupported_mode' },
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: 'invalid_request_body',
      message: 'Invalid reserve scenario calculation payload',
    });
    expect(svc.executeReserveCalculationCommand).not.toHaveBeenCalled();
  });

  it('passes the parsed command through and returns 202 with the exact stored response', async () => {
    const result = await post({ key: ' valid-key-2 ' });

    expect(result.status).toBe(202);
    expect(result.body).toEqual(QUEUED_RESPONSE);
    expect(svc.executeReserveCalculationCommand).toHaveBeenCalledTimes(1);
    expect(svc.executeReserveCalculationCommand).toHaveBeenCalledWith({
      fundId: 7,
      scenarioSetId: SCENARIO_SET_ID,
      idempotencyKey: 'valid-key-2',
      request: { calculationMode: 'async_reserve_allocation' },
      actor: { userId: 101, label: 'writer@example.com' },
    });
  });

  it('does not add a replayed marker to the successful response body', async () => {
    const result = await post({ key: 'valid-key-3' });

    expect(result.status).toBe(202);
    expect(result.body).not.toHaveProperty('replayed');
  });

  it('maps key reuse with a changed request to 422 idempotency_key_reused', async () => {
    svc.executeReserveCalculationCommand.mockRejectedValue(
      createHttpError(422, 'Idempotency-Key was reused with a different reserve calculation request', {
        code: 'idempotency_key_reused',
      })
    );

    const result = await post({ key: 'reused-key' });

    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({
      error: 'idempotency_key_reused',
      code: 'idempotency_key_reused',
    });
  });

  it('maps an active concurrent command to 409 with Retry-After 1', async () => {
    svc.executeReserveCalculationCommand.mockRejectedValue(
      createHttpError(409, 'Reserve calculation command is still in progress', {
        code: 'idempotency_request_in_progress',
      })
    );

    const result = await post({ key: 'inflight-key' });

    expect(result.status).toBe(409);
    expect(result.headers['retry-after']).toBe('1');
    expect(result.body).toMatchObject({
      error: 'idempotency_request_in_progress',
      code: 'idempotency_request_in_progress',
    });
  });

  it('preserves the existing queue-unavailable 503 contract', async () => {
    svc.executeReserveCalculationCommand.mockRejectedValue(
      createHttpError(503, 'Fund scenario calculation queue is not available', {
        code: 'scenario_calculation_queue_unavailable',
        details: { reason: 'queues_disabled' },
      })
    );

    const result = await post({ key: 'queue-down-key' });

    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({
      error: 'internal_error',
      code: 'scenario_calculation_queue_unavailable',
      message: 'Fund scenario calculation queue is not available',
      details: { reason: 'queues_disabled' },
    });
  });

  it('rejects an invalid scenario set id before command execution', async () => {
    const result = await post({
      key: 'valid-key-4',
      path: '/api/funds/7/scenario-sets/not-a-uuid/calculate-reserve',
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: 'invalid_scenario_set_id' });
    expect(svc.executeReserveCalculationCommand).not.toHaveBeenCalled();
  });

  it('requires authentication before touching the command service', async () => {
    authState.user = null;

    const result = await post({ key: 'anon-key' });

    expect(result.status).toBe(401);
    expect(svc.executeReserveCalculationCommand).not.toHaveBeenCalled();
  });
});
