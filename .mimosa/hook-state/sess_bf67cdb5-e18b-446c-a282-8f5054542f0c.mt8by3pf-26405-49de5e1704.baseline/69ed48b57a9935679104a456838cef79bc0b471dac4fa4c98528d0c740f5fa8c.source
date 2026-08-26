import { randomUUID } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { proveScenarioComparisonLineage } from '../../../server/services/fund-scenario-comparison-lineage-service';

const STARTUP_TIMEOUT_MS = 90_000;
const fundId = 123;
const scenarioSetId = '00000000-0000-0000-0000-000000000111';
const scenarioRunId = '00000000-0000-0000-0000-000000000222';
const inputHash = 'a'.repeat(64);
const skipWithoutPostgres =
  !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';

let postgres: StartedPostgreSqlContainer | undefined;
let pool: Pool;
let schemaName: string;

describe.skipIf(skipWithoutPostgres)('scenario comparison lineage relational proof', () => {
  beforeAll(async () => {
    const connectionString =
      process.env.TEST_DATABASE_URL ??
      (await startPostgres()).getConnectionUri();
    schemaName = `scenario_lineage_${randomUUID().replaceAll('-', '')}`;

    const adminPool = new Pool({ connectionString });
    await adminPool.query(`CREATE SCHEMA ${schemaName}`);
    await adminPool.end();

    pool = new Pool({
      connectionString,
      options: `-c search_path=${schemaName}`,
    });
    await createMinimalLineageSchema();
  }, STARTUP_TIMEOUT_MS);

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE fund_scenario_calculation_runs, fund_snapshots, calc_runs'
    );
    await seedComparableChain();
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(`DROP SCHEMA ${schemaName} CASCADE`);
      await pool.end();
    }
    await postgres?.stop();
  });

  it('proves a comparable chain through both authoritative run links', async () => {
    await expect(prove()).resolves.toEqual({
      kind: 'comparable',
      economicsSnapshotId: 41,
      economicsRunId: 17,
      scenarioSnapshotId: 42,
      scenarioRunId,
      source: 'fund_scenario_calculation_runs',
      asOfDate: '2026-06-30',
      hashKind: 'scenario-input-hash-v2',
      inputHash,
    });
  });

  it.each([
    {
      name: 'scenario date mismatch',
      mutate: () =>
        pool.query(
          `UPDATE fund_scenario_calculation_runs
              SET model_inputs_as_of_date = DATE '2026-07-01'`
        ),
      reason: 'model_inputs_date_mismatch',
    },
    {
      name: 'legacy null lineage',
      mutate: () =>
        pool.query(
          `UPDATE fund_scenario_calculation_runs
              SET comparison_lineage_version = NULL,
                  model_inputs_as_of_date = NULL`
        ),
      reason: 'legacy_row',
    },
    {
      name: 'wrong lineage marker',
      mutate: () =>
        pool.query(
          `UPDATE fund_scenario_calculation_runs
              SET comparison_lineage_version = 'comparison-lineage-v0'`
        ),
      reason: 'lineage_version_mismatch',
    },
    {
      name: 'wrong hash kind',
      mutate: () =>
        pool.query(
          `UPDATE fund_scenario_calculation_runs
              SET hash_kind = 'scenario-input-hash-v1'`
        ),
      reason: 'hash_kind_mismatch',
    },
    {
      name: 'uppercase hash',
      mutate: () =>
        pool.query(
          `UPDATE fund_scenario_calculation_runs
              SET input_hash = $1`,
          ['A'.repeat(64)]
        ),
      reason: 'invalid_input_hash',
    },
    {
      name: 'snapshot state mismatch',
      mutate: () =>
        pool.query(
          `UPDATE fund_snapshots
              SET state_hash = $1
            WHERE id = 42`,
          ['b'.repeat(64)]
        ),
      reason: 'snapshot_hash_mismatch',
    },
    {
      name: 'non-completed run',
      mutate: () =>
        pool.query(
          `UPDATE fund_scenario_calculation_runs
              SET status = 'running'`
        ),
      reason: 'scenario_run_not_completed',
    },
    {
      name: 'missing scenario run link',
      mutate: () =>
        pool.query(
          `UPDATE fund_scenario_calculation_runs
              SET snapshot_id = 99`
        ),
      reason: 'scenario_run_link_missing',
    },
    {
      name: 'scenario run identity mismatch',
      mutate: () =>
        pool.query(
          `UPDATE fund_scenario_calculation_runs
              SET fund_id = 999`
        ),
      reason: 'scenario_run_identity_mismatch',
    },
    {
      name: 'economics run identity mismatch',
      mutate: () =>
        pool.query(
          `UPDATE calc_runs
              SET fund_id = 999`
        ),
      reason: 'economics_run_identity_mismatch',
    },
    {
      name: 'multiple completed links',
      mutate: () =>
        pool.query(
          `INSERT INTO fund_scenario_calculation_runs (
             id, fund_id, scenario_set_id, source_config_id, source_config_version,
             status, snapshot_id, comparison_lineage_version,
             model_inputs_as_of_date, hash_kind, input_hash
           )
           SELECT '00000000-0000-0000-0000-000000000223', fund_id, scenario_set_id,
                  source_config_id, source_config_version, status, snapshot_id,
                  comparison_lineage_version, model_inputs_as_of_date, hash_kind, input_hash
             FROM fund_scenario_calculation_runs
            WHERE id = $1`,
          [scenarioRunId]
        ),
      reason: 'multiple_scenario_run_links',
    },
  ])('fails closed for $name', async ({ mutate, reason }) => {
    await mutate();

    await expect(prove()).resolves.toEqual({ kind: 'unavailable', reason });
  });
});

