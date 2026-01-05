/**
 * Database Migration Runner with Checksum Validation
 *
 * Features:
 * - Applies SQL migrations in order
 * - Tracks applied migrations in migration_history table
 * - Validates checksums to detect modified migrations
 * - Supports dry-run mode
 * - Transaction-safe with automatic rollback on failure
 *
 * See: docs/plans/2026-01-04-phase1-implementation-plan.md (Task 10)
 *
 * Usage:
 *   npm run db:migrate                    # Run all pending migrations
 *   npm run db:migrate -- --dry-run       # Preview migrations without applying
 *   npm run db:migrate -- --status        # Show migration status
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { Pool, type PoolClient } from 'pg';

// Configuration
const MIGRATIONS_DIR = join(process.cwd(), 'shared', 'migrations');
const MIGRATION_PATTERN = /^\d{4}_.*\.sql$/;

interface MigrationResult {
  name: string;
  status: 'applied' | 'skipped' | 'failed';
  checksum?: string;
  error?: string;
  dryRun?: boolean;
}

interface MigrationHistory {
  id: number;
  migration_name: string;
  applied_at: Date;
  checksum: string;
}

/**
 * Calculate SHA-256 checksum of a file
 */
function calculateChecksum(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8');
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Get list of migration files sorted by name
 */
function getMigrationFiles(): string[] {
  if (!existsSync(MIGRATIONS_DIR)) {
    console.log(`[WARN] Migrations directory not found: ${MIGRATIONS_DIR}`);
    return [];
  }

  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => MIGRATION_PATTERN.test(f))
    .sort();
}

/**
 * Ensure migration_history table exists
 */
async function ensureMigrationHistoryTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS migration_history (
      id SERIAL PRIMARY KEY,
      migration_name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum TEXT NOT NULL
    );
  `);
}

/**
 * Get list of applied migrations from database
 */
async function getAppliedMigrations(client: PoolClient): Promise<Map<string, MigrationHistory>> {
  const result = await client.query<MigrationHistory>(`
    SELECT id, migration_name, applied_at, checksum
    FROM migration_history
    ORDER BY applied_at ASC
  `);

  return new Map(result.rows.map((r) => [r.migration_name, r]));
}

/**
 * Verify checksum of an already-applied migration
 */
function verifyChecksum(
  migrationName: string,
  currentChecksum: string,
  storedChecksum: string
): void {
  if (currentChecksum !== storedChecksum) {
    throw new Error(
      `Checksum mismatch for migration ${migrationName}.\n` +
        `  Expected: ${storedChecksum}\n` +
        `  Got:      ${currentChecksum}\n` +
        `Migration file has been modified after application. This is dangerous!`
    );
  }
}

/**
 * Apply a single migration within a transaction
 */
async function applyMigration(
  client: PoolClient,
  migrationFile: string,
  checksum: string,
  dryRun: boolean
): Promise<void> {
  const migrationPath = join(MIGRATIONS_DIR, migrationFile);
  const sql = readFileSync(migrationPath, 'utf-8');

  if (dryRun) {
    console.log(`[DRY-RUN] Would apply: ${migrationFile}`);
    console.log(`  Checksum: ${checksum.substring(0, 16)}...`);
    return;
  }

  // Execute migration SQL
  await client.query(sql);

  // Record in history
  await client.query('INSERT INTO migration_history (migration_name, checksum) VALUES ($1, $2)', [
    migrationFile,
    checksum,
  ]);
}

/**
 * Main migration runner
 */
export async function runMigrations(
  pool: Pool,
  options: { dryRun?: boolean; status?: boolean } = {}
): Promise<MigrationResult[]> {
  const { dryRun = false, status = false } = options;
  const results: MigrationResult[] = [];
  const migrationFiles = getMigrationFiles();

  if (migrationFiles.length === 0) {
    console.log('[INFO] No migration files found');
    return results;
  }

  const client = await pool.connect();

  try {
    // Ensure tracking table exists
    await ensureMigrationHistoryTable(client);

    // Get already applied migrations
    const appliedMigrations = await getAppliedMigrations(client);

    if (status) {
      console.log('\n=== Migration Status ===\n');
      for (const file of migrationFiles) {
        const applied = appliedMigrations.get(file);
        const currentChecksum = calculateChecksum(join(MIGRATIONS_DIR, file));

        if (applied) {
          const checksumMatch = applied.checksum === currentChecksum;
          console.log(`[APPLIED] ${file}` + (checksumMatch ? '' : ' [CHECKSUM CHANGED!]'));
        } else {
          console.log(`[PENDING] ${file}`);
        }
      }
      console.log('\n');
      return results;
    }

    console.log(`\n=== Running Migrations ${dryRun ? '(DRY RUN)' : ''} ===\n`);

    for (const file of migrationFiles) {
      const migrationPath = join(MIGRATIONS_DIR, file);
      const checksum = calculateChecksum(migrationPath);
      const applied = appliedMigrations.get(file);

      // Check if already applied
      if (applied) {
        // Verify checksum hasn't changed
        verifyChecksum(file, checksum, applied.checksum);
        results.push({ name: file, status: 'skipped', checksum });
        console.log(`[SKIP] ${file} (already applied)`);
        continue;
      }

      // Apply migration in transaction
      try {
        await client.query('BEGIN');

        await applyMigration(client, file, checksum, dryRun);

        if (!dryRun) {
          await client.query('COMMIT');
        }

        results.push({ name: file, status: 'applied', checksum, dryRun });
        console.log(`[PASS] Applied migration: ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({ name: file, status: 'failed', checksum, error: errorMessage });
        console.error(`[FAIL] Migration failed: ${file}`);
        console.error(`       Error: ${errorMessage}`);

        // Stop on first failure
        throw error;
      }
    }

    // Summary
    const applied = results.filter((r) => r.status === 'applied').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    console.log(`\n=== Migration Summary ===`);
    console.log(`Applied: ${applied}, Skipped: ${skipped}, Total: ${migrationFiles.length}`);
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
  const status = args.includes('--status');

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[ERROR] DATABASE_URL environment variable not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });

  try {
    await runMigrations(pool, { dryRun, status });
    process.exit(0);
  } catch (error) {
    console.error('[FATAL] Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
