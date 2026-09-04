/**
 * @group integration
 * @group testcontainers
 *
 * Real-Postgres characterization for transaction-visible planning marks in
 * buildFundCompanyActualsFacts.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { db } from '../../server/db';
import { combinedSchema } from '../../server/db-schema';
import { valuationMarks } from '../../shared/schema/lp-reporting-evidence';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const STARTUP_TIMEOUT_MS = 120_000;
const cloudDbUrl = process.env['TEST_DATABASE_URL'];
const useDocker =
  process.env['RUN_DOCKER_FUND_COMPANY_ACTUALS_FACTS'] === '1' ||
  process.env['CI'] === 'true' ||
  process.env['CI'] === '1';
const skipTest = !cloudDbUrl && !useDocker;

const originalEnv = {
  DATABASE_URL: process.env['DATABASE_URL'],
  NEON_DATABASE_URL: process.env['NEON_DATABASE_URL'],
  USE_REAL_DB_IN_VITEST: process.env['USE_REAL_DB_IN_VITEST'],
};

type TestDatabase = ReturnType<typeof drizzle<typeof combinedSchema>>;

let container: import('@testcontainers/postgresql').StartedPostgreSqlContainer | null = null;
let adminPool: Pool | undefined;
let modulePool: Pool | undefined;
let moduleDb: TestDatabase;
let connectionString = '';
let actualsService: typeof import('../../server/services/fund-actuals/fund-company-actuals-facts-service');

function restoreEnvironment(): void {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function resetSchema(): Promise<void> {
  await adminPool!.query('DROP EXTENSION IF EXISTS vector CASCADE');
  await adminPool!.query('DROP EXTENSION IF EXISTS pgcrypto CASCADE');
  await adminPool!.query('DROP SCHEMA IF EXISTS public CASCADE');
  await adminPool!.query('CREATE SCHEMA public');
  await adminPool!.query('GRANT ALL ON SCHEMA public TO public');
  await adminPool!.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
  try {
    await adminPool!.query('CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public');
  } catch {
    // Some TEST_DATABASE_URL providers do not expose pgvector.
  }
}

async function seedFundAndCompany(): Promise<{ fundId: number; companyId: number }> {
  const fundResult = await adminPool!.query<{ id: number }>(
    `
      INSERT INTO funds (
        name, size, management_fee, carry_percentage, vintage_year, status, base_currency
      )
      VALUES ('Actuals facts transaction fund', '1000000.00', '0.0200', '0.2000', 2026, 'active', 'USD')
      RETURNING id
    `
  );
  const fundId = fundResult.rows[0]!.id;

  const companyResult = await adminPool!.query<{ id: number }>(
    `
      INSERT INTO portfoliocompanies (
        fund_id, name, sector, stage, investment_amount, status
      )
      VALUES ($1, 'Actuals facts transaction company', 'Technology', 'Seed', '0.00', 'active')
      RETURNING id
    `,
    [fundId]
  );
  const companyId = companyResult.rows[0]!.id;

  // The producer only emits a company with an investment, an active round, or a
  // selected planning mark; seed one investment so the company is always present.
  await adminPool!.query(
    `
      INSERT INTO investments (
        fund_id, company_id, investment_date, amount, round, ownership_percentage
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [fundId, companyId, new Date('2026-01-01T00:00:00.000Z'), '100000.00', 'seed', '0.1000']
  );

  return { fundId, companyId };
}

describe.skipIf(skipTest)('fund company actuals transaction visibility', () => {
  beforeAll(async () => {
    if (cloudDbUrl) {
      connectionString = cloudDbUrl;
    } else {
      const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
      container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
        .withDatabase('test_db')
        .withUsername('test_user')
        .withPassword('test_password')
        .start();
      connectionString = container.getConnectionUri();
    }

    adminPool = new Pool({ connectionString, max: 10 });
    await resetSchema();
    await runMigrationsWithConnectionString(connectionString);

    Object.assign(process.env, {
      DATABASE_URL: connectionString,
      USE_REAL_DB_IN_VITEST: '1',
    });
    delete process.env['NEON_DATABASE_URL'];
    vi.resetModules();

    modulePool = new Pool({ connectionString, max: 10 });
    moduleDb = drizzle(modulePool, { schema: combinedSchema });
    actualsService =
      await import('../../server/services/fund-actuals/fund-company-actuals-facts-service');
  }, STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    await modulePool?.end();
    await adminPool?.end();
    await container?.stop();
    restoreEnvironment();
    vi.resetModules();
  }, STARTUP_TIMEOUT_MS);

  beforeEach(async () => {
    await adminPool!.query('TRUNCATE TABLE funds RESTART IDENTITY CASCADE');
  });

  it('excludes actuals-pilot marks and applies transaction-local planning marks with cutoff fencing', async () => {
    const { fundId, companyId } = await seedFundAndCompany();

    await moduleDb.transaction(async (transaction) => {
      await transaction.insert(valuationMarks).values({
        fundId,
        companyId,
        markDate: '2026-08-30',
        asOfDate: '2026-08-30',
        fairValue: '100.000000',
        currency: 'USD',
        markPurpose: 'planning_company_fmv',
        markSource: 'board_update',
        confidenceLevel: 'medium',
        valuationMethod: 'comparable_companies',
        status: 'approved',
        importedFrom: 'actuals_pilot_v1',
        approvedAt: new Date('2026-08-30T12:00:00.000Z'),
        createdAt: new Date('2026-08-30T12:00:00.000Z'),
        updatedAt: new Date('2026-08-30T12:00:00.000Z'),
      });

      const transactionDatabase = transaction as unknown as typeof db;
      const actualsOnly = await actualsService.buildFundCompanyActualsFacts({
        fundId,
        asOfDate: '2026-08-31',
        now: new Date('2026-09-01T00:00:00.000Z'),
        database: transactionDatabase,
      });

      expect(actualsOnly.facts).toEqual([
        expect.objectContaining({
          fundId,
          companyId,
          approvedPlanningFmvMarkId: null,
          latestPlanningFmvDate: null,
          latestPlanningFmvValue: null,
          planningFmvStatus: 'none',
        }),
      ]);

      const [planningMark] = await transaction
        .insert(valuationMarks)
        .values({
          fundId,
          companyId,
          markDate: '2026-08-31',
          asOfDate: '2026-08-31',
          fairValue: '200.000000',
          currency: 'USD',
          markPurpose: 'planning_company_fmv',
          markSource: 'board_update',
          confidenceLevel: 'medium',
          valuationMethod: 'comparable_companies',
          status: 'approved',
          importedFrom: 'planning_fmv_override',
          approvedAt: new Date('2026-08-31T12:00:00.000Z'),
          createdAt: new Date('2026-08-31T12:00:00.000Z'),
          updatedAt: new Date('2026-08-31T12:00:00.000Z'),
        })
        .returning({ id: valuationMarks.id });

      const uncapped = await actualsService.buildFundCompanyActualsFacts({
        fundId,
        asOfDate: '2026-08-31',
        now: new Date('2026-09-01T00:00:00.000Z'),
        database: transactionDatabase,
      });
      expect(uncapped.facts).toEqual([
        expect.objectContaining({
          fundId,
          companyId,
          approvedPlanningFmvMarkId: planningMark!.id,
          latestPlanningFmvDate: '2026-08-31',
          latestPlanningFmvValue: '200.000000',
          planningFmvStatus: 'active',
        }),
      ]);

      const capped = await actualsService.buildFundCompanyActualsFacts({
        fundId,
        asOfDate: '2026-08-31',
        now: new Date('2026-09-01T00:00:00.000Z'),
        knowledgeCutoff: new Date('2026-08-31T11:59:59.999Z'),
        database: transactionDatabase,
      });
      expect(capped.facts).toEqual(actualsOnly.facts);
    });
  });

  it.todo("plan item 12: planningMarkSources ['actuals_pilot_v1'] exposes same-transaction marks");
});
