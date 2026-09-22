/**
 * PR1a: Idempotency Baseline Characterization Tests
 *
 * Exercises 4 representative mutation routes through BOTH real assembly
 * surfaces (makeApp / Vercel and createServer / Docker) to characterize
 * current idempotency behavior.
 *
 * Routes:
 *   POST /api/investments    -- mechanism NONE (makeApp) / A (Docker per-request store)
 *   POST /api/funds          -- durable workflow command boundary
 *   POST /api/funds/calculate -- mechanism C (getOrStart operation-status)
 *   POST /api/funds/:id/tasks -- mechanism D (database-backed, dispatcher bypass)
 *
 * Assembly surfaces:
 *   makeApp   (Vercel production) -- server/app.ts
 *   createServer (Docker/Railway) -- server/server.ts registerRoutes path
 *
 * Real assemblers, handlers, and idempotency middleware are preserved.
 * Only downstream services (DB writes, external calls) are mocked.
 * Baselines document existing behavior; they MUST change when P1b lands.
 */
import { createServer, type Server } from 'node:http';
import type { Express } from 'express';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred } from '../../helpers/deferred';
import { isDatabaseBackedIdempotencyRoute } from '../../../server/lib/database-backed-idempotency-routes';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import { TASK_CONTRACT_VERSION } from '../../../shared/contracts/operating-objects/task.contract';

// ---------------------------------------------------------------------------
// vi.hoisted: effect counters + db stub
// ---------------------------------------------------------------------------
const effects = vi.hoisted(() => ({
  createInvestment: vi.fn(),
  invalidateH9: vi.fn(),
  createFund: vi.fn(),
  renewCredential: vi.fn(),
  creatorUserId: vi.fn(),
  calculate: vi.fn(),
  recalculatePublished: vi.fn(),
}));

const taskStore = vi.hoisted(() => {
  const rows = new Map<string, Record<string, unknown>>();
  let _insertAttempts = 0;
  function compositeKey(fundId: number, idempotencyKey: string): string {
    return `${fundId}:${idempotencyKey}`;
  }
  return {
    rows,
    get insertAttempts() {
      return _insertAttempts;
    },
    reset() {
      rows.clear();
      _insertAttempts = 0;
    },
    lookup(fundId: number, idempotencyKey: string): Record<string, unknown> | undefined {
      return rows.get(compositeKey(fundId, idempotencyKey));
    },
    tryInsert(values: Record<string, unknown>): Record<string, unknown>[] {
      _insertAttempts++;
      const fundId = values['fundId'] as number;
      const key = values['idempotencyKey'] as string;
      if (fundId != null && key && rows.has(compositeKey(fundId, key))) return [];
      const row = {
        id: rows.size + 10,
        ...values,
        createdAt: new Date('2026-09-19T00:00:00.000Z'),
        updatedAt: new Date('2026-09-19T00:00:00.000Z'),
        rowXmin: String(rows.size + 5),
      };
      if (fundId != null && key) rows.set(compositeKey(fundId, key), row);
      return [row];
    },
  };
});

const dbState = vi.hoisted(() => {
  const db: Record<string, unknown> = {};
  db['select'] = vi.fn((...args: unknown[]) => {
    const fields = args.length > 0 ? (args[0] as Record<string, unknown>) : undefined;
    if (fields && ('isActive' in fields || 'userId' in fields || 'jti' in fields)) {
      const rows =
        'isActive' in fields
          ? [{ isActive: true, role: 'admin', isReleaseCanaryPrincipal: false }]
          : 'userId' in fields
            ? [{ userId: 1 }]
            : [];
      const query: Record<string, unknown> = {};
      query['from'] = () => query;
      query['where'] = () => query;
      query['limit'] = async () => rows;
      return query;
    }
    return {
      from: vi.fn(() => ({
        where: vi.fn((condition: SQL) => {
          const { sql, params } = new PgDialect().sqlToQuery(condition);
          const [fundId, idempotencyKey] = params;
          // Only the real createTask replay lookup is supported by this fake.
          if (
            sql !== '("tasks"."fund_id" = $1 and "tasks"."idempotency_key" = $2)' ||
            params.length !== 2 ||
            typeof fundId !== 'number' ||
            typeof idempotencyKey !== 'string'
          ) {
            throw new Error(`Unsupported task predicate in test fake: ${sql}`);
          }
          const matched = taskStore.lookup(fundId, idempotencyKey);
          const q: Record<string, unknown> = {
            orderBy: vi.fn(async () => []),
            limit: vi.fn(async () => (matched ? [matched] : [])),
          };
          q['for'] = vi.fn(() => q);
          return q;
        }),
      })),
    };
  });
  db['transaction'] = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(db));
  db['insert'] = vi.fn(() => ({
    values: vi.fn((v: unknown) => ({
      onConflictDoNothing: vi.fn(() => ({
        returning: vi.fn(async () => taskStore.tryInsert(v as Record<string, unknown>)),
      })),
    })),
  }));
  return db;
});

