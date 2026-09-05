/**
 * @group integration
 * @group testcontainers
 *
 * Real-Postgres proof for financial-facts terminal-head resolution.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_4,
  FINANCIAL_FACTS_POLICY_VERSION_1_3_0,
} from '../../shared/contracts/financial-facts-snapshot-v1.contract';
import { combinedSchema } from '../../server/db-schema';
import { resolveTerminalFactsHead } from '../../server/services/financial-facts/terminal-head';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const STARTUP_TIMEOUT_MS = 120_000;
const cloudDbUrl = process.env['TEST_DATABASE_URL'];
const useDocker =
  process.env['RUN_DOCKER_FINANCIAL_FACTS_TERMINAL_HEAD'] === '1' ||
  process.env['CI'] === 'true' ||
  process.env['CI'] === '1';
const skipTest = !cloudDbUrl && !useDocker;

let container: import('@testcontainers/postgresql').StartedPostgreSqlContainer | null = null;
let adminPool: Pool | undefined;
let modulePool: Pool | undefined;
let moduleDb: ReturnType<typeof drizzle<typeof combinedSchema>>;
let connectionString = '';

async function resetSchema(): Promise<void> {
  await adminPool!.query('DROP EXTENSION IF EXISTS vector CASCADE');
  await adminPool!.query('DROP EXTENSION IF EXISTS pgcrypto CASCADE');
  await adminPool!.query('DROP SCHEMA IF EXISTS public CASCADE');
  await adminPool!.query('CREATE SCHEMA public');
  await adminPool!.query('GRANT ALL ON SCHEMA public TO public');
  await adminPool!.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
  try {
    await adminPool!.query('CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public');
  } catch {
    // Some TEST_DATABASE_URL providers do not expose pgvector.
  }
}

async function seedFund(): Promise<number> {
  const result = await adminPool!.query<{ id: number }>(`
    INSERT INTO funds (
      name, size, management_fee, carry_percentage, vintage_year, status, base_currency
    )
    VALUES ('Financial facts terminal-head fund', 100.00, 0.0200, 0.2000, 2026, 'active', 'USD')
    RETURNING id
  `);
  return result.rows[0]!.id;
}

async function insertSnapshot(
  fundId: number,
  suffix: string,
  supersedesSnapshotId: number | null = null
): Promise<number> {
  const result = await adminPool!.query<{ id: number }>(
    `
      INSERT INTO financial_facts_snapshots (
        fund_id, policy_version, payload_schema_id, as_of_date, knowledge_cutoff,
        vehicle_scope, vehicle_ids, selection_set_hash, source_facts_input_hash,
        snapshot_input_hash, payload, consumer_evaluations, idempotency_key, request_hash,
        supersedes_snapshot_id
      )
      VALUES (
        $1, $2, $3, '2026-06-30', '2026-07-01T00:00:00.000Z', 'fund_all', '[]'::jsonb,
        $4, $5, $6, '{}'::jsonb, '[]'::jsonb, $7, $8, $9
      )
      RETURNING id
    `,
    [
      fundId,
      FINANCIAL_FACTS_POLICY_VERSION_1_3_0,
      FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_4,
      '1'.repeat(64),
      '2'.repeat(64),
      `${fundId}-${suffix}`,
      `facts-${fundId}-${suffix}`,
      '3'.repeat(64),
      supersedesSnapshotId,
    ]
  );
  return result.rows[0]!.id;
}

async function resolve(fundId: number) {
  return resolveTerminalFactsHead(moduleDb as never, fundId);
}

describe.skipIf(skipTest)('financial facts terminal head', () => {
  beforeAll(async () => {
    if (cloudDbUrl) {
      connectionString = cloudDbUrl;
    } else {
      const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
      container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
        .withDatabase('test_db')
        .withUsername('test_user')
        .withPassword('test_password')
        .start();
      connectionString = container.getConnectionUri();
    }

    adminPool = new Pool({ connectionString, max: 10 });
    await resetSchema();
    await runMigrationsWithConnectionString(connectionString);
    modulePool = new Pool({ connectionString, max: 10 });
    moduleDb = drizzle(modulePool, { schema: combinedSchema });
  }, STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    await modulePool?.end();
    await adminPool?.end();
    await container?.stop();
  }, STARTUP_TIMEOUT_MS);

  beforeEach(async () => {
    await adminPool!.query('TRUNCATE TABLE funds RESTART IDENTITY CASCADE');
  });

  it('returns none when fund has no snapshots', async () => {
    const fundId = await seedFund();

    await expect(resolve(fundId)).resolves.toEqual({ kind: 'none' });
  });

  it('returns one terminal head after a valid lineage walk', async () => {
    const fundId = await seedFund();
    const rootId = await insertSnapshot(fundId, 'root');
    const headId = await insertSnapshot(fundId, 'head', rootId);

    await expect(resolve(fundId)).resolves.toEqual({
      kind: 'head',
      row: expect.objectContaining({ id: headId, supersedesSnapshotId: rootId }),
    });
  });

  it('selects the newest terminal across distinct historical as-of families', async () => {
    const fundId = await seedFund();
    const historicalRootId = await insertSnapshot(fundId, 'historical-root');
    const historicalHeadId = await insertSnapshot(fundId, 'historical-head', historicalRootId);
    await adminPool!.query(
      `
        UPDATE financial_facts_snapshots
        SET as_of_date = '2026-03-31', knowledge_cutoff = '2026-04-01T00:00:00.000Z'
        WHERE id IN ($1, $2)
      `,
      [historicalRootId, historicalHeadId]
    );
    const currentRootId = await insertSnapshot(fundId, 'current-root');
    const currentHeadId = await insertSnapshot(fundId, 'current-head', currentRootId);

    await expect(resolve(fundId)).resolves.toEqual({
      kind: 'head',
      row: expect.objectContaining({ id: currentHeadId, supersedesSnapshotId: currentRootId }),
    });
  });

  it('returns deterministic ids when two terminal heads exist', async () => {
    const fundId = await seedFund();
    const firstId = await insertSnapshot(fundId, 'first');
    const secondId = await insertSnapshot(fundId, 'second');

    await expect(resolve(fundId)).resolves.toEqual({
      kind: 'ambiguous',
      code: 'FACTS_HEAD_AMBIGUOUS',
      headIds: [firstId, secondId],
    });
  });

  it('returns lineage-invalid for a cycle', async () => {
    const fundId = await seedFund();
    const rootId = await insertSnapshot(fundId, 'root');
    await insertSnapshot(fundId, 'head', rootId);
    const firstId = await insertSnapshot(fundId, 'first');
    const secondId = await insertSnapshot(fundId, 'second');

    await adminPool!.query(
      `
        UPDATE financial_facts_snapshots
        SET supersedes_snapshot_id = CASE id
          WHEN $1 THEN $2
          WHEN $2 THEN $1
        END
        WHERE id IN ($1, $2)
      `,
      [firstId, secondId]
    );

    await expect(resolve(fundId)).resolves.toEqual({
      kind: 'invalid',
      code: 'FACTS_LINEAGE_INVALID',
      reason: 'cycle',
    });
  });

  it('returns lineage-invalid for a missing predecessor', async () => {
    const fundId = await seedFund();
    const constraintName = 'financial_facts_snapshots_supersedes_fund_fk';

    await adminPool!.query(
      `ALTER TABLE financial_facts_snapshots DROP CONSTRAINT ${constraintName}`
    );
    try {
      await insertSnapshot(fundId, 'detached', 999_999);

      await expect(resolve(fundId)).resolves.toEqual({
        kind: 'invalid',
        code: 'FACTS_LINEAGE_INVALID',
        reason: 'detached',
      });
    } finally {
      await adminPool!.query('TRUNCATE TABLE financial_facts_snapshots RESTART IDENTITY CASCADE');
      await adminPool!.query(`
        ALTER TABLE financial_facts_snapshots
        ADD CONSTRAINT ${constraintName}
        FOREIGN KEY (supersedes_snapshot_id, fund_id)
        REFERENCES financial_facts_snapshots (id, fund_id)
      `);
    }
  });
});
