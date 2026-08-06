import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  executeLpEconomicsRun: vi.fn(),
  getLpEconomicsRunReceipt: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  authenticated: true,
  fundAccess: true,
  role: 'admin',
  lpId: undefined as number | undefined,
  userId: '7' as unknown,
  userSub: '7' as unknown,
  calls: [] as string[],
}));

vi.mock('express-rate-limit', () => ({
  default: (options: { max: number }) => (_req: Request, _res: Response, next: NextFunction) => {
    authState.calls.push(options.max === 30 ? 'writeLimiter' : 'readLimiter');
    next();
  },
}));

vi.mock('../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (req: Request, res: Response, next: NextFunction) => {
    authState.calls.push('requireAuth');
    if (!authState.authenticated) return res.sendStatus(401);
    req.user = {
      ...(authState.userId === undefined ? {} : { id: authState.userId }),
      ...(authState.userSub === undefined ? {} : { sub: authState.userSub }),
      email: 'reader@example.com',
      role: authState.role,
      roles: [authState.role],
      fundIds: [1],
      ...(authState.lpId === undefined ? {} : { lpId: authState.lpId }),
    } as never;
    next();
  },
  requireFundAccess: (_req: Request, res: Response, next: NextFunction) => {
    authState.calls.push('requireFundAccess');
    if (!authState.fundAccess) return res.sendStatus(403);
    next();
  },
}));

vi.mock('../../../server/services/internal-economics/lp-economics-run-service', () => {
  class MockLpEconomicsRunServiceError extends Error {
    readonly statusCode: number;

    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
      readonly details?: Readonly<Record<string, unknown>>
    ) {
      super(message);
      this.name = 'LpEconomicsRunServiceError';
      this.statusCode = status;
    }
  }

  return {
    LpEconomicsRunServiceError: MockLpEconomicsRunServiceError,
    executeLpEconomicsRun: service.executeLpEconomicsRun,
    getLpEconomicsRunReceipt: service.getLpEconomicsRunReceipt,
  };
});

import internalEconomicsRouter from '../../../server/routes/internal-economics';
import { IdempotentCommandError } from '../../../server/lib/idempotent-command';
import { LpEconomicsRunServiceError } from '../../../server/services/internal-economics/lp-economics-run-service';

const RECEIPT = {
  receiptVersion: 'internal-lp-economics-run-receipt/1.0.0',
  runId: 9,
  fundId: 1,
  createdAt: '2026-06-30T23:59:59.000Z',
  basis: {
    policyVersionId: 3,
    capitalEnvelopeVersionId: 4,
    factsSnapshotId: 5,
    knowledgeCutoff: '2026-06-30T00:00:00.000Z',
    planVersionId: 6,
    forecastSnapshotId: 7,
    evaluationClock: '2026-06-30T23:59:59.000Z',
    terminalMode: 'hold_unrealized',
    terminalPeriodEnd: '2026-09-30',
    terminalResolutionMethodologyVersion: 'terminal-resolution/1.0.0',
  },
  versions: {
    calculationContractVersion: 'lp-economics/1.1.0',
    engineVersion: 'cash-assembly-period-loop-v1/1.1.0',
    methodologyVersion: 'cash-assembly-period-loop-methodology/1.1.0',
    resultCalculationVersion: null,
  },
  hashes: {
    capitalEnvelopeHash: 'a'.repeat(64),
    policyAssumptionsHash: 'b'.repeat(64),
    factsSnapshotInputHash: 'c'.repeat(64),
    planAssumptionsHash: 'd'.repeat(64),
    forecastInputHash: 'e'.repeat(64),
    inputHash: 'f'.repeat(64),
    resultHash: null,
  },
  outcome: {
    runState: 'failed',
    failure: { code: 'CARRY_PCT_INVALID', context: { field: 'carryPct' } },
  },
} as const;

