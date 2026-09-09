#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

import {
  loadCurrentForecastBaselineLedger,
  loadCurrentForecastMigrationRange,
} from './current-forecast-journaled-migration-range.mjs';
import {
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
  assertActualsDraftMigrationSafeCatalog,
  assertActualsDraftPredecessorCatalog,
  assertExactActualsTableCatalog,
  classifyActualsDraftLedgerState,
  loadActualsDraftMigration,
} from './run-actuals-draft-journaled-migration.mjs';
import { readMigrationLedger } from './run-current-forecast-journaled-migrations.mjs';

const { Client } = pg;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(repoRoot, 'migrations');
const MANIFEST = 'actuals-restatement-commands';
const PREDECESSOR = '0056_actuals_draft_revisions';
const quietOutput = { write: () => true };
const localTestCapabilities = new WeakMap();

export const ACTUALS_RESTATEMENT_MIGRATION_IDENTITY = Object.freeze({
  tag: '0057_actuals_restatement_commands',
  idx: 58,
  when: 1788912000000,
  hash: '3f424f67d5a7fe87c6e8eeb2b25d129c0278aa18596c6a3bf9b5ef91df46d577',
});
export const ACTUALS_RESTATEMENT_MANIFEST_IDENTITY = Object.freeze({
  path: 'scripts/prod-schema-manifests/34-actuals-restatement-commands.json',
  hash: 'facd06b78d2d59027265ecffca4dc3dac182e68f7ec39843fd19f01be04482a8',
});

export class ActualsRestatementMigrationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ActualsRestatementMigrationError';
  }
}

function localConnectionIdentity(connectionString) {
  const target = new URL(connectionString);
  target.pathname = '/';
  return target.href;
}

