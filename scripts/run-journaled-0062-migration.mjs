#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { loadCurrentForecastBaselineLedger } from './current-forecast-journaled-migration-range.mjs';
import {
  acquireAdvisoryLock,
  assertDirectDatabaseUrl,
  auditManifest,
  computeTargetFingerprint,
  readDatabaseIdentity,
  releaseAdvisoryLock,
  setApplyTimeouts,
  splitSqlStatements,
} from './reconcile-prod-schema.mjs';
import { readMigrationLedger } from './run-current-forecast-journaled-migrations.mjs';
import {
  classifyJournaledRangeLedgerState,
  formatJournaledRangeFailure,
  JOURNALED_0050_0061_TARGETS,
  JournaledRangeMigrationError,
  JournaledRangeTargetError,
} from './run-journaled-0050-0061-migrations.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tag = '0062_vehicle_onboarding_commands';
const when = 1793750400000;
const migrationHash = '572bb8107b09b8b75ccbbffbcbb9f6c4e693bc4af5d1bb6d5c622a1b6766878c';
const journalHash = 'd554a6d824c98bce2db47ecf338142ae75bb58984696578742c9bbf3ef1485e7';
const baselineHash = '70e5feda6e24f45cce7491e3d3cf9b1fa920d96c0414c312ef6fb734883f4566';
const manifestsHash = 'e2b50dd88cf0c20418f53b351efe145817abc07b2aa8707914658bfd6697e078';
const tableName = 'vehicle_onboarding_commands';
const envelopeTrigger = 'vehicle_onboarding_refuse_envelope_source_trigger';
const envelopeFunction = 'vehicle_onboarding_refuse_envelope_source';
const digestFunction = 'vehicle_onboarding_artifact_digest';
const fundPredicate =
  "(fund_id = (NULLIF(current_setting('app.current_fund'::text, true), ''::text))::integer)";
const insertPredicate = `(${fundPredicate} AND
  (actor_id = (NULLIF(current_setting('app.current_user'::text, true), ''::text))::integer) AND
  (current_setting('app.current_role'::text, true) = 'admin'::text) AND
  (EXISTS ( SELECT 1 FROM (users u JOIN user_fund_grants g ON ((g.user_id = u.id)))
    WHERE ((u.id = vehicle_onboarding_commands.actor_id) AND
      (g.fund_id = vehicle_onboarding_commands.fund_id) AND u.is_active AND
      ((u.role)::text = 'admin'::text) AND (NOT u.is_release_canary_principal)))))`;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const compact = (value) => value?.replace(/\s+/g, ' ').trim();
const refuse = (message) => new JournaledRangeMigrationError(message);

async function loadSources(rootDir) {
  const migrationsDir = path.join(rootDir, 'migrations');
  const journal = await readFile(path.join(migrationsDir, 'meta', '_journal.json'));
  const sql = await readFile(path.join(migrationsDir, `${tag}.sql`));
  const manifestDir = 'scripts/prod-schema-manifests';
  const files = (await readdir(path.join(rootDir, manifestDir)))
    .filter((file) => file.endsWith('.json'))
    .sort();
  const manifestFiles = await Promise.all(
    files.map(async (file) => {
      const manifestPath = `${manifestDir}/${file}`;
      return [manifestPath, await readFile(path.join(rootDir, manifestPath))];
    })
  );
  const manifests = manifestFiles.map(([, data]) => JSON.parse(data));
  const entries = JSON.parse(journal).entries;
  if (
    !Array.isArray(entries) ||
    entries.length !== 64 ||
    entries.some(({ idx }, index) => idx !== index) ||
    manifests.length !== 39 ||
    manifests.some(({ order }, index) => order !== index + 1)
  ) {
    throw refuse('0062 requires exactly journal entries 0-63 and manifests 1-39');
  }
  if (sha256(journal) !== journalHash || sha256(sql) !== migrationHash) {
    throw refuse('0062 journal or SQL source identity mismatch');
  }
  const baselineEntries = await loadCurrentForecastBaselineLedger({ migrationsDir });
  const baselinePins = baselineEntries.map(({ tag, when, hash }) => [tag, when, hash]);
  if (sha256(JSON.stringify(baselinePins)) !== baselineHash) {
    throw refuse('0062 baseline SQL source identity mismatch');
  }
  for (const { idx, tag, when, hash } of JOURNALED_0050_0061_TARGETS) {
    const entry = entries[idx];
    if (
      entry?.tag !== tag ||
      entry.when !== when ||
      sha256(await readFile(path.join(migrationsDir, `${tag}.sql`))) !== hash
    ) {
      throw refuse('0062 predecessor SQL source identity mismatch');
    }
  }
  const manifestPins = manifestFiles.map(([manifestPath, data]) => [manifestPath, sha256(data)]);
  if (sha256(JSON.stringify(manifestPins)) !== manifestsHash) {
    throw refuse('0062 manifest source identity mismatch');
  }

  return {
    baselineEntries,
    manifests,
    statements: splitSqlStatements(sql.toString('utf8')),
  };
}

