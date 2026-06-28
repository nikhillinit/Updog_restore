import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgIdentifier } from '../../scripts/db-push-core.mjs';
import { loadManifests } from '../../scripts/reconcile-prod-schema.mjs';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const STARTUP_TIMEOUT_MS = 90_000;
const skipIfNoDocker = !process.env.CI && process.platform === 'win32';

let postgres: StartedPostgreSqlContainer | undefined;
let pool: Pool | undefined;

async function publicTables(activePool: Pool, tableNames: readonly string[]) {
  const result = await activePool.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name = ANY($1::text[])
    `,
    [tableNames]
  );

  return new Set(result.rows.map((row) => row.table_name));
}

async function publicConstraints(activePool: Pool, constraintNames: readonly string[]) {
  const result = await activePool.query<{ conname: string }>(
    `
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public'
        AND c.conname = ANY($1::text[])
    `,
    [constraintNames]
  );

  return new Set(result.rows.map((row) => row.conname));
}

describe.skipIf(skipIfNoDocker)('prod schema synthetic clone', () => {
  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_password')
      .withStartupTimeout(STARTUP_TIMEOUT_MS)
      .start();

    const connectionString = postgres.getConnectionUri();
    await runMigrationsWithConnectionString(connectionString);
    pool = new Pool({ connectionString, max: 1 });
  }, STARTUP_TIMEOUT_MS * 2);

  afterAll(async () => {
    await pool?.end();
    if (process.env.CI === 'true') {
      console.warn(
        '[prod-schema-clone] Postgres container left for CI cleanup after pg pool close'
      );
      return;
    }
    await postgres?.stop();
  });

  it('applies the PR-1 manifest tables and FK sentinels to an empty clone', async () => {
    expect(pool).toBeDefined();
    const manifests = await loadManifests();
    const expectedTables = manifests.flatMap((manifest) =>
      (manifest.expectedTables ?? []).map((table: { name: string }) => table.name)
    );
    const expectedConstraints = manifests
      .flatMap((manifest) =>
        (manifest.expectedTables ?? []).flatMap(
          (table: { constraints?: string[] }) => table.constraints ?? []
        )
      )
      .map(pgIdentifier);

    expect(expectedTables).toHaveLength(16);

    const migratedTables = await publicTables(pool!, expectedTables);
    const migratedConstraints = await publicConstraints(pool!, expectedConstraints);

    expect(expectedTables.filter((tableName) => !migratedTables.has(tableName))).toEqual([]);
    expect(
      expectedConstraints.filter((constraintName) => !migratedConstraints.has(constraintName))
    ).toEqual([]);
  });
});
