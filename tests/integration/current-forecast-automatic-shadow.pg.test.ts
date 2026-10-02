/**
 * @group integration
 * @group testcontainers
 *
 * Real PostgreSQL proof that the authenticated financial-facts commit surface
 * automatically executes and persists the current-forecast shadow path.
 */
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { manageIsolatedDatabasePool } from '../helpers/isolated-postgres-database';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const STARTUP_TIMEOUT_MS = 180_000;
const TEST_TIMEOUT_MS = 60_000;
const AUTH_SECRET = randomUUID().repeat(2);
const AUTH_ISSUER = 'automatic-shadow-test';
const AUTH_AUDIENCE = 'automatic-shadow-test-app';
const originalEnvironment = { ...process.env };

const PUBLISHED_CONFIG = {
  fundName: 'Automatic Shadow Synthetic Fund',
  fundSize: 1_000_000,
  fundLife: 10,
  capitalPlanAllocations: [
    {
      id: 'seed',
      name: 'Seed',
      entryRound: 'Seed',
      capitalAllocationPct: 1,
      initialCheckStrategy: 'amount',
      initialCheckAmount: 100_000,
      followOnStrategy: 'amount',
      followOnAmount: 200_000,
      followOnParticipationPct: 0.25,
      investmentHorizonMonths: 24,
    },
  ],
  economicsAssumptions: {
    version: 'v1',
    feeModel: {
      source: 'economics_override',
      tiers: [
        {
          id: 'management-fee',
          name: 'Management fee',
          rate: 0.02,
          basis: 'committed_capital',
          startYear: 1,
          endYear: 10,
        },
      ],
    },
  },
};

let container: import('@testcontainers/postgresql').StartedPostgreSqlContainer | undefined;
let adminPool: Pool | undefined;
let observerPool: Pool | undefined;
let databaseName = '';
let databaseUrl = '';
let dbModule: typeof import('../../server/db');
let app: ReturnType<(typeof import('../../server/app'))['makeApp']>;
let signToken: (claims: object) => string;

function restoreEnvironment(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
}

function authHeader(userId: number, fundId: number): string {
  return `Bearer ${signToken({
    sub: String(userId),
    email: 'automatic-shadow@example.com',
    role: 'admin',
    orgId: 'automatic-shadow-org',
    fundIds: [fundId],
  })}`;
}

