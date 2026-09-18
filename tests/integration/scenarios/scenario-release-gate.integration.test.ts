import express from 'express';
import type { Queue, QueueEvents } from 'bullmq';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runMigrationsWithConnectionString } from '../../helpers/testcontainers-migration';
import { applyScenarioMigrations } from '../../helpers/scenario-migrations';
import type {
  CreateFundScenarioSetV1,
  FundScenarioCalculationResponseV1,
  FundScenarioCalculationStatusV1,
  FundScenarioReserveCalculationQueuedV1,
  FundScenarioSetDetailV1,
} from '../../../shared/contracts/fund-scenario-sets-v1.contract';
import type { FundScenarioComparisonV1 } from '../../../shared/contracts/fund-scenario-comparison-v1.contract';
import { FundScenarioComparisonV1Schema } from '../../../shared/contracts/fund-scenario-comparison-v1.contract';
import {
  FundScenarioCalculationPayloadV1Schema,
  FundScenarioCalculationResponseV1Schema,
  FundScenarioSetDetailV1Schema,
} from '../../../shared/contracts/fund-scenario-sets-v1.contract';
import { EconomicsResultV1Schema } from '../../../shared/contracts/economics-v1.contract';
import type { FundDraftWriteV1 } from '../../../shared/contracts/fund-draft-write-v1.contract';
import {
  FundResultsReadV1Schema,
  type FundResultsReadV1,
} from '../../../shared/contracts/fund-results-v1.contract';

const STARTUP_TIMEOUT_MS = 90_000;
const AUTH_SECRET = 'scenario-release-gate-secret-minimum-32';
const AUTH_ISSUER = 'updog-api';
const AUTH_AUDIENCE = 'updog-client';

type TestContextWithSkip = { skip?: () => void };
type SignToken = (data: object) => string;

interface Runtime {
  app: express.Express;
  pool: Pool;
  queues: Queue[];
  workerHarness: { queueEvents: QueueEvents; close: () => Promise<void> };
  postgres: StartedPostgreSqlContainer;
  redis: StartedTestContainer;
  signToken: SignToken;
}

interface ActiveFund {
  fundId: number;
  configId: number;
  companyId: number;
  authHeader: string;
}

let runtime: Runtime | null = null;
let skipReason: string | null = null;
let isStoppingPostgres = false;
let startedPostgres: StartedPostgreSqlContainer | undefined;
let startedRedis: StartedTestContainer | undefined;
let startedPool: Pool | undefined;
let runtimeImportsStarted = false;

function visibleLocalSkip(ctx: TestContextWithSkip): boolean {
  if (!skipReason) return false;
  console.warn(`[scenario-release-gate] SKIP: ${skipReason}`);
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

function isExpectedPostgresStopError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
  const message = error instanceof Error ? error.message : String(error);
  return code === '57P01' || /terminating connection due to administrator command/i.test(message);
}

function createRuntimePool(connectionString: string): Pool {
  const pool = new Pool({ connectionString, max: 4 });
  pool.on('error', (error) => {
    if (isStoppingPostgres && isExpectedPostgresStopError(error)) {
      return;
    }
    throw error;
  });
  return pool;
}

async function tolerateExpectedPostgresStop(
  operations: Array<Promise<void> | undefined>
): Promise<void> {
  const results = await Promise.allSettled(
    operations.map((operation) => operation ?? Promise.resolve())
  );
  for (const result of results) {
    if (result.status === 'rejected' && !isExpectedPostgresStopError(result.reason)) {
      throw result.reason;
    }
  }
}

function baseDraft(): FundDraftWriteV1 {
  return {
    fundName: 'Synthetic hypothetical scenario comparison fund',
    fundSize: 100_000_000,
    managementFeeRate: 2,
    carriedInterest: 20,
    vintageYear: 2026,
    fundLife: 10,
    investmentPeriod: 5,
    gpCommitment: 10_000_000,
    economicsAssumptions: {
      version: 'v1',
      timeline: {
        fundLifeYears: 10,
        period: 'annual',
        vintageYear: 2026,
      },
      feeModel: {
        source: 'legacy_fee_profiles',
        defaultRate: 0.02,
        defaultBasis: 'committed_capital',
      },
      exitModel: {
        mode: 'cohort',
        cohort: {
          exitDistributionByYear: [0, 0, 0, 0, 0.2, 0.2, 0.2, 0.2, 0.1, 0.1],
          grossMultiple: 2.5,
          lossRatio: 0,
        },
      },
      recyclingModel: {
        enabled: false,
        sources: ['exit_proceeds'],
        capPctOfCommitments: 0,
        timing: 'before_waterfall',
      },
      waterfallModel: {
        type: 'american',
        carryPct: 0.2,
        hurdleRate: 0.08,
        prefType: 'compounded',
        prefCompounding: 'annual',
        prefCatchUp: true,
        catchUpRate: 1,
        catchUpTargetCarryPct: 0.2,
        clawbackEnabled: true,
        clawbackTrigger: 'final_liquidation',
        escrowPct: 0,
        feeOffsetTreatment: 'none',
      },
      gpCommitmentModel: {
        commitmentAmount: 10_000_000,
        participatesInInvestmentReturns: true,
      },
    },
  };
}

