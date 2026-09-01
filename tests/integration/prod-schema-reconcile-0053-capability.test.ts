import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  ACTION_APPLY_MISSING_DDL,
  ACTION_REFUSE_FOR_HUMAN,
  ACTION_SKIP,
  auditManifest,
  LEDGER_TABLE,
  loadManifests,
  prepare0053G3ReleaseGateHardeningCapability,
  RECONCILE_LOCK_ID,
  runReconciliation,
} from '../../scripts/reconcile-prod-schema.mjs';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const STARTUP_TIMEOUT_MS = 90_000;
const TEST_TIMEOUT_MS = 90_000;
const skipIfNoDocker = !process.env.CI && process.platform === 'win32';

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
  testDatabaseName = `prod_schema_0053_capability_${testDatabaseNumber++}`;
  const adminClient = new Client({ connectionString });
  await adminClient.connect();
  try {
    await adminClient.query(`CREATE DATABASE "${testDatabaseName}"`);
  } finally {
    await adminClient.end();
  }
  testConnectionString = connectionStringForDatabase(testDatabaseName);
  await runMigrationsWithConnectionString(
    testConnectionString,
    '0052_g3_capital_call_notification_outbox'
  );
  await applyPostEraNonTargetShapes();
}

// The capability pins the LIVE canonical manifest vector, so every non-target
// manifest must audit SKIP. Manifests 31-32 (journals 0054-0055) are pinned by
// tag, not tail position — their parents all predate 0050 — so replay their
// raw shapes to give the clone the post-era shape without touching the
// absent 0053 target the capability must converge.
async function applyPostEraNonTargetShapes(): Promise<void> {
  const migrations = await Promise.all([
    readFile('migrations/0054_operating_decisions_spine.sql', 'utf8'),
    readFile('migrations/0055_current_forecast_recompute_commands.sql', 'utf8'),
  ]);
  const client = new Client({ connectionString: testConnectionString });
  await client.connect();
  try {
    for (const migration of migrations) {
      await client.query(migration.replaceAll('--> statement-breakpoint', '\n'));
    }
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

async function captureRejectedPathState(client: Client): Promise<{
  targetTable: string | null;
  workflowRunIdType: string | null;
  workflowRunAttemptType: string | null;
  ledgerTable: string | null;
  ledgerRows: Array<Record<string, unknown>> | null;
  targetCommandRows: Array<Record<string, unknown>> | null;
  releaseCanaryRows: Array<Record<string, unknown>>;
}> {
  const catalog = await client.query(
    `SELECT
       to_regclass('public.fund_scenario_calculation_commands') AS "targetTable",
       (
         SELECT data_type
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'release_canary_runs'
           AND column_name = 'workflow_run_id'
       ) AS "workflowRunIdType",
       (
         SELECT data_type
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'release_canary_runs'
           AND column_name = 'workflow_run_attempt'
       ) AS "workflowRunAttemptType",
       to_regclass($1::text) AS "ledgerTable"`,
    [`public.${LEDGER_TABLE}`]
  );
  const row = catalog.rows[0];
  const ledgerTable = row?.ledgerTable === null ? null : String(row?.ledgerTable ?? '');
  const targetTable = row?.targetTable === null ? null : String(row?.targetTable ?? '');
  const ledgerRows = ledgerTable
    ? (await client.query(`SELECT * FROM "${LEDGER_TABLE}" ORDER BY "id" ASC`)).rows.map(
        (ledgerRow) => ({ ...ledgerRow })
      )
    : null;
  const targetCommandRows = targetTable
    ? (
        await client.query('SELECT * FROM "fund_scenario_calculation_commands" ORDER BY "id" ASC')
      ).rows.map((targetCommandRow) => ({ ...targetCommandRow }))
    : null;
  const releaseCanaryRows = (
    await client.query('SELECT * FROM "release_canary_runs" ORDER BY "id" ASC')
  ).rows.map((releaseCanaryRow) => ({ ...releaseCanaryRow }));

  return {
    targetTable,
    workflowRunIdType:
      row?.workflowRunIdType === null ? null : String(row?.workflowRunIdType ?? ''),
    workflowRunAttemptType:
      row?.workflowRunAttemptType === null ? null : String(row?.workflowRunAttemptType ?? ''),
    ledgerTable,
    ledgerRows,
    targetCommandRows,
    releaseCanaryRows,
  };
}

function injectAfterAdvisoryLock(client: Client, inject: () => Promise<void>): Client {
  let injected = false;
  const query = client.query.bind(client);
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property !== 'query') return Reflect.get(target, property, receiver);
      return async (...args: Parameters<Client['query']>) => {
        const result = await query(...args);
        if (!injected && typeof args[0] === 'string' && args[0].includes('pg_try_advisory_lock')) {
          injected = true;
          await inject();
        }
        return result;
      };
    },
  });
}

