import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { backfillLegacyPositionEvents } from '../../../server/services/investment-ledger/legacy-position-backfill-service';
import { getPostgresConnectionString } from '../../helpers/testcontainers';
import { runMigrationsWithConnectionString } from '../../helpers/testcontainers-migration';

const skipIfNoDocker =
  !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';
const createdDatabases: string[] = [];

let adminPool: Pool | undefined;
let fundIdCounter = 120_532_000;

describe.skipIf(skipIfNoDocker)('legacy position backfill PostgreSQL proof', () => {
  beforeAll(() => {
    adminPool = new Pool({ connectionString: testDatabaseConnectionString(), max: 1 });
  });

  afterAll(async () => {
    if (adminPool) {
      for (const databaseName of createdDatabases.reverse()) {
        await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
      }
      await adminPool.end();
    }
  });

  it('dry-runs without writes, applies once, and resumes without duplicates', async () => {
    const { connectionString } = await createMigratedDatabase('apply_resume');

    await withPool(connectionString, async (pool) => {
      const db = drizzle(pool);
      const seed = await seedLegacyInvestment(pool, { withMainVehicle: true });

      const dryRun = await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: { mode: 'dry_run', fundIds: [seed.fundId] },
      });
      const hash = dryRun.candidates[0]?.sourcePlanHash;
      expect(dryRun).toMatchObject({ planned: 1, written: 0, blocked: 0 });
      expect(await rowCount(pool, 'position_events', seed.fundId)).toBe(0);

      const apply = await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: { mode: 'apply', fundIds: [seed.fundId], expectedSourceHashes: { [seed.investmentId]: hash } },
      });
      expect(apply).toMatchObject({ written: 1, skipped: 0, blocked: 0 });
      expect(await rowCount(pool, 'position_events', seed.fundId)).toBe(1);
      expect(await rowCount(pool, 'source_observations', seed.fundId)).toBe(1);

      const resume = await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: { mode: 'resume', fundIds: [seed.fundId], expectedSourceHashes: { [seed.investmentId]: hash } },
      });
      expect(resume).toMatchObject({ mode: 'resume', written: 0, skipped: 1, blocked: 0 });
      expect(await rowCount(pool, 'position_events', seed.fundId)).toBe(1);
      expect(await rowCount(pool, 'source_observations', seed.fundId)).toBe(1);
    });
  });

  it('rolls back affected fund when source hash drifts', async () => {
    const { connectionString } = await createMigratedDatabase('source_drift');

    await withPool(connectionString, async (pool) => {
      const db = drizzle(pool);
      const seed = await seedLegacyInvestment(pool, { withMainVehicle: true });

      await expect(
        backfillLegacyPositionEvents({
          actorId: null,
          database: db,
          request: {
            mode: 'apply',
            fundIds: [seed.fundId],
            expectedSourceHashes: { [seed.investmentId]: 'a'.repeat(64) },
          },
        })
      ).rejects.toMatchObject({ code: 'SOURCE_PLAN_HASH_CHANGED' });
      expect(await rowCount(pool, 'position_events', seed.fundId)).toBe(0);
      expect(await rowCount(pool, 'source_observations', seed.fundId)).toBe(0);
    });
  });

  it('creates deterministic main vehicle when no main exists', async () => {
    const { connectionString } = await createMigratedDatabase('no_main_vehicle');

    await withPool(connectionString, async (pool) => {
      const db = drizzle(pool);
      const seed = await seedLegacyInvestment(pool, { withMainVehicle: false });

      const dryRun = await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: { mode: 'dry_run', fundIds: [seed.fundId] },
      });
      const hash = dryRun.candidates[0]?.sourcePlanHash;
      expect(dryRun.candidates[0]?.warnings).toContain('MAIN_VEHICLE_WOULD_BE_CREATED');

      const apply = await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: { mode: 'apply', fundIds: [seed.fundId], expectedSourceHashes: { [seed.investmentId]: hash } },
      });
      expect(apply.createdMainVehicles).toBe(1);
      expect(await scalar(pool, `SELECT COUNT(*)::int FROM vehicles WHERE fund_id = $1 AND vehicle_slug = 'legacy-main-fund' AND vehicle_type = 'main_fund'`, [seed.fundId])).toBe(1);
      expect(await rowCount(pool, 'position_events', seed.fundId)).toBe(1);
    });
  });

  it('keeps no-main source hash stable across apply and resume', async () => {
    const { connectionString } = await createMigratedDatabase('no_main_resume');

    await withPool(connectionString, async (pool) => {
      const db = drizzle(pool);
      const seed = await seedLegacyInvestment(pool, { withMainVehicle: false });
      const dryRun = await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: { mode: 'dry_run', fundIds: [seed.fundId] },
      });
      const hash = dryRun.candidates[0]?.sourcePlanHash;

      await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: { mode: 'apply', fundIds: [seed.fundId], expectedSourceHashes: { [seed.investmentId]: hash } },
      });
      const afterApply = await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: { mode: 'dry_run', fundIds: [seed.fundId] },
      });
      expect(afterApply.candidates[0]?.sourcePlanHash).toBe(hash);

      const resume = await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: { mode: 'resume', fundIds: [seed.fundId], expectedSourceHashes: { [seed.investmentId]: hash } },
      });
      expect(resume).toMatchObject({ skipped: 1, written: 0, blocked: 0 });
    });
  });

  it('blocks dirty multi-main state before writes', async () => {
    const { connectionString } = await createMigratedDatabase('multi_main_prewrite');

    await withPool(connectionString, async (pool) => {
      const db = drizzle(pool);
      const seed = await seedLegacyInvestment(pool, { withMainVehicle: true });
      await pool.query('DROP INDEX IF EXISTS vehicles_main_fund_unique');
      await pool.query(
        `
          INSERT INTO vehicles (
            fund_id, vehicle_slug, vehicle_type, name, committed_capital, currency, status
          ) VALUES ($1, $2, 'main_fund', $3, '100000.000000', 'USD', 'active')
        `,
        [seed.fundId, `task-11d-second-main-${seed.fundId}`, `Task 11D Second Main ${seed.fundId}`]
      );

      await expect(
        backfillLegacyPositionEvents({
          actorId: null,
          database: db,
          request: {
            mode: 'apply',
            fundIds: [seed.fundId],
            expectedSourceHashes: { [seed.investmentId]: 'a'.repeat(64) },
          },
        })
      ).rejects.toMatchObject({ code: 'MULTI_MAIN_FUND_VEHICLE' });
      expect(await rowCount(pool, 'position_events', seed.fundId)).toBe(0);
      expect(await rowCount(pool, 'source_observations', seed.fundId)).toBe(0);
    });
  });

  it('reuses participation provenance without main-vehicle or observation side writes', async () => {
    const { connectionString } = await createMigratedDatabase('participation_provenance');

    await withPool(connectionString, async (pool) => {
      const db = drizzle(pool);
      const seed = await seedParticipationBackedInvestment(pool);
      const beforeObservations = await rowCount(pool, 'source_observations', seed.fundId);
      const dryRun = await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: { mode: 'dry_run', fundIds: [seed.fundId] },
      });
      const hash = dryRun.candidates[0]?.sourcePlanHash;

      const apply = await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: { mode: 'apply', fundIds: [seed.fundId], expectedSourceHashes: { [seed.investmentId]: hash } },
      });

      expect(apply).toMatchObject({ written: 1, createdMainVehicles: 0 });
      expect(await rowCount(pool, 'source_observations', seed.fundId)).toBe(beforeObservations);
      expect(await scalar(pool, `SELECT source_observation_id::int FROM position_events WHERE fund_id = $1`, [seed.fundId])).toBe(seed.sourceObservationId);
      expect(await scalar(pool, `SELECT COUNT(*)::int FROM vehicles WHERE fund_id = $1 AND vehicle_type = 'main_fund'`, [seed.fundId])).toBe(0);
    });
  });

  it('blocks participation-backed investments missing source observation lineage', async () => {
    const { connectionString } = await createMigratedDatabase('participation_missing_observation');

    await withPool(connectionString, async (pool) => {
      const db = drizzle(pool);
      const seed = await seedParticipationBackedInvestment(pool);
      await pool.query(
        `UPDATE vehicle_financing_participations SET source_observation_id = NULL WHERE fund_id = $1`,
        [seed.fundId]
      );

      const result = await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: {
          mode: 'apply',
          fundIds: [seed.fundId],
          expectedSourceHashes: { [seed.investmentId]: 'a'.repeat(64) },
        },
      });

      expect(result).toMatchObject({ written: 0, blocked: 1 });
      expect(result.candidates[0]?.blockers).toContain('PARTICIPATION_OBSERVATION_MISSING');
      expect(await rowCount(pool, 'position_events', seed.fundId)).toBe(0);
      expect(await rowCount(pool, 'source_observations', seed.fundId)).toBe(1);
    });
  });

  it('rejects immutable replay mismatch and exact-Q6 precision loss', async () => {
    const { connectionString } = await createMigratedDatabase('replay_and_precision');

    await withPool(connectionString, async (pool) => {
      const db = drizzle(pool);
      const replaySeed = await seedLegacyInvestment(pool, { withMainVehicle: true });
      const precisionSeed = await seedLegacyInvestment(pool, {
        withMainVehicle: true,
        sharesAcquired: '1.12345678',
      });
      const dryRun = await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: { mode: 'dry_run', fundIds: [replaySeed.fundId] },
      });
      const hash = dryRun.candidates[0]?.sourcePlanHash;
      await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: { mode: 'apply', fundIds: [replaySeed.fundId], expectedSourceHashes: { [replaySeed.investmentId]: hash } },
      });
      await pool.query(
        `UPDATE position_events SET cost_basis_delta = '999.000000' WHERE fund_id = $1`,
        [replaySeed.fundId]
      );

      const replay = await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: { mode: 'apply', fundIds: [replaySeed.fundId], expectedSourceHashes: { [replaySeed.investmentId]: hash } },
      });
      expect(replay.candidates[0]?.blockers).toContain('EXISTING_BACKFILL_MISMATCH');

      const precision = await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: {
          mode: 'apply',
          fundIds: [precisionSeed.fundId],
          expectedSourceHashes: { [precisionSeed.investmentId]: 'a'.repeat(64) },
        },
      });
      expect(precision.candidates[0]?.blockers).toContain('SHARE_PRECISION_LOSS');
      expect(await rowCount(pool, 'position_events', precisionSeed.fundId)).toBe(0);
    });
  });

  it('rejects replay when source observation identity no longer matches request hash', async () => {
    const { connectionString } = await createMigratedDatabase('replay_observation_mismatch');

    await withPool(connectionString, async (pool) => {
      const db = drizzle(pool);
      const seed = await seedLegacyInvestment(pool, { withMainVehicle: true });
      const dryRun = await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: { mode: 'dry_run', fundIds: [seed.fundId] },
      });
      const hash = dryRun.candidates[0]?.sourcePlanHash;
      await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: {
          mode: 'apply',
          fundIds: [seed.fundId],
          expectedSourceHashes: { [seed.investmentId]: hash },
        },
      });
      await pool.query(
        `UPDATE source_observations SET observation_hash = $1 WHERE fund_id = $2`,
        ['d'.repeat(64), seed.fundId]
      );

      const replay = await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: {
          mode: 'apply',
          fundIds: [seed.fundId],
          expectedSourceHashes: { [seed.investmentId]: hash },
        },
      });

      expect(replay.candidates[0]?.blockers).toContain('EXISTING_BACKFILL_MISMATCH');
      expect(await rowCount(pool, 'position_events', seed.fundId)).toBe(1);
    });
  });

  it('rolls back one-fund batch without compatibility side writes', async () => {
    const { connectionString } = await createMigratedDatabase('rollback_side_writes');

    await withPool(connectionString, async (pool) => {
      const db = drizzle(pool);
      const seed = await seedLegacyInvestment(pool, { withMainVehicle: true });
      const secondInvestmentId = await cloneLegacyInvestment(pool, seed.fundId, seed.companyId);
      const dryRun = await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: { mode: 'dry_run', fundIds: [seed.fundId] },
      });
      const hashes = Object.fromEntries(
        dryRun.candidates.map((candidate) => [String(candidate.investmentId), candidate.sourcePlanHash ?? ''])
      );
      hashes[String(secondInvestmentId)] = 'b'.repeat(64);

      await expect(
        backfillLegacyPositionEvents({
          actorId: null,
          database: db,
          request: { mode: 'apply', fundIds: [seed.fundId], expectedSourceHashes: hashes },
        })
      ).rejects.toMatchObject({ code: 'SOURCE_PLAN_HASH_CHANGED' });
      expect(await rowCount(pool, 'position_events', seed.fundId)).toBe(0);
      expect(await rowCount(pool, 'source_observations', seed.fundId)).toBe(0);
      expect(await rowCount(pool, 'investment_lots', seed.fundId)).toBe(0);
      expect(await rowCount(pool, 'cash_flow_events', seed.fundId)).toBe(0);
      expect(await rowCount(pool, 'investment_rounds', seed.fundId)).toBe(0);
    });
  });

  it('commits earlier funds and resumes later failed funds without duplicates', async () => {
    const { connectionString } = await createMigratedDatabase('between_fund_resume');

    await withPool(connectionString, async (pool) => {
      const db = drizzle(pool);
      const first = await seedLegacyInvestment(pool, { withMainVehicle: true });
      const second = await seedLegacyInvestment(pool, { withMainVehicle: true });
      const dryRun = await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: { mode: 'dry_run', fundIds: [first.fundId, second.fundId] },
      });
      const firstHash = dryRun.candidates.find((candidate) => candidate.fundId === first.fundId)?.sourcePlanHash ?? '';
      const secondHash = dryRun.candidates.find((candidate) => candidate.fundId === second.fundId)?.sourcePlanHash ?? '';

      await expect(
        backfillLegacyPositionEvents({
          actorId: null,
          database: db,
          request: {
            mode: 'apply',
            fundIds: [first.fundId, second.fundId],
            expectedSourceHashes: {
              [first.investmentId]: firstHash,
              [second.investmentId]: 'c'.repeat(64),
            },
          },
        })
      ).rejects.toMatchObject({ code: 'SOURCE_PLAN_HASH_CHANGED' });
      expect(await rowCount(pool, 'position_events', first.fundId)).toBe(1);
      expect(await rowCount(pool, 'position_events', second.fundId)).toBe(0);

      const resume = await backfillLegacyPositionEvents({
        actorId: null,
        database: db,
        request: {
          mode: 'resume',
          fundIds: [first.fundId, second.fundId],
          expectedSourceHashes: {
            [first.investmentId]: firstHash,
            [second.investmentId]: secondHash,
          },
        },
      });
      expect(resume).toMatchObject({ written: 1, skipped: 1, blocked: 0 });
      expect(await rowCount(pool, 'position_events', first.fundId)).toBe(1);
      expect(await rowCount(pool, 'position_events', second.fundId)).toBe(1);
    });
  });
});

