import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import request from 'supertest';

const AUTH_MODULE = '../../../server/lib/auth/jwt';
const SERVICE_MODULE = '../../../server/services/fund-actuals/fund-company-actuals-facts-service';
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

const {
  buildFundCompanyActualsFactsMock,
  authCalls,
  accessCalls,
  accessMode,
  mockRegisterCompletionHandlers,
  mockAutomationStart,
} = vi.hoisted(() => ({
    buildFundCompanyActualsFactsMock: vi.fn(),
    authCalls: [] as string[],
    accessCalls: [] as string[],
    accessMode: { value: 'allow' as 'allow' | 'deny' },
    mockRegisterCompletionHandlers: vi.fn(),
    mockAutomationStart: vi.fn(),
  }));

vi.mock('../../../server/services/calc-run-completion-handlers.js', () => ({
  registerCompletionHandlers: mockRegisterCompletionHandlers,
}));

vi.mock('../../../server/services/variance-alert-automation.js', () => ({
  varianceAlertAutomationService: {
    start: mockAutomationStart,
  },
}));

const originalEnv = new Map<string, string | undefined>();

const responseHash = 'a'.repeat(64);

class MockFundActualsFactsServiceError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'FundActualsFactsServiceError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function installRouteMocks() {
  vi.doMock(AUTH_MODULE, () => ({
    requireAuth:
      () => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
        authCalls.push(req.path);
        req.user = {
          id: 'user-1',
          sub: 'user-1',
          email: 'user@example.com',
          role: 'admin',
          roles: ['admin'],
          fundIds: [],
        } as never;
        next();
      },
    requireFundAccess: (req: express.Request, res: express.Response, next: express.NextFunction) => {
      accessCalls.push(req.params['fundId'] ?? '');
      if (accessMode.value === 'deny') {
        return res.status(403).json({ error: 'forbidden' });
      }
      return next();
    },
  }));

  vi.doMock(SERVICE_MODULE, () => {
    return {
      buildFundCompanyActualsFacts: buildFundCompanyActualsFactsMock,
      FundActualsFactsServiceError: MockFundActualsFactsServiceError,
    };
  });
}

function saveEnv() {
  for (const key of ENV_KEYS) {
    originalEnv.set(key, process.env[key]);
  }
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  originalEnv.clear();
}

function configureTestAuthEnv() {
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
  process.env.REQUIRE_AUTH = '0';
  process.env.DEFAULT_USER_ID = '1';
  process.env.JWT_ALG = 'HS256';
  process.env._EXPLICIT_JWT_ALG = 'HS256';
  process.env.JWT_SECRET = 'route-surface-test-secret-32-chars-min';
  process.env._EXPLICIT_JWT_SECRET = process.env.JWT_SECRET;
  process.env.JWT_AUDIENCE = 'updog-test';
  process.env._EXPLICIT_JWT_AUDIENCE = process.env.JWT_AUDIENCE;
  process.env.JWT_ISSUER = 'updog-test';
  process.env._EXPLICIT_JWT_ISSUER = process.env.JWT_ISSUER;
  delete process.env.JWT_JWKS_URL;
  delete process.env._EXPLICIT_JWT_JWKS_URL;
  process.env.SESSION_SECRET = 'route-surface-session-secret-32-chars-min';
}

async function authorizationHeader() {
  const { signToken } = await import('../../../server/lib/auth/jwt');
  return `Bearer ${signToken({
    sub: '1',
    email: 'actuals-surface-test@example.com',
    role: 'admin',
    fundIds: [],
  })}`;
}

function factsPayload(asOfDate = '2026-07-06') {
  return {
    fundId: 12,
    asOfDate,
    facts: [],
    inputHash: responseHash,
    generatedAt: `${asOfDate}T12:00:00.000Z`,
  };
}

