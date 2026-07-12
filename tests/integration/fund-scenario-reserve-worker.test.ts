import express from 'express';
import type { Queue, QueueEvents } from 'bullmq';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';
import { applyScenarioMigrations } from '../helpers/scenario-migrations';

const STARTUP_TIMEOUT_MS = 90_000;
const JOB_TIMEOUT_MS = 30_000;
const AUTH_SECRET = 'scenario-worker-integration-secret-minimum-32-chars';
const AUTH_ISSUER = 'updog-api';
const AUTH_AUDIENCE = 'updog-client';
const scenarioSetId = '00000000-0000-0000-0000-00000000a001';
const failingScenarioSetId = '00000000-0000-0000-0000-00000000a002';

type TestContextWithSkip = { skip?: () => void };

interface Runtime {
  app: express.Express;
  pool: Pool;
  queue: Queue | null;
  workerHarness: { queueEvents: QueueEvents; close: () => Promise<void> };
  postgres: StartedPostgreSqlContainer;
  redis: StartedTestContainer;
  authHeader: string;
  fundId: number;
}

let runtime: Runtime | null = null;
let skipReason: string | null = null;

function visibleLocalSkip(ctx: TestContextWithSkip): boolean {
  if (!skipReason) {
    return false;
  }

  console.warn(`[fund-scenario-reserve-worker] SKIP: ${skipReason}`);
  ctx.skip?.();
  return true;
}

function isContainerRuntimeUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /container runtime|docker|testcontainers/i.test(message);
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function seedScenarioFixtures(pool: Pool): Promise<{ fundId: number }> {
  const fund = await pool.query<{ id: number }>(
    `INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    ['Scenario Worker Fund', '100000000.00', '0.0200', '0.2000', 2026]
  );
  const fundId = fund.rows[0]!.id;

  const config = await pool.query<{ id: number }>(
    `INSERT INTO fundconfigs (fund_id, version, config, is_draft, is_published)
     VALUES ($1, $2, $3, false, true)
     RETURNING id`,
    [fundId, 1, { name: 'Scenario Worker Config' }]
  );
  const configId = config.rows[0]!.id;

  const company = await pool.query<{ id: number }>(
    `INSERT INTO portfoliocompanies (
       fund_id, name, sector, stage, investment_amount, current_valuation, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'active')
     RETURNING id`,
    [fundId, 'ScenarioCo', 'Software', 'seed', '1000000.00', '2500000.00']
  );
  const companyId = company.rows[0]!.id;

  await pool.query(
    `INSERT INTO investments (
       fund_id, company_id, investment_date, amount, round, ownership_percentage
     )
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [fundId, companyId, new Date('2026-01-01T00:00:00Z'), '1000000.00', 'seed', '0.1500']
  );

  await insertScenarioSet(pool, {
    fundId,
    configId,
    id: scenarioSetId,
    name: 'Reserve increase',
    companyId,
    plannedReservesCents: 1_500_000_00,
  });
  await insertScenarioSet(pool, {
    fundId,
    configId,
    id: failingScenarioSetId,
    name: 'Reserve failure',
    companyId,
    plannedReservesCents: 2_000_000_00,
  });

  return { fundId };
}

