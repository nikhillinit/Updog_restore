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
import type { FundDraftWriteV1 } from '../../../shared/contracts/fund-draft-write-v1.contract';
import type { FundResultsReadV1 } from '../../../shared/contracts/fund-results-v1.contract';

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

async function stopPostgresContainer(
  postgres: StartedPostgreSqlContainer | undefined
): Promise<void> {
  if (!postgres) return;
  if (process.env.CI === 'true') {
    console.warn(
      '[scenario-release-gate] Postgres container left for CI cleanup after pg pools close'
    );
    return;
  }
  await postgres.stop();
}

function baseDraft(): FundDraftWriteV1 {
  return {
    fundName: 'Scenario Release Gate Fund',
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
  const redis = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/.*Ready to accept connections.*/))
    .withStartupTimeout(STARTUP_TIMEOUT_MS)
    .start();

  const connectionString = postgres.getConnectionUri();
  const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  const pool = createRuntimePool(connectionString);

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

  const { default: scenarioRoutes } = await import('../../../server/routes/fund-scenario-sets');
  const { registerFundConfigRoutes } = await import('../../../server/routes/fund-config');
  const { signToken } = await import('../../../server/lib/auth/jwt');
  const { getRegisteredQueueRuntime } = await import('../../../server/queues/registry');
  const { startInProcessFundScenarioCalcWorkerHarness } =
    await import('../../../workers/fund-scenario-calc-worker-harness');

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', scenarioRoutes);
  registerFundConfigRoutes(app);

  const workerHarness = await startInProcessFundScenarioCalcWorkerHarness();
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
    ['Scenario Release Gate Fund', '100000000.00', '0.0200', '0.2000', 2026]
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
    name: 'Fee profile hardening gate',
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
  return response.body as FundScenarioSetDetailV1;
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
  return response.body as FundScenarioCalculationResponseV1;
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
  return response.body as FundScenarioComparisonV1;
}

async function enqueueReserveScenarioCalculation(
  active: Runtime,
  fund: ActiveFund,
  scenarioSetId: string
): Promise<FundScenarioReserveCalculationQueuedV1> {
  const response = await request(active.app)
    .post(`/api/funds/${fund.fundId}/scenario-sets/${scenarioSetId}/calculate-reserve`)
    .set('Authorization', fund.authHeader)
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
  return response.body as FundResultsReadV1;
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
  const originalEnv = { ...process.env };

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
    let closePgCircuitPool: (() => Promise<void>) | null = null;
    let closePrimaryDatabasePool: (() => Promise<void>) | null = null;

    await active?.workerHarness.close();
    for (const queue of active?.queues ?? []) {
      await queue.close();
    }
    try {
      const db = await import('../../../server/db/pg-circuit');
      closePgCircuitPool = db.closePool;
    } catch {
      // The pg-circuit module may never load if startup failed before route import.
    }
    try {
      const db = await import('../../../server/db');
      closePrimaryDatabasePool = db.closeDatabasePool;
    } catch {
      // The primary db module may never load if startup failed before route import.
    }
    try {
      const registry = await import('../../../server/queues/registry');
      registry.resetQueueRegistry();
    } catch {
      // Queue registry may never load if startup failed before route import.
    }
    await tolerateExpectedPostgresStop([
      closePgCircuitPool?.(),
      closePrimaryDatabasePool?.(),
      active?.pool.end(),
    ]);
    await active?.redis.stop();
    await stopPostgresContainer(active?.postgres);
    restoreEnv(originalEnv);
    vi.resetModules();
  });

  it('proves the ADR-022 scenario lifecycle with Postgres, Redis, worker, results, and archive behavior', async (ctx) => {
    if (visibleLocalSkip(ctx)) return;
    expect(runtime).not.toBeNull();
    const active = runtime!;
    const fund = await seedPublishedFundConfig(active);

    const feeScenarioSet = await createScenarioSet(active, fund, feeProfileScenarioInput());
    const feeResult = await calculateFeeProfileScenario(active, fund, feeScenarioSet.id);
    expect(feeResult.snapshotId).toEqual(expect.any(Number));

    const comparison = await readScenarioComparison(active, fund, feeScenarioSet.id);
    expect(['comparable', 'baseline_unavailable']).toContain(comparison.comparisonStatus);
    if (comparison.comparisonStatus === 'baseline_unavailable') {
      expect(comparison.unavailableReason).toEqual(expect.any(String));
    }

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
