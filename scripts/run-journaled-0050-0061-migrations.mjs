#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

import {
  ACTUALS_DRAFT_MIGRATION_IDENTITY,
  acquireAdvisoryLock,
  assertDirectDatabaseUrl,
  computeTargetFingerprint,
  G3_CATCHUP_TARGETS,
  loadManifests,
  readDatabaseIdentity,
  ReconcileError,
  releaseAdvisoryLock,
  runReconciliation,
  setApplyTimeouts,
} from './reconcile-prod-schema.mjs';
import {
  assertCurrentForecastRawMigrationSafeCatalog,
  classifyCurrentForecastLedgerState,
  createCurrentForecastMigrationFolder,
  loadCurrentForecastBaselineLedger,
} from './current-forecast-journaled-migration-range.mjs';
import {
  ActualsDraftMigrationError,
  assertActualsDraftMigrationSafeCatalog,
  assertExactActualsTableCatalog,
} from './run-actuals-draft-journaled-migration.mjs';
import {
  ACTUALS_RESTATEMENT_MANIFEST_IDENTITY,
  ACTUALS_RESTATEMENT_MIGRATION_IDENTITY,
  ActualsRestatementMigrationError,
  assertActualsRestatementMigrationSafeCatalog,
  assertExactRestatementCatalog,
} from './run-actuals-restatement-journaled-migration.mjs';
import {
  assertAdr074BaselineCatalog,
  CurrentForecastMigrationError,
  readCurrentForecastSentinelCatalog,
  readMigrationLedger,
} from './run-current-forecast-journaled-migrations.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(repoRoot, 'migrations');
const manifestDir = path.join(repoRoot, 'scripts/prod-schema-manifests');
const { Client } = pg;
const quietOutput = { write: () => true };

const target = (idx, tag, when, hash) => Object.freeze({ idx, tag, when, hash });

export class JournaledRangeMigrationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'JournaledRangeMigrationError';
  }
}

export class JournaledRangeTargetError extends JournaledRangeMigrationError {
  constructor(message) {
    super(message);
    this.name = 'JournaledRangeTargetError';
  }
}

export const JOURNALED_0050_0061_TARGETS = Object.freeze([
  target(
    51,
    '0050_g3_portfolio_and_calculation_schema',
    1785800400000,
    G3_CATCHUP_TARGETS[0].migrationSha256
  ),
  target(52, '0051_g3_canary_schema', 1785886800000, G3_CATCHUP_TARGETS[1].migrationSha256),
  target(
    53,
    '0052_g3_capital_call_notification_outbox',
    1785973200000,
    G3_CATCHUP_TARGETS[2].migrationSha256
  ),
  target(
    54,
    '0053_g3_release_gate_hardening',
    1786059600000,
    G3_CATCHUP_TARGETS[3].migrationSha256
  ),
  target(
    55,
    '0054_operating_decisions_spine',
    1788161773455,
    '8ce919cadafa650be0cd6ad0fcf5d1f6bf8f2200b476d4a8038943c783702265'
  ),
  target(
    56,
    '0055_current_forecast_recompute_commands',
    1788235843534,
    '97e745ade48100bed9d3d2850832a8b741ad67377f6d3d8e1c57dcf7395d7c2d'
  ),
  target(57, '0056_actuals_draft_revisions', 1788825600000, ACTUALS_DRAFT_MIGRATION_IDENTITY.hash),
  target(
    58,
    '0057_actuals_restatement_commands',
    1788912000000,
    ACTUALS_RESTATEMENT_MIGRATION_IDENTITY.hash
  ),
  target(
    59,
    '0058_capital_plan_override',
    1788998400000,
    '9295d71d4875e924373b2ed80cff619f4c8700e34950836f88684c85d01b890e'
  ),
  target(
    60,
    '0059_task_update_commands',
    1789344000000,
    '2cf0d949a2497c55ff4dea0fe7b1955ed735c5c6b700dd8ceb3acea4af0f3cd7'
  ),
  target(
    61,
    '0060_fund_workflow_commands',
    1790035200000,
    'fd8d4d03479213987241f28fd5e0c967ae455921a0017758b2fc66ea2a286140'
  ),
  target(
    62,
    '0061_durable_create_receipts',
    1790380800000,
    '853a2a66feac4cfa567cb858797a46b7ec7a8f5ae53e40a86b7a9a8168d223c8'
  ),
]);

