/**
 * Migration utilities for testcontainers
 * Provides reusable migration operations for integration tests
 */

import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

export interface MigrationState {
  applied: Array<{ name: string; appliedAt: Date }>;
  pending: string[];
  current: string | null;
}

export interface SeedMigrationRecord {
  name: string;
  appliedAt?: Date;
}

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface JournalFile {
  version?: string;
  dialect?: string;
  entries: JournalEntry[];
}

const MIGRATIONS_TABLE = 'drizzle_migrations';

function normalizeMigrationName(name: string): string {
  return name.replace(/\.sql$/i, '');
}

function resolveMigrationsFolder(): string {
  const repoRoot = process.cwd();
  const drizzleFolder = path.join(repoRoot, 'drizzle');
  if (fs.existsSync(drizzleFolder)) {
    return drizzleFolder;
  }

  const migrationsFolder = path.join(repoRoot, 'migrations');
  if (fs.existsSync(migrationsFolder)) {
    return migrationsFolder;
  }

  throw new Error('No migrations folder found at ./drizzle or ./migrations');
}

function readJournalFile(migrationsFolder: string): JournalFile | null {
  const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');
  if (!fs.existsSync(journalPath)) {
    return null;
  }

  const raw = fs.readFileSync(journalPath, 'utf-8');
  return JSON.parse(raw) as JournalFile;
}

function readMigrationOrder(migrationsFolder: string): {
  ordered: string[];
  journal: JournalFile | null;
} {
  const journal = readJournalFile(migrationsFolder);
  if (journal?.entries?.length) {
    return {
      ordered: journal.entries.map((entry) => entry.tag),
      journal,
    };
  }

  const sqlFiles = fs
    .readdirSync(migrationsFolder)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  return {
    ordered: sqlFiles.map(normalizeMigrationName),
    journal: null,
  };
}

function ensureTempMigrationsFolder(
  migrationsFolder: string,
  journal: JournalFile,
  ordered: string[]
): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testcontainers-migrations-'));
  const metaDir = path.join(tempDir, 'meta');
  fs.mkdirSync(metaDir, { recursive: true });

  const allowed = new Set(ordered);
  const trimmedEntries = journal.entries.filter((entry) => allowed.has(entry.tag));
  const trimmedJournal: JournalFile = {
    ...journal,
    entries: trimmedEntries,
  };

  fs.writeFileSync(path.join(metaDir, '_journal.json'), JSON.stringify(trimmedJournal, null, 2));

  for (const tag of ordered) {
    const source = path.join(migrationsFolder, `${tag}.sql`);
    const target = path.join(tempDir, `${tag}.sql`);
    fs.copyFileSync(source, target);
  }

  return tempDir;
}

function cleanupTempFolder(tempDir: string, migrationsFolder: string): void {
  if (tempDir === migrationsFolder) return;
  if (!tempDir.includes('testcontainers-migrations-')) return;
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function hashMigration(sqlFile: string, nameFallback: string): string {
  if (!fs.existsSync(sqlFile)) {
    return crypto.createHash('sha256').update(nameFallback).digest('hex');
  }
  const contents = fs.readFileSync(sqlFile, 'utf-8');
  return crypto.createHash('sha256').update(contents).digest('hex');
}

function toMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function valueForColumn(dataType: string | undefined, millis: number): string | number | Date {
  if (!dataType) return millis;
  const normalized = dataType.toLowerCase();
  if (normalized.includes('timestamp')) return new Date(millis);
  if (normalized.includes('char') || normalized.includes('text')) {
    return new Date(millis).toISOString();
  }
  return millis;
}

async function getMigrationColumns(db: ReturnType<typeof drizzle>): Promise<Map<string, string>> {
  const result = await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${MIGRATIONS_TABLE}
  `);

  const columns = new Map<string, string>();
  for (const row of result.rows as Array<{ column_name: string; data_type: string }>) {
    columns.set(row.column_name, row.data_type);
  }

  return columns;
}

/**
 * Run migrations up to a specific version (default: latest).
 */
export async function runMigrationsToVersion(
  container: StartedPostgreSqlContainer,
  targetVersion?: string
): Promise<MigrationState> {
  const migrationsFolder = resolveMigrationsFolder();
  const { ordered, journal } = readMigrationOrder(migrationsFolder);

  if (!journal) {
    throw new Error(`Missing meta/_journal.json in ${migrationsFolder}`);
  }

  if (ordered.length === 0) {
    return {
      applied: [],
      pending: [],
      current: null,
    };
  }

  const normalizedTarget = normalizeMigrationName(targetVersion ?? ordered[ordered.length - 1]!);
  const targetIndex = ordered.indexOf(normalizedTarget);

  if (targetIndex === -1) {
    throw new Error(`Target migration not found: ${normalizedTarget}`);
  }

  const pool = new Pool({
    connectionString: container.getConnectionUri(),
    max: 1,
  });

  let folderToUse = migrationsFolder;
  if (targetIndex < ordered.length - 1) {
    folderToUse = ensureTempMigrationsFolder(
      migrationsFolder,
      journal,
      ordered.slice(0, targetIndex + 1)
    );
  }

  try {
    console.log(`[testcontainers-migration] Running migrations from ${folderToUse}`);
    console.log(`[testcontainers-migration] Target: ${normalizedTarget}, ordered: ${ordered.join(', ')}`);
    const db = drizzle(pool);
    await migrate(db, {
      migrationsFolder: folderToUse,
      migrationsTable: MIGRATIONS_TABLE,
    });
    console.log('[testcontainers-migration] Drizzle migrate() completed');

    // Verify table was created
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = '${MIGRATIONS_TABLE}'
      ) as exists
    `);
    console.log(`[testcontainers-migration] Table ${MIGRATIONS_TABLE} exists: ${tableCheck.rows[0]?.exists}`);

    // Log what's in the table
    if (tableCheck.rows[0]?.exists) {
      const countResult = await pool.query(`SELECT COUNT(*) as cnt FROM ${MIGRATIONS_TABLE}`);
      console.log(`[testcontainers-migration] Migration records: ${countResult.rows[0]?.cnt}`);
    }
  } catch (error) {
    console.error('[testcontainers-migration] Migration failed', error);
    throw error;
  } finally {
    await pool.end();
    cleanupTempFolder(folderToUse, migrationsFolder);
  }

  return getMigrationState(container);
}

