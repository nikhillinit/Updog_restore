import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { pushSchema } from 'drizzle-kit/api';
import { drizzle } from 'drizzle-orm/node-postgres';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgIdentifier } from '../../scripts/db-push-core.mjs';
import { loadManifests } from '../../scripts/reconcile-prod-schema.mjs';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const STARTUP_TIMEOUT_MS = 90_000;
const skipIfNoDocker = !process.env.CI && process.platform === 'win32';

let postgres: StartedPostgreSqlContainer | undefined;
let pool: Pool | undefined;
let shapePool: Pool | undefined;

const SHAPE_DATABASE = 'shape_db';
const C1_MOUNTED_TABLES = [
  'cohort_definitions',
  'sector_taxonomy',
  'sector_mappings',
  'company_overrides',
  'investment_overrides',
  'reconciliation_runs',
  'fund_calculation_modes',
  'tasks',
  'vehicles',
  'cash_flow_events',
  'valuation_marks',
  'lp_metric_runs',
  'evidence_records',
  'narrative_runs',
  'lp_report_packages',
  'lp_report_package_exports',
] as const;
const SHAPE_ONLY_NOT_JOURNALED = [
  'investment_rounds',
  'investment_round_model_overrides',
  'flag_changes',
  'flags_state',
  'reserve_approvals',
  'approval_partners',
  'approval_signatures',
  'approval_audit_log',
] as const;
const PROCEDURAL_MIGRATIONS = [
  '0001_create_job_outbox.sql',
  '0002_create_scenario_matrices.sql',
  '0003_create_optimization_sessions.sql',
  '0004_variance_alert_automation.sql',
  '0005_backtest_scenario_comparison_summary.sql',
] as const;
const EXPECTED_PROCEDURES = [
  'update_job_outbox_updated_at',
  'update_scenario_matrices_updated_at',
  'update_optimization_sessions_updated_at',
] as const;
const EXPECTED_TRIGGERS = [
  'job_outbox_updated_at',
  'scenario_matrices_updated_at',
  'optimization_sessions_updated_at',
] as const;

type TableShapeMap<TShape> = Map<string, Map<string, TShape>>;

interface ColumnShape {
  typ: string;
  notnull: boolean;
}

interface ConstraintShape {
  contype: string;
  reftable: string;
  confupdtype: string;
  confdeltype: string;
}

interface IndexShape {
  uniq: boolean;
  predicate: string | null;
}

interface CatalogSnapshot {
  tables: Set<string>;
  columns: TableShapeMap<ColumnShape>;
  constraints: TableShapeMap<ConstraintShape>;
  indexes: TableShapeMap<IndexShape>;
}

interface CatalogDefinitions {
  constraints: Array<{ tbl: string; conname: string; def: string }>;
  indexes: Array<{ tbl: string; idxname: string; def: string }>;
}

function normalizeIdentifier(value: string): string {
  return value.toLowerCase();
}

