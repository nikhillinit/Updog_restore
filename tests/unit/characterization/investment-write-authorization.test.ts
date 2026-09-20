import { type Server } from 'node:http';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const effects = vi.hoisted(() => ({
  assertLegacyInvestmentMutable: vi.fn(),
  createInvestment: vi.fn(),
  createRound: vi.fn(),
  invalidateH9: vi.fn(),
}));

vi.mock('../../../server/services/calc-run-completion-handlers.js', () => ({
  registerCompletionHandlers: vi.fn(),
  resetCompletionHandlerRegistration: vi.fn(),
}));
vi.mock('../../../server/services/variance-alert-automation.js', () => ({
  varianceAlertAutomationService: { start: vi.fn(), stop: vi.fn() },
}));
vi.mock('../../../server/websocket/index.js', () => ({ setupWebSocketServers: vi.fn() }));
vi.mock(
  '../../../server/services/financial-observations/artifact-retention-service.js',
  async (original) => {
    const module =
      await original<
        typeof import('../../../server/services/financial-observations/artifact-retention-service.js')
      >();
    vi.spyOn(module.artifactRetentionService, 'start').mockImplementation(() => {});
    vi.spyOn(module.artifactRetentionService, 'stop').mockResolvedValue(undefined);
    return module;
  }
);
vi.mock(
  '../../../server/services/internal-analysis/analysis-checkpoint-service.js',
  async (original) => {
    const module =
      await original<
        typeof import('../../../server/services/internal-analysis/analysis-checkpoint-service.js')
      >();
    vi.spyOn(module.internalAnalysisCheckpointService, 'start').mockImplementation(() => {});
    vi.spyOn(module.internalAnalysisCheckpointService, 'stop').mockResolvedValue(undefined);
    return module;
  }
);
vi.mock('../../../server/services/investment-ledger/legacy-compat-guard-service', () => ({
  assertLegacyInvestmentMutable: effects.assertLegacyInvestmentMutable,
  createLegacyInvestmentWithLedgerGuard: effects.createInvestment,
  UseLedgerRouteError: class UseLedgerRouteError extends Error {
    readonly status = 409;
    readonly code = 'USE_LEDGER_ROUTE';
  },
}));
vi.mock('../../../server/services/h9-artifact-invalidation-service', () => ({
  invalidateH9Artifacts: effects.invalidateH9,
}));
vi.mock('../../../server/services/investments/investment-round-service', () => ({
  createRound: effects.createRound,
  listRoundsForInvestment: vi.fn(),
  loadRound: vi.fn(),
}));

const originalEnvironment = { ...process.env };
const ORIGIN = 'http://localhost:5173';
const FUND_ID = 1;
const INVESTMENT_ID = 41;
const roundBody = {
  fundId: FUND_ID,
  roundName: 'Series A',
  securityType: 'equity',
  roundDate: '2026-09-20',
  currency: 'USD',
  investmentAmount: '1000000',
};
const investmentBody = {
  fundId: FUND_ID,
  companyId: 7,
  investmentDate: '2026-09-20T00:00:00.000Z',
  amount: '1000000',
  round: 'Series A',
};

let server: Server | undefined;
let teardown: (() => Promise<void>) | undefined;
let setReady: ((ready: boolean) => void) | undefined;
let surfaces: Array<{ name: string; app: Express | Server }> = [];
let signToken: ((data: object) => string) | undefined;
let getInvestmentSpy: ReturnType<typeof vi.spyOn> | undefined;
let setIntervalSpy: ReturnType<typeof vi.spyOn> | undefined;

function configureEnvironment(): void {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    _EXPLICIT_NODE_ENV: 'test',
    REDIS_URL: 'memory://',
    _EXPLICIT_REDIS_URL: 'memory://',
    ALLOW_MEMORY_STORAGE: '1',
    ENABLE_QUEUES: '0',
    REQUIRE_AUTH: '1',
    DEFAULT_USER_ID: '1',
    SESSION_SECRET: 'investment-write-auth-session-secret-at-least-32-characters',
    JWT_SECRET: 'investment-write-auth-jwt-secret-at-least-32-characters',
    _EXPLICIT_JWT_SECRET: 'investment-write-auth-jwt-secret-at-least-32-characters',
    JWT_ALG: 'HS256',
    _EXPLICIT_JWT_ALG: 'HS256',
    JWT_AUDIENCE: 'investment-write-auth-test',
    _EXPLICIT_JWT_AUDIENCE: 'investment-write-auth-test',
    JWT_ISSUER: 'investment-write-auth-test',
    _EXPLICIT_JWT_ISSUER: 'investment-write-auth-test',
    CORS_ORIGIN: ORIGIN,
    ALLOWED_ORIGINS: ORIGIN,
    BODY_LIMIT: '256kb',
    RATE_LIMIT_MAX: '1000',
  });
  for (const key of [
    'DATABASE_URL',
    'NEON_DATABASE_URL',
    'RATE_LIMIT_REDIS_URL',
    'QUEUE_REDIS_URL',
    'SESSION_REDIS_URL',
    'JWT_JWKS_URL',
    '_EXPLICIT_JWT_JWKS_URL',
    'VERCEL',
    'VERCEL_ENV',
  ]) {
    delete process.env[key];
  }
}

