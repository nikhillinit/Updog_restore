import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import path from 'node:path';

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isPublicApiPath } from '../../../server/lib/public-api-boundary';

const { mockRegisterCompletionHandlers, mockAutomationStart } = vi.hoisted(() => ({
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

type SurfaceStatus =
  | 'both'
  | 'registerRoutes-only-intentional'
  | 'registerRoutes-only-defect'
  | 'makeApp-only-intentional'
  | 'makeApp-and-createServer-intentional'
  | 'makeApp-only-defect';

type RouteSurface = 'registerRoutes' | 'makeApp' | 'createServer';
type AuthPosture = 'protected' | 'public-pre-auth';
type HttpMethod = 'DELETE' | 'GET' | 'POST' | 'PUT';

type RouteSurfaceEndpoint = {
  method: HttpMethod;
  path: string;
  mountSurfaces: readonly RouteSurface[];
  authPosture: AuthPosture;
  aliasOf?: string;
};

type ExternalOwnership = {
  owner: string;
  consumers: readonly string[];
  evidenceFiles: readonly string[];
};

type RouteSurfaceInventoryEntry = {
  surfaceStatus: SurfaceStatus;
  registerRoutesMount?: string;
  makeAppMount?: string;
  createServerMount?: string;
  exposure: AuthPosture;
  endpoints: readonly RouteSurfaceEndpoint[];
  externalOwnership?: ExternalOwnership;
  intent: string;
};

const routeSurfaceInventory = {
  'deal-pipeline': {
    surfaceStatus: 'both',
    registerRoutesMount: '/api/deals',
    makeAppMount: '/api/deals',
    exposure: 'protected',
    endpoints: [
      {
        method: 'GET',
        path: '/api/deals/opportunities',
        mountSurfaces: ['registerRoutes', 'makeApp'],
        authPosture: 'protected',
      },
      {
        method: 'POST',
        path: '/api/deals/opportunities',
        mountSurfaces: ['registerRoutes', 'makeApp'],
        authPosture: 'protected',
      },
      {
        method: 'PUT',
        path: '/api/deals/opportunities/:id',
        mountSurfaces: ['registerRoutes', 'makeApp'],
        authPosture: 'protected',
      },
      {
        method: 'DELETE',
        path: '/api/deals/opportunities/:id',
        mountSurfaces: ['registerRoutes', 'makeApp'],
        authPosture: 'protected',
      },
      {
        method: 'POST',
        path: '/api/deals/:id/stage',
        mountSurfaces: ['registerRoutes', 'makeApp'],
        authPosture: 'protected',
      },
    ],
    intent: 'Core API route available through both active app bootstrap surfaces.',
  },
  reallocation: {
    surfaceStatus: 'both',
    registerRoutesMount: '/api/funds/:fundId/reallocation/*',
    makeAppMount: '/api/funds/:fundId/reallocation/*',
    exposure: 'protected',
    endpoints: [
      {
        method: 'POST',
        path: '/api/funds/:fundId/reallocation/preview',
        mountSurfaces: ['registerRoutes', 'makeApp'],
        authPosture: 'protected',
      },
      {
        method: 'POST',
        path: '/api/funds/:fundId/reallocation/commit',
        mountSurfaces: ['registerRoutes', 'makeApp'],
        authPosture: 'protected',
      },
    ],
    intent:
      'Fund-scoped reallocation router (preview + commit) mounted on both active bootstrap surfaces; guarded by parseFundIdParam + enforceProvidedFundScope.',
  },
  'api-docs': {
    surfaceStatus: 'makeApp-only-intentional',
    makeAppMount: '/api-docs',
    exposure: 'public-pre-auth',
    endpoints: [
      {
        method: 'GET',
        path: '/api-docs',
        mountSurfaces: ['makeApp'],
        authPosture: 'public-pre-auth',
      },
      {
        method: 'GET',
        path: '/api-docs.json',
        mountSurfaces: ['makeApp'],
        authPosture: 'public-pre-auth',
      },
    ],
    intent: 'Developer documentation mount that is installed before the makeApp auth boundary.',
  },
  health: {
    surfaceStatus: 'makeApp-only-intentional',
    makeAppMount: '/',
    exposure: 'public-pre-auth',
    endpoints: [
      {
        method: 'GET',
        path: '/healthz',
        mountSurfaces: ['makeApp'],
        authPosture: 'public-pre-auth',
      },
      {
        method: 'GET',
        path: '/readyz',
        mountSurfaces: ['makeApp'],
        authPosture: 'public-pre-auth',
      },
      {
        method: 'GET',
        path: '/health',
        mountSurfaces: ['makeApp'],
        authPosture: 'public-pre-auth',
      },
      {
        method: 'GET',
        path: '/api/health',
        mountSurfaces: ['makeApp'],
        authPosture: 'public-pre-auth',
      },
      {
        method: 'GET',
        path: '/api/health/ready',
        mountSurfaces: ['makeApp'],
        authPosture: 'public-pre-auth',
      },
      {
        method: 'GET',
        path: '/api/health/live',
        mountSurfaces: ['makeApp'],
        authPosture: 'public-pre-auth',
      },
      {
        method: 'GET',
        path: '/health/detailed-json',
        mountSurfaces: ['makeApp'],
        authPosture: 'public-pre-auth',
      },
      {
        method: 'GET',
        path: '/health/inflight',
        mountSurfaces: ['makeApp'],
        authPosture: 'public-pre-auth',
      },
      {
        method: 'GET',
        path: '/api/health/db',
        mountSurfaces: ['makeApp'],
        authPosture: 'public-pre-auth',
      },
      {
        method: 'GET',
        path: '/api/health/cache',
        mountSurfaces: ['makeApp'],
        authPosture: 'public-pre-auth',
      },
      {
        method: 'GET',
        path: '/api/health/queues',
        mountSurfaces: ['makeApp'],
        authPosture: 'public-pre-auth',
      },
    ],
    intent:
      'Health probes are mounted before the makeApp auth boundary for platform readiness checks.',
  },
  metrics: {
    surfaceStatus: 'both',
    registerRoutesMount: '/metrics',
    makeAppMount: '/metrics + /api/metrics',
    createServerMount: '/metrics + /api/metrics',
    exposure: 'public-pre-auth',
    endpoints: [
      {
        method: 'GET',
        path: '/metrics',
        mountSurfaces: ['registerRoutes', 'makeApp', 'createServer'],
        authPosture: 'public-pre-auth',
      },
      {
        method: 'GET',
        path: '/api/metrics',
        mountSurfaces: ['makeApp', 'createServer'],
        authPosture: 'public-pre-auth',
        aliasOf: '/metrics',
      },
    ],
    externalOwnership: {
      owner: 'Platform observability',
      consumers: ['Prometheus scrapers', 'Grafana and alerting runbooks'],
      evidenceFiles: ['docs/observability.md'],
    },
    intent:
      'Operational telemetry endpoint mounted before auth; /api/metrics is a compatibility alias for serverless/API-base consumers.',
  },
  rum: {
    surfaceStatus: 'makeApp-and-createServer-intentional',
    makeAppMount: '/metrics/rum + /api/metrics/rum',
    createServerMount: '/metrics/rum + /api/metrics/rum',
    exposure: 'public-pre-auth',
    endpoints: [
      {
        method: 'POST',
        path: '/metrics/rum',
        mountSurfaces: ['makeApp', 'createServer'],
        authPosture: 'public-pre-auth',
      },
      {
        method: 'POST',
        path: '/api/metrics/rum',
        mountSurfaces: ['makeApp', 'createServer'],
        authPosture: 'public-pre-auth',
        aliasOf: '/metrics/rum',
      },
      {
        method: 'GET',
        path: '/metrics/rum',
        mountSurfaces: ['makeApp', 'createServer'],
        authPosture: 'public-pre-auth',
      },
      {
        method: 'GET',
        path: '/api/metrics/rum',
        mountSurfaces: ['makeApp', 'createServer'],
        authPosture: 'public-pre-auth',
        aliasOf: '/metrics/rum',
      },
      {
        method: 'GET',
        path: '/metrics/rum/health',
        mountSurfaces: ['makeApp', 'createServer'],
        authPosture: 'public-pre-auth',
      },
      {
        method: 'GET',
        path: '/api/metrics/rum/health',
        mountSurfaces: ['makeApp', 'createServer'],
        authPosture: 'public-pre-auth',
        aliasOf: '/metrics/rum/health',
      },
    ],
    externalOwnership: {
      owner: 'Frontend performance observability',
      consumers: [
        'Browser Web Vitals beacons',
        'Synthetic RUM health checks',
        'Prometheus RUM scrape',
      ],
      evidenceFiles: ['client/src/vitals.ts', 'docs/observability/rum.md'],
    },
    intent:
      'Browser telemetry ingress and RUM scrape endpoints are intentionally public before auth with /api aliases for API-base clients.',
  },
} as const satisfies Record<string, RouteSurfaceInventoryEntry>;

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

async function makeAppWithTestAuth() {
  configureTestAuthEnv();
  const { makeApp } = await import('../../../server/app');
  return makeApp();
}

async function authorizationHeader() {
  const { signToken } = await import('../../../server/lib/auth/jwt');
  return `Bearer ${signToken({
    sub: '1',
    email: 'route-surface-test@example.com',
    role: 'admin',
    fundIds: [],
  })}`;
}

// A fund-scoped bearer (non-empty fundIds restricts the caller to those funds).
// Empty fundIds in authorizationHeader() above means unrestricted/admin.
async function scopedAuthorizationHeader(fundIds: number[], role = 'user') {
  const { signToken } = await import('../../../server/lib/auth/jwt');
  return `Bearer ${signToken({
    sub: '1',
    email: 'route-surface-scoped@example.com',
    role,
    fundIds,
  })}`;
}

async function makeRegisterRoutesApp() {
  configureTestAuthEnv();
  const app = express();
  app.set('trust proxy', false);
  app.use(express.json({ limit: '1mb' }));

  const { registerRoutes } = await import('../../../server/routes');
  const server = await registerRoutes(app);

  return { app, server };
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }

    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function readRepoFile(relativePath: string) {
  return readFile(path.join(process.cwd(), relativePath), 'utf8');
}

function expectFragmentBefore(source: string, earlier: string, later: string) {
  const earlierIndex = source.indexOf(earlier);
  const laterIndex = source.indexOf(later);

  expect(earlierIndex).toBeGreaterThanOrEqual(0);
  expect(laterIndex).toBeGreaterThanOrEqual(0);
  expect(earlierIndex).toBeLessThan(laterIndex);
}

describe('route surface inventory', () => {
  const servers: Server[] = [];

  beforeEach(() => {
    saveEnv();
    vi.resetModules();
    mockRegisterCompletionHandlers.mockClear();
    mockAutomationStart.mockClear();
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => closeServer(server)));
    restoreEnv();
    vi.restoreAllMocks();
  });

  it('classifies current special-case mounts before service extraction begins', () => {
    expect(routeSurfaceInventory['deal-pipeline']).toMatchObject({
      surfaceStatus: 'both',
      registerRoutesMount: '/api/deals',
      makeAppMount: '/api/deals',
      exposure: 'protected',
    });
    expect(routeSurfaceInventory['deal-pipeline'].endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'POST',
          path: '/api/deals/opportunities',
          mountSurfaces: ['registerRoutes', 'makeApp'],
          authPosture: 'protected',
        }),
        expect.objectContaining({
          method: 'POST',
          path: '/api/deals/:id/stage',
          mountSurfaces: ['registerRoutes', 'makeApp'],
          authPosture: 'protected',
        }),
      ])
    );

    expect(routeSurfaceInventory.reallocation).toMatchObject({
      surfaceStatus: 'both',
      registerRoutesMount: '/api/funds/:fundId/reallocation/*',
      makeAppMount: '/api/funds/:fundId/reallocation/*',
      exposure: 'protected',
    });

    expect(routeSurfaceInventory['api-docs']).toMatchObject({
      surfaceStatus: 'makeApp-only-intentional',
      makeAppMount: '/api-docs',
      exposure: 'public-pre-auth',
    });

    expect(routeSurfaceInventory.health.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'GET',
          path: '/healthz',
          authPosture: 'public-pre-auth',
        }),
        expect.objectContaining({
          method: 'GET',
          path: '/api/health/ready',
          authPosture: 'public-pre-auth',
        }),
      ])
    );
  });

  it('pins public telemetry aliases to owners, consumers, and auth posture', () => {
    expect(routeSurfaceInventory.metrics.endpoints).toEqual(
      expect.arrayContaining([
        {
          method: 'GET',
          path: '/metrics',
          mountSurfaces: ['registerRoutes', 'makeApp', 'createServer'],
          authPosture: 'public-pre-auth',
        },
        {
          method: 'GET',
          path: '/api/metrics',
          mountSurfaces: ['makeApp', 'createServer'],
          authPosture: 'public-pre-auth',
          aliasOf: '/metrics',
        },
      ])
    );
    expect(routeSurfaceInventory.metrics.externalOwnership).toMatchObject({
      owner: 'Platform observability',
      consumers: ['Prometheus scrapers', 'Grafana and alerting runbooks'],
    });

    expect(routeSurfaceInventory.rum.endpoints).toEqual(
      expect.arrayContaining([
        {
          method: 'POST',
          path: '/metrics/rum',
          mountSurfaces: ['makeApp', 'createServer'],
          authPosture: 'public-pre-auth',
        },
        {
          method: 'POST',
          path: '/api/metrics/rum',
          mountSurfaces: ['makeApp', 'createServer'],
          authPosture: 'public-pre-auth',
          aliasOf: '/metrics/rum',
        },
        {
          method: 'GET',
          path: '/api/metrics/rum/health',
          mountSurfaces: ['makeApp', 'createServer'],
          authPosture: 'public-pre-auth',
          aliasOf: '/metrics/rum/health',
        },
      ])
    );
    expect(routeSurfaceInventory.rum.externalOwnership).toMatchObject({
      owner: 'Frontend performance observability',
      consumers: [
        'Browser Web Vitals beacons',
        'Synthetic RUM health checks',
        'Prometheus RUM scrape',
      ],
    });
  });

  it('matches the inventory to the active route source files', async () => {
    const [routesTs, appTs, serverTs] = await Promise.all([
      readRepoFile('server/routes.ts'),
      readRepoFile('server/app.ts'),
      readRepoFile('server/server.ts'),
    ]);

    expect(routesTs).toContain("app.use('/api/deals', dealPipelineRoutes.dealPipelineRouter)");
    expect(appTs).toContain("app.use('/api/deals', dealPipelineRouter)");

    expect(routesTs).toContain('app.use(reallocationRoutes.default)');
    expect(appTs).toContain('app.use(reallocationRouter)');

    expect(appTs).toContain("app['get']('/api-docs'");
    expect(routesTs).not.toContain('/api-docs');
    expect(serverTs).not.toContain('/api-docs');
  });

  it('matches telemetry alias inventory to source files and consumer evidence', async () => {
    const [
      routesTs,
      appTs,
      serverTs,
      metricsEndpointTs,
      rumTs,
      rumIngressTs,
      vitalsTs,
      observabilityDoc,
      rumDoc,
    ] = await Promise.all([
      readRepoFile('server/routes.ts'),
      readRepoFile('server/app.ts'),
      readRepoFile('server/server.ts'),
      readRepoFile('server/routes/metrics-endpoint.ts'),
      readRepoFile('server/routes/metrics-rum.ts'),
      readRepoFile('server/routes/metrics-rum-ingress.ts'),
      readRepoFile('client/src/vitals.ts'),
      readRepoFile('docs/observability.md'),
      readRepoFile('docs/observability/rum.md'),
    ]);

    expect(routesTs).toContain('app.use(metricsRouter)');
    expect(routesTs).not.toContain('metricsRumRouter');
    expect(metricsEndpointTs).toContain("metricsRouter['get']('/metrics'");

    for (const source of [appTs, serverTs]) {
      expect(source).toContain("app.use('/metrics', metricsRouter)");
      expect(source).toContain("app.use('/api', metricsRouter)");
      expect(source).toContain('installRumIngressGuards(app)');
      expect(source).toContain('app.use(metricsRumRouter)');
      expect(source).toContain("app.use('/api', metricsRumRouter)");
    }

    expect(rumIngressTs).toContain("['/metrics/rum', '/api/metrics/rum']");
    expect(rumTs).toContain("'/metrics/rum'");
    expect(rumTs).toContain("metricsRumRouter['get']('/metrics/rum'");
    expect(rumTs).toContain("metricsRumRouter['get']('/metrics/rum/health'");
    expect(vitalsTs).toContain("withApiBase('/api/metrics/rum')");

    expect(observabilityDoc).toContain('| `/metrics` | Prometheus metrics |');
    expect(rumDoc).toContain('# Real User Monitoring (RUM)');
  });

  it('keeps public telemetry and docs out of the protected API allowlist', () => {
    expect(isPublicApiPath('GET', '/deals/opportunities')).toBe(false);
    expect(isPublicApiPath('POST', '/funds/1/reallocation/preview')).toBe(false);
    expect(isPublicApiPath('GET', '/metrics')).toBe(false);
    expect(isPublicApiPath('POST', '/metrics/rum')).toBe(false);
    expect(isPublicApiPath('GET', '/api-docs')).toBe(false);
  });

  it('pins telemetry and docs publicness to pre-auth mount order', async () => {
    const [appTs, serverTs] = await Promise.all([
      readRepoFile('server/app.ts'),
      readRepoFile('server/server.ts'),
    ]);

    const makeAppAuthBoundary = 'const requireApiAuth = requireAuth();';
    expectFragmentBefore(appTs, "app['get']('/api-docs'", makeAppAuthBoundary);
    expectFragmentBefore(appTs, "app['get']('/api-docs.json'", makeAppAuthBoundary);
    expectFragmentBefore(appTs, "app.use('/metrics', metricsRouter)", makeAppAuthBoundary);
    expectFragmentBefore(appTs, "app.use('/api', metricsRouter)", makeAppAuthBoundary);
    expectFragmentBefore(appTs, 'app.use(metricsRumRouter)', makeAppAuthBoundary);
    expectFragmentBefore(appTs, "app.use('/api', metricsRumRouter)", makeAppAuthBoundary);

    const createServerAuthBoundary =
      '// Apply authentication and RLS middleware to protected routes';
    expectFragmentBefore(serverTs, "app.use('/metrics', metricsRouter)", createServerAuthBoundary);
    expectFragmentBefore(serverTs, "app.use('/api', metricsRouter)", createServerAuthBoundary);
    expectFragmentBefore(serverTs, 'app.use(metricsRumRouter)', createServerAuthBoundary);
    expectFragmentBefore(serverTs, "app.use('/api', metricsRumRouter)", createServerAuthBoundary);
  });

  it('exposes deal pipeline through both registerRoutes and makeApp', async () => {
    const { app: registerRoutesApp, server } = await makeRegisterRoutesApp();
    servers.push(server);

    const registerRoutesResponse = await request(registerRoutesApp).get(
      '/api/deals/opportunities?limit=abc'
    );
    expect(registerRoutesResponse.status).toBe(400);
    expect(registerRoutesResponse.body).toMatchObject({
      error: 'validation_error',
    });

    const makeApp = await makeAppWithTestAuth();
    const makeAppResponse = await request(makeApp)
      .get('/api/deals/opportunities?limit=abc')
      .set('Authorization', await authorizationHeader());
    expect(makeAppResponse.status).toBe(400);
    expect(makeAppResponse.body).toMatchObject({
      error: 'validation_error',
    });
  }, 30_000);

  it('exposes reallocation through both registerRoutes and makeApp', async () => {
    const { app: registerRoutesApp, server } = await makeRegisterRoutesApp();
    servers.push(server);

    const registerRoutesResponse = await request(registerRoutesApp)
      .post('/api/funds/not-a-number/reallocation/preview')
      .send({});
    expect(registerRoutesResponse.status).toBe(400);
    expect(registerRoutesResponse.body).toMatchObject({
      error: 'Invalid fund ID',
    });

    // After mounting on makeApp, a non-numeric fundId reaches the reallocation
    // handler and returns its own 400 (NOT the makeApp catch-all 404). This
    // 400-vs-404 distinction is a DB-free proof that the router is mounted.
    const makeApp = await makeAppWithTestAuth();
    const makeAppResponse = await request(makeApp)
      .post('/api/funds/not-a-number/reallocation/preview')
      .set('Authorization', await authorizationHeader())
      .send({});
    expect(makeAppResponse.status).toBe(400);
    expect(makeAppResponse.body).toMatchObject({
      error: 'Invalid fund ID',
    });
  }, 30_000);

  it('keeps api docs on makeApp only', async () => {
    const makeApp = await makeAppWithTestAuth();
    const makeAppResponse = await request(makeApp).get('/api-docs');
    expect(makeAppResponse.status).toBe(200);
    expect(makeAppResponse.type).toMatch(/html/);

    const { app: registerRoutesApp, server } = await makeRegisterRoutesApp();
    servers.push(server);

    const registerRoutesResponse = await request(registerRoutesApp).get('/api-docs');
    expect(registerRoutesResponse.status).toBe(404);
  }, 30_000);

  // ==========================================================================
  // Wrong-fund-403 gate (Tranche A Slice 7)
  //
  // The per-route unit contracts (Slices 0-5) mock the fund-scope guard. These
  // tests prove the guards actually DENY a cross-fund request on the real booted
  // surfaces with a real scoped token. The set is REPRESENTATIVE, not exhaustive:
  // allocation-scenarios exercises the makeApp router.param guard and the full
  // scoped/own-fund/unrestricted discriminator; monte-carlo exercises the inline
  // enforceProvidedFundScope guard on the registerRoutes surface. Derived-fund
  // routes (companyId/jobId -> fund) are intentionally excluded here: their deny
  // depends on memory-storage seed data and they are already covered by their
  // own unit contracts.
  // ==========================================================================

  it('denies a scoped token cross-fund, allows its own fund, and allows an unrestricted token', async () => {
    const makeApp = await makeAppWithTestAuth();

    // Scoped to fund 1, requesting fund 2 -> fund-scope denial before any service.
    const crossFund = await request(makeApp)
      .get('/api/funds/2/allocation-scenarios')
      .set('Authorization', await scopedAuthorizationHeader([1]));
    expect(crossFund.status).toBe(403);
    expect(crossFund.body).toMatchObject({ code: 'FUND_ACCESS_DENIED' });

    // Scoped to fund 1, requesting fund 1 -> guard passes. Status may vary on
    // memory storage (200/4xx/5xx) but it is never a fund denial.
    const ownFund = await request(makeApp)
      .get('/api/funds/1/allocation-scenarios')
      .set('Authorization', await scopedAuthorizationHeader([1]));
    expect(ownFund.status).not.toBe(403);

    // Unrestricted token (empty fundIds) -> guard passes for any fund.
    const unrestricted = await request(makeApp)
      .get('/api/funds/2/allocation-scenarios')
      .set('Authorization', await authorizationHeader());
    expect(unrestricted.status).not.toBe(403);
  }, 30_000);

  it('denies a scoped token cross-fund on reallocation (makeApp surface)', async () => {
    const makeApp = await makeAppWithTestAuth();

    // Scoped to fund 1, POSTing to fund 2 -> fund-scope denial before body parse.
    const crossFund = await request(makeApp)
      .post('/api/funds/2/reallocation/preview')
      .set('Authorization', await scopedAuthorizationHeader([1]))
      .send({
        current_version: 1,
        proposed_allocations: [{ company_id: 1, planned_reserves_cents: 0 }],
      });
    expect(crossFund.status).toBe(403);
    expect(crossFund.body).toMatchObject({ code: 'FUND_ACCESS_DENIED' });
  }, 30_000);

  it('denies a scoped token cross-fund on the registerRoutes surface', async () => {
    const { app: registerRoutesApp, server } = await makeRegisterRoutesApp();
    servers.push(server);

    const crossFund = await request(registerRoutesApp)
      .get('/api/monte-carlo/funds/2/simulate')
      .set('Authorization', await scopedAuthorizationHeader([1]));
    expect(crossFund.status).toBe(403);
    expect(crossFund.body).toMatchObject({ code: 'FUND_ACCESS_DENIED' });
  }, 30_000);

  it('keeps not-fund-scoped routes open to any authenticated caller', async () => {
    const makeApp = await makeAppWithTestAuth();

    const scopedScenarios = await request(makeApp)
      .get('/api/backtesting/scenarios')
      .set('Authorization', await scopedAuthorizationHeader([1]));
    expect(scopedScenarios.status).toBe(200);
    expect(scopedScenarios.body).toMatchObject({ scenarios: expect.any(Array) });
  }, 30_000);
});
