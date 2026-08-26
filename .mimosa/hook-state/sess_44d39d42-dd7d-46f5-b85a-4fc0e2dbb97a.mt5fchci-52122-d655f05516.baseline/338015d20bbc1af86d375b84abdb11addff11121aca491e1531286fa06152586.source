/**
 * Native PostgreSQL proof that an ACCEPTED KPI observation SURVIVES persistence.
 *
 * The unit suites around this feature all stub the store: the route tests mock
 * `kpi-observation-service` wholesale, and the service test drives an in-memory
 * `FakePorts` map. Both can only prove the handler serialized whatever it was
 * handed. This file closes that gap: it writes through the real service against
 * a real database, then RE-READS the row on a fresh connection and asserts the
 * stored values -- including the six-decimal numeric and the version bump.
 *
 * Uses a uniquely named disposable database. TEST_DATABASE_URL is preferred;
 * testcontainers remains the fallback used by existing PostgreSQL suites.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';
import type { KpiObservationCreateRequest } from '../../../shared/contracts/kpi/kpi-observation-v1.contract';
import {
  createKpiObservation,
  listKpiObservations,
  loadKpiObservation,
  reviewKpiObservation,
  toKpiObservationContract,
} from '../../../server/services/kpi/kpi-observation-service';

import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../../helpers/testcontainers';
import { runMigrationsWithConnectionString } from '../../helpers/testcontainers-migration';

/**
 * The service types its injectable handle as `typeof db`, which it does not
 * export. Recover it from a signature rather than restating it, so this proof
 * cannot drift from the service it is proving.
 */
type KpiDatabase = NonNullable<Parameters<typeof loadKpiObservation>[2]>['database'];

/** A real node-postgres drizzle handle, presented as the service's db type. */
function kpiDb(pool: Pool): KpiDatabase {
  return drizzle(pool, { schema }) as unknown as KpiDatabase;
}

const MIGRATION_TAG = '0049_kpi_observations';
const PERIOD = { start: '2026-04-01', end: '2026-06-30' };
const skipIfNoDocker =
  !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';

let adminPool: Pool | undefined;
let connectionString = '';
let databaseName = '';
let startedTestContainers = false;
let labelCounter = 0;

describe.skipIf(skipIfNoDocker)('KPI observation persistence PostgreSQL proof', () => {
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      await setupTestContainers();
      startedTestContainers = true;
    }

    adminPool = new Pool({ connectionString: adminConnectionString(), max: 1 });
    databaseName = `kpi0049_${process.pid}_${Date.now()}`.toLowerCase();
    await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    connectionString = databaseConnectionString(databaseName);

    await runMigrationsWithConnectionString(connectionString, MIGRATION_TAG);
  }, 120_000);

  afterAll(async () => {
    if (adminPool && databaseName.startsWith('kpi0049_')) {
      await adminPool.query(
        `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`
      );
      await adminPool.end();
    }
    if (startedTestContainers) await cleanupTestContainers();
  });

  it('an accepted observation survives persistence and is re-readable', async () => {
    const seeded = await withPool((pool) => seedBasis(pool, 'kpi-accept'));

    // Write through the real service, on its own connection.
    const created = await withPool(async (pool) => {
      return createKpiObservation(
        {
          fundId: seeded.fundId,
          request: requestFor(seeded.portfolioCompanyId),
          source: 'manual',
          actorId: seeded.userId,
          idempotencyKey: uniqueLabel('idem'),
        },
        { database: kpiDb(pool) }
      );
    });

    expect(created.replayed).toBe(false);
    expect(created.observation.reviewStatus).toBe('pending');
    expect(created.observation.version).toBe(1);

    // Accept it, on a second connection.
    const reviewed = await withPool(async (pool) => {
      return reviewKpiObservation(
        {
          fundId: seeded.fundId,
          observationId: created.observation.observationId,
          expectedVersion: created.observation.version,
          reviewStatus: 'accepted',
          reviewComment: 'Matches the Q2 board deck',
          actorId: seeded.userId,
        },
        { database: kpiDb(pool) }
      );
    });

    expect(reviewed).not.toBeNull();

    // THE POINT: re-read on a THIRD, fresh connection. Nothing in this block
    // shares state with the writers above, so a pass means the database really
    // holds the accepted row rather than a handler having echoed it back.
    await withPool(async (pool) => {
      const database = kpiDb(pool);
      const row = await loadKpiObservation(
        seeded.fundId,
        created.observation.observationId,
        { database }
      );
      expect(row).not.toBeNull();

      const persisted = toKpiObservationContract(row!);
      expect(persisted.reviewStatus).toBe('accepted');
      expect(persisted.reviewComment).toBe('Matches the Q2 board deck');
      expect(persisted.reviewedAt).not.toBeNull();
      expect(persisted.version).toBe(2);
      expect(persisted.fundId).toBe(seeded.fundId);
      expect(persisted.portfolioCompanyId).toBe(seeded.portfolioCompanyId);
      expect(persisted.metric).toBe('revenue_arr');
      expect(persisted.periodStart).toBe(PERIOD.start);
      expect(persisted.periodEnd).toBe(PERIOD.end);
      expect(persisted.basis).toBe('actual');

      // Money keeps its exact six-decimal string through the numeric column;
      // a float round-trip would surface here.
      expect(persisted.value).toEqual({
        valueKind: 'money',
        amountUsd: '2100000.000000',
      });

      // Raw catalog read, bypassing the service's own mapping entirely.
      const raw = await pool.query(
        `SELECT review_status, review_comment, version, value_amount::text AS value_amount,
                reviewed_by, reviewed_at
           FROM kpi_observations WHERE id = $1 AND fund_id = $2`,
        [created.observation.observationId, seeded.fundId]
      );
      expect(raw.rowCount).toBe(1);
      expect(raw.rows[0].review_status).toBe('accepted');
      expect(raw.rows[0].review_comment).toBe('Matches the Q2 board deck');
      expect(Number(raw.rows[0].version)).toBe(2);
      expect(Number(raw.rows[0].value_amount)).toBe(2100000);
      expect(Number(raw.rows[0].reviewed_by)).toBe(seeded.userId);
      expect(raw.rows[0].reviewed_at).not.toBeNull();

      // And it is visible to the fund-scoped list read.
      const listed = await listKpiObservations(
        seeded.fundId,
        { reviewStatus: 'accepted' },
        { database }
      );
      expect(listed.map((entry) => entry.observationId)).toContain(
        created.observation.observationId
      );
    });
  }, 120_000);

  it('a stale expected version loses the compare-and-set and leaves the row untouched', async () => {
    const seeded = await withPool((pool) => seedBasis(pool, 'kpi-stale'));

    const created = await withPool(async (pool) =>
      createKpiObservation(
        {
          fundId: seeded.fundId,
          request: requestFor(seeded.portfolioCompanyId),
          source: 'manual',
          actorId: seeded.userId,
          idempotencyKey: uniqueLabel('idem'),
        },
        { database: kpiDb(pool) }
      )
    );

    // First reviewer wins.
    const won = await withPool(async (pool) =>
      reviewKpiObservation(
        {
          fundId: seeded.fundId,
          observationId: created.observation.observationId,
          expectedVersion: 1,
          reviewStatus: 'accepted',
          reviewComment: 'First in',
          actorId: seeded.userId,
        },
        { database: kpiDb(pool) }
      )
    );
    expect(won).not.toBeNull();

    // Second reviewer, still holding version 1, must lose.
    const lost = await withPool(async (pool) =>
      reviewKpiObservation(
        {
          fundId: seeded.fundId,
          observationId: created.observation.observationId,
          expectedVersion: 1,
          reviewStatus: 'rejected',
          reviewComment: 'Too late',
          actorId: seeded.userId,
        },
        { database: kpiDb(pool) }
      )
    );
    expect(lost).toBeNull();

    await withPool(async (pool) => {
      const raw = await pool.query(
        `SELECT review_status, review_comment, version FROM kpi_observations WHERE id = $1`,
        [created.observation.observationId]
      );
      expect(raw.rows[0].review_status).toBe('accepted');
      expect(raw.rows[0].review_comment).toBe('First in');
      expect(Number(raw.rows[0].version)).toBe(2);
    });
  }, 120_000);
});

