#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

import {
  acquireAdvisoryLock,
  assertDirectDatabaseUrl,
  loadManifests,
  ReconcileError,
  releaseAdvisoryLock,
  runReconciliation,
  setApplyTimeouts,
} from './reconcile-prod-schema.mjs';
import {
  assertCurrentForecastRawMigrationSafeCatalog,
  classifyCurrentForecastLedgerState,
  createCurrentForecastMigrationFolder,
  CURRENT_FORECAST_SENTINELS,
  loadCurrentForecastBaselineLedger,
  loadCurrentForecastMigrationRange,
} from './current-forecast-journaled-migration-range.mjs';

const { Client } = pg;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(repoRoot, 'migrations');
const SAFE_CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
]);

export class CurrentForecastMigrationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CurrentForecastMigrationError';
  }
}

export function parseCurrentForecastMigrationArgs(argv) {
  const apply = argv.includes('--apply');
  const yes = argv.includes('--yes');
  if (apply && !yes) throw new CurrentForecastMigrationError('--apply requires --yes');
  if (argv.some((arg) => !['--apply', '--yes'].includes(arg))) {
    throw new CurrentForecastMigrationError('Unknown Current Forecast migration argument');
  }
  return { apply, yes };
}

/**
 * @param {{
 *   connectionString: string;
 *   apply: boolean;
 *   stdout?: { write: (chunk: string) => unknown };
 *   clientFactory?: (options: { connectionString: string }) => import('pg').Client;
 * }} options
 */
export async function runCurrentForecastJournaledMigrationRecovery({
  connectionString,
  apply,
  stdout = process.stdout,
  clientFactory = ({ connectionString: target }) => new Client({ connectionString: target }),
}) {
  assertDirectDatabaseUrl(connectionString);
  const client = clientFactory({ connectionString });
  let lockAcquired = false;
  try {
    await client.connect();
    await acquireAdvisoryLock(client);
    lockAcquired = true;
    await setApplyTimeouts(client);

    const baselineEntries = await loadCurrentForecastBaselineLedger({ migrationsDir });
    const targetEntries = await loadCurrentForecastMigrationRange({ migrationsDir });
    const manifests = (await loadManifests()).filter(({ order }) => order >= 27 && order <= 32);
    if (manifests.length !== 6)
      throw new CurrentForecastMigrationError('Expected schema manifests 27-32');
    const preState = classifyCurrentForecastLedgerState({
      ledgerRows: await readMigrationLedger(client),
      baselineEntries,
      targetEntries,
    });
    const preAudit = await auditTargetManifests(client, manifests);
    assertCurrentForecastRawMigrationSafeCatalog({
      appliedTargetCount: preState.appliedTargetCount,
      audits: preAudit.audits,
      catalog: await readCurrentForecastSentinelCatalog(client),
    });
    writeSummary({ stdout, label: 'before', state: preState, audits: preAudit.audits });

    if (!apply || preState.state === 'complete') {
      return { preState, postState: preState.state, applied: false };
    }

    const slice = await createCurrentForecastMigrationFolder({ migrationsDir });
    try {
      await migrate(drizzle(client), {
        migrationsFolder: slice.directory,
        migrationsTable: 'drizzle_migrations',
        migrationsSchema: 'public',
      });
    } finally {
      await slice.cleanup();
    }

    const postState = classifyCurrentForecastLedgerState({
      ledgerRows: await readMigrationLedger(client),
      baselineEntries,
      targetEntries,
    });
    if (postState.state !== 'complete') {
      throw new CurrentForecastMigrationError(
        `Post-apply ledger must be complete; got ${postState.state}`
      );
    }
    const postAudit = await auditTargetManifests(client, manifests);
    assertCurrentForecastRawMigrationSafeCatalog({
      appliedTargetCount: 6,
      audits: postAudit.audits,
      catalog: await readCurrentForecastSentinelCatalog(client),
    });
    writeSummary({ stdout, label: 'after', state: postState, audits: postAudit.audits });
    return { preState, postState: 'complete', applied: true };
  } finally {
    try {
      if (lockAcquired) await releaseAdvisoryLock(client);
    } finally {
      await client.end();
    }
  }
}