async function makeRouteApp() {
  installRouteMocks();
  const { default: fundActualsRouter } = await import('../../../server/routes/fund-actuals');
  const app = express();
  app.use(express.json());
  app.use('/api', fundActualsRouter);
  return app;
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }

    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe('fund actuals facts route', () => {
  beforeEach(() => {
    saveEnv();
    vi.resetModules();
    vi.clearAllMocks();
    authCalls.length = 0;
    accessCalls.length = 0;
    accessMode.value = 'allow';
    buildFundCompanyActualsFactsMock.mockResolvedValue(factsPayload());
  });

  afterEach(() => {
    vi.doUnmock(AUTH_MODULE);
    vi.doUnmock(SERVICE_MODULE);
    restoreEnv();
  });

  it('returns the actuals facts for an authorized fund request', async () => {
    const response = await request(await makeRouteApp())
      .get('/api/funds/12/actuals/facts')
      .expect(200);

    expect(response.headers['cache-control']).toBe('private, max-age=60');
    expect(response.body).toEqual(factsPayload());
    expect(authCalls).toEqual(['/funds/12/actuals/facts']);
    expect(accessCalls).toEqual(['12']);
    expect(buildFundCompanyActualsFactsMock).toHaveBeenCalledWith({
      fundId: 12,
      asOfDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it('forwards explicit asOfDate to the service', async () => {
    buildFundCompanyActualsFactsMock.mockResolvedValue(factsPayload('2026-07-01'));

    const response = await request(await makeRouteApp())
      .get('/api/funds/12/actuals/facts?asOfDate=2026-07-01')
      .expect(200);

    expect(response.body.asOfDate).toBe('2026-07-01');
    expect(buildFundCompanyActualsFactsMock).toHaveBeenCalledWith({
      fundId: 12,
      asOfDate: '2026-07-01',
    });
  });

  it('rejects non-numeric fund ids before fund access checks and service calls', async () => {
    const response = await request(await makeRouteApp())
      .get('/api/funds/abc/actuals/facts')
      .expect(400);

    expect(response.body).toMatchObject({
      error: 'Invalid parameter',
    });
    expect(accessCalls).toEqual([]);
    expect(buildFundCompanyActualsFactsMock).not.toHaveBeenCalled();
  });

  it('rejects invalid asOfDate query values before service calls', async () => {
    const response = await request(await makeRouteApp())
      .get('/api/funds/12/actuals/facts?asOfDate=not-a-date')
      .expect(400);

    expect(response.body).toMatchObject({
      error: 'invalid_actuals_facts_query',
      message: 'Invalid actuals facts query',
    });
    expect(accessCalls).toEqual(['12']);
    expect(buildFundCompanyActualsFactsMock).not.toHaveBeenCalled();
  });

  it('does not call the service when fund access is denied', async () => {
    accessMode.value = 'deny';

    const response = await request(await makeRouteApp())
      .get('/api/funds/12/actuals/facts')
      .expect(403);

    expect(response.body).toEqual({ error: 'forbidden' });
    expect(buildFundCompanyActualsFactsMock).not.toHaveBeenCalled();
  });

  it('maps service not-found errors to 404', async () => {
    buildFundCompanyActualsFactsMock.mockRejectedValue(
      new MockFundActualsFactsServiceError(404, 'fund_not_found', 'Fund 99 was not found', {
        fundId: 99,
      })
    );

    const response = await request(await makeRouteApp())
      .get('/api/funds/99/actuals/facts')
      .expect(404);

    expect(response.body).toEqual({
      error: 'fund_not_found',
      message: 'Fund 99 was not found',
      details: { fundId: 99 },
    });
  });

  it('keeps the actuals facts route mounted on the production makeApp API surface', async () => {
    vi.doUnmock(AUTH_MODULE);
    vi.doUnmock(SERVICE_MODULE);
    vi.resetModules();
    configureTestAuthEnv();
    const { makeApp } = await import('../../../server/app');

    const response = await request(makeApp())
      .get('/api/funds/abc/actuals/facts')
      .set('Authorization', await authorizationHeader())
      .expect(400);

    expect(response.body).toMatchObject({
      error: 'Invalid parameter',
    });
    expect(buildFundCompanyActualsFactsMock).not.toHaveBeenCalled();
  }, 30_000);

  it('keeps the actuals facts route mounted on the registerRoutes API surface', async () => {
    vi.doUnmock(AUTH_MODULE);
    vi.doUnmock(SERVICE_MODULE);
    vi.resetModules();
    configureTestAuthEnv();

    const app = express();
    app.set('trust proxy', false);
    app.use(express.json({ limit: '1mb' }));
    const { registerRoutes } = await import('../../../server/routes');
    const server = await registerRoutes(app);

    try {
      const response = await request(app)
        .get('/api/funds/abc/actuals/facts')
        .set('Authorization', await authorizationHeader())
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Invalid parameter',
      });
    } finally {
      await closeServer(server);
    }
  }, 30_000);
});
