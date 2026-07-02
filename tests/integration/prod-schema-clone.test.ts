import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { pushSchema } from 'drizzle-kit/api';
import { drizzle } from 'drizzle-orm/node-postgres';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgIdentifier } from '../../scripts/db-push-core.mjs';
import { loadManifests } from '../../scripts/reconcile-prod-schema.mjs';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const STARTUP_TIMEOUT_MS = 90_000;
const skipIfNoDocker = !process.env.CI && process.platform === 'win32';
const execFileAsync = promisify(execFile);

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
  'planning_fmv_override_requests',
] as const;
const SHAPE_ONLY_NOT_JOURNALED = [
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
const KNOWN_INTERSECTION_DRIFT = new Set<string>([
  // Deferred to PR-1/operator (NOT additive journal catch-up): these three are a global->scoped
  // idempotency rename — journal 0001_certain_miracleman created UNIQUE(idempotency_key) alone;
  // shared/schema now declares the scoped *_idem_key_idx (added by 0024). Reconciling the old name
  // means a DROP that implicates prod, so it ships with the FK-name seam in PR-1/operator scope.
  'forecast_snapshots|index|forecast_snapshots_idempotency_unique_idx',
  'investment_lots|index|investment_lots_idempotency_unique_idx',
  'reserve_allocations|index|reserve_allocations_idempotency_unique_idx',
  // §7 (run 28437747790) CONFIRMED these as still-observed = REAL drift, not stale. Deferred to
  // PR-1/operator; do NOT shrink without a fresh §7 baselineNotObserved signal.
  // NB (s8.4): the two reserve_decisions index entries formerly baselined here were NOT a
  // catalog-detail mismatch — they were missing from DB-A outright (0001's DROP/ADD COLUMN
  // dropped them; nothing recreated them). Fixed by 0026_reserve_decisions_index_resync_drift;
  // §7 run 28557795657 reported both under baselineNotObserved, so they were shrunk.
  'fund_snapshots|fk|fund_snapshots_config_id_fundconfigs_id_fk',
  'fund_snapshots|fk|fund_snapshots_run_id_calc_runs_id_fk',
  'job_outbox|constraint|job_outbox_status_check',
]);

type TableShapeMap<TShape> = Map<string, Map<string, TShape>>;
type TableSetMap = Map<string, Set<string>>;
type ShapeKind = 'column' | 'constraint' | 'index';

interface ColumnShape {
  typ: string;
  notnull: boolean;
  defaultExpression: string | null;
  identity: string;
  generated: string;
}

interface ConstraintShape {
  contype: string;
  cols: string[];
  def: string | null;
  deferrable: boolean;
  deferred: boolean;
  validated: boolean;
}

interface IndexShape {
  uniq: boolean;
  method: string | null;
  predicate: string | null;
  cols: string[];
}

interface CatalogSnapshot {
  tables: Set<string>;
  columns: TableShapeMap<ColumnShape>;
  nonFkConstraints: TableShapeMap<ConstraintShape>;
  indexes: TableShapeMap<IndexShape>;
  foreignKeysByTable: TableSetMap;
  foreignKeyNamesByTable: TableShapeMap<string>;
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

function normalizeIdentifierArray(value: readonly string[] | null): string[] {
  return (value ?? []).map((entry) => normalizeIdentifier(entry));
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

function addTableSetValue(collection: TableSetMap, tableName: string, value: string): void {
  const tableValues = collection.get(tableName) ?? new Set<string>();
  tableValues.add(value);
  collection.set(tableName, tableValues);
}

function addForeignKeyShape(
  foreignKeysByTable: TableSetMap,
  foreignKeyNamesByTable: TableShapeMap<string>,
  tableName: string,
  shapeSignature: string,
  constraintName: string
): void {
  addTableSetValue(foreignKeysByTable, tableName, shapeSignature);
  setTableShape(foreignKeyNamesByTable, tableName, shapeSignature, constraintName);
}

function foreignKeyShapeSignature(row: {
  cols: readonly string[] | null;
  reftable: string;
  refcols: readonly string[] | null;
  confupdtype: string;
  confdeltype: string;
  def: string | null;
  deferrable: boolean;
  deferred: boolean;
  validated: boolean;
}): string {
  const cols = normalizeIdentifierArray(row.cols);
  const reftable = normalizeCatalogText(row.reftable) ?? '';
  const refcols = normalizeIdentifierArray(row.refcols);
  const confupdtype = normalizeCatalogText(row.confupdtype) ?? '';
  const confdeltype = normalizeCatalogText(row.confdeltype) ?? '';
  const def = normalizeCatalogText(row.def) ?? '';

  return [
    `${cols.join(',')}=>${reftable}(${refcols.join(',')})`,
    `u:${confupdtype}`,
    `d:${confdeltype}`,
    `def:${def}`,
    `deferrable:${String(row.deferrable)}`,
    `deferred:${String(row.deferred)}`,
    `validated:${String(row.validated)}`,
  ].join('|');
}

function shapeToText<TShape>(shape: TShape): string {
  return JSON.stringify(shape);
}

function compareNamedShapes<TShape>(
  mismatches: string[],
  tableName: string,
  shapeKind: ShapeKind,
  journalShapes: Map<string, TShape> | undefined,
  pushedShapes: Map<string, TShape> | undefined
): void {
  const journalEntries = journalShapes ?? new Map<string, TShape>();
  const pushedEntries = pushedShapes ?? new Map<string, TShape>();

  for (const [shapeName, journalShape] of journalEntries) {
    const pushedShape = pushedEntries.get(shapeName);
    if (!pushedShape) {
      mismatches.push(`${tableName}|${shapeKind}|${shapeName}`);
      continue;
    }

    if (shapeToText(journalShape) !== shapeToText(pushedShape)) {
      mismatches.push(`${tableName}|${shapeKind}|${shapeName}`);
    }
  }

  for (const shapeName of pushedEntries.keys()) {
    if (!journalEntries.has(shapeName)) {
      mismatches.push(`${tableName}|${shapeKind}|${shapeName}`);
    }
  }
}

function compareForeignKeyShapes(
  mismatches: string[],
  tableName: string,
  journalCatalog: CatalogSnapshot,
  pushedCatalog: CatalogSnapshot
): void {
  const journalForeignKeys = journalCatalog.foreignKeysByTable.get(tableName) ?? new Set<string>();
  const pushedForeignKeys = pushedCatalog.foreignKeysByTable.get(tableName) ?? new Set<string>();
  const journalNames =
    journalCatalog.foreignKeyNamesByTable.get(tableName) ?? new Map<string, string>();
  const pushedNames =
    pushedCatalog.foreignKeyNamesByTable.get(tableName) ?? new Map<string, string>();

  for (const shapeSignature of journalForeignKeys) {
    if (!pushedForeignKeys.has(shapeSignature)) {
      mismatches.push(`${tableName}|fk|${journalNames.get(shapeSignature) ?? shapeSignature}`);
    }
  }

  for (const shapeSignature of pushedForeignKeys) {
    if (!journalForeignKeys.has(shapeSignature)) {
      mismatches.push(`${tableName}|fk|${pushedNames.get(shapeSignature) ?? shapeSignature}`);
    }
  }
}

type ShapeDiagnosticValue = ColumnShape | ConstraintShape | IndexShape | string | null;

function foreignKeyShapeValue(
  catalog: CatalogSnapshot,
  tableName: string,
  shapeName: string
): string | null {
  const signatures = catalog.foreignKeysByTable.get(tableName);
  if (signatures?.has(shapeName)) {
    return shapeName;
  }

  const namesBySignature = catalog.foreignKeyNamesByTable.get(tableName);
  if (!namesBySignature) {
    return null;
  }

  for (const [signature, foreignKeyName] of namesBySignature) {
    if (foreignKeyName === shapeName) {
      return signature;
    }
  }

  return null;
}

function shapeValueForMismatchKey(catalog: CatalogSnapshot, key: string): ShapeDiagnosticValue {
  const [tableName, kind, ...nameParts] = key.split('|');
  const shapeName = nameParts.join('|');
  if (!tableName || !kind || !shapeName) {
    return null;
  }

  if (kind === 'column') {
    return catalog.columns.get(tableName)?.get(shapeName) ?? null;
  }
  if (kind === 'constraint') {
    return catalog.nonFkConstraints.get(tableName)?.get(shapeName) ?? null;
  }
  if (kind === 'index') {
    return catalog.indexes.get(tableName)?.get(shapeName) ?? null;
  }
  if (kind === 'fk') {
    return foreignKeyShapeValue(catalog, tableName, shapeName);
  }

  return null;
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
    default_expression: string | null;
    identity: string;
    generated: string;
  }>(`
    SELECT
      c.relname tbl,
      a.attname col,
      format_type(a.atttypid, a.atttypmod) typ,
      a.attnotnull notnull,
      pg_get_expr(ad.adbin, ad.adrelid) default_expression,
      a.attidentity identity,
      a.attgenerated generated
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
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
    cols: string[];
    reftable: string;
    refcols: string[];
    confupdtype: string;
    confdeltype: string;
    def: string;
    deferrable: boolean;
    deferred: boolean;
    validated: boolean;
  }>(`
    SELECT
      con.conname,
      con.contype,
      c.relname tbl,
      pg_get_constraintdef(con.oid, true) def,
      con.condeferrable deferrable,
      con.condeferred deferred,
      con.convalidated validated,
      COALESCE(
        (
          SELECT array_agg(a.attname::text ORDER BY k.ord)
          FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
        ),
        ARRAY[]::text[]
      ) cols,
      CASE WHEN con.confrelid = 0 THEN '' ELSE con.confrelid::regclass::text END reftable,
      COALESCE(
        (
          SELECT array_agg(a.attname::text ORDER BY k.ord)
          FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum
        ),
        ARRAY[]::text[]
      ) refcols,
      con.confupdtype,
      con.confdeltype
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = con.connamespace
    WHERE n.nspname = 'public'
      AND c.relname <> 'drizzle_migrations'
  `);
  const indexesResult = await activePool.query<{
    idxname: string;
    uniq: boolean;
    method: string;
    predicate: string | null;
    tbl: string;
    cols: string[];
  }>(`
    SELECT
      i.relname idxname,
      ix.indisunique uniq,
      am.amname method,
      pg_get_expr(ix.indpred, ix.indrelid) predicate,
      c.relname tbl,
      COALESCE(
        (
          SELECT array_agg(COALESCE(a.attname::text, '(expr)') ORDER BY k.ord)
          FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
          LEFT JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
        ),
        ARRAY[]::text[]
      ) cols
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class c ON c.oid = ix.indrelid
    JOIN pg_am am ON am.oid = i.relam
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname <> 'drizzle_migrations'
  `);

  const columns: TableShapeMap<ColumnShape> = new Map();
  const nonFkConstraints: TableShapeMap<ConstraintShape> = new Map();
  const indexes: TableShapeMap<IndexShape> = new Map();
  const foreignKeysByTable: TableSetMap = new Map();
  const foreignKeyNamesByTable: TableShapeMap<string> = new Map();

  for (const row of columnsResult.rows) {
    setTableShape(columns, normalizeIdentifier(row.tbl), normalizeIdentifier(row.col), {
      typ: normalizeCatalogText(row.typ) ?? '',
      notnull: row.notnull,
      defaultExpression: normalizeCatalogText(row.default_expression),
      identity: normalizeCatalogText(row.identity) ?? '',
      generated: normalizeCatalogText(row.generated) ?? '',
    });
  }

  for (const row of constraintsResult.rows) {
    const tableName = normalizeIdentifier(row.tbl);
    const constraintName = normalizeIdentifier(row.conname);
    const contype = normalizeCatalogText(row.contype) ?? '';

    if (contype === 'f') {
      addForeignKeyShape(
        foreignKeysByTable,
        foreignKeyNamesByTable,
        tableName,
        foreignKeyShapeSignature(row),
        constraintName
      );
      continue;
    }

    setTableShape(nonFkConstraints, tableName, constraintName, {
      contype,
      cols: normalizeIdentifierArray(row.cols),
      def: normalizeCatalogText(row.def),
      deferrable: row.deferrable,
      deferred: row.deferred,
      validated: row.validated,
    });
  }

  for (const row of indexesResult.rows) {
    setTableShape(indexes, normalizeIdentifier(row.tbl), normalizeIdentifier(row.idxname), {
      uniq: row.uniq,
      method: normalizeCatalogText(row.method),
      predicate: normalizeCatalogText(row.predicate),
      cols: normalizeIdentifierArray(row.cols),
    });
  }

  return {
    tables: new Set(tablesResult.rows.map((row) => normalizeIdentifier(row.relname))),
    columns,
    nonFkConstraints,
    indexes,
    foreignKeysByTable,
    foreignKeyNamesByTable,
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
      journalCatalog.nonFkConstraints.get(tableName),
      pushedCatalog.nonFkConstraints.get(tableName)
    );
    compareNamedShapes(
      mismatches,
      tableName,
      'index',
      journalCatalog.indexes.get(tableName),
      pushedCatalog.indexes.get(tableName)
    );
    compareForeignKeyShapes(mismatches, tableName, journalCatalog, pushedCatalog);
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

    expect([...expectedTables].sort()).toEqual([...C1_MOUNTED_TABLES].sort());

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
    const unexpectedShapeMismatches = shapeMismatches
      .filter((key) => !KNOWN_INTERSECTION_DRIFT.has(key))
      .sort();
    const baselineNotObserved = [...KNOWN_INTERSECTION_DRIFT]
      .filter((key) => !shapeMismatches.includes(key))
      .sort();

    // eslint-disable-next-line no-console -- D4 requires non-gating CI diagnostics.
    console.log('[prod-schema-clone] shape-only tables', shapeOnlyTables);
    // eslint-disable-next-line no-console -- D4 requires non-gating CI diagnostics.
    console.log(
      '[prod-schema-clone] DB-A catalog definitions',
      JSON.stringify(await catalogDefinitions(pool!))
    );
    // eslint-disable-next-line no-console -- D4 requires non-gating CI diagnostics.
    console.log(
      '[prod-schema-clone] DB-B catalog definitions',
      JSON.stringify(await catalogDefinitions(shapePool))
    );
    // eslint-disable-next-line no-console -- non-gating drift report for PR-2b
    console.log(
      '[prod-schema-clone] KNOWN intersection drift observed (report-only, PR-2b):',
      shapeMismatches.filter((key) => KNOWN_INTERSECTION_DRIFT.has(key)).sort()
    );
    if (baselineNotObserved.length) {
      // eslint-disable-next-line no-console -- non-gating baseline shrink signal for PR-2b
      console.log(
        '[prod-schema-clone] baseline entries NOT observed (drift fixed? shrink baseline):',
        baselineNotObserved
      );
    }
    for (const key of unexpectedShapeMismatches) {
      const dbAValue = shapeValueForMismatchKey(journalCatalog, key);
      const dbBValue = shapeValueForMismatchKey(pushedCatalog, key);
      // eslint-disable-next-line no-console -- emit flat DB-A/DB-B shape values before gated failure.
      console.log(
        '[prod-schema-clone] UNEXPECTED',
        key,
        'DB-A=',
        JSON.stringify(dbAValue ?? null),
        'DB-B=',
        JSON.stringify(dbBValue ?? null)
      );
    }

    expect(missingC1Tables).toEqual([]);
    expect(unexpectedShapeMismatches).toEqual([]);
    expect(journalOnlyTables).toEqual([]);
    expect(shapeOnlyTables.filter((tableName) => !shapeOnlyBaseline.has(tableName))).toEqual([]);

    const procedureNamesBefore = await publicProcedureNames(pool!, EXPECTED_PROCEDURES);
    const triggerNamesBefore = await publicTriggerNames(pool!, EXPECTED_TRIGGERS);

    expect([...procedureNamesBefore]).toEqual([]);
    expect([...triggerNamesBefore]).toEqual([]);

    await applyProceduralMigrations(pool!);
    const procedureNames = await publicProcedureNames(pool!, EXPECTED_PROCEDURES);
    const triggerNames = await publicTriggerNames(pool!, EXPECTED_TRIGGERS);

    expect(
      EXPECTED_PROCEDURES.filter((procedureName) => !procedureNames.has(procedureName))
    ).toEqual([]);
    expect(EXPECTED_TRIGGERS.filter((triggerName) => !triggerNames.has(triggerName))).toEqual([]);

    // alert_evaluation_executions, job_outbox.dedupe_key, idx_job_outbox_job_type_dedupe, performance_alerts_open_incident_unique, backtest_results.scenario_comparison_summary are in BOTH the journal and shape source -> proven by the sentinel intersection diff above; asserting them here would be vacuous (the journal pre-supplies them).
  });

  it(
    'smoke-runs the s8.1 operator-seam audit script against the journal clone',
    async () => {
      expect(postgres).toBeDefined();
      const outPath = path.join(
        os.tmpdir(),
        `s81-audit-smoke-${process.pid}-${Date.now()}.json`
      );

      await execFileAsync('node', ['scripts/audit-prod-operator-seam.mjs', '--out', outPath], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: postgres!.getConnectionUri() },
      });

      const artifact = JSON.parse(await readFile(outPath, 'utf8')) as {
        completed: boolean;
        query_count: number;
        results: {
          old_global_indexes: Array<{ index_name: string; absent?: boolean }>;
          scoped_indexes: Array<{
            index_name: string;
            absent?: boolean;
            is_valid?: boolean;
            is_ready?: boolean;
          }>;
          fund_snapshot_fks: Array<{ constraint_name: string; absent?: boolean }>;
          outbox_status_checks: Array<{ constraint_name: string }>;
          orphan_counts: {
            fund_snapshots_run_id_orphans: number;
            fund_snapshots_config_id_orphans: number;
          };
          row_counts: Record<string, number>;
        };
      };

      // Positive control on the detection queries, pinned to post-0028 DB-A truth:
      // the three old GLOBAL idempotency indexes are DROPPED by 0028 (the script
      // must report them absent, not error), while the scoped indexes (0024),
      // fund_snapshots FKs (0002), and job_outbox_status_check (0005) remain
      // present. This proves detection in BOTH directions before an operator
      // session relies on it.
      expect(artifact.completed).toBe(true);
      expect(artifact.query_count).toBeGreaterThan(0);
      expect(
        artifact.results.old_global_indexes
          .filter((entry) => entry.absent)
          .map((entry) => entry.index_name)
          .sort()
      ).toEqual([
        'forecast_snapshots_idempotency_unique_idx',
        'investment_lots_idempotency_unique_idx',
        'reserve_allocations_idempotency_unique_idx',
      ]);
      expect(
        artifact.results.scoped_indexes.filter(
          (entry) => entry.absent || !entry.is_valid || !entry.is_ready
        )
      ).toEqual([]);
      const foundFks = artifact.results.fund_snapshot_fks
        .filter((entry) => !entry.absent)
        .map((entry) => entry.constraint_name)
        .sort();
      expect(foundFks).toEqual([
        'fund_snapshots_config_id_fundconfigs_id_fk',
        'fund_snapshots_run_id_calc_runs_id_fk',
      ]);
      expect(
        artifact.results.outbox_status_checks.map((entry) => entry.constraint_name)
      ).toContain('job_outbox_status_check');
      expect(artifact.results.orphan_counts.fund_snapshots_run_id_orphans).toBe(0);
      expect(artifact.results.orphan_counts.fund_snapshots_config_id_orphans).toBe(0);
      expect(Object.keys(artifact.results.row_counts)).toHaveLength(7);
    },
    60_000
  );
});
