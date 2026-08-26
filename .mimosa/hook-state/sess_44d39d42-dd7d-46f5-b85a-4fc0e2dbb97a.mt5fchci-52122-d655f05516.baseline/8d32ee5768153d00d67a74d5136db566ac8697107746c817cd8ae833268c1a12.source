import express from 'express';
import { randomUUID } from 'node:crypto';
import { Queue, QueueEvents, Worker } from 'bullmq';
import type { Queue as QueueType, QueueEvents as QueueEventsType } from 'bullmq';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';
import { applyScenarioMigrations } from '../helpers/scenario-migrations';
import type { FundScenarioCalcJobData } from '../../workers/fund-scenario-calc-handler';

const STARTUP_TIMEOUT_MS = 90_000;
const JOB_TIMEOUT_MS = 30_000;
const AUTH_SECRET = 'scenario-worker-integration-secret-minimum-32-chars';
const AUTH_ISSUER = 'updog-api';
const AUTH_AUDIENCE = 'updog-client';
const scenarioSetId = '00000000-0000-0000-0000-00000000a001';
const failingScenarioSetId = '00000000-0000-0000-0000-00000000a002';
const completionRaceScenarioSetId = '00000000-0000-0000-0000-00000000a003';
const transientScenarioSetId = '00000000-0000-0000-0000-00000000a004';
const permanentScenarioSetId = '00000000-0000-0000-0000-00000000a005';

type TestContextWithSkip = { skip?: () => void };

/**
 * Harness-local fault injected around the REAL claimed-run executor. Keyed by
 * scenario set so each truth case owns its own deterministic failure without
 * faulting production paths (no table renames, env flags, or request flags).
 */
type InjectedFault = (
  input: { scenarioSetId: string; attempt?: { number: number; limit: number } },
  next: () => Promise<unknown>
) => Promise<unknown>;