/**
 * Drop all tables and re-run migrations.
 */
export async function resetDatabase(container: StartedPostgreSqlContainer): Promise<void> {
  const pool = new Pool({
    connectionString: container.getConnectionUri(),
    max: 1,
  });

  try {
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');
    await pool.query('GRANT ALL ON SCHEMA public TO public');
  } catch (error) {
    console.error('[testcontainers-migration] Reset failed', error);
    throw error;
  } finally {
    await pool.end();
  }

  await runMigrationsToVersion(container);
}

/**
 * Query migration state from drizzle_migrations table.
 */
export async function getMigrationState(
  container: StartedPostgreSqlContainer
): Promise<MigrationState> {
  const migrationsFolder = resolveMigrationsFolder();
  const { ordered, journal } = readMigrationOrder(migrationsFolder);

  const pool = new Pool({
    connectionString: container.getConnectionUri(),
    max: 1,
  });

  try {
    const db = drizzle(pool);
    const columns = await getMigrationColumns(db);
    if (columns.size === 0) {
      return { applied: [], pending: ordered, current: null };
    }

    const applied: Array<{ name: string; appliedAt: Date }> = [];

    // Build hash -> tag lookup from migration files
    const tagByHash = new Map<string, string>();
    for (const tag of ordered) {
      const sqlFile = path.join(migrationsFolder, `${tag}.sql`);
      const hash = hashMigration(sqlFile, tag);
      tagByHash.set(hash, tag);
    }

    if (columns.has('name')) {
      const result = await db.execute(sql`
        SELECT name, created_at
        FROM ${sql.identifier(MIGRATIONS_TABLE)}
        ORDER BY created_at ASC
      `);

      for (const row of result.rows as Array<{ name: string; created_at: unknown }>) {
        const appliedAt = new Date(toMillis(row.created_at));
        applied.push({ name: row.name, appliedAt });
      }
    } else {
      // Map by hash when name column doesn't exist
      const result = await db.execute(sql`
        SELECT hash, created_at
        FROM ${sql.identifier(MIGRATIONS_TABLE)}
        ORDER BY created_at ASC
      `);

      for (const row of result.rows as Array<{ hash: string; created_at: unknown }>) {
        const name = tagByHash.get(row.hash) ?? `unknown_${row.hash.substring(0, 8)}`;
        const appliedAt = new Date(toMillis(row.created_at));
        applied.push({ name, appliedAt });
      }
    }

    const appliedNames = new Set(applied.map((item) => item.name));
    const pending = ordered.filter((name) => !appliedNames.has(name));
    const current = applied.length > 0 ? applied[applied.length - 1]!.name : null;

    return { applied, pending, current };
  } catch (error) {
    console.error('[testcontainers-migration] Failed to read migration state', error);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * Insert fake migration records without running them.
 */
export async function seedMigrationHistory(
  container: StartedPostgreSqlContainer,
  migrations: SeedMigrationRecord[]
): Promise<void> {
  const migrationsFolder = resolveMigrationsFolder();
  const { journal } = readMigrationOrder(migrationsFolder);

  const pool = new Pool({
    connectionString: container.getConnectionUri(),
    max: 1,
  });

  try {
    const db = drizzle(pool);
    const columns = await getMigrationColumns(db);
    if (columns.size === 0) {
      throw new Error('drizzle_migrations table not found. Run migrations first.');
    }

    const entryByTag = new Map<string, JournalEntry>();
    if (journal?.entries?.length) {
      for (const entry of journal.entries) {
        entryByTag.set(entry.tag, entry);
      }
    }

    for (const migration of migrations) {
      const tag = normalizeMigrationName(migration.name);
      const entry = entryByTag.get(tag);
      const fallbackMillis = migration.appliedAt?.getTime() ?? Date.now();
      const folderMillis = entry?.when ?? fallbackMillis;

      const sqlFile = path.join(migrationsFolder, `${tag}.sql`);
      const hash = hashMigration(sqlFile, tag);

      const createdAtValue = valueForColumn(columns.get('created_at'), folderMillis);
      const timestampValue = valueForColumn(columns.get('timestamp'), folderMillis);

      if (columns.has('name') && columns.has('timestamp')) {
        await db.execute(sql`
          INSERT INTO ${sql.identifier(MIGRATIONS_TABLE)} ("name", "timestamp", "hash", "created_at")
          VALUES (${tag}, ${timestampValue}, ${hash}, ${createdAtValue})
        `);
      } else if (columns.has('name')) {
        await db.execute(sql`
          INSERT INTO ${sql.identifier(MIGRATIONS_TABLE)} ("name", "hash", "created_at")
          VALUES (${tag}, ${hash}, ${createdAtValue})
        `);
      } else {
        await db.execute(sql`
          INSERT INTO ${sql.identifier(MIGRATIONS_TABLE)} ("hash", "created_at")
          VALUES (${hash}, ${createdAtValue})
        `);
      }
    }
  } catch (error) {
    console.error('[testcontainers-migration] Failed to seed migration history', error);
    throw error;
  } finally {
    await pool.end();
  }
}
