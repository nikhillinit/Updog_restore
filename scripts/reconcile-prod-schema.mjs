#!/usr/bin/env node

import { config } from 'dotenv';
config({ quiet: true });

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import {
  classifyDrizzlePushOutput,
  findMissingSentinels,
  matchesDbError,
  pgIdentifier,
} from './db-push-core.mjs';

const { Client } = pg;

export const DEFAULT_MANIFEST_DIR = 'scripts/prod-schema-manifests';
export const LEDGER_TABLE = 'prod_schema_reconcile_ledger';
export const RECONCILE_LOCK_ID = 20260628;
export const ACTION_SKIP = 'SKIP';
export const ACTION_APPLY_MISSING_DDL = 'APPLY-MISSING-DDL';
export const ACTION_REFUSE_FOR_HUMAN = 'REFUSE-FOR-HUMAN';
export const MISSING_TABLE_POLICY_CREATE_OR_REPAIR = 'create_or_repair';
export const MISSING_TABLE_POLICY_EXISTING_REQUIRED = 'existing_table_required';

/** @typedef {'create_or_repair' | 'existing_table_required'} MissingTablePolicy */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAFE_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;
const FORBIDDEN_SQL_PATTERN = /\b(?:neon_auth|drizzle_migrations)\b/i;
const MIGRATION_MARKER_PATTERN = /^\s*--\s*@(generated|drift-patch)\b/m;
const KNOWN_MANIFEST_KEYS = new Set([
  'name',
  'order',
  'description',
  'sqlFiles',
  'allowedCreateTables',
  'expectedTables',
  'dropObjects',
  'missingTablePolicy',
  'manifestPath',
]);
const MISSING_TABLE_POLICIES = new Set([
  MISSING_TABLE_POLICY_CREATE_OR_REPAIR,
  MISSING_TABLE_POLICY_EXISTING_REQUIRED,
]);
const warnedMissingTablePolicyManifests = new Set();

export class ReconcileError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ReconcileError';
    this.details = details;
  }
}

export function parseReconcileArgs(argv, env = process.env) {
  const args = [...argv];
  const apply = args.includes('--apply');
  const yes = args.includes('--yes');
  const manifestDir = valueAfter(args, '--manifest-dir') ?? env.UPDOG_SCHEMA_MANIFEST_DIR ?? DEFAULT_MANIFEST_DIR;
  const expectedDatabase =
    valueAfter(args, '--expect-db') ?? env.UPDOG_EXPECTED_DATABASE ?? env.PGDATABASE ?? null;

  return {
    apply,
    yes,
    manifestDir,
    expectedDatabase,
  };
}

export function assertApplyConfirmation({ apply, yes }) {
  if (apply && !yes) {
    throw new ReconcileError('--apply requires --yes to confirm a schema mutation', {
      kind: 'missing-apply-confirmation',
    });
  }
}

export function isPoolerUrl(connectionString) {
  try {
    const url = new URL(connectionString);
    return /(?:^|-|[.])pooler(?:-|[.]|$)/i.test(url.hostname);
  } catch {
    return false;
  }
}

export function assertDirectDatabaseUrl(connectionString) {
  if (!connectionString || connectionString === 'memory://') {
    throw new ReconcileError('DATABASE_URL is missing or memory://; set it to the target database', {
      kind: 'missing-database-url',
    });
  }

  if (isPoolerUrl(connectionString)) {
    throw new ReconcileError('Refusing pooled database URL; DDL requires the direct Neon endpoint', {
      kind: 'pooler-url-refused',
    });
  }
}

