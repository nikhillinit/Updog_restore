import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ACTION_SKIP,
  auditManifest,
  loadManifests,
  prepare0053G3ReleaseGateHardeningCapability,
  runReconciliation,
} from '../../scripts/reconcile-prod-schema.mjs';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const STARTUP_TIMEOUT_MS = 90_000;
const TEST_TIMEOUT_MS = 90_000;
const skipIfNoDocker = !process.env.CI && process.platform === 'win32';

let postgres: StartedPostgreSqlContainer | undefined;
let connectionString = '';

describe.skipIf(skipIfNoDocker)('0053 production-schema capability', () => {
  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withStartupTimeout(STARTUP_TIMEOUT_MS)
      .start();
    connectionString = postgres.getConnectionUri();
    await runMigrationsWithConnectionString(
      connectionString,
      '0052_g3_capital_call_notification_outbox'
    );
  }, STARTUP_TIMEOUT_MS * 2);

  afterAll(async () => {
    await postgres?.stop();
  });

  it(
    'converges target-only 0053 drift while preserving unrelated state and emits lock-time evidence',
    async () => {
      const client = new Client({ connectionString });
      await client.connect();
      try {
        await client.query('CREATE TABLE unrelated_0053_drift_preserved (id integer PRIMARY KEY)');
        const manifests = await loadManifests();
        const target = await prepare0053G3ReleaseGateHardeningCapability();
        const output: string[] = [];
        const result = await runReconciliation({
          client,
          manifests,
          apply: true,
          capability: target,
          stdout: { write: (chunk: string) => output.push(chunk) },
        });

        expect(result.applied).toEqual(['g3-release-gate-hardening']);
        expect(
          output.filter((line) => line.includes('PROD_SCHEMA_LOCK_TIME_VECTOR_V1=')).length
        ).toBe(1);
        expect(
          (
            await client.query(
              "SELECT to_regclass('public.unrelated_0053_drift_preserved') AS table_name"
            )
          ).rows[0]?.table_name
        ).toBe('unrelated_0053_drift_preserved');
        const postAudit = await Promise.all(
          manifests.map((manifest) => auditManifest(client, manifest))
        );
        expect(postAudit.every((audit) => audit.action === ACTION_SKIP)).toBe(true);
      } finally {
        await client.end();
      }
    },
    TEST_TIMEOUT_MS
  );
});
