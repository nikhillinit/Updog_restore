import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listCurrentPositions } from '../../../server/services/investment-ledger/current-position-service';
import {
  createOwnershipSnapshot,
  listOwnershipSnapshots,
} from '../../../server/services/investment-ledger/ownership-snapshot-service';
import {
  recordDirectPositionValuation,
  selectPositionValuation,
} from '../../../server/services/investment-ledger/position-valuation-service';
import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../../helpers/testcontainers';
import { runMigrationsWithConnectionString } from '../../helpers/testcontainers-migration';

const skipIfNoDocker =
  !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';
const createdDatabases: string[] = [];

let adminPool: Pool | undefined;
let fundIdCounter = 120_432_000;
let startedTestContainers = false;

interface ScopeSeed {
  fundId: number;
  vehicleId: number;
  otherVehicleId: number;
  companyId: number;
  otherCompanyId: number;
  identityId: number;
  otherIdentityId: number;
}

interface ParticipationSeed {
  eventId: number;
  trancheId: number;
  participationId: number;
}

describe.skipIf(skipIfNoDocker)('current position, ownership, and valuation PostgreSQL proof', () => {
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      await setupTestContainers();
      startedTestContainers = true;
    }
    adminPool = new Pool({ connectionString: testDatabaseConnectionString(), max: 1 });
  });

  afterAll(async () => {
    if (adminPool) {
      for (const databaseName of createdDatabases.reverse()) {
        await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
      }
      await adminPool.end();
    }
    if (startedTestContainers) {
      await cleanupTestContainers();
    }
  });

  it('folds current positions by exact vehicle/company and recorded cutoff, with conversion basis conservation', async () => {
    const { connectionString } = await createMigratedDatabase('current_position_fold');

    await withPool(connectionString, async (pool) => {
      const seed = await seedScope(pool, nextFundId());
      const main = await insertParticipation(pool, seed, {
        vehicleId: seed.vehicleId,
        securityType: 'safe',
        suffix: 'main-safe',
        amount: '1000.000000',
      });
      const converted = await insertParticipation(pool, seed, {
        vehicleId: seed.vehicleId,
        securityType: 'equity',
        suffix: 'main-equity',
        amount: '1000.000000',
        economicOrigin: 'conversion_result',
      });
      const spv = await insertParticipation(pool, seed, {
        vehicleId: seed.otherVehicleId,
        securityType: 'equity',
        suffix: 'spv',
        amount: '250.000000',
      });
      const spvAcquisitionEventId = await insertPositionEvent(pool, {
        fundId: seed.fundId,
        vehicleId: seed.otherVehicleId,
        identityId: seed.identityId,
        eventType: 'acquisition',
        effectiveDate: '2026-01-05',
        recordedAt: '2026-01-06T00:00:00.000Z',
        sharesDelta: '25.000000',
        costBasisDelta: '250.000000',
        proceeds: '0.000000',
        vehicleParticipationId: spv.participationId,
      });
      await insertPositionEvent(pool, {
        fundId: seed.fundId,
        vehicleId: seed.otherVehicleId,
        identityId: seed.identityId,
        eventType: 'reversal',
        effectiveDate: '2026-01-05',
        recordedAt: '2026-03-01T00:00:00.000Z',
        sharesDelta: '-25.000000',
        costBasisDelta: '-250.000000',
        proceeds: '0.000000',
        vehicleParticipationId: spv.participationId,
        reversesPositionEventId: spvAcquisitionEventId,
      });
      const acquisitionEventId = await insertPositionEvent(pool, {
        fundId: seed.fundId,
        vehicleId: seed.vehicleId,
        identityId: seed.identityId,
        eventType: 'acquisition',
        effectiveDate: '2026-01-01',
        recordedAt: '2026-01-02T00:00:00.000Z',
        sharesDelta: '0.000000',
        costBasisDelta: '1000.000000',
        proceeds: '0.000000',
        vehicleParticipationId: main.participationId,
      });
      const conversionEventId = await insertPositionEvent(pool, {
        fundId: seed.fundId,
        vehicleId: seed.vehicleId,
        identityId: seed.identityId,
        eventType: 'conversion',
        effectiveDate: '2026-02-01',
        recordedAt: '2026-02-02T00:00:00.000Z',
        sharesDelta: '100.000000',
        costBasisDelta: '0.000000',
        proceeds: '0.000000',
        vehicleParticipationId: main.participationId,
        resultingParticipationId: converted.participationId,
      });
      await insertSourceBasisRelief(pool, {
        fundId: seed.fundId,
        vehicleId: seed.vehicleId,
        identityId: seed.identityId,
        conversionEventId,
        acquisitionEventId,
        source: main,
        result: converted,
      });

      const beforeReversal = await listCurrentPositions({
        fundId: seed.fundId,
        query: { asOfDate: '2026-03-15' },
        knowledgeCutoff: new Date('2026-02-15T00:00:00.000Z'),
        database: drizzle(pool) as never,
      });
      const afterReversal = await listCurrentPositions({
        fundId: seed.fundId,
        query: { asOfDate: '2026-03-15' },
        knowledgeCutoff: new Date('2026-03-15T00:00:00.000Z'),
        database: drizzle(pool) as never,
      });

      expect(beforeReversal.positions.map((position) => position.vehicleId)).toEqual([
        seed.vehicleId,
        seed.otherVehicleId,
      ]);
      expect(beforeReversal.positions.find((position) => position.vehicleId === seed.vehicleId)).toMatchObject({
        shares: '100.000000',
        costBasis: '1000.000000',
        components: [{ kind: 'priced', shares: '100.000000', costBasis: '1000.000000' }],
      });
      expect(beforeReversal.positions.find((position) => position.vehicleId === seed.otherVehicleId)).toMatchObject({
        shares: '25.000000',
        costBasis: '250.000000',
      });
      expect(afterReversal.positions.find((position) => position.vehicleId === seed.otherVehicleId)).toMatchObject({
        shares: '0.000000',
        costBasis: '0.000000',
      });
    });
  });

  it('creates ownership snapshots idempotently and enforces accepted same-scope lineage', async () => {
    const { connectionString } = await createMigratedDatabase('ownership_snapshot');

    await withPool(connectionString, async (pool) => {
      const seed = await seedScope(pool, nextFundId());
      const observationId = await insertObservation(pool, {
        fundId: seed.fundId,
        identityId: seed.identityId,
        domain: 'ownership',
        status: 'accepted',
        effectiveDate: '2026-06-30',
        suffix: 'ownership',
      });
      const database = drizzle(pool) as never;
      const request = {
        vehicleId: seed.vehicleId,
        companyIdentityId: seed.identityId,
        effectiveDate: '2026-07-01',
        ownershipPct: '12.50000000',
        fdNumerator: '125.000000',
        fdDenominator: '1000.000000',
        sourceObservationId: observationId,
      };

      const created = await createOwnershipSnapshot({
        fundId: seed.fundId,
        actorId: null,
        idempotencyKey: `ownership-${seed.fundId}-1`,
        request,
        database,
      });
      const replayed = await createOwnershipSnapshot({
        fundId: seed.fundId,
        actorId: null,
        idempotencyKey: `ownership-${seed.fundId}-1`,
        request,
        database,
      });
      await expect(
        createOwnershipSnapshot({
          fundId: seed.fundId,
          actorId: null,
          idempotencyKey: `ownership-${seed.fundId}-1`,
          request: { ...request, ownershipPct: '13.00000000', fdNumerator: '130.000000' },
          database,
        })
      ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSE' });
      expect(await countRows(pool, 'ownership_snapshots', seed.fundId)).toBe(1);
      expect(replayed).toEqual({ ...created, replayed: true });

      await updateRecordedAt(pool, 'ownership_snapshots', created.value.id, '2026-07-02T00:00:00.000Z');
      const successor = await createOwnershipSnapshot({
        fundId: seed.fundId,
        actorId: null,
        idempotencyKey: `ownership-${seed.fundId}-2`,
        request: {
          ...request,
          effectiveDate: '2026-08-01',
          ownershipPct: '15.00000000',
          fdNumerator: '150.000000',
          supersedesSnapshotId: created.value.id,
        },
        database,
      });
      await updateRecordedAt(pool, 'ownership_snapshots', successor.value.id, '2026-08-02T00:00:00.000Z');

      const beforeEffective = await listOwnershipSnapshots({
        fundId: seed.fundId,
        asOfDate: '2026-07-31',
        knowledgeCutoff: new Date('2026-12-31T00:00:00.000Z'),
        database,
      });
      const beforeRecorded = await listOwnershipSnapshots({
        fundId: seed.fundId,
        asOfDate: '2026-08-31',
        knowledgeCutoff: new Date('2026-08-01T00:00:00.000Z'),
        database,
      });
      const current = await listOwnershipSnapshots({
        fundId: seed.fundId,
        asOfDate: '2026-08-31',
        knowledgeCutoff: new Date('2026-08-31T00:00:00.000Z'),
        database,
      });
      expect(beforeEffective.snapshots.map((snapshot) => snapshot.id)).toEqual([created.value.id]);
      expect(beforeRecorded.snapshots.map((snapshot) => snapshot.id)).toEqual([created.value.id]);
      expect(current.snapshots.map((snapshot) => snapshot.id)).toEqual([successor.value.id]);

      const stagedObservationId = await insertObservation(pool, {
        fundId: seed.fundId,
        identityId: seed.identityId,
        domain: 'ownership',
        status: 'staged',
        effectiveDate: '2026-08-01',
        suffix: 'staged-ownership',
      });
      await expect(
        createOwnershipSnapshot({
          fundId: seed.fundId,
          actorId: null,
          idempotencyKey: `ownership-${seed.fundId}-staged`,
          request: { ...request, sourceObservationId: stagedObservationId },
          database,
        })
      ).rejects.toMatchObject({ status: 422, code: 'OWNERSHIP_OBSERVATION_NOT_ACCEPTED' });
      await expect(
        createOwnershipSnapshot({
          fundId: seed.fundId,
          actorId: null,
          idempotencyKey: `ownership-${seed.fundId}-cross-service`,
          request: { ...request, vehicleId: seed.otherVehicleId, supersedesSnapshotId: created.value.id },
          database,
        })
      ).rejects.toMatchObject({ status: 409, code: 'OWNERSHIP_SUPERSEDE_SCOPE_MISMATCH' });
      await expect(
        pool.query(
          `
            INSERT INTO ownership_snapshots (
              fund_id, vehicle_id, company_identity_id, effective_date, ownership_pct,
              currency, source_observation_id, idempotency_key, request_hash
            ) VALUES ($1, $2, $3, '2026-09-01', '10.00000000', 'USD', $4, $5, repeat('f', 64))
          `,
          [
            seed.fundId + 999,
            seed.vehicleId,
            seed.identityId,
            observationId,
            `ownership-${seed.fundId}-cross-fk`,
          ]
        )
      ).rejects.toMatchObject({ code: '23503' });
    });
  });

  it('records direct marks idempotently and selects direct, stale direct, derived, mixed, and unavailable valuations', async () => {
    const { connectionString } = await createMigratedDatabase('position_valuation');

    await withPool(connectionString, async (pool) => {
      const seed = await seedScope(pool, nextFundId());
      const priced = await insertParticipation(pool, seed, {
        vehicleId: seed.vehicleId,
        securityType: 'equity',
        suffix: 'priced',
        amount: '500.000000',
      });
      await insertPositionEvent(pool, {
        fundId: seed.fundId,
        vehicleId: seed.vehicleId,
        identityId: seed.identityId,
        eventType: 'acquisition',
        effectiveDate: '2026-01-15',
        recordedAt: '2026-01-16T00:00:00.000Z',
        sharesDelta: '50.000000',
        costBasisDelta: '500.000000',
        proceeds: '0.000000',
        vehicleParticipationId: priced.participationId,
      });
      const ownershipObservationId = await insertObservation(pool, {
        fundId: seed.fundId,
        identityId: seed.identityId,
        domain: 'ownership',
        status: 'accepted',
        effectiveDate: '2026-06-30',
        suffix: 'valuation-ownership',
      });
      const sourceValuationObservationId = await insertObservation(pool, {
        fundId: seed.fundId,
        identityId: seed.identityId,
        domain: 'valuation',
        status: 'accepted',
        effectiveDate: '2026-06-30',
        suffix: 'direct-source',
      });
      const trancheObservationId = await insertObservation(pool, {
        fundId: seed.fundId,
        identityId: seed.identityId,
        domain: 'ledger_event',
        status: 'accepted',
        effectiveDate: '2026-06-30',
        suffix: 'post-money',
      });
      await attachObservationToTranche(pool, priced.trancheId, trancheObservationId);
      await createOwnershipSnapshot({
        fundId: seed.fundId,
        actorId: null,
        idempotencyKey: `ownership-valuation-${seed.fundId}`,
        request: {
          vehicleId: seed.vehicleId,
          companyIdentityId: seed.identityId,
          effectiveDate: '2026-07-01',
          ownershipPct: '10.00000000',
          sourceObservationId: ownershipObservationId,
        },
        database: drizzle(pool) as never,
      });
      await pool.query(
        `UPDATE ownership_snapshots SET recorded_at = '2026-07-02T00:00:00.000Z' WHERE fund_id = $1`,
        [seed.fundId]
      );

      const database = drizzle(pool) as never;
      const directRequest = {
        vehicleId: seed.vehicleId,
        companyIdentityId: seed.identityId,
        companyId: seed.companyId,
        asOfDate: '2026-07-01',
        fairValue: '1250000.000000',
        sourceObservationId: sourceValuationObservationId,
        markSource: 'board_update',
        confidenceLevel: 'high',
        valuationMethod: 'direct_position_mark',
      };
      const direct = await recordDirectPositionValuation({
        fundId: seed.fundId,
        actorId: null,
        idempotencyKey: `direct-${seed.fundId}`,
        request: directRequest,
        database,
      });
      const replay = await recordDirectPositionValuation({
        fundId: seed.fundId,
        actorId: null,
        idempotencyKey: `direct-${seed.fundId}`,
        request: directRequest,
        database,
      });
      await expect(
        recordDirectPositionValuation({
          fundId: seed.fundId,
          actorId: null,
          idempotencyKey: `direct-${seed.fundId}`,
          request: { ...directRequest, fairValue: '1300000.000000' },
          database,
        })
      ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSE' });
      expect(replay).toEqual({ ...direct, replayed: true });
      expect(await countRows(pool, 'valuation_marks', seed.fundId)).toBe(1);

      const selectedDirect = await selectPositionValuation({
        fundId: seed.fundId,
        vehicleId: seed.vehicleId,
        companyIdentityId: seed.identityId,
        companyId: seed.companyId,
        asOfDate: '2026-07-31',
        knowledgeCutoff: new Date('2030-01-01T00:00:00.000Z'),
        database,
      });
      expect(selectedDirect).toMatchObject({
        basis: 'direct',
        aggregateFairValue: '1250000.000000',
        directMarkId: direct.value.valuationMarkId,
        ownershipSnapshotId: null,
      });

      await pool.query(`UPDATE valuation_marks SET mark_date = '2026-01-01', as_of_date = '2026-01-01' WHERE id = $1`, [
        direct.value.valuationMarkId,
      ]);
      const staleDirect = await selectPositionValuation({
        fundId: seed.fundId,
        vehicleId: seed.vehicleId,
        companyIdentityId: seed.identityId,
        companyId: seed.companyId,
        asOfDate: '2026-07-31',
        knowledgeCutoff: new Date('2030-01-01T00:00:00.000Z'),
        database,
      });
      expect(staleDirect).toMatchObject({
        basis: 'direct',
        aggregateFairValue: '1250000.000000',
        directMarkId: direct.value.valuationMarkId,
        ownershipSnapshotId: null,
        warnings: [{ code: 'DIRECT_POSITION_MARK_STALE' }],
      });

      await pool.query(`UPDATE valuation_marks SET status = 'superseded' WHERE id = $1`, [
        direct.value.valuationMarkId,
      ]);
      const derived = await selectPositionValuation({
        fundId: seed.fundId,
        vehicleId: seed.vehicleId,
        companyIdentityId: seed.identityId,
        companyId: seed.companyId,
        asOfDate: '2026-07-31',
        knowledgeCutoff: new Date('2030-01-01T00:00:00.000Z'),
        database,
      });
      expect(derived).toMatchObject({
        basis: 'derived',
        aggregateFairValue: '1000000.000000',
        directMarkId: null,
      });

      await pool.query(`UPDATE source_observations SET status = 'staged' WHERE id = $1`, [
        trancheObservationId,
      ]);
      const unavailable = await selectPositionValuation({
        fundId: seed.fundId,
        vehicleId: seed.vehicleId,
        companyIdentityId: seed.identityId,
        companyId: seed.companyId,
        asOfDate: '2026-07-31',
        knowledgeCutoff: new Date('2030-01-01T00:00:00.000Z'),
        database,
      });
      expect(unavailable).toMatchObject({
        basis: 'unavailable',
        aggregateFairValue: null,
      });
      await pool.query(`UPDATE source_observations SET status = 'accepted' WHERE id = $1`, [
        trancheObservationId,
      ]);

      const contingent = await insertParticipation(pool, seed, {
        vehicleId: seed.vehicleId,
        securityType: 'safe',
        suffix: 'contingent',
        amount: '250.000000',
      });
      await insertPositionEvent(pool, {
        fundId: seed.fundId,
        vehicleId: seed.vehicleId,
        identityId: seed.identityId,
        eventType: 'acquisition',
        effectiveDate: '2026-02-15',
        recordedAt: '2026-02-16T00:00:00.000Z',
        sharesDelta: '0.000000',
        costBasisDelta: '250.000000',
        proceeds: '0.000000',
        vehicleParticipationId: contingent.participationId,
      });
      const mixed = await selectPositionValuation({
        fundId: seed.fundId,
        vehicleId: seed.vehicleId,
        companyIdentityId: seed.identityId,
        companyId: seed.companyId,
        asOfDate: '2026-07-31',
        knowledgeCutoff: new Date('2030-01-01T00:00:00.000Z'),
        database,
      });
      expect(mixed).toMatchObject({
        basis: 'derived',
        aggregateFairValue: null,
        pricedComponentFairValue: '1000000.000000',
        warnings: [
          { code: 'CONTINGENT_INSTRUMENT_EXCLUDED' },
          { code: 'POSITION_VALUATION_INCOMPLETE' },
        ],
      });

      await expect(
        recordDirectPositionValuation({
          fundId: seed.fundId,
          actorId: null,
          idempotencyKey: `direct-${seed.fundId}-other-company`,
          request: { ...directRequest, companyId: seed.otherCompanyId },
          database,
        })
      ).rejects.toMatchObject({ status: 422, code: 'POSITION_VALUATION_SCOPE_MISMATCH' });
    });
  });
});