function authorization(role: string, fundIds = [FUND_ID], lpId?: number): string {
  if (!signToken) throw new Error('Test runtime not booted');
  const token = signToken({
    sub: `${role}-user`,
    email: `${role}@example.test`,
    role,
    fundIds,
    ...(lpId === undefined ? {} : { lpId }),
  });
  return `Bearer ${token}`;
}

function createdRound(id: number) {
  return {
    kind: 'created' as const,
    xmin: String(id),
    row: {
      id,
      investmentId: INVESTMENT_ID,
      fundId: FUND_ID,
      roundName: roundBody.roundName,
      securityType: roundBody.securityType,
      roundDate: roundBody.roundDate,
      currency: roundBody.currency,
      investmentAmount: roundBody.investmentAmount,
      roundSize: null,
      preMoneyValuation: null,
      supersedesRoundId: null,
      createdAt: new Date('2026-09-20T00:00:00.000Z'),
      updatedAt: new Date('2026-09-20T00:00:00.000Z'),
    },
  };
}

beforeAll(async () => {
  configureEnvironment();
  setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

  const [{ makeApp }, { loadEnv }, providersModule, serverModule, health, jwt, storageModule] =
    await Promise.all([
      import('../../../server/app'),
      import('../../../server/config/index.js'),
      import('../../../server/providers.js'),
      import('../../../server/server.js'),
      import('../../../server/health/state.js'),
      import('../../../server/lib/auth/jwt'),
      import('../../../server/storage'),
    ]);

  const config = loadEnv();
  const providers = await providersModule.buildProviders(config);
  teardown = providers.teardown;
  server = await serverModule.createServer(config, providers);
  setReady = health.setReady;
  setReady(true);
  signToken = jwt.signToken;
  getInvestmentSpy = vi
    .spyOn(storageModule.storage, 'getInvestment')
    .mockResolvedValue({ id: INVESTMENT_ID, fundId: FUND_ID } as never);
  surfaces = [
    { name: 'makeApp', app: makeApp() },
    { name: 'createServer', app: server },
  ];
});

beforeEach(() => {
  effects.assertLegacyInvestmentMutable.mockReset().mockResolvedValue(undefined);
  effects.createInvestment.mockReset();
  effects.createRound.mockReset().mockResolvedValue(createdRound(501));
  effects.invalidateH9.mockReset().mockResolvedValue(undefined);
});

afterAll(async () => {
  setReady?.(false);
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await teardown?.();
  getInvestmentSpy?.mockRestore();
  for (const result of setIntervalSpy?.mock.results ?? []) {
    if (result.type === 'return') clearInterval(result.value);
  }
  setIntervalSpy?.mockRestore();
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
});

