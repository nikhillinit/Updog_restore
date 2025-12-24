#!/usr/bin/env tsx
/**
 * LP Reporting tables migration runner.
 *
 * Manages database migrations for LP Reporting feature:
 * - Creates/manages LP schema tables with idempotency
 * - Validates migration order before execution
 * - Supports dry-run mode for pre-deployment validation
 * - Provides rollback procedures for disaster recovery
 *
 * Usage:
 *   npx tsx scripts/migrate-lp-tables.ts [--dry-run]
 *   npx tsx scripts/migrate-lp-tables.ts --rollback [--to=<migration-id>] [--dry-run]
 */

import { db } from '../server/db';
import { sql } from 'drizzle-orm';

interface MigrationStatement {
  label: string;
  statement: string;
}

interface Migration {
  order: number;
  id: string;
  name: string;
  up: MigrationStatement[];
  down: MigrationStatement[];
}

const MIGRATION_TABLE = 'lp_reporting_migrations';

// Define migration sequence for LP schema
const migrations: Migration[] = [
  {
    order: 1,
    id: '001-lp-base',
    name: 'Create LP base tables',
    up: [
      {
        label: 'Enable pgcrypto extension',
        statement: 'CREATE EXTENSION IF NOT EXISTS "pgcrypto";',
      },
      {
        label: 'Create limited_partners table',
        statement: `
          CREATE TABLE IF NOT EXISTS limited_partners (
            id serial PRIMARY KEY,
            name text NOT NULL,
            email varchar(255) NOT NULL,
            entity_type varchar(50) NOT NULL,
            tax_id varchar(50),
            address text,
            contact_name text,
            contact_email varchar(255),
            contact_phone varchar(50),
            version bigint NOT NULL DEFAULT 0,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT limited_partners_email_unique UNIQUE (email),
            CONSTRAINT limited_partners_entity_type_check
              CHECK (entity_type IN ('individual', 'institution', 'fund_of_funds'))
          );
        `.trim(),
      },
      {
        label: 'Create report_templates table',
        statement: `
          CREATE TABLE IF NOT EXISTS report_templates (
            id serial PRIMARY KEY,
            name varchar(255) NOT NULL,
            report_type varchar(50) NOT NULL,
            description text,
            sections jsonb NOT NULL,
            default_format varchar(10) NOT NULL DEFAULT 'pdf',
            is_active boolean DEFAULT true,
            version bigint NOT NULL DEFAULT 0,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT report_templates_name_unique UNIQUE (name)
          );
        `.trim(),
      },
      {
        label: 'Index report_templates report_type',
        statement:
          'CREATE INDEX IF NOT EXISTS report_templates_report_type_idx ON report_templates (report_type);',
      },
    ],
    down: [
      {
        label: 'Drop report_templates table',
        statement: 'DROP TABLE IF EXISTS report_templates CASCADE;',
      },
      {
        label: 'Drop limited_partners table',
        statement: 'DROP TABLE IF EXISTS limited_partners CASCADE;',
      },
    ],
  },
  {
    order: 2,
    id: '002-lp-commitments',
    name: 'Create commitments and activity tables',
    up: [
      {
        label: 'Create lp_fund_commitments table',
        statement: `
          CREATE TABLE IF NOT EXISTS lp_fund_commitments (
            id serial PRIMARY KEY,
            lp_id integer NOT NULL REFERENCES limited_partners(id) ON DELETE CASCADE,
            fund_id integer NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
            commitment_amount_cents bigint NOT NULL,
            commitment_date timestamptz NOT NULL,
            first_call_date timestamptz,
            commitment_percentage decimal(7, 4),
            status varchar(20) NOT NULL DEFAULT 'active',
            version bigint NOT NULL DEFAULT 0,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT lp_fund_commitments_lp_fund_unique UNIQUE (lp_id, fund_id),
            CONSTRAINT lp_fund_commitments_status_check
              CHECK (status IN ('active', 'fulfilled', 'withdrawn'))
          );
        `.trim(),
      },
      {
        label: 'Index lp_fund_commitments lp_id',
        statement:
          'CREATE INDEX IF NOT EXISTS lp_fund_commitments_lp_id_idx ON lp_fund_commitments (lp_id);',
      },
      {
        label: 'Index lp_fund_commitments fund_id',
        statement:
          'CREATE INDEX IF NOT EXISTS lp_fund_commitments_fund_id_idx ON lp_fund_commitments (fund_id);',
      },
      {
        label: 'Create capital_activities table',
        statement: `
          CREATE TABLE IF NOT EXISTS capital_activities (
            id serial PRIMARY KEY,
            commitment_id integer NOT NULL REFERENCES lp_fund_commitments(id) ON DELETE CASCADE,
            activity_type varchar(20) NOT NULL,
            amount_cents bigint NOT NULL,
            activity_date timestamptz NOT NULL,
            effective_date timestamptz NOT NULL,
            description text,
            reference_number varchar(100),
            idempotency_key varchar(128),
            version bigint NOT NULL DEFAULT 0,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT capital_activities_idempotency_unique UNIQUE (idempotency_key),
            CONSTRAINT capital_activities_activity_type_check
              CHECK (activity_type IN ('capital_call', 'distribution', 'recallable_distribution'))
          );
        `.trim(),
      },
      {
        label: 'Index capital_activities commitment_id',
        statement:
          'CREATE INDEX IF NOT EXISTS capital_activities_commitment_id_idx ON capital_activities (commitment_id);',
      },
      {
        label: 'Index capital_activities activity_date',
        statement:
          'CREATE INDEX IF NOT EXISTS capital_activities_activity_date_idx ON capital_activities (activity_date DESC);',
      },
      {
        label: 'Index capital_activities cursor',
        statement:
          'CREATE INDEX IF NOT EXISTS capital_activities_cursor_idx ON capital_activities (commitment_id, activity_date DESC, id DESC);',
      },
      {
        label: 'Create lp_distributions table',
        statement: `
          CREATE TABLE IF NOT EXISTS lp_distributions (
            id serial PRIMARY KEY,
            activity_id integer NOT NULL REFERENCES capital_activities(id) ON DELETE CASCADE,
            distribution_type varchar(30) NOT NULL,
            amount_cents bigint NOT NULL,
            tax_withheld_cents bigint DEFAULT 0,
            net_amount_cents bigint NOT NULL,
            version bigint NOT NULL DEFAULT 0,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT lp_distributions_distribution_type_check
              CHECK (distribution_type IN ('income', 'capital_gain', 'return_of_capital'))
          );
        `.trim(),
      },
      {
        label: 'Index lp_distributions activity_id',
        statement:
          'CREATE INDEX IF NOT EXISTS lp_distributions_activity_id_idx ON lp_distributions (activity_id);',
      },
      {
        label: 'Create lp_capital_accounts table',
        statement: `
          CREATE TABLE IF NOT EXISTS lp_capital_accounts (
            id serial PRIMARY KEY,
            commitment_id integer NOT NULL REFERENCES lp_fund_commitments(id) ON DELETE CASCADE,
            as_of_date timestamptz NOT NULL,
            called_capital_cents bigint NOT NULL,
            distributed_capital_cents bigint NOT NULL,
            nav_cents bigint NOT NULL,
            unfunded_commitment_cents bigint NOT NULL,
            version bigint NOT NULL DEFAULT 0,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT lp_capital_accounts_commitment_date_unique UNIQUE (commitment_id, as_of_date)
          );
        `.trim(),
      },
      {
        label: 'Index lp_capital_accounts commitment_id',
        statement:
          'CREATE INDEX IF NOT EXISTS lp_capital_accounts_commitment_id_idx ON lp_capital_accounts (commitment_id);',
      },
      {
        label: 'Index lp_capital_accounts as_of_date',
        statement:
          'CREATE INDEX IF NOT EXISTS lp_capital_accounts_as_of_date_idx ON lp_capital_accounts (as_of_date DESC);',
      },
      {
        label: 'Index lp_capital_accounts cursor',
        statement:
          'CREATE INDEX IF NOT EXISTS lp_capital_accounts_cursor_idx ON lp_capital_accounts (commitment_id, as_of_date DESC, id DESC);',
      },
      {
        label: 'Create lp_performance_snapshots table',
        statement: `
          CREATE TABLE IF NOT EXISTS lp_performance_snapshots (
            id serial PRIMARY KEY,
            commitment_id integer NOT NULL REFERENCES lp_fund_commitments(id) ON DELETE CASCADE,
            snapshot_date timestamptz NOT NULL,
            irr decimal(10, 6),
            moic decimal(10, 4),
            tvpi decimal(10, 4),
            dpi decimal(10, 4),
            rvpi decimal(10, 4),
            benchmark_irr decimal(10, 6),
            version bigint NOT NULL DEFAULT 0,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT lp_performance_snapshots_commitment_date_unique UNIQUE (commitment_id, snapshot_date)
          );
        `.trim(),
      },
      {
        label: 'Index lp_performance_snapshots commitment_id',
        statement:
          'CREATE INDEX IF NOT EXISTS lp_performance_snapshots_commitment_id_idx ON lp_performance_snapshots (commitment_id);',
      },
      {
        label: 'Index lp_performance_snapshots snapshot_date',
        statement:
          'CREATE INDEX IF NOT EXISTS lp_performance_snapshots_snapshot_date_idx ON lp_performance_snapshots (snapshot_date DESC);',
      },
      {
        label: 'Index lp_performance_snapshots cursor',
        statement:
          'CREATE INDEX IF NOT EXISTS lp_performance_snapshots_cursor_idx ON lp_performance_snapshots (commitment_id, snapshot_date DESC, id DESC);',
      },
    ],
    down: [
      {
        label: 'Drop lp_performance_snapshots table',
        statement: 'DROP TABLE IF EXISTS lp_performance_snapshots CASCADE;',
      },
      {
        label: 'Drop lp_capital_accounts table',
        statement: 'DROP TABLE IF EXISTS lp_capital_accounts CASCADE;',
      },
      {
        label: 'Drop lp_distributions table',
        statement: 'DROP TABLE IF EXISTS lp_distributions CASCADE;',
      },
      {
        label: 'Drop capital_activities table',
        statement: 'DROP TABLE IF EXISTS capital_activities CASCADE;',
      },
      {
        label: 'Drop lp_fund_commitments table',
        statement: 'DROP TABLE IF EXISTS lp_fund_commitments CASCADE;',
      },
    ],
  },
  {
    order: 3,
    id: '003-lp-reports',
    name: 'Create LP reports table',
    up: [
      {
        label: 'Create lp_reports table',
        statement: `
          CREATE TABLE IF NOT EXISTS lp_reports (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            lp_id integer NOT NULL REFERENCES limited_partners(id) ON DELETE CASCADE,
            report_type varchar(50) NOT NULL,
            report_period_start timestamptz NOT NULL,
            report_period_end timestamptz NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'pending',
            file_url text,
            file_size integer,
            format varchar(10) NOT NULL,
            template_id integer,
            generated_at timestamptz,
            error_message text,
            metadata jsonb,
            idempotency_key varchar(128),
            version bigint NOT NULL DEFAULT 0,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT lp_reports_idempotency_unique UNIQUE (idempotency_key),
            CONSTRAINT lp_reports_report_type_check
              CHECK (report_type IN ('quarterly', 'annual', 'tax_package', 'capital_account')),
            CONSTRAINT lp_reports_status_check
              CHECK (status IN ('pending', 'generating', 'ready', 'error')),
            CONSTRAINT lp_reports_format_check
              CHECK (format IN ('pdf', 'xlsx', 'csv'))
          );
        `.trim(),
      },
      {
        label: 'Index lp_reports lp_id',
        statement: 'CREATE INDEX IF NOT EXISTS lp_reports_lp_id_idx ON lp_reports (lp_id);',
      },
      {
        label: 'Index lp_reports status',
        statement: 'CREATE INDEX IF NOT EXISTS lp_reports_status_idx ON lp_reports (status);',
      },
      {
        label: 'Index lp_reports created_at',
        statement:
          'CREATE INDEX IF NOT EXISTS lp_reports_created_at_idx ON lp_reports (created_at DESC);',
      },
    ],
    down: [
      {
        label: 'Drop lp_reports table',
        statement: 'DROP TABLE IF EXISTS lp_reports CASCADE;',
      },
    ],
  },
];

