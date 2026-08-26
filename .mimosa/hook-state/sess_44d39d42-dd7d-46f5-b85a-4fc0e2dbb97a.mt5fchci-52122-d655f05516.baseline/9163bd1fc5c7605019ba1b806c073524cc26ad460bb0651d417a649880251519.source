import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';
import {
  createCandidateCurrentForecastReference,
  currentForecastReferenceIdempotencyKey,
  activateCurrentForecast,
  advanceCurrentForecastPointer,
  type CurrentForecastReferenceDatabase,
} from '../../server/services/current-forecast-reference-service';
import { updateCurrentForecastCalculationMode } from '../../server/services/fund-calculation-mode-service';
import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../helpers/testcontainers';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';
import { CURRENT_FORECAST_V2_CALC_VERSION } from '../../server/services/current-forecast-v2-service';

const skipIfNoDocker =
  !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';

let adminPool: Pool | undefined;
let connectionString = '';
let databaseName = '';
let startedTestContainers = false;

describe.skipIf(skipIfNoDocker)('current-forecast reference PostgreSQL proof', () => {
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      await setupTestContainers();
      startedTestContainers = true;
    }

    adminPool = new Pool({ connectionString: testDatabaseConnectionString(), max: 1 });
    databaseName = `current_forecast_ref_${process.pid}_${Date.now()}`.toLowerCase();
    await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    connectionString = databaseConnectionString(databaseName);
    await runMigrationsWithConnectionString(connectionString);
  }, 120_000);

  afterAll(async () => {
    if (adminPool && databaseName.startsWith('current_forecast_ref_')) {
      await adminPool.query(
        `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`
      );
      await adminPool.end();
    }
    if (startedTestContainers) await cleanupTestContainers();
  });

  it('inserts a candidate with a bounded deterministic idempotency key', async () => {
    await withPool(connectionString, async (pool) => {
      const fundId = await insertedId(
        pool,
        `
          INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
          VALUES ($1, 10000000, '0.0200', '0.2000', 2026)
          RETURNING id
        `,
        [`Current forecast reference proof ${Date.now()}`]
      );
      const factsSnapshotId = await insertedId(
        pool,
        `
          INSERT INTO financial_facts_snapshots (
            fund_id, policy_version, payload_schema_id, as_of_date, knowledge_cutoff,
            vehicle_scope, vehicle_ids, selection_set_hash, source_facts_input_hash,
            snapshot_input_hash, payload, consumer_evaluations, idempotency_key, request_hash
          ) VALUES (
            $1, 'financial-facts-policy/1.2.0', 'financial-facts-payload/3', '2026-06-30', NOW(),
            'fund_all', '[]'::jsonb, $2, $3, $4, '{}'::jsonb, '[]'::jsonb, $5, $6
          )
          RETURNING id
        `,
        [
          fundId,
          hex64(`selection-${fundId}`),
          hex64(`source-${fundId}`),
          hex64(`snapshot-${fundId}`),
          `facts-${fundId}`,
          hex64(`request-${fundId}`),
        ]
      );
      const planVersionId = await insertedId(
        pool,
        `
          INSERT INTO current_plan_versions (
            fund_id, version, source_config_id, source_config_version,
            source_facts_snapshot_id, deployable_capital_usd, plan_transformation_version,
            allocations, pacing_assumptions, cohort_assumptions, reserve_policy_version,
            assumptions_hash, idempotency_key, request_hash
          ) VALUES (
            $1, 1, 1, 1, $2, '10000000.000000', 'plan-transformation/1.0.0',
            '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, 'reserve-policy/1.0.0', $3, $4, $5
          )
          RETURNING id
        `,
        [fundId, factsSnapshotId, hex64(`plan-${fundId}`), `plan-${fundId}`, hex64('plan-req')]
      );
      const fundSnapshotId = await insertedId(
        pool,
        `
          INSERT INTO fund_snapshots (
            fund_id, type, payload, calc_version, correlation_id, snapshot_time
          ) VALUES ($1, 'CURRENT_FORECAST_V2', '{}'::jsonb, $3, $2, NOW())
          RETURNING id
        `,
        [
          fundId,
          `00000000-0000-4000-8000-${String(fundId).padStart(12, '0')}`,
          CURRENT_FORECAST_V2_CALC_VERSION,
        ]
      );

      const inputHash = 'a'.repeat(64);
      const resultHash = 'b'.repeat(64);
      const idempotencyKey = currentForecastReferenceIdempotencyKey({
        fundId,
        inputHash,
        resultHash,
      });
      const result = await createCandidateCurrentForecastReference({
        fundId,
        basis: {
          fundSnapshotId,
          currentPlanVersionId: planVersionId,
          financialFactsSnapshotId: factsSnapshotId,
          inputHash,
          resultHash,
          assumptionsHash: 'c'.repeat(64),
          engineVersion: 'current-forecast-v2-engine/1.0.0',
          methodologyVersion: 'cohort-projection-v2/1.0.0',
        },
        idempotencyKey,
        database: drizzle(pool, { schema }) as unknown as CurrentForecastReferenceDatabase,
      });

      expect(idempotencyKey).toMatch(/^cfref:\d+:[0-9a-f]{64}$/);
      expect(idempotencyKey).toHaveLength(`cfref:${fundId}:`.length + 64);
      expect(result.replayed).toBe(false);
      expect(result.row.candidate).toBe(true);

      const persisted = await pool.query<{ idempotency_key: string }>(
        'SELECT idempotency_key FROM current_forecast_references WHERE id = $1',
        [result.row.id]
      );
      expect(persisted.rows[0]?.idempotency_key).toBe(idempotencyKey);

      const database = drizzle(pool, { schema }) as unknown as CurrentForecastReferenceDatabase;
      const modeOff = await updateCurrentForecastCalculationMode({
        fundId,
        expectedVersion: 0,
        configuredMode: 'off',
        idempotencyKey: `mode-off-${fundId}`,
        actorId: null,
        sources: { sourceInputHash: `mode-source-${fundId}` },
        now: new Date('2026-07-01T00:00:00.000Z'),
        database,
      });
      expect(modeOff.response).toMatchObject({
        calculationKey: 'current_forecast',
        configuredMode: 'off',
        version: 1,
      });

      const modeShadow = await updateCurrentForecastCalculationMode({
        fundId,
        expectedVersion: 1,
        configuredMode: 'shadow',
        idempotencyKey: `mode-shadow-${fundId}`,
        actorId: null,
        sources: { sourceInputHash: `mode-source-${fundId}` },
        now: new Date('2026-07-01T00:00:00.000Z'),
        database,
      });
      expect(modeShadow.response).toMatchObject({
        calculationKey: 'current_forecast',
        configuredMode: 'shadow',
        version: 2,
      });

      const activation = await activateCurrentForecast({
        fundId,
        referenceId: result.row.id,
        expectedVersion: 2,
        idempotencyKey: `activate-${fundId}`,
        actorId: null,
        database,
        verifyGreenCandidate: async () => [],
      });
      expect(activation.replayed).toBe(false);
      expect(activation.response).toMatchObject({
        calculationKey: 'current_forecast',
        configuredMode: 'on',
        cutoverReferenceId: result.row.id,
        version: 3,
      });

      const next = await createCandidateCurrentForecastReference({
        fundId,
        basis: {
          fundSnapshotId,
          currentPlanVersionId: planVersionId,
          financialFactsSnapshotId: factsSnapshotId,
          inputHash: 'd'.repeat(64),
          resultHash: 'e'.repeat(64),
          assumptionsHash: 'f'.repeat(64),
          engineVersion: 'current-forecast-v2-engine/1.0.0',
          methodologyVersion: 'cohort-projection-v2/1.0.0',
        },
        idempotencyKey: `pointer-${fundId}`,
        database,
      });
      const pointer = await advanceCurrentForecastPointer({
        fundId,
        referenceId: next.row.id,
        actorId: null,
        database,
      });
      expect(pointer).toEqual({ cutoverReferenceId: next.row.id, version: 4 });

      const lifecycle = await pool.query<{
        old_superseded_by: number | null;
        new_candidate: boolean;
        cutover_reference_id: number | null;
      }>(
        `
          SELECT
            (SELECT superseded_by_reference_id FROM current_forecast_references WHERE id = $1) AS old_superseded_by,
            (SELECT candidate FROM current_forecast_references WHERE id = $2) AS new_candidate,
            (SELECT cutover_reference_id FROM fund_calculation_modes WHERE fund_id = $3 AND calculation_key = 'current_forecast') AS cutover_reference_id
        `,
        [result.row.id, next.row.id, fundId]
      );
      expect(lifecycle.rows[0]).toEqual({
        old_superseded_by: next.row.id,
        new_candidate: false,
        cutover_reference_id: next.row.id,
      });
    });
  });
});

function testDatabaseConnectionString(): string {
  return process.env.TEST_DATABASE_URL ?? getPostgresConnectionString();
}

function databaseConnectionString(database: string): string {
  const base = new URL(testDatabaseConnectionString());
  base.pathname = `/${database}`;
  return base.toString();
}

async function insertedId(pool: Pool, query: string, values: unknown[]): Promise<number> {
  const result = await pool.query<{ id: number }>(query, values);
  const id = result.rows[0]?.id;
  if (typeof id !== 'number') throw new Error('Expected an inserted id.');
  return id;
}

async function withPool<T>(database: string, callback: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: database, max: 4 });
  try {
    return await callback(pool);
  } finally {
    await pool.end();
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function hex64(seed: string): string {
  let value = '';
  for (let index = 0; value.length < 64; index += 1) {
    value += (seed.charCodeAt(index % seed.length) + index).toString(16).padStart(2, '0');
  }
  return value.slice(0, 64);
}
