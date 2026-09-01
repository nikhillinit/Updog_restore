/**
 * Real-PostgreSQL proof for migration 0055.
 *
 * Covers journaled apply, raw replay convergence, command-state coupling
 * constraints, and fail-closed replay when the index catalog drifts.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../../helpers/testcontainers';
import { runMigrationsWithConnectionString } from '../../helpers/testcontainers-migration';

const MIGRATION_TAG = '0055_current_forecast_recompute_commands';
const MIGRATION_FILE = path.join(process.cwd(), 'migrations', `${MIGRATION_TAG}.sql`);
const skipIfNoDocker =
  !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';

let adminPool: Pool | undefined;
let databaseName: string | undefined;
let connectionString: string | undefined;
let pool: Pool | undefined;
let migrationSql = '';
let startedTestContainers = false;
const fundId = 229_055_001;

describe.skipIf(skipIfNoDocker)(
  'current forecast recompute command migration PostgreSQL proof',
  () => {
    beforeAll(async () => {
      if (!process.env.TEST_DATABASE_URL) {
        await setupTestContainers();
        startedTestContainers = true;
      }

      const adminConnectionString = process.env.TEST_DATABASE_URL ?? getPostgresConnectionString();
      adminPool = new Pool({ connectionString: adminConnectionString, max: 1 });
      databaseName = `cf_recompute_0055_${process.pid}_${Date.now()}`.toLowerCase();
      await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);

      const databaseUrl = new URL(adminConnectionString);
      databaseUrl.pathname = `/${databaseName}`;
      connectionString = databaseUrl.toString();

      const state = await runMigrationsWithConnectionString(connectionString, MIGRATION_TAG);
      expect(state.applied.map((entry) => entry.name)).toContain(MIGRATION_TAG);

      pool = new Pool({ connectionString, max: 1 });
      migrationSql = await readFile(MIGRATION_FILE, 'utf8');
      await pool.query(
        `
        INSERT INTO funds (id, name, size, management_fee, carry_percentage, vintage_year)
        VALUES ($1, '0055 recompute proof', 10000000, '0.0200', '0.2000', 2026)
      `,
        [fundId]
      );
    }, 180_000);

    afterAll(async () => {
      await pool?.end();
      if (adminPool && databaseName) {
        await adminPool.query(
          `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`
        );
      }
      await adminPool?.end();
      if (startedTestContainers) await cleanupTestContainers();
    });

    it('raw replay preserves the first-applied command table catalog', async () => {
      const database = requiredPool();
      const before = await commandTableCatalog(database);

      await database.query(migrationSql);

      expect(await commandTableCatalog(database)).toEqual(before);
    });

    it.each([
      {
        name: 'completed command without reconciliation',
        status: 'completed',
        failureCode: null,
        createdReconciliation: false,
        finalizedAt: new Date('2026-08-31T19:58:00-07:00'),
        pattern: /current_forecast_recompute_commands_terminal_coupling_check/,
      },
      {
        name: 'failed command without failure code',
        status: 'failed',
        failureCode: null,
        createdReconciliation: false,
        finalizedAt: new Date('2026-08-31T19:58:00-07:00'),
        pattern: /current_forecast_recompute_commands_terminal_coupling_check/,
      },
      {
        name: 'skipped command with failure code',
        status: 'skipped',
        failureCode: 'execution_error',
        createdReconciliation: false,
        finalizedAt: new Date('2026-08-31T19:58:00-07:00'),
        pattern: /current_forecast_recompute_commands_terminal_coupling_check/,
      },
      {
        name: 'pending command marked as reconciliation creator',
        status: 'pending',
        failureCode: null,
        createdReconciliation: true,
        finalizedAt: null,
        pattern: /current_forecast_recompute_commands_created_recon_check/,
      },
      {
        name: 'failed command without finalization timestamp',
        status: 'failed',
        failureCode: 'execution_error',
        createdReconciliation: false,
        finalizedAt: null,
        pattern: /current_forecast_recompute_commands_finalized_at_check/,
      },
    ])('rejects $name', async (testCase) => {
      await expect(
        requiredPool().query(
          `
          INSERT INTO current_forecast_recompute_commands (
            fund_id,
            idempotency_key,
            request_hash,
            status,
            failure_code,
            created_reconciliation,
            finalized_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
          [
            fundId,
            `invalid-${testCase.name}`,
            'a'.repeat(64),
            testCase.status,
            testCase.failureCode,
            testCase.createdReconciliation,
            testCase.finalizedAt,
          ]
        )
      ).rejects.toThrow(testCase.pattern);
    });

    it.each([
      {
        name: 'altered same-named idempotency index',
        mutate: async (client: PoolClient) => {
          await client.query(`
          ALTER TABLE current_forecast_recompute_commands
          DROP CONSTRAINT current_forecast_recompute_commands_fund_idempotency_unique
        `);
          await client.query(`
          CREATE UNIQUE INDEX current_forecast_recompute_commands_fund_idempotency_unique
          ON current_forecast_recompute_commands (idempotency_key, fund_id)
        `);
        },
      },
      {
        name: 'unexpected command-table index',
        mutate: async (client: PoolClient) => {
          await client.query(`
          CREATE INDEX current_forecast_recompute_commands_started_at_probe
          ON current_forecast_recompute_commands (started_at)
        `);
        },
      },
    ])('refuses raw replay with $name', async ({ mutate }) => {
      await expectReplayRefusal(mutate);
    });
  }
);

function requiredPool(): Pool {
  if (!pool) throw new Error('PostgreSQL proof pool not initialized.');
  return pool;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function expectReplayRefusal(mutate: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await requiredPool().connect();
  try {
    await client.query('BEGIN');
    await mutate(client);
    await expect(client.query(migrationSql)).rejects.toThrow(
      /current_forecast_recompute_commands_catalog_drift/
    );
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

interface CommandTableCatalog {
  columns: Array<{
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>;
  constraints: Array<{ conname: string; definition: string }>;
  indexes: Array<{ indexname: string; indexdef: string }>;
}

async function commandTableCatalog(database: Pool): Promise<CommandTableCatalog> {
  const columns = await database.query<CommandTableCatalog['columns'][number]>(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'current_forecast_recompute_commands'
    ORDER BY ordinal_position
  `);
  const constraints = await database.query<CommandTableCatalog['constraints'][number]>(`
    SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'public.current_forecast_recompute_commands'::regclass
    ORDER BY conname
  `);
  const indexes = await database.query<CommandTableCatalog['indexes'][number]>(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'current_forecast_recompute_commands'
    ORDER BY indexname
  `);

  return {
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
  };
}