const manifestPin = (order, name, hash) => Object.freeze({ order, name, hash });

export const JOURNALED_0050_0061_MANIFEST_PINS = Object.freeze([
  manifestPin(27, G3_CATCHUP_TARGETS[0].manifestName, G3_CATCHUP_TARGETS[0].manifestSha256),
  manifestPin(28, G3_CATCHUP_TARGETS[1].manifestName, G3_CATCHUP_TARGETS[1].manifestSha256),
  manifestPin(29, G3_CATCHUP_TARGETS[2].manifestName, G3_CATCHUP_TARGETS[2].manifestSha256),
  manifestPin(30, G3_CATCHUP_TARGETS[3].manifestName, G3_CATCHUP_TARGETS[3].manifestSha256),
  manifestPin(
    31,
    'operating-decisions-spine',
    'f8bcb729e6b2783d540a0b090cf0d3c61a3f5a634c3d4b08e9fff3ad1cc4b90b'
  ),
  manifestPin(
    32,
    'current-forecast-recompute-commands',
    'f40010aa270d94f57be22c8454a2caf5821bc61eddb999ba4090c5dd411ce342'
  ),
  manifestPin(
    33,
    'actuals-draft-revisions',
    '37d73d4cf6bc830f0677d87fda72c82bcfa2a2b0951ecf2b9227a0e8bd027bf0'
  ),
  manifestPin(34, 'actuals-restatement-commands', ACTUALS_RESTATEMENT_MANIFEST_IDENTITY.hash),
  manifestPin(
    35,
    'capital-plan-override',
    '32725415588c6dcab5d71196565542d38286ef6e132ae6f50a9bb2ac53b37ea8'
  ),
  manifestPin(
    36,
    'task-update-commands',
    '0beab8c13283579c0e786e524416901358d599bc76b00c7571d0333aa36e7c39'
  ),
  manifestPin(
    37,
    'fund-workflow-commands',
    'c7f1642a8a13b024d647ae9a6a4a2d3f892ee059cb1b34aedf8b7a5597eddae1'
  ),
  manifestPin(
    38,
    'durable-create-receipts',
    '54c7b17cca8ce2760a33c95154c76c10dc4796c5950aa99d107f1b6a51654cf1'
  ),
]);

export const JOURNALED_FULL_ABSENCE_DELTAS = Object.freeze(
  new Map([
    [
      'capital-plan-override',
      new Set(['missing-constraint:fund_scenario_variants_override_type_check']),
    ],
    [
      'task-update-commands',
      new Set([
        'missing-table:task_update_commands',
        'missing-trigger:task_update_commands_forbid_update_trigger',
      ]),
    ],
    [
      'fund-workflow-commands',
      new Set([
        'missing-table:fund_workflow_commands',
        'missing-trigger:fund_workflow_commands_forbid_update_trigger',
        'missing-column:fundconfigs.draft_revision',
        'missing-constraint:fundconfigs_draft_revision_positive',
      ]),
    ],
    [
      'durable-create-receipts',
      new Set([
        'missing-table:deal_pipeline_commands',
        'missing-trigger:deal_pipeline_commands_forbid_update_trigger',
        'missing-column:portfoliocompanies.create_idempotency_key',
        'missing-column:portfoliocompanies.create_request_hash',
        'missing-constraint:portfoliocompanies_create_receipt_pair_check',
        'missing-constraint:portfoliocompanies_create_request_hash_check',
        'missing-index:portfoliocompanies_fund_create_idempotency_unique',
      ]),
    ],
  ])
);

export function assertRepositoryTail({ journalEntries, manifests }) {
  if (
    !Array.isArray(journalEntries) ||
    journalEntries.length !== 63 ||
    journalEntries.some((entry, index) => entry?.idx !== index) ||
    !Array.isArray(manifests) ||
    manifests.length !== 38 ||
    manifests.some((manifest, index) => manifest?.order !== index + 1)
  ) {
    throw new JournaledRangeMigrationError('Repository is newer than the 0050-0061 route');
  }
}

