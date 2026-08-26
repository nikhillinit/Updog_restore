import express from 'express';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { applyScenarioMigrations } from '../../helpers/scenario-migrations';
import { runMigrationsWithConnectionString } from '../../helpers/testcontainers-migration';
import type { FundDraftWriteV1 } from '../../../shared/contracts/fund-draft-write-v1.contract';

const STARTUP_TIMEOUT_MS = 90_000;
const AUTH_SECRET = 'scenario-retention-integration-secret-minimum-32';
const AUTH_ISSUER = 'updog-api';
const AUTH_AUDIENCE = 'updog-client';

type TestContextWithSkip = { skip?: () => void };

interface Runtime {
  app: express.Express;
  pool: Pool;
  postgres: StartedPostgreSqlContainer;
  authHeader: string;
  fundId: number;
  configId: number;
}

let runtime: Runtime | null = null;
let skipReason: string | null = null;
let isStoppingPostgres = false;

function visibleLocalSkip(ctx: TestContextWithSkip): boolean {
  if (!skipReason) return false;
  console.warn(`[scenario-retention-concurrency] SKIP: ${skipReason}`);
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

async function stopPostgresContainer(postgres: StartedPostgreSqlContainer | undefined) {
  if (!postgres) return;
  if (process.env.CI === 'true') {
    console.warn(
      '[scenario-retention-concurrency] Postgres container left for CI cleanup after pg pools close'
    );
    return;
  }
  await postgres.stop();
}

function baseDraft(): FundDraftWriteV1 {
  return {
    fundName: 'Scenario Retention Fund',
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

function feeProfilePayload(managementFeeRateDecimal: string): Record<string, unknown> {
  return {
    feeProfiles: [
      {
        id: `fee-profile-${managementFeeRateDecimal}`,
        name: `Fee ${managementFeeRateDecimal}`,
        feeTiers: [
          {
            id: `tier-${managementFeeRateDecimal}`,
            name: 'Management fee',
            percentage: Number(managementFeeRateDecimal) * 100,
            feeBasis: 'committed_capital',
            startMonth: 0,
          },
        ],
      },
    ],
  };
}

async function insertScenarioSet(
  pool: Pool,
  input: {
    fundId: number;
    configId: number;
    name: string;
    managementFeeRateDecimal: string;
  }
): Promise<string> {
  const scenarioSet = await pool.query<{ id: string }>(
    `INSERT INTO fund_scenario_sets (
       fund_id, name, source_config_id, source_config_version, created_by_label, updated_by_label
     )
     VALUES ($1, $2, $3, 1, 'integration@example.com', 'integration@example.com')
     RETURNING id`,
    [input.fundId, input.name, input.configId]
  );
  const scenarioSetId = scenarioSet.rows[0]!.id;

  await pool.query(
    `INSERT INTO fund_scenario_variants (
       scenario_set_id, name, sort_order, override_type, override_payload
     )
     VALUES ($1, 'Fee variant', 0, 'fee_profile', $2)`,
    [scenarioSetId, feeProfilePayload(input.managementFeeRateDecimal)]
  );

  return scenarioSetId;
}

async function updateScenarioFeeProfile(
  pool: Pool,
  scenarioSetId: string,
  managementFeeRateDecimal: string
): Promise<void> {
  await pool.query(
    `UPDATE fund_scenario_variants
        SET override_payload = $2,
            updated_at = NOW()
      WHERE scenario_set_id = $1`,
    [scenarioSetId, feeProfilePayload(managementFeeRateDecimal)]
  );
}

async function seedRuntimeFixtures(pool: Pool): Promise<{ fundId: number; configId: number }> {
  const fund = await pool.query<{ id: number }>(
    `INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    ['Scenario Retention Fund', '100000000.00', '0.0200', '0.2000', 2026]
  );
  const fundId = fund.rows[0]!.id;
  const config = await pool.query<{ id: number }>(
    `INSERT INTO fundconfigs (fund_id, version, config, is_draft, is_published)
     VALUES ($1, 1, $2, false, true)
     RETURNING id`,
    [fundId, baseDraft()]
  );
  return { fundId, configId: config.rows[0]!.id };
}

async function startRuntime(): Promise<Runtime> {
  const postgres = await new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_password')
    .withStartupTimeout(STARTUP_TIMEOUT_MS)
    .start();

  const connectionString = postgres.getConnectionUri();
  const pool = createRuntimePool(connectionString);

  await runMigrationsWithConnectionString(connectionString);
  await applyScenarioMigrations(pool);
  const { fundId, configId } = await seedRuntimeFixtures(pool);

  vi.resetModules();
  process.env.NODE_ENV = 'test';
  process.env._EXPLICIT_NODE_ENV = 'test';
  process.env.DATABASE_URL = connectionString;
  process.env._EXPLICIT_DATABASE_URL = connectionString;
  process.env.USE_REAL_DB_IN_VITEST = '1';
  process.env.ENABLE_QUEUES = '0';
  process.env._EXPLICIT_ENABLE_QUEUES = '0';
  process.env.REDIS_URL = 'memory://';
  process.env._EXPLICIT_REDIS_URL = 'memory://';
  process.env.JWT_SECRET = AUTH_SECRET;
  process.env._EXPLICIT_JWT_SECRET = AUTH_SECRET;
  process.env.JWT_ISSUER = AUTH_ISSUER;
  process.env._EXPLICIT_JWT_ISSUER = AUTH_ISSUER;
  process.env.JWT_AUDIENCE = AUTH_AUDIENCE;
  process.env._EXPLICIT_JWT_AUDIENCE = AUTH_AUDIENCE;
  process.env.JWT_ALG = 'HS256';
  process.env._EXPLICIT_JWT_ALG = 'HS256';

  const { default: scenarioRoutes } = await import('../../../server/routes/fund-scenario-sets');
  const { signToken } = await import('../../../server/lib/auth/jwt');

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', scenarioRoutes);

  const authHeader = `Bearer ${signToken({
    sub: 'scenario-retention-integration',
    email: 'integration@example.com',
    role: 'admin',
    fundIds: [fundId],
  })}`;

  return { app, pool, postgres, authHeader, fundId, configId };
}

async function calculateFeeProfileScenario(active: Runtime, scenarioSetId: string) {
  const response = await request(active.app)
    .post(`/api/funds/${active.fundId}/scenario-sets/${scenarioSetId}/calculate`)
    .set('Authorization', active.authHeader)
    .send({});
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body as { snapshotId: number };
}

describe('scenario retention concurrency integration', () => {
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    try {
      runtime = await startRuntime();
    } catch (error) {
      if (process.env.CI || !isContainerRuntimeUnavailable(error)) {
        throw new Error(
          `Scenario retention concurrency startup failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      skipReason = `Scenario retention concurrency infrastructure unavailable locally: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }, STARTUP_TIMEOUT_MS * 2);

  afterAll(async () => {
    isStoppingPostgres = true;
    const active = runtime;
    let closePgCircuitPool: (() => Promise<void>) | null = null;

    try {
      const db = await import('../../../server/db/pg-circuit');
      closePgCircuitPool = db.closePool;
    } catch {
      // The pg-circuit module may never load if startup failed before route import.
    }
    await tolerateExpectedPostgresStop([closePgCircuitPool?.(), active?.pool.end()]);
    await stopPostgresContainer(active?.postgres);
    restoreEnv(originalEnv);
    vi.resetModules();
  });

  it('collapses concurrent identical fee-profile requests to one completed run and one snapshot', async (ctx) => {
    if (visibleLocalSkip(ctx)) return;
    expect(runtime).not.toBeNull();
    const active = runtime!;
    const scenarioSetId = await insertScenarioSet(active.pool, {
      fundId: active.fundId,
      configId: active.configId,
      name: 'Concurrent fee profile',
      managementFeeRateDecimal: '0.0200',
    });

    const responses = await Promise.all(
      Array.from({ length: 50 }, () =>
        request(active.app)
          .post(`/api/funds/${active.fundId}/scenario-sets/${scenarioSetId}/calculate`)
          .set('Authorization', active.authHeader)
          .send({})
      )
    );

    for (const response of responses) {
      expect(response.status, JSON.stringify(response.body)).toBe(200);
    }
    expect(new Set(responses.map((response) => response.body.snapshotId)).size).toBe(1);

    const runs = await active.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM fund_scenario_calculation_runs
        WHERE scenario_set_id = $1
          AND status = 'completed'`,
      [scenarioSetId]
    );
    expect(runs.rows[0]?.count).toBe('1');

    const snapshots = await active.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM fund_snapshots
        WHERE scenario_set_id = $1
          AND type = 'SCENARIOS'`,
      [scenarioSetId]
    );
    expect(snapshots.rows[0]?.count).toBe('1');
  });

  it('appends a new snapshot when canonical input hash changes', async (ctx) => {
    if (visibleLocalSkip(ctx)) return;
    expect(runtime).not.toBeNull();
    const active = runtime!;
    const scenarioSetId = await insertScenarioSet(active.pool, {
      fundId: active.fundId,
      configId: active.configId,
      name: 'Changed fee profile',
      managementFeeRateDecimal: '0.0200',
    });

    const first = await calculateFeeProfileScenario(active, scenarioSetId);
    await updateScenarioFeeProfile(active.pool, scenarioSetId, '0.0210');
    const second = await calculateFeeProfileScenario(active, scenarioSetId);

    expect(second.snapshotId).not.toBe(first.snapshotId);

    const snapshots = await active.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM fund_snapshots
        WHERE scenario_set_id = $1
          AND type = 'SCENARIOS'`,
      [scenarioSetId]
    );
    expect(snapshots.rows[0]?.count).toBe('2');
  });
});
