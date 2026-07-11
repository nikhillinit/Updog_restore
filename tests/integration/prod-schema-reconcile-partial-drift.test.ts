import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ACTION_APPLY_MISSING_DDL,
  ACTION_REFUSE_FOR_HUMAN,
  ACTION_SKIP,
  auditManifest,
  loadManifests,
  splitSqlStatements,
} from '../../scripts/reconcile-prod-schema.mjs';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const STARTUP_TIMEOUT_MS = 90_000;
const TEST_TIMEOUT_MS = 60_000;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const skipIfNoDocker = !process.env.CI && process.platform === 'win32';

interface ManifestTable {
  readonly name: string;
}

interface Manifest {
  readonly name: string;
  readonly sqlFiles: readonly string[];
  readonly expectedTables?: readonly ManifestTable[];
}

let postgres: StartedPostgreSqlContainer | undefined;
let pool: Pool | undefined;
let h9Manifest: Manifest | undefined;
let allocationManifest: Manifest | undefined;

function requirePool(): Pool {
  if (!pool) {
    throw new Error('Postgres pool has not been initialized');
  }
  return pool;
}

function requireManifest(manifest: Manifest | undefined, tableName: string): Manifest {
  if (!manifest) {
    throw new Error(`Manifest containing ${tableName} was not loaded`);
  }
  return manifest;
}

function findManifest(manifests: readonly Manifest[], tableName: string): Manifest {
  return requireManifest(
    manifests.find((manifest) =>
      manifest.expectedTables?.some((table) => table.name === tableName)
    ),
    tableName
  );
}

async function applyManifest(activePool: Pool, manifest: Manifest): Promise<void> {
  for (const sqlFile of manifest.sqlFiles) {
    const sql = await readFile(path.resolve(REPO_ROOT, sqlFile), 'utf8');
    for (const statement of splitSqlStatements(sql)) {
      await activePool.query(statement);
    }
  }
}

describe.skipIf(skipIfNoDocker)('prod schema partial-drift reconciliation', () => {
  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_password')
      .withStartupTimeout(STARTUP_TIMEOUT_MS)
      .start();

    const connectionString = postgres.getConnectionUri();
    await runMigrationsWithConnectionString(connectionString);
    pool = new Pool({ connectionString, max: 1 });

    const manifests = (await loadManifests()) as Manifest[];
    h9Manifest = findManifest(manifests, 'pacing_history');
    allocationManifest = findManifest(manifests, 'allocation_scenarios');
  }, STARTUP_TIMEOUT_MS * 2);

  afterAll(async () => {
    await pool?.end();
    await postgres?.stop();
  });

  it(
    'clean journal clone audits SKIP for M6 and M7',
    async () => {
      const activePool = requirePool();

      const h9Audit = await auditManifest(
        activePool,
        requireManifest(h9Manifest, 'fund_calculation_modes')
      );
      const allocationAudit = await auditManifest(
        activePool,
        requireManifest(allocationManifest, 'allocation_scenarios')
      );

      expect(h9Audit.action).toBe(ACTION_SKIP);
      expect(allocationAudit.action).toBe(ACTION_SKIP);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'partial allocation drift repairs additively',
    async () => {
      const activePool = requirePool();
      const manifest = requireManifest(allocationManifest, 'allocation_scenarios');

      await activePool.query('DROP TABLE IF EXISTS allocation_scenario_items CASCADE');
      await activePool.query(
        'ALTER TABLE allocation_scenarios DROP COLUMN IF EXISTS last_synced_at'
      );
      await activePool.query('DROP INDEX IF EXISTS allocation_scenario_events_fund_created_idx');

      expect((await auditManifest(activePool, manifest)).action).toBe(ACTION_APPLY_MISSING_DDL);

      await applyManifest(activePool, manifest);
      expect((await auditManifest(activePool, manifest)).action).toBe(ACTION_SKIP);

      await applyManifest(activePool, manifest);
      expect((await auditManifest(activePool, manifest)).action).toBe(ACTION_SKIP);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'partial H9 drift repairs additively',
    async () => {
      const activePool = requirePool();
      const manifest = requireManifest(h9Manifest, 'fund_calculation_modes');

      await activePool.query(
        'ALTER TABLE fund_calculation_modes DROP COLUMN IF EXISTS h9_policy_version'
      );

      expect((await auditManifest(activePool, manifest)).action).toBe(ACTION_APPLY_MISSING_DDL);

      await applyManifest(activePool, manifest);
      expect((await auditManifest(activePool, manifest)).action).toBe(ACTION_SKIP);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'missing H9 base table refuses for human (existing_table_required)',
    async () => {
      const activePool = requirePool();
      const manifest = requireManifest(h9Manifest, 'pacing_history');

      await activePool.query('DROP TABLE IF EXISTS pacing_history CASCADE');

      expect((await auditManifest(activePool, manifest)).action).toBe(ACTION_REFUSE_FOR_HUMAN);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'non-additive type change on a populated table does not auto-apply',
    async () => {
      const activePool = requirePool();
      const manifest = requireManifest(allocationManifest, 'allocation_scenarios');

      await activePool.query(`
        WITH inserted_fund AS (
          INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
          VALUES ('Partial drift proof fund', 1000000, 0.02, 0.20, 2026)
          RETURNING id
        )
        INSERT INTO allocation_scenarios (fund_id, name)
        SELECT id, 'Partial drift proof scenario'
        FROM inserted_fund
      `);
      await activePool.query(`
        ALTER TABLE allocation_scenarios
        ALTER COLUMN total_planned_cents TYPE text USING total_planned_cents::text
      `);

      expect((await auditManifest(activePool, manifest)).action).toBe(ACTION_REFUSE_FOR_HUMAN);

      const typeResult = await activePool.query<{ data_type: string }>(`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'allocation_scenarios'
          AND column_name = 'total_planned_cents'
      `);
      expect(typeResult.rows).toEqual([{ data_type: 'text' }]);
    },
    TEST_TIMEOUT_MS
  );
});
