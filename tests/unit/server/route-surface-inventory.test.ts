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
  | 'makeApp-only-defect';

type RouteSurfaceInventoryEntry = {
  surfaceStatus: SurfaceStatus;
  registerRoutesMount?: string;
  makeAppMount?: string;
  exposure: 'protected' | 'public-pre-auth';
  intent: string;
};

const routeSurfaceInventory = {
  'deal-pipeline': {
    surfaceStatus: 'both',
    registerRoutesMount: '/api/deals',
    makeAppMount: '/api/deals',
    exposure: 'protected',
    intent: 'Core API route available through both active app bootstrap surfaces.',
  },
  reallocation: {
    surfaceStatus: 'registerRoutes-only-defect',
    registerRoutesMount: '/api/funds/:fundId/reallocation/*',
    exposure: 'protected',
    intent:
      'Current route gap: full-path router is registerRoutes-only and must not be silently blessed before extraction.',
  },
  'api-docs': {
    surfaceStatus: 'makeApp-only-intentional',
    makeAppMount: '/api-docs',
    exposure: 'public-pre-auth',
    intent: 'Developer documentation mount that is installed before the makeApp auth boundary.',
  },
  metrics: {
    surfaceStatus: 'both',
    registerRoutesMount: '/api/metrics',
    makeAppMount: '/api/metrics',
    exposure: 'public-pre-auth',
    intent: 'Operational telemetry endpoint mounted before auth in both app surfaces.',
  },
  rum: {
    surfaceStatus: 'both',
    registerRoutesMount: '/api/rum',
    makeAppMount: '/api/rum',
    exposure: 'public-pre-auth',
    intent: 'Operational telemetry endpoint mounted before auth in both app surfaces.',
  },
} as const satisfies Record<string, RouteSurfaceInventoryEntry>;

const ENV_KEYS = [
  'NODE_ENV',
  'REQUIRE_AUTH',
  'DEFAULT_USER_ID',
  'JWT_SECRET',
  'JWT_AUDIENCE',
  'JWT_ISSUER',
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

function configureDevelopmentAuthBypass() {
  process.env.NODE_ENV = 'development';
  process.env.REQUIRE_AUTH = '0';
  process.env.DEFAULT_USER_ID = '1';
  process.env.JWT_SECRET = 'route-surface-test-secret-32-chars-min';
  process.env.JWT_AUDIENCE = 'updog-test';
  process.env.JWT_ISSUER = 'updog-test';
  process.env.SESSION_SECRET = 'route-surface-session-secret-32-chars-min';
}

async function makeAppWithDevBypass() {
  configureDevelopmentAuthBypass();
  const { makeApp } = await import('../../../server/app');
  return makeApp();
}

async function makeRegisterRoutesApp() {
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

    expect(routeSurfaceInventory.reallocation).toMatchObject({
      surfaceStatus: 'registerRoutes-only-defect',
      registerRoutesMount: '/api/funds/:fundId/reallocation/*',
      exposure: 'protected',
    });

    expect(routeSurfaceInventory['api-docs']).toMatchObject({
      surfaceStatus: 'makeApp-only-intentional',
      makeAppMount: '/api-docs',
      exposure: 'public-pre-auth',
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
    expect(appTs).not.toContain('reallocationRoutes');

    expect(appTs).toContain("app['get']('/api-docs'");
    expect(routesTs).not.toContain('/api-docs');
    expect(serverTs).not.toContain('/api-docs');
  });

  it('keeps public telemetry and docs out of the protected API allowlist', () => {
    expect(isPublicApiPath('GET', '/deals/opportunities')).toBe(false);
    expect(isPublicApiPath('POST', '/funds/1/reallocation/preview')).toBe(false);
    expect(isPublicApiPath('GET', '/metrics')).toBe(false);
    expect(isPublicApiPath('POST', '/rum')).toBe(false);
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

    const makeApp = await makeAppWithDevBypass();
    const makeAppResponse = await request(makeApp).get('/api/deals/opportunities?limit=abc');
    expect(makeAppResponse.status).toBe(400);
    expect(makeAppResponse.body).toMatchObject({
      error: 'validation_error',
    });
  }, 30_000);

  it('keeps reallocation on registerRoutes only', async () => {
    const { app: registerRoutesApp, server } = await makeRegisterRoutesApp();
    servers.push(server);

    const registerRoutesResponse = await request(registerRoutesApp)
      .post('/api/funds/not-a-number/reallocation/preview')
      .send({});
    expect(registerRoutesResponse.status).toBe(400);
    expect(registerRoutesResponse.body).toMatchObject({
      error: 'Invalid fund ID',
    });

    const makeApp = await makeAppWithDevBypass();
    const makeAppResponse = await request(makeApp)
      .post('/api/funds/not-a-number/reallocation/preview')
      .send({});
    expect(makeAppResponse.status).toBe(404);
    expect(makeAppResponse.body).toEqual({
      error: 'not_found',
    });
  }, 30_000);

  it('keeps api docs on makeApp only', async () => {
    const makeApp = await makeAppWithDevBypass();
    const makeAppResponse = await request(makeApp).get('/api-docs');
    expect(makeAppResponse.status).toBe(200);
    expect(makeAppResponse.type).toMatch(/html/);

    const { app: registerRoutesApp, server } = await makeRegisterRoutesApp();
    servers.push(server);

    const registerRoutesResponse = await request(registerRoutesApp).get('/api-docs');
    expect(registerRoutesResponse.status).toBe(404);
  }, 30_000);
});
