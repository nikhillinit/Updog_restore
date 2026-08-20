import express from 'express';
import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import type { Queue as QueueType } from 'bullmq';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';
import { applyScenarioMigrations } from '../helpers/scenario-migrations';
import type { FundScenarioReserveCalculationQueuedV1 } from '../../shared/contracts/fund-scenario-sets-v1.contract';

const STARTUP_TIMEOUT_MS = 90_000;
const TEST_TIMEOUT_MS = 20_000;
const AUTH_SECRET = 'scenario-command-integration-secret-minimum-32-chars';
const AUTH_ISSUER = 'updog-api';
const AUTH_AUDIENCE = 'updog-client';
const ACTOR_LABEL = 'integration@example.com';

const replayScenarioSetId = '00000000-0000-0000-0000-00000000b001';
const lineageScenarioSetId = '00000000-0000-0000-0000-00000000b002';
const concurrencyScenarioSetId = '00000000-0000-0000-0000-00000000b003';
const sharedRunScenarioSetId = '00000000-0000-0000-0000-00000000b004';
const uncertainScenarioSetId = '00000000-0000-0000-0000-00000000b005';
const outageScenarioSetId = '00000000-0000-0000-0000-00000000b006';
const staleLeaseScenarioSetId = '00000000-0000-0000-0000-00000000b007';

type TestContextWithSkip = { skip?: () => void };
type CommandServiceModule =
  typeof import('../../server/services/fund-scenario-calculation-command-service');
type QueueServiceModule = typeof import('../../server/services/fund-scenario-calc-queue-service');
type ScenarioSetServiceModule = typeof import('../../server/services/fund-scenario-set-service');

interface Runtime {
  app: express.Express;
  pool: Pool;
  queue: QueueType;
  postgres: StartedPostgreSqlContainer;
  redis: StartedTestContainer;
  authHeader: string;
  fundId: number;
  lineageConfigId: number;
}

interface CommandReceiptRow {
  idempotency_key: string;
  status: string;
  request_hash: string;
  run_id: string | null;
  correlation_id: string | null;
  response_status: number | null;
  response_body: unknown;
  attempt_count: number;
  lease_token: string | null;
  failure_code: string | null;
}

let runtime: Runtime | null = null;
let skipReason: string | null = null;

// Shared across serially ordered cases below.
let replayFirstBody: FundScenarioReserveCalculationQueuedV1 | null = null;
let uncertainErrorMarker: string | null = null;
let outageErrorMarker: string | null = null;
let outageIdempotencyKey: string | null = null;

function visibleLocalSkip(ctx: TestContextWithSkip): boolean {
  if (!skipReason) {
    return false;
  }
  console.warn(`[fund-scenario-calculation-command] SKIP: ${skipReason}`);
  ctx.skip?.();
  return true;
}

function isContainerRuntimeUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /container runtime|docker|testcontainers/i.test(message);
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function seedCommandFixtures(pool: Pool): Promise<{
  fundId: number;
  lineageConfigId: number;
}> {
  const fund = await pool.query<{ id: number }>(
    `INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    ['Scenario Command Fund', '100000000.00', '0.0200', '0.2000', 2026]
  );
  const fundId = fund.rows[0]!.id;

  const primaryConfig = await pool.query<{ id: number }>(
    `INSERT INTO fundconfigs (fund_id, version, config, is_draft, is_published)
     VALUES ($1, 1, $2, false, true)
     RETURNING id`,
    [fundId, { fundName: 'Scenario Command Config' }]
  );
  const primaryConfigId = primaryConfig.rows[0]!.id;

  const lineageConfig = await pool.query<{ id: number }>(
    `INSERT INTO fundconfigs (fund_id, version, config, is_draft, is_published)
     VALUES ($1, 2, $2, false, true)
     RETURNING id`,
    [fundId, { fundName: 'Scenario Command Lineage Config' }]
  );
  const lineageConfigId = lineageConfig.rows[0]!.id;

  const company = await pool.query<{ id: number }>(
    `INSERT INTO portfoliocompanies (
       fund_id, name, sector, stage, investment_amount, current_valuation, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'active')
     RETURNING id`,
    [fundId, 'CommandCo', 'Software', 'seed', '1000000.00', '2500000.00']
  );
  const companyId = company.rows[0]!.id;

  await pool.query(
    `INSERT INTO investments (
       fund_id, company_id, investment_date, amount, round, ownership_percentage
     )
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [fundId, companyId, new Date('2026-01-01T00:00:00Z'), '1000000.00', 'seed', '0.1500']
  );

  const scenarioSets: Array<{ id: string; name: string; configId: number; reserveCents: number }> =
    [
      { id: replayScenarioSetId, name: 'Command replay', configId: primaryConfigId, reserveCents: 1_100_000_00 },
      { id: lineageScenarioSetId, name: 'Command lineage', configId: lineageConfigId, reserveCents: 1_200_000_00 },
      { id: concurrencyScenarioSetId, name: 'Command concurrency', configId: primaryConfigId, reserveCents: 1_300_000_00 },
      { id: sharedRunScenarioSetId, name: 'Command shared run', configId: primaryConfigId, reserveCents: 1_400_000_00 },
      { id: uncertainScenarioSetId, name: 'Command enqueue uncertain', configId: primaryConfigId, reserveCents: 1_500_000_00 },
      { id: outageScenarioSetId, name: 'Command queue outage', configId: primaryConfigId, reserveCents: 1_600_000_00 },
      { id: staleLeaseScenarioSetId, name: 'Command stale lease', configId: primaryConfigId, reserveCents: 1_700_000_00 },
    ];

  for (const set of scenarioSets) {
    await pool.query(
      `INSERT INTO fund_scenario_sets (
         id, fund_id, name, source_config_id, source_config_version, created_by_label, updated_by_label
       )
       VALUES ($1, $2, $3, $4, $5, $6, $6)`,
      [
        set.id,
        fundId,
        set.name,
        set.configId,
        set.configId === lineageConfigId ? 2 : 1,
        ACTOR_LABEL,
      ]
    );
    await pool.query(
      `INSERT INTO fund_scenario_variants (
         scenario_set_id, name, sort_order, override_type, override_payload
       )
       VALUES ($1, $2, 0, 'reserve_allocation', $3)`,
      [
        set.id,
        set.name,
        {
          items: [
            {
              companyId,
              plannedReservesCents: set.reserveCents,
              allocationReason: set.name,
            },
          ],
        },
      ]
    );
  }

  return { fundId, lineageConfigId };
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
  const pool = new Pool({ connectionString, max: 4 });

  await runMigrationsWithConnectionString(connectionString);
  await applyScenarioMigrations(pool);
  const { fundId, lineageConfigId } = await seedCommandFixtures(pool);

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
  process.env.FUND_SCENARIO_HARD_TIMEOUT_MS = '30000';

  const { default: scenarioRoutes } = await import('../../server/routes/fund-scenario-sets');
  const { signToken } = await import('../../server/lib/auth/jwt');

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', scenarioRoutes);

  const queue = new Queue('fund-scenario-calc', {
    connection: { host: redis.getHost(), port: redis.getMappedPort(6379) },
  });
  await queue.waitUntilReady();

  const authHeader = `Bearer ${signToken({
    sub: 'scenario-command-integration',
    email: ACTOR_LABEL,
    role: 'admin',
    fundIds: [fundId],
  })}`;

  return { app, pool, queue, postgres, redis, authHeader, fundId, lineageConfigId };
}

function activeRuntime(): Runtime {
  if (!runtime) throw new Error('command integration runtime was not initialized');
  return runtime;
}

async function postCalculateReserve(
  idempotencyKey: string,
  scenarioSetId: string,
  body: Record<string, unknown> = { calculationMode: 'async_reserve_allocation' }
): Promise<request.Response> {
  const active = activeRuntime();
  return request(active.app)
    .post(`/api/funds/${active.fundId}/scenario-sets/${scenarioSetId}/calculate-reserve`)
    .set('Authorization', active.authHeader)
    .set('Idempotency-Key', idempotencyKey)
    .send(body);
}