describe('investment write authorization through real assemblers', () => {
  it.each(['admin', 'partner', 'analyst'])(
    '%s reaches same-fund writes while legacy JSON dates stay unsupported',
    async (role) => {
      for (const { name, app } of surfaces) {
        effects.createRound.mockClear();
        const auth = authorization(role);

        const legacyCreate = await request(app)
          .post('/api/investments')
          .set('Authorization', auth)
          .send(investmentBody);
        expect(legacyCreate.status, `${name} ${role} legacy create auth`).toBe(400);
        expect(legacyCreate.body.error).toBe('Invalid investment data');

        const roundCreate = await request(app)
          .post(`/api/investments/${INVESTMENT_ID}/rounds`)
          .set('Authorization', auth)
          .set('Idempotency-Key', `${name}-${role}-round`)
          .send(roundBody);
        expect(roundCreate.status, `${name} ${role} round create`).toBe(201);
        expect(roundCreate.body).toMatchObject({ id: 501, fundId: FUND_ID });
        expect(effects.createRound, `${name} ${role} round mutation`).toHaveBeenCalledTimes(1);
      }
    }
  );

  it.each([{ companyId: 7 }, { fundId: '1', companyId: 7 }])(
    'keeps missing or malformed fundId at 400',
    async (body) => {
      for (const { name, app } of surfaces) {
        effects.createInvestment.mockClear();
        const response = await request(app)
          .post('/api/investments')
          .set('Authorization', authorization('partner'))
          .send(body);

        expect(response.status, name).toBe(400);
        expect(response.body.error).toBe('Invalid investment data');
        expect(effects.createInvestment).not.toHaveBeenCalled();
      }
    }
  );

  it.each([
    { label: 'lp-linked', role: 'analyst', lpId: 77 },
    { label: 'read-only', role: 'user', lpId: undefined },
  ])('denies $label same-fund writes before mutation', async ({ role, lpId }) => {
    for (const { name, app } of surfaces) {
      effects.createInvestment.mockClear();
      effects.createRound.mockClear();
      const auth = authorization(role, [FUND_ID], lpId);

      const legacyCreate = await request(app)
        .post('/api/investments')
        .set('Authorization', auth)
        .send(investmentBody);
      expect(legacyCreate.status, `${name} legacy create`).toBe(403);
      expect(legacyCreate.body.code).toBe('TEAM_WRITE_REQUIRED');

      const roundCreate = await request(app)
        .post(`/api/investments/${INVESTMENT_ID}/rounds`)
        .set('Authorization', auth)
        .set('Idempotency-Key', `${name}-${role}-denied`)
        .send(roundBody);
      expect(roundCreate.status, `${name} round create`).toBe(403);
      expect(roundCreate.body.code).toBe('TEAM_WRITE_REQUIRED');
      expect(effects.createInvestment).not.toHaveBeenCalled();
      expect(effects.createRound).not.toHaveBeenCalled();
    }
  });

  it('denies cross-fund partner writes before mutation', async () => {
    for (const { name, app } of surfaces) {
      effects.createInvestment.mockClear();
      effects.createRound.mockClear();
      const auth = authorization('partner', [2]);

      const legacyCreate = await request(app)
        .post('/api/investments')
        .set('Authorization', auth)
        .send(investmentBody);
      expect(legacyCreate.status, `${name} legacy create`).toBe(403);
      expect(legacyCreate.body.code).toBe('FUND_ACCESS_DENIED');

      const roundCreate = await request(app)
        .post(`/api/investments/${INVESTMENT_ID}/rounds`)
        .set('Authorization', auth)
        .set('Idempotency-Key', `${name}-cross-fund`)
        .send(roundBody);
      expect(roundCreate.status, `${name} round create`).toBe(403);
      expect(roundCreate.body.code).toBe('FUND_ACCESS_DENIED');
      expect(effects.createInvestment).not.toHaveBeenCalled();
      expect(effects.createRound).not.toHaveBeenCalled();
    }
  });

  it('keeps Idempotency-Key mandatory for valid round writes', async () => {
    for (const { name, app } of surfaces) {
      effects.createRound.mockClear();
      const response = await request(app)
        .post(`/api/investments/${INVESTMENT_ID}/rounds`)
        .set('Authorization', authorization('partner'))
        .send(roundBody);

      expect(response.status, name).toBe(428);
      expect(response.body.error).toBe('precondition_required');
      expect(effects.createRound).not.toHaveBeenCalled();
    }
  });

  it('does not expose an authorized round response through unauthorized replay', async () => {
    for (const { name, app } of surfaces) {
      effects.createRound.mockClear();
      const key = `${name}-authorized-output`;
      const authorized = await request(app)
        .post(`/api/investments/${INVESTMENT_ID}/rounds`)
        .set('Authorization', authorization('admin'))
        .set('Idempotency-Key', key)
        .send(roundBody);
      expect(authorized.status, name).toBe(201);

      const denied = await request(app)
        .post(`/api/investments/${INVESTMENT_ID}/rounds`)
        .set('Authorization', authorization('analyst', [FUND_ID], 77))
        .set('Idempotency-Key', key)
        .send(roundBody);
      expect(denied.status, name).toBe(403);
      expect(denied.body.code).toBe('TEAM_WRITE_REQUIRED');
      expect(denied.body).not.toEqual(authorized.body);
      expect(effects.createRound).toHaveBeenCalledTimes(1);
    }
  });

  it('keeps unsupported performance-case writes at 501', async () => {
    for (const { name, app } of surfaces) {
      const response = await request(app)
        .post(`/api/investments/${INVESTMENT_ID}/cases`)
        .set('Authorization', authorization('admin'))
        .send({ name: 'Base' });

      expect(response.status, name).toBe(501);
      expect(response.body.code).toBe('UNSUPPORTED_STORAGE_OPERATION');
    }
  });
});