async function readMigrationLedger(client) {
  const result = await client.query(
    'SELECT hash, created_at FROM public.drizzle_migrations ORDER BY created_at'
  );
  return result.rows;
}

async function readCurrentForecastSentinelCatalog(client) {
  /** @type {Array<{ table: string, present: boolean, constraints: Array<Record<string, unknown>>, indexes: Array<Record<string, unknown>> }>} */
  const catalog = [];
  for (const sentinel of CURRENT_FORECAST_SENTINELS) {
    const relation = await client.query('SELECT to_regclass($1) AS relation', [
      `public.${sentinel.table}`,
    ]);
    const present = relation.rows[0]?.relation !== null;
    if (!present) {
      catalog.push({ table: sentinel.table, present, constraints: [], indexes: [] });
      continue;
    }
    const constraints = await client.query(
      `SELECT conname AS name, pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
        WHERE conrelid = $1::regclass
        ORDER BY conname`,
      [`public.${sentinel.table}`]
    );
    const indexes = await client.query(
      `SELECT indexname AS name, indexdef AS definition
         FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = $1
        ORDER BY indexname`,
      [sentinel.table]
    );
    catalog.push({
      table: sentinel.table,
      present,
      constraints: constraints.rows,
      indexes: indexes.rows,
    });
  }
  return catalog;
}

function auditTargetManifests(client, manifests) {
  return runReconciliation({
    client,
    manifests,
    apply: false,
    stdout: /** @type {typeof process.stdout} */ (/** @type {unknown} */ ({ write: () => true })),
  });
}

function writeSummary({ stdout, label, state, audits }) {
  stdout.write(`Current Forecast migration state ${label}: ${JSON.stringify(state)}\n`);
  for (const { manifest, action } of audits) stdout.write(`${manifest}: ${action}\n`);
}

export async function runCurrentForecastMigrationCli({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  try {
    const { apply } = parseCurrentForecastMigrationArgs(argv);
    const result = await runCurrentForecastJournaledMigrationRecovery({
      connectionString: env.DATABASE_URL ?? '',
      apply,
      stdout,
    });
    if (env.CURRENT_FORECAST_MIGRATION_RESULT_PATH) {
      await writeFile(env.CURRENT_FORECAST_MIGRATION_RESULT_PATH, `${JSON.stringify(result)}\n`, {
        mode: 0o600,
      });
    }
    return 0;
  } catch (error) {
    stderr.write(`[run-current-forecast-journaled-migrations] ${classifyCliError(error)}\n`);
    return 1;
  }
}

function classifyCliError(error) {
  if (error instanceof CurrentForecastMigrationError) return error.message;
  /** @type {string | null} */
  let kind = null;
  if (error instanceof ReconcileError) {
    const details = /** @type {{ kind?: string }} */ (error.details);
    kind = details.kind ?? null;
  }
  if (kind === 'missing-database-url') return 'DATABASE_URL is missing or memory://';
  if (kind === 'pooler-url-refused')
    return 'Refusing pooled database URL; DDL requires direct endpoint';
  if (kind === 'advisory-lock-contended') return 'Another schema migration run holds advisory lock';
  const code = typeof error?.code === 'string' ? error.code : null;
  if (code && SAFE_CONNECTION_ERROR_CODES.has(code)) return `Database connection failed (${code})`;
  if (code && /^[0-9A-Z]{5}$/.test(code)) return `PostgreSQL migration failed (SQLSTATE ${code})`;
  return 'Current Forecast migration failed; inspect secured diagnostics';
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectExecution) {
  runCurrentForecastMigrationCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
