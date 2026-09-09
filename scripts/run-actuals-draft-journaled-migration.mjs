#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

import {
  assertCurrentForecastRawMigrationSafeCatalog,
  classifyCurrentForecastLedgerState,
  loadCurrentForecastBaselineLedger,
  loadCurrentForecastMigrationRange,
} from './current-forecast-journaled-migration-range.mjs';
import {
  ACTUALS_DRAFT_MIGRATION_IDENTITY,
  acquireAdvisoryLock,
  assertDirectDatabaseUrl,
  loadManifests,
  readDatabaseIdentity,
  ReconcileError,
  releaseAdvisoryLock,
  runReconciliation,
  setApplyTimeouts,
} from './reconcile-prod-schema.mjs';
import {
  readCurrentForecastSentinelCatalog,
  readMigrationLedger,
} from './run-current-forecast-journaled-migrations.mjs';

const { Client } = pg;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(repoRoot, 'migrations');
const TABLE = 'actuals_draft_revisions';
const FUNCTION = 'actuals_draft_revisions_forbid_mutation';
const MANIFEST = 'actuals-draft-revisions';
const PREDECESSOR = '0055_current_forecast_recompute_commands';
const quietOutput = { write: () => true };
const localTestCapabilities = new WeakMap();

export { ACTUALS_DRAFT_MIGRATION_IDENTITY };

export class ActualsDraftMigrationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ActualsDraftMigrationError';
  }
}

function localConnectionIdentity(connectionString) {
  const target = new URL(connectionString);
  target.pathname = '/';
  return target.href;
}

// This capability exists only for a newly created disposable container owned here.
// Flags, environment variables, host names, and caller-created objects do not grant apply.
export async function createDisposableActualsDraftMigrationTestContext() {
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg17')
    .withDatabase('actuals_draft_migration_test')
    .start();
  try {
    const connectionString = container.getConnectionUri();
    const capability = Object.freeze({});
    localTestCapabilities.set(capability, localConnectionIdentity(connectionString));
    return {
      connectionString,
      capability,
      async stop() {
        localTestCapabilities.delete(capability);
        await container.stop();
      },
    };
  } catch (error) {
    await container.stop();
    throw error;
  }
}

function assertApplyCapability(connectionString, localTestCapability) {
  let allowed = false;
  try {
    allowed =
      localTestCapabilities.has(localTestCapability) &&
      localTestCapabilities.get(localTestCapability) === localConnectionIdentity(connectionString);
  } catch {
    // Invalid URLs cannot become capabilities or leak through a native URL error.
  }
  if (!allowed) {
    throw new ReconcileError(
      'Production schema mutation mechanically blocked pending action-specific hardening',
      { kind: 'production-mutation-blocked' }
    );
  }
}

function assertDraftIdentity(entry) {
  if (
    !entry ||
    Object.entries(ACTUALS_DRAFT_MIGRATION_IDENTITY).some(([key, value]) => entry[key] !== value)
  ) {
    throw new ActualsDraftMigrationError('0056 migration source identity mismatch');
  }
}

export async function loadActualsDraftMigration({ migrationsDir: directory }) {
  const journal = JSON.parse(await readFile(path.join(directory, 'meta', '_journal.json'), 'utf8'));
  const identity = ACTUALS_DRAFT_MIGRATION_IDENTITY;
  if (
    journal.version !== '7' ||
    journal.dialect !== 'postgresql' ||
    !Array.isArray(journal.entries) ||
    journal.entries.filter((entry) => entry.tag === identity.tag).length !== 1 ||
    journal.entries.filter((entry) => entry.idx === identity.idx).length !== 1 ||
    journal.entries.filter((entry) => entry.when === identity.when).length !== 1
  ) {
    throw new ActualsDraftMigrationError('0056 migration journal identity mismatch');
  }
  const entry = journal.entries[identity.idx];
  const targets = await loadCurrentForecastMigrationRange({ migrationsDir: directory });
  const predecessor = journal.entries[identity.idx - 1];
  if (
    entry?.version !== '7' ||
    entry.breakpoints !== true ||
    predecessor?.idx !== identity.idx - 1 ||
    predecessor.tag !== PREDECESSOR ||
    predecessor.when !== targets.at(-1).when
  ) {
    throw new ActualsDraftMigrationError(
      '0056 must immediately follow the exact 0055 journal entry'
    );
  }
  const sql = await readFile(path.join(directory, `${identity.tag}.sql`));
  const hashed = { ...entry, hash: createHash('sha256').update(sql).digest('hex') };
  assertDraftIdentity(hashed);
  return hashed;
}