async function hashFile(filePath) {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

function migrationPinError(tag) {
  return new JournaledRangeMigrationError(`Journaled migration source identity mismatch: ${tag}`);
}

function manifestPinError(name) {
  return new JournaledRangeMigrationError(`Journaled manifest source identity mismatch: ${name}`);
}

export async function loadJournaledRangeMigrations({ migrationsDir, manifestDir }) {
  const journalPath = path.join(migrationsDir, 'meta', '_journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8'));
  const manifests = await loadManifests(manifestDir);
  assertRepositoryTail({ journalEntries: journal.entries, manifests });

  const targetEntries = [];
  for (const pin of JOURNALED_0050_0061_TARGETS) {
    const entry = journal.entries[pin.idx];
    if (entry?.idx !== pin.idx || entry.tag !== pin.tag || entry.when !== pin.when) {
      throw migrationPinError(pin.tag);
    }
    let hash;
    try {
      hash = await hashFile(path.join(migrationsDir, `${pin.tag}.sql`));
    } catch {
      throw migrationPinError(pin.tag);
    }
    if (hash !== pin.hash) throw migrationPinError(pin.tag);
    targetEntries.push({ ...entry, hash });
  }

  for (const pin of JOURNALED_0050_0061_MANIFEST_PINS) {
    const manifest = manifests.find(({ order }) => order === pin.order);
    if (!manifest || manifest.order !== pin.order || manifest.name !== pin.name) {
      throw manifestPinError(pin.name);
    }
    let hash;
    try {
      hash = await hashFile(path.resolve(repoRoot, manifest.manifestPath));
    } catch {
      throw manifestPinError(pin.name);
    }
    if (hash !== pin.hash) throw manifestPinError(pin.name);
  }

  return {
    targetEntries,
    baselineEntries: await loadCurrentForecastBaselineLedger({ migrationsDir }),
    manifests,
  };
}

export function createJournaledRangeMigrationFolder({ migrationsDir, entries }) {
  return createCurrentForecastMigrationFolder({ migrationsDir, entries });
}

export { computeTargetFingerprint };

export function deriveTargetStates(appliedTargetCount) {
  if (!Number.isInteger(appliedTargetCount) || appliedTargetCount < 0 || appliedTargetCount > 12) {
    throw new JournaledRangeMigrationError('Invalid applied journaled migration count');
  }
  return {
    currentForecastAppliedCount: Math.min(appliedTargetCount, 6),
    actualsDraftState: { state: appliedTargetCount >= 7 ? 'complete' : 'ready' },
    actualsRestatementState: { state: appliedTargetCount >= 8 ? 'complete' : 'ready' },
    ledgeredOrders: new Set([35, 36, 37, 38].filter((order) => appliedTargetCount >= order - 26)),
  };
}

