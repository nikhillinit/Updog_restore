/**
 * @group integration
 * @group testcontainers
 *
 * Real-Postgres proof for immutable scenario-case seed provenance.
 *
 * Supported modes:
 *   1. TEST_DATABASE_URL=postgres://... (disposable test database)
 *   2. RUN_DOCKER_PHASE0_TEST=1 (local Docker)
 *   3. Main Testcontainers CI (Docker is provisioned by the workflow)
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { combinedSchema } from '../../../server/db-schema';
import type { ScenarioCaseSeedV1 } from '../../../shared/contracts/scenarios/scenario-case-seed-v1.contract';
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
let persistenceModule: typeof import('../../../server/services/scenarios/scenario-case-seed-persistence-service');

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

async function seedParent(options: { locked?: boolean } = {}): Promise<{
  fundId: number;
  companyId: number;
  scenarioId: string;
}> {
  const fundResult = await adminPool.query<{ id: number }>(`
    INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year, engine_results)
    VALUES ('Seed provenance fund', 100000000, 0.02, 0.20, 2026, '{}'::jsonb)
    RETURNING id
  `);
  const fundId = fundResult.rows[0]!.id;

  const companyResult = await adminPool.query<{ id: number }>(
    `
      INSERT INTO portfoliocompanies (
        fund_id, name, sector, stage, investment_amount, current_valuation, status
      )
      VALUES ($1, 'Seeded company', 'Software', 'Series A', 125000, 900000, 'active')
      RETURNING id
    `,
    [fundId]
  );
  const companyId = companyResult.rows[0]!.id;

  const scenarioResult = await adminPool.query<{ id: string }>(
    `
      INSERT INTO scenarios (company_id, name, version, locked_at)
      VALUES ($1, 'Seeded scenario', 1, $2)
      RETURNING id
    `,
    [companyId, options.locked ? new Date('2026-07-13T12:00:00.000Z') : null]
  );

  return { fundId, companyId, scenarioId: scenarioResult.rows[0]!.id };
}

function makeSeed(fundId: number, companyId: number): ScenarioCaseSeedV1 {
  return {
    contractVersion: 'scenario-case-seed-v1',
    fundId,
    companyId,
    asOfDate: '2026-07-13',
    factsInputHash: 'b'.repeat(64),
    trustState: 'LIVE',
    currencyStatus: 'base_currency',
    fields: {
      investment: {
        status: 'seeded',
        value: '125000.123456',
        source: 'facts.initialInvestmentAmount',
      },
      followOns: {
        status: 'seeded',
        value: '50000.654321',
        source: 'facts.followOnInvestmentAmount',
      },
      fmv: {
        status: 'seeded',
        value: '900000.111111',
        source: 'facts.latestPlanningFmvValue',
      },
      exitValuation: {
        status: 'user_required',
        value: null,
        marketReference: '1500000.000000',
      },
      probability: { status: 'user_required', value: null },
      ownershipAtExit: { status: 'user_required', value: null },
    },
    warnings: [],
  };
}

function createInput(parent: { fundId: number; companyId: number; scenarioId: string }) {
  return {
    scenarioId: parent.scenarioId,
    expectedScenarioVersion: 1,
    seed: makeSeed(parent.fundId, parent.companyId),
    overrides: {
      caseName: 'Base case',
      probability: '0.50000000',
      exitValuation: '2000000.000000',
      monthsToExit: 36,
      ownershipAtExit: '0.1000',
    },
    actor: { userId: 'integration-user' },
    idempotencyKey: 'integration-seed-case',
  };
}

async function persistedRows(scenarioId: string): Promise<{
  cases: Record<string, unknown>[];
  provenance: Record<string, unknown>[];
}> {
  const cases = await adminPool.query<Record<string, unknown>>(
    'SELECT * FROM scenario_cases WHERE scenario_id = $1 ORDER BY id',
    [scenarioId]
  );
  const provenance = await adminPool.query<Record<string, unknown>>(
    `
      SELECT p.*
      FROM scenario_case_seed_provenance p
      JOIN scenario_cases c ON c.id = p.scenario_case_id
      WHERE c.scenario_id = $1
      ORDER BY p.scenario_case_id
    `,
    [scenarioId]
  );
  return { cases: cases.rows, provenance: provenance.rows };
}

describe.skipIf(skipTest)('scenario case seed persistence', () => {
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

    vi.resetModules();
    process.env.USE_REAL_DB_IN_VITEST = '1';
    process.env.DATABASE_URL = connectionString;
    delete process.env.NEON_DATABASE_URL;

    modulePool = new Pool({ connectionString, max: 2 });
    const moduleDb = drizzle(modulePool, { schema: combinedSchema });
    vi.doMock('../../../server/db', () => ({ db: moduleDb, pool: modulePool }));
    persistenceModule =
      await import('../../../server/services/scenarios/scenario-case-seed-persistence-service');
  }, STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    vi.doUnmock('../../../server/db');
    await modulePool?.end();
    await adminPool?.end();
    await container?.stop();
    restoreEnvironment();
  }, STARTUP_TIMEOUT_MS);

  beforeEach(async () => {
    await adminPool.query(`
      TRUNCATE TABLE funds RESTART IDENTITY CASCADE
    `);
  });

  it('commits the case and provenance together and increments the parent once', async () => {
    const parent = await seedParent();
    const result = await persistenceModule.createScenarioCaseFromSeed(createInput(parent));
    const rows = await persistedRows(parent.scenarioId);
    const scenario = await adminPool.query<{ version: number }>(
      'SELECT version FROM scenarios WHERE id = $1',
      [parent.scenarioId]
    );

    expect(result.replayed).toBe(false);
    expect(rows.cases).toHaveLength(1);
    expect(rows.provenance).toHaveLength(1);
    expect(rows.provenance[0]?.scenario_case_id).toBe(rows.cases[0]?.id);
    expect(scenario.rows[0]?.version).toBe(2);
  });

  it('rolls back both rows when a later write in the transaction fails', async () => {
    const parent = await seedParent();
    const input = createInput(parent);
    input.actor.userId = 'x'.repeat(256);

    await expect(persistenceModule.createScenarioCaseFromSeed(input)).rejects.toBeDefined();
    await expect(persistedRows(parent.scenarioId)).resolves.toEqual({ cases: [], provenance: [] });
  });

  it('leaves both rows absent when the parent scenario is locked', async () => {
    const parent = await seedParent({ locked: true });

    await expect(
      persistenceModule.createScenarioCaseFromSeed(createInput(parent))
    ).rejects.toMatchObject({ code: 'scenario_locked' });
    await expect(persistedRows(parent.scenarioId)).resolves.toEqual({ cases: [], provenance: [] });
  });

  it('returns the same case on retry without another insert or version bump', async () => {
    const parent = await seedParent();
    const input = createInput(parent);
    const created = await persistenceModule.createScenarioCaseFromSeed(input);
    const replay = await persistenceModule.createScenarioCaseFromSeed(input);
    const rows = await persistedRows(parent.scenarioId);
    const scenario = await adminPool.query<{ version: number }>(
      'SELECT version FROM scenarios WHERE id = $1',
      [parent.scenarioId]
    );

    expect(replay.replayed).toBe(true);
    expect(replay.case.id).toBe(created.case.id);
    expect(rows.cases).toHaveLength(1);
    expect(rows.provenance).toHaveLength(1);
    expect(scenario.rows[0]?.version).toBe(2);
  });

  it('does not change the case or provenance when later company facts change', async () => {
    const parent = await seedParent();
    await persistenceModule.createScenarioCaseFromSeed(createInput(parent));
    const before = await persistedRows(parent.scenarioId);

    await adminPool.query('UPDATE portfoliocompanies SET current_valuation = $1 WHERE id = $2', [
      '2500000.00',
      parent.companyId,
    ]);

    await expect(persistedRows(parent.scenarioId)).resolves.toEqual(before);
  });

  it('allows a user case edit without mutating provenance', async () => {
    const parent = await seedParent();
    const created = await persistenceModule.createScenarioCaseFromSeed(createInput(parent));
    const before = await persistedRows(parent.scenarioId);

    await adminPool.query(
      'UPDATE scenario_cases SET investment = $1, updated_at = now() WHERE id = $2',
      ['175000.00', created.case.id]
    );
    const after = await persistedRows(parent.scenarioId);

    expect(after.cases[0]?.investment).toBe('175000.00');
    expect(after.provenance).toEqual(before.provenance);
  });
});
