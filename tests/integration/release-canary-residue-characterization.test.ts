import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { rename, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Queue } from 'bullmq';
import type { QueueEvents } from 'bullmq';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  evaluateCanaryResidue,
  RELEASE_CANARY_RUNS_QUERY,
} from '../../scripts/release/assert-canary-residue.mjs';
import { deleteCanaryResidueTargets, runPurge } from '../../scripts/release/purge-canary-runs.mjs';
import {
  parseReleaseCanaryResidueCharacterization,
  RELEASE_CANARY_RESERVED_RESIDUE,
  RELEASE_CANARY_RESIDUE_GROUP_KEYS,
  type ResidueVector,
} from '../../shared/contracts/release-canary-residue-characterization-v1.contract';
import { applyScenarioMigrations } from '../helpers/scenario-migrations';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const STARTUP_TIMEOUT_MS = 90_000;
const JOB_TIMEOUT_MS = 60_000;
const WHOLE_TEST_TIMEOUT_MS = 600_000;
const CANARY_SHA = 'c'.repeat(40);

// Caps are three-times-reserved so every phase of one full canary run plus a
// hypothetical second reservation fits. Total must equal the sum of the ten
// group caps (readCanaryRuntimePolicy enforces this).
const CANARY_POLICY = {
  portfolioCompany: 3,
  fund: 3,
  fundConfig: 3,
  fundEvent: 12,
  notification: 0,
  grant: 3,
  calculation: 15,
  mutationReceipt: 6,
  scenario: 21,
  reporting: 33,
  total: 99,
  ttlHours: 24,
} as const;

// Captured BEFORE setRuntimeEnv so the CI-provided record destination survives
// the harness env rewrite. Locally both are absent and scratch defaults apply.
const initialCharacterizationEnv = {
  resultPath: process.env['RELEASE_CANARY_CHARACTERIZATION_RESULT_PATH'],
  sourceSha: process.env['RELEASE_CANARY_CHARACTERIZATION_SOURCE_SHA'],
};

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

type TableScope = 'id' | 'fund_id' | { via: string; on: string };
type GroupTables = Readonly<Record<string, ReadonlyArray<{ table: string; scope: TableScope }>>>;

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

function vectorEquals(a: ResidueVector, b: ResidueVector): boolean {
  return (
    a.total === b.total && RELEASE_CANARY_RESIDUE_GROUP_KEYS.every((key) => a[key] === b[key])
  );
}

function assertMonotonic(previous: ResidueVector, current: ResidueVector, name: string): void {
  for (const key of RELEASE_CANARY_RESIDUE_GROUP_KEYS) {
    expect(
      current[key],
      `${name}: group ${key} regressed from ${previous[key]} to ${current[key]}`
    ).toBeGreaterThanOrEqual(previous[key]);
  }
  expect(current.total, `${name}: total regressed`).toBeGreaterThanOrEqual(previous.total);
}

/**
 * Independent database truth: count residue rows per group directly over
 * CANARY_RESIDUE_GROUP_TABLES with plain SQL, scoped to the canary run's
 * fund(s), bypassing the service's own aggregate query.
 */
async function truthCountsForRun(
  pool: Pool,
  groupTables: GroupTables,
  runId: string
): Promise<ResidueVector> {
  const fundIdSelect = `(SELECT id FROM funds WHERE data_origin = 'release_canary' AND canary_run_id = $1)`;
  const counts: Record<string, number> = {};
  let total = 0;
  for (const [group, entries] of Object.entries(groupTables)) {
    let groupCount = 0;
    for (const entry of entries) {
      let query: string;
      if (entry.scope === 'id') {
        query = `SELECT count(*)::int AS count FROM ${entry.table} AS t WHERE t.id IN ${fundIdSelect}`;
      } else if (entry.scope === 'fund_id') {
        query = `SELECT count(*)::int AS count FROM ${entry.table} AS t WHERE t.fund_id IN ${fundIdSelect}`;
      } else {
        query =
          `SELECT count(*)::int AS count FROM ${entry.table} AS t ` +
          `JOIN ${entry.scope.via} AS p ON p.id = t.${entry.scope.on} ` +
          `WHERE p.fund_id IN ${fundIdSelect}`;
      }
      const result = await pool.query<{ count: number }>(query, [runId]);
      groupCount += result.rows[0]?.count ?? 0;
    }
    counts[group] = groupCount;
    total += groupCount;
  }
  return { ...counts, total } as ResidueVector;
}

