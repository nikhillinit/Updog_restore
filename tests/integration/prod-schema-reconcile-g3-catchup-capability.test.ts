import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  ACTION_SKIP,
  auditManifest,
  LEDGER_TABLE,
  loadManifests,
  prepareG3Catchup0050To0053Capability,
  RECONCILE_LOCK_ID,
  runReconciliation,
} from '../../scripts/reconcile-prod-schema.mjs';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const STARTUP_TIMEOUT_MS = 90_000;
const TEST_TIMEOUT_MS = 120_000;
const skipIfNoDocker = !process.env.CI && process.platform === 'win32';
const CATCHUP_MARKER = 'PROD_SCHEMA_G3_CATCHUP_LOCK_TIME_VECTOR_V1=';
const CATCHUP_TARGET_NAMES = [
  'g3-portfolio-and-calculation',
  'g3-canary',
  'g3-capital-call-notification-outbox',
  'g3-release-gate-hardening',
];

let postgres: StartedPostgreSqlContainer | undefined;
let connectionString = '';
let testConnectionString = '';
let testDatabaseName = '';
let testDatabaseNumber = 0;

function connectionStringForDatabase(databaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function createTestDatabase(): Promise<void> {
  testDatabaseName = `prod_schema_g3_catchup_${testDatabaseNumber++}`;
  const adminClient = new Client({ connectionString });
  await adminClient.connect();
  try {
    await adminClient.query(`CREATE DATABASE "${testDatabaseName}"`);
  } finally {
    await adminClient.end();
  }
  testConnectionString = connectionStringForDatabase(testDatabaseName);
  // Production parity: schema journal applied through 0049 only; migrations
  // 0050-0053 (the four catch-up targets) are absent.
  await runMigrationsWithConnectionString(testConnectionString, '0049_kpi_observations');
  await applyOperatingDecisionsSpineShape();
}

// The capability pins the LIVE canonical manifest vector, so every non-target
// manifest must audit SKIP. Manifest 31 (operating-decisions-spine, journal
// 0054) is pinned by tag, not tail position — its parents all predate 0050 —
// so replay it raw to give the clone the post-era shape without touching the
// absent catch-up targets the capability must converge.
async function applyOperatingDecisionsSpineShape(): Promise<void> {
  const migration = await readFile('migrations/0054_operating_decisions_spine.sql', 'utf8');
  const client = new Client({ connectionString: testConnectionString });
  await client.connect();
  try {
    await client.query(migration.replaceAll('--> statement-breakpoint', '\n'));
  } finally {
    await client.end();
  }
}

async function dropTestDatabase(): Promise<void> {
  const databaseName = testDatabaseName;
  testConnectionString = '';
  testDatabaseName = '';
  if (!databaseName) return;

  const adminClient = new Client({ connectionString });
  await adminClient.connect();
  try {
    await adminClient.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [databaseName]
    );
    await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  } finally {
    await adminClient.end();
  }
}

// Must run on a DIFFERENT session than the one that executed runReconciliation:
// advisory locks are session-level and reentrant, so a same-session re-acquire
// is a tautology and cannot detect a leak.
async function expectAdvisoryLockReleased(observerClient: Client): Promise<void> {
  const lock = await observerClient.query('SELECT pg_try_advisory_lock($1) AS acquired', [
    RECONCILE_LOCK_ID,
  ]);
  expect(lock.rows[0]?.acquired).toBe(true);
  await observerClient.query('SELECT pg_advisory_unlock($1)', [RECONCILE_LOCK_ID]);
}

interface LedgerSnapshot {
  ledgerTable: string | null;
  rows: Array<Record<string, unknown>> | null;
}

async function captureLedgerState(client: Client): Promise<LedgerSnapshot> {
  const catalog = await client.query('SELECT to_regclass($1::text) AS "ledgerTable"', [
    `public.${LEDGER_TABLE}`,
  ]);
  const ledgerTable =
    catalog.rows[0]?.ledgerTable === null ? null : String(catalog.rows[0]?.ledgerTable ?? '');
  const rows = ledgerTable
    ? (
        await client.query(
          `SELECT "manifest_name", "manifest_checksum", "committed_at" IS NOT NULL AS committed
           FROM "${LEDGER_TABLE}" ORDER BY "id" ASC`
        )
      ).rows.map((row) => ({ ...row }))
    : null;
  return { ledgerTable, rows };
}

