/**
 * @group integration
 * @group testcontainers
 *
 * Opt-in Docker-backed integration test for Phase 0 variance automation.
 * Run explicitly with:
 *   RUN_DOCKER_PHASE0_TEST=1 npx vitest run tests/integration/phase0-migrated-postgres.test.ts --config vitest.config.int.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as sharedSchema from '../../shared/schema';
import { runMigrationsToVersion } from '../helpers/testcontainers-migration';

const STARTUP_TIMEOUT_MS = 60_000;
const skipIfNoDocker = process.env.RUN_DOCKER_PHASE0_TEST !== '1';

let container: StartedPostgreSqlContainer;
let adminPool: Pool;

async function resetSchema(): Promise<void> {
  await adminPool.query('DROP EXTENSION IF EXISTS vector CASCADE');
  await adminPool.query('DROP EXTENSION IF EXISTS pgcrypto CASCADE');
  await adminPool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await adminPool.query('CREATE SCHEMA public');
  await adminPool.query('GRANT ALL ON SCHEMA public TO public');
  await adminPool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
  await adminPool.query('CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public');
}

async function loadPhase0Automation(connectionString: string): Promise<{
  modulePool: Pool;
  tracking: typeof import('../../server/services/calc-run-tracking');
  handlers: typeof import('../../server/services/calc-run-completion-handlers');
}> {
  vi.resetModules();
  process.env.USE_REAL_DB_IN_VITEST = '1';
  process.env.DATABASE_URL = connectionString;
  delete process.env.NEON_DATABASE_URL;

  const modulePool = new Pool({
    connectionString,
    max: 2,
  });
  const moduleDb = drizzle(modulePool, { schema: sharedSchema });

  vi.doMock('../../server/db', () => ({
    db: moduleDb,
    pool: modulePool,
  }));

  const tracking = await import('../../server/services/calc-run-tracking');
  const handlers = await import('../../server/services/calc-run-completion-handlers');

  return { modulePool, tracking, handlers };
}

function restorePhase0Env(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

describe.skipIf(skipIfNoDocker)('Phase 0 migrated Postgres integration', () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_password')
      .start();

    adminPool = new Pool({ connectionString: container.getConnectionUri(), max: 1 });
  }, STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    await adminPool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await resetSchema();
  });

  it('applies the root journal and creates exactly one automated baseline for a completed run', async () => {
    await runMigrationsToVersion(container);

    const systemUserResult = await adminPool.query<{
      id: number;
      username: string;
    }>('SELECT id, username FROM users WHERE id = 999999');

    expect(systemUserResult.rows).toEqual([{ id: 999999, username: 'system' }]);

    const fundInsert = await adminPool.query<{ id: number }>(
      `
          INSERT INTO funds (
            name, size, management_fee, carry_percentage, vintage_year, created_at, engine_results
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `,
      [
        'Phase 0 Integration Fund',
        '1000000.00',
        '0.0200',
        '0.2000',
        2024,
        new Date('2024-01-01T00:00:00Z'),
        {},
      ]
    );
    const fundId = fundInsert.rows[0]!.id;

    const configInsert = await adminPool.query<{ id: number }>(
      `
          INSERT INTO fundconfigs (fund_id, version, config, is_draft, is_published)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `,
      [fundId, 1, { name: 'Phase 0 Config' }, false, true]
    );
    const configId = configInsert.rows[0]!.id;

    const calcRunInsert = await adminPool.query<{ id: number }>(
      `
          INSERT INTO calc_runs (
            fund_id,
            config_id,
            config_version,
            correlation_id,
            engines,
            dispatch_state,
            requested_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `,
      [
        fundId,
        configId,
        1,
        '00000000-0000-0000-0000-000000000042',
        ['reserve', 'pacing'],
        'dispatched',
        new Date('2026-03-31T12:00:00Z'),
      ]
    );
    const runId = calcRunInsert.rows[0]!.id;

    const companyInsert = await adminPool.query<{ id: number }>(
      `
          INSERT INTO portfoliocompanies (
            fund_id,
            name,
            sector,
            stage,
            investment_amount,
            current_valuation,
            status,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `,
      [
        fundId,
        'Alpha Systems',
        'Software',
        'Series A',
        '100000.00',
        '150000.00',
        'active',
        new Date('2025-01-15T00:00:00Z'),
      ]
    );
    const companyId = companyInsert.rows[0]!.id;

    await adminPool.query(
      `
          INSERT INTO investments (
            fund_id,
            company_id,
            investment_date,
            amount,
            round
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
      [fundId, companyId, new Date('2025-01-15T00:00:00Z'), '100000.00', 'Seed']
    );

    await adminPool.query(
      `
          INSERT INTO fund_snapshots (
            fund_id,
            type,
            payload,
            calc_version,
            correlation_id,
            snapshot_time,
            run_id,
            config_id,
            config_version
          )
          VALUES
            ($1, 'RESERVE', $2, 'v1', $3, $4, $5, $6, $7),
            ($1, 'PACING', $8, 'v1', $9, $10, $5, $6, $7)
        `,
      [
        fundId,
        { reserveTarget: 250000, reservePct: 0.25 },
        '00000000-0000-0000-0000-000000000043',
        new Date('2026-03-31T12:05:00Z'),
        runId,
        configId,
        1,
        { annualDeploymentRate: 0.4, remainingMonths: 18 },
        '00000000-0000-0000-0000-000000000044',
        new Date('2026-03-31T12:06:00Z'),
      ]
    );

    const originalEnv = {
      DATABASE_URL: process.env.DATABASE_URL,
      NEON_DATABASE_URL: process.env.NEON_DATABASE_URL,
      USE_REAL_DB_IN_VITEST: process.env.USE_REAL_DB_IN_VITEST,
    };

    let modulePool: Pool | null = null;

    try {
      const modules = await loadPhase0Automation(container.getConnectionUri());
      modulePool = modules.modulePool;

      modules.tracking.resetCompletionHandlers();
      modules.handlers.resetCompletionHandlerRegistration();
      modules.handlers.registerCompletionHandlers();

      await expect(modules.tracking.markCalcRunCompletedIfReady(runId)).resolves.toBe(true);
      await expect(modules.tracking.markCalcRunCompletedIfReady(runId)).resolves.toBe(true);

      const completedRun = await adminPool.query<{ completed_at: Date | null }>(
        'SELECT completed_at FROM calc_runs WHERE id = $1',
        [runId]
      );
      expect(completedRun.rows[0]?.completed_at).not.toBeNull();

      const baselineResult = await adminPool.query<{
        source_run_id: number | null;
        created_by: number;
        is_default: boolean;
        total_value: string;
        deployed_capital: string;
        portfolio_count: number;
      }>(
        `
            SELECT
              source_run_id,
              created_by,
              is_default,
              total_value,
              deployed_capital,
              portfolio_count
            FROM fund_baselines
            WHERE fund_id = $1
          `,
        [fundId]
      );

      expect(baselineResult.rows).toHaveLength(1);
      expect(baselineResult.rows[0]).toMatchObject({
        source_run_id: runId,
        created_by: 999999,
        is_default: true,
        total_value: '150000.00',
        deployed_capital: '100000.00',
        portfolio_count: 1,
      });

      const attributedMetrics = await adminPool.query<{
        run_id: number | null;
        config_id: number | null;
        config_version: number | null;
        totalvalue: string;
      }>(
        `
            SELECT run_id, config_id, config_version, totalvalue
            FROM fund_metrics
            WHERE fund_id = $1 AND run_id = $2
          `,
        [fundId, runId]
      );

      expect(attributedMetrics.rows).toHaveLength(1);
      expect(attributedMetrics.rows[0]).toMatchObject({
        run_id: runId,
        config_id: configId,
        config_version: 1,
        totalvalue: '150000.00',
      });
    } finally {
      if (modulePool) {
        await modulePool.end();
      }
      vi.doUnmock('../../server/db');
      vi.resetModules();
      restorePhase0Env(originalEnv);
    }
  }, 60_000);
});