async function commandReceipts(scenarioSetId: string): Promise<CommandReceiptRow[]> {
  const active = activeRuntime();
  const result = await active.pool.query<CommandReceiptRow>(
    `SELECT idempotency_key, status, request_hash, run_id, correlation_id,
            response_status, response_body, attempt_count, lease_token, failure_code
       FROM fund_scenario_calculation_commands
      WHERE fund_id = $1
        AND scenario_set_id = $2
      ORDER BY created_at ASC, idempotency_key ASC`,
    [active.fundId, scenarioSetId]
  );
  return result.rows;
}

async function calculationRuns(
  scenarioSetId: string
): Promise<Array<{ id: string; status: string; correlation_id: string; job_id: string | null }>> {
  const active = activeRuntime();
  const result = await active.pool.query<{
    id: string;
    status: string;
    correlation_id: string;
    job_id: string | null;
  }>(
    `SELECT id, status, correlation_id, job_id
       FROM fund_scenario_calculation_runs
      WHERE fund_id = $1
        AND scenario_set_id = $2
      ORDER BY created_at ASC`,
    [active.fundId, scenarioSetId]
  );
  return result.rows;
}

async function queuedEventCount(scenarioSetId: string): Promise<number> {
  const active = activeRuntime();
  const result = await active.pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM fund_scenario_set_events
      WHERE scenario_set_id = $1
        AND event_type = 'calculation_queued'`,
    [scenarioSetId]
  );
  return Number(result.rows[0]?.count ?? '0');
}

async function jobsForScenarioSet(scenarioSetId: string): Promise<string[]> {
  const active = activeRuntime();
  const prefix = `reserve-scenario-${active.fundId}-${scenarioSetId}-`;
  const jobs = await active.queue.getJobs(['waiting', 'delayed', 'active', 'completed', 'failed']);
  return jobs
    .map((job) => job.id)
    .filter((id): id is string => typeof id === 'string' && id.startsWith(prefix));
}

function directCommandInput(scenarioSetId: string, idempotencyKey: string) {
  return {
    fundId: activeRuntime().fundId,
    scenarioSetId,
    idempotencyKey,
    request: { calculationMode: 'async_reserve_allocation' as const },
    actor: { userId: null, label: ACTOR_LABEL },
  };
}

describe('fund scenario reserve calculation command integration', () => {
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    try {
      runtime = await startRuntime();
    } catch (error) {
      if (process.env.CI || !isContainerRuntimeUnavailable(error)) {
        throw new Error(
          `Command receipt proof startup failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      skipReason = `Command receipt proof infrastructure unavailable locally: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }, STARTUP_TIMEOUT_MS * 2);

  afterAll(async () => {
    const { getRegisteredQueueRuntime } = await import('../../server/queues/registry');
    await getRegisteredQueueRuntime('fund-scenario-calc')?.close?.();
    await runtime?.queue.close();
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

  describe('sequential same-key replay', () => {
    const idempotencyKey = `cmd-int-replay-${randomUUID()}`;

    it(
      'returns identical 202 response objects for sequential same-key requests',
      async (ctx) => {
        if (visibleLocalSkip(ctx)) return;

        const first = await postCalculateReserve(idempotencyKey, replayScenarioSetId);
        expect(first.status, JSON.stringify(first.body)).toBe(202);
        const second = await postCalculateReserve(idempotencyKey, replayScenarioSetId);
        expect(second.status, JSON.stringify(second.body)).toBe(202);

        expect(JSON.parse(JSON.stringify(second.body))).toEqual(
          JSON.parse(JSON.stringify(first.body))
        );
        expect(first.body).toMatchObject({
          fundId: activeRuntime().fundId,
          scenarioSetId: replayScenarioSetId,
          calculationMode: 'async_reserve_allocation',
          status: 'queued',
        });
        replayFirstBody = first.body as FundScenarioReserveCalculationQueuedV1;
      },
      TEST_TIMEOUT_MS
    );

    it(
      'persists exactly one command receipt for the replayed key',
      async (ctx) => {
        if (visibleLocalSkip(ctx)) return;
        const receipts = await commandReceipts(replayScenarioSetId);
        expect(receipts).toHaveLength(1);
        expect(receipts[0]).toMatchObject({
          idempotency_key: idempotencyKey,
          status: 'completed',
          response_status: 202,
          attempt_count: 1,
          lease_token: null,
          failure_code: null,
        });
      },
      TEST_TIMEOUT_MS
    );

    it(
      'persists exactly one active-or-completed calculation run',
      async (ctx) => {
        if (visibleLocalSkip(ctx)) return;
        const runs = await calculationRuns(replayScenarioSetId);
        expect(runs).toHaveLength(1);
        expect(['queued', 'running', 'completed']).toContain(runs[0]!.status);
      },
      TEST_TIMEOUT_MS
    );

    it(
      'creates exactly one BullMQ job for the deterministic job id',
      async (ctx) => {
        if (visibleLocalSkip(ctx)) return;
        expect(replayFirstBody).not.toBeNull();
        const job = await activeRuntime().queue.getJob(replayFirstBody!.jobId);
        expect(job).toBeTruthy();
        expect(job!.id).toBe(replayFirstBody!.jobId);

        const jobIds = await jobsForScenarioSet(replayScenarioSetId);
        expect(jobIds).toEqual([replayFirstBody!.jobId]);
      },
      TEST_TIMEOUT_MS
    );

    it(
      'records exactly one calculation_queued event',
      async (ctx) => {
        if (visibleLocalSkip(ctx)) return;
        expect(await queuedEventCount(replayScenarioSetId)).toBe(1);
      },
      TEST_TIMEOUT_MS
    );

    it(
      'returns the persisted run correlation id in the response',
      async (ctx) => {
        if (visibleLocalSkip(ctx)) return;
        expect(replayFirstBody).not.toBeNull();
        const runs = await calculationRuns(replayScenarioSetId);
        expect(runs).toHaveLength(1);
        expect(replayFirstBody!.correlationId).toBe(runs[0]!.correlation_id);
        expect(replayFirstBody!.jobId).toBe(runs[0]!.job_id);
      },
      TEST_TIMEOUT_MS
    );

    it(
      'rejects the same key with a different request body as 422 idempotency_key_reused',
      async (ctx) => {
        if (visibleLocalSkip(ctx)) return;
        const reused = await postCalculateReserve(idempotencyKey, replayScenarioSetId, {});
        expect(reused.status, JSON.stringify(reused.body)).toBe(422);
        expect(reused.body.code).toBe('idempotency_key_reused');

        const receipts = await commandReceipts(replayScenarioSetId);
        expect(receipts).toHaveLength(1);
      },
      TEST_TIMEOUT_MS
    );
  });

  describe('input lineage change detection', () => {
    it(
      'rejects the same key as 422 after the source config lineage changes',
      async (ctx) => {
        if (visibleLocalSkip(ctx)) return;
        const active = activeRuntime();
        const idempotencyKey = `cmd-int-lineage-${randomUUID()}`;

        const first = await postCalculateReserve(idempotencyKey, lineageScenarioSetId);
        expect(first.status, JSON.stringify(first.body)).toBe(202);

        // The command hash pins the resolved input lineage (config body feeds
        // modelInputsAsOfDate, hash kind, and the reserve input hash). Editing
        // the pinned source config row is the lineage mutation the identity
        // resolver observes; a republished higher version is invisible to a
        // scenario set pinned to source_config_version.
        await active.pool.query(`UPDATE fundconfigs SET config = $2 WHERE id = $1`, [
          active.lineageConfigId,
          {
            fundName: 'Scenario Command Lineage Config',
            modelInputsAsOfDate: '2026-08-12',
          },
        ]);

        const replay = await postCalculateReserve(idempotencyKey, lineageScenarioSetId);
        expect(replay.status, JSON.stringify(replay.body)).toBe(422);
        expect(replay.body.code).toBe('idempotency_key_reused');
      },
      TEST_TIMEOUT_MS
    );
  });

  describe('concurrent same-key requests', () => {
    it(
      'converges two concurrent same-key requests onto one receipt, run, job, and event',
      async (ctx) => {
        if (visibleLocalSkip(ctx)) return;
        const idempotencyKey = `cmd-int-concurrent-${randomUUID()}`;

        const [first, second] = await Promise.all([
          postCalculateReserve(idempotencyKey, concurrencyScenarioSetId),
          postCalculateReserve(idempotencyKey, concurrencyScenarioSetId),
        ]);
        expect(first.status, JSON.stringify(first.body)).toBe(202);
        expect(second.status, JSON.stringify(second.body)).toBe(202);
        expect(JSON.parse(JSON.stringify(second.body))).toEqual(
          JSON.parse(JSON.stringify(first.body))
        );

        const receipts = await commandReceipts(concurrencyScenarioSetId);
        expect(receipts).toHaveLength(1);
        expect(receipts[0]).toMatchObject({ status: 'completed', response_status: 202 });

        const runs = await calculationRuns(concurrencyScenarioSetId);
        expect(runs).toHaveLength(1);
        expect(await jobsForScenarioSet(concurrencyScenarioSetId)).toEqual([
          (first.body as FundScenarioReserveCalculationQueuedV1).jobId,
        ]);
        expect(await queuedEventCount(concurrencyScenarioSetId)).toBe(1);
      },
      TEST_TIMEOUT_MS
    );
  });

  describe('different keys with the same input lineage', () => {
    it(
      'reuses the run identity across keys without duplicating the job or queued event',
      async (ctx) => {
        if (visibleLocalSkip(ctx)) return;
        const firstKey = `cmd-int-shared-a-${randomUUID()}`;
        const secondKey = `cmd-int-shared-b-${randomUUID()}`;

        const first = await postCalculateReserve(firstKey, sharedRunScenarioSetId);
        expect(first.status, JSON.stringify(first.body)).toBe(202);
        const second = await postCalculateReserve(secondKey, sharedRunScenarioSetId);
        expect(second.status, JSON.stringify(second.body)).toBe(202);

        const firstBody = first.body as FundScenarioReserveCalculationQueuedV1;
        const secondBody = second.body as FundScenarioReserveCalculationQueuedV1;
        expect(secondBody.jobId).toBe(firstBody.jobId);
        expect(secondBody.correlationId).toBe(firstBody.correlationId);

        const receipts = await commandReceipts(sharedRunScenarioSetId);
        expect(receipts).toHaveLength(2);
        expect(receipts.map((row) => row.status)).toEqual(['completed', 'completed']);
        expect(new Set(receipts.map((row) => row.run_id)).size).toBe(1);

        const runs = await calculationRuns(sharedRunScenarioSetId);
        expect(runs).toHaveLength(1);
        expect(await jobsForScenarioSet(sharedRunScenarioSetId)).toEqual([firstBody.jobId]);
        expect(await queuedEventCount(sharedRunScenarioSetId)).toBe(1);
      },
      TEST_TIMEOUT_MS
    );
  });

  describe('failure injection and recovery', () => {
    it(
      'recovers a post-enqueue receipt failure on retry with the same key',
      async (ctx) => {
        if (visibleLocalSkip(ctx)) return;
        const commandService: CommandServiceModule = await import(
          '../../server/services/fund-scenario-calculation-command-service'
        );
        const queueService: QueueServiceModule = await import(
          '../../server/services/fund-scenario-calc-queue-service'
        );
        const idempotencyKey = `cmd-int-uncertain-${randomUUID()}`;
        uncertainErrorMarker = `injected-enqueue-uncertain-${randomUUID()}`;

        let recordCalls = 0;
        const flakyRecordQueuedEventOnce: typeof queueService.recordReserveCalculationQueuedEventOnce =
          async (params) => {
            recordCalls += 1;
            if (recordCalls === 1) {
              throw new Error(uncertainErrorMarker!);
            }
            return queueService.recordReserveCalculationQueuedEventOnce(params);
          };

        await expect(
          commandService.executeReserveCalculationCommand(
            directCommandInput(uncertainScenarioSetId, idempotencyKey),
            {
              receiptWaitTimeoutMs: 500,
              deps: { recordQueuedEventOnce: flakyRecordQueuedEventOnce },
            }
          )
        ).rejects.toMatchObject({
          statusCode: 500,
          code: 'reserve_calculation_enqueue_uncertain',
        });

        const failedReceipts = await commandReceipts(uncertainScenarioSetId);
        expect(failedReceipts).toHaveLength(1);
        expect(failedReceipts[0]).toMatchObject({
          idempotency_key: idempotencyKey,
          status: 'failed',
          failure_code: 'QUEUE_ENQUEUE_UNCERTAIN',
          lease_token: null,
        });
        expect(JSON.stringify(failedReceipts[0])).not.toContain(uncertainErrorMarker);

        const retried = await commandService.executeReserveCalculationCommand(
          directCommandInput(uncertainScenarioSetId, idempotencyKey),
          {
            receiptWaitTimeoutMs: 500,
            deps: { recordQueuedEventOnce: flakyRecordQueuedEventOnce },
          }
        );
        expect(retried).toMatchObject({
          fundId: activeRuntime().fundId,
          scenarioSetId: uncertainScenarioSetId,
          calculationMode: 'async_reserve_allocation',
          status: 'queued',
        });

        const recoveredReceipts = await commandReceipts(uncertainScenarioSetId);
        expect(recoveredReceipts).toHaveLength(1);
        expect(recoveredReceipts[0]).toMatchObject({
          status: 'completed',
          response_status: 202,
          attempt_count: 2,
          failure_code: null,
        });

        const runs = await calculationRuns(uncertainScenarioSetId);
        expect(runs).toHaveLength(1);
        expect(await jobsForScenarioSet(uncertainScenarioSetId)).toEqual([retried.jobId]);
        expect(await queuedEventCount(uncertainScenarioSetId)).toBe(1);
      },
      TEST_TIMEOUT_MS
    );

    it(
      'records a deterministic queue outage as a failed QUEUE_UNAVAILABLE receipt with a released lease',
      async (ctx) => {
        if (visibleLocalSkip(ctx)) return;
        const commandService: CommandServiceModule = await import(
          '../../server/services/fund-scenario-calculation-command-service'
        );
        const scenarioSetService: ScenarioSetServiceModule = await import(
          '../../server/services/fund-scenario-set-service'
        );
        outageIdempotencyKey = `cmd-int-outage-${randomUUID()}`;
        outageErrorMarker = `injected-queue-outage-${randomUUID()}`;

        const throwingGetQueue = () => {
          throw scenarioSetService.createHttpError(503, outageErrorMarker!, {
            code: 'scenario_calculation_queue_unavailable',
          });
        };

        await expect(
          commandService.executeReserveCalculationCommand(
            directCommandInput(outageScenarioSetId, outageIdempotencyKey),
            {
              receiptWaitTimeoutMs: 500,
              deps: { getQueue: throwingGetQueue as never },
            }
          )
        ).rejects.toMatchObject({
          statusCode: 503,
          code: 'scenario_calculation_queue_unavailable',
        });

        const receipts = await commandReceipts(outageScenarioSetId);
        expect(receipts).toHaveLength(1);
        expect(receipts[0]).toMatchObject({
          idempotency_key: outageIdempotencyKey,
          status: 'failed',
          failure_code: 'QUEUE_UNAVAILABLE',
          lease_token: null,
          run_id: null,
          response_status: null,
        });

        expect(await calculationRuns(outageScenarioSetId)).toHaveLength(0);
        expect(await jobsForScenarioSet(outageScenarioSetId)).toEqual([]);
        expect(await queuedEventCount(outageScenarioSetId)).toBe(0);
      },
      TEST_TIMEOUT_MS
    );

    it(
      'stores only allowlisted failure codes and no raw exception text',
      async (ctx) => {
        if (visibleLocalSkip(ctx)) return;
        const active = activeRuntime();
        const allowlist = ['QUEUE_UNAVAILABLE', 'QUEUE_ENQUEUE_UNCERTAIN', 'COMMAND_FAILED'];

        // Guard against vacuous passes if file ordering ever changes: the
        // markers must have been planted by the two failure-injection cases.
        expect(uncertainErrorMarker).not.toBeNull();
        expect(outageErrorMarker).not.toBeNull();

        const rows = await active.pool.query<Record<string, unknown>>(
          `SELECT *
             FROM fund_scenario_calculation_commands
            WHERE fund_id = $1`,
          [active.fundId]
        );
        expect(rows.rows.length).toBeGreaterThan(0);
        for (const row of rows.rows) {
          const failureCode = row['failure_code'];
          expect(failureCode === null || allowlist.includes(String(failureCode))).toBe(true);
          const serialized = JSON.stringify(row);
          expect(serialized).not.toContain(uncertainErrorMarker!);
          expect(serialized).not.toContain(outageErrorMarker!);
        }
      },
      TEST_TIMEOUT_MS
    );

    it(
      'reclaims the failed outage receipt on retry with the same key',
      async (ctx) => {
        if (visibleLocalSkip(ctx)) return;
        const commandService: CommandServiceModule = await import(
          '../../server/services/fund-scenario-calculation-command-service'
        );
        expect(outageIdempotencyKey).not.toBeNull();

        const retried = await commandService.executeReserveCalculationCommand(
          directCommandInput(outageScenarioSetId, outageIdempotencyKey!),
          { receiptWaitTimeoutMs: 500 }
        );
        expect(retried).toMatchObject({
          scenarioSetId: outageScenarioSetId,
          status: 'queued',
        });

        const receipts = await commandReceipts(outageScenarioSetId);
        expect(receipts).toHaveLength(1);
        expect(receipts[0]).toMatchObject({
          status: 'completed',
          response_status: 202,
          attempt_count: 2,
          failure_code: null,
          lease_token: null,
        });
        expect(await calculationRuns(outageScenarioSetId)).toHaveLength(1);
        expect(await jobsForScenarioSet(outageScenarioSetId)).toEqual([retried.jobId]);
        expect(await queuedEventCount(outageScenarioSetId)).toBe(1);
      },
      TEST_TIMEOUT_MS
    );

    it(
      'refuses to finalize a receipt whose lease token was taken over mid-flight',
      async (ctx) => {
        if (visibleLocalSkip(ctx)) return;
        const active = activeRuntime();
        const commandService: CommandServiceModule = await import(
          '../../server/services/fund-scenario-calculation-command-service'
        );
        const queueService: QueueServiceModule = await import(
          '../../server/services/fund-scenario-calc-queue-service'
        );
        const idempotencyKey = `cmd-int-stale-lease-${randomUUID()}`;
        const foreignLeaseToken = randomUUID();

        const hijackingEnsureJob: typeof queueService.ensureReserveCalculationJob = async (
          params
        ) => {
          await active.pool.query(
            `UPDATE fund_scenario_calculation_commands
                SET lease_token = $1
              WHERE fund_id = $2
                AND scenario_set_id = $3
                AND idempotency_key = $4`,
            [foreignLeaseToken, active.fundId, staleLeaseScenarioSetId, idempotencyKey]
          );
          return queueService.ensureReserveCalculationJob(params);
        };

        await expect(
          commandService.executeReserveCalculationCommand(
            directCommandInput(staleLeaseScenarioSetId, idempotencyKey),
            {
              receiptWaitTimeoutMs: 500,
              deps: { ensureJob: hijackingEnsureJob },
            }
          )
        ).rejects.toMatchObject({
          statusCode: 409,
          code: 'idempotency_request_in_progress',
        });

        const receipts = await commandReceipts(staleLeaseScenarioSetId);
        expect(receipts).toHaveLength(1);
        expect(receipts[0]).toMatchObject({
          idempotency_key: idempotencyKey,
          status: 'pending',
          lease_token: foreignLeaseToken,
          response_status: null,
        });
      },
      TEST_TIMEOUT_MS
    );
  });
});