describe.skipIf(skipIfNoDocker)('g3 catch-up 0050-0053 production-schema capability', () => {
  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withStartupTimeout(STARTUP_TIMEOUT_MS)
      .start();
    connectionString = postgres.getConnectionUri();
  }, STARTUP_TIMEOUT_MS * 2);

  beforeEach(createTestDatabase, TEST_TIMEOUT_MS);

  afterEach(dropTestDatabase, TEST_TIMEOUT_MS);

  afterAll(async () => {
    await postgres?.stop();
  });

  it(
    'converges the four pending catch-up targets in journal order while preserving unrelated state',
    async () => {
      const client = new Client({ connectionString: testConnectionString });
      const observerClient = new Client({ connectionString: testConnectionString });
      await Promise.all([client.connect(), observerClient.connect()]);
      try {
        await client.query(
          'CREATE TABLE unrelated_catchup_drift_preserved (id integer PRIMARY KEY, sentinel text NOT NULL)'
        );
        await client.query(
          "INSERT INTO unrelated_catchup_drift_preserved (id, sentinel) VALUES (1, 'preserve-me')"
        );
        const manifests = await loadManifests();
        const capability = await prepareG3Catchup0050To0053Capability();
        const output: string[] = [];
        const queryTrace: string[] = [];
        let markerQueryIndex: number | undefined;
        const tracedClient = {
          async query(text: string, params?: readonly unknown[]) {
            queryTrace.push(text);
            return client.query(text, params);
          },
        };
        const result = await runReconciliation({
          client: tracedClient,
          manifests,
          apply: true,
          capability,
          stdout: {
            write: (chunk: string) => {
              output.push(chunk);
              if (chunk.includes(CATCHUP_MARKER)) {
                markerQueryIndex = queryTrace.length;
              }
            },
          },
        });

        expect(result.applied).toEqual(CATCHUP_TARGET_NAMES);
        expect(output.filter((line) => line.includes(CATCHUP_MARKER)).length).toBe(1);
        expect(markerQueryIndex).toBeDefined();
        const firstPostAcceptanceOperation = queryTrace.findIndex(
          (text) =>
            text.startsWith('SET ') ||
            /^(BEGIN|COMMIT|ROLLBACK)$/.test(text) ||
            /^\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(text)
        );
        expect(firstPostAcceptanceOperation).toBeGreaterThanOrEqual(markerQueryIndex!);
        expect(
          (
            await client.query(
              'SELECT id, sentinel FROM unrelated_catchup_drift_preserved ORDER BY id ASC'
            )
          ).rows
        ).toEqual([{ id: 1, sentinel: 'preserve-me' }]);
        expect(
          (await client.query("SELECT to_regclass('public.capital_call_notification_outbox') AS t"))
            .rows[0]?.t
        ).toBe('capital_call_notification_outbox');

        // Ledger provenance: exactly one committed row per target, each
        // carrying a checksum (the resume-authorization authority).
        const ledger = await captureLedgerState(observerClient);
        expect(ledger.ledgerTable).toBe(LEDGER_TABLE);
        expect(ledger.rows).toHaveLength(4);
        expect(ledger.rows!.map((row) => row['manifest_name'])).toEqual(CATCHUP_TARGET_NAMES);
        for (const row of ledger.rows!) {
          expect(row['committed']).toBe(true);
          expect(String(row['manifest_checksum'])).toMatch(/^[0-9a-f]{64}$/);
        }

        const postAudit = [];
        for (const manifest of manifests) {
          postAudit.push(await auditManifest(client, manifest));
        }
        expect(postAudit.every((audit) => audit.action === ACTION_SKIP)).toBe(true);
        await expectAdvisoryLockReleased(observerClient);
      } finally {
        await Promise.all([client.end(), observerClient.end()]);
      }
    },
    TEST_TIMEOUT_MS
  );

  it(
    'rejects a fully committed catch-up repeat without mutation or marker',
    async () => {
      const client = new Client({ connectionString: testConnectionString });
      const observerClient = new Client({ connectionString: testConnectionString });
      await Promise.all([client.connect(), observerClient.connect()]);
      try {
        const manifests = await loadManifests();
        const capability = await prepareG3Catchup0050To0053Capability();
        const firstResult = await runReconciliation({
          client,
          manifests,
          apply: true,
          capability,
          stdout: { write: () => {} },
        });
        expect(firstResult.applied).toEqual(CATCHUP_TARGET_NAMES);

        const stateBeforeRepeat = await captureLedgerState(observerClient);
        expect(stateBeforeRepeat.rows).toHaveLength(4);

        const repeatOutput: string[] = [];
        await expect(
          runReconciliation({
            client,
            manifests,
            apply: true,
            capability,
            stdout: { write: (chunk: string) => repeatOutput.push(chunk) },
          })
        ).rejects.toMatchObject({
          details: { kind: 'committed-g3-catchup-capability-repeat' },
        });
        expect(repeatOutput.filter((line) => line.includes(CATCHUP_MARKER)).length).toBe(0);
        // No mutation on the rejected path: ledger state is byte-identical.
        expect(await captureLedgerState(observerClient)).toEqual(stateBeforeRepeat);
        await expectAdvisoryLockReleased(observerClient);
      } finally {
        await Promise.all([client.end(), observerClient.end()]);
      }
    },
    TEST_TIMEOUT_MS
  );

  it(
    'resumes an interrupted catch-up by applying only the uncommitted tail',
    async () => {
      const client = new Client({ connectionString: testConnectionString });
      const observerClient = new Client({ connectionString: testConnectionString });
      await Promise.all([client.connect(), observerClient.connect()]);
      try {
        const manifests = await loadManifests();
        const capability = await prepareG3Catchup0050To0053Capability();

        // First attempt: fail inside the second target's transaction (0051
        // g3-canary DDL). Target one (0050) commits its ledger row; the failed
        // manifest rolls back, leaving a genuine interrupted catch-up state.
        let injectedFailure = false;
        const failingClient = {
          async query(text: string, params?: readonly unknown[]) {
            if (
              !injectedFailure &&
              /CREATE TABLE (IF NOT EXISTS )?"?release_canary_runs"?/i.test(text)
            ) {
              injectedFailure = true;
              throw new Error('injected mid-catch-up interruption');
            }
            return client.query(text, params);
          },
        };
        await expect(
          runReconciliation({
            client: failingClient,
            manifests,
            apply: true,
            capability,
            stdout: { write: () => {} },
          })
        ).rejects.toThrow();
        await expectAdvisoryLockReleased(observerClient);

        const resumeOutput: string[] = [];
        const resumeResult = await runReconciliation({
          client,
          manifests,
          apply: true,
          capability,
          stdout: { write: (chunk: string) => resumeOutput.push(chunk) },
        });
        expect(resumeResult.applied).toEqual([
          'g3-canary',
          'g3-capital-call-notification-outbox',
          'g3-release-gate-hardening',
        ]);
        expect(resumeOutput.filter((line) => line.includes(CATCHUP_MARKER)).length).toBe(1);
        const postAudit = [];
        for (const manifest of manifests) {
          postAudit.push(await auditManifest(client, manifest));
        }
        expect(postAudit.every((audit) => audit.action === ACTION_SKIP)).toBe(true);
        await expectAdvisoryLockReleased(observerClient);
      } finally {
        await Promise.all([client.end(), observerClient.end()]);
      }
    },
    TEST_TIMEOUT_MS
  );

  it(
    'fails closed when a committed ledger row does not match the pinned manifest checksum',
    async () => {
      const client = new Client({ connectionString: testConnectionString });
      const observerClient = new Client({ connectionString: testConnectionString });
      await Promise.all([client.connect(), observerClient.connect()]);
      try {
        const manifests = await loadManifests();
        const capability = await prepareG3Catchup0050To0053Capability();

        // Interrupt after target one commits (same shape as the resume test),
        // leaving a genuine partial state where the veto loop is reachable.
        let injectedFailure = false;
        const failingClient = {
          async query(text: string, params?: readonly unknown[]) {
            if (
              !injectedFailure &&
              /CREATE TABLE (IF NOT EXISTS )?"?release_canary_runs"?/i.test(text)
            ) {
              injectedFailure = true;
              throw new Error('injected mid-catch-up interruption');
            }
            return client.query(text, params);
          },
        };
        await expect(
          runReconciliation({
            client: failingClient,
            manifests,
            apply: true,
            capability,
            stdout: { write: () => {} },
          })
        ).rejects.toThrow();

        // Forge a different-revision provenance for the committed target.
        await observerClient.query(
          `UPDATE "${LEDGER_TABLE}" SET "manifest_checksum" = repeat('0', 64)
           WHERE "manifest_name" = 'g3-portfolio-and-calculation'`
        );

        const repeatOutput: string[] = [];
        await expect(
          runReconciliation({
            client,
            manifests,
            apply: true,
            capability,
            stdout: { write: (chunk: string) => repeatOutput.push(chunk) },
          })
        ).rejects.toMatchObject({ details: { kind: 'human-review-required' } });
        expect(repeatOutput.filter((line) => line.includes(CATCHUP_MARKER)).length).toBe(0);
        await expectAdvisoryLockReleased(observerClient);
      } finally {
        await Promise.all([client.end(), observerClient.end()]);
      }
    },
    TEST_TIMEOUT_MS
  );

  it(
    'fails closed when a target shape exists without committed ledger evidence',
    async () => {
      // Apply migration 0050 out-of-band (journal runner, no reconcile ledger):
      // the target audits SKIP with no ledger row, which must veto the batch.
      await runMigrationsWithConnectionString(
        testConnectionString,
        '0050_g3_portfolio_and_calculation_schema'
      );
      const client = new Client({ connectionString: testConnectionString });
      const observerClient = new Client({ connectionString: testConnectionString });
      await Promise.all([client.connect(), observerClient.connect()]);
      try {
        const manifests = await loadManifests();
        const capability = await prepareG3Catchup0050To0053Capability();
        const output: string[] = [];
        await expect(
          runReconciliation({
            client,
            manifests,
            apply: true,
            capability,
            stdout: { write: (chunk: string) => output.push(chunk) },
          })
        ).rejects.toMatchObject({ details: { kind: 'human-review-required' } });
        expect(output.filter((line) => line.includes(CATCHUP_MARKER)).length).toBe(0);
        // No mutation: the ledger table was never created on the rejected path.
        expect((await captureLedgerState(observerClient)).ledgerTable).toBeNull();
        await expectAdvisoryLockReleased(observerClient);
      } finally {
        await Promise.all([client.end(), observerClient.end()]);
      }
    },
    TEST_TIMEOUT_MS
  );
});
