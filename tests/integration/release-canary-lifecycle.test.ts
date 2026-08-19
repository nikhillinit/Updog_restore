import { randomUUID } from 'node:crypto';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Queue } from 'bullmq';
import type { QueueEvents } from 'bullmq';
import { drizzle } from 'drizzle-orm/node-postgres';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  evaluateCanaryResidue,
  RELEASE_CANARY_RUNS_QUERY,
} from '../../scripts/release/assert-canary-residue.mjs';
import { applyScenarioMigrations } from '../helpers/scenario-migrations';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const STARTUP_TIMEOUT_MS = 90_000;
const JOB_TIMEOUT_MS = 60_000;
const CANARY_SHA = 'c'.repeat(40);
// Caps accommodate the reserved vector plus the first run's rows; a second
// creation while the first run is active rejects on the one-active-run rule
// (CanaryActiveRunError), which preflight enforces before any cap check.
// The total cap must equal the sum of the ten group caps.
const CANARY_POLICY = {
  portfolioCompany: 3,
  fund: 3,
  fundConfig: 3,
  fundEvent: 12,
  notification: 0,
  grant: 3,
  calculation: 36,
  mutationReceipt: 6,
  scenario: 21,
  reporting: 33,
  total: 120,
  ttlHours: 24,
} as const;

interface WorkerHarness {
  queueEvents: QueueEvents;
  close: () => Promise<void>;
}

interface Runtime {
  postgres: StartedPostgreSqlContainer;
  redis: StartedTestContainer;
  pool: Pool;
  queue: Queue;
  workerHarness: WorkerHarness;
}

const originalEnv = { ...process.env };
let runtime: Runtime | null = null;
let skipReason: string | null = null;

function restoreEnv(snapshot: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function isContainerRuntimeUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /container runtime|docker|testcontainers/i.test(message);
}

function setRuntimeEnv(connectionString: string, redisUrl: string): void {
  const values: Record<string, string> = {
    NODE_ENV: 'test',
    _EXPLICIT_NODE_ENV: 'test',
    DATABASE_URL: connectionString,
    _EXPLICIT_DATABASE_URL: connectionString,
    USE_REAL_DB_IN_VITEST: '1',
    ENABLE_QUEUES: '1',
    _EXPLICIT_ENABLE_QUEUES: '1',
    REDIS_URL: 'memory://',
    _EXPLICIT_REDIS_URL: 'memory://',
    QUEUE_REDIS_URL: redisUrl,
    _EXPLICIT_QUEUE_REDIS_URL: redisUrl,
    WORKER_TYPE: 'fund-scenario-calc',
    VERCEL_GIT_COMMIT_SHA: CANARY_SHA,
    RELEASE_CANARY_MAX_PORTFOLIO_COMPANY_RESIDUE: String(CANARY_POLICY.portfolioCompany),
    RELEASE_CANARY_MAX_FUND_RESIDUE: String(CANARY_POLICY.fund),
    RELEASE_CANARY_MAX_FUND_CONFIG_RESIDUE: String(CANARY_POLICY.fundConfig),
    RELEASE_CANARY_MAX_FUND_EVENT_RESIDUE: String(CANARY_POLICY.fundEvent),
    RELEASE_CANARY_MAX_NOTIFICATION_RESIDUE: String(CANARY_POLICY.notification),
    RELEASE_CANARY_MAX_GRANT_RESIDUE: String(CANARY_POLICY.grant),
    RELEASE_CANARY_MAX_CALCULATION_RESIDUE: String(CANARY_POLICY.calculation),
    RELEASE_CANARY_MAX_MUTATION_RECEIPT_RESIDUE: String(CANARY_POLICY.mutationReceipt),
    RELEASE_CANARY_MAX_SCENARIO_RESIDUE: String(CANARY_POLICY.scenario),
    RELEASE_CANARY_MAX_REPORTING_RESIDUE: String(CANARY_POLICY.reporting),
    RELEASE_CANARY_MAX_TOTAL_RESIDUE: String(CANARY_POLICY.total),
    RELEASE_CANARY_TTL_HOURS: String(CANARY_POLICY.ttlHours),
    FUND_SCENARIO_HARD_TIMEOUT_MS: '30000',
  };

  for (const [key, value] of Object.entries(values)) process.env[key] = value;
}