describe('current-forecast automatic shadow PostgreSQL acceptance', () => {
  beforeAll(async () => {
    let baseUrl = process.env['TEST_DATABASE_URL'];
    if (!baseUrl) {
      const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
      container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
        .withDatabase('test_db')
        .withUsername('test_user')
        .withPassword('test_password')
        .start();
      baseUrl = container.getConnectionUri();
    }

    adminPool = new Pool({ connectionString: baseUrl, max: 1 });
    databaseName = `cf_automatic_shadow_${process.pid}_${Date.now()}`.toLowerCase();
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
    const isolatedUrl = new URL(baseUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    databaseUrl = isolatedUrl.toString();
    await runMigrationsWithConnectionString(databaseUrl);
    observerPool = new Pool({ connectionString: databaseUrl, max: 4 });

    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      _EXPLICIT_DATABASE_URL: '1',
      USE_REAL_DB_IN_VITEST: '1',
      NODE_ENV: 'test',
      _EXPLICIT_NODE_ENV: 'test',
      REDIS_URL: 'memory://',
      _EXPLICIT_REDIS_URL: '1',
      ENABLE_QUEUES: '0',
      _EXPLICIT_ENABLE_QUEUES: '1',
      RATE_LIMIT_MAX: '1000',
      JWT_SECRET: AUTH_SECRET,
      _EXPLICIT_JWT_SECRET: '1',
      JWT_ISSUER: AUTH_ISSUER,
      _EXPLICIT_JWT_ISSUER: '1',
      JWT_AUDIENCE: AUTH_AUDIENCE,
      _EXPLICIT_JWT_AUDIENCE: '1',
      JWT_ALG: 'HS256',
      _EXPLICIT_JWT_ALG: '1',
    });
    delete process.env['NEON_DATABASE_URL'];
    delete process.env['ACTUALS_PILOT_FUND_ID'];

    vi.resetModules();
    dbModule = await import('../../server/db');
    ({ signToken } = await import('../../server/lib/auth/jwt'));
    app = (await import('../../server/app')).makeApp();
  }, STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    await dbModule?.closeDatabasePool();
    if (observerPool && adminPool && databaseName.startsWith('cf_automatic_shadow_')) {
      await manageIsolatedDatabasePool(observerPool).dropDatabase(adminPool, databaseName);
    } else {
      await observerPool?.end();
    }
    await adminPool?.end();
    await container?.stop();
    restoreEnvironment();
    vi.resetModules();
  }, STARTUP_TIMEOUT_MS);

  it(
    'facts POST automatically pins the committed facts and current plan into a persisted shadow match',
    async () => {
      const pool = observerPool!;
      const fund = await pool.query<{ id: number }>(`
        INSERT INTO funds (
          name, size, management_fee, carry_percentage, vintage_year,
          status, is_active, base_currency, data_origin
        ) VALUES (
          'Automatic Shadow Synthetic Fund', 1000000.00, 0.0200, 0.2000, 2026,
          'active', true, 'USD', 'production'
        ) RETURNING id
      `);
      const fundId = fund.rows[0]!.id;
      const user = await pool.query<{ id: number }>(`
        INSERT INTO users (username, password, role, is_active)
        VALUES ('automatic-shadow-admin', 'unused', 'admin', true)
        RETURNING id
      `);
      const userId = user.rows[0]!.id;
      await pool.query('INSERT INTO user_fund_grants (user_id, fund_id) VALUES ($1, $2)', [
        userId,
        fundId,
      ]);
      await pool.query(
        `INSERT INTO cash_flow_events (
           fund_id, event_type, amount, currency, event_date, perspective, status
         ) VALUES
           ($1, 'lp_capital_call', 100000.00, 'USD', '2026-03-01', 'lp_net', 'approved'),
           ($1, 'lp_distribution', 10000.00, 'USD', '2026-03-20', 'lp_net', 'approved')`,
        [fundId]
      );
      await pool.query(
        `INSERT INTO fundconfigs (
           fund_id, version, config, is_draft, is_published, published_at
         ) VALUES ($1, 1, $2::jsonb, false, true, now())`,
        [fundId, JSON.stringify(PUBLISHED_CONFIG)]
      );

      const factsPath = `/api/admin/funds/${fundId}/financial-facts/snapshots`;
      const authorization = authHeader(userId, fundId);
      const firstCommit = await request(app)
        .post(factsPath)
        .set('Authorization', authorization)
        .set('Idempotency-Key', randomUUID())
        .send({ asOfDate: '2026-03-31' });
      expect(firstCommit.status).toBe(200);

      const { mintCurrentPlanVersion } =
        await import('../../server/services/current-plan-version-service');
      const plan = await mintCurrentPlanVersion({
        fundId,
        actorId: userId,
        idempotencyKey: randomUUID(),
        database: dbModule.db,
      });
      const { updateCurrentForecastCalculationMode } =
        await import('../../server/services/fund-calculation-mode-service');
      await updateCurrentForecastCalculationMode({
        fundId,
        expectedVersion: 0,
        configuredMode: 'shadow',
        idempotencyKey: randomUUID(),
        actorId: userId,
        database: dbModule.db,
      });

      const before = await pool.query(
        `
        SELECT
          (SELECT count(*)::int FROM substrate_shadow_reconciliations WHERE fund_id = $1) AS reconciliations,
          (SELECT count(*)::int FROM fund_snapshots WHERE fund_id = $1 AND type = 'CURRENT_FORECAST_V2') AS forecasts,
          (SELECT count(*)::int FROM current_forecast_references WHERE fund_id = $1) AS refs
      `,
        [fundId]
      );
      expect(before.rows[0]).toEqual({ reconciliations: 0, forecasts: 0, refs: 0 });

      const automaticCommit = await request(app)
        .post(factsPath)
        .set('Authorization', authorization)
        .set('Idempotency-Key', randomUUID())
        .send({ asOfDate: '2026-03-31' });
      expect(automaticCommit.status).toBe(200);

      const proof = await pool.query<{
        facts_id: number;
        facts_hash: string;
        plan_id: number;
        reconciliation_status: string;
        substrate_state: string;
        configured_mode: string;
        effective_mode: string;
        reconciliation_input_hash: string;
        reconciliation_result_hash: string;
        forecast_id: number;
        forecast_facts_id: string;
        forecast_plan_id: string;
        forecast_input_hash: string;
        forecast_result_hash: string;
        forecast_count: number;
        reference_count: number;
        manual_commands: number;
      }>(
        `SELECT
           facts.id AS facts_id,
           facts.snapshot_input_hash AS facts_hash,
           plan.id AS plan_id,
           reconciliation.reconciliation_status,
           reconciliation.substrate_state,
           reconciliation.configured_mode,
           reconciliation.effective_mode,
           reconciliation.input_hash AS reconciliation_input_hash,
           reconciliation.result_hash AS reconciliation_result_hash,
           forecast.id AS forecast_id,
           forecast.payload->>'financialFactsSnapshotId' AS forecast_facts_id,
           forecast.payload->>'currentPlanVersionId' AS forecast_plan_id,
           forecast.payload->>'inputHash' AS forecast_input_hash,
           forecast.payload->>'resultHash' AS forecast_result_hash,
           (SELECT count(*)::int
              FROM fund_snapshots candidate
             WHERE candidate.fund_id = facts.fund_id
               AND candidate.type = 'CURRENT_FORECAST_V2'
               AND candidate.payload->>'financialFactsSnapshotId' = facts.id::text
               AND candidate.payload->>'currentPlanVersionId' = plan.id::text) AS forecast_count,
           (SELECT count(*)::int FROM current_forecast_references WHERE fund_id = $1) AS reference_count,
           (SELECT count(*)::int FROM current_forecast_recompute_commands WHERE fund_id = $1) AS manual_commands
         FROM financial_facts_snapshots facts
         JOIN current_plan_versions plan
           ON plan.fund_id = facts.fund_id AND plan.id = $2
         JOIN LATERAL (
           SELECT candidate.id, candidate.payload
             FROM fund_snapshots candidate
            WHERE candidate.fund_id = facts.fund_id
              AND candidate.type = 'CURRENT_FORECAST_V2'
              AND candidate.payload->>'financialFactsSnapshotId' = facts.id::text
              AND candidate.payload->>'currentPlanVersionId' = plan.id::text
            ORDER BY candidate.id DESC
            LIMIT 1
         ) forecast ON true
         JOIN substrate_shadow_reconciliations reconciliation
           ON reconciliation.fund_id = facts.fund_id
          AND reconciliation.calculation_key = 'current_forecast'
          AND reconciliation.input_hash = forecast.payload->>'inputHash'
          AND reconciliation.result_hash = forecast.payload->>'resultHash'
         WHERE facts.fund_id = $1 AND facts.snapshot_input_hash = $3`,
        [fundId, Number(plan.id), automaticCommit.body.snapshotInputHash]
      );

      expect(proof.rows).toHaveLength(1);
      const row = proof.rows[0]!;
      expect(row).toMatchObject({
        facts_hash: automaticCommit.body.snapshotInputHash,
        plan_id: Number(plan.id),
        reconciliation_status: 'match',
        substrate_state: 'indicative',
        configured_mode: 'shadow',
        effective_mode: 'shadow',
        forecast_facts_id: String(row.facts_id),
        forecast_plan_id: String(plan.id),
        forecast_count: 2,
        reference_count: 0,
        manual_commands: 0,
      });
      expect(row.reconciliation_input_hash).toBe(row.forecast_input_hash);
      expect(row.reconciliation_result_hash).toBe(row.forecast_result_hash);
      expect(row.facts_id).not.toBe(Number(plan.sourceFactsSnapshotId));
    },
    TEST_TIMEOUT_MS
  );
});