async function createMigratedDatabase(suffix: string): Promise<{ connectionString: string }> {
  if (!adminPool) throw new Error('Admin pool not initialized.');
  const databaseName = `task11d_${suffix}_${process.pid}_${Date.now()}`.toLowerCase();
  createdDatabases.push(databaseName);
  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  const connectionString = databaseConnectionString(databaseName);
  await withPool(connectionString, async (pool) => {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  });
  await runMigrationsWithConnectionString(connectionString, '0043_position_source_basis_reliefs');
  return { connectionString };
}

function databaseConnectionString(databaseName: string): string {
  const base = new URL(testDatabaseConnectionString());
  base.pathname = `/${databaseName}`;
  return base.toString();
}

function testDatabaseConnectionString(): string {
  return process.env.TEST_DATABASE_URL ?? getPostgresConnectionString();
}

async function seedLegacyInvestment(
  pool: Pool,
  input: { withMainVehicle: boolean; sharesAcquired?: string | null }
): Promise<{ fundId: number; companyId: number; investmentId: number }> {
  const fundId = nextFundId();
  await pool.query(
    `
      INSERT INTO funds (id, name, size, management_fee, carry_percentage, vintage_year)
      VALUES ($1, $2, 10000000, 2, 20, 2026)
    `,
    [fundId, `Task 11D Fund ${fundId}`]
  );
  const companyId = await insertedId(
    pool,
    `
      INSERT INTO portfoliocompanies (
        fund_id, name, sector, stage, investment_amount, status
      ) VALUES ($1, $2, 'SaaS', 'seed', '1000.00', 'active')
      RETURNING id
    `,
    [fundId, `Task 11D Company ${fundId}`]
  );
  if (input.withMainVehicle) {
    await pool.query(
      `
        INSERT INTO vehicles (
          fund_id, vehicle_slug, vehicle_type, name, committed_capital, currency, status
        ) VALUES ($1, $2, 'main_fund', $3, '100000.000000', 'USD', 'active')
      `,
      [fundId, `task-11d-main-${fundId}`, `Task 11D Main ${fundId}`]
    );
  }
  const identityId = await insertedId(
    pool,
    `
      INSERT INTO company_identities (fund_id, canonical_name, source_portfolio_company_id)
      VALUES ($1, $2, $3)
      RETURNING id
    `,
    [fundId, `Task 11D Identity ${fundId}`, companyId]
  );
  await pool.query(
    `
      INSERT INTO portfolio_company_identity_links (
        fund_id, portfolio_company_id, company_identity_id, link_type, active
      ) VALUES ($1, $2, $3, 'operator_resolution', true)
    `,
    [fundId, companyId, identityId]
  );
  const investmentId = await insertedId(
    pool,
    `
      INSERT INTO investments (
        fund_id, company_id, investment_date, amount, round,
        ownership_percentage, valuation_at_investment, shares_acquired, cost_basis_cents
      ) VALUES (
        $1, $2, '2026-01-15', '1000.00', 'Seed',
        '0.1000', '10000000.00', $3, 100000
      )
      RETURNING id
    `,
    [fundId, companyId, input.sharesAcquired ?? null]
  );
  return { fundId, companyId, investmentId };
}

