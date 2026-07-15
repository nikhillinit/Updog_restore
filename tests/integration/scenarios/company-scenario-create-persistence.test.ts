/**
 * @group integration
 * @group testcontainers
 *
 * Real-Postgres proof for the durable company-scenario creation ledger.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import express from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { combinedSchema } from '../../../server/db-schema';
import { runMigrationsWithConnectionString } from '../../helpers/testcontainers-migration';

const STARTUP_TIMEOUT_MS = 120_000;
const cloudDbUrl = process.env.TEST_DATABASE_URL;
const useCloudDb = Boolean(cloudDbUrl);
const useDocker = process.env.RUN_DOCKER_PHASE0_TEST === '1' || process.env.CI === 'true';
const skipTest = !useCloudDb && !useDocker;

const originalEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  NEON_DATABASE_URL: process.env.NEON_DATABASE_URL,
  USE_REAL_DB_IN_VITEST: process.env.USE_REAL_DB_IN_VITEST,
};

let container: import('@testcontainers/postgresql').StartedPostgreSqlContainer | null = null;
let adminPool: Pool;
let modulePool: Pool;
let connectionString: string;
let serviceModule: typeof import('../../../server/services/scenarios/company-scenario-create-service');

function restoreEnvironment(): void {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function resetSchema(): Promise<void> {
  await adminPool.query('DROP EXTENSION IF EXISTS vector CASCADE');
  await adminPool.query('DROP EXTENSION IF EXISTS pgcrypto CASCADE');
  await adminPool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await adminPool.query('CREATE SCHEMA public');
  await adminPool.query('GRANT ALL ON SCHEMA public TO public');
  await adminPool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
  try {
    await adminPool.query('CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public');
  } catch {
    // Some TEST_DATABASE_URL providers do not expose pgvector.
  }
}

async function loadServiceModule() {
  vi.resetModules();
  vi.doMock('../../../server/db', () => ({ db: drizzle(modulePool, { schema: combinedSchema }) }));
  return import('../../../server/services/scenarios/company-scenario-create-service');
}

async function loadRouteApp(fundId: number) {
  vi.resetModules();
  vi.doMock('../../../server/db', () => ({ db: drizzle(modulePool, { schema: combinedSchema }) }));
  vi.doMock('../../../server/lib/auth/jwt', () => ({
    requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    requireFundAccess: (_req: unknown, _res: unknown, next: () => void) => next(),
  }));
  vi.doMock('../../../server/lib/auth/company-fund-scope', () => ({
    enforceCompanyFundScope: async () => true,
    resolveCompanyFundId: async () => fundId,
  }));
  const { default: router } = await import('../../../server/routes/scenario-analysis');
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  return app;
}

async function seedCompany(fundName = 'Scenario create fund'): Promise<{
  fundId: number;
  companyId: number;
}> {
  const fund = await adminPool.query<{ id: number }>(
    `
      INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year, engine_results)
      VALUES ($1, 100000000, 0.02, 0.20, 2026, '{}'::jsonb)
      RETURNING id
    `,
    [fundName]
  );
  const fundId = fund.rows[0]!.id;
  const company = await adminPool.query<{ id: number }>(
    `
      INSERT INTO portfoliocompanies
        (fund_id, name, sector, stage, investment_amount, current_valuation, status)
      VALUES ($1, 'Ledger company', 'Software', 'Series A', 125000, 900000, 'active')
      RETURNING id
    `,
    [fundId]
  );
  return { fundId, companyId: company.rows[0]!.id };
}

function createInput(parent: { fundId: number; companyId: number }) {
  return {
    ...parent,
    name: 'Durable scenario',
    description: 'Created exactly once',
    idempotencyKey: 'integration-scenario-create',
    actorId: null,
  };
}

async function counts(companyId: number): Promise<{
  scenarios: number;
  requests: number;
  audits: number;
}> {
  const result = await adminPool.query<{
    scenarios: string;
    requests: string;
    audits: string;
  }>(
    `
      SELECT
        (SELECT count(*) FROM scenarios WHERE company_id = $1)::text AS scenarios,
        (SELECT count(*) FROM company_scenario_create_requests WHERE company_id = $1)::text AS requests,
        (
          SELECT count(*)
          FROM scenario_audit_logs a
          JOIN scenarios s ON s.id = a.entity_id
          WHERE s.company_id = $1 AND a.action = 'CREATE'
        )::text AS audits
    `,
    [companyId]
  );
  const row = result.rows[0]!;
  return {
    scenarios: Number(row.scenarios),
    requests: Number(row.requests),
    audits: Number(row.audits),
  };
}

describe.skipIf(skipTest)('company scenario create persistence', () => {
  beforeAll(async () => {
    if (useCloudDb) {
      connectionString = cloudDbUrl!;
      adminPool = new Pool({ connectionString, max: 1 });
    } else {
      const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
      container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
        .withDatabase('test_db')
        .withUsername('test_user')
        .withPassword('test_password')
        .start();
      connectionString = container.getConnectionUri();
      adminPool = new Pool({ connectionString, max: 1 });
    }

    await resetSchema();
    await runMigrationsWithConnectionString(connectionString);

    process.env.USE_REAL_DB_IN_VITEST = '1';
    process.env.DATABASE_URL = connectionString;
    delete process.env.NEON_DATABASE_URL;
    modulePool = new Pool({ connectionString, max: 4 });
    serviceModule = await loadServiceModule();
  }, STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    vi.doUnmock('../../../server/db');
    vi.doUnmock('../../../server/lib/auth/jwt');
    vi.doUnmock('../../../server/lib/auth/company-fund-scope');
    await modulePool?.end();
    await adminPool?.end();
    await container?.stop();
    restoreEnvironment();
  }, STARTUP_TIMEOUT_MS);

  beforeEach(async () => {
    await adminPool.query('TRUNCATE TABLE funds RESTART IDENTITY CASCADE');
  });

  it('persists one scenario, one CREATE audit, and one completed response', async () => {
    const parent = await seedCompany();
    const response = await serviceModule.createCompanyScenario(createInput(parent));
    const ledger = await adminPool.query<{
      scenario_id: string;
      status: string;
      response_status: number;
      response_body: unknown;
    }>('SELECT scenario_id, status, response_status, response_body FROM company_scenario_create_requests');

    expect(response).toMatchObject({ replay: false, scenario: { caseCount: 0, isLocked: false } });
    expect(await counts(parent.companyId)).toEqual({ scenarios: 1, requests: 1, audits: 1 });
    expect(ledger.rows[0]).toMatchObject({
      scenario_id: response.scenario.id,
      status: 'completed',
      response_status: 201,
      response_body: response,
    });
  });

  it('waits concurrent same-key callers and replays the single committed scenario', async () => {
    const parent = await seedCompany();
    const input = createInput(parent);

    const [first, second] = await Promise.all([
      serviceModule.createCompanyScenario(input),
      serviceModule.createCompanyScenario(input),
    ]);

    expect(new Set([first.scenario.id, second.scenario.id]).size).toBe(1);
    expect([first.replay, second.replay].sort()).toEqual([false, true]);
    expect(await counts(parent.companyId)).toEqual({ scenarios: 1, requests: 1, audits: 1 });
  });

  it('replays after a module restart from only the durable ledger', async () => {
    const parent = await seedCompany();
    const input = createInput(parent);
    const created = await serviceModule.createCompanyScenario(input);

    const restartedModule = await loadServiceModule();
    const replay = await restartedModule.createCompanyScenario(input);

    expect(replay).toEqual({ ...created, replay: true });
    expect(await counts(parent.companyId)).toEqual({ scenarios: 1, requests: 1, audits: 1 });
  });

  it('rolls back the claim when the later scenario write fails', async () => {
    const parent = await seedCompany();

    await expect(
      serviceModule.createCompanyScenario({ ...createInput(parent), name: 'x'.repeat(256) })
    ).rejects.toBeDefined();

    expect(await counts(parent.companyId)).toEqual({ scenarios: 0, requests: 0, audits: 0 });
  });

  it('conflicts on same-fund key reuse for another effective request', async () => {
    const parent = await seedCompany();
    await serviceModule.createCompanyScenario(createInput(parent));

    await expect(
      serviceModule.createCompanyScenario({ ...createInput(parent), name: 'Different scenario' })
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
    expect(await counts(parent.companyId)).toEqual({ scenarios: 1, requests: 1, audits: 1 });
  });

  it('allows the same key independently in another fund', async () => {
    const firstParent = await seedCompany('First fund');
    const secondParent = await seedCompany('Second fund');

    const [first, second] = await Promise.all([
      serviceModule.createCompanyScenario(createInput(firstParent)),
      serviceModule.createCompanyScenario(createInput(secondParent)),
    ]);

    expect(first.replay).toBe(false);
    expect(second.replay).toBe(false);
    expect(first.scenario.id).not.toBe(second.scenario.id);
  });

  it('fails closed before claiming when fund and company ownership do not match', async () => {
    const firstParent = await seedCompany('First fund');
    const secondParent = await seedCompany('Second fund');

    await expect(
      serviceModule.createCompanyScenario({
        ...createInput(secondParent),
        fundId: firstParent.fundId,
      })
    ).rejects.toMatchObject({ code: 'company_scope_mismatch' });
    expect(await counts(secondParent.companyId)).toEqual({
      scenarios: 0,
      requests: 0,
      audits: 0,
    });
  });

  it('executes the mounted GET query with persisted ordering and case counts', async () => {
    const parent = await seedCompany();
    const newestFirst = '00000000-0000-4000-8000-000000000001';
    const newestSecond = '00000000-0000-4000-8000-000000000002';
    const oldest = '00000000-0000-4000-8000-000000000003';
    await adminPool.query(
      `
        INSERT INTO scenarios (id, company_id, name, version, updated_at)
        VALUES
          ($1, $4, 'Tie second', 2, '2026-07-15T08:00:00.000Z'),
          ($2, $4, 'Oldest', 3, '2026-07-14T08:00:00.000Z'),
          ($3, $4, 'Tie first', 4, '2026-07-15T08:00:00.000Z')
      `,
      [newestSecond, oldest, newestFirst, parent.companyId]
    );
    await adminPool.query(
      `
        INSERT INTO scenario_cases
          (scenario_id, case_name, probability, investment, follow_ons, exit_proceeds, exit_valuation)
        VALUES
          ($1, 'First A', 0.5, 0, 0, 0, 0),
          ($1, 'First B', 0.5, 0, 0, 0, 0),
          ($2, 'Oldest A', 1, 0, 0, 0, 0)
      `,
      [newestFirst, oldest]
    );
    const app = await loadRouteApp(parent.fundId);

    const response = await request(app).get(`/api/companies/${parent.companyId}/scenarios`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: newestFirst,
        name: 'Tie first',
        version: 4,
        updatedAt: '2026-07-15T08:00:00.000Z',
        isLocked: false,
        caseCount: 2,
      },
      {
        id: newestSecond,
        name: 'Tie second',
        version: 2,
        updatedAt: '2026-07-15T08:00:00.000Z',
        isLocked: false,
        caseCount: 0,
      },
      {
        id: oldest,
        name: 'Oldest',
        version: 3,
        updatedAt: '2026-07-14T08:00:00.000Z',
        isLocked: false,
        caseCount: 1,
      },
    ]);
  });
});