export async function assertJournaledRangeCatalog({
  client,
  appliedTargetCount,
  audits,
  sentinelCatalog,
  manifests,
}) {
  const states = deriveTargetStates(appliedTargetCount);
  const targetManifests =
    manifests.length === 12
      ? manifests
      : manifests.filter(({ order }) => order >= 27 && order <= 38);
  if (
    targetManifests.length !== 12 ||
    targetManifests.some((manifest, index) => manifest.order !== index + 27) ||
    !Array.isArray(audits) ||
    audits.length !== 12
  ) {
    throw new JournaledRangeMigrationError('Journaled range catalog must cover manifests 27-38');
  }

  try {
    assertCurrentForecastRawMigrationSafeCatalog({
      appliedTargetCount: states.currentForecastAppliedCount,
      audits: audits.slice(0, 6),
      catalog: sentinelCatalog,
    });
  } catch (error) {
    throw new JournaledRangeMigrationError(error instanceof Error ? error.message : String(error));
  }

  const draftManifest = targetManifests[6];
  assertActualsDraftMigrationSafeCatalog({ state: states.actualsDraftState, audits: [audits[6]] });
  await assertExactActualsTableCatalog(
    client,
    states.actualsDraftState,
    draftManifest.expectedTables[0]
  );

  const restatementManifest = targetManifests[7];
  assertActualsRestatementMigrationSafeCatalog({
    state: states.actualsRestatementState,
    audits: [audits[7]],
    manifest: restatementManifest,
  });
  await assertExactRestatementCatalog(client, states.actualsRestatementState, restatementManifest);

  for (const [index, manifest] of targetManifests.slice(8).entries()) {
    const audit = audits[index + 8];
    if (states.ledgeredOrders.has(manifest.order)) {
      if (
        audit?.action !== 'SKIP' ||
        !Array.isArray(audit?.objects) ||
        audit.objects.some(
          (object) =>
            object.action !== 'SKIP' || !Array.isArray(object.deltas) || object.deltas.length !== 0
        )
      ) {
        throw new JournaledRangeMigrationError(
          `Ledgered ${manifest.name} requires exact clean catalog`
        );
      }
      continue;
    }

    const deltas = (Array.isArray(audit?.objects) ? audit.objects : []).flatMap((object) =>
      Array.isArray(object.deltas) ? object.deltas.map(({ kind, name }) => `${kind}:${name}`) : []
    );
    const expected = JOURNALED_FULL_ABSENCE_DELTAS.get(manifest.name);
    if (
      !expected ||
      new Set(deltas).size !== deltas.length ||
      deltas.length !== expected.size ||
      deltas.some((delta) => !expected.has(delta))
    ) {
      throw new JournaledRangeMigrationError(
        `Unledgered ${manifest.name} requires exact full absence catalog`
      );
    }
  }
}

export function classifyJournaledRangeLedgerState({
  ledgerRows,
  baselineEntries,
  targetEntries = JOURNALED_0050_0061_TARGETS,
}) {
  try {
    return classifyCurrentForecastLedgerState({ ledgerRows, baselineEntries, targetEntries });
  } catch (error) {
    throw new JournaledRangeMigrationError(error instanceof Error ? error.message : String(error));
  }
}

const KNOWN_FAILURE_CLASSES = [
  JournaledRangeMigrationError,
  ReconcileError,
  CurrentForecastMigrationError,
  ActualsDraftMigrationError,
  ActualsRestatementMigrationError,
];

function postgresSqlState(error) {
  for (const candidate of [error, error?.cause]) {
    if (
      candidate &&
      typeof candidate.severity === 'string' &&
      typeof candidate.code === 'string' &&
      /^[0-9A-Z]{5}$/.test(candidate.code)
    ) {
      return candidate.code;
    }
  }
  return null;
}

function failureLine(category, text, sqlState) {
  return `journaled-0050-0061: ${category}${sqlState ? ` ${sqlState}` : ''}: ${text}`;
}

export function formatJournaledRangeFailure(error, stage) {
  if (error instanceof JournaledRangeTargetError) {
    return failureLine('refused-target', 'Target fingerprint missing or mismatched');
  }
  const known = KNOWN_FAILURE_CLASSES.some((ErrorClass) => error instanceof ErrorClass);
  if (stage === 'before-connect') {
    return failureLine(
      'refused-before-connect',
      known ? error.message : 'Migration refused before database connection'
    );
  }
  if (stage === 'after-ledger' && known) {
    return failureLine('refused-ledger-or-catalog', error.message);
  }
  const sqlState = postgresSqlState(error);
  if (sqlState) return failureLine('failed-sqlstate', 'PostgreSQL migration failed', sqlState);
  return failureLine('failed-no-state', 'Migration failed without readable ledger state');
}

export function parseJournaledRangeMigrationArgs(argv) {
  const apply = argv.includes('--apply');
  const yes = argv.includes('--yes');
  if (apply && !yes) throw new JournaledRangeMigrationError('--apply requires --yes');
  if (argv.some((arg) => !['--apply', '--yes'].includes(arg))) {
    throw new JournaledRangeMigrationError('Unknown journaled migration argument');
  }
  return { apply, yes };
}