async function startRuntime(): Promise<Runtime> {
  const postgres = await new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_password')
    .withStartupTimeout(STARTUP_TIMEOUT_MS)
    .start();
  startedPostgres = postgres;
  const redis = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/.*Ready to accept connections.*/))
    .withStartupTimeout(STARTUP_TIMEOUT_MS)
    .start();
  startedRedis = redis;

  const connectionString = postgres.getConnectionUri();
  const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  const pool = createRuntimePool(connectionString);
  startedPool = pool;

  await runMigrationsWithConnectionString(connectionString);
  await applyScenarioMigrations(pool);

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
  process.env.ENABLE_GP_ECONOMICS_ENGINE = '1';

  runtimeImportsStarted = true;
  const { default: scenarioRoutes } = await import('../../../server/routes/fund-scenario-sets');
  const { registerFundConfigRoutes } = await import('../../../server/routes/fund-config');
  const { signToken, requireAuth } = await import('../../../server/lib/auth/jwt');
  const { getRegisteredQueueRuntime } = await import('../../../server/queues/registry');
  const { startInProcessFundScenarioCalcWorkerHarness } =
    await import('../../../workers/fund-scenario-calc-worker-harness');

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', requireAuth());
  app.use('/api', scenarioRoutes);
  registerFundConfigRoutes(app);

  const workerHarness = await withFundScenarioWorkerIdentity(() =>
    startInProcessFundScenarioCalcWorkerHarness()
  );
  const queueKeys = ['fund-scenario-calc', 'reserve-calc', 'pacing-calc', 'cohort-calc'] as const;
  const queues = [
    ...new Set(
      queueKeys
        .map((key) => getRegisteredQueueRuntime(key)?.getQueue())
        .filter((queue): queue is Queue => queue !== null && queue !== undefined)
    ),
  ];

  return { app, pool, queues, workerHarness, postgres, redis, signToken };
}

async function seedPublishedFundConfig(active: Runtime): Promise<ActiveFund> {
  const fund = await active.pool.query<{ id: number }>(
    `INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    ['Synthetic hypothetical scenario comparison fund', '100000000.00', '0.0200', '0.2000', 2026]
  );
  const fundId = fund.rows[0]!.id;

  const config = await active.pool.query<{ id: number }>(
    `INSERT INTO fundconfigs (fund_id, version, config, is_draft, is_published)
     VALUES ($1, 1, $2, false, true)
     RETURNING id`,
    [fundId, baseDraft()]
  );
  const configId = config.rows[0]!.id;

  const company = await active.pool.query<{ id: number }>(
    `INSERT INTO portfoliocompanies (
       fund_id, name, sector, stage, investment_amount, current_valuation, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'active')
     RETURNING id`,
    [fundId, 'ScenarioGateCo', 'Software', 'seed', '1000000.00', '2500000.00']
  );
  const companyId = company.rows[0]!.id;

  await active.pool.query(
    `INSERT INTO investments (
       fund_id, company_id, investment_date, amount, round, ownership_percentage
     )
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [fundId, companyId, new Date('2026-01-01T00:00:00Z'), '1000000.00', 'seed', '0.1500']
  );

  const authHeader = `Bearer ${active.signToken({
    sub: 'scenario-release-gate',
    email: 'integration@example.com',
    role: 'admin',
    fundIds: [fundId],
  })}`;

  return { fundId, configId, companyId, authHeader };
}