// ---------------------------------------------------------------------------
// Infrastructure mocks (from actuals-pilot boot pattern)
// ---------------------------------------------------------------------------
vi.mock('../../../server/db', () => ({ db: dbState, pool: null }));
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

// ---------------------------------------------------------------------------
// Downstream effect mocks (characterization-specific)
// ---------------------------------------------------------------------------
vi.mock('../../../server/services/investment-ledger/legacy-compat-guard-service', () => ({
  createLegacyInvestmentWithLedgerGuard: effects.createInvestment,
  assertLegacyInvestmentMutable: vi.fn(),
  UseLedgerRouteError: class extends Error {},
}));
vi.mock('../../../server/services/h9-artifact-invalidation-service', () => ({
  invalidateH9Artifacts: effects.invalidateH9,
}));
vi.mock('../../../server/services/fund-persistence-service', () => ({
  fundPersistenceService: {
    createFundWithInitialDraft: effects.createFund,
    recalculatePublished: effects.recalculatePublished,
  },
  ReleaseCanaryExecutionIdentityForbiddenError: class extends Error {},
  ReleaseCanaryExecutionIdentityInvalidError: class extends Error {},
  NoPublishedConfigError: class extends Error {
    constructor() {
      super('No published config');
      this.name = 'NoPublishedConfigError';
    }
  },
}));
vi.mock('../../../server/lib/auth/creator-identity', () => ({
  creatorUserIdFromRequest: effects.creatorUserId,
  renewCreationCredential: effects.renewCredential,
}));
vi.mock('../../../server/core/enhanced-fund-model', () => ({
  EnhancedFundModel: vi.fn().mockImplementation(function () {
    return { calculate: effects.calculate };
  }),
}));
// task-service is NOT mocked: real createTask + runIdempotentCommand are exercised
// through the persistence-only DB fake (dbState.insert/select/transaction above).
vi.mock('../../../server/services/operating-objects/task-evidence-link-service', () => ({
  TaskEvidenceLinkServiceError: class extends Error {},
  createTaskEvidenceLink: vi.fn(),
  listTaskEvidenceLinks: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Environment + boot (adapted from actuals-pilot-runtime-routes.test.ts)
// ---------------------------------------------------------------------------
const originalEnvironment = { ...process.env };
const ORIGIN = 'http://localhost:5173';
let server: Server | undefined;
let teardown: (() => Promise<void>) | undefined;
let setReady: ((ready: boolean) => void) | undefined;
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
    SESSION_SECRET: 'idempotency-baseline-session-secret-at-least-32-characters',
    JWT_SECRET: 'idempotency-baseline-jwt-secret-at-least-32-characters',
    _EXPLICIT_JWT_SECRET: 'idempotency-baseline-jwt-secret-at-least-32-characters',
    JWT_ALG: 'HS256',
    _EXPLICIT_JWT_ALG: 'HS256',
    JWT_AUDIENCE: 'idempotency-baseline-test',
    _EXPLICIT_JWT_AUDIENCE: 'idempotency-baseline-test',
    JWT_ISSUER: 'idempotency-baseline-test',
    _EXPLICIT_JWT_ISSUER: 'idempotency-baseline-test',
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

async function boot() {
  configureEnvironment();
  const [{ makeApp }, { loadEnv }, providersModule, serverModule, health, jwt] = await Promise.all([
    import('../../../server/app'),
    import('../../../server/config/index.js'),
    import('../../../server/providers.js'),
    import('../../../server/server.js'),
    import('../../../server/health/state.js'),
    import('../../../server/lib/auth/jwt'),
  ]);
  const config = loadEnv();
  const providers = await providersModule.buildProviders(config);
  teardown = providers.teardown;
  server = await serverModule.createServer(config, providers);
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
    email: 'idempotency-baseline@example.test',
  });

  return { surfaces, token };
}

function setupEffectDefaults(): void {
  effects.createInvestment.mockResolvedValue({
    id: 99,
    fundId: 1,
    companyId: 1,
    amount: '100000',
    round: 'Series A',
    investmentDate: new Date('2024-01-01T00:00:00Z'),
  });
  effects.invalidateH9.mockResolvedValue(undefined);
  effects.createFund.mockResolvedValue({
    fund: {
      id: 1,
      name: 'Test Fund',
      size: '1000000',
      deployedCapital: '0',
      managementFee: '0.02',
      carryPercentage: '0.20',
      vintageYear: 2024,
      status: 'active',
      engineResults: null,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      establishmentDate: null,
      isActive: true,
    },
  });
  effects.creatorUserId.mockReturnValue(1);
  effects.renewCredential.mockResolvedValue(null);
  effects.calculate.mockResolvedValue({ results: {} });
  effects.recalculatePublished.mockResolvedValue({
    run: {
      id: 55,
      fundId: 1,
      configId: 20,
      configVersion: 2,
      correlationId: 'recalc-corr-200',
      engines: ['reserve', 'pacing'],
      dispatchState: 'dispatched',
      requestedAt: new Date(),
      dispatchedAt: new Date(),
      failedAt: null,
      lastError: null,
    },
    correlationId: 'recalc-corr-200',
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  taskStore.reset();
  setupEffectDefaults();

  // Spy calls through to real setInterval; mock.results tracks returned timer
  // handles for cleanup. Installed AFTER clearAllMocks, BEFORE boot() imports.
  setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
});

async function cleanupTest(): Promise<void> {
  const currentServer = server;
  const currentTeardown = teardown;
  const currentSetReady = setReady;
  server = undefined;
  teardown = undefined;
  setReady = undefined;
  try {
    try {
      try {
        currentSetReady?.(false);
      } finally {
        if (currentServer?.listening) {
          await new Promise<void>((resolve, reject) => {
            currentServer.close((error) => (error ? reject(error) : resolve()));
          });
        }
      }
    } finally {
      await currentTeardown?.();
    }
  } finally {
    try {
      // Include intervals created during provider teardown as well as boot/requests.
      for (const result of setIntervalSpy?.mock.results ?? []) {
        if (result.type === 'return') clearInterval(result.value);
      }
    } finally {
      setIntervalSpy?.mockRestore();
      setIntervalSpy = undefined;
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, originalEnvironment);
    }
  }
}

afterEach(cleanupTest);

describe('test harness cleanup', () => {
  it('provides the legacy guard export required by mounted routes', async () => {
    const guards =
      await import('../../../server/services/investment-ledger/legacy-compat-guard-service');
    expect(guards.assertLegacyInvestmentMutable).toBeTypeOf('function');
  });

  it.each(['provider', 'readiness'] as const)(
    'cleans real intervals and restores state when %s teardown fails',
    async (failureStage) => {
      const before = vi.fn();
      const during = vi.fn();
      const failure = new Error(`${failureStage} teardown failed`);
      const beforeTimer = setInterval(before, 1, 'call-through');
      let duringTimer: ReturnType<typeof setInterval> | undefined;
      const cleanupServer = createServer();
      server = cleanupServer;

      try {
        await new Promise<void>((resolve, reject) => {
          cleanupServer.once('error', reject);
          cleanupServer.listen(0, '127.0.0.1', resolve);
        });
        await vi.waitFor(() => expect(before).toHaveBeenCalledWith('call-through'));
        process.env['PR1A_CLEANUP_TEST'] = 'temporary';
        setReady = () => {
          if (failureStage === 'readiness') throw failure;
        };
        teardown = async () => {
          duringTimer = setInterval(() => during(), 1);
          if (failureStage === 'provider') throw failure;
        };

        await expect(cleanupTest()).rejects.toBe(failure);
        expect(cleanupServer.listening).toBe(false);
        expect(duringTimer).toBeDefined();
        expect(vi.isMockFunction(globalThis.setInterval)).toBe(false);
        expect(process.env['PR1A_CLEANUP_TEST']).toBe(originalEnvironment['PR1A_CLEANUP_TEST']);

        const counts = [before.mock.calls.length, during.mock.calls.length];
        await new Promise((resolve) => setTimeout(resolve, 25));
        expect([before.mock.calls.length, during.mock.calls.length]).toEqual(counts);
      } finally {
        clearInterval(beforeTimer);
        if (duringTimer !== undefined) clearInterval(duringTimer);
        if (cleanupServer.listening) {
          await new Promise<void>((resolve, reject) => {
            cleanupServer.close((error) => (error ? reject(error) : resolve()));
          });
        }
      }
    }
  );
});

// ---------------------------------------------------------------------------
// 1. POST /api/investments -- mechanism NONE (makeApp) / A (Docker per-request)
// ---------------------------------------------------------------------------
describe('mechanism NONE/A: POST /api/investments (schema/transport gap)', () => {
  // insertInvestmentSchema (drizzle-zod 0.8) generates z.date() for timestamp columns.
  // JSON.stringify(Date) produces a string, which z.date() rejects (expects Date object).
  // express.json() has no reviver; no coercion middleware exists.
  // Standard JSON POST bodies with ISO date strings hit 400 before reaching the handler.
  const jsonPayload = {
    fundId: 1,
    companyId: 1,
    investmentDate: '2024-01-01T00:00:00.000Z',
    amount: '100000',
    round: 'Series A',
  };

  it('validation rejects JSON date string on both surfaces (zero mutation calls)', async () => {
    const { surfaces, token } = await boot();

    for (const { name, app } of surfaces) {
      effects.createInvestment.mockClear();

      const r = await request(app)
        .post('/api/investments')
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', `inv-schema-${name}`)
        .send(jsonPayload);
      expect(r.status, `${name}: z.date() rejects ISO string`).toBe(400);
      expect(r.body.error).toBe('Invalid investment data');
      expect(effects.createInvestment.mock.calls.length, `${name}: handler never reached`).toBe(0);
    }
  });

  // ACCEPTANCE GAP: repeated mutation through real assemblies for mechanism A
  // cannot be exercised here because the investment schema rejects all standard
  // JSON date representations before the handler executes. A separate route
  // whose schema accepts plain JSON, or an integration test that can bypass the
  // JSON transport layer, is needed to characterize mechanism A dedup behavior.
});

// ---------------------------------------------------------------------------
// 1b. POST /api/funds/:id/recalculate -- generic dispatcher (mechanism A gap)
// ---------------------------------------------------------------------------
describe('mechanism A: POST /api/funds/:id/recalculate (generic dispatcher)', () => {
  // fund-config.ts:343 POST /api/funds/:id/recalculate: makeApp lacks the generic
  // idempotency dispatcher entirely; createServer wires it with per-request storage
  // (mechanism A) so the key is lost between requests. Neither surface deduplicates.
  // NO database-backed bypass. Dynamic-imports fundPersistenceService.recalculatePublished.

  it('handler executes on every request (no middleware dedup)', async () => {
    const { surfaces, token } = await boot();

    for (const { name, app } of surfaces) {
      effects.recalculatePublished.mockClear();
      const key = `recalc-a-${name}`;

      const r1 = await request(app)
        .post('/api/funds/1/recalculate')
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send({});
      expect(r1.status, `${name} first call`).toBe(200);
      expect(r1.body.success).toBe(true);
      expect(r1.body.correlationId).toBe('recalc-corr-200');

      const r2 = await request(app)
        .post('/api/funds/1/recalculate')
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send({});
      expect(r2.status, `${name} second call`).toBe(200);

      // BASELINE: recalculatePublished called TWICE -- no idempotency middleware
      // on this route, key is ignored. P1b MUST change this to 1.
      expect(
        effects.recalculatePublished.mock.calls.length,
        `${name}: handler ran twice (zero dedup)`
      ).toBe(2);
    }
  });

  it('route is NOT classified as database-backed', () => {
    expect(isDatabaseBackedIdempotencyRoute('POST', '/api/funds/1/recalculate')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. POST /api/funds -- durable workflow command boundary
// ---------------------------------------------------------------------------
describe('workflow command headers: POST /api/funds', () => {
  it.each([
    { header: null, value: '', code: 'IDEMPOTENCY_KEY_REQUIRED' },
    { header: 'Idempotency-Key', value: 'legacy-fund-key', code: 'INVALID_IDEMPOTENCY_KEY' },
    {
      header: 'X-Idempotency-Key',
      value: '550e8400-e29b-41d4-a716-446655440000',
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    },
  ])('rejects $header / $value before writes', async ({ header, value, code }) => {
    const { surfaces, token } = await boot();
    for (const { name, app } of surfaces) {
      effects.createFund.mockClear();
      effects.renewCredential.mockClear();
      const pending = request(app).post('/api/funds').auth(token, { type: 'bearer' });
      if (header) pending.set(header, value);
      const response = await pending.send({ name: 'Test Fund', size: 1000000, vintageYear: 2024 });
      expect(response.status, name).toBe(400);
      expect(response.body.code, name).toBe(code);
      expect(effects.createFund, name).not.toHaveBeenCalled();
      expect(effects.renewCredential, name).not.toHaveBeenCalled();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. POST /api/funds/calculate -- mechanism C (getOrStart operation-status)
// ---------------------------------------------------------------------------
describe('mechanism C: POST /api/funds/calculate', () => {
  // Distinct per-surface payloads: the process-local idem singleton is shared
  // between both assemblies in the same vitest process, so identical payloads
  // produce the same derived key and cross-surface contamination.
  const calcPayloads: Record<string, { fundSize: number }> = {
    makeApp: { fundSize: 100_000_000 },
    createServer: { fundSize: 200_000_000 },
  };

  it('derived-key duplicate joins pending calculation with 202, then replays completed result', async () => {
    const { surfaces, token } = await boot();

    for (const { name, app } of surfaces) {
      effects.calculate.mockClear();
      const payload = calcPayloads[name]!;

      const result = { results: { fundSize: payload.fundSize } };
      const calculation = deferred<typeof result>();
      effects.calculate.mockReturnValueOnce(calculation.promise);

      // Supertest starts the request when its thenable is consumed.
      const firstRequest = request(app)
        .post('/api/funds/calculate')
        .auth(token, { type: 'bearer' })
        .send(payload)
        .then((response) => response);

      try {
        await vi.waitFor(() => expect(effects.calculate).toHaveBeenCalledTimes(1));
        const pending = await request(app)
          .post('/api/funds/calculate')
          .auth(token, { type: 'bearer' })
          .send(payload)
          .timeout(5000);

        expect(pending.status, `${name} pending duplicate`).toBe(202);
        expect(pending.headers['idempotency-status']).toBe('joined');
        expect(pending.headers['retry-after']).toBe('2');
        expect(pending.body).toEqual({
          status: 'in-progress',
          key: expect.stringMatching(/^calc:/),
        });
        expect(pending.headers['location']).toBe(
          `/api/operations/${encodeURIComponent(pending.body.key as string)}`
        );
        const poll = await request(app)
          .get(pending.headers['location'] as string)
          .auth(token, { type: 'bearer' })
          .timeout(5000);
        if (name === 'createServer') {
          expect(poll.status, `${name} pending operation`).toBe(202);
          expect(poll.headers['retry-after']).toBe('2');
          expect(poll.body).toMatchObject({ status: 'in-progress' });
        } else {
          expect(poll.status, `${name} operations mount gap`).toBe(404);
        }
        expect(
          effects.calculate,
          `${name} pending duplicate did not calculate`
        ).toHaveBeenCalledTimes(1);
      } finally {
        // Release and drain the original request even when a pending assertion fails.
        calculation.resolve(result);
        await firstRequest;
      }

      const r1 = await firstRequest;
      expect(r1.status, `${name} first call: ${JSON.stringify(r1.body)}`).toBe(201);
      expect(r1.headers['idempotency-status'], `${name} first status header`).toBe('created');
      expect(r1.body).toEqual(result);

      // Same payload = same derived key = join
      const r2 = await request(app)
        .post('/api/funds/calculate')
        .auth(token, { type: 'bearer' })
        .send(payload);
      expect(r2.status, `${name} joined call`).toBe(200);
      expect(r2.headers['idempotency-status'], `${name} joined status header`).toBe('joined');
      expect(r2.body, `${name} completed replay`).toEqual(result);

      // Mechanism C: getOrStart runs the compute ONCE, second call joins.
      expect(
        effects.calculate.mock.calls.length,
        `${name}: calculate ran once (mechanism C dedup)`
      ).toBe(1);
    }
  });

  it('explicit client key returns 202 with Location on join', async () => {
    const { surfaces, token } = await boot();

    for (const { name, app } of surfaces) {
      effects.calculate.mockClear();
      const key = `calc-client-${name}`;
      const payload = calcPayloads[name]!;

      const r1 = await request(app)
        .post('/api/funds/calculate')
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send(payload);
      expect(r1.status, `${name} first call`).toBe(201);

      const r2 = await request(app)
        .post('/api/funds/calculate')
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send(payload);
      // Client-provided key on join: 202 with Location for polling
      expect(r2.status, `${name} client-key join`).toBe(202);
      expect(r2.headers['location'], `${name} location header`).toContain('/api/operations/');
    }
  });

  it('explicit key with changed fundSize joins the original calculation (baseline gap)', async () => {
    const { surfaces, token } = await boot();

    for (const { name, app } of surfaces) {
      effects.calculate.mockClear();
      const key = `calc-changed-input-${name}`;
      const payload = calcPayloads[name]!;
      const result = { results: { fundSize: payload.fundSize } };
      effects.calculate.mockResolvedValueOnce(result);

      const original = await request(app)
        .post('/api/funds/calculate')
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send(payload);
      expect(original.status, `${name} original calculation`).toBe(201);
      expect(original.body).toEqual(result);

      const changed = await request(app)
        .post('/api/funds/calculate')
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send({ fundSize: payload.fundSize + 1_000_000 });

      // BASELINE: mechanism C compares only the key, not the request payload.
      // P1b must replace this join with a changed-input conflict.
      expect(changed.status, `${name} changed input joins instead of conflicting`).toBe(202);
      expect(changed.headers['idempotency-status']).toBe('joined');
      expect(changed.headers['location']).toBe(`/api/operations/${key}`);
      expect(changed.body).toEqual({ status: 'in-progress', key });
      expect(effects.calculate, `${name} changed input did not calculate`).toHaveBeenCalledTimes(1);

      const poll = await request(app)
        .get(changed.headers['location'] as string)
        .auth(token, { type: 'bearer' });
      if (name === 'createServer') {
        expect(poll.status).toBe(200);
        expect(poll.body).toMatchObject({ status: 'succeeded', result });
      } else {
        // makeApp does not mount the operations polling route (separate baseline gap).
        expect(poll.status).toBe(404);
      }
    }
  });

  it('following Location with GET: Docker 200 vs makeApp 404 (operations mount gap)', async () => {
    const { surfaces, token } = await boot();

    for (const { name, app } of surfaces) {
      effects.calculate.mockClear();
      const key = `calc-poll-${name}`;
      const payload = calcPayloads[name]!;

      // First call creates
      await request(app)
        .post('/api/funds/calculate')
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send(payload);

      // Second call with same key gets 202 + Location
      const r2 = await request(app)
        .post('/api/funds/calculate')
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send(payload);
      expect(r2.status, `${name} join`).toBe(202);
      const location = r2.headers['location'] as string;
      expect(location).toContain('/api/operations/');

      // Follow the Location
      const poll = await request(app).get(location).auth(token, { type: 'bearer' });

      if (name === 'createServer') {
        // Docker: operations router mounted at routes.ts:81
        expect(poll.status, `${name} poll status`).toBe(200);
      } else {
        // makeApp: operations router is Docker-only (permanent-infra exemption)
        expect(poll.status, `${name} poll status`).toBe(404);
      }
    }
  });

  it('mechanism C is process-local, NOT database-backed', () => {
    expect(isDatabaseBackedIdempotencyRoute('POST', '/api/funds/calculate')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. POST /api/funds/:fundId/tasks -- mechanism D (database-backed bypass)
// ---------------------------------------------------------------------------
// Real createTask + runIdempotentCommand exercised through persistence-only DB
// fake (adapted from task-service.test.ts). Canonical hashing, replay detection,
// and conflict logic are real; PG durability is NOT claimed (mock DB, no advisory locks).
describe('mechanism D: POST /api/funds/:fundId/tasks (real createTask + DB fake)', () => {
  const taskPayload = { fundId: 1, title: 'Test Task' };
  const taskHash = canonicalSha256({
    commandKind: 'create_task',
    contractVersion: TASK_CONTRACT_VERSION,
    fundId: 1,
    title: 'Test Task',
  });

  it('first 201, replay 200 through real createTask + runIdempotentCommand', async () => {
    const { surfaces, token } = await boot();

    for (const { name, app } of surfaces) {
      taskStore.reset();
      const key = `task-d-real-${name}`;

      const r1 = await request(app)
        .post('/api/funds/1/tasks')
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send(taskPayload);
      expect(r1.status, `${name} first call`).toBe(201);

      expect(taskStore.rows.size, `${name}: one stored task`).toBe(1);
      const stored = taskStore.lookup(1, key)!;
      expect(stored['idempotencyKey']).toBe(key);
      expect(stored['requestHash']).toBe(taskHash);
      expect(stored['fundId']).toBe(1);
      expect(stored['title']).toBe('Test Task');
      expect(stored['status']).toBe('open');

      const r2 = await request(app)
        .post('/api/funds/1/tasks')
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send(taskPayload);
      expect(r2.status, `${name} replay`).toBe(200);

      expect(taskStore.rows.size, `${name}: still one stored task`).toBe(1);
      expect(taskStore.lookup(1, key), `${name}: stored row unchanged`).toBe(stored);
      expect(taskStore.insertAttempts, `${name}: 2 insert attempts`).toBe(2);
    }
  });

  it('isolates task replay by fund and key across multiple stored rows', async () => {
    const { surfaces, token } = await boot();

    for (const { name, app } of surfaces) {
      taskStore.reset();
      const commands = [
        { fundId: 1, key: `task-scope-a-${name}` },
        { fundId: 1, key: `task-scope-b-${name}` },
        { fundId: 2, key: `task-scope-a-${name}` },
      ];
      const created: Array<{ fundId: number; key: string; id: number }> = [];

      for (const command of commands) {
        const response = await request(app)
          .post(`/api/funds/${command.fundId}/tasks`)
          .auth(token, { type: 'bearer' })
          .set('Idempotency-Key', command.key)
          .send({ fundId: command.fundId, title: 'Same task title' });
        expect(response.status, `${name}: create ${command.fundId}/${command.key}`).toBe(201);
        expect(response.body.fundId).toBe(command.fundId);
        expect(response.body.id).toEqual(expect.any(Number));
        created.push({ ...command, id: response.body.id });
      }

      expect(new Set(created.map(({ id }) => id)).size, `${name}: distinct task IDs`).toBe(3);
      for (const command of created.reverse()) {
        const response = await request(app)
          .post(`/api/funds/${command.fundId}/tasks`)
          .auth(token, { type: 'bearer' })
          .set('Idempotency-Key', command.key)
          .send({ fundId: command.fundId, title: 'Same task title' });
        expect(response.status, `${name}: replay ${command.fundId}/${command.key}`).toBe(200);
        expect(response.body).toMatchObject({ id: command.id, fundId: command.fundId });
      }
      expect(taskStore.rows.size, `${name}: three scoped rows`).toBe(3);
      expect(taskStore.insertAttempts, `${name}: three creates and three replays`).toBe(6);
    }
  });

  it('conflict 409 when same key used with different input', async () => {
    const { surfaces, token } = await boot();

    for (const { name, app } of surfaces) {
      taskStore.reset();
      const key = `task-d-conflict-${name}`;

      const r1 = await request(app)
        .post('/api/funds/1/tasks')
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send(taskPayload);
      expect(r1.status, `${name} first call`).toBe(201);

      const r2 = await request(app)
        .post('/api/funds/1/tasks')
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send({ fundId: 1, title: 'Different Title' });
      expect(r2.status, `${name} conflict`).toBe(409);
      expect(r2.body.error).toBe('IDEMPOTENCY_KEY_REUSE');

      expect(taskStore.rows.size, `${name}: still one stored task`).toBe(1);
      expect(taskStore.insertAttempts, `${name}: 2 insert attempts`).toBe(2);
    }
  });

  it('returns 428 when Idempotency-Key header is missing', async () => {
    const { surfaces, token } = await boot();

    for (const { name, app } of surfaces) {
      const r = await request(app)
        .post('/api/funds/1/tasks')
        .auth(token, { type: 'bearer' })
        .send(taskPayload);
      expect(r.status, `${name} missing key`).toBe(428);
      expect(r.body.error).toBe('IDEMPOTENCY_KEY_REQUIRED');
    }
  });

  it('Docker dispatcher bypasses withIdempotency for D-backed routes', () => {
    expect(isDatabaseBackedIdempotencyRoute('POST', '/api/funds/1/tasks')).toBe(true);
    expect(isDatabaseBackedIdempotencyRoute('POST', '/api/funds/42/tasks')).toBe(true);
    expect(isDatabaseBackedIdempotencyRoute('GET', '/api/funds/1/tasks')).toBe(false);
  });
});

// Surface-gap and DELETE inventory observations removed per R2 finding #4:
// they are documented in the external mutation inventory artifact,
// not as expect(true) stubs or hardcoded method arrays in the test file.

// ---------------------------------------------------------------------------
// 7. Database-backed route classification (20 patterns)
// ---------------------------------------------------------------------------
describe('database-backed route classification', () => {
  it('all 20 patterns are classified as database-backed', () => {
    const patterns: [string, string][] = [
      ['POST', '/api/funds'],
      ['POST', '/api/funds/finalize'],
      ['PUT', '/api/funds/1/draft'],
      ['POST', '/api/funds/1/publish'],
      ['PATCH', '/api/funds/1/tasks/2'],
      ['POST', '/api/funds/1/internal-economics/runs'],
      ['POST', '/api/funds/1/current-forecast/recompute'],
      ['POST', '/api/funds/1/decisions'],
      ['POST', '/api/funds/1/decisions/2/supersede'],
      ['POST', '/api/funds/1/decisions/2/evidence-links'],
      ['POST', '/api/funds/1/tasks'],
      ['POST', '/api/funds/1/tasks/2/evidence-links'],
      ['POST', '/api/funds/1/kpi-observations'],
      ['POST', '/api/funds/1/kpi-observations/imports'],
      ['POST', '/api/funds/1/scenario-sets/abc/calculate-reserve'],
      ['POST', '/api/funds/1/imports/actuals/dry-run'],
      ['POST', '/api/funds/1/imports/actuals/publish'],
      ['POST', '/api/funds/1/imports/actuals/draft-revisions'],
      ['POST', '/api/funds/1/imports/actuals/restatements/dry-run'],
      ['POST', '/api/funds/1/imports/actuals/restatements/publish'],
    ];
    for (const [method, path] of patterns) {
      expect(isDatabaseBackedIdempotencyRoute(method, path), `${method} ${path}`).toBe(true);
    }
    expect(patterns).toHaveLength(20);
  });
});