async function createMigratedDatabase(label: string): Promise<{ connectionString: string }> {
  if (!adminPool) throw new Error('adminPool missing');
  const databaseName = `${label}_${process.pid}_${Date.now()}_${createdDatabases.length}`.toLowerCase();
  createdDatabases.push(databaseName);
  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  const connectionString = databaseConnectionString(databaseName);
  await withPool(connectionString, async (pool) => {
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
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

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function withPool<T>(connectionString: string, callback: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString, max: 4 });
  try {
    return await callback(pool);
  } finally {
    await pool.end();
  }
}

function nextFundId(): number {
  fundIdCounter += 1;
  return fundIdCounter;
}

async function seedScope(pool: Pool, fundId: number): Promise<ScopeSeed> {
  await pool.query(
    `
      INSERT INTO funds (id, name, size, management_fee, carry_percentage, vintage_year)
      VALUES ($1, $2, '1000000.00', '0.0200', '0.2000', 2026)
    `,
    [fundId, `Task 11C Fund ${fundId}`]
  );
  const companyId = await insertedId(
    pool,
    `
      INSERT INTO portfoliocompanies (fund_id, name, sector, stage, investment_amount, status)
      VALUES ($1, $2, 'SaaS', 'seed', '0.00', 'active')
      RETURNING id
    `,
    [fundId, `Task 11C Company ${fundId}`]
  );
  const otherCompanyId = await insertedId(
    pool,
    `
      INSERT INTO portfoliocompanies (fund_id, name, sector, stage, investment_amount, status)
      VALUES ($1, $2, 'SaaS', 'seed', '0.00', 'active')
      RETURNING id
    `,
    [fundId, `Task 11C Other Company ${fundId}`]
  );
  const vehicleId = await insertVehicle(pool, fundId, 'main_fund', `main-${fundId}`);
  const otherVehicleId = await insertVehicle(pool, fundId, 'spv', `spv-${fundId}`);
  const identityId = await insertIdentity(pool, fundId, companyId, `Task 11C Identity ${fundId}`);
  const otherIdentityId = await insertIdentity(pool, fundId, otherCompanyId, `Task 11C Other Identity ${fundId}`);
  await pool.query(
    `
      INSERT INTO portfolio_company_identity_links (
        fund_id, portfolio_company_id, company_identity_id, link_type, active
      ) VALUES ($1, $2, $3, 'operator_resolution', true), ($1, $4, $5, 'operator_resolution', true)
    `,
    [fundId, companyId, identityId, otherCompanyId, otherIdentityId]
  );
  return { fundId, vehicleId, otherVehicleId, companyId, otherCompanyId, identityId, otherIdentityId };
}

async function insertVehicle(
  pool: Pool,
  fundId: number,
  vehicleType: 'main_fund' | 'spv',
  suffix: string
): Promise<number> {
  return insertedId(
    pool,
    `
      INSERT INTO vehicles (
        fund_id, vehicle_slug, vehicle_type, name, committed_capital, currency, status
      ) VALUES ($1, $2, $3, $4, '100000.000000', 'USD', 'active')
      RETURNING id
    `,
    [fundId, `task-11c-${suffix}`, vehicleType, `Task 11C ${suffix}`]
  );
}

async function insertIdentity(
  pool: Pool,
  fundId: number,
  companyId: number,
  canonicalName: string
): Promise<number> {
  return insertedId(
    pool,
    `
      INSERT INTO company_identities (fund_id, canonical_name, source_portfolio_company_id)
      VALUES ($1, $2, $3)
      RETURNING id
    `,
    [fundId, canonicalName, companyId]
  );
}

async function insertParticipation(
  pool: Pool,
  seed: ScopeSeed,
  input: {
    vehicleId: number;
    securityType: 'equity' | 'safe';
    suffix: string;
    amount: string;
    economicOrigin?: 'cash_investment' | 'conversion_result';
  }
): Promise<ParticipationSeed> {
  const eventId = await insertedId(
    pool,
    `
      INSERT INTO financing_events (
        fund_id, company_identity_id, event_key, round_name, security_type, event_date,
        currency, round_size, post_money_valuation, price_per_share, idempotency_key, request_hash
      ) VALUES (
        $1, $2, $3, $4, $5, '2026-01-15', 'USD', $6,
        '10000000.000000', $7, $8, repeat('a', 64)
      )
      RETURNING id
    `,
    [
      seed.fundId,
      seed.identityId,
      `task-11c-event-${input.suffix}-${seed.fundId}`,
      input.securityType === 'safe' ? 'SAFE' : 'Series A',
      input.securityType,
      input.amount,
      input.securityType === 'equity' ? '10.000000' : null,
      `task-11c-event-${input.suffix}-${seed.fundId}`,
    ]
  );
  const trancheId = await insertedId(
    pool,
    `
      INSERT INTO financing_tranches (
        fund_id, financing_event_id, tranche_key, version, closing_date, security_type,
        investment_amount, original_amount, currency, fx_rate_to_usd, fx_rate_date,
        price_per_share, post_money_valuation, valuation_cap, conversion_discount_rate,
        idempotency_key, request_hash
      ) VALUES (
        $1, $2, $3, 1, '2026-01-15', $4, $5, $5, 'USD', '1.0000000000',
        '2026-01-15', $6, '10000000.000000', '8000000.000000',
        '0.80000000', $7, repeat('b', 64)
      )
      RETURNING id
    `,
    [
      seed.fundId,
      eventId,
      `task-11c-tranche-${input.suffix}`,
      input.securityType,
      input.amount,
      input.securityType === 'equity' ? '10.000000' : null,
      `task-11c-tranche-${input.suffix}-${seed.fundId}`,
    ]
  );
  const participationId = await insertedId(
    pool,
    `
      INSERT INTO vehicle_financing_participations (
        fund_id, vehicle_id, financing_event_id, tranche_key, financing_tranche_id,
        version, economic_origin, participation_amount, currency, idempotency_key, request_hash
      ) VALUES ($1, $2, $3, $4, $5, 1, $6, $7, 'USD', $8, repeat('c', 64))
      RETURNING id
    `,
    [
      seed.fundId,
      input.vehicleId,
      eventId,
      `task-11c-participation-${input.suffix}`,
      trancheId,
      input.economicOrigin ?? 'cash_investment',
      input.amount,
      `task-11c-participation-${input.suffix}-${seed.fundId}`,
    ]
  );
  return { eventId, trancheId, participationId };
}

async function insertPositionEvent(
  pool: Pool,
  input: {
    fundId: number;
    vehicleId: number;
    identityId: number;
    eventType: 'acquisition' | 'conversion' | 'reversal';
    effectiveDate: string;
    recordedAt: string;
    sharesDelta: string;
    costBasisDelta: string;
    proceeds: string;
    vehicleParticipationId: number;
    resultingParticipationId?: number;
    reversesPositionEventId?: number;
  }
): Promise<number> {
  return insertedId(
    pool,
    `
      INSERT INTO position_events (
        fund_id, vehicle_id, company_identity_id, event_type, effective_date, recorded_at,
        shares_delta, cost_basis_delta, proceeds, reverses_position_event_id,
        vehicle_participation_id, resulting_participation_id, source_participation_version,
        resulting_participation_version, source_tranche_version, resulting_tranche_version
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        CASE WHEN $4::varchar = 'conversion' THEN 1 ELSE NULL END,
        CASE WHEN $4::varchar = 'conversion' THEN 1 ELSE NULL END,
        CASE WHEN $4::varchar = 'conversion' THEN 1 ELSE NULL END,
        CASE WHEN $4::varchar = 'conversion' THEN 1 ELSE NULL END
      )
      RETURNING id
    `,
    [
      input.fundId,
      input.vehicleId,
      input.identityId,
      input.eventType,
      input.effectiveDate,
      input.recordedAt,
      input.sharesDelta,
      input.costBasisDelta,
      input.proceeds,
      input.reversesPositionEventId ?? null,
      input.vehicleParticipationId,
      input.resultingParticipationId ?? null,
    ]
  );
}

async function insertSourceBasisRelief(
  pool: Pool,
  input: {
    fundId: number;
    vehicleId: number;
    identityId: number;
    conversionEventId: number;
    acquisitionEventId: number;
    source: ParticipationSeed;
    result: ParticipationSeed;
  }
): Promise<void> {
  await pool.query(
    `
      INSERT INTO position_event_source_basis_reliefs (
        conversion_position_event_id, source_acquisition_position_event_id,
        fund_id, vehicle_id, company_identity_id, source_participation_id,
        source_participation_version, source_financing_event_id, source_financing_tranche_id,
        resulting_participation_id, resulting_participation_version,
        resulting_financing_event_id, resulting_financing_tranche_id,
        source_tranche_version, resulting_tranche_version, source_acquisition_cost_basis,
        relieved_cost_basis
      ) VALUES (
        $1, $2, $3, $4, $5, $6, 1, $7, $8, $9, 1, $10, $11, 1, 1,
        '1000.000000', '1000.000000'
      )
    `,
    [
      input.conversionEventId,
      input.acquisitionEventId,
      input.fundId,
      input.vehicleId,
      input.identityId,
      input.source.participationId,
      input.source.eventId,
      input.source.trancheId,
      input.result.participationId,
      input.result.eventId,
      input.result.trancheId,
    ]
  );
}

async function insertObservation(
  pool: Pool,
  input: {
    fundId: number;
    identityId: number;
    domain: 'ledger_event' | 'ownership' | 'valuation';
    status: 'accepted' | 'staged';
    effectiveDate: string;
    suffix: string;
  }
): Promise<number> {
  const hash = hash64(`${input.fundId}-${input.domain}-${input.suffix}`);
  return insertedId(
    pool,
    `
      INSERT INTO source_observations (
        fund_id, company_identity_id, domain, source_type, effective_date,
        normalized_payload, observation_hash, candidate_fingerprint, source_locator,
        dependency_group_key, status
      ) VALUES (
        $1, $2, $3, 'manual', $4, '{}'::jsonb, $5, $6, $7, $8, $9
      )
      RETURNING id
    `,
    [
      input.fundId,
      input.identityId,
      input.domain,
      input.effectiveDate,
      hash,
      hash64(`candidate-${input.fundId}-${input.domain}-${input.suffix}`),
      `task-11c:${input.suffix}`,
      `task-11c:${input.fundId}:${input.suffix}`,
      input.status,
    ]
  );
}

async function attachObservationToTranche(
  pool: Pool,
  trancheId: number,
  observationId: number
): Promise<void> {
  await pool.query(
    `
      UPDATE financing_tranches
      SET source_observation_id = $1,
          post_money_valuation = '10000000.000000'
      WHERE id = $2
    `,
    [observationId, trancheId]
  );
}

async function updateRecordedAt(
  pool: Pool,
  tableName: 'ownership_snapshots',
  id: number,
  recordedAt: string
): Promise<void> {
  await pool.query(`UPDATE ${tableName} SET recorded_at = $1 WHERE id = $2`, [recordedAt, id]);
}

async function countRows(pool: Pool, tableName: string, fundId: number): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${quoteIdentifier(tableName)} WHERE fund_id = $1`,
    [fundId]
  );
  return Number.parseInt(result.rows[0]?.count ?? '0', 10);
}

async function insertedId(pool: Pool, text: string, values: unknown[] = []): Promise<number> {
  const result = await pool.query<{ id: number | string }>(text, values);
  return Number(result.rows[0]?.id);
}

function hash64(seed: string): string {
  return Buffer.from(seed).toString('hex').padEnd(64, '0').slice(0, 64);
}
