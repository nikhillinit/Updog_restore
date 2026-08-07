import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadManifests, runReconciliation } from '../../scripts/reconcile-prod-schema.mjs';
import {
  assertAcceptedTargetAuditVector,
  parseRecoveryArgs,
  runRecoveryCli,
  runProdJournaledMigrationRecovery,
} from '../../scripts/run-prod-journaled-migrations.mjs';
import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../helpers/testcontainers';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const BASELINE_TAG = '0044_internal_analysis';
const BASELINE_LEDGER_TIMESTAMP = 1775356800000;
const FIRST_TARGET_LEDGER_TIMESTAMP = 1785368400000;
const EXPECTED_TARGET_LEDGER_TIMESTAMPS = [
  '1785368400000',
  '1785454800000',
  '1785541200000',
  '1785627600000',
  '1785714000000',
];
const TARGET_TABLES = [
  'internal_capital_envelope_versions',
  'internal_economics_policy_versions',
  'internal_lp_economics_runs',
  'task_evidence_links',
  'quarterly_review_rosters',
  'quarterly_review_companies',
  'quarterly_review_items',
  'quarterly_review_command_receipts',
  'kpi_observations',
];
const EXPECTED_COMPLETE_AUDITS = [
  { manifest: 'internal-economics-policy-runs', action: 'SKIP' },
  { manifest: 'internal-economics-certification', action: 'SKIP' },
  { manifest: 'internal-economics-linkage', action: 'SKIP' },
  { manifest: 'quarterly-review-workflow', action: 'SKIP' },
  { manifest: 'kpi-observations', action: 'SKIP' },
];

const skipIfNoDocker =
  !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';
const createdDatabases: string[] = [];

let adminPool: Pool | undefined;
let startedTestContainers = false;