export function classifyActualsDraftLedgerState({
  ledgerRows,
  baselineEntries,
  targetEntries,
  draftEntry,
}) {
  assertDraftIdentity(draftEntry);
  if (!Array.isArray(ledgerRows)) {
    throw new ActualsDraftMigrationError('0056 requires the complete migration ledger');
  }
  const seen = new Set();
  let draftApplied = false;
  for (const [index, row] of ledgerRows.entries()) {
    const timestamp = Number(row.created_at);
    if (
      !Number.isSafeInteger(timestamp) ||
      timestamp < 0 ||
      seen.has(timestamp) ||
      (index > 0 && timestamp <= Number(ledgerRows[index - 1].created_at))
    ) {
      throw new ActualsDraftMigrationError(
        'Migration ledger has invalid, duplicate, or reordered rows'
      );
    }
    seen.add(timestamp);
    if (timestamp === draftEntry.when) {
      if (index !== ledgerRows.length - 1 || row.hash !== draftEntry.hash) {
        throw new ActualsDraftMigrationError('0056 must be the exact final migration ledger row');
      }
      draftApplied = true;
    }
  }
  // Only the exact validated terminal row may be removed; unknown rows remain visible.
  const predecessor = classifyCurrentForecastLedgerState({
    ledgerRows: draftApplied ? ledgerRows.slice(0, -1) : ledgerRows,
    baselineEntries,
    targetEntries,
  });
  if (
    predecessor.state !== 'complete' ||
    predecessor.appliedTargetCount !== 6 ||
    predecessor.lastAppliedTag !== PREDECESSOR
  ) {
    throw new ActualsDraftMigrationError('0056 requires complete validated history through 0055');
  }
  return {
    baselineKind: predecessor.baselineKind,
    state: draftApplied ? 'complete' : 'ready',
    appliedTargetCount: draftApplied ? 1 : 0,
    lastAppliedTag: draftApplied ? draftEntry.tag : PREDECESSOR,
  };
}

export function assertActualsDraftMigrationSafeCatalog({ state, audits }) {
  const status = typeof state === 'string' ? state : state?.state;
  const audit = audits?.[0];
  if (
    !['ready', 'complete'].includes(status) ||
    !Array.isArray(audits) ||
    audits.length !== 1 ||
    audit.manifest !== MANIFEST ||
    !Array.isArray(audit.objects) ||
    audit.objects.length !== 2
  ) {
    throw new ActualsDraftMigrationError('0056 catalog audit identity mismatch');
  }
  const table = audit.objects.find((object) => object.table === TABLE);
  const fn = audit.objects.find((object) => object.table === `function:${FUNCTION}`);
  if (!table || !fn) throw new ActualsDraftMigrationError('0056 catalog objects are incomplete');
  if (status === 'complete') {
    if (
      audit.action !== 'SKIP' ||
      audit.objects.some(
        (object) =>
          object.present !== true || object.action !== 'SKIP' || object.deltas?.length !== 0
      )
    ) {
      throw new ActualsDraftMigrationError('Ledgered 0056 requires an exact clean catalog');
    }
    return;
  }
  const expected = new Set([
    `missing-table:${TABLE}`,
    `missing-trigger:${TABLE}_immutable`,
    `missing-function:${FUNCTION}`,
  ]);
  const deltas = audit.objects.flatMap((object) => object.deltas ?? []);
  if (
    audit.action !== 'REFUSE-FOR-HUMAN' ||
    audit.objects.some(
      (object) => object.present !== false || object.action !== 'REFUSE-FOR-HUMAN'
    ) ||
    deltas.length !== expected.size ||
    new Set(deltas.map((delta) => `${delta.kind}:${delta.name}`)).size !== expected.size ||
    deltas.some((delta) => !expected.has(`${delta.kind}:${delta.name}`))
  ) {
    throw new ActualsDraftMigrationError(
      'Unledgered 0056 requires pristine absence; partial DDL refused'
    );
  }
}