/** Atomic 0600 write via temp file + rename; returns false when unconfigured. */
async function writeCharacterizationRecordIfConfigured(
  record: unknown,
  resultPath: string | undefined,
  sourceSha: string | undefined
): Promise<boolean> {
  if (!resultPath || !sourceSha) return false;
  const tempPath = `${resultPath}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(tempPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  await rename(tempPath, resultPath);
  return true;
}

// Raw-SQL copy of listDirectFundForeignKeys from
// scripts/release/purge-canary-runs.mjs (that module does not export it).
const DIRECT_FUND_FOREIGN_KEYS_SQL = `
  SELECT
    format('%I.%I', child_ns.nspname, child.relname) AS table_name,
    format('%I', child_column.attname) AS column_name
  FROM pg_constraint AS constraint_row
  JOIN pg_class AS child ON child.oid = constraint_row.conrelid
  JOIN pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
  JOIN pg_class AS parent ON parent.oid = constraint_row.confrelid
  JOIN pg_attribute AS child_column
    ON child_column.attrelid = child.oid
   AND child_column.attnum = constraint_row.conkey[1]
  WHERE constraint_row.contype = 'f'
    AND constraint_row.confrelid = 'public.funds'::regclass
    AND array_length(constraint_row.conkey, 1) = 1
    AND child.oid <> 'public.funds'::regclass
  ORDER BY child.relname
`;

describe('release canary residue characterization', () => {
  beforeAll(async () => {
    try {
      runtime = await startRuntime();
    } catch (error) {
      if (process.env['CI'] || !isContainerRuntimeUnavailable(error)) throw error;
      skipReason = `Docker-backed characterization unavailable locally: ${
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
    'characterizes the full canary residue vector across the deployed write path',
    async (ctx) => {
      if (skipReason) {
        console.warn(`[release-canary-residue-characterization] SKIP: ${skipReason}`);
        ctx.skip();
        return;
      }
      if (!runtime) throw new Error('characterization runtime was not initialized');
      const active = runtime;
      const suffix = randomUUID();

      const [
        { FundPersistenceService },
        { DatabaseStorage },
        { updatePortfolioCompanyMetadata },
        { createReserveOptimizationScenarioSet },
        { executeReserveCalculationCommand },
        { createHttpError },
        canaryResidueService,
        { db },
        { createPlanningFmvOverride },
        { buildFundCompanyActualsFacts },
        { recordMoicReconciliation },
        { buildMetricRunDryRun, commitMetricRun },
        { createMetricRunEvidence },
        { approveMetricRun, lockMetricRun },
        narrativeService,
        { assembleMetricRunReportPackage },
        { createMetricRunReportPackageStoredJsonExport },
      ] = await Promise.all([
        import('../../server/services/fund-persistence-service'),
        import('../../server/storage'),
        import('../../server/services/portfolio-company-update-service'),
        import('../../server/services/fund-scenario-reserve-optimization-workflow-service'),
        import('../../server/services/fund-scenario-calculation-command-service'),
        import('../../server/services/fund-scenario-set-service'),
        import('../../server/services/canary-residue-service'),
        import('../../server/db'),
        import('../../server/services/lp-reporting/planning-fmv-override-service'),
        import('../../server/services/fund-actuals/fund-company-actuals-facts-service'),
        import('../../server/services/fund-moic-reconciliation-service'),
        import('../../server/services/lp-reporting/metric-run-commit-service'),
        import('../../server/services/lp-reporting/metric-run-evidence-service'),
        import('../../server/services/lp-reporting/metric-run-lifecycle-service'),
        import('../../server/services/lp-reporting/narrative-run-service'),
        import('../../server/services/lp-reporting/report-package-service'),
        import('../../server/services/lp-reporting/report-package-json-stored-export-service'),
      ]);
      const {
        CANARY_RESIDUE_GROUP_TABLES,
        preflightCanaryCreation,
        readCanaryRuntimePolicy,
        reconcileReleaseCanaryRun,
        transitionReleaseCanaryRun,
      } = canaryResidueService;
      const groupTables = CANARY_RESIDUE_GROUP_TABLES as GroupTables;
      const fundPersistence = new FundPersistenceService();
      const storage = new DatabaseStorage();

      // Reservation policy: total equals the sum of the ten group maxima.
      const policy = readCanaryRuntimePolicy();
      expect(policy).toEqual(CANARY_POLICY);
      const groupCapSum = RELEASE_CANARY_RESIDUE_GROUP_KEYS.reduce(
        (sum, key) => sum + policy[key],
        0
      );
      expect(policy.total).toBe(groupCapSum);

      // Canary principal + an ordinary production user for the exclusion probe.
      const canaryUser = await active.pool.query<{ id: number }>(
        `INSERT INTO users (username, password, role, is_release_canary_principal)
         VALUES ($1, 'canary-test-secret', 'partner', true)
         RETURNING id`,
        [`residue-canary-${suffix}`]
      );
      const userId = canaryUser.rows[0]?.id;
      if (userId === undefined) throw new Error('canary principal was not created');
      const prodUser = await active.pool.query<{ id: number }>(
        `INSERT INTO users (username, password, role, is_release_canary_principal)
         VALUES ($1, 'canary-test-secret', 'partner', false)
         RETURNING id`,
        [`residue-production-${suffix}`]
      );
      const prodUserId = prodUser.rows[0]?.id;
      if (prodUserId === undefined) throw new Error('production user was not created');

      const phases: Array<{ name: string; residue: ResidueVector }> = [];
      const failureBoundaries: Array<{ name: string; residue: ResidueVector }> = [];
      let runId = '';

      async function reconciledWithTruth(context: string): Promise<ResidueVector> {
        const counts = (await reconcileReleaseCanaryRun(runId, 1)) as ResidueVector;
        const truth = await truthCountsForRun(active.pool, groupTables, runId);
        expect(counts, `${context}: service counts diverge from direct SQL truth`).toEqual(truth);
        return counts;
      }

      async function capturePhase(name: string): Promise<ResidueVector> {
        const counts = await reconciledWithTruth(`phase ${name}`);
        const previous = phases[phases.length - 1];
        if (previous) assertMonotonic(previous.residue, counts, `phase ${name}`);
        phases.push({ name, residue: counts });
        return counts;
      }

      async function captureFailureBoundary(name: string): Promise<ResidueVector> {
        const counts = await reconciledWithTruth(`failure boundary ${name}`);
        for (const key of RELEASE_CANARY_RESIDUE_GROUP_KEYS) {
          expect(
            counts[key],
            `failure boundary ${name}: ${key} exceeds reserved`
          ).toBeLessThanOrEqual(RELEASE_CANARY_RESERVED_RESIDUE[key]);
        }
        expect(counts.total).toBeLessThanOrEqual(RELEASE_CANARY_RESERVED_RESIDUE.total);
        failureBoundaries.push({ name, residue: counts });
        return counts;
      }

      // ---- Phase 1: fund-creation ------------------------------------------
      const fundName = `Residue characterization fund ${suffix}`;
      const fundInput = {
        name: fundName,
        size: '100000000.00',
        managementFee: '0.0200',
        carryPercentage: '0.2000',
        vintageYear: 2026,
        creatorUserId: userId,
      };
      const configInput = { fundName, modelInputsAsOfDate: '2026-08-10' };
      const created = await fundPersistence.createFundWithInitialDraft(fundInput, configInput);
      const fundId = created.fund.id;
      runId = created.fund.canaryRunId ?? '';
      if (!runId) throw new Error('canary fund did not carry a run id');
      await capturePhase('fund-creation');

      // Preflight rejects while this run is active (nonterminal, unexpired).
      await expect(preflightCanaryCreation(db)).rejects.toMatchObject({
        name: 'CanaryActiveRunError',
        runId,
        expired: false,
      });
      // Preflight names the TTL failure when the active run is past expiry.
      const savedExpiry = await active.pool.query<{ expires_at: Date }>(
        'SELECT expires_at FROM release_canary_runs WHERE id = $1',
        [runId]
      );
      await active.pool.query(
        `UPDATE release_canary_runs SET expires_at = clock_timestamp() - interval '1 hour' WHERE id = $1`,
        [runId]
      );
      await expect(preflightCanaryCreation(db)).rejects.toMatchObject({
        name: 'CanaryActiveRunError',
        runId,
        expired: true,
        message: expect.stringContaining('TTL'),
      });
      await active.pool.query('UPDATE release_canary_runs SET expires_at = $2 WHERE id = $1', [
        runId,
        savedExpiry.rows[0]?.expires_at,
      ]);

      // ---- Phase 2: draft-save ---------------------------------------------
      // syncExistingDraftForFinalize is finalize()'s internal draft-save step
      // (the only service-level DRAFT_SAVED emitter); accessed structurally so
      // the phase vector can be captured between DRAFT_SAVED and publish.
      const draftSaver = fundPersistence as unknown as {
        syncExistingDraftForFinalize(
          targetFundId: number,
          fund: typeof fundInput,
          config: Record<string, unknown>
        ): Promise<unknown>;
      };
      const savedDraft = await draftSaver.syncExistingDraftForFinalize(
        fundId,
        fundInput,
        configInput
      );
      expect(savedDraft).not.toBeNull();
      await capturePhase('draft-save');

      // ---- Phase 3: publish (base calculation runs inline) ------------------
      const publishResult = await fundPersistence.publishDraft(
        fundId,
        { reserve: null, pacing: null, cohort: null },
        userId
      );
      console.warn(
        `[characterization] publish dispatchState=${publishResult.run.dispatchState} lastError=${
          (publishResult.run as { lastError?: string | null }).lastError ?? 'none'
        }`
      );
      const baseSnapshots = await active.pool.query<{ type: string }>(
        'SELECT type FROM fund_snapshots WHERE fund_id = $1 ORDER BY id',
        [fundId]
      );
      console.warn(
        `[characterization] base snapshot types=${JSON.stringify(
          baseSnapshots.rows.map((row) => row.type)
        )}`
      );
      const fundEventRows = await active.pool.query<{ event_type: string }>(
        'SELECT event_type FROM fund_events WHERE fund_id = $1 ORDER BY id',
        [fundId]
      );
      expect(fundEventRows.rows.map((row) => row.event_type)).toEqual([
        'FUND_CREATED',
        'DRAFT_SAVED',
        'PUBLISHED',
        'CALC_TRIGGERED',
      ]);
      await capturePhase('publish');

      // ---- Phase 4: portfolio-mutation --------------------------------------
      const company = await storage.createPortfolioCompany({
        fundId,
        name: `Residue company ${suffix}`,
        sector: 'SaaS',
        stage: 'Seed',
        investmentAmount: '1000000.00',
        currentValuation: '2500000.00',
        status: 'active',
      });
      expect(company.fundId).toBe(fundId);
      const patchRequest = {
        expectedVersion: company.rowVersion,
        patch: { description: 'Residue characterization company' },
      } as const;
      const portfolioKey = `residue-portfolio-${suffix}`;
      const firstPatch = await updatePortfolioCompanyMetadata({
        fundId,
        companyId: company.id,
        actorId: userId,
        idempotencyKey: portfolioKey,
        request: patchRequest,
      });
      expect(firstPatch.replayed).toBe(false);
      await capturePhase('portfolio-mutation');

      // ---- Phase 5: portfolio-replay and stale-rejection --------------------
      const replayedPatch = await updatePortfolioCompanyMetadata({
        fundId,
        companyId: company.id,
        actorId: userId,
        idempotencyKey: portfolioKey,
        request: patchRequest,
      });
      expect(replayedPatch).toEqual({ response: firstPatch.response, replayed: true });
      await expect(
        updatePortfolioCompanyMetadata({
          fundId,
          companyId: company.id,
          actorId: userId,
          idempotencyKey: `residue-portfolio-stale-${suffix}`,
          request: { expectedVersion: 1, patch: { name: 'Stale write' } },
        })
      ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
      const afterPortfolioReplay = await capturePhase('portfolio-replay');
      expect(afterPortfolioReplay).toEqual(phases[phases.length - 2]?.residue);
      await captureFailureBoundary('portfolio-stale-rejection');

      // Ordinary production fund rows are excluded from residue accounting.
      const productionFund = await fundPersistence.createFundWithInitialDraft(
        {
          name: `Residue production fund ${suffix}`,
          size: '50000000.00',
          managementFee: '0.0200',
          carryPercentage: '0.2000',
          vintageYear: 2026,
          creatorUserId: prodUserId,
        },
        { fundName: `Residue production fund ${suffix}` }
      );
      const productionFundRow = await active.pool.query<{
        data_origin: string;
        canary_run_id: string | null;
      }>('SELECT data_origin, canary_run_id FROM funds WHERE id = $1', [productionFund.fund.id]);
      expect(productionFundRow.rows[0]).toEqual({
        data_origin: 'production',
        canary_run_id: null,
      });
      const afterProductionFund = await reconciledWithTruth('production-fund exclusion');
      expect(afterProductionFund).toEqual(afterPortfolioReplay);

      // ---- Phase 6: scenario-creation ---------------------------------------
      const scenarioSet = await createReserveOptimizationScenarioSet(
        fundId,
        { name: `Residue scenario ${suffix}`, variantName: 'Residue reserve variant' },
        { userId, label: `residue-canary-${suffix}` },
        { idempotencyKey: `residue-scenario-${suffix}` }
      );
      await capturePhase('scenario-creation');

      // Failure boundary: queue unavailable during scenario calculation. Uses
      // the same key as the later successful command so the failed receipt is
      // reclaimed instead of stranding extra mutation-receipt residue.
      const commandKey = `residue-command-${suffix}`;
      const commandInput = {
        fundId,
        scenarioSetId: scenarioSet.id,
        idempotencyKey: commandKey,
        request: { calculationMode: 'async_reserve_allocation' as const },
        actor: { userId, label: `residue-canary-${suffix}` },
      };
      const throwingGetQueue = () => {
        throw createHttpError(503, 'injected queue outage for characterization', {
          code: 'scenario_calculation_queue_unavailable',
        });
      };
      await expect(
        executeReserveCalculationCommand(commandInput, {
          receiptWaitTimeoutMs: 2_000,
          deps: { getQueue: throwingGetQueue as never },
        })
      ).rejects.toMatchObject({
        statusCode: 503,
        code: 'scenario_calculation_queue_unavailable',
      });
      await captureFailureBoundary('scenario-queue-unavailable');

      // ---- Phase 7: scenario-calculation ------------------------------------
      const queued = await executeReserveCalculationCommand(commandInput, {
        receiptWaitTimeoutMs: 2_000,
      });
      expect(queued).toMatchObject({
        fundId,
        scenarioSetId: scenarioSet.id,
        status: 'queued',
      });
      const job = await active.queue.getJob(queued.jobId);
      expect(job).not.toBeNull();
      await job!.waitUntilFinished(active.workerHarness.queueEvents, JOB_TIMEOUT_MS);
      await capturePhase('scenario-calculation');

      // ---- Phase 8: scenario-replay -----------------------------------------
      const replayedCommand = await executeReserveCalculationCommand(commandInput, {
        receiptWaitTimeoutMs: 2_000,
      });
      expect(JSON.stringify(replayedCommand)).toBe(JSON.stringify(queued));
      const afterScenarioReplay = await capturePhase('scenario-replay');
      expect(afterScenarioReplay).toEqual(phases[phases.length - 2]?.residue);

      // Failure boundary: reused key with changed body is rejected (422).
      await expect(
        executeReserveCalculationCommand(
          { ...commandInput, request: {} },
          { receiptWaitTimeoutMs: 2_000 }
        )
      ).rejects.toMatchObject({ statusCode: 422, code: 'idempotency_key_reused' });
      await captureFailureBoundary('scenario-key-reuse-rejected');

      // ---- Phase 9: planning-fmv --------------------------------------------
      const planningInput = {
        fundId,
        idempotencyKey: `residue-fmv-${suffix}`,
        actor: { userId },
        body: {
          companyId: company.id,
          markDate: '2026-08-01',
          fairValue: '2500000.000000',
          currency: 'USD' as const,
          confidenceLevel: 'high' as const,
          reason: 'Release canary residue characterization planning FMV',
          source: {},
        },
      };
      const planningResponse = await createPlanningFmvOverride(planningInput);
      expect(planningResponse.replayed).toBe(false);
      expect(planningResponse.valuationMark.status).toBe('approved');
      const planningReplay = await createPlanningFmvOverride(planningInput);
      expect(planningReplay.replayed).toBe(true);
      expect(planningReplay.valuationMark.id).toBe(planningResponse.valuationMark.id);
      await capturePhase('planning-fmv');

      // ---- Phase 10: actuals-read (read-only) -------------------------------
      const actuals = await buildFundCompanyActualsFacts({ fundId, asOfDate: '2026-08-10' });
      expect(actuals.fundId).toBe(fundId);
      const afterActuals = await capturePhase('actuals-read');
      expect(afterActuals).toEqual(phases[phases.length - 2]?.residue);

      // ---- Phase 11: reconciliation -----------------------------------------
      const reconciliation = await recordMoicReconciliation({
        fundId,
        idempotencyKey: `residue-reconciliation-${suffix}`,
        requestedBy: userId,
      });
      expect(reconciliation.replayed).toBe(false);
      await capturePhase('reconciliation');

      // ---- Phase 12: metric-lifecycle ---------------------------------------
      const metricRequest = {
        fundId,
        asOfDate: '2026-08-10',
        runType: 'quarterly_report' as const,
        perspective: 'lp_net' as const,
        sourceEventIds: [],
        sourceMarkIds: [planningResponse.valuationMark.id],
        sourceMarkSelection: 'explicit' as const,
      };
      const dryRun = await buildMetricRunDryRun(metricRequest);
      const committed = await commitMetricRun({
        ...metricRequest,
        previewHash: dryRun.previewHash,
        userId,
      });
      expect(committed.inserted).toBe(true);
      const metricRunId = committed.metricRunId;
      const evidence = await createMetricRunEvidence({
        fundId,
        metricRunId,
        userId,
        body: {
          idempotencyKey: `residue-evidence-${suffix}`,
          evidenceSource: 'financing_round',
          sourceDate: '2026-08-01',
        },
      });
      expect(evidence.inserted).toBe(true);
      await approveMetricRun({ fundId, metricRunId, userId, expectedVersion: 1 });
      await lockMetricRun({ fundId, metricRunId, userId, expectedVersion: 2 });
      await capturePhase('metric-lifecycle');

      // ---- Phase 13: narratives ---------------------------------------------
      const narrativeTypes = ['no_dpi', 'methodology', 'portfolio_update', 'risk_disclosure'] as const;
      const narrativeRefs: Array<{
        narrativeType: (typeof narrativeTypes)[number];
        narrativeRunId: number;
        expectedVersion: number;
      }> = [];
      for (const narrativeType of narrativeTypes) {
        const createdNarrative = await narrativeService.createNarrativeDraft({
          fundId,
          metricRunId,
          userId,
          body: { narrativeType },
        });
        expect(createdNarrative.inserted).toBe(true);
        const narrativeRunId = createdNarrative.record.narrativeRunId;
        await narrativeService.editNarrativeDraft({
          fundId,
          metricRunId,
          narrativeRunId,
          userId,
          body: {
            expectedVersion: 1,
            editedText: `Reviewed ${narrativeType} narrative for the release canary residue characterization.`,
          },
        });
        await narrativeService.reviewNarrativeDraft({
          fundId,
          metricRunId,
          narrativeRunId,
          userId,
          body: { expectedVersion: 2 },
        });
        await narrativeService.approveNarrativeDraft({
          fundId,
          metricRunId,
          narrativeRunId,
          userId,
          body: { expectedVersion: 3 },
        });
        narrativeRefs.push({ narrativeType, narrativeRunId, expectedVersion: 4 });
      }
      await capturePhase('narratives');

      // ---- Phase 14: package-assembly ---------------------------------------
      const assembled = await assembleMetricRunReportPackage({
        fundId,
        metricRunId,
        userId,
        body: { expectedMetricRunVersion: 3, expectedNarratives: narrativeRefs },
      });
      expect(assembled.inserted).toBe(true);
      await capturePhase('package-assembly');

      // ---- Phase 15: stored-json-export -------------------------------------
      const storedExport = await createMetricRunReportPackageStoredJsonExport({
        fundId,
        metricRunId,
        userId,
      });
      expect(storedExport.inserted).toBe(true);
      const storedExportReplay = await createMetricRunReportPackageStoredJsonExport({
        fundId,
        metricRunId,
        userId,
      });
      expect(storedExportReplay.inserted).toBe(false);
      expect(storedExportReplay.record.contentHash).toBe(storedExport.record.contentHash);
      const finalVector = await capturePhase('stored-json-export');

      console.warn(
        `[characterization] per-phase vectors:\n${phases
          .map((phase) => `  ${phase.name}: ${JSON.stringify(phase.residue)}`)
          .join('\n')}`
      );
      console.warn(
        `[characterization] failure boundaries:\n${failureBoundaries
          .map((boundary) => `  ${boundary.name}: ${JSON.stringify(boundary.residue)}`)
          .join('\n')}`
      );

      // Fund events remain exactly the four deployed-path events at the end.
      const finalFundEvents = await active.pool.query<{ event_type: string }>(
        'SELECT event_type FROM fund_events WHERE fund_id = $1 ORDER BY id',
        [fundId]
      );
      expect(finalFundEvents.rows.map((row) => row.event_type)).toEqual([
        'FUND_CREATED',
        'DRAFT_SAVED',
        'PUBLISHED',
        'CALC_TRIGGERED',
      ]);

      expect(finalVector).toEqual(RELEASE_CANARY_RESERVED_RESIDUE);

      // No unaccounted direct child table of funds carries canary rows.
      const mappedTables = new Set(
        Object.values(groupTables).flatMap((entries) => entries.map((entry) => entry.table))
      );
      const fkRows = await active.pool.query<{ table_name: string; column_name: string }>(
        DIRECT_FUND_FOREIGN_KEYS_SQL
      );
      const unaccounted: string[] = [];
      for (const fk of fkRows.rows) {
        const table = fk.table_name.replace(/^public\./, '');
        const rowCount = await active.pool.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM ${table} WHERE ${fk.column_name} = $1`,
          [fundId]
        );
        if ((rowCount.rows[0]?.count ?? 0) > 0 && !mappedTables.has(table)) {
          unaccounted.push(`${table} (${rowCount.rows[0]?.count} rows)`);
        }
      }
      expect(unaccounted, 'direct funds FK tables missing from CANARY_RESIDUE_GROUP_TABLES').toEqual(
        []
      );

      // ---- Terminalization + post-terminal preflight ------------------------
      const reconciled = await transitionReleaseCanaryRun(runId, 'completed', 1, [
        'created',
        'running',
      ]);
      expect(reconciled).toEqual(finalVector);
      const storedRun = await active.pool.query<Record<string, unknown>>(
        `SELECT status,
                portfolio_company_residue_count, fund_residue_count, fund_config_residue_count,
                fund_event_residue_count, notification_residue_count, grant_residue_count,
                calculation_residue_count, mutation_receipt_residue_count,
                scenario_residue_count, reporting_residue_count, total_residue_count
           FROM release_canary_runs WHERE id = $1`,
        [runId]
      );
      expect(storedRun.rows[0]).toEqual({
        status: 'completed',
        portfolio_company_residue_count: finalVector.portfolioCompany,
        fund_residue_count: finalVector.fund,
        fund_config_residue_count: finalVector.fundConfig,
        fund_event_residue_count: finalVector.fundEvent,
        notification_residue_count: finalVector.notification,
        grant_residue_count: finalVector.grant,
        calculation_residue_count: finalVector.calculation,
        mutation_receipt_residue_count: finalVector.mutationReceipt,
        scenario_residue_count: finalVector.scenario,
        reporting_residue_count: finalVector.reporting,
        total_residue_count: finalVector.total,
      });
      const storedGroupSum = RELEASE_CANARY_RESIDUE_GROUP_KEYS.reduce(
        (sum, key) => sum + finalVector[key],
        0
      );
      expect(finalVector.total).toBe(storedGroupSum);

      const helperRun = await active.pool.query<{ id: string }>(
        `INSERT INTO release_canary_runs (
           release_version, release_sha, deployment_id, worker_deployment_id,
           correlation_id, principal_user_id, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, clock_timestamp())
         RETURNING id`,
        ['purge-helper', CANARY_SHA, 'purge-helper', 'purge-helper', randomUUID(), userId]
      );
      const helperTarget = { id: helperRun.rows[0]!.id, expectedVersion: 1 };
      await expect(deleteCanaryResidueTargets(active.pool, [], [helperTarget])).resolves.toEqual({
        targets: 1,
        deleted: 1,
      });
      await expect(deleteCanaryResidueTargets(active.pool, [], [helperTarget])).resolves.toEqual({
        targets: 0,
        deleted: 0,
      });

      // Preflight accepts after the run is terminal when the vector fits (3x).
      const preflightCurrent = await preflightCanaryCreation(db);
      expect(preflightCurrent).toEqual(finalVector);

      // Each group cap fails independently: a policy whose scenario cap alone
      // cannot absorb current + reserved rejects on exactly that field.
      const scenarioOnlyBreachPolicy = {
        portfolioCompany: 100,
        fund: 100,
        fundConfig: 100,
        fundEvent: 100,
        notification: 100,
        grant: 100,
        calculation: 100,
        mutationReceipt: 100,
        scenario: finalVector.scenario + RELEASE_CANARY_RESERVED_RESIDUE.scenario - 1,
        reporting: 100,
        total: 0,
        ttlHours: 24,
      };
      scenarioOnlyBreachPolicy.total =
        RELEASE_CANARY_RESIDUE_GROUP_KEYS.reduce(
          (sum, key) => sum + scenarioOnlyBreachPolicy[key],
          0
        );
      await expect(preflightCanaryCreation(db, scenarioOnlyBreachPolicy)).rejects.toMatchObject({
        name: 'CanaryResidueCapExceededError',
        field: 'scenario',
        current: finalVector.scenario,
        projected: finalVector.scenario + RELEASE_CANARY_RESERVED_RESIDUE.scenario,
        limit: scenarioOnlyBreachPolicy.scenario,
      });

      // ---- Purge plan parity (dry-run only; execute mechanically blocked) ---
      await active.pool.query(
        `UPDATE release_canary_runs SET expires_at = clock_timestamp() - interval '1 hour' WHERE id = $1`,
        [runId]
      );
      const purgeClient = await active.pool.connect();
      try {
        const plan = (await runPurge(purgeClient, {
          execute: false,
          output: () => undefined,
        })) as {
          mode: string;
          targetFunds: number;
          targetRuns: number;
          residue: Record<string, number>;
          totalResidue: number;
        };
        expect(plan.mode).toBe('dry-run');
        expect(plan.targetFunds).toBe(1);
        expect(plan.targetRuns).toBe(1);
        for (const key of RELEASE_CANARY_RESIDUE_GROUP_KEYS) {
          expect(plan.residue[key], `purge plan group ${key}`).toBe(finalVector[key]);
        }
        expect(plan.totalResidue).toBe(finalVector.total);

        // Dry-run deleted nothing.
        const truthAfterDryRun = await truthCountsForRun(active.pool, groupTables, runId);
        expect(truthAfterDryRun).toEqual(finalVector);
        const runStillPresent = await active.pool.query(
          'SELECT 1 FROM release_canary_runs WHERE id = $1',
          [runId]
        );
        expect(runStillPresent.rows).toHaveLength(1);

        // Execute path is mechanically blocked.
        await expect(runPurge(purgeClient, { execute: true })).rejects.toThrow(
          /mechanically blocked/
        );
      } finally {
        purgeClient.release();
      }
      await active.pool.query('UPDATE release_canary_runs SET expires_at = $2 WHERE id = $1', [
        runId,
        savedExpiry.rows[0]?.expires_at,
      ]);

      // ---- Assertion script: malformed stored run cannot pass ---------------
      // Layer 1: the schema CHECK constraint mechanically rejects a stored
      // total that is inconsistent with the group counts.
      await expect(
        active.pool.query(
          'UPDATE release_canary_runs SET total_residue_count = total_residue_count + 1 WHERE id = $1',
          [runId]
        )
      ).rejects.toThrow(/release_canary_runs_residue_count_check/);
      // Layer 2: even when the database defense is removed, the assertion
      // script independently rejects the malformed stored run.
      const checkDef = await active.pool.query<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def
           FROM pg_constraint
          WHERE conrelid = 'public.release_canary_runs'::regclass
            AND conname = 'release_canary_runs_residue_count_check'`
      );
      const constraintDefinition = checkDef.rows[0]?.def;
      if (!constraintDefinition) throw new Error('residue count check constraint not found');
      await active.pool.query(
        'ALTER TABLE release_canary_runs DROP CONSTRAINT release_canary_runs_residue_count_check'
      );
      try {
        await active.pool.query(
          'UPDATE release_canary_runs SET total_residue_count = total_residue_count + 1 WHERE id = $1',
          [runId]
        );
        const malformedRows = await active.pool.query(RELEASE_CANARY_RUNS_QUERY);
        const malformedVerdict = evaluateCanaryResidue({
          expectedSha: CANARY_SHA,
          rows: malformedRows.rows,
          policy,
        }) as { verdict: string };
        expect(malformedVerdict.verdict).toBe('invalid');
        await active.pool.query(
          'UPDATE release_canary_runs SET total_residue_count = total_residue_count - 1 WHERE id = $1',
          [runId]
        );
      } finally {
        await active.pool.query(
          `ALTER TABLE release_canary_runs ADD CONSTRAINT release_canary_runs_residue_count_check ${constraintDefinition}`
        );
      }
      const healthyRows = await active.pool.query(RELEASE_CANARY_RUNS_QUERY);
      expect(
        evaluateCanaryResidue({ expectedSha: CANARY_SHA, rows: healthyRows.rows, policy })
      ).toMatchObject({ verdict: 'pass', exitCode: 0 });

      // ---- Characterization record ------------------------------------------
      const resolvedResultPath =
        initialCharacterizationEnv.resultPath ??
        path.join(tmpdir(), `release-canary-residue-characterization-${suffix}.json`);
      const resolvedSourceSha = initialCharacterizationEnv.sourceSha ?? 'f'.repeat(40);
      const record = {
        schemaVersion: 'release-canary-residue-characterization-v1',
        sourceSha: resolvedSourceSha,
        contractVersion: 'release-canary-residue-characterization-v1',
        reservedResidue: RELEASE_CANARY_RESERVED_RESIDUE,
        phases,
        finalResidue: finalVector,
        failureBoundaries,
        result: 'passed',
      };

      // When either env var is absent, no file is written.
      expect(
        await writeCharacterizationRecordIfConfigured(record, undefined, resolvedSourceSha)
      ).toBe(false);
      expect(
        await writeCharacterizationRecordIfConfigured(record, resolvedResultPath, undefined)
      ).toBe(false);

      // Contract rejects a wrong-shaped sourceSha. The probe record is fully
      // reserved-shaped so ONLY sourceSha differs between accept and reject
      // (39 hex chars keeps the secret-shape scanner quiet while failing the
      // 40-hex SHA schema).
      const contractProbeRecord = {
        schemaVersion: 'release-canary-residue-characterization-v1',
        sourceSha: resolvedSourceSha,
        contractVersion: 'release-canary-residue-characterization-v1',
        reservedResidue: RELEASE_CANARY_RESERVED_RESIDUE,
        phases: [{ name: 'final', residue: RELEASE_CANARY_RESERVED_RESIDUE }],
        finalResidue: RELEASE_CANARY_RESERVED_RESIDUE,
        failureBoundaries: [{ name: 'probe', residue: RELEASE_CANARY_RESERVED_RESIDUE }],
        result: 'passed',
      };
      expect(() => parseReleaseCanaryResidueCharacterization(contractProbeRecord)).not.toThrow();
      expect(() =>
        parseReleaseCanaryResidueCharacterization({
          ...contractProbeRecord,
          sourceSha: 'a'.repeat(39),
        })
      ).toThrow();

      // Only a record whose final vector matches the frozen reservation may be
      // written; a mismatch must surface as a missing artifact, never a fudged
      // record (the contract itself rejects finalResidue != reserved).
      if (vectorEquals(finalVector, RELEASE_CANARY_RESERVED_RESIDUE)) {
        const written = await writeCharacterizationRecordIfConfigured(
          record,
          resolvedResultPath,
          resolvedSourceSha
        );
        expect(written).toBe(true);
        const recordStat = await stat(resolvedResultPath);
        expect(recordStat.mode & 0o777).toBe(0o600);
        const { readFile } = await import('node:fs/promises');
        const parsedBack = parseReleaseCanaryResidueCharacterization(
          JSON.parse(await readFile(resolvedResultPath, 'utf8'))
        );
        expect(parsedBack.sourceSha).toBe(resolvedSourceSha);
        expect(parsedBack.finalResidue).toEqual(finalVector);
        expect(parsedBack.phases.map((phase) => phase.name)).toEqual(
          phases.map((phase) => phase.name)
        );
        expect(parsedBack.failureBoundaries.map((boundary) => boundary.name)).toEqual(
          failureBoundaries.map((boundary) => boundary.name)
        );
        expect(parsedBack.result).toBe('passed');
      } else {
        console.warn(
          '[characterization] measured final vector diverges from the frozen reservation; ' +
            'no characterization record written (owner-gated vector redesign required). ' +
            `measured=${JSON.stringify(finalVector)} reserved=${JSON.stringify(
              RELEASE_CANARY_RESERVED_RESIDUE
            )}`
        );
        // The missing artifact is the CI gate mechanism: release-proof.yml
        // fails its `test -f "$RESULT_PATH"` step when no record exists.
        expect(existsSync(resolvedResultPath)).toBe(false);
      }

    },
    WHOLE_TEST_TIMEOUT_MS
  );
});