function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function listLpTableNames(): string[] {
  return [
    'limited_partners',
    'lp_fund_commitments',
    'capital_activities',
    'lp_distributions',
    'lp_capital_accounts',
    'lp_performance_snapshots',
    'lp_reports',
    'report_templates',
  ];
}

function assertDatabaseConfigured(): void {
  const databaseUrl = process.env['DATABASE_URL'] || process.env['NEON_DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL or NEON_DATABASE_URL is required for LP migrations.');
  }
  if (databaseUrl.includes('mock')) {
    throw new Error('DATABASE_URL points to a mock database. Set a real database URL.');
  }
}

function validateMigrationDefinitions(list: Migration[]): void {
  if (list.length === 0) {
    throw new Error('No LP migrations defined.');
  }

  const idSet = new Set<string>();
  const orderSet = new Set<number>();

  list.forEach((migration, index) => {
    if (idSet.has(migration.id)) {
      throw new Error(`Duplicate migration id detected: ${migration.id}`);
    }
    if (orderSet.has(migration.order)) {
      throw new Error(`Duplicate migration order detected: ${migration.order}`);
    }
    if (migration.order !== index + 1) {
      throw new Error(
        `Migration order mismatch at ${migration.id}. Expected ${index + 1}, got ${migration.order}.`
      );
    }
    idSet.add(migration.id);
    orderSet.add(migration.order);
  });
}

