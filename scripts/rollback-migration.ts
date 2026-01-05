/**
 * Database Migration Rollback Script
 *
 * Features:
 * - Rolls back the most recently applied migration
 * - Supports down migration files (*.down.sql)
 * - Falls back to inferring table drops if no down migration
 * - Transaction-safe with automatic rollback on failure
 *
 * See: docs/plans/2026-01-04-phase1-implementation-plan.md (Task 10)
 *
 * Usage:
 *   npm run db:rollback              # Rollback last migration
 *   npm run db:rollback -- --dry-run # Preview rollback without applying
 *   npm run db:rollback -- --steps 3 # Rollback last 3 migrations
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Pool, type PoolClient } from 'pg';

// Configuration
const MIGRATIONS_DIR = join(process.cwd(), 'shared', 'migrations');

interface RollbackResult {
  name: string;
  status: 'rolled_back' | 'failed' | 'no_migrations';
  method: 'down_file' | 'inferred' | 'none';
  error?: string;
}

interface MigrationHistory {
  id: number;
  migration_name: string;
  applied_at: Date;
  checksum: string;
}

/**
 * Get the last applied migration from database
 */
async function getLastMigration(client: PoolClient): Promise<MigrationHistory | null> {
  const result = await client.query<MigrationHistory>(`
    SELECT id, migration_name, applied_at, checksum
    FROM migration_history
    ORDER BY applied_at DESC
    LIMIT 1
  `);

  return result.rows[0] || null;
}

/**
 * Get N most recently applied migrations
 */
async function getLastNMigrations(client: PoolClient, n: number): Promise<MigrationHistory[]> {
  const result = await client.query<MigrationHistory>(
    `
    SELECT id, migration_name, applied_at, checksum
    FROM migration_history
    ORDER BY applied_at DESC
    LIMIT $1
  `,
    [n]
  );

  return result.rows;
}

/**
 * Find the down migration file for a given migration
 */
function findDownMigration(migrationName: string): string | null {
  const downMigrationPath = join(MIGRATIONS_DIR, migrationName.replace('.sql', '.down.sql'));

  return existsSync(downMigrationPath) ? downMigrationPath : null;
}

/**
 * Infer table name from migration filename for simple drops
 * Handles patterns like: 0001_create_job_outbox.sql -> job_outbox
 */
function inferTableName(migrationName: string): string | null {
  const match = migrationName.match(/^\d+_create_(.+)\.sql$/);
  return match ? match[1] : null;
}

/**
 * Execute rollback for a single migration
 */
async function executeRollback(
  client: PoolClient,
  migration: MigrationHistory,
  dryRun: boolean
): Promise<RollbackResult> {
  const { migration_name } = migration;

  // Try to find down migration file
  const downMigrationPath = findDownMigration(migration_name);

  if (downMigrationPath) {
    // Use down migration file
    const downSql = readFileSync(downMigrationPath, 'utf-8');

    if (dryRun) {
      console.log(`[DRY-RUN] Would execute down migration: ${migration_name}`);
      console.log(`  File: ${downMigrationPath}`);
      return { name: migration_name, status: 'rolled_back', method: 'down_file' };
    }

    await client.query(downSql);
    console.log(`[PASS] Executed down migration: ${migration_name}`);

    return { name: migration_name, status: 'rolled_back', method: 'down_file' };
  }

  // Try to infer table drop
  const tableName = inferTableName(migration_name);

  if (tableName) {
    if (dryRun) {
      console.log(`[DRY-RUN] Would drop table: ${tableName}`);
      console.log(`  Inferred from: ${migration_name}`);
      return { name: migration_name, status: 'rolled_back', method: 'inferred' };
    }

    await client.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
    console.log(`[WARN] No down migration found, dropped table: ${tableName}`);

    return { name: migration_name, status: 'rolled_back', method: 'inferred' };
  }

  // Cannot determine how to rollback
  console.error(`[ERROR] Cannot rollback migration: ${migration_name}`);
  console.error('  No down migration file found and cannot infer table name.');
  console.error('  Please create a down migration file manually.');

  return {
    name: migration_name,
    status: 'failed',
    method: 'none',
    error: 'Cannot determine rollback method',
  };
}

/**
 * Main rollback function
 */
export async function rollbackMigration(
  pool: Pool,
  options: { dryRun?: boolean; steps?: number } = {}
): Promise<RollbackResult[]> {
  const { dryRun = false, steps = 1 } = options;
  const results: RollbackResult[] = [];

  const client = await pool.connect();

  try {
    // Check if migration_history table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'migration_history'
      ) as exists
    `);

    if (!tableCheck.rows[0]?.exists) {
      console.log('[WARN] No migration_history table found. Nothing to rollback.');
      return [{ name: 'none', status: 'no_migrations', method: 'none' }];
    }

    // Get migrations to rollback
    const migrations = await getLastNMigrations(client, steps);

    if (migrations.length === 0) {
      console.log('[INFO] No migrations to rollback.');
      return [{ name: 'none', status: 'no_migrations', method: 'none' }];
    }

    console.log(
      `\n=== Rolling Back ${migrations.length} Migration(s) ${dryRun ? '(DRY RUN)' : ''} ===\n`
    );

    for (const migration of migrations) {
      try {
        await client.query('BEGIN');

        const result = await executeRollback(client, migration, dryRun);
        results.push(result);

        if (result.status === 'failed') {
          await client.query('ROLLBACK');
          throw new Error(result.error);
        }

        // Remove from history
        if (!dryRun) {
          await client.query('DELETE FROM migration_history WHERE migration_name = $1', [
            migration.migration_name,
          ]);
          await client.query('COMMIT');
        }
      } catch (error) {
        await client.query('ROLLBACK');

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[FAIL] Rollback failed: ${migration.migration_name}`);
        console.error(`       Error: ${errorMessage}`);

        results.push({
          name: migration.migration_name,
          status: 'failed',
          method: 'none',
          error: errorMessage,
        });

        // Stop on first failure
        throw error;
      }
    }

    // Summary
    const rolledBack = results.filter((r) => r.status === 'rolled_back').length;
    console.log(`\n=== Rollback Summary ===`);
    console.log(`Rolled back: ${rolledBack} migration(s)`);
    console.log('');

    return results;
  } finally {
    client.release();
  }
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  // Parse --steps argument
  let steps = 1;
  const stepsIndex = args.indexOf('--steps');
  if (stepsIndex !== -1 && args[stepsIndex + 1]) {
    const parsedSteps = parseInt(args[stepsIndex + 1], 10);
    if (!isNaN(parsedSteps) && parsedSteps > 0) {
      steps = parsedSteps;
    }
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[ERROR] DATABASE_URL environment variable not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });

  try {
    await rollbackMigration(pool, { dryRun, steps });
    process.exit(0);
  } catch (error) {
    console.error('[FATAL] Rollback failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