async function seedParticipationBackedInvestment(
  pool: Pool
): Promise<{ fundId: number; investmentId: number; sourceObservationId: number }> {
  const seed = await seedLegacyInvestment(pool, { withMainVehicle: false, sharesAcquired: '2.00000000' });
  const vehicleId = await insertedId(
    pool,
    `
      INSERT INTO vehicles (
        fund_id, vehicle_slug, vehicle_type, name, committed_capital, currency, status
      ) VALUES ($1, $2, 'spv', $3, '100000.000000', 'USD', 'active')
      RETURNING id
    `,
    [seed.fundId, `task-11d-spv-${seed.fundId}`, `Task 11D SPV ${seed.fundId}`]
  );
  const identityId = Number(
    await scalar(pool, `SELECT company_identity_id::int FROM portfolio_company_identity_links WHERE fund_id = $1`, [seed.fundId])
  );
  const sourceObservationId = await insertedId(
    pool,
    `
      INSERT INTO source_observations (
        fund_id, company_identity_id, domain, source_type, effective_date,
        normalized_payload, observation_hash, candidate_fingerprint,
        source_locator, dependency_group_key, status
      ) VALUES (
        $1, $2, 'ledger_event', 'manual', '2026-01-15',
        '{"source":"participation"}'::jsonb, $3, $4, 'participation-source', 'dep', 'accepted'
      )
      RETURNING id
    `,
    [seed.fundId, identityId, `${seed.fundId}`.padStart(64, 'a').slice(0, 64), `${seed.fundId}`.padStart(64, 'b').slice(0, 64)]
  );
  const eventId = await insertedId(
    pool,
    `
      INSERT INTO financing_events (
        fund_id, company_identity_id, event_key, round_name, security_type, event_date,
        currency, round_size, idempotency_key, request_hash
      ) VALUES ($1, $2, $3, 'SAFE', 'safe', '2026-01-15', 'USD', '1000.000000', $3, repeat('a', 64))
      RETURNING id
    `,
    [seed.fundId, identityId, `task-11d-event-${seed.fundId}`]
  );
  const trancheId = await insertedId(
    pool,
    `
      INSERT INTO financing_tranches (
        fund_id, financing_event_id, tranche_key, version, closing_date, security_type,
        investment_amount, original_amount, currency, fx_rate_to_usd, fx_rate_date,
        idempotency_key, request_hash
      ) VALUES (
        $1, $2, $3, 1, '2026-01-15', 'safe', '1000.000000', '1000.000000',
        'USD', '1.0000000000', '2026-01-15', $3, repeat('b', 64)
      )
      RETURNING id
    `,
    [seed.fundId, eventId, `task-11d-tranche-${seed.fundId}`]
  );
  const participationId = await insertedId(
    pool,
    `
      INSERT INTO vehicle_financing_participations (
        fund_id, vehicle_id, financing_event_id, tranche_key, financing_tranche_id,
        version, participation_amount, currency, closing_date, source_observation_id,
        idempotency_key, request_hash
      ) VALUES (
        $1, $2, $3, $4, $5, 1, '1000.000000', 'USD', '2026-01-15', $6,
        $7, repeat('c', 64)
      )
      RETURNING id
    `,
    [
      seed.fundId,
      vehicleId,
      eventId,
      `task-11d-tranche-${seed.fundId}`,
      trancheId,
      sourceObservationId,
      `task-11d-participation-${seed.fundId}`,
    ]
  );
  await pool.query(
    `UPDATE investments SET vehicle_participation_id = $1 WHERE id = $2`,
    [participationId, seed.investmentId]
  );
  return { fundId: seed.fundId, investmentId: seed.investmentId, sourceObservationId };
}