async function expectAdvisoryLockReleased(client: Client): Promise<void> {
  const lock = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [
    RECONCILE_LOCK_ID,
  ]);
  expect(lock.rows[0]?.acquired).toBe(true);
  await client.query('SELECT pg_advisory_unlock($1)', [RECONCILE_LOCK_ID]);
}

describe.skipIf(skipIfNoDocker)('0053 production-schema capability', () => {
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
    'converges target-only 0053 drift while preserving unrelated state and emits lock-time evidence',
    async () => {
      const client = new Client({ connectionString: testConnectionString });
      await client.connect();
      try {
        await client.query(
          'CREATE TABLE unrelated_0053_drift_preserved (id integer PRIMARY KEY, sentinel text NOT NULL)'
        );
        await client.query(
          "INSERT INTO unrelated_0053_drift_preserved (id, sentinel) VALUES (1, 'preserve-me')"
        );
        const manifests = await loadManifests();
        const target = await prepare0053G3ReleaseGateHardeningCapability();
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
          capability: target,
          stdout: {
            write: (chunk: string) => {
              output.push(chunk);
              if (chunk.includes('PROD_SCHEMA_LOCK_TIME_VECTOR_V1=')) {
                markerQueryIndex = queryTrace.length;
              }
            },
          },
        });

        expect(result.applied).toEqual(['g3-release-gate-hardening']);
        expect(
          output.filter((line) => line.includes('PROD_SCHEMA_LOCK_TIME_VECTOR_V1=')).length
        ).toBe(1);
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
              'SELECT id, sentinel FROM unrelated_0053_drift_preserved ORDER BY id ASC'
            )
          ).rows
        ).toEqual([{ id: 1, sentinel: 'preserve-me' }]);
        const postAudit = [];
        for (const manifest of manifests) {
          postAudit.push(await auditManifest(client, manifest));
        }
        expect(postAudit.every((audit) => audit.action === ACTION_SKIP)).toBe(true);
      } finally {
        await client.end();
      }
    },
    TEST_TIMEOUT_MS
  );

  it(
    'rejects post-lock target-shape drift before reconciler mutation (break: stale pre-lock audit authority)',
    async () => {
      const reconciliationClient = new Client({ connectionString: testConnectionString });
      const driftClient = new Client({ connectionString: testConnectionString });
      await Promise.all([reconciliationClient.connect(), driftClient.connect()]);
      try {
        const manifests = await loadManifests();
        const target = await prepare0053G3ReleaseGateHardeningCapability();
        const targetManifest = manifests.find((manifest) => manifest.name === target.manifestName);
        expect(targetManifest).toBeDefined();
        const output: string[] = [];
        let stateAfterInjectedDrift:
          Awaited<ReturnType<typeof captureRejectedPathState>> | undefined;
        let auditAfterInjectedDrift: Awaited<ReturnType<typeof auditManifest>> | undefined;

        const injectedClient = injectAfterAdvisoryLock(reconciliationClient, async () => {
          await runMigrationsWithConnectionString(
            testConnectionString,
            '0053_g3_release_gate_hardening'
          );
          await driftClient.query(
            `INSERT INTO "release_canary_runs" (
              "release_version",
              "release_sha",
              "deployment_id",
              "worker_deployment_id",
              "correlation_id",
              "principal_user_id",
              "expires_at"
            ) VALUES ('test-release', 'test-sha', 'test-deployment', 'test-worker', 'test-correlation', 999999, now() + interval '1 day')`
          );
          await driftClient.query(
            'ALTER TABLE "release_canary_runs" ALTER COLUMN "workflow_run_id" TYPE text'
          );
          auditAfterInjectedDrift = await auditManifest(driftClient, targetManifest!);
          expect(auditAfterInjectedDrift.action).toBe(ACTION_REFUSE_FOR_HUMAN);
          stateAfterInjectedDrift = await captureRejectedPathState(driftClient);
        });

        await expect(
          runReconciliation({
            client: injectedClient,
            manifests,
            apply: true,
            capability: target,
            stdout: { write: (chunk: string) => output.push(chunk) },
          })
        ).rejects.toMatchObject({ details: { kind: 'human-review-required' } });

        expect(stateAfterInjectedDrift).toEqual({
          targetTable: 'fund_scenario_calculation_commands',
          workflowRunIdType: 'text',
          workflowRunAttemptType: 'integer',
          ledgerTable: null,
          ledgerRows: null,
          targetCommandRows: [],
          releaseCanaryRows: [
            expect.objectContaining({
              release_version: 'test-release',
              release_sha: 'test-sha',
              correlation_id: 'test-correlation',
            }),
          ],
        });
        expect(await captureRejectedPathState(driftClient)).toEqual(stateAfterInjectedDrift);
        expect(await auditManifest(driftClient, targetManifest!)).toEqual(auditAfterInjectedDrift);
        expect(
          output.filter((line) => line.includes('PROD_SCHEMA_LOCK_TIME_VECTOR_V1=')).length
        ).toBe(0);
        await expectAdvisoryLockReleased(driftClient);
      } finally {
        await Promise.all([reconciliationClient.end(), driftClient.end()]);
      }
    },
    TEST_TIMEOUT_MS
  );

  it(
    'rejects committed capability repeat with reintroduced target drift before marker or mutation (break: repeat veto removed)',
    async () => {
      const reconciliationClient = new Client({ connectionString: testConnectionString });
      const observerClient = new Client({ connectionString: testConnectionString });
      await Promise.all([reconciliationClient.connect(), observerClient.connect()]);
      try {
        const manifests = await loadManifests();
        const target = await prepare0053G3ReleaseGateHardeningCapability();
        const targetManifest = manifests.find((manifest) => manifest.name === target.manifestName);
        expect(targetManifest).toBeDefined();
        const firstOutput: string[] = [];
        const firstResult = await runReconciliation({
          client: reconciliationClient,
          manifests,
          apply: true,
          capability: target,
          stdout: { write: (chunk: string) => firstOutput.push(chunk) },
        });
        expect(firstResult.applied).toEqual([target.manifestName]);
        expect(
          firstOutput.filter((line) => line.includes('PROD_SCHEMA_LOCK_TIME_VECTOR_V1=')).length
        ).toBe(1);

        await observerClient.query(
          'ALTER TABLE "release_canary_runs" DROP COLUMN "workflow_run_attempt" CASCADE'
        );
        const auditBeforeRepeat = await auditManifest(observerClient, targetManifest!);
        expect(auditBeforeRepeat.action).toBe(ACTION_APPLY_MISSING_DDL);
        const stateBeforeRepeat = await captureRejectedPathState(observerClient);
        expect(stateBeforeRepeat).toMatchObject({
          targetTable: 'fund_scenario_calculation_commands',
          workflowRunAttemptType: null,
          targetCommandRows: [],
          releaseCanaryRows: [],
        });
        expect(stateBeforeRepeat.ledgerRows).toHaveLength(1);
        const repeatOutput: string[] = [];

        await expect(
          runReconciliation({
            client: reconciliationClient,
            manifests,
            apply: true,
            capability: target,
            stdout: { write: (chunk: string) => repeatOutput.push(chunk) },
          })
        ).rejects.toMatchObject({ details: { kind: 'committed-0053-capability-repeat' } });

        expect(await captureRejectedPathState(observerClient)).toEqual(stateBeforeRepeat);
        expect(await auditManifest(observerClient, targetManifest!)).toEqual(auditBeforeRepeat);
        expect(
          repeatOutput.filter((line) => line.includes('PROD_SCHEMA_LOCK_TIME_VECTOR_V1=')).length
        ).toBe(0);
        await expectAdvisoryLockReleased(observerClient);
      } finally {
        await Promise.all([reconciliationClient.end(), observerClient.end()]);
      }
    },
    TEST_TIMEOUT_MS
  );
});
