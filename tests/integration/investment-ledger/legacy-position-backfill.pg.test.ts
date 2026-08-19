import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { backfillLegacyPositionEvents } from '../../../server/services/investment-ledger/legacy-position-backfill-service';
import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../../helpers/testcontainers';
import { runMigrationsWithConnectionString } from '../../helpers/testcontainers-migration';

const skipIfNoDocker =
  !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';
const createdDatabases: string[] = [];

let adminPool: Pool | undefined;
let fundIdCounter = 120_532_000;
let startedTestContainers = false;

describe.skipIf(skipIfNoDocker)('legacy position backfill PostgreSQL proof', () => {
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      await setupTestContainers();
      startedTestContainers = true;
    }
    adminPool = new Pool({ connectionString: testDatabaseConnectionString(), max: 1 });
  });

  afterAll(async () => {
    if (adminPool) {
      for (const databaseName of createdDatabases.reverse()) {
        await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
      }
      await adminPool.end();
    }
    if (startedTestContainers) {
      await cleanupTestContainers();
    }
  });

  it('retains dry-run planning without compatibility writes', async () => {
    const { connectionString } = await createMigratedDatabase('dry_run');

    await withPool(connectionString, async (pool) => {
      const db = drizzle(pool);
      const seed = await seedLegacyInvestment(pool, { withMainVehicle: true });

      const result = await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: { mode: 'dry_run', fundIds: [seed.fundId] },
      });

      expect(result).toMatchObject({ mode: 'dry_run', planned: 1, written: 0, blocked: 0 });
      expect(result.candidates[0]).toMatchObject({
        fundId: seed.fundId,
        investmentId: seed.investmentId,
        status: 'planned',
      });
      await expectCompatibilityCounts(pool, seed.fundId, {
        positionEvents: 0,
        sourceObservations: 0,
      });
    });
  });

  it.each(['apply', 'resume'] as const)(
    'mechanically blocks %s before database reads or writes',
    async (mode) => {
      const { connectionString } = await createMigratedDatabase(`blocked_${mode}`);

      await withPool(connectionString, async (pool) => {
        const db = drizzle(pool);
        const seed = await seedLegacyInvestment(pool, { withMainVehicle: true });
        const dryRun = await backfillLegacyPositionEvents({
          actorId: null,
          database: db,
          request: { mode: 'dry_run', fundIds: [seed.fundId] },
        });
        const sourcePlanHash = dryRun.candidates[0]?.sourcePlanHash;

        await expect(
          backfillLegacyPositionEvents({
            actorId: null,
            database: db,
            request: {
              mode,
              fundIds: [seed.fundId],
              expectedSourceHashes: { [seed.investmentId]: sourcePlanHash },
            },
          })
        ).rejects.toMatchObject({ status: 403, code: 'BACKFILL_BLOCKED' });

        await expectCompatibilityCounts(pool, seed.fundId, {
          positionEvents: 0,
          sourceObservations: 0,
        });
      });
    }
  );
});

async function createMigratedDatabase(suffix: string): Promise<{ connectionString: string }> {
  if (!adminPool) throw new Error('Admin pool not initialized.');
  const databaseName = `task11d_${suffix}_${process.pid}_${Date.now()}`.toLowerCase();
  createdDatabases.push(databaseName);
  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  const connectionString = databaseConnectionString(databaseName);
  await withPool(connectionString, async (pool) => {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  });
  await runMigrationsWithConnectionString(connectionString, '0043_position_source_basis_reliefs');
  return { connectionString };
}

function databaseConnectionString(databaseName: string): string {
  const base = new URL(testDatabaseConnectionString());
  base.pathname = `/${databaseName}`;
  return base.toString();
}

function testDatabaseConnectionString(): string {
  return process.env.TEST_DATABASE_URL ?? getPostgresConnectionString();
}

async function seedLegacyInvestment(
  pool: Pool,
  input: { withMainVehicle: boolean }
): Promise<{ fundId: number; investmentId: number }> {
  const fundId = nextFundId();
  await pool.query(
    `
      INSERT INTO funds (id, name, size, management_fee, carry_percentage, vintage_year)
      VALUES ($1, $2, 10000000, '0.0200', '0.2000', 2026)
    `,
    [fundId, `Task 11D Fund ${fundId}`]
  );
  const companyId = await insertedId(
    pool,
    `
      INSERT INTO portfoliocompanies (
        fund_id, name, sector, stage, investment_amount, status
      ) VALUES ($1, $2, 'SaaS', 'seed', '1000.00', 'active')
      RETURNING id
    `,
    [fundId, `Task 11D Company ${fundId}`]
  );
  if (input.withMainVehicle) {
    await pool.query(
      `
        INSERT INTO vehicles (
          fund_id, vehicle_slug, vehicle_type, name, committed_capital, currency, status
        ) VALUES ($1, $2, 'main_fund', $3, '100000.000000', 'USD', 'active')
      `,
      [fundId, `task-11d-main-${fundId}`, `Task 11D Main ${fundId}`]
    );
  }
  const identityId = await insertedId(
    pool,
    `
      INSERT INTO company_identities (fund_id, canonical_name, source_portfolio_company_id)
      VALUES ($1, $2, $3)
      RETURNING id
    `,
    [fundId, `Task 11D Identity ${fundId}`, companyId]
  );
  await pool.query(
    `
      INSERT INTO portfolio_company_identity_links (
        fund_id, portfolio_company_id, company_identity_id, link_type, active
      ) VALUES ($1, $2, $3, 'operator_resolution', true)
    `,
    [fundId, companyId, identityId]
  );
  const investmentId = await insertedId(
    pool,
    `
      INSERT INTO investments (
        fund_id, company_id, investment_date, amount, round,
        ownership_percentage, valuation_at_investment, shares_acquired, cost_basis_cents
      ) VALUES (
        $1, $2, '2026-01-15', '1000.00', 'Seed',
        '0.1000', '10000000.00', NULL, 100000
      )
      RETURNING id
    `,
    [fundId, companyId]
  );
  return { fundId, investmentId };
}

async function expectCompatibilityCounts(
  pool: Pool,
  fundId: number,
  expected: { positionEvents: number; sourceObservations: number }
): Promise<void> {
  await expect(rowCount(pool, 'position_events', fundId)).resolves.toBe(expected.positionEvents);
  await expect(rowCount(pool, 'source_observations', fundId)).resolves.toBe(
    expected.sourceObservations
  );
}

async function rowCount(pool: Pool, table: string, fundId: number): Promise<number> {
  return Number(
    await scalar(pool, `SELECT COUNT(*)::int FROM ${table} WHERE fund_id = $1`, [fundId])
  );
}

async function scalar<T = unknown>(pool: Pool, query: string, params: unknown[]): Promise<T> {
  const result = await pool.query(query, params);
  return Object.values(result.rows[0] ?? {})[0] as T;
}

async function insertedId(pool: Pool, query: string, params: unknown[]): Promise<number> {
  return Number(await scalar(pool, query, params));
}

async function withPool<T>(
  connectionString: string,
  callback: (pool: Pool) => Promise<T>
): Promise<T> {
  const pool = new Pool({ connectionString, max: 4 });
  try {
    return await callback(pool);
  } finally {
    await pool.end();
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function nextFundId(): number {
  fundIdCounter += 1;
  return fundIdCounter;
}