async function hasMigrationTable(): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${MIGRATION_TABLE}
      LIMIT 1
    `);
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

async function ensureMigrationTable(dryRun: boolean): Promise<void> {
  if (dryRun) {
    return;
  }
  await db.execute(
    sql.raw(`
      CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
        id text PRIMARY KEY,
        name text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `)
  );
}

async function loadAppliedMigrations(): Promise<string[]> {
  const exists = await hasMigrationTable();
  if (!exists) {
    return [];
  }

  try {
    const result = await db.execute(
      sql.raw(`SELECT id FROM ${MIGRATION_TABLE} ORDER BY applied_at ASC`)
    );
    return result.rows.map((row) => String((row as Record<string, string>).id));
  } catch {
    return [];
  }
}

function validateAppliedMigrations(list: Migration[], applied: string[]): void {
  const knownIds = new Set(list.map((migration) => migration.id));
  const appliedSet = new Set<string>();
  const duplicates = new Set<string>();

  applied.forEach((id) => {
    if (appliedSet.has(id)) {
      duplicates.add(id);
    }
    appliedSet.add(id);
  });

  if (duplicates.size > 0) {
    throw new Error(
      `Duplicate migration IDs detected in ${MIGRATION_TABLE}: ${Array.from(duplicates).join(', ')}`
    );
  }

  const unknown = applied.filter((id) => !knownIds.has(id));
  if (unknown.length > 0) {
    throw new Error(`Unknown migrations present in ${MIGRATION_TABLE}: ${unknown.join(', ')}`);
  }

  const orderById = new Map(list.map((migration) => [migration.id, migration.order]));
  const appliedOrders = applied.map((id) => orderById.get(id) ?? 0);
  for (let index = 1; index < appliedOrders.length; index += 1) {
    if (appliedOrders[index] < appliedOrders[index - 1]) {
      throw new Error('Applied LP migrations are out of order.');
    }
  }

  let gapFound = false;
  for (const migration of list) {
    if (appliedSet.has(migration.id)) {
      if (gapFound) {
        throw new Error(
          `Migration sequence invalid. ${migration.id} applied after a missing migration.`
        );
      }
    } else {
      gapFound = true;
    }
  }
}

async function runStatements(statements: MigrationStatement[], dryRun: boolean): Promise<void> {
  for (const step of statements) {
    if (dryRun) {
      console.log(`[dry-run] ${step.label}`);
      console.log(step.statement);
      continue;
    }

    console.log(`- ${step.label}`);
    await db.execute(sql.raw(step.statement));
  }
}

async function recordMigration(migration: Migration, dryRun: boolean): Promise<void> {
  if (dryRun) {
    return;
  }
  const id = escapeLiteral(migration.id);
  const name = escapeLiteral(migration.name);
  await db.execute(
    sql.raw(
      `INSERT INTO ${MIGRATION_TABLE} (id, name) VALUES ('${id}', '${name}') ON CONFLICT (id) DO NOTHING`
    )
  );
}

async function removeMigrationRecord(migration: Migration, dryRun: boolean): Promise<void> {
  if (dryRun) {
    return;
  }
  const id = escapeLiteral(migration.id);
  await db.execute(sql.raw(`DELETE FROM ${MIGRATION_TABLE} WHERE id = '${id}'`));
}

async function ensurePrerequisites(): Promise<void> {
  const requiredTables = ['funds'];

  for (const tableName of requiredTables) {
    try {
      const result = await db.execute(sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ${tableName}
        LIMIT 1
      `);

      if (result.rows.length === 0) {
        throw new Error(
          `Required table "${tableName}" is missing. Run core migrations before LP migrations.`
        );
      }
    } catch (error) {
      throw new Error(
        `Prerequisite check failed for ${tableName}: ${formatError(error)}`
      );
    }
  }
}