export async function loadManifests(manifestDir = DEFAULT_MANIFEST_DIR, rootDir = repoRoot) {
  const absoluteDir = path.resolve(rootDir, manifestDir);
  const files = (await fs.readdir(absoluteDir))
    .filter((fileName) => fileName.endsWith('.json'))
    .sort();

  const manifests = [];
  for (const fileName of files) {
    const manifestPath = path.join(absoluteDir, fileName);
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    manifests.push({
      ...manifest,
      manifestPath: path.relative(rootDir, manifestPath).replace(/\\/g, '/'),
    });
  }

  return manifests.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function readManifestSql(manifest, rootDir = repoRoot) {
  const files = [];
  for (const relPath of manifest.sqlFiles ?? []) {
    const absolutePath = path.resolve(rootDir, relPath);
    const sql = await fs.readFile(absolutePath, 'utf8');
    files.push({
      path: relPath,
      sql,
      checksum: sha256(sql),
      statements: splitSqlStatements(sql),
    });
  }
  return files;
}

export function splitSqlStatements(sql) {
  return sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export function manifestChecksum(manifest, sqlFiles) {
  return sha256(
    JSON.stringify({
      name: manifest.name,
      sqlFiles: sqlFiles.map((file) => ({ path: file.path, checksum: file.checksum })),
      expectedTables: manifest.expectedTables ?? [],
      // Drop entries (incl. reverseSql) are ledger-identity: a materially
      // different drop manifest must never dedup against a committed row
      // (s8.1 red-team F3). Safe to add while the prod ledger is empty.
      dropObjects: manifest.dropObjects ?? [],
    })
  );
}

function manifestLabel(manifest) {
  return String(manifest?.manifestPath ?? manifest?.name ?? '<unknown>');
}

function validateManifestKeys(manifest) {
  for (const key of Object.keys(manifest ?? {})) {
    if (!KNOWN_MANIFEST_KEYS.has(key)) {
      throw new ReconcileError(`Manifest ${manifestLabel(manifest)} has unsupported top-level key ${key}`, {
        kind: 'unknown-manifest-key',
        manifest: manifestLabel(manifest),
        key,
      });
    }
  }
}

function validateMissingTablePolicyValue(manifest) {
  if (manifest?.missingTablePolicy === undefined) {
    return;
  }
  if (!MISSING_TABLE_POLICIES.has(manifest.missingTablePolicy)) {
    throw new ReconcileError(
      `Manifest ${manifestLabel(manifest)} has invalid missingTablePolicy ${String(manifest.missingTablePolicy)}`,
      {
        kind: 'invalid-missing-table-policy',
        manifest: manifestLabel(manifest),
        missingTablePolicy: manifest.missingTablePolicy,
      }
    );
  }
}

function validateManifest(manifest) {
  validateManifestKeys(manifest);
  validateMissingTablePolicyValue(manifest);
}

function resolveMissingTablePolicy(manifest) {
  validateManifest(manifest);
  if (manifest?.missingTablePolicy !== undefined) {
    return manifest.missingTablePolicy;
  }

  const label = manifestLabel(manifest);
  if (!warnedMissingTablePolicyManifests.has(label)) {
    warnedMissingTablePolicyManifests.add(label);
    console.warn(
      `Manifest ${label} has no missingTablePolicy; defaulting to ${MISSING_TABLE_POLICY_CREATE_OR_REPAIR} (deprecated)`
    );
  }
  return MISSING_TABLE_POLICY_CREATE_OR_REPAIR;
}

export function statementHashes(sqlFiles, extraStatements = []) {
  return [
    ...sqlFiles.flatMap((file) =>
      file.statements.map((statement, index) => ({
        file: file.path,
        index,
        hash: sha256(statement),
      }))
    ),
    ...extraStatements.map((statement, index) => ({
      file: '<dropObjects>',
      index,
      hash: sha256(statement),
    })),
  ];
}

export function validateDropObjects(manifest) {
  validateManifest(manifest);
  for (const drop of manifest.dropObjects ?? []) {
    if (drop.kind !== 'index' && drop.kind !== 'constraint') {
      throw new ReconcileError(
        `Manifest ${manifest.name} dropObjects: unsupported kind ${String(drop.kind)}`,
        { kind: 'unsupported-drop-kind', manifest: manifest.name, drop }
      );
    }
    assertSafeIdentifier(drop.name);
    if (drop.name.length > 63) {
      throw new ReconcileError(
        `Manifest ${manifest.name} dropObjects: ${drop.name} exceeds the 63-byte identifier limit; drop targets must be actual catalog names`,
        { kind: 'drop-name-too-long', manifest: manifest.name, name: drop.name }
      );
    }
    if (drop.kind === 'constraint') {
      if (!drop.table) {
        throw new ReconcileError(
          `Manifest ${manifest.name} dropObjects: constraint ${drop.name} is missing its table`,
          { kind: 'missing-drop-table', manifest: manifest.name, name: drop.name }
        );
      }
      assertSafeIdentifier(drop.table);
    }
    if (typeof drop.reverseSql !== 'string' || drop.reverseSql.trim().length === 0) {
      throw new ReconcileError(
        `Manifest ${manifest.name} dropObjects: ${drop.name} is missing reverseSql (emergency rollback must be written down, not improvised)`,
        { kind: 'missing-reverse-sql', manifest: manifest.name, name: drop.name }
      );
    }
    if (typeof drop.reason !== 'string' || drop.reason.trim().length === 0) {
      throw new ReconcileError(
        `Manifest ${manifest.name} dropObjects: ${drop.name} is missing its reason`,
        { kind: 'missing-drop-reason', manifest: manifest.name, name: drop.name }
      );
    }
  }
}

export function dropStatements(manifest) {
  return (manifest.dropObjects ?? []).map((drop) => {
    assertSafeIdentifier(drop.name);
    if (drop.kind === 'index') {
      return `DROP INDEX IF EXISTS "${drop.name}"`;
    }
    assertSafeIdentifier(drop.table);
    return `ALTER TABLE "${drop.table}" DROP CONSTRAINT IF EXISTS "${drop.name}"`;
  });
}

export function validateManifestSql(manifest, sqlFiles) {
  validateManifest(manifest);
  const allowedCreates = new Set([
    ...(manifest.allowedCreateTables ?? []),
    ...(manifest.expectedTables ?? []).map((table) => table.name),
  ]);

  for (const file of sqlFiles) {
    if (!MIGRATION_MARKER_PATTERN.test(file.sql)) {
      throw new ReconcileError(`${file.path} is missing -- @generated or -- @drift-patch marker`, {
        kind: 'missing-migration-marker',
        file: file.path,
      });
    }

    if (FORBIDDEN_SQL_PATTERN.test(file.sql)) {
      throw new ReconcileError(`${file.path} references a forbidden schema-management table`, {
        kind: 'forbidden-sql-target',
        file: file.path,
      });
    }

    for (const tableName of extractCreateTableNames(file.sql)) {
      if (!allowedCreates.has(tableName)) {
        throw new ReconcileError(
          `${file.path} creates ${tableName}, which is not declared in manifest ${manifest.name}`,
          {
            kind: 'undeclared-create',
            file: file.path,
            tableName,
            manifest: manifest.name,
          }
        );
      }
    }
  }
}

export function extractCreateTableNames(sql) {
  const withoutLineComments = sql.replace(/--.*$/gm, '');
  return Array.from(
    withoutLineComments.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi
    ),
    (match) => match[1]
  ).filter((tableName) => typeof tableName === 'string');
}

export async function auditManifest(client, manifest) {
  const missingTablePolicy = resolveMissingTablePolicy(manifest);
  const expectedTables = manifest.expectedTables ?? [];
  const dropObjects = manifest.dropObjects ?? [];
  const tableNames = expectedTables.map((table) => table.name);
  if (tableNames.length === 0 && dropObjects.length === 0) {
    return {
      manifest: manifest.name,
      missingTablePolicy,
      action: ACTION_SKIP,
      objects: [],
    };
  }

  const objects = [];

  if (tableNames.length > 0) {
    const presentTables = await loadPresentTables(client, tableNames);
    const columns = await loadColumns(client, tableNames);
    const constraints = await loadConstraints(client, tableNames, expectedTables);
    const indexes = await loadIndexes(client, expectedTables);

    for (const expectedTable of expectedTables) {
      objects.push(
        await auditTable({
          client,
          expectedTable,
          tablePresent: presentTables.has(expectedTable.name),
          columns: columns.get(expectedTable.name) ?? new Map(),
          constraints,
          indexes,
          missingTablePolicy,
        })
      );
    }
  }

  if (dropObjects.length > 0) {
    objects.push(...(await auditDropObjects(client, dropObjects)));
  }

  return {
    manifest: manifest.name,
    missingTablePolicy,
    action: summarizeAction(objects.map((object) => object.action)),
    objects,
  };
}

// Extra-objects audit: a dropObject PRESENT on the target means the manifest
// still has work (APPLY); absent means done (SKIP). The post-apply re-audit
// therefore verifies drops through the same must-be-SKIP gate as creates.
async function auditDropObjects(client, dropObjects) {
  const indexNames = dropObjects.filter((drop) => drop.kind === 'index').map((drop) => drop.name);
  const constraintDrops = dropObjects.filter((drop) => drop.kind === 'constraint');

  const presentIndexes = await loadPresentDropIndexes(client, indexNames);
  const presentConstraints = await loadPresentDropConstraints(client, constraintDrops);

  return dropObjects.map((drop) => {
    const present =
      drop.kind === 'index' ? presentIndexes.has(drop.name) : presentConstraints.has(drop.name);
    return {
      table: drop.table ?? drop.name,
      present,
      populated: false,
      deltas: present
        ? [{ kind: 'extra-object-present', name: drop.name, additiveSafe: true }]
        : [],
      action: present ? ACTION_APPLY_MISSING_DDL : ACTION_SKIP,
    };
  });
}

async function loadPresentDropIndexes(client, names) {
  if (names.length === 0) return new Set();
  const result = await client.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1::text[])`,
    [names]
  );
  return new Set(result.rows.map((row) => row.indexname));
}

async function loadPresentDropConstraints(client, constraintDrops) {
  if (constraintDrops.length === 0) return new Set();
  const result = await client.query(
    `
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = ANY($1::text[])
        AND con.conname = ANY($2::text[])
    `,
    [constraintDrops.map((drop) => drop.table), constraintDrops.map((drop) => drop.name)]
  );
  return new Set(result.rows.map((row) => row.conname));
}

export function decideObjectAction({ tablePresent, deltas, populated, missingTablePolicy }) {
  if (!tablePresent) {
    if (missingTablePolicy === MISSING_TABLE_POLICY_EXISTING_REQUIRED) {
      return ACTION_REFUSE_FOR_HUMAN;
    }
    return ACTION_APPLY_MISSING_DDL;
  }

  if (deltas.length === 0) {
    return ACTION_SKIP;
  }

  const hasNonAdditiveDelta = deltas.some((delta) => delta.additiveSafe === false);
  if (hasNonAdditiveDelta && populated) {
    return ACTION_REFUSE_FOR_HUMAN;
  }

  return ACTION_APPLY_MISSING_DDL;
}

export function formatAuditReport({ identity, privilegePrecheck, audits, apply }) {
  const lines = [
    `Target database: ${identity.database} user=${identity.user}`,
    `Mode: ${apply ? 'apply' : 'audit-only'}`,
    `Privilege precheck: database_create=${privilegePrecheck.canCreateDatabaseObjects} schema_create=${privilegePrecheck.canCreatePublicSchemaObjects} extension_create=${privilegePrecheck.canCreateExtension}`,
    '',
  ];

  for (const audit of audits) {
    lines.push(
      `${audit.manifest}: ${audit.action} (missingTablePolicy=${audit.missingTablePolicy ?? MISSING_TABLE_POLICY_CREATE_OR_REPAIR})`
    );
    for (const object of audit.objects) {
      const deltaSummary =
        object.deltas.length === 0
          ? 'shape-ok'
          : object.deltas.map((delta) => delta.name).join(', ');
      lines.push(`  ${object.table}: ${object.action} (${deltaSummary})`);
    }
  }

  return lines.join('\n');
}

export async function readDatabaseIdentity(client) {
  const result = await client.query(
    `SELECT current_database() AS database, current_user AS "user", inet_server_addr()::text AS host`
  );
  const row = result.rows[0] ?? {};
  return {
    database: String(row.database ?? ''),
    user: String(row.user ?? ''),
    host: row.host === null || row.host === undefined ? null : String(row.host),
  };
}

export function assertExpectedDatabase(identity, expectedDatabase) {
  if (!expectedDatabase) return;
  if (identity.database !== expectedDatabase) {
    throw new ReconcileError(
      `Target database identity mismatch: expected ${expectedDatabase}, got ${identity.database}`,
      {
        kind: 'database-identity-mismatch',
        expectedDatabase,
        actualDatabase: identity.database,
      }
    );
  }
}

export async function precheckPrivileges(client) {
  const result = await client.query(`
    SELECT
      has_database_privilege(current_database(), 'CREATE') AS "canCreateDatabaseObjects",
      has_schema_privilege('public', 'CREATE') AS "canCreatePublicSchemaObjects",
      has_database_privilege(current_database(), 'CREATE') AS "canCreateExtension"
  `);
  const row = result.rows[0] ?? {};
  return {
    canCreateDatabaseObjects: row.canCreateDatabaseObjects === true,
    canCreatePublicSchemaObjects: row.canCreatePublicSchemaObjects === true,
    canCreateExtension: row.canCreateExtension === true,
  };
}

export function assertApplyPrivileges(privilegePrecheck) {
  const missing = Object.entries(privilegePrecheck)
    .filter(([, value]) => value !== true)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new ReconcileError(`Target role lacks required DDL privileges: ${missing.join(', ')}`, {
      kind: 'missing-privileges',
      missing,
    });
  }
}

export async function runReconciliation({
  client,
  manifests,
  rootDir = repoRoot,
  apply = false,
  expectedDatabase = null,
  stdout = process.stdout,
}) {
  const identity = await readDatabaseIdentity(client);
  assertExpectedDatabase(identity, expectedDatabase);
  const privilegePrecheck = await precheckPrivileges(client);
  if (apply) {
    assertApplyPrivileges(privilegePrecheck);
  }

  const preparedManifests = [];
  for (const manifest of manifests) {
    const sqlFiles = await readManifestSql(manifest, rootDir);
    validateManifestSql(manifest, sqlFiles);
    validateDropObjects(manifest);
    const manifestDropStatements = dropStatements(manifest);
    preparedManifests.push({
      manifest,
      sqlFiles,
      checksum: manifestChecksum(manifest, sqlFiles),
      statementHashes: statementHashes(sqlFiles, manifestDropStatements),
      dropStatements: manifestDropStatements,
    });
  }

  const audits = [];
  for (const prepared of preparedManifests) {
    audits.push(await auditManifest(client, prepared.manifest));
  }

  stdout.write(`${formatAuditReport({ identity, privilegePrecheck, audits, apply })}\n`);

  if (!apply) {
    stdout.write('\nAudit-only mode. Re-run with --apply --yes to apply the manifests.\n');
    return { ok: true, applied: [], audits };
  }

  const auditByManifest = new Map(audits.map((audit) => [audit.manifest, audit]));
  const refused = audits.filter((audit) => audit.action === ACTION_REFUSE_FOR_HUMAN);
  if (refused.length > 0) {
    throw new ReconcileError(
      `Refusing apply; ${refused.map((audit) => audit.manifest).join(', ')} need human review`,
      {
        kind: 'human-review-required',
        audits: refused,
      }
    );
  }

  const manifestsNeedingApply = preparedManifests.filter(
    (prepared) => auditByManifest.get(prepared.manifest.name)?.action === ACTION_APPLY_MISSING_DDL
  );
  if (manifestsNeedingApply.length === 0) {
    stdout.write('\nAll manifest shapes already match; no DDL applied.\n');
    return { ok: true, applied: [], audits };
  }

  await acquireAdvisoryLock(client);
  const applied = [];
  try {
    await setApplyTimeouts(client);
    await ensureLedger(client);

    for (const prepared of manifestsNeedingApply) {
      if (await hasCommittedLedger(client, prepared.manifest.name, prepared.checksum)) {
        stdout.write(`\nSkipping ${prepared.manifest.name}: committed ledger row already exists.\n`);
        continue;
      }

      await applyPreparedManifest({ client, prepared, identity, stdout });
      applied.push(prepared.manifest.name);
    }
  } finally {
    await releaseAdvisoryLock(client);
  }

  return { ok: true, applied, audits };
}

export async function runReconcileCli({ argv = process.argv.slice(2), env = process.env } = {}) {
  const options = parseReconcileArgs(argv, env);
  assertApplyConfirmation(options);
  assertDirectDatabaseUrl(env.DATABASE_URL);

  const client = new Client({ connectionString: env.DATABASE_URL });
  try {
    await client.connect();
    const manifests = await loadManifests(options.manifestDir);
    await runReconciliation({
      client,
      manifests,
      apply: options.apply,
      expectedDatabase: options.expectedDatabase,
    });
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const classification = classifyDrizzlePushOutput({
      status: 0,
      dbErrorDetected: matchesDbError(message),
    });
    console.error(`[reconcile-prod-schema] ${message}`);
    if (!classification.ok) {
      console.error(`[reconcile-prod-schema] ${classification.message}`);
    }
    return 1;
  } finally {
    await client.end().catch(() => {});
  }
}

async function auditTable({
  client,
  expectedTable,
  tablePresent,
  columns,
  constraints,
  indexes,
  missingTablePolicy,
}) {
  const deltas = [];

  if (!tablePresent) {
    deltas.push({ kind: 'missing-table', name: expectedTable.name, additiveSafe: true });
    const action = decideObjectAction({
      tablePresent,
      deltas,
      populated: false,
      missingTablePolicy,
    });
    return {
      table: expectedTable.name,
      present: false,
      populated: false,
      deltas,
      action,
    };
  }

  for (const expectedColumn of expectedTable.columns ?? []) {
    const actualColumn = columns.get(expectedColumn.name);
    if (!actualColumn) {
      deltas.push({
        kind: 'missing-column',
        name: `${expectedTable.name}.${expectedColumn.name}`,
        additiveSafe: expectedColumn.nullable !== false,
      });
      continue;
    }

    if (
      expectedColumn.type &&
      normalizeColumnType(actualColumn) !== normalizeExpectedType(expectedColumn.type)
    ) {
      deltas.push({
        kind: 'column-type-mismatch',
        name: `${expectedTable.name}.${expectedColumn.name}`,
        expected: expectedColumn.type,
        actual: normalizeColumnType(actualColumn),
        additiveSafe: false,
      });
    }

    if (
      typeof expectedColumn.nullable === 'boolean' &&
      actualColumn.nullable !== expectedColumn.nullable
    ) {
      deltas.push({
        kind: 'column-nullability-mismatch',
        name: `${expectedTable.name}.${expectedColumn.name}`,
        expected: expectedColumn.nullable,
        actual: actualColumn.nullable,
        additiveSafe: false,
      });
    }
  }

  const missingSentinels = findMissingSentinels({
    sentinels: {
      constraints: expectedTable.constraints ?? [],
      indexes: expectedTable.indexes ?? [],
    },
    constraintRows: constraints,
    indexRows: indexes,
  });

  for (const name of missingSentinels.constraints) {
    deltas.push({ kind: 'missing-constraint', name, additiveSafe: true });
  }

  for (const name of missingSentinels.indexes) {
    deltas.push({ kind: 'missing-index', name, additiveSafe: true });
  }

  const populated =
    deltas.some((delta) => delta.additiveSafe === false) &&
    (await hasRows(client, expectedTable.name));
  const action = decideObjectAction({ tablePresent, deltas, populated, missingTablePolicy });

  return {
    table: expectedTable.name,
    present: true,
    populated,
    deltas,
    action,
  };
}

async function loadPresentTables(client, tableNames) {
  const result = await client.query(
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

async function loadColumns(client, tableNames) {
  const result = await client.query(
    `
      SELECT table_name, column_name, data_type, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [tableNames]
  );
  const columns = new Map();
  for (const row of result.rows) {
    const tableColumns = columns.get(row.table_name) ?? new Map();
    tableColumns.set(row.column_name, {
      dataType: row.data_type,
      udtName: row.udt_name,
      nullable: row.is_nullable === 'YES',
    });
    columns.set(row.table_name, tableColumns);
  }
  return columns;
}

