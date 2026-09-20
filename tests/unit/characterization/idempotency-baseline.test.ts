/**
 * PR1a: Idempotency Baseline Characterization Tests
 *
 * Exercises 4 representative mutation routes through BOTH real assembly
 * surfaces (makeApp / Vercel and createServer / Docker) to characterize
 * current idempotency behavior.
 *
 * Routes:
 *   POST /api/investments    -- mechanism NONE (makeApp) / A (Docker per-request store)
 *   POST /api/funds          -- mechanism B (Redis-backed per-route middleware)
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
import type { Server } from 'node:http';
import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  return {
    rows,
    get insertAttempts() {
      return _insertAttempts;
    },
    reset() {
      rows.clear();
      _insertAttempts = 0;
    },
    tryInsert(values: Record<string, unknown>): Record<string, unknown>[] {
      _insertAttempts++;
      const key = values.idempotencyKey as string;
      if (key && rows.has(key)) return [];
      const row = {
        id: rows.size + 10,
        ...values,
        createdAt: new Date('2026-09-19T00:00:00.000Z'),
        updatedAt: new Date('2026-09-19T00:00:00.000Z'),
        rowXmin: String(rows.size + 5),
      };
      if (key) rows.set(key, row);
      return [row];
    },
  };
});

const dbState = vi.hoisted(() => {
  const db: Record<string, unknown> = {};
  db.select = vi.fn((...args: unknown[]) => {
    const fields = args.length > 0 ? (args[0] as Record<string, unknown>) : undefined;
    if (fields && ('isActive' in fields || 'userId' in fields || 'jti' in fields)) {
      const rows =
        'isActive' in fields
          ? [{ isActive: true, role: 'admin', isReleaseCanaryPrincipal: false }]
          : 'userId' in fields
            ? [{ userId: 1 }]
            : [];
      const query: Record<string, unknown> = {};
      query.from = () => query;
      query.where = () => query;
      query.limit = async () => rows;
      return query;
    }
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const q: Record<string, unknown> = {
            orderBy: vi.fn(async () => []),
            limit: vi.fn(async () => {
              const stored = [...taskStore.rows.values()];
              return stored.length > 0 ? [stored[0]] : [];
            }),
          };
          q.for = vi.fn(() => q);
          return q;
        }),
      })),
    };
  });
  db.transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(db));
  db.insert = vi.fn(() => ({
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
    email: 'idempotency-baseline@example.test',
  });

  dbState.select.mockClear();
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
// 2. POST /api/funds -- mechanism B (Redis-backed per-route middleware)
// ---------------------------------------------------------------------------
describe('mechanism B: POST /api/funds', () => {
  const payload = { name: 'Test Fund', size: 1000000, vintageYear: 2024 };

  it('deduplicates with explicit key (mechanism B replays)', async () => {
    const { surfaces, token } = await boot();

    for (const { name, app } of surfaces) {
      effects.createFund.mockClear();
      const key = `fund-b-dedup-${name}`;

      const r1 = await request(app)
        .post('/api/funds')
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send(payload);
      expect(r1.status, `${name} first call`).toBe(201);
      expect(r1.body.success, `${name} first call success`).toBe(true);

      // async store needs a tick to persist the response
      await new Promise((r) => setTimeout(r, 100));

      const r2 = await request(app)
        .post('/api/funds')
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send(payload);

      // Mechanism B replays cached response; handler NOT re-executed.
      expect(r2.status, `${name} replay status`).toBe(201);
      expect(r2.headers['idempotency-replay'], `${name} replay header`).toBe('true');
      expect(
        effects.createFund.mock.calls.length,
        `${name}: handler ran once (mechanism B dedup)`
      ).toBe(1);
    }
  });

  it('auto-generated key does NOT dedup identical payloads (baseline gap)', async () => {
    const { surfaces, token } = await boot();

    for (const { name, app } of surfaces) {
      effects.createFund.mockClear();

      const r1 = await request(app)
        .post('/api/funds')
        .auth(token, { type: 'bearer' })
        .send(payload);
      expect(r1.status, `${name} first call`).toBe(201);

      await new Promise((r) => setTimeout(r, 100));

      const r2 = await request(app)
        .post('/api/funds')
        .auth(token, { type: 'bearer' })
        .send(payload);
      expect(r2.status, `${name} second call`).toBe(201);

      // BASELINE: no dedup because auto-key generation never fires.
      // shouldAutoGenerateKey (idempotency.ts:159) checks req.path.startsWith('/api/funds'),
      // but funds router is mounted at '/api' so req.path is mount-relative '/funds',
      // which does not match the '/api/funds' prefix. No key = no dedup.
      // P1b MUST change this to 1.
      expect(
        effects.createFund.mock.calls.length,
        `${name}: handler ran twice (auto-key = no dedup)`
      ).toBe(2);
    }
  });

  it('rejects key reuse with different payload (fingerprint mismatch)', async () => {
    const { surfaces, token } = await boot();

    for (const { name, app } of surfaces) {
      effects.createFund.mockClear();
      const key = `fund-fingerprint-${name}`;

      const r1 = await request(app)
        .post('/api/funds')
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send({ name: 'Fund One', size: 1000000, vintageYear: 2024 });
      expect(r1.status, `${name} first call succeeds`).toBe(201);

      await new Promise((r) => setTimeout(r, 100));

      const r2 = await request(app)
        .post('/api/funds')
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send({ name: 'Fund Two', size: 2000000, vintageYear: 2025 });

      expect(r2.status, `${name} fingerprint mismatch`).toBe(422);
      expect(r2.body.error, `${name} conflict error code`).toBe('idempotency_key_reused');
      expect(
        effects.createFund.mock.calls.length,
        `${name}: mutation ran once despite two requests`
      ).toBe(1);
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

  it('first call 201 created, derived-key duplicate 200 joined', async () => {
    const { surfaces, token } = await boot();

    for (const { name, app } of surfaces) {
      effects.calculate.mockClear();
      const payload = calcPayloads[name]!;

      const r1 = await request(app)
        .post('/api/funds/calculate')
        .auth(token, { type: 'bearer' })
        .send(payload);
      expect(r1.status, `${name} first call: ${JSON.stringify(r1.body)}`).toBe(201);
      expect(r1.headers['idempotency-status'], `${name} first status header`).toBe('created');

      // Same payload = same derived key = join
      const r2 = await request(app)
        .post('/api/funds/calculate')
        .auth(token, { type: 'bearer' })
        .send(payload);
      expect(r2.status, `${name} joined call`).toBe(200);
      expect(r2.headers['idempotency-status'], `${name} joined status header`).toBe('joined');

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
      const stored = taskStore.rows.get(key)!;
      expect(stored.idempotencyKey).toBe(key);
      expect(stored.requestHash).toBe(taskHash);
      expect(stored.fundId).toBe(1);
      expect(stored.title).toBe('Test Task');
      expect(stored.status).toBe('open');

      const r2 = await request(app)
        .post('/api/funds/1/tasks')
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send(taskPayload);
      expect(r2.status, `${name} replay`).toBe(200);

      expect(taskStore.rows.size, `${name}: still one stored task`).toBe(1);
      expect(taskStore.rows.get(key), `${name}: stored row unchanged`).toBe(stored);
      expect(taskStore.insertAttempts, `${name}: 2 insert attempts`).toBe(2);
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
// 7. Database-backed route classification (16 patterns)
// ---------------------------------------------------------------------------
describe('database-backed route classification', () => {
  it('all 16 patterns are classified as database-backed', () => {
    const patterns: [string, string][] = [
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
    expect(patterns).toHaveLength(16);
  });
});