function feeProfileScenarioInput(): CreateFundScenarioSetV1 {
  return {
    name: 'Hypothetical management fee comparison',
    variants: [
      {
        name: 'Higher management fee',
        override: {
          overrideType: 'fee_profile',
          payload: {
            feeProfiles: [
              {
                id: 'fee-profile-release-gate',
                name: 'Higher management fee',
                feeTiers: [
                  {
                    id: 'release-gate-tier',
                    name: 'Management fee',
                    percentage: 2.1,
                    feeBasis: 'committed_capital',
                    startMonth: 0,
                  },
                ],
              },
            ],
          },
        },
      },
    ],
  };
}

function reserveScenarioInput(active: ActiveFund): CreateFundScenarioSetV1 {
  return {
    name: 'Reserve allocation hardening gate',
    variants: [
      {
        name: 'Reserve adjustment',
        override: {
          overrideType: 'reserve_allocation',
          payload: {
            items: [
              {
                companyId: active.companyId,
                plannedReservesCents: 1_500_000_00,
                allocationReason: 'Scenario release gate reserve adjustment',
              },
            ],
          },
        },
      },
    ],
  };
}

async function createScenarioSet(
  active: Runtime,
  fund: ActiveFund,
  input: CreateFundScenarioSetV1
): Promise<FundScenarioSetDetailV1> {
  const response = await request(active.app)
    .post(`/api/funds/${fund.fundId}/scenario-sets`)
    .set('Authorization', fund.authHeader)
    .set('Idempotency-Key', `${input.name}-${fund.fundId}`)
    .send(input);

  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return FundScenarioSetDetailV1Schema.parse(response.body);
}

async function calculateFeeProfileScenario(
  active: Runtime,
  fund: ActiveFund,
  scenarioSetId: string
): Promise<FundScenarioCalculationResponseV1> {
  const response = await request(active.app)
    .post(`/api/funds/${fund.fundId}/scenario-sets/${scenarioSetId}/calculate`)
    .set('Authorization', fund.authHeader)
    .send({});

  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return FundScenarioCalculationResponseV1Schema.parse(response.body);
}

async function readScenarioComparison(
  active: Runtime,
  fund: ActiveFund,
  scenarioSetId: string
): Promise<FundScenarioComparisonV1> {
  const response = await request(active.app)
    .get(`/api/funds/${fund.fundId}/scenario-sets/${scenarioSetId}/comparison`)
    .set('Authorization', fund.authHeader);

  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return FundScenarioComparisonV1Schema.parse(response.body);
}

async function enqueueReserveScenarioCalculation(
  active: Runtime,
  fund: ActiveFund,
  scenarioSetId: string
): Promise<FundScenarioReserveCalculationQueuedV1> {
  const response = await request(active.app)
    .post(`/api/funds/${fund.fundId}/scenario-sets/${scenarioSetId}/calculate-reserve`)
    .set('Authorization', fund.authHeader)
    .set('Idempotency-Key', `release-gate-reserve-${scenarioSetId}`)
    .send({ calculationMode: 'async_reserve_allocation' });

  expect(response.status, JSON.stringify(response.body)).toBe(202);
  return response.body as FundScenarioReserveCalculationQueuedV1;
}

async function pollScenarioCalculationStatus(
  active: Runtime,
  fund: ActiveFund,
  scenarioSetId: string
): Promise<FundScenarioCalculationStatusV1> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await request(active.app)
      .get(`/api/funds/${fund.fundId}/scenario-sets/${scenarioSetId}/calculation-status`)
      .set('Authorization', fund.authHeader)
      .expect(200);
    const status = response.body as FundScenarioCalculationStatusV1;
    if (status.status === 'succeeded' || status.status === 'failed') {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for scenario calculation status');
}

async function readFundResults(active: Runtime, fund: ActiveFund): Promise<FundResultsReadV1> {
  const response = await request(active.app)
    .get(`/api/funds/${fund.fundId}/results`)
    .set('Authorization', fund.authHeader);

  expect(response.status, JSON.stringify(response.body)).toBe(200);
  // Strict-parse the REAL service output with the owning shared contract --
  // the same acceptance gate release canary 3 applies against production.
  return FundResultsReadV1Schema.parse(response.body);
}

async function archiveScenarioSet(
  active: Runtime,
  fund: ActiveFund,
  scenarioSetId: string
): Promise<void> {
  await request(active.app)
    .post(`/api/funds/${fund.fundId}/scenario-sets/${scenarioSetId}/archive`)
    .set('Authorization', fund.authHeader)
    .send({ reason: 'Scenario release gate archive proof' })
    .expect(200);
}