const RUN_REQUEST = {
  policyVersionId: 3,
  factsSnapshotId: 5,
  planVersionId: 6,
  forecastSnapshotId: 7,
  terminalMode: 'hold_unrealized',
  clock: '2026-06-30T23:59:59.000Z',
} as const;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', internalEconomicsRouter);
  return app;
}

beforeEach(() => {
  authState.authenticated = true;
  authState.fundAccess = true;
  authState.role = 'admin';
  authState.lpId = undefined;
  authState.userId = '7';
  authState.userSub = '7';
  authState.calls = [];
  service.executeLpEconomicsRun.mockReset();
  service.executeLpEconomicsRun.mockResolvedValue({ receipt: RECEIPT, replayed: false });
  service.getLpEconomicsRunReceipt.mockReset();
  service.getLpEconomicsRunReceipt.mockResolvedValue(RECEIPT);
});

describe('internal-economics receipt route contract', () => {
  it('runs the read limiter before route-local authentication and denies anonymous callers', async () => {
    authState.authenticated = false;

    await request(buildApp()).get('/api/funds/1/internal-economics/runs/9').expect(401);

    expect(authState.calls).toEqual(['readLimiter', 'requireAuth']);
    expect(service.getLpEconomicsRunReceipt).not.toHaveBeenCalled();
  });

  it.each(['admin', 'partner', 'analyst', 'viewer', 'operator'])(
    'allows the interactive investment-team role %s to read any fund',
    async (role) => {
      authState.role = role;
      authState.fundAccess = true;

      const response = await request(buildApp())
        .get('/api/funds/1/internal-economics/runs/9')
        .expect(200);

      expect(authState.calls).toEqual(['readLimiter', 'requireAuth', 'requireFundAccess']);
      expect(service.getLpEconomicsRunReceipt).toHaveBeenCalledWith({ fundId: 1, runId: 9 });
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.body).toEqual(RECEIPT);
      expect(JSON.stringify(response.body)).not.toMatch(
        /replayed|idempotencyKey|requestHash|resultSnapshotId|createdBy/
      );
    }
  );

  it.each([
    ['service', undefined],
    ['unknown', undefined],
    ['partner', 41],
  ])(
    'denies non-team principal role=%s lpId=%s before fund access and service work',
    async (role, lpId) => {
      authState.role = role;
      authState.lpId = lpId;

      await request(buildApp()).get('/api/funds/1/internal-economics/runs/9').expect(403);

      expect(authState.calls).toEqual(['readLimiter', 'requireAuth']);
      expect(service.getLpEconomicsRunReceipt).not.toHaveBeenCalled();
    }
  );

  it.each(['0', '-1', '01', '1.0', 'abc'])(
    'rejects noncanonical fund ID %s before role, fund access, and service work',
    async (fundId) => {
      const response = await request(buildApp())
        .get(`/api/funds/${fundId}/internal-economics/runs/9`)
        .expect(400);

      expect(response.body).toEqual({
        error: 'Invalid fund ID',
        message: 'Fund ID must be a canonical positive integer',
      });
      expect(authState.calls).toEqual(['readLimiter', 'requireAuth']);
      expect(service.getLpEconomicsRunReceipt).not.toHaveBeenCalled();
    }
  );

  it.each(['0', '-1', '01', '1.0', 'abc'])(
    'rejects noncanonical run ID %s after fund access and before service work',
    async (runId) => {
      const response = await request(buildApp())
        .get(`/api/funds/1/internal-economics/runs/${runId}`)
        .expect(400);

      expect(response.body).toEqual({
        error: 'Invalid run ID',
        message: 'Run ID must be a canonical positive integer',
      });
      expect(authState.calls).toEqual(['readLimiter', 'requireAuth', 'requireFundAccess']);
      expect(service.getLpEconomicsRunReceipt).not.toHaveBeenCalled();
    }
  );

  it('does not invoke the receipt service when fund access denies', async () => {
    authState.fundAccess = false;

    await request(buildApp()).get('/api/funds/1/internal-economics/runs/9').expect(403);

    expect(service.getLpEconomicsRunReceipt).not.toHaveBeenCalled();
  });

  it.each([
    [404, 'RUN_NOT_FOUND', 'The internal LP economics run was not found.'],
    [404, 'RUN_NOT_FOUND', 'The internal LP economics run does not belong to this fund.'],
    [
      500,
      'UNSUPPORTED_CALCULATION_CONTRACT_VERSION',
      'Persisted run version tuple is unsupported.',
    ],
  ] as const)(
    'maps typed service error %s/%s without leaking persistence data',
    async (status, code, message) => {
      service.getLpEconomicsRunReceipt.mockRejectedValue(
        new LpEconomicsRunServiceError(status, code, message, {
          persistenceRow: { id: 9 },
        })
      );

      const response = await request(buildApp())
        .get('/api/funds/1/internal-economics/runs/9')
        .expect(status);

      expect(response.body).toEqual({ error: code, message });
      expect(response.body).not.toHaveProperty('details');
    }
  );

  it('maps the ownership guard 404 without leaking the scoped reference', async () => {
    service.getLpEconomicsRunReceipt.mockRejectedValue(
      new LpEconomicsRunServiceError(
        404,
        'FUND_SCOPE_NOT_FOUND',
        'The requested resource was not found in this fund.'
      )
    );

    const response = await request(buildApp())
      .get('/api/funds/1/internal-economics/runs/9')
      .expect(404);

    expect(response.body).toEqual({
      error: 'FUND_SCOPE_NOT_FOUND',
      message: 'The requested resource was not found in this fund.',
    });
    expect(response.body).not.toHaveProperty('ref');
  });
});

