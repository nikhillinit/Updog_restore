import express from 'express';
import type { Express } from 'express';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  executeLpEconomicsRun: vi.fn(),
  getLpEconomicsRunReceipt: vi.fn(),
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

const ENV_KEYS = [
  'NODE_ENV',
  '_EXPLICIT_NODE_ENV',
  'VITEST',
  'ALLOW_MEMORY_STORAGE',
  'DATABASE_URL',
  'NEON_DATABASE_URL',
  'REDIS_URL',
  '_EXPLICIT_REDIS_URL',
  'RATE_LIMIT_REDIS_URL',
  'QUEUE_REDIS_URL',
  'SESSION_REDIS_URL',
  'ENABLE_QUEUES',
  'REQUIRE_AUTH',
  'DEFAULT_USER_ID',
  'JWT_ALG',
  '_EXPLICIT_JWT_ALG',
  'JWT_SECRET',
  '_EXPLICIT_JWT_SECRET',
  'JWT_AUDIENCE',
  '_EXPLICIT_JWT_AUDIENCE',
  'JWT_ISSUER',
  '_EXPLICIT_JWT_ISSUER',
  'JWT_JWKS_URL',
  '_EXPLICIT_JWT_JWKS_URL',
  'SESSION_SECRET',
] as const;

const originalEnv = new Map<string, string | undefined>();

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

type Surface = {
  readonly name: 'makeApp' | 'registerRoutes';
  readonly app: Express;
};

let surfaces: readonly Surface[] = [];
let registerRoutesServer: Server | undefined;

function saveEnv(): void {
  for (const key of ENV_KEYS) originalEnv.set(key, process.env[key]);
}

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  originalEnv.clear();
}

function configureTestAuthEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env._EXPLICIT_NODE_ENV = 'test';
  process.env.VITEST = 'true';
  process.env.ALLOW_MEMORY_STORAGE = '1';
  delete process.env.DATABASE_URL;
  delete process.env.NEON_DATABASE_URL;
  process.env.REDIS_URL = 'memory://';
  process.env._EXPLICIT_REDIS_URL = 'memory://';
  delete process.env.RATE_LIMIT_REDIS_URL;
  delete process.env.QUEUE_REDIS_URL;
  delete process.env.SESSION_REDIS_URL;
  process.env.ENABLE_QUEUES = '0';
  process.env.REQUIRE_AUTH = '1';
  process.env.DEFAULT_USER_ID = '1';
  process.env.JWT_ALG = 'HS256';
  process.env._EXPLICIT_JWT_ALG = 'HS256';
  process.env.JWT_SECRET = 'test'.repeat(8);
  process.env._EXPLICIT_JWT_SECRET = process.env.JWT_SECRET;
  process.env.JWT_AUDIENCE = 'updog-test';
  process.env._EXPLICIT_JWT_AUDIENCE = process.env.JWT_AUDIENCE;
  process.env.JWT_ISSUER = 'updog-test';
  process.env._EXPLICIT_JWT_ISSUER = process.env.JWT_ISSUER;
  delete process.env.JWT_JWKS_URL;
  delete process.env._EXPLICIT_JWT_JWKS_URL;
  process.env.SESSION_SECRET = 'internal-economics-surface-session-secret-32';
}