async function startPostgres(): Promise<StartedPostgreSqlContainer> {
  postgres = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_password')
    .withStartupTimeout(STARTUP_TIMEOUT_MS)
    .start();
  return postgres;
}

async function createMinimalLineageSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE calc_runs (
      id integer PRIMARY KEY,
      fund_id integer NOT NULL,
      config_id integer NOT NULL,
      config_version integer NOT NULL,
      comparison_lineage_version text,
      model_inputs_as_of_date date
    );

    CREATE TABLE fund_snapshots (
      id integer PRIMARY KEY,
      fund_id integer NOT NULL,
      run_id integer,
      config_id integer NOT NULL,
      config_version integer NOT NULL,
      scenario_set_id uuid,
      type text NOT NULL,
      state_hash text,
      created_at timestamptz NOT NULL DEFAULT NOW()
    );

    CREATE TABLE fund_scenario_calculation_runs (
      id uuid PRIMARY KEY,
      fund_id integer NOT NULL,
      scenario_set_id uuid NOT NULL,
      source_config_id integer NOT NULL,
      source_config_version integer NOT NULL,
      status text NOT NULL,
      snapshot_id integer,
      comparison_lineage_version text,
      model_inputs_as_of_date date,
      hash_kind text,
      input_hash text NOT NULL
    );
  `);
}

async function seedComparableChain(): Promise<void> {
  await pool.query(
    `INSERT INTO calc_runs (
       id, fund_id, config_id, config_version,
       comparison_lineage_version, model_inputs_as_of_date
     ) VALUES (17, $1, 12, 4, 'comparison-lineage-v1', DATE '2026-06-30')`,
    [fundId]
  );
  await pool.query(
    `INSERT INTO fund_snapshots (
       id, fund_id, run_id, config_id, config_version,
       scenario_set_id, type, state_hash, created_at
     ) VALUES
       (41, $1, 17, 12, 4, NULL, 'ECONOMICS', NULL, TIMESTAMPTZ '2026-07-01T00:00:00Z'),
       (42, $1, NULL, 12, 4, $2, 'SCENARIOS', $3, TIMESTAMPTZ '2026-07-01T00:00:01Z')`,
    [fundId, scenarioSetId, inputHash]
  );
  await pool.query(
    `INSERT INTO fund_scenario_calculation_runs (
       id, fund_id, scenario_set_id, source_config_id, source_config_version,
       status, snapshot_id, comparison_lineage_version,
       model_inputs_as_of_date, hash_kind, input_hash
     ) VALUES (
       $4, $1, $2, 12, 4, 'completed', 42, 'comparison-lineage-v1',
       DATE '2026-06-30', 'scenario-input-hash-v2', $3
     )`,
    [fundId, scenarioSetId, inputHash, scenarioRunId]
  );
}

function prove() {
  return proveScenarioComparisonLineage(pool as never, {
    fundId,
    scenarioSetId,
    sourceConfigId: 12,
    sourceConfigVersion: 4,
  });
}
