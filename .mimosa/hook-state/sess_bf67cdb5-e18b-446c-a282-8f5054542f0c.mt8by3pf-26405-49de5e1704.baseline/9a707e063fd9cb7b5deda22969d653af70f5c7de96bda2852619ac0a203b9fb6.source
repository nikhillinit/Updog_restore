/**
 * Issue #1300: the KPI collection routes must answer identically on both fully
 * composed server surfaces -- `makeApp()` and `registerRoutes()` -- because they
 * are mounted through the common route triad rather than one entrypoint.
 */
import express from 'express';
import type { Express } from 'express';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const kpiService = vi.hoisted(() => ({
  createKpiObservation: vi.fn(),
  listKpiObservations: vi.fn(),
  loadKpiObservation: vi.fn(),
  reviewKpiObservation: vi.fn(),
}));

vi.mock('../../../server/services/kpi/kpi-observation-service', async () => {
  const actual = await vi.importActual<
    typeof import('../../../server/services/kpi/kpi-observation-service')
  >('../../../server/services/kpi/kpi-observation-service');
  return {
    ...actual,
    createKpiObservation: kpiService.createKpiObservation,
    listKpiObservations: kpiService.listKpiObservations,
    loadKpiObservation: kpiService.loadKpiObservation,
    reviewKpiObservation: kpiService.reviewKpiObservation,
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

const OBSERVATION = {
  contractVersion: 'kpi-observation/1.0.0' as const,
  observationId: 9,
  fundId: 1,
  portfolioCompanyId: 4,
  metric: 'revenue_arr' as const,
  periodStart: '2026-04-01',
  periodEnd: '2026-06-30',
  basis: 'actual' as const,
  value: { valueKind: 'money' as const, amountUsd: '2100000.000000' },
  companyKpiLabel: null,
  source: 'manual' as const,
  sourceLabel: null,
  comment: null,
  submittedAt: '2026-07-05T09:00:00.000Z',
  reviewStatus: 'pending' as const,
  reviewComment: null,
  reviewedAt: null,
  version: 1,
  createdAt: '2026-07-06T00:00:00.000Z',
  updatedAt: '2026-07-06T00:00:00.000Z',
};

const CREATE_BODY = {
  portfolioCompanyId: 4,
  metric: 'revenue_arr',
  periodStart: '2026-04-01',
  periodEnd: '2026-06-30',
  basis: 'actual',
  value: { valueKind: 'money', amountUsd: '2100000.000000' },
  submittedAt: '2026-07-05T09:00:00.000Z',
};

type Surface = { name: 'makeApp' | 'registerRoutes'; app: Express };
let surfaces: readonly Surface[] = [];
let registerRoutesServer: Server | undefined;

function configureEnvironment() {
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
  process.env.SESSION_SECRET = 'kpi-observations-dual-runtime-secret-32';
}

async function authorizationHeader(
  fundIds: readonly number[] = [1],
  role = 'admin'
): Promise<string> {
  const { signToken } = await import('../../../server/lib/auth/jwt');
  return `Bearer ${signToken({
    sub: '9',
    email: 'kpi-collection@example.com',
    role,
    fundIds,
  })}`;
}

async function closeServer(server: Server | undefined) {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

beforeAll(async () => {
  for (const key of ENV_KEYS) originalEnv.set(key, process.env[key]);
  configureEnvironment();
  vi.resetModules();

  const { makeApp } = await import('../../../server/app');
  const registerRoutesApp = express();
  registerRoutesApp.set('trust proxy', false);
  registerRoutesApp.use(express.json({ limit: '1mb' }));
  const { requireSecureContext } = await import('../../../server/lib/secure-context');
  registerRoutesApp.use('/api', requireSecureContext);
  const { registerRoutes } = await import('../../../server/routes');
  registerRoutesServer = await registerRoutes(registerRoutesApp);
  surfaces = [
    { name: 'makeApp', app: makeApp() },
    { name: 'registerRoutes', app: registerRoutesApp },
  ];
}, 30_000);

afterAll(async () => {
  await closeServer(registerRoutesServer);
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

beforeEach(() => {
  for (const mock of Object.values(kpiService)) mock.mockReset();
  kpiService.listKpiObservations.mockResolvedValue([OBSERVATION]);
  kpiService.loadKpiObservation.mockResolvedValue(null);
  kpiService.createKpiObservation.mockResolvedValue({
    observation: OBSERVATION,
    replayed: false,
  });
});

describe('KPI observation dual-runtime parity', () => {
  it('rejects unauthenticated reads and writes identically on both runtimes', async () => {
    const reads = await Promise.all(
      surfaces.map((surface) => request(surface.app).get('/api/funds/1/kpi-observations'))
    );
    expect(reads.map((response) => response.status)).toEqual([401, 401]);
    expect(reads[1]?.body).toEqual(reads[0]?.body);

    const writes = await Promise.all(
      surfaces.map((surface) =>
        request(surface.app)
          .post('/api/funds/1/kpi-observations')
          .set('Idempotency-Key', 'kpi-1')
          .send(CREATE_BODY)
      )
    );
    expect(writes.map((response) => response.status)).toEqual([401, 401]);
    expect(kpiService.createKpiObservation).not.toHaveBeenCalled();
  });

  it('serves the same list payload to an authorized reader on both runtimes', async () => {
    const authorization = await authorizationHeader();
    const responses = await Promise.all(
      surfaces.map((surface) =>
        request(surface.app)
          .get('/api/funds/1/kpi-observations')
          .set('Authorization', authorization)
      )
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(responses[1]?.body).toEqual(responses[0]?.body);
    expect(responses[0]?.body.data).toHaveLength(1);
  });

  it('denies an out-of-scope write identically on both runtimes', async () => {
    // `admin` and `service` principals allow any fund by design, so out-of-scope
    // denial is asserted with an ordinary `user` principal. Writes are where
    // fund scope bites: team members keep the repo-wide universal READ posture.
    const authorization = await authorizationHeader([2], 'user');
    const responses = await Promise.all(
      surfaces.map((surface) =>
        request(surface.app)
          .post('/api/funds/1/kpi-observations')
          .set('Authorization', authorization)
          .set('Idempotency-Key', 'kpi-out-of-scope')
          .send(CREATE_BODY)
      )
    );

    expect(responses.map((response) => response.status)).toEqual([403, 403]);
    expect(responses[1]?.body).toEqual(responses[0]?.body);
    expect(kpiService.createKpiObservation).not.toHaveBeenCalled();
  });

  it('requires an Idempotency-Key for creation on both runtimes', async () => {
    const authorization = await authorizationHeader();
    const responses = await Promise.all(
      surfaces.map((surface) =>
        request(surface.app)
          .post('/api/funds/1/kpi-observations')
          .set('Authorization', authorization)
          .send(CREATE_BODY)
      )
    );

    expect(responses.map((response) => response.status)).toEqual([428, 428]);
    expect(responses[1]?.body).toEqual(responses[0]?.body);
    expect(kpiService.createKpiObservation).not.toHaveBeenCalled();
  });

  it('reaches the database-backed idempotent command on both runtimes', async () => {
    const authorization = await authorizationHeader();
    const responses = await Promise.all(
      surfaces.map((surface) =>
        request(surface.app)
          .post('/api/funds/1/kpi-observations')
          .set('Authorization', authorization)
          .set('Idempotency-Key', 'kpi-dual-1')
          .send(CREATE_BODY)
      )
    );

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(responses[1]?.body).toEqual(responses[0]?.body);
    // The generic in-memory idempotency middleware must not shadow the
    // database-backed command: both surfaces call the service.
    expect(kpiService.createKpiObservation).toHaveBeenCalledTimes(2);
  });
});