async function authorizationHeader(
  role: string,
  lpId?: number,
  fundIds: readonly number[] = [1]
): Promise<string> {
  const { signToken } = await import('../../../server/lib/auth/jwt');
  return `Bearer ${signToken({
    sub: '9',
    email: 'internal-economics-user@example.com',
    role,
    fundIds,
    ...(lpId === undefined ? {} : { lpId }),
  })}`;
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

beforeAll(async () => {
  saveEnv();
  configureTestAuthEnv();
  vi.resetModules();

  const { makeApp } = await import('../../../server/app');
  const registerRoutesApp = express();
  registerRoutesApp.set('trust proxy', false);
  registerRoutesApp.use(express.json({ limit: '1mb' }));
  const { registerRoutes } = await import('../../../server/routes');
  registerRoutesServer = await registerRoutes(registerRoutesApp);

  surfaces = [
    { name: 'makeApp', app: makeApp() },
    { name: 'registerRoutes', app: registerRoutesApp },
  ];
}, 30_000);

afterAll(async () => {
  await closeServer(registerRoutesServer);
  restoreEnv();
});

beforeEach(() => {
  service.executeLpEconomicsRun.mockReset();
  service.executeLpEconomicsRun.mockResolvedValue({ receipt: RECEIPT, replayed: false });
  service.getLpEconomicsRunReceipt.mockReset();
  service.getLpEconomicsRunReceipt.mockResolvedValue(RECEIPT);
});

describe('internal-economics dual-runtime receipt parity', () => {
  it('returns 401 on both surfaces when credentials are absent', async () => {
    for (const surface of surfaces) {
      const response = await request(surface.app)
        .get('/api/funds/1/internal-economics/runs/9')
        .expect(401);
      expect(response.status, surface.name).toBe(401);
    }
    expect(service.getLpEconomicsRunReceipt).not.toHaveBeenCalled();
  });

  it('returns 401 on both surfaces when credentials are invalid', async () => {
    for (const surface of surfaces) {
      const response = await request(surface.app)
        .get('/api/funds/1/internal-economics/runs/9')
        .set('Authorization', 'Bearer not-a-valid-jwt')
        .expect(401);
      expect(response.status, surface.name).toBe(401);
    }
    expect(service.getLpEconomicsRunReceipt).not.toHaveBeenCalled();
  });

  it.each([
    ['service', undefined],
    ['unknown', undefined],
    ['lp', 41],
  ])(
    'returns the same 403 body on both surfaces for excluded role=%s lpId=%s',
    async (role, lpId) => {
      const authorization = await authorizationHeader(role, lpId);

      for (const surface of surfaces) {
        const response = await request(surface.app)
          .get('/api/funds/1/internal-economics/runs/9')
          .set('Authorization', authorization)
          .expect(403);
        expect(response.body, surface.name).toEqual({
          error: 'Forbidden',
          message: 'Investment-team access is required',
        });
      }
      expect(service.getLpEconomicsRunReceipt).not.toHaveBeenCalled();
    }
  );

  it.each(['admin', 'partner', 'analyst', 'viewer', 'operator'])(
    'allows %s to read fund 2 with token fundIds [1] identically on both surfaces',
    async (role) => {
      const receiptForFundTwo = { ...RECEIPT, fundId: 2 };
      service.getLpEconomicsRunReceipt.mockResolvedValue(receiptForFundTwo);
      const authorization = await authorizationHeader(role);

      for (const surface of surfaces) {
        const response = await request(surface.app)
          .get('/api/funds/2/internal-economics/runs/9')
          .set('Authorization', authorization)
          .expect(200);
        expect(response.body, surface.name).toEqual(receiptForFundTwo);
        expect(response.headers['cache-control'], surface.name).toBe('private, no-store');
      }
      expect(service.getLpEconomicsRunReceipt).toHaveBeenNthCalledWith(1, {
        fundId: 2,
        runId: 9,
      });
      expect(service.getLpEconomicsRunReceipt).toHaveBeenNthCalledWith(2, {
        fundId: 2,
        runId: 9,
      });
    }
  );

  it('returns the same canonical parameter error before service work on both surfaces', async () => {
    const authorization = await authorizationHeader('analyst');

    for (const surface of surfaces) {
      const response = await request(surface.app)
        .get('/api/funds/01/internal-economics/runs/9')
        .set('Authorization', authorization)
        .expect(400);
      expect(response.body, surface.name).toEqual({
        error: 'Invalid fund ID',
        message: 'Fund ID must be a canonical positive integer',
      });
    }
    expect(service.getLpEconomicsRunReceipt).not.toHaveBeenCalled();
  });

  it('returns the same canonical run parameter error on both surfaces', async () => {
    const authorization = await authorizationHeader('analyst');

    for (const surface of surfaces) {
      const response = await request(surface.app)
        .get('/api/funds/1/internal-economics/runs/01')
        .set('Authorization', authorization)
        .expect(400);
      expect(response.body, surface.name).toEqual({
        error: 'Invalid run ID',
        message: 'Run ID must be a canonical positive integer',
      });
    }
    expect(service.getLpEconomicsRunReceipt).not.toHaveBeenCalled();
  });

  it('returns the same typed 404 body on both surfaces', async () => {
    const { LpEconomicsRunServiceError } =
      await import('../../../server/services/internal-economics/lp-economics-run-service');
    service.getLpEconomicsRunReceipt.mockRejectedValue(
      new LpEconomicsRunServiceError(
        404,
        'RUN_NOT_FOUND',
        'The internal LP economics run was not found.'
      )
    );
    const authorization = await authorizationHeader('admin');

    for (const surface of surfaces) {
      const response = await request(surface.app)
        .get('/api/funds/1/internal-economics/runs/404')
        .set('Authorization', authorization)
        .expect(404);
      expect(response.body, surface.name).toEqual({
        error: 'RUN_NOT_FOUND',
        message: 'The internal LP economics run was not found.',
      });
    }
  });

  it('returns the same typed unsupported-version 500 body on both surfaces', async () => {
    const { LpEconomicsRunServiceError } =
      await import('../../../server/services/internal-economics/lp-economics-run-service');
    service.getLpEconomicsRunReceipt.mockRejectedValue(
      new LpEconomicsRunServiceError(
        500,
        'UNSUPPORTED_CALCULATION_CONTRACT_VERSION',
        'Persisted run version tuple is unsupported.'
      )
    );
    const authorization = await authorizationHeader('admin');

    for (const surface of surfaces) {
      const response = await request(surface.app)
        .get('/api/funds/1/internal-economics/runs/9')
        .set('Authorization', authorization)
        .expect(500);
      expect(response.body, surface.name).toEqual({
        error: 'UNSUPPORTED_CALCULATION_CONTRACT_VERSION',
        message: 'Persisted run version tuple is unsupported.',
      });
    }
  });

  it('returns the same ownership-guard 404 body on both surfaces', async () => {
    const { LpEconomicsRunServiceError } =
      await import('../../../server/services/internal-economics/lp-economics-run-service');
    service.getLpEconomicsRunReceipt.mockRejectedValue(
      new LpEconomicsRunServiceError(
        404,
        'FUND_SCOPE_NOT_FOUND',
        'The requested resource was not found in this fund.'
      )
    );
    const authorization = await authorizationHeader('admin');

    for (const surface of surfaces) {
      const response = await request(surface.app)
        .get('/api/funds/1/internal-economics/runs/9')
        .set('Authorization', authorization)
        .expect(404);
      expect(response.body, surface.name).toEqual({
        error: 'FUND_SCOPE_NOT_FOUND',
        message: 'The requested resource was not found in this fund.',
      });
      expect(response.body, surface.name).not.toHaveProperty('ref');
    }
  });

  it('uses identical first/replay POST resource semantics on both surfaces', async () => {
    const authorization = await authorizationHeader('admin');
    service.executeLpEconomicsRun.mockResolvedValueOnce({ receipt: RECEIPT, replayed: false });
    service.executeLpEconomicsRun.mockResolvedValueOnce({ receipt: RECEIPT, replayed: true });

    const first = await request(surfaces[0]!.app)
      .post('/api/funds/1/internal-economics/runs')
      .set('Authorization', authorization)
      .set('Idempotency-Key', 'dual-runtime-create')
      .send(RUN_REQUEST)
      .expect(201);
    const replay = await request(surfaces[1]!.app)
      .post('/api/funds/1/internal-economics/runs')
      .set('Authorization', authorization)
      .set('Idempotency-Key', 'dual-runtime-create')
      .send(RUN_REQUEST)
      .expect(200);

    expect(first.body).toEqual(RECEIPT);
    expect(replay.body).toEqual(RECEIPT);
    expect(first.headers['location']).toBe('/api/funds/1/internal-economics/runs/9');
    expect(replay.headers['location']).toBeUndefined();
    expect(first.headers['idempotency-replay']).toBeUndefined();
    expect(replay.headers['idempotency-replay']).toBeUndefined();
    expect(first.headers['cache-control']).toBe('private, no-store');
    expect(replay.headers['cache-control']).toBe('private, no-store');
    expect(service.executeLpEconomicsRun).toHaveBeenNthCalledWith(1, {
      fundId: 1,
      actorId: 9,
      idempotencyKey: 'dual-runtime-create',
      request: RUN_REQUEST,
    });
    expect(service.executeLpEconomicsRun).toHaveBeenNthCalledWith(2, {
      fundId: 1,
      actorId: 9,
      idempotencyKey: 'dual-runtime-create',
      request: RUN_REQUEST,
    });
  });

  it.each([
    ['admin', 2, [1], 201],
    ['partner', 1, [1], 201],
    ['analyst', 1, [1], 201],
    ['operator', 1, [1], 201],
    ['viewer', 1, [1], 201],
    ['partner', 2, [1], 403],
    ['analyst', 2, [1], 403],
  ] as const)(
    'enforces unsafe-method fund scope role=%s fund=%s on both surfaces',
    async (role, fundId, fundIds, expectedStatus) => {
      const authorization = await authorizationHeader(role, undefined, fundIds);

      for (const surface of surfaces) {
        await request(surface.app)
          .post(`/api/funds/${fundId}/internal-economics/runs`)
          .set('Authorization', authorization)
          .set('Idempotency-Key', `scope-${role}-${fundId}`)
          .send(RUN_REQUEST)
          .expect(expectedStatus);
      }

      const expectedCalls = expectedStatus === 201 ? 2 : 0;
      expect(service.executeLpEconomicsRun).toHaveBeenCalledTimes(expectedCalls);
    }
  );

  it.each([
    ['service', undefined],
    ['unknown', undefined],
    ['lp', 41],
  ])('denies excluded POST role=%s lpId=%s on both surfaces before service', async (role, lpId) => {
    const authorization = await authorizationHeader(role, lpId);

    for (const surface of surfaces) {
      const response = await request(surface.app)
        .post('/api/funds/1/internal-economics/runs')
        .set('Authorization', authorization)
        .set('Idempotency-Key', 'excluded-principal')
        .send(RUN_REQUEST)
        .expect(403);
      expect(response.body, surface.name).toEqual({
        error: 'Forbidden',
        message: 'Investment-team access is required',
      });
    }
    expect(service.executeLpEconomicsRun).not.toHaveBeenCalled();
  });

  it('returns canonical invalid-fund failure before key/body validation on both surfaces', async () => {
    const authorization = await authorizationHeader('admin');

    for (const surface of surfaces) {
      const response = await request(surface.app)
        .post('/api/funds/abc/internal-economics/runs')
        .set('Authorization', authorization)
        .send({})
        .expect(400);
      expect(response.body, surface.name).toEqual({
        error: 'Invalid fund ID',
        message: 'Fund ID must be a canonical positive integer',
      });
    }
    expect(service.executeLpEconomicsRun).not.toHaveBeenCalled();
  });

  it('returns the same typed service error body for POST on both surfaces', async () => {
    const { LpEconomicsRunServiceError } =
      await import('../../../server/services/internal-economics/lp-economics-run-service');
    service.executeLpEconomicsRun.mockRejectedValue(
      new LpEconomicsRunServiceError(
        404,
        'FUND_SCOPE_NOT_FOUND',
        'The requested resource was not found in this fund.',
        { ref: { id: 99 } }
      )
    );
    const authorization = await authorizationHeader('admin');

    for (const surface of surfaces) {
      const response = await request(surface.app)
        .post('/api/funds/1/internal-economics/runs')
        .set('Authorization', authorization)
        .set('Idempotency-Key', 'typed-post-error')
        .send(RUN_REQUEST)
        .expect(404);
      expect(response.body, surface.name).toEqual({
        error: 'FUND_SCOPE_NOT_FOUND',
        message: 'The requested resource was not found in this fund.',
      });
      expect(response.body, surface.name).not.toHaveProperty('details');
    }
  });
});