function requestFor(portfolioCompanyId: number): KpiObservationCreateRequest {
  return {
    portfolioCompanyId,
    metric: 'revenue_arr',
    periodStart: PERIOD.start,
    periodEnd: PERIOD.end,
    basis: 'actual',
    value: { valueKind: 'money', amountUsd: '2100000.000000' },
    sourceLabel: 'Q2 board deck',
    submittedAt: '2026-07-05T00:00:00.000Z',
  } as KpiObservationCreateRequest;
}

interface Basis {
  fundId: number;
  userId: number;
  portfolioCompanyId: number;
}

async function seedBasis(pool: Pool, label: string): Promise<Basis> {
  const suffix = uniqueLabel(label);
  const fundId = await insertedId(
    pool,
    `
      INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
      VALUES ($1, 10000000, '0.0200', '0.2000', 2026)
      RETURNING id
    `,
    [`KPI Observations ${suffix}`]
  );
  const userId = await insertedId(
    pool,
    `INSERT INTO users (username, password, role) VALUES ($1, 'x', 'admin') RETURNING id`,
    [`kpi-${suffix}`]
  );
  const portfolioCompanyId = await insertedId(
    pool,
    `
      INSERT INTO portfoliocompanies (
        fund_id, name, sector, stage, investment_amount, status
      ) VALUES ($1, $2, 'Software', 'Series A', 1000000, 'active')
      RETURNING id
    `,
    [fundId, `Company ${suffix}`]
  );
  return { fundId, userId, portfolioCompanyId };
}

function adminConnectionString(): string {
  return process.env.TEST_DATABASE_URL ?? getPostgresConnectionString();
}

function databaseConnectionString(name: string): string {
  const url = new URL(adminConnectionString());
  url.pathname = `/${name}`;
  return url.toString();
}

async function withPool<T>(callback: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({
    connectionString,
    max: 6,
    statement_timeout: 5_000,
    query_timeout: 7_000,
    application_name: 'kpi-observation-pg-proof',
  });
  try {
    return await callback(pool);
  } finally {
    await pool.end();
  }
}

async function insertedId(pool: Pool, sql: string, values: unknown[]): Promise<number> {
  const result = await pool.query(sql, values);
  const id = result.rows[0]?.id;
  if (typeof id !== 'number') throw new Error('Expected inserted id.');
  return id;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function uniqueLabel(prefix: string): string {
  labelCounter += 1;
  return `${prefix}-${process.pid}-${labelCounter}`;
}