// Only this factory's live disposable container grants apply; caller assertions do not.
export async function createDisposableActualsRestatementMigrationTestContext() {
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg17')
    .withDatabase('actuals_restatement_migration_test')
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

function assertApplyCapability(connectionString, capability) {
  let allowed = false;
  try {
    allowed =
      localTestCapabilities.has(capability) &&
      localTestCapabilities.get(capability) === localConnectionIdentity(connectionString);
  } catch {
    // Malformed URLs and copied capability objects never grant apply.
  }
  if (!allowed) {
    throw new ReconcileError(
      'Production schema mutation mechanically blocked pending action-specific hardening',
      { kind: 'production-mutation-blocked' }
    );
  }
}

function assertRestatementIdentity(entry) {
  if (
    !entry ||
    Object.entries(ACTUALS_RESTATEMENT_MIGRATION_IDENTITY).some(
      ([key, value]) => entry[key] !== value
    )
  ) {
    throw new ActualsRestatementMigrationError('0057 migration source identity mismatch');
  }
}

export async function loadActualsRestatementMigration({ migrationsDir: directory }) {
  const journal = JSON.parse(await readFile(path.join(directory, 'meta', '_journal.json'), 'utf8'));
  const identity = ACTUALS_RESTATEMENT_MIGRATION_IDENTITY;
  const draft = await loadActualsDraftMigration({ migrationsDir: directory });
  const entry = journal.entries?.[identity.idx];
  if (
    journal.version !== '7' ||
    journal.dialect !== 'postgresql' ||
    !Array.isArray(journal.entries) ||
    ['tag', 'idx', 'when'].some(
      (key) => journal.entries.filter((item) => item[key] === identity[key]).length !== 1
    ) ||
    entry?.version !== '7' ||
    entry?.breakpoints !== true ||
    journal.entries[identity.idx - 1]?.tag !== PREDECESSOR ||
    draft.idx !== identity.idx - 1 ||
    draft.when >= identity.when
  ) {
    throw new ActualsRestatementMigrationError('0057 requires exact journal identity after 0056');
  }
  const sql = await readFile(path.join(directory, `${identity.tag}.sql`));
  const hashed = { ...entry, hash: createHash('sha256').update(sql).digest('hex') };
  assertRestatementIdentity(hashed);
  return hashed;
}

export function classifyActualsRestatementLedgerState({
  ledgerRows,
  baselineEntries,
  targetEntries,
  draftEntry,
  restatementEntry,
}) {
  assertRestatementIdentity(restatementEntry);
  if (!Array.isArray(ledgerRows)) {
    throw new ActualsRestatementMigrationError('0057 requires complete migration ledger');
  }
  const terminal = ledgerRows.at(-1);
  const applied = Number(terminal?.created_at) === restatementEntry.when;
  if (applied && terminal.hash !== restatementEntry.hash) {
    throw new ActualsRestatementMigrationError('0057 requires exact final migration ledger row');
  }
  const predecessor = classifyActualsDraftLedgerState({
    ledgerRows: applied ? ledgerRows.slice(0, -1) : ledgerRows,
    baselineEntries,
    targetEntries,
    draftEntry,
  });
  if (predecessor.state !== 'complete' || predecessor.lastAppliedTag !== PREDECESSOR) {
    throw new ActualsRestatementMigrationError(
      '0057 requires complete validated history through 0056'
    );
  }
  return {
    baselineKind: predecessor.baselineKind,
    state: applied ? 'complete' : 'ready',
    appliedTargetCount: applied ? 1 : 0,
    lastAppliedTag: applied ? restatementEntry.tag : PREDECESSOR,
  };
}

function audit(client, manifests) {
  return runReconciliation({ client, manifests, apply: false, stdout: quietOutput });
}

export function assertActualsRestatementMigrationSafeCatalog({ state, audits, manifest }) {
  const complete = state?.state === 'complete';
  const item = audits?.[0];
  if (
    !['ready', 'complete'].includes(state?.state) ||
    audits?.length !== 1 ||
    item?.manifest !== MANIFEST ||
    item.objects?.length !== 5
  ) {
    throw new ActualsRestatementMigrationError(
      '0057 requires complete action-specific catalog audit'
    );
  }
  const expected = new Map([
    ...manifest.expectedTables.map((table) => [
      table.name,
      table.sharedTable
        ? table.constraints.map((name) => `missing-constraint:${name}`)
        : [`missing-table:${table.name}`, `missing-trigger:${table.name}_immutable`],
    ]),
    [
      'function:reject_actuals_restatement_mutation',
      ['missing-function:reject_actuals_restatement_mutation'],
    ],
  ]);
  const seen = new Set();
  for (const object of item.objects) {
    const deltas = object.deltas?.map(({ kind, name }) => `${kind}:${name}`);
    const missing = expected.get(object.table);
    const shared = manifest.expectedTables.some(
      (table) => table.name === object.table && table.sharedTable
    );
    if (
      !missing ||
      seen.has(object.table) ||
      !Array.isArray(deltas) ||
      (complete
        ? object.present !== true || object.action !== 'SKIP' || deltas.length !== 0
        : object.present !== shared ||
          deltas.length !== missing.length ||
          new Set(deltas).size !== missing.length ||
          deltas.some((delta) => !missing.includes(delta)))
    ) {
      throw new ActualsRestatementMigrationError(
        complete
          ? 'Ledgered 0057 requires exact clean catalog'
          : 'Unledgered 0057 requires pristine absence; partial DDL refused'
      );
    }
    seen.add(object.table);
  }
  if (complete && item.action !== 'SKIP') {
    throw new ActualsRestatementMigrationError('Ledgered 0057 requires exact clean catalog');
  }
}

async function assertExactRestatementCatalog(client, state, manifest) {
  const complete = state.state === 'complete';
  for (const table of manifest.expectedTables.filter((item) => !item.sharedTable)) {
    await assertExactActualsTableCatalog(client, state, table, {
      ErrorClass: ActualsRestatementMigrationError,
      migration: '0057',
    });
    const name = `${table.name}_id_seq`;
    const sequences = await client.query(
      `SELECT c.relname, c.relkind, c.relpersistence, s.seqtypid::regtype::text AS type,
              s.seqstart::text, s.seqincrement::text, s.seqmin::text, s.seqmax::text,
              s.seqcache::text, s.seqcycle,
              pg_get_serial_sequence($2, 'id') AS owned_sequence
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_sequence s ON s.seqrelid = c.oid
        WHERE n.nspname = 'public' AND c.relname = $1`,
      [name, complete ? `public.${table.name}` : 'public.funds']
    );
    const sequence = sequences.rows[0];
    if (
      complete
        ? sequences.rows.length !== 1 ||
          sequence.relkind !== 'S' ||
          sequence.relpersistence !== 'p' ||
          sequence.type !== 'integer' ||
          sequence.seqstart !== '1' ||
          sequence.seqincrement !== '1' ||
          sequence.seqmin !== '1' ||
          sequence.seqmax !== '2147483647' ||
          sequence.seqcache !== '1' ||
          sequence.seqcycle !== false ||
          sequence.owned_sequence !== `public.${name}`
        : sequences.rows.length !== 0
    ) {
      throw new ActualsRestatementMigrationError(
        '0057 sequence residue or exact ownership/definition mismatch'
      );
    }
  }
  for (const table of manifest.expectedTables.filter((item) => item.sharedTable)) {
    const name = table.constraints[0];
    const indexes = await client.query(
      `SELECT c.relname, c.relkind, i.indisvalid, i.indisready, pg_get_indexdef(i.indexrelid) AS definition
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_index i ON i.indexrelid = c.oid
        WHERE n.nspname = 'public' AND c.relname = $1`,
      [name]
    );
    const index = indexes.rows[0];
    if (
      complete
        ? indexes.rows.length !== 1 ||
          index.relkind !== 'i' ||
          index.indisvalid !== true ||
          index.indisready !== true ||
          index.definition !==
            `CREATE UNIQUE INDEX ${name} ON public.${table.name} USING btree (id, fund_id)`
        : indexes.rows.length !== 0
    ) {
      throw new ActualsRestatementMigrationError(
        '0057 parent backing index residue or definition mismatch'
      );
    }
  }
}

async function createMigrationFolder(entry) {
  const sql = await readFile(path.join(migrationsDir, `${entry.tag}.sql`));
  if (createHash('sha256').update(sql).digest('hex') !== entry.hash) {
    throw new ActualsRestatementMigrationError('0057 source changed before migration preparation');
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), 'actuals-restatement-0057-'));
  try {
    await mkdir(path.join(directory, 'meta'));
    const { idx, version, when, tag, breakpoints } = entry;
    await writeFile(
      path.join(directory, 'meta', '_journal.json'),
      JSON.stringify({
        version: '7',
        dialect: 'postgresql',
        entries: [{ idx, version, when, tag, breakpoints }],
      })
    );
    await writeFile(path.join(directory, `${entry.tag}.sql`), sql);
    return directory;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export function parseActualsRestatementMigrationArgs(argv) {
  const apply = argv.includes('--apply');
  if (apply && !argv.includes('--yes'))
    throw new ActualsRestatementMigrationError('--apply requires --yes');
  if (argv.some((arg) => !['--apply', '--yes'].includes(arg))) {
    throw new ActualsRestatementMigrationError('Unknown actuals restatement migration argument');
  }
  return { apply, yes: argv.includes('--yes') };
}

export async function runActualsRestatementJournaledMigration({
  connectionString,
  apply,
  localTestCapability,
  stdout = process.stdout,
  clientFactory = ({ connectionString: target }) => new Client({ connectionString: target }),
}) {
  if (apply) assertApplyCapability(connectionString, localTestCapability);
  assertDirectDatabaseUrl(connectionString);
  const restatementEntry = await loadActualsRestatementMigration({ migrationsDir });
  const draftEntry = await loadActualsDraftMigration({ migrationsDir });
  const baselineEntries = await loadCurrentForecastBaselineLedger({ migrationsDir });
  const targetEntries = await loadCurrentForecastMigrationRange({ migrationsDir });
  const manifestBytes = await readFile(
    path.join(repoRoot, ACTUALS_RESTATEMENT_MANIFEST_IDENTITY.path)
  );
  if (
    createHash('sha256').update(manifestBytes).digest('hex') !==
    ACTUALS_RESTATEMENT_MANIFEST_IDENTITY.hash
  ) {
    throw new ActualsRestatementMigrationError('0057 manifest 34 source identity mismatch');
  }
  const manifests = await loadManifests();
  const targetManifests = manifests.filter(({ order }) => order === 34);
  const draftManifests = manifests.filter(({ order }) => order === 33);
  if (
    targetManifests.length !== 1 ||
    targetManifests[0].name !== MANIFEST ||
    draftManifests.length !== 1
  ) {
    throw new ActualsRestatementMigrationError('0057 requires exact manifests 33 and 34');
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
      classifyActualsRestatementLedgerState({
        ledgerRows,
        baselineEntries,
        targetEntries,
        draftEntry,
        restatementEntry,
      });
    const beforeLedger = await readMigrationLedger(client);
    const preState = classify(beforeLedger);
    await assertActualsDraftPredecessorCatalog(client, manifests);
    const draftAudit = await audit(client, draftManifests);
    assertActualsDraftMigrationSafeCatalog({ state: 'complete', audits: draftAudit.audits });
    await assertExactActualsTableCatalog(
      client,
      { state: 'complete' },
      draftManifests[0].expectedTables[0]
    );
    const check = async (state) => {
      const { audits } = await audit(client, targetManifests);
      assertActualsRestatementMigrationSafeCatalog({ state, audits, manifest: targetManifests[0] });
      await assertExactRestatementCatalog(client, state, targetManifests[0]);
    };
    await check(preState);
    stdout.write(`Actuals restatement migration state before: ${JSON.stringify(preState)}\n`);
    const result = (postState, applied) => ({
      preState,
      postState,
      applied,
      migration: ACTUALS_RESTATEMENT_MIGRATION_IDENTITY,
      targetFingerprint,
    });
    if (!apply || preState.state === 'complete') return result(preState.state, false);
    const directory = await createMigrationFolder(restatementEntry);
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
      throw new ActualsRestatementMigrationError(
        '0057 post-apply ledger did not preserve exact predecessor history'
      );
    }
    await check(postState);
    return result(postState.state, true);
  } finally {
    if (locked) await releaseAdvisoryLock(client).catch(() => {});
    await client.end();
  }
}

export async function runActualsRestatementMigrationCli({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  try {
    const { apply } = parseActualsRestatementMigrationArgs(argv);
    const result = await runActualsRestatementJournaledMigration({
      connectionString: env.DATABASE_URL ?? '',
      apply,
      stdout,
    });
    if (env.ACTUALS_RESTATEMENT_MIGRATION_RESULT_PATH) {
      await writeFile(
        env.ACTUALS_RESTATEMENT_MIGRATION_RESULT_PATH,
        `${JSON.stringify(result)}\n`,
        { mode: 0o600 }
      );
    }
    return 0;
  } catch (error) {
    const message =
      error instanceof ActualsRestatementMigrationError
        ? error.message
        : error instanceof ReconcileError
          ? `Schema reconciliation refused (${error.details?.kind ?? 'catalog-check'})`
          : typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)
            ? `PostgreSQL operation failed (SQLSTATE ${error.code})`
            : 'Migration validation or connection failed';
    stderr.write(`[run-actuals-restatement-journaled-migration] ${message}\n`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runActualsRestatementMigrationCli();
}