function normalizeCatalogText(value: string | null): string | null {
  return value === null ? null : value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function setTableShape<TShape>(
  collection: TableShapeMap<TShape>,
  tableName: string,
  shapeName: string,
  shape: TShape
): void {
  const tableShapes = collection.get(tableName) ?? new Map<string, TShape>();
  tableShapes.set(shapeName, shape);
  collection.set(tableName, tableShapes);
}

function shapeToText<TShape>(shape: TShape): string {
  return JSON.stringify(shape);
}

function compareNamedShapes<TShape>(
  mismatches: string[],
  tableName: string,
  shapeKind: string,
  journalShapes: Map<string, TShape> | undefined,
  pushedShapes: Map<string, TShape> | undefined
): void {
  const journalEntries = journalShapes ?? new Map<string, TShape>();
  const pushedEntries = pushedShapes ?? new Map<string, TShape>();

  for (const [shapeName, journalShape] of journalEntries) {
    const pushedShape = pushedEntries.get(shapeName);
    if (!pushedShape) {
      mismatches.push(`DB-B missing ${shapeKind} ${tableName}.${shapeName}`);
      continue;
    }

    if (shapeToText(journalShape) !== shapeToText(pushedShape)) {
      mismatches.push(
        `${shapeKind} ${tableName}.${shapeName} differs: DB-A=${shapeToText(
          journalShape
        )} DB-B=${shapeToText(pushedShape)}`
      );
    }
  }

  for (const shapeName of pushedEntries.keys()) {
    if (!journalEntries.has(shapeName)) {
      mismatches.push(`DB-A missing ${shapeKind} ${tableName}.${shapeName}`);
    }
  }
}

function connectionUriForDatabase(databaseName: string): string {
  if (!postgres) {
    throw new Error('Postgres container has not started');
  }

  const url = new URL(postgres.getConnectionUri());
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function introspectCatalog(activePool: Pool): Promise<CatalogSnapshot> {
  const tablesResult = await activePool.query<{ relname: string }>(`
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname <> 'drizzle_migrations'
  `);
  const columnsResult = await activePool.query<{
    tbl: string;
    col: string;
    typ: string;
    notnull: boolean;
  }>(`
    SELECT c.relname tbl, a.attname col, format_type(a.atttypid, a.atttypmod) typ, a.attnotnull notnull
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND c.relname <> 'drizzle_migrations'
  `);
  const constraintsResult = await activePool.query<{
    conname: string;
    contype: string;
    tbl: string;
    reftable: string;
    confupdtype: string;
    confdeltype: string;
  }>(`
    SELECT con.conname, con.contype, c.relname tbl, confrelid::regclass::text reftable, con.confupdtype, con.confdeltype
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = con.connamespace
    WHERE n.nspname = 'public'
      AND c.relname <> 'drizzle_migrations'
  `);
  const indexesResult = await activePool.query<{
    idxname: string;
    uniq: boolean;
    predicate: string | null;
    tbl: string;
  }>(`
    SELECT i.relname idxname, ix.indisunique uniq, pg_get_expr(ix.indpred, ix.indrelid) predicate, c.relname tbl
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class c ON c.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname <> 'drizzle_migrations'
  `);

  const columns: TableShapeMap<ColumnShape> = new Map();
  const constraints: TableShapeMap<ConstraintShape> = new Map();
  const indexes: TableShapeMap<IndexShape> = new Map();

  for (const row of columnsResult.rows) {
    setTableShape(columns, normalizeIdentifier(row.tbl), normalizeIdentifier(row.col), {
      typ: normalizeCatalogText(row.typ) ?? '',
      notnull: row.notnull,
    });
  }

  for (const row of constraintsResult.rows) {
    setTableShape(constraints, normalizeIdentifier(row.tbl), normalizeIdentifier(row.conname), {
      contype: normalizeCatalogText(row.contype) ?? '',
      reftable: normalizeCatalogText(row.reftable) ?? '',
      confupdtype: normalizeCatalogText(row.confupdtype) ?? '',
      confdeltype: normalizeCatalogText(row.confdeltype) ?? '',
    });
  }

  for (const row of indexesResult.rows) {
    setTableShape(indexes, normalizeIdentifier(row.tbl), normalizeIdentifier(row.idxname), {
      uniq: row.uniq,
      predicate: normalizeCatalogText(row.predicate),
    });
  }

  return {
    tables: new Set(tablesResult.rows.map((row) => normalizeIdentifier(row.relname))),
    columns,
    constraints,
    indexes,
  };
}

async function catalogDefinitions(activePool: Pool): Promise<CatalogDefinitions> {
  const constraintsResult = await activePool.query<{ tbl: string; conname: string; def: string }>(`
    SELECT c.relname tbl, con.conname, pg_get_constraintdef(con.oid) def
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = con.connamespace
    WHERE n.nspname = 'public'
      AND c.relname <> 'drizzle_migrations'
    ORDER BY c.relname, con.conname
  `);
  const indexesResult = await activePool.query<{ tbl: string; idxname: string; def: string }>(`
    SELECT c.relname tbl, i.relname idxname, pg_get_indexdef(i.oid) def
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class c ON c.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname <> 'drizzle_migrations'
    ORDER BY c.relname, i.relname
  `);

  return {
    constraints: constraintsResult.rows,
    indexes: indexesResult.rows,
  };
}

function compareIntersectionShape(
  journalCatalog: CatalogSnapshot,
  pushedCatalog: CatalogSnapshot
): string[] {
  const mismatches: string[] = [];
  const intersectionTables = [...journalCatalog.tables]
    .filter((tableName) => pushedCatalog.tables.has(tableName))
    .sort();

  for (const tableName of intersectionTables) {
    compareNamedShapes(
      mismatches,
      tableName,
      'column',
      journalCatalog.columns.get(tableName),
      pushedCatalog.columns.get(tableName)
    );
    compareNamedShapes(
      mismatches,
      tableName,
      'constraint',
      journalCatalog.constraints.get(tableName),
      pushedCatalog.constraints.get(tableName)
    );
    compareNamedShapes(
      mismatches,
      tableName,
      'index',
      journalCatalog.indexes.get(tableName),
      pushedCatalog.indexes.get(tableName)
    );
  }

  return mismatches;
}

async function applyProceduralMigrations(activePool: Pool): Promise<void> {
  for (const migration of PROCEDURAL_MIGRATIONS) {
    const sql = await readFile(path.join(process.cwd(), 'shared', 'migrations', migration), 'utf8');
    await activePool.query(sql);
  }
}

async function publicProcedureNames(activePool: Pool, procedureNames: readonly string[]) {
  const result = await activePool.query<{ proname: string }>(
    `
      SELECT p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = ANY($1::text[])
    `,
    [procedureNames]
  );

  return new Set(result.rows.map((row) => row.proname));
}

async function publicTriggerNames(activePool: Pool, triggerNames: readonly string[]) {
  const result = await activePool.query<{ tgname: string }>(
    `
      SELECT t.tgname
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND NOT t.tgisinternal
        AND t.tgname = ANY($1::text[])
    `,
    [triggerNames]
  );

  return new Set(result.rows.map((row) => row.tgname));
}

async function publicTables(activePool: Pool, tableNames: readonly string[]) {
  const result = await activePool.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name = ANY($1::text[])
    `,
    [tableNames]
  );

  return new Set(result.rows.map((row) => row.table_name));
}

async function publicConstraints(activePool: Pool, constraintNames: readonly string[]) {
  const result = await activePool.query<{ conname: string }>(
    `
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public'
        AND c.conname = ANY($1::text[])
    `,
    [constraintNames]
  );

  return new Set(result.rows.map((row) => row.conname));
}

describe.skipIf(skipIfNoDocker)('prod schema synthetic clone', () => {
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
  }, STARTUP_TIMEOUT_MS * 2);

  afterAll(async () => {
    await shapePool?.end();
    if (pool) {
      try {
        await pool.query(`DROP DATABASE IF EXISTS ${SHAPE_DATABASE}`);
      } catch (error) {
        console.warn('[prod-schema-clone] Failed to drop shape database', error);
      }
    }
    await pool?.end();
    if (process.env.CI === 'true') {
      console.warn(
        '[prod-schema-clone] Postgres container left for CI cleanup after pg pool close'
      );
      return;
    }
    await postgres?.stop();
  });

  it('applies the PR-1 manifest tables and FK sentinels to an empty clone', async () => {
    expect(pool).toBeDefined();
    const manifests = await loadManifests();
    const expectedTables = manifests.flatMap((manifest) =>
      (manifest.expectedTables ?? []).map((table: { name: string }) => table.name)
    );
    const expectedConstraints = manifests
      .flatMap((manifest) =>
        (manifest.expectedTables ?? []).flatMap(
          (table: { constraints?: string[] }) => table.constraints ?? []
        )
      )
      .map(pgIdentifier);

    expect(expectedTables).toHaveLength(16);

    const migratedTables = await publicTables(pool!, expectedTables);
    const migratedConstraints = await publicConstraints(pool!, expectedConstraints);

    expect(expectedTables.filter((tableName) => !migratedTables.has(tableName))).toEqual([]);
    expect(
      expectedConstraints.filter((constraintName) => !migratedConstraints.has(constraintName))
    ).toEqual([]);
  });

  it('proves journal-built DB-A shape matches drizzle push DB-B where schemas overlap', async () => {
    expect(pool).toBeDefined();

    await pool!.query(`CREATE DATABASE ${SHAPE_DATABASE}`);
    shapePool = new Pool({ connectionString: connectionUriForDatabase(SHAPE_DATABASE), max: 1 });
    await shapePool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    const shapeDb = drizzle(shapePool);
    const schema = {
      ...(await import('../../shared/schema')),
      ...(await import('../../shared/schema-lp-reporting')),
      ...(await import('../../shared/schema-lp-sprint3')),
    };
    const { apply } = await pushSchema(schema, shapeDb);
    await apply();

    const journalCatalog = await introspectCatalog(pool!);
    const pushedCatalog = await introspectCatalog(shapePool);
    const missingC1Tables = C1_MOUNTED_TABLES.filter(
      (tableName) => !journalCatalog.tables.has(tableName)
    );
    const journalOnlyTables = [...journalCatalog.tables]
      .filter((tableName) => !pushedCatalog.tables.has(tableName))
      .sort();
    const shapeOnlyTables = [...pushedCatalog.tables]
      .filter((tableName) => !journalCatalog.tables.has(tableName))
      .sort();
    const shapeOnlyBaseline = new Set<string>(SHAPE_ONLY_NOT_JOURNALED);
    const shapeMismatches = compareIntersectionShape(journalCatalog, pushedCatalog);

    // eslint-disable-next-line no-console -- D4 requires non-gating CI diagnostics.
    console.log('[prod-schema-clone] shape-only tables', shapeOnlyTables);
    // eslint-disable-next-line no-console -- D4 requires non-gating CI diagnostics.
    console.log('[prod-schema-clone] DB-A catalog definitions', await catalogDefinitions(pool!));
    // eslint-disable-next-line no-console -- D4 requires non-gating CI diagnostics.
    console.log(
      '[prod-schema-clone] DB-B catalog definitions',
      await catalogDefinitions(shapePool)
    );

    expect(missingC1Tables).toEqual([]);
    expect(shapeMismatches).toEqual([]);
    expect(journalOnlyTables).toEqual([]);
    expect(shapeOnlyTables.filter((tableName) => !shapeOnlyBaseline.has(tableName))).toEqual([]);

    await applyProceduralMigrations(pool!);
    const procedureNames = await publicProcedureNames(pool!, EXPECTED_PROCEDURES);
    const triggerNames = await publicTriggerNames(pool!, EXPECTED_TRIGGERS);

    expect(
      EXPECTED_PROCEDURES.filter((procedureName) => !procedureNames.has(procedureName))
    ).toEqual([]);
    expect(EXPECTED_TRIGGERS.filter((triggerName) => !triggerNames.has(triggerName))).toEqual([]);
  });
});