async function loadConstraints(client, tableNames, expectedTables) {
  const constraintNames = expectedTables.flatMap((table) => table.constraints ?? []);
  if (constraintNames.length === 0) return [];
  const lookupNames = constraintNames.map(pgIdentifier);

  const result = await client.query(
    `
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public'
        AND rel.relname = ANY($1::text[])
        AND c.conname = ANY($2::text[])
    `,
    [tableNames, lookupNames]
  );
  return result.rows;
}

async function loadIndexes(client, expectedTables) {
  const indexNames = expectedTables.flatMap((table) => table.indexes ?? []);
  if (indexNames.length === 0) return [];

  const result = await client.query(
    `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = ANY($1::text[])
    `,
    [indexNames]
  );
  return result.rows;
}

async function hasRows(client, tableName) {
  assertSafeIdentifier(tableName);
  const result = await client.query(`SELECT EXISTS (SELECT 1 FROM "${tableName}" LIMIT 1) AS populated`);
  return result.rows[0]?.populated === true;
}

function summarizeAction(actions) {
  if (actions.includes(ACTION_REFUSE_FOR_HUMAN)) return ACTION_REFUSE_FOR_HUMAN;
  if (actions.includes(ACTION_APPLY_MISSING_DDL)) return ACTION_APPLY_MISSING_DDL;
  return ACTION_SKIP;
}

