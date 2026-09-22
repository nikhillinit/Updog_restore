/** PostgreSQL replay and semantic-drift proof for migration 0060. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Pool, escapeIdentifier } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../../helpers/testcontainers';
import { exercisePostgresReplayDriftScenario } from '../../helpers/postgres-replay-drift';
import {
  getMigrationStateFromConnectionString,
  runMigrationsWithConnectionString,
} from '../../helpers/testcontainers-migration';

const PREVIOUS_MIGRATION = '0059_task_update_commands';
const MIGRATION = '0060_fund_workflow_commands';
const MIGRATION_FILE = path.join(process.cwd(), 'migrations', `${MIGRATION}.sql`);
const skipIfNoDocker =
  !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';

let adminPool: Pool | undefined;
let migrationSql = '';
let databaseCounter = 0;
let startedTestContainers = false;
const createdDatabases: string[] = [];

interface CatalogSnapshot {
  draftColumn: Array<Record<string, unknown>>;
  draftConstraint: Array<Record<string, unknown>>;
  relation: Array<Record<string, unknown>>;
  columns: Array<Record<string, unknown>>;
  constraints: Array<Record<string, unknown>>;
  indexes: Array<Record<string, unknown>>;
  sequences: Array<Record<string, unknown>>;
  triggers: Array<Record<string, unknown>>;
  functions: Array<Record<string, unknown>>;
  rows: Array<Record<string, unknown>>;
}

describe.skipIf(skipIfNoDocker)('fund workflow commands migration PostgreSQL proof', () => {
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      await setupTestContainers();
      startedTestContainers = true;
    }
    adminPool = new Pool({ connectionString: postgresConnectionString(), max: 1 });
    migrationSql = await readFile(MIGRATION_FILE, 'utf8');
  }, 120_000);

  afterAll(async () => {
    if (adminPool) {
      for (const databaseName of createdDatabases.reverse()) {
        await adminPool.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(databaseName)}`);
      }
      await adminPool.end();
    }
    if (startedTestContainers) await cleanupTestContainers();
  });

  it.each([
    {
      name: 'wholly absent catalog applies',
      seed: async () => undefined,
      outcome: 'applies' as const,
    },
    {
      name: 'canonical raw catalog replays and preserves receipts',
      seed: async (pool: Pool) => {
        await pool.query(migrationSql);
        await seedReceipt(pool);
      },
      outcome: 'applies' as const,
      assertAfterApply: async (catalog: CatalogSnapshot) => {
        expect(catalog.rows).toHaveLength(1);
        expect(catalog.rows[0]?.idempotency_key).toBe('00000000-0000-4000-8000-000000000060');
      },
    },
    {
      name: 'partial draft revision surface refuses',
      seed: (pool: Pool) => pool.query('ALTER TABLE fundconfigs ADD COLUMN draft_revision bigint'),
      outcome: 'refuses' as const,
    },
    {
      name: 'wrong relation kind refuses',
      seed: (pool: Pool) => pool.query('CREATE VIEW fund_workflow_commands AS SELECT 1 AS id'),
      outcome: 'refuses' as const,
    },
    drift('column default', 'ALTER TABLE fund_workflow_commands ALTER COLUMN created_at DROP DEFAULT'),
    drift(
      'column collation',
      `CREATE COLLATION workflow_contract_collation
         (provider = icu, locale = 'und-u-ks-level2', deterministic = false);
       ALTER TABLE fund_workflow_commands ALTER COLUMN contract_version
         TYPE text COLLATE workflow_contract_collation`
    ),
    drift('unexpected column', 'ALTER TABLE fund_workflow_commands ADD COLUMN unexpected text'),
    drift('serial sequence ownership', 'ALTER SEQUENCE fund_workflow_commands_id_seq OWNED BY NONE'),
    drift('permanent table persistence', 'ALTER TABLE fund_workflow_commands SET UNLOGGED'),
    drift('permanent sequence persistence', 'ALTER SEQUENCE fund_workflow_commands_id_seq SET UNLOGGED'),
    drift(
      'foreign key delete action',
      `ALTER TABLE fund_workflow_commands DROP CONSTRAINT fund_workflow_commands_fund_id_fkey;
       ALTER TABLE fund_workflow_commands ADD CONSTRAINT fund_workflow_commands_fund_id_fkey
       FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE RESTRICT`
    ),
    drift(
      'index definition',
      `DROP INDEX fund_workflow_commands_fund_idx;
       CREATE INDEX fund_workflow_commands_fund_idx ON fund_workflow_commands(config_id)`
    ),
    drift(
      'index validity',
      `SET allow_system_table_mods = on;
       UPDATE pg_index SET indisvalid = false
       WHERE indexrelid = 'public.fund_workflow_commands_fund_idx'::regclass`
    ),
    drift('trigger enabled state', 'ALTER TABLE fund_workflow_commands DISABLE TRIGGER fund_workflow_commands_forbid_update_trigger'),
    drift(
      'trigger function',
      `CREATE FUNCTION reject_workflow_update() RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN RAISE EXCEPTION 'wrong trigger'; END; $$;
       DROP TRIGGER fund_workflow_commands_forbid_update_trigger ON fund_workflow_commands;
       CREATE TRIGGER fund_workflow_commands_forbid_update_trigger BEFORE UPDATE ON fund_workflow_commands
       FOR EACH ROW EXECUTE FUNCTION reject_workflow_update()`
    ),
    {
      name: 'same OID dependency function body',
      seed: async (pool: Pool) => {
        await pool.query(migrationSql);
        await seedReceipt(pool);
        await pool.query(`CREATE OR REPLACE FUNCTION public.internal_economics_forbid_update()
          RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$`);
      },
      outcome: 'refuses' as const,
    },
    drift('unexpected constraint', 'ALTER TABLE fund_workflow_commands ADD CONSTRAINT unexpected_check CHECK (response_status > 0)'),
    drift('draft revision default', 'ALTER TABLE fundconfigs ALTER COLUMN draft_revision SET DEFAULT 2'),
  ])('$name', async (scenario) => {
    await exercisePostgresReplayDriftScenario<CatalogSnapshot, Array<Record<string, unknown>>>({
      scenario: {
        ...scenario,
        expectedError: /fund_workflow_commands_(?:partial_catalog_state|semantic_drift)/,
      },
      createDatabase,
      withPool,
      captureCatalog,
      captureLedger,
      runMigration: (connectionString) =>
        runMigrationsWithConnectionString(connectionString, MIGRATION),
      assertApplied: async (pool, connectionString) => {
        const state = await getMigrationStateFromConnectionString(connectionString);
        expect(state.applied.map((entry) => entry.name)).toContain(MIGRATION);
        const catalog = await captureCatalog(pool);
        expect(catalog.columns).toHaveLength(13);
        expect(catalog.constraints).toHaveLength(10);
        expect(catalog.indexes).toHaveLength(3);
        expect(catalog.sequences).toHaveLength(1);
        expect(catalog.triggers).toHaveLength(1);
      },
      assertRefused: async (_pool, connectionString) => {
        const state = await getMigrationStateFromConnectionString(connectionString);
        expect(state.applied.map((entry) => entry.name)).not.toContain(MIGRATION);
      },
    });
  }, 180_000);
});

function drift(name: string, mutation: string) {
  return {
    name,
    seed: async (pool: Pool) => {
      await pool.query(migrationSql);
      await pool.query(mutation);
    },
    outcome: 'refuses' as const,
  };
}

async function seedReceipt(pool: Pool): Promise<void> {
  const user = await pool.query<{ id: number }>(
    `INSERT INTO users (username, password, role)
     VALUES ('workflow-replay-user', 'test-only-password', 'admin') RETURNING id`
  );
  const fund = await pool.query<{ id: number }>(
    `INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
     VALUES ('0060 replay fund', 10000000, '0.0200', '0.2000', 2026) RETURNING id`
  );
  const config = await pool.query<{ id: number }>(
    `INSERT INTO fundconfigs (fund_id, version, config, is_draft, is_published)
     VALUES ($1, 1, '{}'::jsonb, true, false) RETURNING id`,
    [fund.rows[0]!.id]
  );
  await pool.query(
    `INSERT INTO fund_workflow_commands (
       actor_user_id, operation, idempotency_key, request_hash, contract_version,
       response_status, response_body, result_etag, fund_id, config_id
     ) VALUES ($1, 'create', '00000000-0000-4000-8000-000000000060', $2, 'v1', 201,
       '{"ok":true}'::jsonb, '"0123456789abcdef"', $3, $4)`,
    [user.rows[0]!.id, '0'.repeat(64), fund.rows[0]!.id, config.rows[0]!.id]
  );
}

async function captureCatalog(pool: Pool): Promise<CatalogSnapshot> {
  const relation = await pool.query<Record<string, unknown>>(`
    SELECT n.nspname AS schema_name, c.relname, c.relkind, c.relpersistence
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE (n.nspname = 'public' AND c.relname IN (
      'fund_workflow_commands', 'fund_workflow_commands_id_seq',
      'fund_workflow_commands_fund_idx', 'fund_workflow_commands_identity_unique',
      'fund_workflow_commands_pkey'
    )) ORDER BY n.nspname, c.relname
  `);
  const draftColumn = await pool.query<Record<string, unknown>>(`
    SELECT data_type, udt_name, is_nullable, column_default, is_identity, is_generated
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='fundconfigs' AND column_name='draft_revision'
  `);
  const draftConstraint = await pool.query<Record<string, unknown>>(`
    SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid='public.fundconfigs'::regclass AND conname='fundconfigs_draft_revision_positive'
  `);
  const functions = await pool.query<Record<string, unknown>>(`
    SELECT n.nspname AS schema_name, p.proname,
      pg_get_function_identity_arguments(p.oid) AS identity_arguments,
      l.lanname AS language, p.prorettype::regtype::text AS return_type, p.prosrc
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname='public' AND p.proname='internal_economics_forbid_update'
    ORDER BY identity_arguments
  `);
  const exists = relation.rows.some((row) => row.relname === 'fund_workflow_commands' && row.relkind === 'r');
  if (!exists) {
    return {
      draftColumn: draftColumn.rows,
      draftConstraint: draftConstraint.rows,
      relation: relation.rows,
      columns: [], constraints: [], indexes: [], sequences: [], triggers: [],
      functions: functions.rows, rows: [],
    };
  }
  const [columns, constraints, indexes, sequences, triggers, rows] = await Promise.all([
    pool.query<Record<string, unknown>>(`SELECT column_name, data_type, udt_name, is_nullable,
      character_maximum_length, column_default, is_identity, is_generated, collation_name
      FROM information_schema.columns WHERE table_schema='public' AND table_name='fund_workflow_commands'
      ORDER BY ordinal_position`),
    pool.query<Record<string, unknown>>(`SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid='public.fund_workflow_commands'::regclass ORDER BY conname`),
    pool.query<Record<string, unknown>>(`SELECT index_relation.relname AS indexname,
      pg_get_indexdef(index_catalog.indexrelid) AS indexdef,
      index_catalog.indisvalid, index_catalog.indisready, index_catalog.indislive
      FROM pg_index index_catalog
      JOIN pg_class index_relation ON index_relation.oid=index_catalog.indexrelid
      WHERE index_catalog.indrelid='public.fund_workflow_commands'::regclass
      ORDER BY index_relation.relname`),
    pool.query<Record<string, unknown>>(`SELECT sequencename, data_type, start_value, min_value,
      max_value, increment_by, cycle FROM pg_sequences
      WHERE schemaname='public' AND sequencename='fund_workflow_commands_id_seq'`),
    pool.query<Record<string, unknown>>(`SELECT tgname, tgenabled, tgfoid::regprocedure::text AS function,
      pg_get_triggerdef(oid) AS definition FROM pg_trigger
      WHERE tgrelid='public.fund_workflow_commands'::regclass AND NOT tgisinternal ORDER BY tgname`),
    pool.query<Record<string, unknown>>('SELECT * FROM fund_workflow_commands ORDER BY id'),
  ]);
  return {
    draftColumn: draftColumn.rows,
    draftConstraint: draftConstraint.rows,
    relation: relation.rows,
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
    sequences: sequences.rows,
    triggers: triggers.rows,
    functions: functions.rows,
    rows: rows.rows,
  };
}

async function captureLedger(pool: Pool): Promise<Array<Record<string, unknown>>> {
  return (await pool.query('SELECT hash, created_at::text FROM drizzle_migrations ORDER BY created_at, hash')).rows;
}

async function createDatabase(suffix: string): Promise<{ connectionString: string }> {
  if (!adminPool) throw new Error('Admin pool not initialized');
  databaseCounter += 1;
  const normalized = suffix.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_').slice(0, 24);
  const databaseName = `workflow_0060_${normalized}_${process.pid}_${databaseCounter}`;
  createdDatabases.push(databaseName);
  await adminPool.query(`CREATE DATABASE ${escapeIdentifier(databaseName)}`);
  const connectionString = databaseConnectionString(databaseName);
  await runMigrationsWithConnectionString(connectionString, PREVIOUS_MIGRATION);
  return { connectionString };
}

async function withPool<T>(connectionString: string, callback: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString, max: 4 });
  try {
    return await callback(pool);
  } finally {
    await pool.end();
  }
}

function postgresConnectionString(): string {
  return process.env.TEST_DATABASE_URL ?? getPostgresConnectionString();
}

function databaseConnectionString(databaseName: string): string {
  const url = new URL(postgresConnectionString());
  url.pathname = `/${databaseName}`;
  return url.toString();
}
