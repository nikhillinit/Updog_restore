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

type TestContextWithSkip = { skip?: () => void };

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

  return {
    app,
    pool,
    queue,
    queueConnection: { host: redis.getHost(), port: redis.getMappedPort(6379) },
    workerHarness,
    postgres,
    redis,
    authHeader,
    fundId,
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

      let investmentsRenamed = false;
      try {
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
          investmentsRenamed = true;
        } finally {
          await active.queue!.resume();
        }

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

        const failedRuns = await active.pool.query<{
          id: string;
          status: string;
          snapshot_id: number | null;
        }>(
          `SELECT id, status, snapshot_id
           FROM fund_scenario_calculation_runs
          WHERE fund_id = $1
            AND scenario_set_id = $2
            AND job_id = $3
          ORDER BY created_at ASC, id ASC`,
          [active.fundId, failingScenarioSetId, jobId]
        );
        expect(failedRuns.rows.length).toBeGreaterThan(0);
        for (const run of failedRuns.rows) {
          expect(run).toMatchObject({ status: 'failed', snapshot_id: null });
          const failedEvents = await active.pool.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
             FROM fund_scenario_set_events
            WHERE scenario_set_id = $1
              AND event_type = 'calculation_failed'
              AND change_summary_json ->> 'run_id' = $2`,
            [failingScenarioSetId, run.id]
          );
          expect(failedEvents.rows[0]?.count).toBe('1');
        }
      } finally {
        if (investmentsRenamed) {
          await active.pool.query('ALTER TABLE investments_unavailable RENAME TO investments');
        }
      }
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

        const running = await waitForRunningScenarioRun(
          active.pool,
          completionRaceScenarioSetId
        );
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
      const identity = await getReserveScenarioCalculationIdentity(active.fundId, failingScenarioSetId);
      const queueName = `fund-scenario-calc-stale-${Date.now()}`;
      const staleQueue = new Queue<FundScenarioCalcJobData>(queueName, {
        connection: active.queueConnection,
      });
      const staleQueueEvents = new QueueEvents(queueName, { connection: active.queueConnection });
      const staleWorker = new Worker<FundScenarioCalcJobData>(queueName, handleFundScenarioCalcJob, {
        connection: active.queueConnection,
        concurrency: 1,
      });
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

        const runs = await active.pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM fund_scenario_calculation_runs
            WHERE scenario_set_id = $1`,
          [failingScenarioSetId]
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