async function acquireAdvisoryLock(client) {
  const result = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [
    RECONCILE_LOCK_ID,
  ]);
  if (result.rows[0]?.acquired !== true) {
    throw new ReconcileError('Another prod-schema reconciliation run holds the advisory lock', {
      kind: 'advisory-lock-contended',
    });
  }
}

async function releaseAdvisoryLock(client) {
  await client.query('SELECT pg_advisory_unlock($1)', [RECONCILE_LOCK_ID]);
}

async function setApplyTimeouts(client) {
  await client.query("SET lock_timeout = '5s'");
  await client.query("SET statement_timeout = '5min'");
}

async function ensureLedger(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${LEDGER_TABLE}" (
      "id" bigserial PRIMARY KEY,
      "manifest_name" text NOT NULL,
      "manifest_checksum" text NOT NULL,
      "file_checksums" jsonb NOT NULL,
      "statement_hashes" jsonb NOT NULL,
      "target_database" text NOT NULL,
      "target_user" text NOT NULL,
      "applied_by" text NOT NULL,
      "started_at" timestamp with time zone NOT NULL DEFAULT now(),
      "committed_at" timestamp with time zone,
      "status" text NOT NULL,
      CONSTRAINT "${LEDGER_TABLE}_status_check" CHECK ("status" IN ('started','committed'))
    )
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "${LEDGER_TABLE}_manifest_committed_idx"
    ON "${LEDGER_TABLE}" ("manifest_name", "manifest_checksum")
    WHERE "committed_at" IS NOT NULL
  `);
}

async function hasCommittedLedger(client, manifestName, checksum) {
  const result = await client.query(
    `
      SELECT 1
      FROM "${LEDGER_TABLE}"
      WHERE "manifest_name" = $1
        AND "manifest_checksum" = $2
        AND "committed_at" IS NOT NULL
      LIMIT 1
    `,
    [manifestName, checksum]
  );
  return result.rowCount > 0;
}

async function applyPreparedManifest({ client, prepared, identity, stdout }) {
  const fileChecksums = prepared.sqlFiles.map((file) => ({ path: file.path, checksum: file.checksum }));
  const appliedBy = process.env.USER || process.env.USERNAME || 'unknown';
  let ledgerId;

  await client.query('BEGIN');
  try {
    const ledger = await client.query(
      `
        INSERT INTO "${LEDGER_TABLE}"
          ("manifest_name", "manifest_checksum", "file_checksums", "statement_hashes",
           "target_database", "target_user", "applied_by", "status")
        VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, 'started')
        RETURNING "id"
      `,
      [
        prepared.manifest.name,
        prepared.checksum,
        JSON.stringify(fileChecksums),
        JSON.stringify(prepared.statementHashes),
        identity.database,
        identity.user,
        appliedBy,
      ]
    );
    ledgerId = ledger.rows[0].id;

    for (const file of prepared.sqlFiles) {
      stdout.write(`\nApplying ${file.path} (${file.statements.length} statements)\n`);
      for (const statement of file.statements) {
        await client.query(statement);
      }
    }

    if (prepared.dropStatements.length > 0) {
      stdout.write(
        `\nApplying ${prepared.dropStatements.length} dropObjects statements for ${prepared.manifest.name}\n`
      );
      for (const statement of prepared.dropStatements) {
        await client.query(statement);
      }
    }

    const after = await auditManifest(client, prepared.manifest);
    if (after.action !== ACTION_SKIP) {
      // The CLI surfaces only error.message - the failing deltas must live IN
      // the message or the operator gets no diagnosis (s8.1 slice 4a lesson).
      const failingObjects = after.objects
        .filter((object) => object.deltas.length > 0 || object.action !== ACTION_SKIP)
        .map((object) => `${object.table}: ${JSON.stringify(object.deltas)}`)
        .join('; ');
      throw new ReconcileError(
        `Post-apply shape audit failed for ${prepared.manifest.name} - ${failingObjects}`,
        {
          kind: 'post-apply-audit-failed',
          audit: after,
        }
      );
    }

    await client.query(
      `
        UPDATE "${LEDGER_TABLE}"
        SET "committed_at" = now(), "status" = 'committed'
        WHERE "id" = $1
      `,
      [ledgerId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function normalizeColumnType(column) {
  const dataType = String(column.dataType ?? '').toLowerCase();
  const udtName = String(column.udtName ?? '').toLowerCase();
  if (dataType === 'user-defined') return udtName;
  if (dataType === 'character varying') return 'varchar';
  if (dataType === 'timestamp with time zone') return 'timestamptz';
  if (dataType === 'timestamp without time zone') return 'timestamp';
  if (dataType === 'integer') return 'integer';
  if (dataType === 'numeric') return 'numeric';
  return dataType;
}

function normalizeExpectedType(type) {
  return String(type).toLowerCase();
}

function assertSafeIdentifier(identifier) {
  if (!SAFE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new ReconcileError(`Unsafe SQL identifier: ${identifier}`, {
      kind: 'unsafe-identifier',
      identifier,
    });
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  runReconcileCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