export async function migrateLpTables(options: { dryRun?: boolean } = {}): Promise<void> {
  const dryRun = options.dryRun ?? false;

  validateMigrationDefinitions(migrations);
  await ensurePrerequisites();
  await ensureMigrationTable(dryRun);

  const applied = await loadAppliedMigrations();
  validateAppliedMigrations(migrations, applied);

  const appliedSet = new Set(applied);
  const pending = migrations.filter((migration) => !appliedSet.has(migration.id));

  console.log(`LP schema tables: ${listLpTableNames().join(', ')}`);

  if (pending.length === 0) {
    console.log('No LP migrations to apply.');
    return;
  }

  for (const migration of pending) {
    console.log(`\nApplying migration ${migration.id}: ${migration.name}`);

    try {
      await runStatements(migration.up, dryRun);
      await recordMigration(migration, dryRun);
      console.log(`Migration ${migration.id} complete.`);
    } catch (error) {
      console.error(`Migration ${migration.id} failed: ${formatError(error)}`);
      throw error;
    }
  }
}

export async function rollbackLpTables(options: { dryRun?: boolean; toId?: string } = {}): Promise<void> {
  const dryRun = options.dryRun ?? false;
  const targetId = options.toId;

  validateMigrationDefinitions(migrations);

  const applied = await loadAppliedMigrations();
  if (applied.length === 0) {
    console.log('No LP migrations applied.');
    return;
  }

  validateAppliedMigrations(migrations, applied);
  const appliedSet = new Set(applied);

  let targetOrder = 0;
  if (targetId) {
    const target = migrations.find((migration) => migration.id === targetId);
    if (!target) {
      throw new Error(`Unknown migration id for rollback target: ${targetId}`);
    }
    targetOrder = target.order;
  }

  const toRollback = migrations
    .filter((migration) => appliedSet.has(migration.id) && migration.order > targetOrder)
    .reverse();

  if (toRollback.length === 0) {
    console.log('No LP migrations to rollback.');
    return;
  }

  console.log(`Rolling back LP migrations: ${toRollback.map((m) => m.id).join(', ')}`);

  for (const migration of toRollback) {
    console.log(`\nRolling back migration ${migration.id}: ${migration.name}`);

    try {
      await runStatements(migration.down, dryRun);
      await removeMigrationRecord(migration, dryRun);
      console.log(`Rollback ${migration.id} complete.`);
    } catch (error) {
      console.error(`Rollback ${migration.id} failed: ${formatError(error)}`);
      throw error;
    }
  }
}