describe('internal-economics run creation route contract', () => {
  it('creates a strict explicit-basis run with canonical resource semantics', async () => {
    const response = await request(buildApp())
      .post('/api/funds/1/internal-economics/runs')
      .set('Idempotency-Key', 'run-create-1')
      .send(RUN_REQUEST)
      .expect(201);

    expect(authState.calls).toEqual(['writeLimiter', 'requireAuth', 'requireFundAccess']);
    expect(service.executeLpEconomicsRun).toHaveBeenCalledWith({
      fundId: 1,
      actorId: 7,
      idempotencyKey: 'run-create-1',
      request: RUN_REQUEST,
    });
    expect(response.headers['location']).toBe('/api/funds/1/internal-economics/runs/9');
    expect(response.headers['idempotency-replay']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body).toEqual(RECEIPT);
  });

  it('returns an identical receipt for a replay without Location or replay headers', async () => {
    service.executeLpEconomicsRun.mockResolvedValue({ receipt: RECEIPT, replayed: true });

    const response = await request(buildApp())
      .post('/api/funds/1/internal-economics/runs')
      .set('Idempotency-Key', 'run-replay-1')
      .send(RUN_REQUEST)
      .expect(200);

    expect(response.headers['location']).toBeUndefined();
    expect(response.headers['idempotency-replay']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body).toEqual(RECEIPT);
  });

  it('validates the canonical fund ID before idempotency-key and strict body checks', async () => {
    const response = await request(buildApp())
      .post('/api/funds/01/internal-economics/runs')
      .send({})
      .expect(400);

    expect(response.body).toEqual({
      error: 'Invalid fund ID',
      message: 'Fund ID must be a canonical positive integer',
    });
    expect(authState.calls).toEqual(['writeLimiter', 'requireAuth']);
    expect(service.executeLpEconomicsRun).not.toHaveBeenCalled();
  });

  it('rejects missing and malformed Idempotency-Key values before strict body parsing', async () => {
    const missing = await request(buildApp())
      .post('/api/funds/1/internal-economics/runs')
      .send({})
      .expect(428);
    expect(missing.body).toEqual({
      error: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'Idempotency-Key header is required.',
    });

    const malformed = await request(buildApp())
      .post('/api/funds/1/internal-economics/runs')
      .set('Idempotency-Key', 'bad key')
      .send({})
      .expect(400);
    expect(malformed.body).toEqual({
      error: 'INVALID_IDEMPOTENCY_KEY',
      message: 'Idempotency-Key must contain 1 to 128 RFC token characters.',
    });
    expect(service.executeLpEconomicsRun).not.toHaveBeenCalled();
  });

  it('accepts only the strict V1.1 body after the key has been parsed', async () => {
    const response = await request(buildApp())
      .post('/api/funds/1/internal-economics/runs')
      .set('Idempotency-Key', 'strict-body')
      .send({ ...RUN_REQUEST, latest: true })
      .expect(400);

    expect(response.body).toEqual({
      error: 'INVALID_BODY',
      message: 'The request body does not satisfy the LP economics run contract.',
    });
    expect(service.executeLpEconomicsRun).not.toHaveBeenCalled();
  });

  it.each([
    ['service', undefined],
    ['unknown', undefined],
    ['partner', 41],
  ])(
    'denies excluded POST principal role=%s lpId=%s before access and service work',
    async (role, lpId) => {
      authState.role = role;
      authState.lpId = lpId;

      await request(buildApp())
        .post('/api/funds/1/internal-economics/runs')
        .set('Idempotency-Key', 'denied-principal')
        .send(RUN_REQUEST)
        .expect(403);

      expect(authState.calls).toEqual(['writeLimiter', 'requireAuth']);
      expect(service.executeLpEconomicsRun).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['7', '8', 7],
    [7, '8', 7],
    ['not-canonical', '8', 8],
    ['01', undefined, null],
    [undefined, '9007199254740992', null],
  ] as const)(
    'uses only a safe canonical actor identity from id then sub (%s, %s)',
    async (userId, userSub, actorId) => {
      authState.userId = userId;
      authState.userSub = userSub;

      await request(buildApp())
        .post('/api/funds/1/internal-economics/runs')
        .set(
          'Idempotency-Key',
          `actor-${String(userId)}-${String(userSub)}`.replace(/[^A-Za-z0-9!#$%&'*+\-.^_`|~]/g, '-')
        )
        .send(RUN_REQUEST)
        .expect(201);

      expect(service.executeLpEconomicsRun).toHaveBeenCalledWith(
        expect.objectContaining({ actorId })
      );
    }
  );

  it.each([
    [404, 'FUND_SCOPE_NOT_FOUND', 'The requested resource was not found in this fund.'],
    [422, 'TERMINAL_MODE_MISMATCH', 'Request terminal mode does not match policy.'],
    [409, 'SOURCE_CONFIG_VERSION_DRIFTED', 'Pinned source configuration drifted.'],
  ] as const)('maps typed execution error %s/%s without details', async (status, code, message) => {
    service.executeLpEconomicsRun.mockRejectedValue(
      new LpEconomicsRunServiceError(status, code, message, {
        sensitive: 'must-not-serialize',
      })
    );

    const response = await request(buildApp())
      .post('/api/funds/1/internal-economics/runs')
      .set('Idempotency-Key', 'typed-error')
      .send(RUN_REQUEST)
      .expect(status);

    expect(response.body).toEqual({ error: code, message });
    expect(response.body).not.toHaveProperty('details');
  });

  it('maps IdempotentCommandError without serializing raw-key details', async () => {
    service.executeLpEconomicsRun.mockRejectedValue(
      new IdempotentCommandError(
        409,
        'IDEMPOTENCY_KEY_REUSE',
        'Idempotency-Key was already used for a different request.',
        { idempotencyKey: 'sensitive-raw-key' }
      )
    );

    const response = await request(buildApp())
      .post('/api/funds/1/internal-economics/runs')
      .set('Idempotency-Key', 'typed-idempotency-error')
      .send(RUN_REQUEST)
      .expect(409);

    expect(response.body).toEqual({
      error: 'IDEMPOTENCY_KEY_REUSE',
      message: 'Idempotency-Key was already used for a different request.',
    });
    expect(JSON.stringify(response.body)).not.toContain('sensitive-raw-key');
  });
});