interface Runtime {
  app: express.Express;
  pool: Pool;
  queue: QueueType | null;
  queueConnection: { host: string; port: number };
  workerHarness: { queueEvents: QueueEventsType; close: () => Promise<void> };
  postgres: StartedPostgreSqlContainer;
  redis: StartedTestContainer;
  authHeader: string;
  fundId: number;
  injectedFaults: Map<string, InjectedFault>;
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

function withFundScenarioWorkerIdentity<T>(start: () => T): T {
  const previousWorkerType = process.env.WORKER_TYPE;
  process.env.WORKER_TYPE = 'fund-scenario-calc';
  try {
    return start();
  } finally {
    if (previousWorkerType === undefined) {
      delete process.env.WORKER_TYPE;
    } else {
      process.env.WORKER_TYPE = previousWorkerType;
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
    [fundId, 1, { fundName: 'Scenario Worker Config' }]
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
  await insertScenarioSet(pool, {
    fundId,
    configId,
    id: completionRaceScenarioSetId,
    name: 'Reserve completion race',
    companyId,
    plannedReservesCents: 2_500_000_00,
  });
  await insertScenarioSet(pool, {
    fundId,
    configId,
    id: transientScenarioSetId,
    name: 'Reserve transient retry',
    companyId,
    plannedReservesCents: 3_000_000_00,
  });
  await insertScenarioSet(pool, {
    fundId,
    configId,
    id: permanentScenarioSetId,
    name: 'Reserve permanent failure',
    companyId,
    plannedReservesCents: 3_500_000_00,
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
  process.env.FUND_SCENARIO_HARD_TIMEOUT_MS = '30000';
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
  const { startInProcessFundScenarioCalcWorkerHarness } =
    await import('../../workers/fund-scenario-calc-worker-harness');
  const { createFundScenarioCalcJobHandler } =
    await import('../../workers/fund-scenario-calc-handler');
  const reserveService =
    await import('../../server/services/fund-scenario-reserve-calculation-service');

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', scenarioRoutes);

  // Harness-local injection: the runner's claim, retry routing, and failure
  // persistence stay real; only the claimed-run executor consults the fault
  // map, delegating to the real executor when no fault is registered.
  const injectedFaults = new Map<string, InjectedFault>();
  const calculationHandler = createFundScenarioCalcJobHandler({
    runCalculation: reserveService.createReserveScenarioCalculationRunner({
      executeClaimedCalculation: async (input, claimed) => {
        const fault = injectedFaults.get(input.scenarioSetId);
        const next = () =>
          reserveService.executeClaimedReserveScenarioCalculation(input, claimed);
        if (fault) {
          return (await fault(input, next)) as Awaited<ReturnType<typeof next>>;
        }
        return next();
      },
    }),
  });

  const workerHarness = await withFundScenarioWorkerIdentity(() =>
    startInProcessFundScenarioCalcWorkerHarness({ calculationHandler })
  );
  const queueConnection = { host: redis.getHost(), port: redis.getMappedPort(6379) };
  const queue = new Queue('fund-scenario-calc', { connection: queueConnection });
  await queue.waitUntilReady();

  const authHeader = `Bearer ${signToken({
    sub: 'scenario-worker-integration',
    email: 'integration@example.com',
    role: 'admin',
    fundIds: [fundId],
  })}`;

  return {
    app,
    pool,
    queue,
    queueConnection,
    workerHarness,
    postgres,
    redis,
    authHeader,
    fundId,
    injectedFaults,
  };
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

async function waitForRunningScenarioRun(
  pool: Pool,
  scenarioSetIdToFind: string
): Promise<{ runId: string }> {
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await pool.query<{ id: string }>(
      `SELECT r.id
         FROM fund_scenario_calculation_runs r
        WHERE r.scenario_set_id = $1
          AND r.status = 'running'
          AND EXISTS (
            SELECT 1
              FROM fund_scenario_set_events e
             WHERE e.scenario_set_id = r.scenario_set_id
               AND e.event_type = 'calculation_started'
               AND e.change_summary_json ->> 'run_id' = r.id::text
          )
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT 1`,
      [scenarioSetIdToFind]
    );
    if (result.rows[0]) {
      return { runId: result.rows[0].id };
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for a durable running run for ${scenarioSetIdToFind}`);
}

async function waitForSnapshotWriteWaiter(pool: Pool): Promise<void> {
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await pool.query(
      `SELECT l.pid, l.mode
         FROM pg_locks l
         JOIN pg_class c ON c.oid = l.relation
        WHERE c.relname = 'fund_snapshots'
          AND l.granted = false
          AND l.mode = 'RowExclusiveLock'`
    );
    if (result.rows.length > 0) {
      return;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  throw new Error('Timed out waiting for the worker snapshot write lock waiter');
}

async function seedQueuedDeliveryRun(input: {
  pool: Pool;
  fundId: number;
  scenarioSetId: string;
  sourceConfigId: number;
  sourceConfigVersion: number;
  inputHash: string;
  hashKind: string;
  modelInputsAsOfDate: string | null;
  comparisonLineageVersion: string | null;
  jobId: string;
  correlationId: string;
  status?: 'queued' | 'failed';
}): Promise<string> {
  const runId = randomUUID();
  await input.pool.query(
    `INSERT INTO fund_scenario_calculation_runs (
       id, fund_id, scenario_set_id, source_config_id, source_config_version,
       calculation_mode, override_type, input_hash, hash_kind,
       model_inputs_as_of_date, comparison_lineage_version, job_id,
       correlation_id, status, deadline_at
     ) VALUES ($1, $2, $3, $4, $5, 'async_reserve_allocation', 'reserve_allocation',
       $6, $7, $8, $9, $10, $11, $12,
       clock_timestamp() + INTERVAL '30 seconds')`,
    [
      runId,
      input.fundId,
      input.scenarioSetId,
      input.sourceConfigId,
      input.sourceConfigVersion,
      input.inputHash,
      input.hashKind,
      input.modelInputsAsOfDate,
      input.comparisonLineageVersion,
      input.jobId,
      input.correlationId,
      input.status ?? 'queued',
    ]
  );
  return runId;
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
    const { getRegisteredQueueRuntime } = await import('../../server/queues/registry');
    await getRegisteredQueueRuntime('fund-scenario-calc')?.close?.();
    await runtime?.workerHarness.close();
    await runtime?.queue?.close();
    if (runtime) {
      const [{ closePool }, { closeDatabasePool }] = await Promise.all([
        import('../../server/db/pg-circuit'),
        import('../../server/db'),
      ]);
      await Promise.all([closePool(), closeDatabasePool(), runtime.pool.end()]);
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

      const missingKey = await request(active.app)
        .post(`/api/funds/${active.fundId}/scenario-sets/${scenarioSetId}/calculate-reserve`)
        .set('Authorization', active.authHeader)
        .send({ calculationMode: 'async_reserve_allocation' });
      expect(missingKey.status, JSON.stringify(missingKey.body)).toBe(428);
      expect(missingKey.body.error).toBe('idempotency_key_required');

      const queued = await request(active.app)
        .post(`/api/funds/${active.fundId}/scenario-sets/${scenarioSetId}/calculate-reserve`)
        .set('Authorization', active.authHeader)
        .set('Idempotency-Key', 'reserve-worker-happy-path')
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
    'sanitizes an injected ordinary worker failure and creates no scenario results',
    async (ctx) => {
      if (visibleLocalSkip(ctx)) return;
      expect(runtime).not.toBeNull();
      const active = runtime!;

      const secretMessage = 'password=super-secret-worker-credential';
      active.injectedFaults.set(failingScenarioSetId, async () => {
        // Ordinary error smuggling an unapproved code AND a secret-shaped
        // message: the owned normalizer must map it to the fixed fallback.
        throw Object.assign(new Error(`connection refused: ${secretMessage}`), {
          code: 'PERMANENT_WORKER_FAILURE',
        });
      });

      try {
        const queued = await request(active.app)
          .post(
            `/api/funds/${active.fundId}/scenario-sets/${failingScenarioSetId}/calculate-reserve`
          )
          .set('Authorization', active.authHeader)
          .set('Idempotency-Key', 'reserve-worker-controlled-failure')
          .send({ calculationMode: 'async_reserve_allocation' });
        expect(queued.status, JSON.stringify(queued.body)).toBe(202);
        const jobId = queued.body.jobId;
        const correlationId = queued.body.correlationId;

        await waitForFailedJob(active, jobId);

        const status = await request(active.app)
          .get(
            `/api/funds/${active.fundId}/scenario-sets/${failingScenarioSetId}/calculation-status`
          )
          .set('Authorization', active.authHeader)
          .expect(200);

        expect(status.body).toMatchObject({
          status: 'failed',
          jobId,
          correlationId,
          snapshotId: null,
        });
        expect(status.body.lastError).toBe(
          'Reserve scenario calculation failed during worker execution'
        );
        expect(JSON.stringify(status.body)).not.toContain(secretMessage);

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

        const failedRuns = await active.pool.query<{
          id: string;
          status: string;
          snapshot_id: number | null;
          failure_code: string | null;
          failure_message: string | null;
        }>(
          `SELECT id, status, snapshot_id, failure_code, failure_message
           FROM fund_scenario_calculation_runs
          WHERE fund_id = $1
            AND scenario_set_id = $2
            AND job_id = $3
          ORDER BY created_at ASC, id ASC`,
          [active.fundId, failingScenarioSetId, jobId]
        );
        expect(failedRuns.rows.length).toBeGreaterThan(0);
        for (const run of failedRuns.rows) {
          expect(run).toMatchObject({
            status: 'failed',
            snapshot_id: null,
            failure_code: 'WORKER_EXECUTION_FAILED',
            failure_message: 'Reserve scenario calculation failed during worker execution',
          });
          expect(JSON.stringify(run)).not.toContain(secretMessage);
          const failedEvents = await active.pool.query<{ change_summary_json: unknown }>(
            `SELECT change_summary_json
             FROM fund_scenario_set_events
            WHERE scenario_set_id = $1
              AND event_type = 'calculation_failed'
              AND change_summary_json ->> 'run_id' = $2`,
            [failingScenarioSetId, run.id]
          );
          expect(failedEvents.rows).toHaveLength(1);
          const summaryJson = JSON.stringify(failedEvents.rows[0]?.change_summary_json);
          expect(summaryJson).toContain('WORKER_EXECUTION_FAILED');
          expect(summaryJson).not.toContain(secretMessage);
          expect(summaryJson).not.toContain('connection refused');
        }
      } finally {
        active.injectedFaults.delete(failingScenarioSetId);
      }
    },
    JOB_TIMEOUT_MS + 15_000
  );

  it(
    'retries an injected transient failure on the same job and run, succeeding on attempt two',
    async (ctx) => {
      if (visibleLocalSkip(ctx)) return;
      expect(runtime).not.toBeNull();
      const active = runtime!;
      const { ReserveWorkerTransientFailureError } =
        await import('../../server/services/fund-scenario-reserve-calculation-service');

      active.injectedFaults.set(transientScenarioSetId, async (input, next) => {
        if (input.attempt?.number === 1) {
          throw new ReserveWorkerTransientFailureError('injected transient worker failure');
        }
        return next();
      });

      try {
        const queued = await request(active.app)
          .post(
            `/api/funds/${active.fundId}/scenario-sets/${transientScenarioSetId}/calculate-reserve`
          )
          .set('Authorization', active.authHeader)
          .set('Idempotency-Key', 'reserve-worker-transient-retry')
          .send({ calculationMode: 'async_reserve_allocation' });
        expect(queued.status, JSON.stringify(queued.body)).toBe(202);
        const jobId = queued.body.jobId as string;
        const correlationId = queued.body.correlationId as string;

        await waitForJob(active, jobId);

        const status = await request(active.app)
          .get(
            `/api/funds/${active.fundId}/scenario-sets/${transientScenarioSetId}/calculation-status`
          )
          .set('Authorization', active.authHeader)
          .expect(200);
        expect(status.body).toMatchObject({
          status: 'succeeded',
          jobId,
          correlationId,
        });
        expect(status.body.snapshotId).toEqual(expect.any(Number));

        const receipts = await active.pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM fund_scenario_calculation_commands
            WHERE scenario_set_id = $1`,
          [transientScenarioSetId]
        );
        expect(receipts.rows[0]?.count).toBe('1');

        const runs = await active.pool.query<{ id: string; status: string }>(
          `SELECT id, status
             FROM fund_scenario_calculation_runs
            WHERE scenario_set_id = $1`,
          [transientScenarioSetId]
        );
        expect(runs.rows).toHaveLength(1);
        expect(runs.rows[0]?.status).toBe('completed');
        const runId = runs.rows[0]!.id;

        const queuedEvents = await active.pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM fund_scenario_set_events
            WHERE scenario_set_id = $1
              AND event_type = 'calculation_queued'`,
          [transientScenarioSetId]
        );
        expect(queuedEvents.rows[0]?.count).toBe('1');

        const startedEvents = await active.pool.query<{
          attempt_number: string | null;
          attempt_limit: string | null;
        }>(
          `SELECT change_summary_json ->> 'attempt_number' AS attempt_number,
                  change_summary_json ->> 'attempt_limit' AS attempt_limit
             FROM fund_scenario_set_events
            WHERE scenario_set_id = $1
              AND event_type = 'calculation_started'
              AND change_summary_json ->> 'run_id' = $2
            ORDER BY id ASC`,
          [transientScenarioSetId, runId]
        );
        expect(
          startedEvents.rows
            .map((row) => `${row.attempt_number}/${row.attempt_limit}`)
            .sort()
        ).toEqual(['1/2', '2/2']);

        const calculatedEvents = await active.pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM fund_scenario_set_events
            WHERE scenario_set_id = $1
              AND event_type = 'calculated'`,
          [transientScenarioSetId]
        );
        expect(calculatedEvents.rows[0]?.count).toBe('1');

        const snapshots = await active.pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM fund_snapshots
            WHERE fund_id = $1
              AND scenario_set_id = $2
              AND type = 'SCENARIOS'`,
          [active.fundId, transientScenarioSetId]
        );
        expect(snapshots.rows[0]?.count).toBe('1');
      } finally {
        active.injectedFaults.delete(transientScenarioSetId);
      }
    },
    JOB_TIMEOUT_MS + 15_000
  );

  it(
    'exhausts attempts on an injected permanent failure, replays the stored 202, and recovers only by new intent',
    async (ctx) => {
      if (visibleLocalSkip(ctx)) return;
      expect(runtime).not.toBeNull();
      const active = runtime!;
      const { ReserveWorkerPermanentFailureError } =
        await import('../../server/services/fund-scenario-reserve-calculation-service');

      active.injectedFaults.set(permanentScenarioSetId, async () => {
        throw new ReserveWorkerPermanentFailureError('internal-detail-never-persisted');
      });

      try {
        const queued = await request(active.app)
          .post(
            `/api/funds/${active.fundId}/scenario-sets/${permanentScenarioSetId}/calculate-reserve`
          )
          .set('Authorization', active.authHeader)
          .set('Idempotency-Key', 'reserve-worker-permanent-failure')
          .send({ calculationMode: 'async_reserve_allocation' });
        expect(queued.status, JSON.stringify(queued.body)).toBe(202);
        const jobId = queued.body.jobId as string;

        await waitForFailedJob(active, jobId);

        const status = await request(active.app)
          .get(
            `/api/funds/${active.fundId}/scenario-sets/${permanentScenarioSetId}/calculation-status`
          )
          .set('Authorization', active.authHeader)
          .expect(200);
        expect(status.body).toMatchObject({ status: 'failed', jobId, snapshotId: null });
        expect(status.body.lastError).toBe(
          'Reserve scenario calculation failed permanently in the worker'
        );
        expect(JSON.stringify(status.body)).not.toContain('internal-detail-never-persisted');

        const failedRuns = await active.pool.query<{
          id: string;
          status: string;
          failure_code: string | null;
          snapshot_id: number | null;
        }>(
          `SELECT id, status, failure_code, snapshot_id
             FROM fund_scenario_calculation_runs
            WHERE scenario_set_id = $1`,
          [permanentScenarioSetId]
        );
        expect(failedRuns.rows).toHaveLength(1);
        expect(failedRuns.rows[0]).toMatchObject({
          status: 'failed',
          failure_code: 'PERMANENT_WORKER_FAILURE',
          snapshot_id: null,
        });
        const failedRunId = failedRuns.rows[0]!.id;

        const startedEvents = await active.pool.query<{
          attempt_number: string | null;
          attempt_limit: string | null;
        }>(
          `SELECT change_summary_json ->> 'attempt_number' AS attempt_number,
                  change_summary_json ->> 'attempt_limit' AS attempt_limit
             FROM fund_scenario_set_events
            WHERE scenario_set_id = $1
              AND event_type = 'calculation_started'
              AND change_summary_json ->> 'run_id' = $2
            ORDER BY id ASC`,
          [permanentScenarioSetId, failedRunId]
        );
        expect(
          startedEvents.rows
            .map((row) => `${row.attempt_number}/${row.attempt_limit}`)
            .sort()
        ).toEqual(['1/2', '2/2']);

        const failedEvents = await active.pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM fund_scenario_set_events
            WHERE scenario_set_id = $1
              AND event_type = 'calculation_failed'
              AND change_summary_json ->> 'run_id' = $2`,
          [permanentScenarioSetId, failedRunId]
        );
        expect(failedEvents.rows[0]?.count).toBe('1');

        // Command receipt is completed with no active lease.
        const commands = await active.pool.query<{
          status: string;
          lease_token: string | null;
        }>(
          `SELECT status, lease_token
             FROM fund_scenario_calculation_commands
            WHERE scenario_set_id = $1`,
          [permanentScenarioSetId]
        );
        expect(commands.rows).toHaveLength(1);
        expect(commands.rows[0]).toMatchObject({ status: 'completed', lease_token: null });

        // Replaying the ORIGINAL command key after the terminal worker
        // failure returns the exact stored 202 acknowledgement and does not
        // manufacture another run.
        const replay = await request(active.app)
          .post(
            `/api/funds/${active.fundId}/scenario-sets/${permanentScenarioSetId}/calculate-reserve`
          )
          .set('Authorization', active.authHeader)
          .set('Idempotency-Key', 'reserve-worker-permanent-failure')
          .send({ calculationMode: 'async_reserve_allocation' });
        expect(replay.status, JSON.stringify(replay.body)).toBe(202);
        expect(replay.body).toEqual(queued.body);

        const runsAfterReplay = await active.pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM fund_scenario_calculation_runs
            WHERE scenario_set_id = $1`,
          [permanentScenarioSetId]
        );
        expect(runsAfterReplay.rows[0]?.count).toBe('1');

        // A NEW explicit intent (new key) follows the failed-run recovery
        // contract: it mints a new run and a new job identity and succeeds
        // once the fault is cleared.
        active.injectedFaults.delete(permanentScenarioSetId);
        const recovery = await request(active.app)
          .post(
            `/api/funds/${active.fundId}/scenario-sets/${permanentScenarioSetId}/calculate-reserve`
          )
          .set('Authorization', active.authHeader)
          .set('Idempotency-Key', 'reserve-worker-permanent-recovery')
          .send({ calculationMode: 'async_reserve_allocation' });
        expect(recovery.status, JSON.stringify(recovery.body)).toBe(202);
        expect(recovery.body.jobId).not.toBe(jobId);
        expect(recovery.body.correlationId).not.toBe(queued.body.correlationId);

        await waitForJob(active, recovery.body.jobId);
        const recoveredStatus = await request(active.app)
          .get(
            `/api/funds/${active.fundId}/scenario-sets/${permanentScenarioSetId}/calculation-status`
          )
          .set('Authorization', active.authHeader)
          .expect(200);
        expect(recoveredStatus.body).toMatchObject({
          status: 'succeeded',
          jobId: recovery.body.jobId,
          correlationId: recovery.body.correlationId,
        });

        const runsAfterRecovery = await active.pool.query<{ id: string; status: string }>(
          `SELECT id, status
             FROM fund_scenario_calculation_runs
            WHERE scenario_set_id = $1
            ORDER BY created_at ASC, id ASC`,
          [permanentScenarioSetId]
        );
        expect(runsAfterRecovery.rows).toHaveLength(2);
        expect(runsAfterRecovery.rows[0]).toMatchObject({ id: failedRunId, status: 'failed' });
        expect(runsAfterRecovery.rows[1]?.status).toBe('completed');
      } finally {
        active.injectedFaults.delete(permanentScenarioSetId);
      }
    },
    JOB_TIMEOUT_MS * 2 + 15_000
  );

  it(
    'returns a typed bounded polling timeout that preserves identity and never substitutes an older success',
    async (ctx) => {
      if (visibleLocalSkip(ctx)) return;
      expect(runtime).not.toBeNull();
      const active = runtime!;
      const { pollReleaseCanaryWorkerStatus, RELEASE_CANARY_WORKER_TIMEOUT } =
        await import('../smoke/support/release-canary-polling');

      // The happy-path test above left a terminal SUCCESS on scenarioSetId
      // with a different correlation. Polling for a NEWER command identity on
      // the same scenario set must time out typed instead of accepting it.
      const newerCorrelationId = randomUUID();
      const newerJobId = `newer-command-${Date.now()}`;
      let elapsedMs = 0;

      const result = await pollReleaseCanaryWorkerStatus(
        {
          fundId: active.fundId,
          scenarioSetId,
          jobId: newerJobId,
          correlationId: newerCorrelationId,
        },
        {
          fetchStatus: async () => {
            const response = await request(active.app)
              .get(`/api/funds/${active.fundId}/scenario-sets/${scenarioSetId}/calculation-status`)
              .set('Authorization', active.authHeader);
            return { status: response.status, body: response.body };
          },
          now: () => elapsedMs,
          sleep: async () => {
            elapsedMs += 1_000;
          },
          deadlineMs: 3_000,
          intervalMs: 1_000,
        }
      );

      expect(result.kind).toBe(RELEASE_CANARY_WORKER_TIMEOUT);
      if (result.kind !== RELEASE_CANARY_WORKER_TIMEOUT) return;
      expect(result.fundId).toBe(active.fundId);
      expect(result.scenarioSetId).toBe(scenarioSetId);
      expect(result.jobId).toBe(newerJobId);
      expect(result.correlationId).toBe(newerCorrelationId);
      expect(result.observedStatuses).toContain('mismatched-execution');
      // The older run's success is visible in the last body but was never
      // accepted as this execution's evidence.
      expect(result.lastBody).toMatchObject({ status: 'succeeded' });
    },
    JOB_TIMEOUT_MS + 15_000
  );

  it(
    'rolls back a blocked completion when the claimed run is terminalized by another owner',
    async (ctx) => {
      if (visibleLocalSkip(ctx)) return;
      expect(runtime).not.toBeNull();
      const active = runtime!;
      const { handleFundScenarioCalcJob } =
        await import('../../workers/fund-scenario-calc-handler');
      const { getReserveScenarioCalculationIdentity } =
        await import('../../server/services/fund-scenario-reserve-calculation-service');
      const identity = await getReserveScenarioCalculationIdentity(
        active.fundId,
        completionRaceScenarioSetId
      );
      const raceJobId = `race-${Date.now()}`;
      const raceRunId = await seedQueuedDeliveryRun({
        pool: active.pool,
        fundId: active.fundId,
        scenarioSetId: completionRaceScenarioSetId,
        sourceConfigId: identity.sourceConfigId,
        sourceConfigVersion: identity.sourceConfigVersion,
        inputHash: identity.inputHash,
        hashKind: identity.inputLineage.hashKind,
        modelInputsAsOfDate: identity.inputLineage.modelInputsAsOfDate,
        comparisonLineageVersion: identity.inputLineage.comparisonLineageVersion,
        jobId: raceJobId,
        correlationId: '00000000-0000-4333-8333-000000000003',
      });

      const raceQueueName = `fund-scenario-calc-race-${Date.now()}`;
      const raceQueue = new Queue<FundScenarioCalcJobData>(raceQueueName, {
        connection: active.queueConnection,
      });
      const raceQueueEvents = new QueueEvents(raceQueueName, {
        connection: active.queueConnection,
      });
      const raceWorker = new Worker<FundScenarioCalcJobData>(
        raceQueueName,
        handleFundScenarioCalcJob,
        {
          connection: active.queueConnection,
          concurrency: 1,
          lockDuration: 300_000,
        }
      );
      const barrierClient = await active.pool.connect();
      let processorPromise: Promise<unknown> | null = null;

      try {
        await barrierClient.query('BEGIN');
        // SHARE (not ACCESS EXCLUSIVE): the claim's INSERT ... ON CONFLICT on
        // fund_scenario_calculation_runs pre-acquires RowShareLock on every
        // FK-referenced table (including fund_snapshots) even for NULL FK
        // values, so an ACCESS EXCLUSIVE barrier deadlocks the claim itself.
        // SHARE admits RowShareLock but still blocks the completion snapshot
        // INSERT (RowExclusiveLock).
        await barrierClient.query('LOCK TABLE fund_snapshots IN SHARE MODE');

        const raceJob = await raceQueue.add(
          'async_reserve_allocation',
          {
            fundId: active.fundId,
            scenarioSetId: completionRaceScenarioSetId,
            correlationId: '00000000-0000-4333-8333-000000000003',
            calculationMode: 'async_reserve_allocation',
            runId: raceRunId,
            actor: { userId: null, label: 'integration@example.com' },
          },
          {
            jobId: raceJobId,
            // This direct race proof intentionally uses one delivery; the
            // production HTTP queue remains configured with attempts: 2.
            attempts: 1,
            removeOnComplete: false,
            removeOnFail: false,
          }
        );
        processorPromise = raceJob.waitUntilFinished(raceQueueEvents, JOB_TIMEOUT_MS);

        const running = await waitForRunningScenarioRun(active.pool, completionRaceScenarioSetId);
        await waitForSnapshotWriteWaiter(active.pool);

        const terminalized = await active.pool.query(
          `UPDATE fund_scenario_calculation_runs
              SET status = 'failed',
                  failure_code = 'synthetic_terminalization',
                  failure_message = 'completion race test terminalized the run',
                  failed_at = NOW(),
                  updated_at = NOW()
            WHERE id = $1
              AND status = 'running'
            RETURNING id`,
          [running.runId]
        );
        expect(terminalized.rows).toHaveLength(1);

        await barrierClient.query('ROLLBACK');
        await expect(processorPromise).resolves.toBeNull();

        const runAfterRace = await active.pool.query<{
          status: string;
          snapshot_id: number | null;
        }>(
          `SELECT status, snapshot_id
             FROM fund_scenario_calculation_runs
            WHERE id = $1`,
          [running.runId]
        );
        expect(runAfterRace.rows[0]).toMatchObject({ status: 'failed', snapshot_id: null });

        const calculatedEvents = await active.pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM fund_scenario_set_events
            WHERE scenario_set_id = $1
              AND event_type = 'calculated'
              AND change_summary_json ->> 'run_id' = $2`,
          [completionRaceScenarioSetId, running.runId]
        );
        expect(calculatedEvents.rows[0]?.count).toBe('0');

        const failedEvents = await active.pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM fund_scenario_set_events
            WHERE scenario_set_id = $1
              AND event_type = 'calculation_failed'
              AND change_summary_json ->> 'run_id' = $2`,
          [completionRaceScenarioSetId, running.runId]
        );
        expect(failedEvents.rows[0]?.count).toBe('0');
      } finally {
        await processorPromise?.catch(() => undefined);
        await barrierClient.query('ROLLBACK').catch(() => undefined);
        barrierClient.release();
        await raceWorker.close();
        await raceQueueEvents.close();
        await raceQueue.close();
      }
    },
    JOB_TIMEOUT_MS * 2 + 15_000
  );

  it(
    'ignores a stale delivery without creating a replacement run',
    async (ctx) => {
      if (visibleLocalSkip(ctx)) return;
      expect(runtime).not.toBeNull();
      const active = runtime!;
      const { getReserveScenarioCalculationIdentity } =
        await import('../../server/services/fund-scenario-reserve-calculation-service');
      const { handleFundScenarioCalcJob } =
        await import('../../workers/fund-scenario-calc-handler');
      const identity = await getReserveScenarioCalculationIdentity(
        active.fundId,
        failingScenarioSetId
      );
      const queueName = `fund-scenario-calc-stale-${Date.now()}`;
      const staleQueue = new Queue<FundScenarioCalcJobData>(queueName, {
        connection: active.queueConnection,
      });
      const staleQueueEvents = new QueueEvents(queueName, { connection: active.queueConnection });
      const staleWorker = new Worker<FundScenarioCalcJobData>(
        queueName,
        handleFundScenarioCalcJob,
        {
          connection: active.queueConnection,
          concurrency: 1,
        }
      );
      const jobId = `stale-${Date.now()}`;
      const runId = await seedQueuedDeliveryRun({
        pool: active.pool,
        fundId: active.fundId,
        scenarioSetId: failingScenarioSetId,
        sourceConfigId: identity.sourceConfigId,
        sourceConfigVersion: identity.sourceConfigVersion,
        inputHash: identity.inputHash,
        hashKind: identity.inputLineage.hashKind,
        modelInputsAsOfDate: identity.inputLineage.modelInputsAsOfDate,
        comparisonLineageVersion: identity.inputLineage.comparisonLineageVersion,
        jobId,
        correlationId: '00000000-0000-4333-8333-000000000004',
        status: 'failed',
      });

      try {
        const job = await staleQueue.add(
          'async_reserve_allocation',
          {
            fundId: active.fundId,
            scenarioSetId: failingScenarioSetId,
            correlationId: '00000000-0000-4333-8333-000000000004',
            calculationMode: 'async_reserve_allocation',
            runId,
            actor: { userId: null, label: 'integration@example.com' },
          },
          { jobId, attempts: 1, removeOnComplete: false, removeOnFail: false }
        );
        await expect(job.waitUntilFinished(staleQueueEvents, JOB_TIMEOUT_MS)).resolves.toBeNull();

        // Count only rows carrying this delivery's job id: the controlled
        // failure test above legitimately leaves its own terminal row on the
        // same scenario set, so a set-wide count is order-dependent.
        const runs = await active.pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM fund_scenario_calculation_runs
            WHERE scenario_set_id = $1
              AND job_id = $2`,
          [failingScenarioSetId, jobId]
        );
        expect(runs.rows[0]?.count).toBe('1');
      } finally {
        await staleWorker.close();
        await staleQueueEvents.close();
        await staleQueue.close();
      }
    },
    JOB_TIMEOUT_MS + 15_000
  );
});