async function count0053BackfillEligible(client) {
  const column = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM pg_attribute
      WHERE attrelid = to_regclass('public.fund_scenario_calculation_runs')
        AND attname = 'queued_event_recorded_at'
        AND NOT attisdropped
    ) AS present
  `);
  if (column.rows[0]?.present !== true) return null;

  const result = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM public.fund_scenario_calculation_runs AS run
    WHERE run."queued_event_recorded_at" IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.fund_scenario_set_events AS event
        WHERE event."fund_id" = run."fund_id"
          AND event."scenario_set_id" = run."scenario_set_id"
          AND event."event_type" = 'calculation_queued'
          AND event."change_summary_json"->>'correlation_id' = run."correlation_id"
      )
  `);
  return Number(result.rows[0]?.count ?? 0);
}

function assertAllManifestsClean({ audits, manifests }) {
  if (
    !Array.isArray(audits) ||
    audits.length !== manifests.length ||
    audits.some(
      (audit, index) =>
        audit?.manifest !== manifests[index].name ||
        audit?.action !== 'SKIP' ||
        !Array.isArray(audit?.objects) ||
        audit.objects.some(
          (object) =>
            object.action !== 'SKIP' || !Array.isArray(object.deltas) || object.deltas.length !== 0
        )
    )
  ) {
    throw new JournaledRangeMigrationError(
      'Post-apply catalog must be clean across manifests 1-38'
    );
  }
}

/**
 * @param {{
 *   connectionString: string;
 *   apply: boolean;
 *   expectedTargetFingerprint?: string;
 *   stdout?: { write: (chunk: string) => unknown };
 *   clientFactory?: (options: { connectionString: string }) => import('pg').Client;
 *   progress?: { stage: 'before-connect' | 'before-ledger' | 'after-ledger' };
 * }} options
 */