function ledgerState(ledgerRows, baselineEntries) {
  const tail = ledgerRows.at(-1);
  const complete = Number(tail?.created_at) === when;
  if (complete && tail.hash !== migrationHash) throw refuse('0062 ledger hash mismatch');
  const predecessor = classifyJournaledRangeLedgerState({
    ledgerRows: complete ? ledgerRows.slice(0, -1) : ledgerRows,
    baselineEntries,
  });
  if (predecessor.baselineKind !== 'adr074-reconciled' || predecessor.state !== 'complete') {
    throw refuse('0062 requires exact ADR-074 reconciled history through 0061');
  }
  return complete ? 'complete' : 'ready';
}

function cleanAudit(audit) {
  return (
    audit.action === 'SKIP' &&
    audit.objects.every(({ action, deltas }) => action === 'SKIP' && deltas.length === 0)
  );
}

async function assertCatalog(client, manifests, state) {
  const target = manifests.at(-1);
  for (const manifest of manifests.slice(0, -1)) {
    if (!cleanAudit(await auditManifest(client, manifest))) {
      throw refuse(`0062 predecessor catalog drift in manifest ${manifest.order}`);
    }
  }

  const audit = await auditManifest(client, target);
  const table = target.expectedTables[0];
  const relations = await client.query(
    `SELECT c.relname, c.relkind, c.relpersistence, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
    [[tableName, `${tableName}_id_seq`, ...table.indexes]]
  );

  if (state === 'ready') {
    const missing = [
      ['function:' + digestFunction, false, [`missing-function:${digestFunction}`]],
      ['function:' + envelopeFunction, false, [`missing-function:${envelopeFunction}`]],
      ['function:internal_economics_forbid_update', true, []],
      ['internal_capital_envelope_versions', true, [`missing-trigger:${envelopeTrigger}`]],
      [
        tableName,
        false,
        [`missing-table:${tableName}`, `missing-trigger:${tableName}_forbid_update_trigger`],
      ],
    ];
    const residue = await client.query(
      `SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = ANY($1::text[])`,
      [[tableName, `_${tableName}`]]
    );
    if (
      relations.rows.length ||
      residue.rows.length ||
      audit.objects.length !== missing.length ||
      missing.some(([name, present, deltas]) => {
        const item = audit.objects.find(({ table }) => table === name);
        return (
          item?.present !== present ||
          item.action !== (deltas.length ? 'REFUSE-FOR-HUMAN' : 'SKIP') ||
          item.deltas
            .map(({ kind, name }) => `${kind}:${name}`)
            .sort()
            .join() !== deltas.join()
        );
      })
    ) {
      throw refuse('Unledgered 0062 requires pristine absence; partial or existing DDL refused');
    }
    return;
  }
  if (!cleanAudit(audit) || audit.objects.some(({ present }) => !present)) {
    throw refuse('Ledgered 0062 requires an exact clean manifest 39');
  }

  const relation = relations.rows.find(({ relname }) => relname === tableName);
  const shape = await client.query(`
    SELECT (SELECT count(*) = ${table.columns.length} FROM pg_attribute
            WHERE attrelid = 'public.vehicle_onboarding_commands'::regclass
              AND attnum > 0 AND NOT attisdropped) AS exact_columns,
           (SELECT format_type(atttypid, atttypmod) = 'numeric(20,6)' FROM pg_attribute
            WHERE attrelid = 'public.vehicle_onboarding_commands'::regclass
              AND attname = 'committed_capital') AS exact_numeric,
           (SELECT count(*) = ${table.indexes.length} AND bool_and(indisvalid AND indisready)
            FROM pg_index WHERE indrelid = 'public.vehicle_onboarding_commands'::regclass) AS exact_indexes,
           (SELECT seqcache = 1 FROM pg_sequence
             WHERE seqrelid = 'public.vehicle_onboarding_commands_id_seq'::regclass) AS exact_sequence,
           pg_get_serial_sequence('public.vehicle_onboarding_commands', 'id') =
             'public.vehicle_onboarding_commands_id_seq' AS owned_sequence,
           (SELECT count(*) = 2 AND bool_and(tgenabled = 'O') FROM pg_trigger
             WHERE NOT tgisinternal AND (
               (tgname = 'vehicle_onboarding_commands_forbid_update_trigger' AND
                 tgrelid = 'public.vehicle_onboarding_commands'::regclass)
               OR (tgname = 'vehicle_onboarding_refuse_envelope_source_trigger' AND
                 tgrelid = 'public.internal_capital_envelope_versions'::regclass)
             )) AS enabled_triggers
  `);
  if (
    relation?.relkind !== 'r' ||
    relation.relpersistence !== 'p' ||
    relation.relrowsecurity !== true ||
    relation.relforcerowsecurity !== false ||
    Object.values(shape.rows[0] ?? {}).filter((value) => value === true).length !== 6
  ) {
    throw refuse('0062 table, sequence, trigger, or row security configuration mismatch');
  }

  const policies = await client.query(`
    SELECT polname, polcmd, polpermissive, polroles = ARRAY[0]::oid[] AS public_role,
           pg_get_expr(polqual, polrelid) AS using_expr,
           pg_get_expr(polwithcheck, polrelid) AS check_expr
      FROM pg_policy WHERE polrelid = 'public.vehicle_onboarding_commands'::regclass
     ORDER BY polname
  `);
  const [insert, select] = policies.rows;
  if (
    policies.rows.length !== 2 ||
    policies.rows.some(({ polpermissive, public_role }) => !polpermissive || !public_role) ||
    insert.polname !== 'vehicle_onboarding_commands_insert_policy' ||
    insert.polcmd !== 'a' ||
    insert.using_expr !== null ||
    compact(insert.check_expr) !== compact(insertPredicate) ||
    select.polname !== 'vehicle_onboarding_commands_select_policy' ||
    select.polcmd !== 'r' ||
    compact(select.using_expr) !== fundPredicate ||
    select.check_expr !== null
  ) {
    throw refuse('0062 row security policy definitions mismatch');
  }

  const functions = await client.query(
    `SELECT p.proname, p.proowner = c.relowner AS owned_by_table_owner,
       EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner)))
                WHERE grantee = 0 AND privilege_type = 'EXECUTE') AS public_execute
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_class c ON c.oid = 'public.vehicle_onboarding_commands'::regclass
      WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])`,
    [[envelopeFunction, digestFunction]]
  );
  if (
    functions.rows.length !== 2 ||
    functions.rows.some(
      ({ proname, owned_by_table_owner, public_execute }) =>
        !owned_by_table_owner || public_execute !== (proname === digestFunction)
    )
  ) {
    throw refuse('0062 security definer function owner or PUBLIC EXECUTE mismatch');
  }
}

export async function runJournaled0062Migration({
  connectionString,
  apply = false,
  expectedTargetFingerprint,
  beforeMutation,
  rootDir = repoRoot,
  stdout = process.stdout,
  clientFactory = (options) => new pg.Client(options),
  progress = { stage: 'before-connect' },
}) {
  if (typeof apply !== 'boolean') throw refuse('0062 apply flag must be boolean');
  const { baselineEntries, manifests, statements } = await loadSources(rootDir);
  if (apply && !/^[0-9a-f]{64}$/.test(expectedTargetFingerprint ?? '')) {
    throw new JournaledRangeTargetError('Target fingerprint missing or mismatched');
  }
  assertDirectDatabaseUrl(connectionString);
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw refuse('0062 requires a direct PostgreSQL database URL');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    url.pathname.length < 2
  ) {
    throw refuse('0062 requires a direct PostgreSQL database URL');
  }
  const client = clientFactory({ connectionString, connectionTimeoutMillis: 15_000 });
  let locked = false;
  let transaction = false;

  try {
    progress.stage = 'before-ledger';
    await client.connect();
    await setApplyTimeouts(client);
    const version = await client.query('SHOW server_version_num');
    if (Number(version.rows[0]?.server_version_num) >= 170000) {
      await client.query("SET transaction_timeout = '10min'");
    }
    if (apply) {
      const { database, user } = await readDatabaseIdentity(client);
      if (
        !client.host ||
        !database ||
        !user ||
        expectedTargetFingerprint !==
          computeTargetFingerprint({
            directHost: client.host,
            port: client.port,
            database,
            user,
          })
      ) {
        throw new JournaledRangeTargetError('Target fingerprint missing or mismatched');
      }
    }

    await acquireAdvisoryLock(client);
    locked = true;
    await client.query(
      apply
        ? 'BEGIN ISOLATION LEVEL SERIALIZABLE'
        : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'
    );
    transaction = true;
    await client.query('SET LOCAL search_path = public, pg_temp');
    if (apply)
      await client.query('LOCK TABLE public.drizzle_migrations IN SHARE ROW EXCLUSIVE MODE');

    const before = await readMigrationLedger(client);
    progress.stage = 'after-ledger';
    const preState = ledgerState(before, baselineEntries);
    await assertCatalog(client, manifests, preState);
    const applied = apply && preState === 'ready';
    if (applied) {
      await beforeMutation?.();
      // Same hash/timestamp and statement boundaries as Drizzle, with verification before commit.
      for (const sql of statements) await client.query(sql);
      await client.query(
        'INSERT INTO public.drizzle_migrations (hash, created_at) VALUES ($1, $2)',
        [migrationHash, when]
      );
      const after = await readMigrationLedger(client);
      if (
        ledgerState(after, baselineEntries) !== 'complete' ||
        after.length !== before.length + 1 ||
        before.some(
          ({ hash, created_at }, index) =>
            hash !== after[index].hash || created_at !== after[index].created_at
        )
      ) {
        throw refuse('0062 apply did not preserve exact predecessor ledger history');
      }
      await assertCatalog(client, manifests, 'complete');
    }

    const postState = applied ? 'complete' : preState;
    await client.query('COMMIT');
    transaction = false;
    if (applied) stdout.write('journaled-0062: migration transaction committed\n');
    stdout.write(
      `journaled-0062: ledger readback ${postState} ${postState === 'complete' ? 1 : 0}/1\n`
    );
    return { preState, postState, applied, migrationRange: [tag] };
  } finally {
    try {
      if (transaction) await client.query('ROLLBACK');
    } finally {
      try {
        if (locked) await releaseAdvisoryLock(client);
      } finally {
        await client.end();
      }
    }
  }
}

export function formatJournaled0062MigrationFailure(error, stage) {
  return formatJournaledRangeFailure(error, stage).replace(
    'journaled-0050-0061:',
    'journaled-0062:'
  );
}

export async function runJournaled0062MigrationCli({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
  rootDir = repoRoot,
} = {}) {
  const progress = { stage: 'before-connect' };
  try {
    if (argv.length) throw refuse('The 0062 CLI is read-only; use the governed apply route');
    const result = await runJournaled0062Migration({
      connectionString: env.DATABASE_URL,
      stdout,
      rootDir,
      progress,
    });
    if (env.JOURNALED_0062_MIGRATION_RESULT_PATH) {
      await writeFile(env.JOURNALED_0062_MIGRATION_RESULT_PATH, `${JSON.stringify(result)}\n`, {
        mode: 0o600,
      });
    }
    return 0;
  } catch (error) {
    stderr.write(`${formatJournaled0062MigrationFailure(error, progress.stage)}\n`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runJournaled0062MigrationCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