describe.skipIf(skipIfNoDocker)('journaled production migration recovery PostgreSQL proof', () => {
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      await setupTestContainers();
      startedTestContainers = true;
    }
    adminPool = new Pool({ connectionString: testDatabaseConnectionString(), max: 1 });
  }, 120_000);

  afterAll(async () => {
    if (adminPool) {
      for (const databaseName of createdDatabases.reverse()) {
        await adminPool.query(
          `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`
        );
      }
      await adminPool.end();
    }
    if (startedTestContainers) await cleanupTestContainers();
  });

  it('audits, applies, and replays only journaled migrations 0045 through 0049', async () => {
    const connectionString = await createProductionShapedDatabase('recovery');
    const auditOutput = captureOutput();

    expect(parseRecoveryArgs([])).toEqual({ apply: false, yes: false });
    await expect(
      runProdJournaledMigrationRecovery({
        connectionString,
        apply: false,
        stdout: auditOutput,
      })
    ).resolves.toEqual({ state: 'ready', applied: false });
    expect(auditOutput.text()).toContain('0045_internal_economics_policy_runs');
    expect(auditOutput.text()).toContain('ready');
    const databaseUrl = new URL(connectionString);
    expect(auditOutput.text()).not.toContain(databaseUrl.hostname);
    expect(auditOutput.text()).not.toContain(databaseUrl.username);
    expect(auditOutput.text()).not.toContain(databaseUrl.password);

    await withPool(connectionString, async (pool) => {
      const catalog = await pool.query<{ name: string; relation: string | null }>(
        `
          SELECT name, to_regclass('public.' || name)::text AS relation
          FROM unnest($1::text[]) AS target(name)
          ORDER BY name
        `,
        [TARGET_TABLES]
      );
      expect(catalog.rows.every(({ relation }) => relation === null)).toBe(true);
    });

    await expect(
      runProdJournaledMigrationRecovery({
        connectionString,
        apply: true,
        stdout: captureOutput(),
      })
    ).resolves.toEqual({ state: 'complete', applied: true });

    await withPool(connectionString, async (pool) => {
      expect(await targetLedgerTimestamps(pool)).toEqual(EXPECTED_TARGET_LEDGER_TIMESTAMPS);

      const manifests = (await loadManifests()).filter(
        (manifest) => manifest.order >= 22 && manifest.order <= 26
      );
      const postApply = await runReconciliation({
        client: pool,
        manifests,
        apply: false,
        stdout: captureOutput(),
      });
      expect(postApply.audits.map(({ manifest, action }) => [manifest, action])).toEqual(
        manifests.map(({ name }) => [name, 'SKIP'])
      );
    });

    await expect(
      runProdJournaledMigrationRecovery({
        connectionString,
        apply: true,
        stdout: captureOutput(),
      })
    ).resolves.toEqual({ state: 'complete', applied: false });

    await withPool(connectionString, async (pool) => {
      expect(await targetLedgerTimestamps(pool)).toEqual(EXPECTED_TARGET_LEDGER_TIMESTAMPS);
    });
  });

  it('rolls back all target DDL and ledger inserts when migration 0047 refuses drift', async () => {
    const connectionString = await createProductionShapedDatabase('rollback');

    await withPool(connectionString, async (pool) => {
      await pool.query('ALTER TABLE tasks ADD CONSTRAINT tasks_id_fund_unique UNIQUE (id)');
    });

    await expect(
      runProdJournaledMigrationRecovery({
        connectionString,
        apply: true,
        stdout: captureOutput(),
      })
    ).rejects.toThrow(
      /internal_economics_linkage_partial_catalog_state: existing tasks_id_fund_unique must exactly equal UNIQUE \(id, fund_id\) before replay/
    );

    await withPool(connectionString, async (pool) => {
      const ledger = await pool.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM public.drizzle_migrations
          WHERE created_at >= $1
        `,
        [FIRST_TARGET_LEDGER_TIMESTAMP]
      );
      expect(ledger.rows[0]?.count).toBe('0');

      const catalog = await pool.query<{ relation: string | null }>(
        "SELECT to_regclass('public.internal_capital_envelope_versions')::text AS relation"
      );
      expect(catalog.rows[0]?.relation).toBeNull();
    });
  });

  it('requires explicit confirmation and rejects pooler URLs before connecting', async () => {
    expect(parseRecoveryArgs(['--apply', '--yes'])).toEqual({ apply: true, yes: true });
    expect(() => parseRecoveryArgs(['--apply'])).toThrow(/--apply requires --yes/);
    await expect(
      runProdJournaledMigrationRecovery({
        connectionString: 'postgres://u:p@invalid-pooler.example/db',
        apply: false,
        stdout: captureOutput(),
      })
    ).rejects.toThrow(/pooled database URL/);
  });

  it('requires the exact ordered five-manifest all-SKIP vector for complete state', () => {
    expect(() =>
      assertAcceptedTargetAuditVector({
        ledgerState: 'complete',
        audits: EXPECTED_COMPLETE_AUDITS,
      })
    ).not.toThrow();

    const malformedVectors = [
      [],
      EXPECTED_COMPLETE_AUDITS.slice(0, -1),
      [
        ...EXPECTED_COMPLETE_AUDITS.slice(0, -1),
        { manifest: 'renamed-kpi-observations', action: 'SKIP' },
      ],
      [
        EXPECTED_COMPLETE_AUDITS[1],
        EXPECTED_COMPLETE_AUDITS[0],
        ...EXPECTED_COMPLETE_AUDITS.slice(2),
      ],
      [...EXPECTED_COMPLETE_AUDITS.slice(0, -1), EXPECTED_COMPLETE_AUDITS[3]],
    ];

    for (const audits of malformedVectors) {
      expect(() => assertAcceptedTargetAuditVector({ ledgerState: 'complete', audits })).toThrow(
        /not recoverable/
      );
    }
  });

  it('classifies CLI connection and authentication failures without leaking endpoint details', async () => {
    const refusedUrl = new URL('postgres://leaky_user:leaky_password@127.0.0.1:1/leaky_db');
    const refusedError = captureOutput();
    await expect(
      runRecoveryCli({
        argv: [],
        env: { DATABASE_URL: refusedUrl.toString() },
        stdout: captureOutput(),
        stderr: refusedError,
      })
    ).resolves.toBe(1);
    expect(refusedError.text()).toContain('Database connection failed (ECONNREFUSED)');
    expectOutputExcludesUrl(refusedError.text(), refusedUrl);

    const authUrl = new URL(testDatabaseConnectionString());
    authUrl.password = 'leaky_wrong_password';
    const authError = captureOutput();
    await expect(
      runRecoveryCli({
        argv: [],
        env: { DATABASE_URL: authUrl.toString() },
        stdout: captureOutput(),
        stderr: authError,
      })
    ).resolves.toBe(1);
    expect(authError.text()).toContain('PostgreSQL recovery failed (SQLSTATE 28P01)');
    expectOutputExcludesUrl(authError.text(), authUrl);
  });
});

async function createProductionShapedDatabase(suffix: string): Promise<string> {
  if (!adminPool) throw new Error('Admin pool not initialized');
  const databaseName = `prod_journaled_${suffix}_${process.pid}_${Date.now()}`.toLowerCase();
  createdDatabases.push(databaseName);
  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  const connectionString = databaseConnectionString(databaseName);
  await runMigrationsWithConnectionString(connectionString, BASELINE_TAG);
  await withPool(connectionString, async (pool) => {
    await pool.query('DELETE FROM public.drizzle_migrations WHERE created_at > $1', [
      BASELINE_LEDGER_TIMESTAMP,
    ]);
  });
  return connectionString;
}

async function targetLedgerTimestamps(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ created_at: string }>(
    `
      SELECT created_at::text
      FROM public.drizzle_migrations
      WHERE created_at >= $1
      ORDER BY created_at
    `,
    [FIRST_TARGET_LEDGER_TIMESTAMP]
  );
  return result.rows.map(({ created_at: createdAt }) => createdAt);
}

function captureOutput(): { write(chunk: string): boolean; text(): string } {
  const chunks: string[] = [];
  return {
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    text() {
      return chunks.join('');
    },
  };
}

function expectOutputExcludesUrl(output: string, url: URL): void {
  expect(output).not.toContain(url.hostname);
  expect(output).not.toContain(url.username);
  expect(output).not.toContain(url.password);
}

function testDatabaseConnectionString(): string {
  return process.env.TEST_DATABASE_URL ?? getPostgresConnectionString();
}

function databaseConnectionString(databaseName: string): string {
  const base = new URL(testDatabaseConnectionString());
  base.pathname = `/${databaseName}`;
  return base.toString();
}

async function withPool<T>(
  connectionString: string,
  callback: (pool: Pool) => Promise<T>
): Promise<T> {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    return await callback(pool);
  } finally {
    await pool.end();
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}