function audit(client, manifests) {
  return runReconciliation({ client, manifests, apply: false, stdout: quietOutput });
}

export async function assertExactActualsTableCatalog(
  client,
  state,
  table,
  { ErrorClass = ActualsDraftMigrationError, migration = '0056' } = {}
) {
  const backingIndexes = table.constraintDefinitions
    .filter(({ expectedDefinition }) =>
      /^(PRIMARY KEY|UNIQUE) \(/.test(expectedDefinition.exactDefinition)
    )
    .map(({ name, expectedDefinition }) => ({
      name,
      definition: `CREATE UNIQUE INDEX ${name} ON public.${table.name} USING btree ${expectedDefinition.exactDefinition.replace(/^(PRIMARY KEY|UNIQUE) /, '')}`,
    }));
  const relations = await client.query(
    `SELECT c.relname, c.relkind, c.relpersistence, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
    [[table.name, ...backingIndexes.map(({ name }) => name)]]
  );
  const types = await client.query(
    `SELECT t.typname, t.typtype, t.typrelid = to_regclass($1) AS table_type,
            t.typelem = (SELECT reltype FROM pg_class WHERE oid = to_regclass($1)) AS array_type
       FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = ANY($2::text[])`,
    [`public.${table.name}`, [table.name, `_${table.name}`]]
  );
  if (state.state === 'ready') {
    if (relations.rows.length !== 0 || types.rows.length !== 0) {
      throw new ErrorClass(`Unledgered ${migration} has relation or type residue`);
    }
    return;
  }
  const relation = relations.rows.find(({ relname }) => relname === table.name);
  if (
    relations.rows.length !== backingIndexes.length + 1 ||
    relation?.relkind !== 'r' ||
    relation.relpersistence !== 'p' ||
    relation.relrowsecurity !== false ||
    relation.relforcerowsecurity !== false ||
    backingIndexes.some(
      ({ name }) => relations.rows.find(({ relname }) => relname === name)?.relkind !== 'i'
    ) ||
    types.rows.length !== 2 ||
    !types.rows.some(
      (type) => type.typname === table.name && type.typtype === 'c' && type.table_type === true
    ) ||
    !types.rows.some(
      (type) =>
        type.typname === `_${table.name}` && type.typtype === 'b' && type.array_type === true
    )
  ) {
    throw new ErrorClass(`${migration} relation or composite type identity mismatch`);
  }
  const columns = await client.query(
    `SELECT column_name, data_type, is_nullable, column_default, character_maximum_length,
            is_identity, is_generated
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [table.name]
  );
  const typesByName = { varchar: 'character varying', timestamptz: 'timestamp with time zone' };
  if (
    columns.rows.length !== table.columns.length ||
    table.columns.some((expected, index) => {
      const actual = columns.rows[index];
      return (
        actual.column_name !== expected.name ||
        actual.data_type !== (typesByName[expected.type] ?? expected.type) ||
        actual.is_nullable !== (expected.nullable ? 'YES' : 'NO') ||
        actual.column_default !== expected.defaultExpression ||
        actual.character_maximum_length !== expected.characterMaximumLength ||
        actual.is_identity !== 'NO' ||
        actual.is_generated !== 'NEVER'
      );
    })
  ) {
    throw new ErrorClass(`${migration} exact column shape, width, or default mismatch`);
  }
  const constraints = await client.query(
    'SELECT conname FROM pg_constraint WHERE conrelid = $1::regclass',
    [`public.${table.name}`]
  );
  const indexes = await client.query(
    `SELECT c.relname AS name, pg_get_indexdef(i.indexrelid) AS definition, i.indisvalid, i.indisready
       FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE i.indrelid = $1::regclass`,
    [`public.${table.name}`]
  );
  const triggers = await client.query(
    'SELECT tgname FROM pg_trigger WHERE tgrelid = $1::regclass AND NOT tgisinternal',
    [`public.${table.name}`]
  );
  if (
    constraints.rows.length !== table.constraints.length ||
    constraints.rows.some(({ conname }) => !table.constraints.includes(conname)) ||
    indexes.rows.length !== backingIndexes.length ||
    backingIndexes.some((expected) => {
      const actual = indexes.rows.find(({ name }) => name === expected.name);
      return (
        !actual ||
        actual.definition !== expected.definition ||
        actual.indisvalid !== true ||
        actual.indisready !== true
      );
    }) ||
    triggers.rows.length !== table.triggerDefinitions.length ||
    triggers.rows.some(
      ({ tgname }) => !table.triggerDefinitions.some(({ name }) => name === tgname)
    )
  ) {
    throw new ErrorClass(
      `${migration} exact constraint, backing index, or trigger inventory mismatch`
    );
  }
}

export async function assertActualsDraftPredecessorCatalog(client, manifests) {
  const baseline = manifests.filter(({ order }) => order >= 1 && order <= 26);
  const targets = manifests.filter(({ order }) => order >= 27 && order <= 32);
  if (
    baseline.length !== 26 ||
    targets.length !== 6 ||
    [...baseline, ...targets].some(({ order }, index) => order !== index + 1)
  ) {
    throw new ActualsDraftMigrationError('0056 requires predecessor manifests 1-32');
  }
  const { audits } = await audit(client, baseline);
  if (
    audits.length !== baseline.length ||
    audits.some(
      (item, index) =>
        item.manifest !== baseline[index].name ||
        item.action !== 'SKIP' ||
        !Array.isArray(item.objects) ||
        item.objects.some((object) => object.action !== 'SKIP' || object.deltas?.length !== 0)
    )
  ) {
    throw new ActualsDraftMigrationError('0056 predecessor baseline catalog must be clean');
  }
  const targetAudit = await audit(client, targets);
  assertCurrentForecastRawMigrationSafeCatalog({
    appliedTargetCount: 6,
    audits: targetAudit.audits,
    catalog: await readCurrentForecastSentinelCatalog(client),
  });
}

async function createDraftMigrationFolder(entry) {
  const sql = await readFile(path.join(migrationsDir, `${entry.tag}.sql`));
  if (createHash('sha256').update(sql).digest('hex') !== entry.hash) {
    throw new ActualsDraftMigrationError('0056 source changed before migration preparation');
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), 'actuals-draft-0056-'));
  try {
    await mkdir(path.join(directory, 'meta'));
    const journalEntry = {
      idx: entry.idx,
      version: entry.version,
      when: entry.when,
      tag: entry.tag,
      breakpoints: entry.breakpoints,
    };
    await writeFile(
      path.join(directory, 'meta', '_journal.json'),
      JSON.stringify({ version: '7', dialect: 'postgresql', entries: [journalEntry] })
    );
    await writeFile(path.join(directory, `${entry.tag}.sql`), sql);
    return directory;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export function parseActualsDraftMigrationArgs(argv) {
  const apply = argv.includes('--apply');
  const yes = argv.includes('--yes');
  if (apply && !yes) throw new ActualsDraftMigrationError('--apply requires --yes');
  if (argv.some((arg) => !['--apply', '--yes'].includes(arg))) {
    throw new ActualsDraftMigrationError('Unknown actuals draft migration argument');
  }
  return { apply, yes };
}

export async function runActualsDraftJournaledMigration({
  connectionString,
  apply,
  localTestCapability,
  stdout = /** @type {{ write(message: string): boolean }} */ (process.stdout),
  clientFactory = ({ connectionString: target }) => new Client({ connectionString: target }),
}) {
  if (apply) assertApplyCapability(connectionString, localTestCapability);
  assertDirectDatabaseUrl(connectionString);
  const draftEntry = await loadActualsDraftMigration({ migrationsDir });
  const baselineEntries = await loadCurrentForecastBaselineLedger({ migrationsDir });
  const targetEntries = await loadCurrentForecastMigrationRange({ migrationsDir });
  const manifests = await loadManifests();
  const draftManifests = manifests.filter(({ order }) => order === 33);
  if (draftManifests.length !== 1 || draftManifests[0].name !== MANIFEST) {
    throw new ActualsDraftMigrationError(
      '0056 requires exactly manifest 33-actuals-draft-revisions'
    );
  }
  const client = apply ? new Client({ connectionString }) : clientFactory({ connectionString });
  let locked = false;
  try {
    await client.connect();
    await acquireAdvisoryLock(client);
    locked = true;
    await setApplyTimeouts(client);
    const databaseIdentity = await readDatabaseIdentity(client);
    const endpoint = new URL(connectionString);
    const targetFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          directHost: endpoint.hostname.toLowerCase(),
          port: endpoint.port || '5432',
          database: databaseIdentity.database,
          user: databaseIdentity.user,
        })
      )
      .digest('hex');
    const classify = (ledgerRows) =>
      classifyActualsDraftLedgerState({ ledgerRows, baselineEntries, targetEntries, draftEntry });
    const beforeLedger = await readMigrationLedger(client);
    const preState = classify(beforeLedger);
    await assertActualsDraftPredecessorCatalog(client, manifests);
    const { audits } = await audit(client, draftManifests);
    assertActualsDraftMigrationSafeCatalog({ state: preState, audits });
    await assertExactActualsTableCatalog(client, preState, draftManifests[0].expectedTables[0]);
    stdout.write(`Actuals draft migration state before: ${JSON.stringify(preState)}\n`);
    if (!apply || preState.state === 'complete') {
      return {
        preState,
        postState: preState.state,
        applied: false,
        migration: ACTUALS_DRAFT_MIGRATION_IDENTITY,
        targetFingerprint,
      };
    }
    const directory = await createDraftMigrationFolder(draftEntry);
    try {
      await migrate(drizzle(client), {
        migrationsFolder: directory,
        migrationsTable: 'drizzle_migrations',
        migrationsSchema: 'public',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
    const afterLedger = await readMigrationLedger(client);
    const postState = classify(afterLedger);
    if (
      postState.state !== 'complete' ||
      afterLedger.length !== beforeLedger.length + 1 ||
      beforeLedger.some(
        (row, index) =>
          row.hash !== afterLedger[index].hash ||
          String(row.created_at) !== String(afterLedger[index].created_at)
      )
    ) {
      throw new ActualsDraftMigrationError(
        '0056 post-apply ledger or predecessor preservation failed'
      );
    }
    await assertActualsDraftPredecessorCatalog(client, manifests);
    const postAudit = await audit(client, draftManifests);
    assertActualsDraftMigrationSafeCatalog({ state: postState, audits: postAudit.audits });
    await assertExactActualsTableCatalog(client, postState, draftManifests[0].expectedTables[0]);
    stdout.write(`Actuals draft migration state after: ${JSON.stringify(postState)}\n`);
    return {
      preState,
      postState: 'complete',
      applied: true,
      migration: ACTUALS_DRAFT_MIGRATION_IDENTITY,
      targetFingerprint,
    };
  } finally {
    try {
      if (locked) await releaseAdvisoryLock(client);
    } finally {
      await client.end();
    }
  }
}

export async function runActualsDraftMigrationCli({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  try {
    const { apply } = parseActualsDraftMigrationArgs(argv);
    const result = await runActualsDraftJournaledMigration({
      connectionString: env.DATABASE_URL ?? '',
      apply,
      stdout,
    });
    if (env.ACTUALS_DRAFT_MIGRATION_RESULT_PATH) {
      await writeFile(env.ACTUALS_DRAFT_MIGRATION_RESULT_PATH, `${JSON.stringify(result)}\n`, {
        mode: 0o600,
      });
    }
    return 0;
  } catch (error) {
    const message =
      error instanceof ActualsDraftMigrationError
        ? error.message
        : error instanceof ReconcileError
          ? `Schema reconciliation refused (${error.details?.kind ?? 'catalog-check'})`
          : typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)
            ? `PostgreSQL operation failed (SQLSTATE ${error.code})`
            : 'Migration validation or connection failed';
    stderr.write(`[run-actuals-draft-journaled-migration] ${message}\n`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runActualsDraftMigrationCli();
}