async function cloneLegacyInvestment(
  pool: Pool,
  fundId: number,
  companyId: number
): Promise<number> {
  return insertedId(
    pool,
    `
      INSERT INTO investments (
        fund_id, company_id, investment_date, amount, round,
        ownership_percentage, valuation_at_investment, shares_acquired, cost_basis_cents
      ) VALUES (
        $1, $2, '2026-02-15', '2000.00', 'Seed Extension',
        '0.1000', '10000000.00', NULL, 200000
      )
      RETURNING id
    `,
    [fundId, companyId]
  );
}

async function rowCount(pool: Pool, table: string, fundId: number): Promise<number> {
  if (table === 'investment_lots') {
    return Number(
      await scalar(
        pool,
        `
          SELECT COUNT(*)::int
          FROM investment_lots lot
          JOIN investments investment ON investment.id = lot.investment_id
          WHERE investment.fund_id = $1
        `,
        [fundId]
      )
    );
  }
  return Number(await scalar(pool, `SELECT COUNT(*)::int FROM ${table} WHERE fund_id = $1`, [fundId]));
}

async function scalar<T = unknown>(pool: Pool, query: string, params: unknown[]): Promise<T> {
  const result = await pool.query(query, params);
  return Object.values(result.rows[0] ?? {})[0] as T;
}

async function insertedId(pool: Pool, query: string, params: unknown[]): Promise<number> {
  return Number(await scalar(pool, query, params));
}

async function withPool<T>(connectionString: string, callback: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString, max: 4 });
  try {
    return await callback(pool);
  } finally {
    await pool.end();
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function nextFundId(): number {
  fundIdCounter += 1;
  return fundIdCounter;
}
