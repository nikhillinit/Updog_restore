import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACTUALS_LEDGER_MAX_BYTES,
  ACTUALS_VALUATION_MAX_BYTES,
  ActualsPublishRequestV1Schema,
} from '../../../shared/contracts/lp-reporting/actuals-pilot.contract';

const dbState = vi.hoisted(() => {
  const select = vi.fn((fields: Record<string, unknown> = {}) => {
    const rows =
      'isActive' in fields
        ? [{ isActive: true, role: 'admin', isReleaseCanaryPrincipal: false }]
        : 'userId' in fields
          ? [{ userId: 1 }]
          : [];
    const query = {
      from: () => query,
      where: () => query,
      limit: async () => rows,
    };
    return query;
  });
  return { select };
});
const calls = vi.hoisted(() => ({ preview: vi.fn(), publish: vi.fn() }));

vi.mock('../../../server/db', () => ({ db: dbState, pool: null }));
vi.mock(
  '../../../server/services/lp-reporting/actuals-pilot-preview-service',
  async (original) => ({
    ...(await original<
      typeof import('../../../server/services/lp-reporting/actuals-pilot-preview-service')
    >()),
    previewActualsPilot: calls.preview,
  })
);
vi.mock(
  '../../../server/services/lp-reporting/actuals-pilot-publish-service',
  async (original) => ({
    ...(await original<
      typeof import('../../../server/services/lp-reporting/actuals-pilot-publish-service')
    >()),
    publishActualsPilot: calls.publish,
  })
);
vi.mock('../../../server/services/calc-run-completion-handlers.js', () => ({
  registerCompletionHandlers: vi.fn(),
}));
vi.mock('../../../server/services/variance-alert-automation.js', () => ({
  varianceAlertAutomationService: { start: vi.fn() },
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
    return module;
  }
);

const originalEnvironment = { ...process.env };
const ORIGIN = 'http://localhost:5173';
const PREFIX = '/api/funds/1';
const MUTATIONS = ['/imports/actuals/dry-run', '/imports/actuals/publish'];
const READS = ['/financial-facts/latest-reference', '/actuals/metrics'];
const KEY = 'c2c1984c-7382-4ff5-9f18-1fa89fbba54c';
let server: Server | undefined;
let teardown: (() => Promise<void>) | undefined;
let setReady: ((ready: boolean) => void) | undefined;

function configureEnvironment(pilot: boolean, development = false): void {
  Object.assign(process.env, {
    NODE_ENV: development ? 'development' : 'test',
    _EXPLICIT_NODE_ENV: development ? 'development' : 'test',
    REDIS_URL: 'memory://',
    _EXPLICIT_REDIS_URL: 'memory://',
    ALLOW_MEMORY_STORAGE: '1',
    ENABLE_QUEUES: '0',
    REQUIRE_AUTH: development ? '0' : '1',
    DEFAULT_USER_ID: '1',
    SESSION_SECRET: 'actuals-runtime-session-secret-at-least-32-characters',
    JWT_SECRET: 'actuals-runtime-jwt-secret-at-least-32-characters',
    _EXPLICIT_JWT_SECRET: 'actuals-runtime-jwt-secret-at-least-32-characters',
    JWT_ALG: 'HS256',
    _EXPLICIT_JWT_ALG: 'HS256',
    JWT_AUDIENCE: 'actuals-runtime-test',
    _EXPLICIT_JWT_AUDIENCE: 'actuals-runtime-test',
    JWT_ISSUER: 'actuals-runtime-test',
    _EXPLICIT_JWT_ISSUER: 'actuals-runtime-test',
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
  ]) {
    delete process.env[key];
  }
  if (pilot) process.env['ACTUALS_PILOT_FUND_ID'] = '1';
  else delete process.env['ACTUALS_PILOT_FUND_ID'];
}

async function boot(pilot = true, development = false) {
  configureEnvironment(pilot, development);
  const [{ makeApp }, { loadEnv }, providersModule, serverModule, health, jwt, csrf] =
    await Promise.all([
      import('../../../server/app'),
      import('../../../server/config/index.js'),
      import('../../../server/providers.js'),
      import('../../../server/server.js'),
      import('../../../server/health/state.js'),
      import('../../../server/lib/auth/jwt'),
      import('../../../server/lib/auth/csrf'),
    ]);
  const config = loadEnv();
  const providers = await providersModule.buildProviders(config);
  server = await serverModule.createServer(config, providers);
  teardown = providers.teardown;
  setReady = health.setReady;
  setReady(true);
  const surfaces: Array<{ name: string; app: Express | Server }> = [
    { name: 'makeApp', app: makeApp() },
    { name: 'createServer', app: server },
  ];
  const token = jwt.signToken({
    sub: '1',
    role: 'admin',
    fundIds: [1],
    org_id: '11111111-1111-4111-8111-111111111111',
    email: 'actuals-runtime@example.test',
  });
  const jti = jwt.verifyAccessToken(token).jti;
  if (typeof jti !== 'string') throw new Error('Signed runtime credential must have a jti');
  dbState.select.mockClear();
  return { surfaces, token, csrfToken: csrf.createSessionCsrfToken(jti) };
}

function assertNoPublisherEffects(): void {
  expect(calls.publish).not.toHaveBeenCalled();
  expect(calls.preview).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(async () => {
  const currentServer = server;
  const currentTeardown = teardown;
  const currentSetReady = setReady;
  server = undefined;
  teardown = undefined;
  setReady = undefined;
  currentSetReady?.(false);
  if (currentServer?.listening) {
    await new Promise<void>((resolve, reject) => {
      currentServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await currentTeardown?.();
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
});

describe('actuals pilot through both application assemblies', () => {
  it('registers none of the four routes when the pilot is unset', async () => {
    const { surfaces, token } = await boot(false);
    for (const { name, app } of surfaces) {
      for (const path of READS) {
        const response = await request(app)
          .get(PREFIX + path)
          .auth(token, { type: 'bearer' });
        expect(response.status, `${name} ${path}: ${JSON.stringify(response.body)}`).toBe(404);
      }
      for (const path of MUTATIONS) {
        const response = await request(app)
          .post(PREFIX + path)
          .auth(token, { type: 'bearer' })
          .send({});
        expect(response.status, `${name} ${path}: ${JSON.stringify(response.body)}`).toBe(404);
      }
    }
    assertNoPublisherEffects();
  });

  it('requires one verified credential before protected route validation', async () => {
    const { surfaces, token } = await boot();
    for (const { name, app } of surfaces) {
      for (const path of MUTATIONS) {
        const anonymous = await request(app)
          .post(PREFIX + path)
          .send({});
        expect(anonymous.status, `${name} anonymous ${path}`).toBe(401);
        const ambiguous = await request(app)
          .post(PREFIX + path)
          .auth(token, { type: 'bearer' })
          .set('Cookie', `updog.session=${token}`)
          .send({});
        expect(ambiguous.status, `${name} ambiguous ${path}`).toBe(401);
        const authorized = await request(app)
          .post(PREFIX + path)
          .auth(token, { type: 'bearer' })
          .set('If-Match', '"financial-facts:none"')
          .set('Idempotency-Key', KEY)
          .send({});
        expect(authorized.status, `${name} validates authorized ${path}`).toBe(400);
        expect(authorized.headers['cache-control']).toBe('private, no-store');
        const readsBeforeCrossFund = dbState.select.mock.calls.length;
        const crossFund = await request(app)
          .post(`/api/funds/2${path}`)
          .auth(token, { type: 'bearer' })
          .send({});
        expect(crossFund.status, `${name} cross-fund ${path}`).toBe(404);
        expect(
          dbState.select.mock.calls
            .slice(readsBeforeCrossFund)
            .map(([fields]) => Object.keys(fields ?? {}))
        ).toEqual([['jti'], ['isActive']]);
      }
    }
    assertNoPublisherEffects();
  });

  it('enforces cookie CSRF and permits a matching session token', async () => {
    const { surfaces, token, csrfToken } = await boot();
    for (const { name, app } of surfaces) {
      const path = `${PREFIX}/imports/actuals/publish`;
      const rejected = await request(app)
        .post(path)
        .set('Cookie', `updog.session=${token}`)
        .send({});
      expect(rejected.status, `${name} missing CSRF`).toBe(403);
      const accepted = await request(app)
        .post(path)
        .set('Cookie', `updog.session=${token}; updog.csrf=${csrfToken}`)
        .set('X-CSRF-Token', csrfToken)
        .set('If-Match', '"financial-facts:none"')
        .set('Idempotency-Key', KEY)
        .send({});
      expect(accepted.status, `${name} matching CSRF reaches body validation`).toBe(400);
      const crossSite = await request(app)
        .post(path)
        .set('Cookie', `updog.session=${token}; updog.csrf=${csrfToken}`)
        .set('X-CSRF-Token', csrfToken)
        .set('Sec-Fetch-Site', 'cross-site')
        .send({});
      expect(crossSite.status, `${name} cross-site CSRF`).toBe(403);
    }
    assertNoPublisherEffects();
  });

  it('denies development mock identities before reading grant or facts rows', async () => {
    const { surfaces } = await boot(true, true);
    for (const { name, app } of surfaces) {
      const response = await request(app).post(`${PREFIX}/imports/actuals/publish`).send({});
      expect([401, 404], `${name} development mock`).toContain(response.status);
    }
    expect(dbState.select).not.toHaveBeenCalled();
    assertNoPublisherEffects();
  });

  it('accepts the complete maximum file envelope within the 256 KB parser bound', async () => {
    const file = (templateVersion: string, byteCount: number) => {
      const bytes = Buffer.alloc(byteCount, 'x');
      return {
        templateVersion,
        fileName: `${'\u4e2d'.repeat(251)}.csv`,
        payload: bytes.toString('base64'),
        expectedPayloadSha256: createHash('sha256').update(bytes).digest('hex'),
        expectedCanonicalRowsHash: 'a'.repeat(64),
        expectedPreviewHash: 'b'.repeat(64),
      };
    };
    const envelope = ActualsPublishRequestV1Schema.parse({
      contractVersion: 'actuals-pilot-publish/1.0.0',
      asOfDate: '2026-09-04',
      ledger: file('actuals-ledger/1.0.0', ACTUALS_LEDGER_MAX_BYTES),
      valuation: file('actuals-valuation/1.0.0', ACTUALS_VALUATION_MAX_BYTES),
      coverage: {
        ledger: 'inception_to_date',
        priorFactsSnapshotId: null,
        evidenceNote: '\u4e2d'.repeat(500),
      },
    });
    const body = JSON.stringify(envelope);
    expect(Buffer.byteLength(body)).toBeLessThan(256 * 1024);
    const { surfaces } = await boot();
    for (const { name, app } of surfaces) {
      const response = await request(app)
        .post(`${PREFIX}/imports/actuals/publish`)
        .type('json')
        .send(body);
      expect(response.status, `${name} parser accepts envelope before auth`).toBe(401);
      const oversized = await request(app)
        .post(`${PREFIX}/imports/actuals/publish`)
        .send({ payload: 'x'.repeat(256 * 1024) });
      expect(oversized.status, `${name} configured parser bound`).toBe(413);
    }
    assertNoPublisherEffects();
  });

  it('keeps the Vercel internal rewrite connected to the same Express assembly', async () => {
    const vercel = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      rewrites: Array<{ source: string; destination: string }>;
    };
    expect(vercel.rewrites).toContainEqual({
      source: '/api/:slug*',
      destination: '/api/[...slug]',
    });
    const entrypoint = await readFile('api/[...slug].ts', 'utf8');
    expect(entrypoint).toContain('makeApp');
    expect(entrypoint).toContain('./_app.generated.mjs');
    const build = await readFile('scripts/build-vercel-api.mjs', 'utf8');
    expect(build).toContain('server/app.ts');
    expect(build).toContain('api/_app.generated.mjs');
  });
});
