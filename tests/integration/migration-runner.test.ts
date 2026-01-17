/**
 * Migration runner integration tests
 *
 * Tests the testcontainers-migration utilities against a real PostgreSQL container:
 * - Fresh database state detection
 * - Migration application (full and partial)
 * - Migration history seeding
 * - Database reset functionality
 * - Error handling for invalid targets
 *
 * @group integration
 * @group testcontainers
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import {
  runMigrationsToVersion,
  getMigrationState,
  seedMigrationHistory,
  resetDatabase,
} from '../helpers/testcontainers-migration';

// Migration tags from migrations/meta/_journal.json
const MIGRATIONS = ['0000_quick_vivisector', '0001_certain_miracleman'] as const;
const LATEST = MIGRATIONS[MIGRATIONS.length - 1];

// Container configuration
const DB_NAME = 'test_db';
const DB_USER = 'test_user';
const DB_PASSWORD = 'test_password';
const STARTUP_TIMEOUT_MS = 60000;

// Skip on local Windows (no Docker Desktop), run on CI (has Docker) or non-Windows
const skipIfNoDocker = !process.env.CI && process.platform === 'win32';

let container: StartedPostgreSqlContainer;
let adminPool: Pool;

/**
 * Reset schema to clean state with required extensions.
 * Called in beforeEach for test isolation.
 *
 * Note: Extensions must be created AFTER schema recreation because
 * DROP SCHEMA CASCADE removes them. We use CASCADE on DROP EXTENSION
 * to handle any dependencies cleanly.
 */
async function resetSchema(): Promise<void> {
  // Drop extensions first to avoid CASCADE issues
  await adminPool.query('DROP EXTENSION IF EXISTS vector CASCADE');
  await adminPool.query('DROP EXTENSION IF EXISTS pgcrypto CASCADE');

  // Recreate public schema
  await adminPool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await adminPool.query('CREATE SCHEMA public');
  await adminPool.query('GRANT ALL ON SCHEMA public TO public');

  // Recreate extensions in the new schema
  // pgcrypto provides gen_random_uuid() used by migrations
  await adminPool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
  await adminPool.query('CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public');
}

/**
 * Create minimal drizzle_migrations table for seeding tests.
 * Required because seedMigrationHistory expects the table to exist.
 */
async function ensureMigrationsTable(): Promise<void> {
  await adminPool.query(`
    CREATE TABLE IF NOT EXISTS drizzle_migrations (
      id serial PRIMARY KEY,
      name text NOT NULL,
      hash text NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
}

describe.skipIf(skipIfNoDocker)('Migration Runner Integration', () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase(DB_NAME)
      .withUsername(DB_USER)
      .withPassword(DB_PASSWORD)
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

  it('reports pending migrations on a fresh database', async () => {
    const state = await getMigrationState(container);

    expect(state.applied).toEqual([]);
    expect(state.current).toBeNull();
    expect(state.pending).toEqual([...MIGRATIONS]);
  });

  it('applies all migrations when no target is specified', async () => {
    const state = await runMigrationsToVersion(container);

    expect(state.pending).toEqual([]);
    expect(state.current).toBe(LATEST);
    expect(state.applied.map((entry) => entry.name)).toEqual([...MIGRATIONS]);
  });

  it('applies migrations up to the target version', async () => {
    const state = await runMigrationsToVersion(container, MIGRATIONS[0]);

    expect(state.current).toBe(MIGRATIONS[0]);
    expect(state.applied.map((entry) => entry.name)).toEqual([MIGRATIONS[0]]);
    expect(state.pending).toEqual([MIGRATIONS[1]]);
  });

  it('reflects seeded migration history without running migrations', async () => {
    await ensureMigrationsTable();
    await seedMigrationHistory(container, [{ name: MIGRATIONS[0] }]);

    const state = await getMigrationState(container);

    expect(state.applied.map((entry) => entry.name)).toEqual([MIGRATIONS[0]]);
    expect(state.current).toBe(MIGRATIONS[0]);
    expect(state.pending).toEqual([MIGRATIONS[1]]);
  });

  it('resets the database back to latest migration state', async () => {
    await runMigrationsToVersion(container, MIGRATIONS[0]);
    await adminPool.query('TRUNCATE drizzle_migrations');

    await resetDatabase(container);

    const state = await getMigrationState(container);
    expect(state.current).toBe(LATEST);
    expect(state.pending).toEqual([]);
  });

  it('throws when target migration is unknown', async () => {
    await expect(runMigrationsToVersion(container, '9999_missing_migration')).rejects.toThrow(
      'Target migration not found: 9999_missing_migration'
    );
  });
});
