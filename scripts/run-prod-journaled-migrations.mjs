#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

import {
  acquireAdvisoryLock,
  assertDirectDatabaseUrl,
  loadManifests,
  releaseAdvisoryLock,
  runReconciliation,
  setApplyTimeouts,
} from './reconcile-prod-schema.mjs';
import {
  classifyTargetLedgerState,
  createTargetMigrationFolder,
  loadTargetMigrationRange,
} from './prod-journaled-migration-range.mjs';

const { Client } = pg;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(repoRoot, 'migrations');
const EXPECTED_READY_VECTOR = Object.freeze([
  ['internal-economics-policy-runs', 'REFUSE-FOR-HUMAN'],
  ['internal-economics-certification', 'REFUSE-FOR-HUMAN'],
  ['internal-economics-linkage', 'REFUSE-FOR-HUMAN'],
  ['quarterly-review-workflow', 'REFUSE-FOR-HUMAN'],
  ['kpi-observations', 'APPLY-MISSING-DDL'],
]);

export function parseRecoveryArgs(argv) {
  const apply = argv.includes('--apply');
  const yes = argv.includes('--yes');
  if (apply && !yes) {
    throw new Error('--apply requires --yes to confirm a schema mutation');
  }
  return { apply, yes };
}

export async function runProdJournaledMigrationRecovery({
  connectionString,
  apply,
  stdout = process.stdout,
}) {
  assertDirectDatabaseUrl(connectionString);

  const client = new Client({ connectionString });
  let lockAcquired = false;
  try {
    await client.connect();
    await acquireAdvisoryLock(client);
    lockAcquired = true;
    await setApplyTimeouts(client);

    const targetEntries = await loadTargetMigrationRange({ migrationsDir });
    const manifests = (await loadManifests()).filter(
      (manifest) => manifest.order >= 22 && manifest.order <= 26
    );
    const ledgerState = classifyTargetLedgerState({
      ledgerRows: await readMigrationLedger(client),
      targetEntries,
    });
    const audit = await auditTargetManifests(client, manifests);
    assertAcceptedState({ ledgerState, audits: audit.audits });
    writeAuditSummary({ stdout, targetEntries, ledgerState, audits: audit.audits });

    if (!apply) {
      return { state: ledgerState, applied: false };
    }

    const slice = await createTargetMigrationFolder({ migrationsDir });
    try {
      await migrate(drizzle(client), {
        migrationsFolder: slice.directory,
        migrationsTable: 'drizzle_migrations',
        migrationsSchema: 'public',
      });
    } finally {
      await slice.cleanup();
    }

    const postApply = await auditTargetManifests(client, manifests);
    assertAllSkip(postApply.audits, 'Post-apply manifest audit');
    const finalState = classifyTargetLedgerState({
      ledgerRows: await readMigrationLedger(client),
      targetEntries,
    });
    if (finalState !== 'complete') {
      throw new Error(`Post-apply target migration ledger must be complete; got ${finalState}`);
    }

    return { state: finalState, applied: ledgerState === 'ready' };
  } finally {
    try {
      if (lockAcquired) {
        await releaseAdvisoryLock(client);
      }
    } finally {
      await client.end();
    }
  }
}

async function auditTargetManifests(client, manifests) {
  return runReconciliation({
    client,
    manifests,
    apply: false,
    stdout: {
      write() {
        return true;
      },
    },
  });
}

async function readMigrationLedger(client) {
  const result = await client.query(
    'SELECT created_at FROM public.drizzle_migrations ORDER BY created_at'
  );
  return result.rows;
}

function assertAcceptedState({ ledgerState, audits }) {
  const vector = audits.map(({ manifest, action }) => [manifest, action]);
  if (ledgerState === 'ready' && vectorsEqual(vector, EXPECTED_READY_VECTOR)) return;
  if (ledgerState === 'complete') {
    assertAllSkip(audits, 'Complete-ledger manifest audit');
    return;
  }
  throw new Error(
    `Target migration ledger/manifest state is not recoverable: ${ledgerState} ${JSON.stringify(vector)}`
  );
}

function assertAllSkip(audits, label) {
  const nonSkip = audits.filter(({ action }) => action !== 'SKIP');
  if (nonSkip.length > 0) {
    throw new Error(
      `${label} expected all SKIP: ${JSON.stringify(
        nonSkip.map(({ manifest, action }) => [manifest, action])
      )}`
    );
  }
}

function vectorsEqual(actual, expected) {
  return (
    actual.length === expected.length &&
    actual.every(
      ([manifest, action], index) =>
        manifest === expected[index][0] && action === expected[index][1]
    )
  );
}

function writeAuditSummary({ stdout, targetEntries, ledgerState, audits }) {
  stdout.write(`Target migrations: ${targetEntries.map(({ tag }) => tag).join(', ')}\n`);
  stdout.write(`Target ledger state: ${ledgerState}\n`);
  for (const { manifest, action } of audits) {
    stdout.write(`${manifest}: ${action}\n`);
  }
}

export async function runRecoveryCli({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  try {
    const { apply } = parseRecoveryArgs(argv);
    await runProdJournaledMigrationRecovery({
      connectionString: env.DATABASE_URL,
      apply,
      stdout,
    });
    return 0;
  } catch (error) {
    stderr.write(
      `[run-prod-journaled-migrations] ${error instanceof Error ? error.message : String(error)}\n`
    );
    return 1;
  }
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  runRecoveryCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