async function startRuntime(): Promise<Runtime> {
  let postgres: StartedPostgreSqlContainer | undefined;
  let redis: StartedTestContainer | undefined;
  let pool: Pool | undefined;
  let queue: Queue | undefined;
  let workerHarness: WorkerHarness | undefined;

  try {
    postgres = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_password')
      .withStartupTimeout(STARTUP_TIMEOUT_MS)
      .start();
    redis = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage(/.*Ready to accept connections.*/))
      .withStartupTimeout(STARTUP_TIMEOUT_MS)
      .start();

    const connectionString = postgres.getConnectionUri();
    const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
    pool = new Pool({ connectionString, max: 5 });
    await runMigrationsWithConnectionString(connectionString);
    await applyScenarioMigrations(pool);

    setRuntimeEnv(connectionString, redisUrl);
    vi.resetModules();
    const { startInProcessFundScenarioCalcWorkerHarness } =
      await import('../../workers/fund-scenario-calc-worker-harness');
    workerHarness = await startInProcessFundScenarioCalcWorkerHarness();
    queue = new Queue('fund-scenario-calc', {
      connection: { host: redis.getHost(), port: redis.getMappedPort(6379) },
    });
    await queue.waitUntilReady();

    return { postgres, redis, pool, queue, workerHarness };
  } catch (error) {
    await workerHarness?.close().catch(() => undefined);
    await queue?.close().catch(() => undefined);
    await pool?.end().catch(() => undefined);
    await redis?.stop().catch(() => undefined);
    await postgres?.stop().catch(() => undefined);
    throw error;
  }
}

async function deleteCanaryFixtures(pool: Pool, fundId: number, runId: string, userId: number) {
  await pool.query('DELETE FROM fund_scenario_set_events WHERE fund_id = $1', [fundId]);
  await pool.query('DELETE FROM fund_scenario_calculation_runs WHERE fund_id = $1', [fundId]);
  await pool.query('DELETE FROM fund_snapshots WHERE fund_id = $1', [fundId]);
  await pool.query('DELETE FROM fund_scenario_sets WHERE fund_id = $1', [fundId]);
  await pool.query('DELETE FROM portfolio_company_update_receipts WHERE fund_id = $1', [fundId]);
  await pool.query('DELETE FROM portfoliocompanies WHERE fund_id = $1', [fundId]);
  await pool.query('DELETE FROM fund_events WHERE fund_id = $1', [fundId]);
  await pool.query('DELETE FROM fundconfigs WHERE fund_id = $1', [fundId]);
  await pool.query('DELETE FROM funds WHERE id = $1', [fundId]);
  await pool.query('DELETE FROM release_canary_runs WHERE id = $1', [runId]);
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
}

type BackendLockWait = {
  state: string;
  waitEventType: string | null;
  waitEvent: string | null;
};