export async function runJournaledRangeMigration({
  connectionString,
  apply,
  expectedTargetFingerprint,
  stdout = process.stdout,
  clientFactory = ({ connectionString: target }) => new Client({ connectionString: target }),
  progress = { stage: 'before-connect' },
  migrationsDir: migrationDirectory = migrationsDir,
  manifestDir: manifestDirectory = manifestDir,
}) {
  const {
    targetEntries,
    baselineEntries,
    manifests: allManifests,
  } = await loadJournaledRangeMigrations({
    migrationsDir: migrationDirectory,
    manifestDir: manifestDirectory,
  });
  assertDirectDatabaseUrl(connectionString);

  const targetManifests = allManifests.filter(({ order }) => order >= 27 && order <= 38);
  const client = clientFactory({ connectionString });
  let lockAcquired = false;
  let beforeLedger;
  let backfillEligibleBefore = null;
  let backfillEligibleAfter = null;
  let measureBackfill = false;

  try {
    progress.stage = 'before-ledger';
    await client.connect();
    const databaseIdentity = await readDatabaseIdentity(client);
    if (apply) {
      // The driver's effective endpoint, not the URL authority: connection-string
      // ?host= and ?port= override the authority.
      const targetFingerprint =
        typeof client.host === 'string' && client.host.length > 0
          ? computeTargetFingerprint({
              directHost: client.host,
              port: client.port,
              database: databaseIdentity.database,
              user: databaseIdentity.user,
            })
          : null;
      if (
        targetFingerprint === null ||
        typeof expectedTargetFingerprint !== 'string' ||
        expectedTargetFingerprint.length === 0 ||
        expectedTargetFingerprint !== targetFingerprint
      ) {
        throw new JournaledRangeTargetError('Target fingerprint missing or mismatched');
      }
    }

    await acquireAdvisoryLock(client);
    lockAcquired = true;
    await setApplyTimeouts(client);
    const serverVersion = await client.query('SHOW server_version_num');
    if (Number(serverVersion.rows[0]?.server_version_num) >= 170000) {
      await client.query("SET transaction_timeout = '10min'");
    }

    beforeLedger = await readMigrationLedger(client);
    progress.stage = 'after-ledger';
    const preState = classifyJournaledRangeLedgerState({
      ledgerRows: beforeLedger,
      baselineEntries,
      targetEntries,
    });

    await assertAdr074BaselineCatalog({
      client,
      allManifests,
      preState,
      stdout,
    });
    const preAudit = await runReconciliation({
      client,
      manifests: targetManifests,
      apply: false,
      stdout: quietOutput,
    });
    const preSentinelCatalog = await readCurrentForecastSentinelCatalog(client);
    await assertJournaledRangeCatalog({
      client,
      appliedTargetCount: preState.appliedTargetCount,
      audits: preAudit.audits,
      sentinelCatalog: preSentinelCatalog,
      manifests: targetManifests,
    });

    // 0053's NULL-only backfill runs only while 0053 is unledgered (applied count below 4).
    measureBackfill = preState.appliedTargetCount < 4;
    if (measureBackfill) backfillEligibleBefore = await count0053BackfillEligible(client);

    const buildResult = (postState, applied) => ({
      preState: {
        state: preState.state,
        appliedTargetCount: preState.appliedTargetCount,
        lastAppliedTag: preState.lastAppliedTag,
      },
      postState,
      applied,
      baselineKind: preState.baselineKind,
      migrationRange: targetEntries.map(({ tag }) => tag),
      backfillEligibleBefore,
      backfillEligibleAfter,
    });

    if (!apply || preState.state === 'complete') {
      if (!apply) {
        stdout.write(
          `journaled-0050-0061: ledger readback ${preState.state} ${preState.appliedTargetCount}/12\n`
        );
      }
      return buildResult(preState.state, false);
    }

    const slice = await createJournaledRangeMigrationFolder({
      migrationsDir: migrationDirectory,
      entries: targetEntries,
    });
    try {
      await migrate(drizzle(client), {
        migrationsFolder: slice.directory,
        migrationsTable: 'drizzle_migrations',
        migrationsSchema: 'public',
      });
      stdout.write('journaled-0050-0061: migration transaction committed\n');
    } finally {
      await slice.cleanup();
    }

    const afterLedger = await readMigrationLedger(client);
    const postState = classifyJournaledRangeLedgerState({
      ledgerRows: afterLedger,
      baselineEntries,
      targetEntries,
    });
    if (postState.state !== 'complete') {
      throw new JournaledRangeMigrationError(
        `Post-apply ledger must be complete; got ${postState.state}`
      );
    }
    if (
      afterLedger.length !==
        beforeLedger.length + targetEntries.length - preState.appliedTargetCount ||
      beforeLedger.some(
        (row, index) =>
          row.hash !== afterLedger[index].hash ||
          String(row.created_at) !== String(afterLedger[index].created_at)
      )
    ) {
      throw new JournaledRangeMigrationError(
        'Post-apply ledger did not preserve exact predecessor history'
      );
    }

    const postAudit = await runReconciliation({
      client,
      manifests: allManifests,
      apply: false,
      stdout: quietOutput,
    });
    assertAllManifestsClean({ audits: postAudit.audits, manifests: allManifests });
    const postSentinelCatalog = await readCurrentForecastSentinelCatalog(client);
    await assertJournaledRangeCatalog({
      client,
      appliedTargetCount: targetEntries.length,
      audits: postAudit.audits.filter(({ manifest }) =>
        targetManifests.some((targetManifest) => targetManifest.name === manifest)
      ),
      sentinelCatalog: postSentinelCatalog,
      manifests: targetManifests,
    });

    if (measureBackfill) {
      backfillEligibleAfter = await count0053BackfillEligible(client);
    }
    return buildResult('complete', true);
  } finally {
    try {
      if (lockAcquired) await releaseAdvisoryLock(client);
    } finally {
      await client.end();
    }
  }
}

export async function runJournaledRangeMigrationCli({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const stage = { stage: 'before-connect' };
  try {
    const { apply } = parseJournaledRangeMigrationArgs(argv);
    const result = await runJournaledRangeMigration({
      connectionString: env.DATABASE_URL ?? '',
      apply,
      expectedTargetFingerprint: apply ? env.EXPECTED_TARGET_FINGERPRINT : undefined,
      stdout,
      progress: stage,
    });
    if (env.JOURNALED_0050_0061_MIGRATION_RESULT_PATH) {
      await writeFile(
        env.JOURNALED_0050_0061_MIGRATION_RESULT_PATH,
        `${JSON.stringify(result)}\n`,
        { mode: 0o600 }
      );
    }
    return 0;
  } catch (error) {
    stderr.write(`${formatJournaledRangeFailure(error, stage.stage)}\n`);
    return 1;
  }
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectExecution) {
  runJournaledRangeMigrationCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