async function insertScenarioSet(
  pool: Pool,
  input: {
    fundId: number;
    configId: number;
    id: string;
    name: string;
    companyId: number;
    plannedReservesCents: number;
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO fund_scenario_sets (
       id, fund_id, name, source_config_id, source_config_version, created_by_label, updated_by_label
     )
     VALUES ($1, $2, $3, $4, 1, 'integration@example.com', 'integration@example.com')`,
    [input.id, input.fundId, input.name, input.configId]
  );

  await pool.query(
    `INSERT INTO fund_scenario_variants (
       scenario_set_id, name, sort_order, override_type, override_payload
     )
     VALUES ($1, $2, 0, 'reserve_allocation', $3)`,
    [
      input.id,
      input.name,
      {
        items: [
          {
            companyId: input.companyId,
            plannedReservesCents: input.plannedReservesCents,
            allocationReason: input.name,
          },
        ],
      },
    ]
  );
}

async function startRuntime(): Promise<Runtime> {
  const postgres = await new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_password')
    .withStartupTimeout(STARTUP_TIMEOUT_MS)
    .start();
  const redis = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/.*Ready to accept connections.*/))
    .withStartupTimeout(STARTUP_TIMEOUT_MS)
    .start();

  const connectionString = postgres.getConnectionUri();
  const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  const pool = new Pool({ connectionString, max: 2 });

  await runMigrationsWithConnectionString(connectionString);
  await applyScenarioMigrations(pool);
  const { fundId } = await seedScenarioFixtures(pool);

  vi.resetModules();
  process.env.NODE_ENV = 'test';
  process.env._EXPLICIT_NODE_ENV = 'test';
  process.env.DATABASE_URL = connectionString;
  process.env._EXPLICIT_DATABASE_URL = connectionString;
  process.env.USE_REAL_DB_IN_VITEST = '1';
  process.env.ENABLE_QUEUES = '1';
  process.env._EXPLICIT_ENABLE_QUEUES = '1';
  process.env.REDIS_URL = 'memory://';
  process.env._EXPLICIT_REDIS_URL = 'memory://';
  process.env.QUEUE_REDIS_URL = redisUrl;
  process.env._EXPLICIT_QUEUE_REDIS_URL = redisUrl;
  process.env.JWT_SECRET = AUTH_SECRET;
  process.env._EXPLICIT_JWT_SECRET = AUTH_SECRET;
  process.env.JWT_ISSUER = AUTH_ISSUER;
  process.env._EXPLICIT_JWT_ISSUER = AUTH_ISSUER;
  process.env.JWT_AUDIENCE = AUTH_AUDIENCE;
  process.env._EXPLICIT_JWT_AUDIENCE = AUTH_AUDIENCE;
  process.env.JWT_ALG = 'HS256';
  process.env._EXPLICIT_JWT_ALG = 'HS256';

  const { default: scenarioRoutes } = await import('../../server/routes/fund-scenario-sets');
  const { signToken } = await import('../../server/lib/auth/jwt');
  const { getRegisteredQueueRuntime } = await import('../../server/queues/registry');
  const { startInProcessFundScenarioCalcWorkerHarness } =
    await import('../../workers/fund-scenario-calc-worker-harness');

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', scenarioRoutes);

  const workerHarness = await startInProcessFundScenarioCalcWorkerHarness();
  const queue = getRegisteredQueueRuntime('fund-scenario-calc')?.getQueue() ?? null;

  const authHeader = `Bearer ${signToken({
    sub: 'scenario-worker-integration',
    email: 'integration@example.com',
    role: 'admin',
    fundIds: [fundId],
  })}`;

  return { app, pool, queue, workerHarness, postgres, redis, authHeader, fundId };
}

async function waitForJob(runtime: Runtime, jobId: string): Promise<void> {
  const job = await runtime.queue?.getJob(jobId);
  expect(job).toBeTruthy();
  await job!.waitUntilFinished(runtime.workerHarness.queueEvents, JOB_TIMEOUT_MS);
}

async function waitForFailedJob(runtime: Runtime, jobId: string): Promise<void> {
  const job = await runtime.queue?.getJob(jobId);
  expect(job).toBeTruthy();
  await expect(
    job!.waitUntilFinished(runtime.workerHarness.queueEvents, JOB_TIMEOUT_MS)
  ).rejects.toThrow();
}

describe('fund scenario reserve worker integration', () => {
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    try {
      runtime = await startRuntime();
    } catch (error) {
      if (process.env.CI || !isContainerRuntimeUnavailable(error)) {
        throw new Error(
          `Redis/Postgres worker proof startup failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      skipReason = `Redis/Postgres worker proof infrastructure unavailable locally: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }, STARTUP_TIMEOUT_MS * 2);

  afterAll(async () => {
    await runtime?.workerHarness.close();
    await runtime?.queue?.close();
    if (runtime) {
      const { closePool } = await import('../../server/db/pg-circuit');
      await Promise.all([closePool(), runtime.pool.end()]);
    }
    await runtime?.redis.stop();
    await runtime?.postgres.stop();
    restoreEnv(originalEnv);
    vi.resetModules();
  });

  it(
    'runs calculate-reserve through HTTP, BullMQ, worker, reserve service, status, and results',
    async (ctx) => {
      if (visibleLocalSkip(ctx)) return;
      expect(runtime).not.toBeNull();
      const active = runtime!;

      const queued = await request(active.app)
        .post(`/api/funds/${active.fundId}/scenario-sets/${scenarioSetId}/calculate-reserve`)
        .set('Authorization', active.authHeader)
        .send({ calculationMode: 'async_reserve_allocation' });
      expect(queued.status, JSON.stringify(queued.body)).toBe(202);

      expect(queued.body.status).toBe('queued');
      await waitForJob(active, queued.body.jobId);

      const status = await request(active.app)
        .get(`/api/funds/${active.fundId}/scenario-sets/${scenarioSetId}/calculation-status`)
        .set('Authorization', active.authHeader)
        .expect(200);

      expect(status.body).toMatchObject({
        status: 'succeeded',
        jobId: queued.body.jobId,
        correlationId: queued.body.correlationId,
      });
      expect(status.body.snapshotId).toEqual(expect.any(Number));

      const results = await request(active.app)
        .get(`/api/funds/${active.fundId}/scenario-sets/${scenarioSetId}/results`)
        .set('Authorization', active.authHeader)
        .expect(200);

      expect(results.body.payload.calculationMode).toBe('async_reserve_allocation');
      expect(results.body.payload.variants[0].reserve.allocations[0]).toMatchObject({
        companyId: expect.any(Number),
        plannedReservesCents: 1_500_000_00,
      });
    },
    JOB_TIMEOUT_MS + 15_000
  );

  it(
    'records a controlled worker failure without creating scenario results',
    async (ctx) => {
      if (visibleLocalSkip(ctx)) return;
      expect(runtime).not.toBeNull();
      const active = runtime!;

      expect(active.queue).not.toBeNull();
      await active.queue!.pause();
      let jobId = '';
      let correlationId = '';

      try {
        const queued = await request(active.app)
          .post(
            `/api/funds/${active.fundId}/scenario-sets/${failingScenarioSetId}/calculate-reserve`
          )
          .set('Authorization', active.authHeader)
          .send({ calculationMode: 'async_reserve_allocation' });
        expect(queued.status, JSON.stringify(queued.body)).toBe(202);
        jobId = queued.body.jobId;
        correlationId = queued.body.correlationId;

        await active.pool.query('ALTER TABLE investments RENAME TO investments_unavailable');
      } finally {
        await active.queue!.resume();
      }

      await waitForFailedJob(active, jobId);

      const status = await request(active.app)
        .get(`/api/funds/${active.fundId}/scenario-sets/${failingScenarioSetId}/calculation-status`)
        .set('Authorization', active.authHeader)
        .expect(200);

      expect(status.body).toMatchObject({
        status: 'failed',
        jobId,
        correlationId,
        snapshotId: null,
      });
      expect(status.body.lastError).toContain('investments');

      await request(active.app)
        .get(`/api/funds/${active.fundId}/scenario-sets/${failingScenarioSetId}/results`)
        .set('Authorization', active.authHeader)
        .expect(404);

      const snapshots = await active.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
       FROM fund_snapshots
       WHERE fund_id = $1
         AND scenario_set_id = $2
         AND type = 'SCENARIOS'`,
        [active.fundId, failingScenarioSetId]
      );
      expect(snapshots.rows[0]?.count).toBe('0');
    },
    JOB_TIMEOUT_MS + 15_000
  );
});