async function waitForBackendLock(pool: Pool, pid: number, timeoutMs = 2_000): Promise<BackendLockWait> {
  const deadline = Date.now() + timeoutMs;
  let lastObserved: BackendLockWait | undefined;
  do {
    const observed = await pool.query<BackendLockWait>(
      `SELECT state,
              wait_event_type AS "waitEventType",
              wait_event AS "waitEvent"
         FROM pg_stat_activity
        WHERE pid = $1`,
      [pid]
    );
    lastObserved = observed.rows[0];
    if (lastObserved?.state === 'active' && lastObserved.waitEventType === 'Lock') {
      return lastObserved;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  } while (Date.now() < deadline);

  throw new Error(
    `Child writer backend ${pid} did not enter an active PostgreSQL lock wait: ${JSON.stringify(lastObserved)}`
  );
}

describe('release canary local write-path and worker lifecycle', () => {
  beforeAll(async () => {
    try {
      runtime = await startRuntime();
    } catch (error) {
      if (process.env.CI || !isContainerRuntimeUnavailable(error)) throw error;
      skipReason = `Docker-backed canary proof unavailable locally: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }, STARTUP_TIMEOUT_MS * 2);

  afterAll(async () => {
    const active = runtime;
    try {
      if (active) {
        const { getRegisteredQueueRuntime } = await import('../../server/queues/registry');
        await getRegisteredQueueRuntime('fund-scenario-calc')?.close?.();
        await active.workerHarness.close();
        await active.queue.close();
        const [{ closePool }, { closeDatabasePool }] = await Promise.all([
          import('../../server/db/pg-circuit'),
          import('../../server/db'),
        ]);
        await Promise.all([closePool(), closeDatabasePool(), active.pool.end()]);
      }
    } finally {
      await active?.redis.stop().catch(() => undefined);
      await active?.postgres.stop().catch(() => undefined);
      restoreEnv(originalEnv);
      vi.resetModules();
    }
  });

  it(
    'proves canary writes, residue reconciliation, and durable worker start evidence',
    async (ctx) => {
      if (skipReason) {
        console.warn(`[release-canary-lifecycle] SKIP: ${skipReason}`);
        ctx.skip();
        return;
      }
      if (!runtime) throw new Error('canary proof runtime was not initialized');

      const active = runtime;
      const suffix = randomUUID();
      const username = `release-canary-${suffix}`;
      const user = await active.pool.query<{ id: number }>(
        `INSERT INTO users (username, password, role, is_release_canary_principal)
         VALUES ($1, 'canary-test-secret', 'partner', true)
         RETURNING id`,
        [username]
      );
      const userId = user.rows[0]?.id;
      if (userId === undefined) throw new Error('canary principal was not created');

      let fundId: number | undefined;
      let runId: string | undefined;
      try {
        const [
          { FundPersistenceService },
          { DatabaseStorage },
          { updatePortfolioCompanyMetadata },
          { createReserveOptimizationScenarioSet },
          { enqueueReserveScenarioCalculation },
          { getFundScenarioCalculationStatus },
          { readCanaryRuntimePolicy, reconcileReleaseCanaryRun, transitionReleaseCanaryRun },
        ] = await Promise.all([
          import('../../server/services/fund-persistence-service'),
          import('../../server/storage'),
          import('../../server/services/portfolio-company-update-service'),
          import('../../server/services/fund-scenario-reserve-optimization-workflow-service'),
          import('../../server/services/fund-scenario-calc-queue-service'),
          import('../../server/services/fund-scenario-calculation-status-service'),
          import('../../server/services/canary-residue-service'),
        ]);
        const fundPersistence = new FundPersistenceService();
        const policy = readCanaryRuntimePolicy();
        expect(policy).toEqual(CANARY_POLICY);

        const created = await fundPersistence.createFundWithInitialDraft(
          {
            name: `C5 canary fund ${suffix}`,
            size: '100000000.00',
            managementFee: '0.0200',
            carryPercentage: '0.2000',
            vintageYear: 2026,
            creatorUserId: userId,
          },
          {
            fundName: `C5 canary fund ${suffix}`,
            modelInputsAsOfDate: '2026-08-10',
          }
        );
        fundId = created.fund.id;
        runId = created.fund.canaryRunId ?? undefined;
        if (runId === undefined) throw new Error('canary fund did not carry a run id');

        const canaryRow = await active.pool.query<{
          status: string;
          version: number;
          release_sha: string;
          principal_user_id: number;
        }>(
          `SELECT status, version, release_sha, principal_user_id
             FROM release_canary_runs
            WHERE id = $1`,
          [runId]
        );
        expect(canaryRow.rows[0]).toEqual({
          status: 'created',
          version: 1,
          release_sha: CANARY_SHA,
          principal_user_id: userId,
        });

        const fundRow = await active.pool.query<{
          data_origin: string;
          canary_run_id: string;
        }>('SELECT data_origin, canary_run_id FROM funds WHERE id = $1', [fundId]);
        expect(fundRow.rows[0]).toEqual({ data_origin: 'release_canary', canary_run_id: runId });

        const grant = await active.pool.query(
          'SELECT 1 FROM user_fund_grants WHERE user_id = $1 AND fund_id = $2',
          [userId, fundId]
        );
        expect(grant.rows).toHaveLength(1);

        // The reconciliation statement holds FOR UPDATE locks on the run and
        // its canary fund until this outer transaction commits. A child writer
        // needs a conflicting FK key-share lock, so it must be ordered after
        // the residue snapshot rather than slipping between count and update.
        const lockClient = await active.pool.connect();
        const childWriterClient = await active.pool.connect();
        let transactionOpen = false;
        let childInsert: Promise<unknown> | undefined;
        try {
          await lockClient.query('BEGIN');
          transactionOpen = true;
          const reconciledBeforeChild = await reconcileReleaseCanaryRun(
            runId,
            1,
            drizzle(lockClient) as never
          );
          const childWriterPidResult = await childWriterClient.query<{ pid: number }>(
            'SELECT pg_backend_pid() AS pid'
          );
          const childWriterPid = childWriterPidResult.rows[0]?.pid;
          if (childWriterPid === undefined) throw new Error('child writer backend PID was unavailable');

          childInsert = childWriterClient.query(
            `INSERT INTO fund_events (fund_id, event_type, event_time, operation)
             VALUES ($1, 'LOCK_ORDER_PROBE', clock_timestamp(), 'reconcile-lock-order')`,
            [fundId]
          );
          const childLockWait = await waitForBackendLock(active.pool, childWriterPid);
          expect(childLockWait).toEqual({
            state: 'active',
            waitEventType: 'Lock',
            waitEvent: 'transactionid',
          });

          await lockClient.query('COMMIT');
          transactionOpen = false;
          await expect(childInsert).resolves.toMatchObject({ rowCount: 1 });

          const storedSnapshot = await active.pool.query<{
            fund_event_residue_count: number;
          }>(
            'SELECT fund_event_residue_count FROM release_canary_runs WHERE id = $1',
            [runId]
          );
          const actualFundEvents = await active.pool.query<{ count: string }>(
            'SELECT count(*)::int AS count FROM fund_events WHERE fund_id = $1',
            [fundId]
          );
          expect(storedSnapshot.rows[0]?.fund_event_residue_count).toBe(
            reconciledBeforeChild.fundEvent
          );
          expect(Number(actualFundEvents.rows[0]?.count)).toBe(reconciledBeforeChild.fundEvent + 1);
        } finally {
          if (transactionOpen) await lockClient.query('ROLLBACK');
          await childInsert?.catch(() => undefined);
          lockClient.release();
          childWriterClient.release();
        }

        await active.pool.query(
          `UPDATE fundconfigs
              SET config = $2::jsonb,
                  is_draft = false,
                  is_published = true,
                  published_at = clock_timestamp(),
                  updated_at = clock_timestamp()
            WHERE id = $1`,
          [
            created.draft.id,
            JSON.stringify({
              fundName: `C5 canary fund ${suffix}`,
              modelInputsAsOfDate: '2026-08-10',
            }),
          ]
        );

        const storage = new DatabaseStorage();
        const company = await storage.createPortfolioCompany({
          fundId,
          name: `C5 company ${suffix}`,
          sector: 'SaaS',
          stage: 'Seed',
          investmentAmount: '1000000.00',
          currentValuation: '2500000.00',
          status: 'active',
        });
        expect(company.fundId).toBe(fundId);
        expect(company.rowVersion).toBe(1);

        const patchRequest = {
          expectedVersion: company.rowVersion,
          patch: { description: 'Canary lifecycle company' },
        } as const;
        const idempotencyKey = `c5-${suffix}`;
        const firstPatch = await updatePortfolioCompanyMetadata({
          fundId,
          companyId: company.id,
          actorId: userId,
          idempotencyKey,
          request: patchRequest,
        });
        const replayedPatch = await updatePortfolioCompanyMetadata({
          fundId,
          companyId: company.id,
          actorId: userId,
          idempotencyKey,
          request: patchRequest,
        });
        expect(firstPatch.replayed).toBe(false);
        expect(replayedPatch).toEqual({ response: firstPatch.response, replayed: true });
        expect(firstPatch.response).toMatchObject({
          description: 'Canary lifecycle company',
          rowVersion: 2,
        });
        await expect(
          updatePortfolioCompanyMetadata({
            fundId,
            companyId: company.id,
            actorId: userId,
            idempotencyKey: `c5-stale-${suffix}`,
            request: { expectedVersion: 1, patch: { name: 'Stale write' } },
          })
        ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

        const scenarioSet = await createReserveOptimizationScenarioSet(
          fundId,
          { name: `C5 scenario ${suffix}`, variantName: 'C5 reserve variant' },
          { userId, label: username },
          { idempotencyKey: `c5-scenario-${suffix}` }
        );
        const correlationId = randomUUID();
        const queued = await enqueueReserveScenarioCalculation({
          fundId,
          scenarioSetId: scenarioSet.id,
          correlationId,
          actor: { userId, label: username },
        });
        expect(queued).toMatchObject({
          status: 'queued',
          fundId,
          scenarioSetId: scenarioSet.id,
          correlationId,
        });

        const job = await active.queue.getJob(queued.jobId);
        expect(job).not.toBeNull();
        await job!.waitUntilFinished(active.workerHarness.queueEvents, JOB_TIMEOUT_MS);

        const lifecycleEvents = await active.pool.query<{
          event_type: string;
          change_summary_json: { run_id?: string };
        }>(
          `SELECT event_type, change_summary_json
             FROM fund_scenario_set_events
            WHERE fund_id = $1
              AND scenario_set_id = $2
              AND event_type IN ('calculation_queued', 'calculation_started', 'calculated')
            ORDER BY created_at ASC, id ASC`,
          [fundId, scenarioSet.id]
        );
        expect(lifecycleEvents.rows.map((event) => event.event_type)).toEqual([
          'calculation_queued',
          'calculation_started',
          'calculated',
        ]);
        // calculation_queued is written by the queue service before a run row
        // exists, so run_id appears only on started/calculated events.
        expect(
          lifecycleEvents.rows
            .filter((event) => event.event_type !== 'calculation_queued')
            .every((event) => event.change_summary_json.run_id)
        ).toBe(true);

        const calculationRun = await active.pool.query<{
          status: string;
          started_at: Date | null;
          snapshot_id: number | null;
          job_id: string;
          correlation_id: string;
        }>(
          `SELECT status, started_at, snapshot_id, job_id, correlation_id
             FROM fund_scenario_calculation_runs
            WHERE fund_id = $1 AND scenario_set_id = $2
            ORDER BY created_at DESC
            LIMIT 1`,
          [fundId, scenarioSet.id]
        );
        expect(calculationRun.rows[0]).toMatchObject({
          status: 'completed',
          job_id: queued.jobId,
          correlation_id: correlationId,
          snapshot_id: expect.any(Number),
          started_at: expect.any(Date),
        });

        const status = await getFundScenarioCalculationStatus(fundId, scenarioSet.id);
        expect(status).toMatchObject({
          status: 'succeeded',
          fundId,
          scenarioSetId: scenarioSet.id,
          jobId: queued.jobId,
          correlationId,
          snapshotId: expect.any(Number),
        });
        expect(status.calculationStartedAt).toEqual(expect.any(String));
        expect(Date.parse(status.calculationStartedAt ?? '')).not.toBeNaN();

        // Measured reality: preflight enforces the one-active-run rule before
        // any residue cap check, so a second canary creation while this run is
        // still nonterminal rejects as CanaryActiveRunError -- the fund-cap
        // breach is unreachable mid-run. Per-group cap breaches are covered
        // post-terminal in release-canary-residue-characterization.test.ts.
        await expect(
          fundPersistence.createFundWithInitialDraft(
            {
              name: `C5 capped fund ${suffix}`,
              size: '100000000.00',
              managementFee: '0.0200',
              carryPercentage: '0.2000',
              vintageYear: 2026,
              creatorUserId: userId,
            },
            { fundName: `C5 capped fund ${suffix}` }
          )
        ).rejects.toMatchObject({
          name: 'CanaryActiveRunError',
          runId,
          runStatus: 'created',
          expired: false,
        });

        const reconciled = await transitionReleaseCanaryRun(runId, 'completed', 1, [
          'created',
          'running',
        ]);
        expect(reconciled).toMatchObject({
          portfolioCompany: 1,
          fund: 1,
          fundConfig: 1,
          fundEvent: 2,
          notification: 0,
          grant: 1,
          reporting: 0,
        });
        const reconciledGroupSum =
          reconciled.portfolioCompany +
          reconciled.fund +
          reconciled.fundConfig +
          reconciled.fundEvent +
          reconciled.notification +
          reconciled.grant +
          reconciled.calculation +
          reconciled.mutationReceipt +
          reconciled.scenario +
          reconciled.reporting;
        expect(reconciled.total).toBe(reconciledGroupSum);
        expect(reconciled.scenario).toBeGreaterThan(0);

        const residueRows = await active.pool.query(RELEASE_CANARY_RUNS_QUERY);
        expect(
          evaluateCanaryResidue({
            expectedSha: CANARY_SHA,
            rows: residueRows.rows,
            policy,
          })
        ).toMatchObject({ verdict: 'pass', exitCode: 0 });
      } finally {
        if (fundId !== undefined && runId !== undefined) {
          await deleteCanaryFixtures(active.pool, fundId, runId, userId);
        } else {
          await active.pool.query('DELETE FROM users WHERE id = $1', [userId]);
        }
      }
    },
    JOB_TIMEOUT_MS + 60_000
  );
});