describe('scenario release gate integration', () => {
  const originalEnv = {
    ...process.env,
    ENABLE_GP_ECONOMICS_ENGINE: process.env.ENABLE_GP_ECONOMICS_ENGINE,
  };

  beforeAll(async () => {
    try {
      runtime = await startRuntime();
    } catch (error) {
      if (process.env.CI || !isContainerRuntimeUnavailable(error)) {
        throw new Error(
          `Scenario release gate startup failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      skipReason = `Scenario release gate infrastructure unavailable locally: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }, STARTUP_TIMEOUT_MS * 2);

  afterAll(async () => {
    isStoppingPostgres = true;
    const active = runtime;
    runtime = null;
    const cleanupErrors: unknown[] = [];
    let closePgCircuitPool: (() => Promise<void>) | null = null;
    let closePrimaryDatabasePool: (() => Promise<void>) | null = null;
    try {
      await tolerateExpectedPostgresStop([
        active?.workerHarness.close(),
        ...(active?.queues ?? []).map((queue) => queue.close()),
      ]).catch((error: unknown) => cleanupErrors.push(error));
      if (runtimeImportsStarted) {
        try {
          const db = await import('../../../server/db/pg-circuit');
          closePgCircuitPool = db.closePool;
        } catch {
          // The module may never load if startup failed before route import.
        }
        try {
          const db = await import('../../../server/db');
          closePrimaryDatabasePool = db.closeDatabasePool;
        } catch {
          // The module may never load if startup failed before route import.
        }
        try {
          const registry = await import('../../../server/queues/registry');
          registry.resetQueueRegistry();
        } catch {
          // The registry may never load if startup failed before route import.
        }
      }
      await tolerateExpectedPostgresStop([
        closePgCircuitPool?.(),
        closePrimaryDatabasePool?.(),
        (active?.pool ?? startedPool)?.end(),
      ]).catch((error: unknown) => cleanupErrors.push(error));
      const containers = await Promise.allSettled([
        (active?.redis ?? startedRedis)?.stop(),
        (active?.postgres ?? startedPostgres)?.stop(),
      ]);
      for (const result of containers) {
        if (result.status === 'rejected') cleanupErrors.push(result.reason);
      }
    } finally {
      restoreEnv(originalEnv);
      vi.resetModules();
    }
    if (cleanupErrors.length > 0)
      throw new AggregateError(cleanupErrors, 'Scenario runtime cleanup failed');
  }, STARTUP_TIMEOUT_MS);

  it('proves the ADR-022 scenario lifecycle with Postgres, Redis, worker, results, and archive behavior', async (ctx) => {
    if (visibleLocalSkip(ctx)) return;
    expect(runtime).not.toBeNull();
    const active = runtime!;
    const fund = await seedPublishedFundConfig(active);
    const sourceBefore = await active.pool.query(
      'SELECT id, fund_id, version, config, is_draft, is_published FROM fundconfigs WHERE id = $1',
      [fund.configId]
    );
    expect(sourceBefore.rows).toEqual([
      {
        id: fund.configId,
        fund_id: fund.fundId,
        version: 1,
        config: baseDraft(),
        is_draft: false,
        is_published: true,
      },
    ]);

    const feeScenarioSet = await createScenarioSet(active, fund, feeProfileScenarioInput());
    const feeResult = await calculateFeeProfileScenario(active, fund, feeScenarioSet.id);
    expect(feeResult.snapshotId).toEqual(expect.any(Number));

    const missingBaseline = await readScenarioComparison(active, fund, feeScenarioSet.id);
    expect(missingBaseline).toMatchObject({
      comparisonStatus: 'baseline_unavailable',
      unavailableReason: 'BASELINE_ECONOMICS_SNAPSHOT_MISSING',
      baseline: null,
    });

    const baselineRun = await request(active.app)
      .post(`/api/funds/${fund.fundId}/recalculate`)
      .set('Authorization', fund.authHeader)
      .send({});
    expect(baselineRun.status, JSON.stringify(baselineRun.body)).toBe(200);
    expect(baselineRun.body).toMatchObject({
      success: true,
      dispatchState: 'dispatched',
      correlationId: expect.any(String),
      runId: expect.any(Number),
    });
    const baselineRows = await active.pool.query<{
      id: number;
      run_id: number;
      config_id: number;
      config_version: number;
      correlation_id: string;
      scenario_set_id: string | null;
      payload: unknown;
      run_fund_id: number;
      run_config_id: number;
      run_config_version: number;
      run_correlation_id: string;
      dispatch_state: string;
      economics_requested: boolean;
    }>(
      `SELECT s.id, s.run_id, s.config_id, s.config_version, s.correlation_id,
              s.scenario_set_id, s.payload, r.fund_id AS run_fund_id,
              r.config_id AS run_config_id, r.config_version AS run_config_version,
              r.correlation_id AS run_correlation_id, r.dispatch_state,
              r.engines @> '["economics"]'::jsonb AS economics_requested
       FROM fund_snapshots s JOIN calc_runs r ON r.id = s.run_id
       WHERE s.fund_id = $1 AND s.type = 'ECONOMICS'`,
      [fund.fundId]
    );
    expect(baselineRows.rows).toHaveLength(1);
    const baselineRow = baselineRows.rows[0]!;
    expect(baselineRow).toMatchObject({
      run_id: baselineRun.body.runId,
      config_id: fund.configId,
      config_version: 1,
      correlation_id: baselineRun.body.correlationId,
      scenario_set_id: null,
      run_fund_id: fund.fundId,
      run_config_id: fund.configId,
      run_config_version: 1,
      run_correlation_id: baselineRun.body.correlationId,
      dispatch_state: 'dispatched',
      economics_requested: true,
    });
    // Independent oracle: $100m * ten years * 2% = $20m; 2.1% = $21m.
    expect(EconomicsResultV1Schema.parse(baselineRow.payload).summary.totalManagementFees).toBe(
      20_000_000
    );
    const scenarioRows = await active.pool.query<{
      id: number;
      type: string;
      fund_id: number;
      scenario_set_id: string;
      config_id: number;
      config_version: number;
      correlation_id: string;
      state_hash: string;
      metadata_input_hash: string;
      payload: unknown;
      calculation_run_id: string;
      run_snapshot_id: number;
      run_fund_id: number;
      source_config_id: number;
      source_config_version: number;
      input_hash: string;
      run_correlation_id: string;
      status: string;
      completed: boolean;
    }>(
      `SELECT s.id, s.type, s.fund_id, s.scenario_set_id, s.config_id,
              s.config_version, s.correlation_id, s.state_hash, s.payload,
              s.metadata->>'input_hash' AS metadata_input_hash,
              r.id AS calculation_run_id, r.snapshot_id AS run_snapshot_id,
              r.fund_id AS run_fund_id, r.source_config_id, r.source_config_version,
              r.input_hash, r.correlation_id AS run_correlation_id, r.status,
              r.completed_at IS NOT NULL AS completed
       FROM fund_snapshots s JOIN fund_scenario_calculation_runs r ON r.snapshot_id = s.id
       WHERE s.id = $1 AND r.scenario_set_id = $2`,
      [feeResult.snapshotId, feeScenarioSet.id]
    );
    expect(scenarioRows.rows).toHaveLength(1);
    const scenarioRow = scenarioRows.rows[0]!;
    expect(scenarioRow).toMatchObject({
      id: feeResult.snapshotId,
      type: 'SCENARIOS',
      fund_id: fund.fundId,
      scenario_set_id: feeScenarioSet.id,
      config_id: fund.configId,
      config_version: 1,
      correlation_id: feeResult.correlationId,
      run_snapshot_id: feeResult.snapshotId,
      run_fund_id: fund.fundId,
      source_config_id: fund.configId,
      source_config_version: 1,
      run_correlation_id: feeResult.correlationId,
      status: 'completed',
      completed: true,
    });
    expect(scenarioRow.state_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(scenarioRow.input_hash).toBe(scenarioRow.state_hash);
    expect(scenarioRow.metadata_input_hash).toBe(scenarioRow.state_hash);
    const persistedScenario = FundScenarioCalculationPayloadV1Schema.parse(scenarioRow.payload);
    expect(persistedScenario).toEqual(feeResult.payload);
    expect(persistedScenario).toMatchObject({
      fundId: fund.fundId,
      scenarioSetId: feeScenarioSet.id,
      sourceConfigId: fund.configId,
      sourceConfigVersion: 1,
      calculationMode: 'sync_fee_profile',
      variants: [
        {
          variantId: feeScenarioSet.variants[0]!.id,
          scenarioSetId: feeScenarioSet.id,
          overrideType: 'fee_profile',
          economics: { summary: { totalManagementFees: 21_000_000 } },
        },
      ],
    });
    const comparison = await readScenarioComparison(active, fund, feeScenarioSet.id);
    expect(comparison).toMatchObject({
      fundId: fund.fundId,
      comparisonStatus: 'comparable',
      scenarioSet: {
        scenarioSetId: feeScenarioSet.id,
        sourceConfigId: fund.configId,
        sourceConfigVersion: 1,
      },
      baseline: { metrics: { totalManagementFees: 20_000_000 } },
      variants: [
        { variantId: feeScenarioSet.variants[0]!.id, metrics: { totalManagementFees: 21_000_000 } },
      ],
    });
    expect(comparison.unavailableReason).toBeUndefined();
    expect(
      comparison.variants[0]!.metricDeltas.find((delta) => delta.metric === 'totalManagementFees')
    ).toMatchObject({
      baselineValue: 20_000_000,
      scenarioValue: 21_000_000,
      absoluteDelta: 1_000_000,
      percentageDelta: 5,
    });
    const detailResponse = await request(active.app)
      .get(`/api/funds/${fund.fundId}/scenario-sets/${feeScenarioSet.id}`)
      .set('Authorization', fund.authHeader)
      .expect(200);
    const reopened = FundScenarioSetDetailV1Schema.parse(detailResponse.body);
    expect(reopened).toMatchObject({
      id: feeScenarioSet.id,
      sourceConfigId: fund.configId,
      sourceConfigVersion: 1,
      variants: feeScenarioSet.variants,
    });
    const replay = await calculateFeeProfileScenario(active, fund, feeScenarioSet.id);
    expect(replay).toEqual(feeResult);
    const detailAfterReplay = await request(active.app)
      .get(`/api/funds/${fund.fundId}/scenario-sets/${feeScenarioSet.id}`)
      .set('Authorization', fund.authHeader)
      .expect(200);
    expect(FundScenarioSetDetailV1Schema.parse(detailAfterReplay.body)).toEqual(reopened);
    const reopenedComparison = await readScenarioComparison(active, fund, feeScenarioSet.id);
    expect({ ...reopenedComparison, calculatedAt: null }).toEqual({
      ...comparison,
      calculatedAt: null,
    });
    const retainedRuns = await active.pool.query<{
      id: string;
      snapshot_id: number;
      correlation_id: string;
    }>(
      'SELECT id, snapshot_id, correlation_id FROM fund_scenario_calculation_runs WHERE scenario_set_id = $1',
      [feeScenarioSet.id]
    );
    expect(retainedRuns.rows).toEqual([
      {
        id: scenarioRow.calculation_run_id,
        snapshot_id: feeResult.snapshotId,
        correlation_id: feeResult.correlationId,
      },
    ]);
    const retainedSnapshots = await active.pool.query<{ id: number }>(
      'SELECT id FROM fund_snapshots WHERE scenario_set_id = $1',
      [feeScenarioSet.id]
    );
    expect(retainedSnapshots.rows).toEqual([{ id: feeResult.snapshotId }]);
    const sourceAfter = await active.pool.query(
      'SELECT id, fund_id, version, config, is_draft, is_published FROM fundconfigs WHERE id = $1',
      [fund.configId]
    );
    expect(sourceAfter.rows).toEqual(sourceBefore.rows);

    const reserveScenarioSet = await createScenarioSet(active, fund, reserveScenarioInput(fund));
    await enqueueReserveScenarioCalculation(active, fund, reserveScenarioSet.id);
    const terminalStatus = await pollScenarioCalculationStatus(active, fund, reserveScenarioSet.id);
    expect(terminalStatus.status).toBe('succeeded');

    const results = await readFundResults(active, fund);
    expect(results.sections.scenarios.status).not.toBe('unavailable');

    await archiveScenarioSet(active, fund, feeScenarioSet.id);
    const archivedRecalculate = await request(active.app)
      .post(`/api/funds/${fund.fundId}/scenario-sets/${feeScenarioSet.id}/calculate`)
      .set('Authorization', fund.authHeader)
      .send({});
    expect(archivedRecalculate.status).toBe(409);
    expect(archivedRecalculate.body.code).toBe('scenario_set_archived');

    const authoritativeRows = await active.pool.query<{ id: number }>(
      `SELECT id
           FROM fund_snapshots
          WHERE fund_id = $1
            AND type IN ('RESERVE', 'PACING', 'ECONOMICS')
            AND scenario_set_id IS NOT NULL`,
      [fund.fundId]
    );
    expect(authoritativeRows.rows).toHaveLength(0);
  }, 45_000);
});