function parseArgs(argv: string[]) {
  const dryRun = argv.includes('--dry-run') || argv.includes('--dry');
  const rollback = argv.includes('--rollback');
  const toArg = argv.find((arg) => arg.startsWith('--to='));
  const toId = toArg ? toArg.split('=')[1] : undefined;
  const help = argv.includes('--help') || argv.includes('-h');

  return { dryRun, rollback, toId, help };
}

function printUsage(): void {
  console.log(`
LP Reporting migration runner

Usage:
  npx tsx scripts/migrate-lp-tables.ts [--dry-run]
  npx tsx scripts/migrate-lp-tables.ts --rollback [--to=<migration-id>] [--dry-run]

Options:
  --dry-run   Print SQL without executing
  --rollback  Roll back LP migrations (default: all applied)
  --to=ID     Roll back to a specific migration ID
  --help      Show this help message
`.trim());
}

async function closeDatabase(): Promise<void> {
  try {
    // Note: db connection closing is handled by the connection pool
    // No explicit close needed for Drizzle ORM
  } catch {
    // Silently handle closing errors
  }
}

async function main(): Promise<void> {
  const { dryRun, rollback, toId, help } = parseArgs(process.argv.slice(2));

  if (help) {
    printUsage();
    return;
  }

  assertDatabaseConfigured();

  try {
    if (rollback) {
      await rollbackLpTables({ dryRun, toId });
    } else {
      await migrateLpTables({ dryRun });
    }
  } finally {
    await closeDatabase();
  }
}

main().catch((error) => {
  console.error(`LP migration runner failed: ${formatError(error)}`);
  process.exitCode = 1;
});
