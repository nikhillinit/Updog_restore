import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { and, eq, ne } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PgDialect } from 'drizzle-orm/pg-core';
import { Pool, type DatabaseError } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../../helpers/testcontainers';
import { runMigrationsWithConnectionString } from '../../helpers/testcontainers-migration';
import { investmentLots, investments } from '../../../shared/schema';

const { invalidateH9Artifacts } = vi.hoisted(() => ({
  invalidateH9Artifacts: vi.fn(async () => undefined),
}));

vi.mock('../../../server/services/h9-artifact-invalidation-service', () => ({
  invalidateH9Artifacts,
}));

import { convertPosition } from '../../../server/services/investment-ledger/position-conversion-service';
import { correctVehicleParticipationLedger } from '../../../server/services/investment-ledger/ledger-correction-service';

const skipIfNoDocker = !process.env.CI && process.platform === 'win32';
const createdDatabases: string[] = [];
const pgDialect = new PgDialect();
let startedTestContainers = false;

const NEW_TABLE = 'position_event_source_basis_reliefs';
const NEW_INDEXES = ['pesbr_capitalized_adj_unique'];
const PARENT_0043_CONSTRAINTS = [
  'position_events_source_basis_anchor_unique',
  'position_events_conversion_lineage_unique',
  'position_events_conversion_zero_basis_check',
  'position_events_conversion_distinct_participations_check',
  'vfp_conversion_source_lineage_unique',
  'vfp_conversion_result_basis_unique',
  'financing_events_conversion_identity_unique',
  'financing_tranches_conversion_lineage_unique',
] as const;
const RELIEF_0043_CONSTRAINTS = [
  'position_event_source_basis_reliefs_pkey',
  'pesbr_source_acq_unique',
  'pesbr_resulting_participation_unique',
  'pesbr_source_acq_event_fk',
  'pesbr_capitalized_adj_event_fk',
  'pesbr_conversion_event_fk',
  'pesbr_source_participation_fk',
  'pesbr_resulting_participation_fk',
  'pesbr_source_tranche_fk',
  'pesbr_resulting_tranche_fk',
  'pesbr_source_financing_event_fk',
  'pesbr_resulting_financing_event_fk',
  'pesbr_source_event_type_check',
  'pesbr_conversion_event_type_check',
  'pesbr_source_origin_check',
  'pesbr_resulting_origin_check',
  'pesbr_distinct_participations_check',
  'pesbr_distinct_events_check',
  'pesbr_positive_basis_check',
  'pesbr_conservation_check',
  'pesbr_adjustment_presence_check',
] as const;
const ALL_0043_CONSTRAINTS = [...PARENT_0043_CONSTRAINTS, ...RELIEF_0043_CONSTRAINTS] as const;

let adminPool: Pool | undefined;

interface ConstraintRow {
  conname: string;
  contype: string;
  columns: string[];
  foreign_table: string | null;
  foreign_columns: string[];
}

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  character_maximum_length: number | null;
}

interface IndexRow {
  indexname: string;
  indexdef: string;
}

interface ConversionSeed {
  fundId: number;
  vehicleId: number;
  otherVehicleId: number;
  identityId: number;
  otherIdentityId: number;
  sourceEventId: number;
  resultEventId: number;
  otherResultEventId: number;
  sourceTrancheId: number;
  resultTrancheId: number;
  otherResultTrancheId: number;
  sourceParticipationId: number;
  otherSourceParticipationId: number;
  resultParticipationId: number;
  otherResultParticipationId: number;
  basisMismatchResultParticipationId: number;
  sourceAcquisitionEventId: number;
  conversionEventId: number;
  basisMismatchConversionEventId: number | null;
  adjustmentEventId: number;
}

interface ServiceConversionSeed {
  fundId: number;
  vehicleId: number;
  identityId: number;
  sourceEventId: number;
  targetEventId: number;
  sourceTrancheId: number;
  targetTrancheId: number;
  sourceParticipationId: number;
  sourceAcquisitionEventId: number;
  sourceInvestmentId: number;
  sourceLotId: string | null;
}

type ReliefInsertOverrides = Partial<{
  conversionEventId: number;
  sourceAcquisitionEventId: number;
  capitalizedAdjustmentEventId: number | null;
  fundId: number;
  vehicleId: number;
  identityId: number;
  sourceParticipationId: number;
  sourceParticipationVersion: number;
  sourceEventId: number;
  sourceTrancheId: number;
  resultParticipationId: number;
  resultParticipationVersion: number;
  resultEventId: number;
  resultTrancheId: number;
  sourceTrancheVersion: number;
  resultTrancheVersion: number;
  sourceAcquisitionCostBasis: string;
  capitalizedAdjustmentCostBasis: string;
  relievedCostBasis: string;
  sourceEventType: string;
  capitalizedAdjustmentEventType: string | null;
  conversionEventType: string;
  sourceEconomicOrigin: string;
  resultingEconomicOrigin: string;
}>;

interface MismatchCase {
  name: string;
  overrides: (seed: ConversionSeed) => ReliefInsertOverrides;
  code: string;
  constraint?: string;
}

const MISMATCH_CASES: MismatchCase[] = [
  {
    name: 'fund mismatch',
    overrides: (seed) => ({ fundId: seed.fundId + 999 }),
    code: '23503',
    constraint: 'pesbr_source_acq_event_fk',
  },
  {
    name: 'vehicle mismatch',
    overrides: (seed) => ({ vehicleId: seed.otherVehicleId }),
    code: '23503',
    constraint: 'pesbr_source_acq_event_fk',
  },
  {
    name: 'company mismatch',
    overrides: (seed) => ({ identityId: seed.otherIdentityId }),
    code: '23503',
    constraint: 'pesbr_source_acq_event_fk',
  },
  {
    name: 'source participation mismatch',
    overrides: (seed) => ({ sourceParticipationId: seed.otherSourceParticipationId }),
    code: '23503',
    constraint: 'pesbr_source_acq_event_fk',
  },
  {
    name: 'result participation mismatch',
    overrides: (seed) => ({ resultParticipationId: seed.otherResultParticipationId }),
    code: '23503',
    constraint: 'pesbr_conversion_event_fk',
  },
  {
    name: 'source participation version mismatch',
    overrides: () => ({ sourceParticipationVersion: 2 }),
    code: '23503',
    constraint: 'pesbr_conversion_event_fk',
  },
  {
    name: 'result participation version mismatch',
    overrides: () => ({ resultParticipationVersion: 2 }),
    code: '23503',
    constraint: 'pesbr_conversion_event_fk',
  },
  {
    name: 'source tranche id mismatch',
    overrides: (seed) => ({ sourceTrancheId: seed.resultTrancheId }),
    code: '23503',
    constraint: 'pesbr_source_participation_fk',
  },
  {
    name: 'result tranche id mismatch',
    overrides: (seed) => ({ resultTrancheId: seed.otherResultTrancheId }),
    code: '23503',
    constraint: 'pesbr_resulting_participation_fk',
  },
  {
    name: 'source tranche version mismatch',
    overrides: () => ({ sourceTrancheVersion: 2 }),
    code: '23503',
    constraint: 'pesbr_conversion_event_fk',
  },
  {
    name: 'result tranche version mismatch',
    overrides: () => ({ resultTrancheVersion: 2 }),
    code: '23503',
    constraint: 'pesbr_conversion_event_fk',
  },
  {
    name: 'source event type mismatch',
    overrides: () => ({ sourceEventType: 'adjustment' }),
    code: '23514',
    constraint: 'pesbr_source_event_type_check',
  },
  {
    name: 'conversion event type mismatch',
    overrides: () => ({ conversionEventType: 'acquisition' }),
    code: '23514',
    constraint: 'pesbr_conversion_event_type_check',
  },
  {
    name: 'source origin mismatch',
    overrides: () => ({ sourceEconomicOrigin: 'conversion_result' }),
    code: '23514',
    constraint: 'pesbr_source_origin_check',
  },
  {
    name: 'result origin mismatch',
    overrides: () => ({ resultingEconomicOrigin: 'cash_investment' }),
    code: '23514',
    constraint: 'pesbr_resulting_origin_check',
  },
  {
    name: 'adjustment identity matches conversion event',
    overrides: (seed) => ({
      capitalizedAdjustmentEventId: seed.conversionEventId,
      capitalizedAdjustmentEventType: 'adjustment',
      capitalizedAdjustmentCostBasis: '50.000000',
      relievedCostBasis: '1050.000000',
    }),
    code: '23514',
    constraint: 'pesbr_adjustment_presence_check',
  },
  {
    name: 'adjustment amount is zero when present',
    overrides: (seed) => ({
      capitalizedAdjustmentEventId: seed.adjustmentEventId,
      capitalizedAdjustmentEventType: 'adjustment',
      capitalizedAdjustmentCostBasis: '0.000000',
      relievedCostBasis: '1000.000000',
    }),
    code: '23514',
    constraint: 'pesbr_adjustment_presence_check',
  },
  {
    name: 'adjustment missing type',
    overrides: (seed) => ({
      capitalizedAdjustmentEventId: seed.adjustmentEventId,
      capitalizedAdjustmentEventType: null,
      capitalizedAdjustmentCostBasis: '50.000000',
      relievedCostBasis: '1050.000000',
    }),
    code: '23514',
    constraint: 'pesbr_adjustment_presence_check',
  },
  {
    name: 'adjustment event amount mismatch',
    overrides: (seed) => ({
      capitalizedAdjustmentEventId: seed.adjustmentEventId,
      capitalizedAdjustmentEventType: 'adjustment',
      capitalizedAdjustmentCostBasis: '60.000000',
      relievedCostBasis: '1060.000000',
    }),
    code: '23503',
    constraint: 'pesbr_capitalized_adj_event_fk',
  },
  {
    name: 'acquisition basis mismatch',
    overrides: () => ({
      sourceAcquisitionCostBasis: '999.000000',
      relievedCostBasis: '999.000000',
    }),
    code: '23503',
    constraint: 'pesbr_source_acq_event_fk',
  },
  {
    name: 'resulting basis mismatch',
    overrides: (seed) => ({
      conversionEventId: requireBasisMismatchConversionEventId(seed),
      resultParticipationId: seed.basisMismatchResultParticipationId,
    }),
    code: '23503',
    constraint: 'pesbr_resulting_participation_fk',
  },
  {
    name: 'basis conservation mismatch',
    overrides: () => ({ relievedCostBasis: '1001.000000' }),
    code: '23514',
    constraint: 'pesbr_conservation_check',
  },
];

describe.skipIf(skipIfNoDocker)('position conversion source-basis migration', () => {
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

  it('migrates through 0042 without 0043 objects, then creates the exact 0043 catalog', async () => {
    const { connectionString } = await createDatabase('position_conversion_clean_catalog');
    await runMigrationsWithConnectionString(connectionString, '0042_positions_ownership_compat');
    await withPool(connectionString, async (pool) => {
      await expectNo0043Objects(pool);
    });

    await runMigrationsWithConnectionString(connectionString, '0043_position_source_basis_reliefs');
    await withPool(connectionString, async (pool) => {
      expect(await tableExists(pool, NEW_TABLE)).toBe(true);
      expect(await columnsForTable(pool, NEW_TABLE)).toEqual([
        ['conversion_position_event_id', 'integer', 'NO', null, 32, 0, null],
        ['source_acquisition_position_event_id', 'integer', 'NO', null, 32, 0, null],
        ['capitalized_adjustment_position_event_id', 'integer', 'YES', null, 32, 0, null],
        ['fund_id', 'integer', 'NO', null, 32, 0, null],
        ['vehicle_id', 'integer', 'NO', null, 32, 0, null],
        ['company_identity_id', 'integer', 'NO', null, 32, 0, null],
        ['source_participation_id', 'integer', 'NO', null, 32, 0, null],
        ['source_participation_version', 'integer', 'NO', null, 32, 0, null],
        ['source_financing_event_id', 'integer', 'NO', null, 32, 0, null],
        ['source_financing_tranche_id', 'integer', 'NO', null, 32, 0, null],
        ['resulting_participation_id', 'integer', 'NO', null, 32, 0, null],
        ['resulting_participation_version', 'integer', 'NO', null, 32, 0, null],
        ['resulting_financing_event_id', 'integer', 'NO', null, 32, 0, null],
        ['resulting_financing_tranche_id', 'integer', 'NO', null, 32, 0, null],
        ['source_tranche_version', 'integer', 'NO', null, 32, 0, null],
        ['resulting_tranche_version', 'integer', 'NO', null, 32, 0, null],
        ['source_acquisition_cost_basis', 'numeric', 'NO', null, 20, 6, null],
        ['capitalized_adjustment_cost_basis', 'numeric', 'NO', '0', 20, 6, null],
        ['relieved_cost_basis', 'numeric', 'NO', null, 20, 6, null],
        ['source_event_type', 'character varying', 'NO', "'acquisition'::character varying", null, null, 32],
        ['capitalized_adjustment_event_type', 'character varying', 'YES', null, null, null, 32],
        ['conversion_event_type', 'character varying', 'NO', "'conversion'::character varying", null, null, 32],
        ['source_economic_origin', 'character varying', 'NO', "'cash_investment'::character varying", null, null, 32],
        ['resulting_economic_origin', 'character varying', 'NO', "'conversion_result'::character varying", null, null, 32],
      ]);
      await expectParentCatalog(pool);
      await expectReliefCatalog(pool);
      expect(await indexesForTable(pool, NEW_TABLE)).toEqual([
        {
          indexname: 'pesbr_capitalized_adj_unique',
          indexdef:
            'CREATE UNIQUE INDEX pesbr_capitalized_adj_unique ON public.position_event_source_basis_reliefs USING btree (capitalized_adjustment_position_event_id) WHERE (capitalized_adjustment_position_event_id IS NOT NULL)',
        },
        {
          indexname: 'position_event_source_basis_reliefs_pkey',
          indexdef:
            'CREATE UNIQUE INDEX position_event_source_basis_reliefs_pkey ON public.position_event_source_basis_reliefs USING btree (conversion_position_event_id)',
        },
      ]);
    });
  });

  it('rejects pre-existing conversion events before 0043 and rolls back all 0043 DDL', async () => {
    const { connectionString } = await createDatabase('position_conversion_preflight_absent');
    await runMigrationsWithConnectionString(connectionString, '0042_positions_ownership_compat');

    await withPool(connectionString, async (pool) => {
      await seedConversionParents(pool, 120_430_101);
    });

    await expect(
      runMigrationsWithConnectionString(connectionString, '0043_position_source_basis_reliefs')
    ).rejects.toThrow(/orphan conversion event ids=/);

    await withPool(connectionString, async (pool) => {
      await expectNo0043Objects(pool);
    });
  });

  it('replays raw 0043 after valid conversion rows without duplicate catalog or row changes', async () => {
    const { connectionString } = await createDatabase('position_conversion_replay_valid');
    await runMigrationsWithConnectionString(connectionString, '0043_position_source_basis_reliefs');

    await withPool(connectionString, async (pool) => {
      const seed = await seedConversionParents(pool, 120_430_201);
      await insertValidSourceBasisRelief(pool, seed);
      const before = await replaySnapshot(pool);
      await pool.query(await migration0043Sql());
      const after = await replaySnapshot(pool);

      expect(after).toEqual(before);
    });
  });

  it('rejects raw 0043 replay when the table exists but a conversion lacks relief', async () => {
    const { connectionString } = await createDatabase('position_conversion_replay_orphan');
    await runMigrationsWithConnectionString(connectionString, '0043_position_source_basis_reliefs');

    await withPool(connectionString, async (pool) => {
      await seedConversionParents(pool, 120_430_301);

      await expect(pool.query(await migration0043Sql())).rejects.toMatchObject({
        code: 'P0001',
      });
      expect(await tableExists(pool, NEW_TABLE)).toBe(true);
      expect(await rowCount(pool, NEW_TABLE)).toBe(0);
    });
  });

  it.each(MISMATCH_CASES)(
    'rejects direct source-basis relief rows with $name',
    async ({ overrides, code, constraint }) => {
      const { connectionString } = await createDatabase('position_conversion_mismatch');
      await runMigrationsWithConnectionString(connectionString, '0043_position_source_basis_reliefs');

      await withPool(connectionString, async (pool) => {
        const seed = await seedConversionParents(pool, nextFundId(), {
          includeBasisMismatchConversion: name === 'resulting basis mismatch',
        });
        const before = await persistenceCounts(pool, seed.fundId);

        const error = await capturePgError(() => pool.query(reliefInsertSql(seed, overrides(seed))));

        expect(error.code).toBe(code);
        if (constraint) {
          expect(error.constraint).toBe(constraint);
        }
        expect(await persistenceCounts(pool, seed.fundId)).toEqual(before);
      });
    }
  );

  it('converts a no-lot SAFE source through the real service and preserves legacy compatibility rows', async () => {
    invalidateH9Artifacts.mockClear();
    const { connectionString } = await createDatabase('position_conversion_service_no_lot');
    await runMigrationsWithConnectionString(connectionString, '0043_position_source_basis_reliefs');

    await withPool(connectionString, async (pool) => {
      const seed = await seedServiceConversion(pool, nextFundId(), {
        sourceLot: false,
        unpricedSource: true,
      });
      const before = await legacyCompatibilitySnapshot(pool, seed.fundId);
      await expectSourceIsUnpricedNoLot(pool, seed);
      const result = await convertPosition({
        fundId: seed.fundId,
        actorId: null,
        idempotencyKey: `pg-no-lot-${seed.fundId}`,
        request: conversionRequest(seed),
        database: drizzle(pool) as never,
      });

      expect(result.replayed).toBe(false);
      expect(result.value.reliefMode).toBe('source_basis');
      expect(result.value.lotReliefs).toEqual([]);
      expect(result.value.sourceBasisRelief).toMatchObject({
        sourceAcquisitionPositionEventId: seed.sourceAcquisitionEventId,
        sourceParticipationId: seed.sourceParticipationId,
        sourceAcquisitionCostBasis: '1000.000000',
        capitalizedAdjustmentCostBasis: '0.000000',
        relievedCostBasis: '1000.000000',
        sourceEconomicOrigin: 'cash_investment',
        resultingEconomicOrigin: 'conversion_result',
      });
      expect(await countRows(pool, 'position_event_source_basis_reliefs', seed.fundId)).toBe(1);
      expect(await countRows(pool, 'position_event_lot_reliefs', seed.fundId)).toBe(0);
      expect(await resultConversionLots(pool, result.value.resultingParticipation.id)).toEqual([
        expect.objectContaining({
          investment_id: seed.sourceInvestmentId,
          lot_type: 'conversion',
          cost_basis_cents: '100000',
          vehicle_participation_id: result.value.resultingParticipation.id,
        }),
      ]);
      expect(await legacyCompatibilitySnapshot(pool, seed.fundId)).toEqual(before);
      expect(invalidateH9Artifacts).toHaveBeenCalledWith(seed.fundId);
    });
  });

  it('converts a lot-backed source with strict lot relief plus source-basis receipt', async () => {
    invalidateH9Artifacts.mockClear();
    const { connectionString } = await createDatabase('position_conversion_service_lot');
    await runMigrationsWithConnectionString(connectionString, '0043_position_source_basis_reliefs');

    await withPool(connectionString, async (pool) => {
      const seed = await seedServiceConversion(pool, nextFundId(), {
        sourceLot: true,
        unpricedSource: false,
      });
      const result = await convertPosition({
        fundId: seed.fundId,
        actorId: null,
        idempotencyKey: `pg-lot-${seed.fundId}`,
        request: conversionRequest(seed, {
          sourceLotReliefs: [
            {
              investmentId: seed.sourceInvestmentId,
              investmentLotId: requireString(seed.sourceLotId),
              relievedShares: '100.000000',
              relievedCostBasis: '1000.000000',
            },
          ],
        }),
        database: drizzle(pool) as never,
      });

      expect(result.replayed).toBe(false);
      expect(result.value.reliefMode).toBe('specific_lots');
      expect(result.value.conversionEvent.sharesDelta).toBe('0.000000');
      expect(result.value.lotReliefs).toEqual([
        {
          investmentId: seed.sourceInvestmentId,
          investmentLotId: seed.sourceLotId,
          relievedShares: '100.000000',
          relievedCostBasis: '1000.000000',
          allocatedProceeds: '0.000000',
        },
      ]);
      expect(await countRows(pool, 'position_event_source_basis_reliefs', seed.fundId)).toBe(1);
      expect(await countRows(pool, 'position_event_lot_reliefs', seed.fundId)).toBe(1);
    });
  });

  it('capitalizes interest as an adjustment before the conversion in the same transaction', async () => {
    invalidateH9Artifacts.mockClear();
    const { connectionString } = await createDatabase('position_conversion_service_interest');
    await runMigrationsWithConnectionString(connectionString, '0043_position_source_basis_reliefs');

    await withPool(connectionString, async (pool) => {
      const seed = await seedServiceConversion(pool, nextFundId(), {
        sourceLot: false,
        unpricedSource: true,
      });
      const before = await legacyCompatibilitySnapshot(pool, seed.fundId);
      const result = await convertPosition({
        fundId: seed.fundId,
        actorId: null,
        idempotencyKey: `pg-interest-${seed.fundId}`,
        request: conversionRequest(seed, {
          resultingSharesAcquired: '101.000000',
          accruedInterest: {
            mode: 'capitalized_with_adjustment',
            amount: '10.000000',
          },
        }),
        database: drizzle(pool) as never,
      });

      expect(result.value.capitalizedAdjustmentEvent).toMatchObject({
        eventType: 'adjustment',
        sharesDelta: '0.000000',
        costBasisDelta: '10.000000',
        proceeds: '0.000000',
      });
      expect(result.value.sourceBasisRelief).toMatchObject({
        sourceAcquisitionCostBasis: '1000.000000',
        capitalizedAdjustmentCostBasis: '10.000000',
        relievedCostBasis: '1010.000000',
      });
      expect(result.value.resultingParticipation.participationAmount).toBe('1010.000000');
      expect(result.value.capitalizedAdjustmentEvent!.id).toBeLessThan(
        result.value.conversionEvent.id
      );
      expect(await resultConversionLots(pool, result.value.resultingParticipation.id)).toEqual([
        expect.objectContaining({ cost_basis_cents: '101000' }),
      ]);
      expect(await legacyCompatibilitySnapshot(pool, seed.fundId)).toEqual(before);
      expect(invalidateH9Artifacts).toHaveBeenCalledTimes(1);
    });
  });

  it('replays the exact same idempotency key and rejects changed payload without more rows', async () => {
    invalidateH9Artifacts.mockClear();
    const { connectionString } = await createDatabase('position_conversion_service_replay');
    await runMigrationsWithConnectionString(connectionString, '0043_position_source_basis_reliefs');

    await withPool(connectionString, async (pool) => {
      const seed = await seedServiceConversion(pool, nextFundId(), {
        sourceLot: false,
        unpricedSource: true,
      });
      const database = drizzle(pool) as never;
      const request = conversionRequest(seed);
      const first = await convertPosition({
        fundId: seed.fundId,
        actorId: null,
        idempotencyKey: `pg-replay-${seed.fundId}`,
        request,
        database,
      });
      const afterFirst = await conversionPersistenceSnapshot(pool, seed.fundId);

      const replay = await convertPosition({
        fundId: seed.fundId,
        actorId: null,
        idempotencyKey: `pg-replay-${seed.fundId}`,
        request,
        database,
      });
      const changedPayloadError = await captureError(() =>
        convertPosition({
          fundId: seed.fundId,
          actorId: null,
          idempotencyKey: `pg-replay-${seed.fundId}`,
          request: conversionRequest(seed, { resultingSharesAcquired: '101.000000' }),
          database,
        })
      );

      expect(replay).toEqual({ value: first.value, replayed: true });
      expect(changedPayloadError).toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSE' });
      expect(await conversionPersistenceSnapshot(pool, seed.fundId)).toEqual(afterFirst);
    });
  });

  it('serializes same-key concurrent requests into one commit and one replay', async () => {
    invalidateH9Artifacts.mockClear();
    const { connectionString } = await createDatabase('position_conversion_service_same_key');
    await runMigrationsWithConnectionString(connectionString, '0043_position_source_basis_reliefs');

    await withPool(connectionString, async (pool) => {
      const seed = await seedServiceConversion(pool, nextFundId(), {
        sourceLot: false,
        unpricedSource: true,
      });
      const database = drizzle(pool, { logger: false }) as never;
      const results = await Promise.all([
        convertPosition({
          fundId: seed.fundId,
          actorId: null,
          idempotencyKey: `pg-same-key-${seed.fundId}`,
          request: conversionRequest(seed),
          database,
        }),
        convertPosition({
          fundId: seed.fundId,
          actorId: null,
          idempotencyKey: `pg-same-key-${seed.fundId}`,
          request: conversionRequest(seed),
          database,
        }),
      ]);

      expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
      expect(new Set(results.map((result) => result.value.conversionEvent.id)).size).toBe(1);
      expect(await conversionPersistenceSnapshot(pool, seed.fundId)).toMatchObject({
        conversionEvents: 1,
        sourceBasisReliefs: 1,
        resultParticipations: 1,
        resultLots: 1,
      });
      expect(invalidateH9Artifacts).toHaveBeenCalledTimes(1);
      expect(invalidateH9Artifacts).toHaveBeenCalledWith(seed.fundId);
    });
  });

  it('serializes different-key same-source requests into one success and one typed conflict', async () => {
    invalidateH9Artifacts.mockClear();
    const { connectionString } = await createDatabase('position_conversion_service_diff_key');
    await runMigrationsWithConnectionString(connectionString, '0043_position_source_basis_reliefs');

    await withPool(connectionString, async (pool) => {
      const seed = await seedServiceConversion(pool, nextFundId(), {
        sourceLot: false,
        unpricedSource: true,
      });
      const database = drizzle(pool, { logger: false }) as never;
      const results = await Promise.allSettled([
        convertPosition({
          fundId: seed.fundId,
          actorId: null,
          idempotencyKey: `pg-diff-key-a-${seed.fundId}`,
          request: conversionRequest(seed),
          database,
        }),
        convertPosition({
          fundId: seed.fundId,
          actorId: null,
          idempotencyKey: `pg-diff-key-b-${seed.fundId}`,
          request: conversionRequest(seed),
          database,
        }),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((result) => result.status === 'rejected');
      expect(rejected).toMatchObject({
        status: 'rejected',
        reason: expect.objectContaining({
          status: 409,
          code: 'POSITION_CONVERSION_CONFLICT',
        }),
      });
      expect(await conversionPersistenceSnapshot(pool, seed.fundId)).toMatchObject({
        conversionEvents: 1,
        sourceBasisReliefs: 1,
        resultParticipations: 1,
        resultLots: 1,
      });
    });
  });

  it('serializes different-key attempts against the same physical source lot', async () => {
    invalidateH9Artifacts.mockClear();
    const { connectionString } = await createDatabase('position_conversion_service_lot_race');
    await runMigrationsWithConnectionString(connectionString, '0043_position_source_basis_reliefs');

    await withPool(connectionString, async (pool) => {
      const seed = await seedServiceConversion(pool, nextFundId(), {
        sourceLot: true,
        unpricedSource: false,
      });
      const database = drizzle(pool, { logger: false }) as never;
      const request = conversionRequest(seed, {
        sourceLotReliefs: [
          {
            investmentId: seed.sourceInvestmentId,
            investmentLotId: requireString(seed.sourceLotId),
            relievedShares: '100.000000',
            relievedCostBasis: '1000.000000',
          },
        ],
      });
      const results = await Promise.allSettled([
        convertPosition({
          fundId: seed.fundId,
          actorId: null,
          idempotencyKey: `pg-lot-race-a-${seed.fundId}`,
          request,
          database,
        }),
        convertPosition({
          fundId: seed.fundId,
          actorId: null,
          idempotencyKey: `pg-lot-race-b-${seed.fundId}`,
          request,
          database,
        }),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((result) => result.status === 'rejected')).toMatchObject({
        status: 'rejected',
        reason: expect.objectContaining({
          status: 409,
          code: 'POSITION_CONVERSION_CONFLICT',
        }),
      });
      expect(await conversionPersistenceSnapshot(pool, seed.fundId)).toMatchObject({
        conversionEvents: 1,
        sourceBasisReliefs: 1,
        lotReliefs: 1,
        resultParticipations: 1,
        resultLots: 1,
      });
      expect(invalidateH9Artifacts).toHaveBeenCalledTimes(1);
      expect(invalidateH9Artifacts).toHaveBeenCalledWith(seed.fundId);
    });
  });

  it('rolls back every conversion row when the final participation link update fails and skips H9', async () => {
    invalidateH9Artifacts.mockClear();
    const { connectionString } = await createDatabase('position_conversion_service_rollback');
    await runMigrationsWithConnectionString(connectionString, '0043_position_source_basis_reliefs');

    await withPool(connectionString, async (pool) => {
      const seed = await seedServiceConversion(pool, nextFundId(), {
        sourceLot: true,
        unpricedSource: false,
      });
      const database = drizzle(pool) as { execute: (query: unknown) => Promise<unknown> };
      const failingDatabase = {
        execute: async (query: unknown): Promise<unknown> => {
          if (isParticipationLinkUpdate(query)) {
            throw new Error('Injected final participation-link failure.');
          }
          return database.execute(query);
        },
        transaction: async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> =>
          (database as unknown as { transaction: (cb: (tx: unknown) => Promise<T>) => Promise<T> }).transaction(
            async (tx) => {
              const txDb = tx as { execute: (query: unknown) => Promise<unknown> };
              return callback({
                execute: async (query: unknown): Promise<unknown> => {
                  if (isParticipationLinkUpdate(query)) {
                    throw new Error('Injected final participation-link failure.');
                  }
                  return txDb.execute(query);
                },
              });
            }
          ),
      };
      const before = await conversionPersistenceSnapshot(pool, seed.fundId);

      await expect(
        convertPosition({
          fundId: seed.fundId,
          actorId: null,
          idempotencyKey: `pg-rollback-${seed.fundId}`,
          request: conversionRequest(seed, {
            sourceLotReliefs: [
              {
                investmentId: seed.sourceInvestmentId,
                investmentLotId: requireString(seed.sourceLotId),
                relievedShares: '100.000000',
                relievedCostBasis: '1000.000000',
              },
            ],
          }),
          database: failingDatabase as never,
        })
      ).rejects.toThrow('Injected final participation-link failure.');

      expect(await conversionPersistenceSnapshot(pool, seed.fundId)).toEqual(before);
      expect(invalidateH9Artifacts).not.toHaveBeenCalledWith(seed.fundId);
    });
  });

  it('executes the cohort lot query shape and excludes conversion lots from the observed input rows', async () => {
    invalidateH9Artifacts.mockClear();
    const { connectionString } = await createDatabase('position_conversion_cohort_lots');
    await runMigrationsWithConnectionString(connectionString, '0043_position_source_basis_reliefs');

    await withPool(connectionString, async (pool) => {
      const seed = await seedServiceConversion(pool, nextFundId(), {
        sourceLot: false,
        unpricedSource: true,
      });
      const cashInvestmentId = await insertServiceInvestment(pool, {
        fundId: seed.fundId,
        companyId: await portfolioCompanyIdForIdentity(pool, seed.identityId),
        sourceParticipationId: null,
      });
      const cashLotId = await insertServiceSourceLot(pool, cashInvestmentId, seed.fundId + 10_000);
      const database = drizzle(pool);

      await convertPosition({
        fundId: seed.fundId,
        actorId: null,
        idempotencyKey: `pg-cohort-${seed.fundId}`,
        request: conversionRequest(seed),
        database: database as never,
      });

      const rows = await database
        .select({
          id: investmentLots.id,
          investmentId: investmentLots.investmentId,
          lotType: investmentLots.lotType,
          costBasisCents: investmentLots.costBasisCents,
        })
        .from(investmentLots)
        .innerJoin(investments, eq(investmentLots.investmentId, investments.id))
        .where(and(eq(investments.fundId, seed.fundId), ne(investmentLots.lotType, 'conversion')));

      expect(rows).toEqual([
        expect.objectContaining({
          id: cashLotId,
          investmentId: cashInvestmentId,
          lotType: 'initial',
          costBasisCents: 100000n,
        }),
      ]);
      expect(await conversionLotCount(pool, seed.fundId)).toBe(1);
    });
  });

  it('rejects generic correction after conversion without splitting heads or mutating legacy rows', async () => {
    invalidateH9Artifacts.mockClear();
    const { connectionString } = await createDatabase('position_conversion_correction_locked');
    await runMigrationsWithConnectionString(connectionString, '0043_position_source_basis_reliefs');

    await withPool(connectionString, async (pool) => {
      const seed = await seedServiceConversion(pool, nextFundId(), {
        sourceLot: false,
        unpricedSource: true,
      });
      const database = drizzle(pool) as never;
      await convertPosition({
        fundId: seed.fundId,
        actorId: null,
        idempotencyKey: `pg-correction-lock-convert-${seed.fundId}`,
        request: conversionRequest(seed),
        database,
      });
      invalidateH9Artifacts.mockClear();
      const before = {
        conversion: await conversionPersistenceSnapshot(pool, seed.fundId),
        legacy: await legacyCompatibilitySnapshot(pool, seed.fundId),
        heads: await participationAndTrancheHeads(pool, seed.fundId),
      };

      const error = await captureError(() =>
        correctVehicleParticipationLedger({
          fundId: seed.fundId,
          trancheId: seed.sourceTrancheId,
          actorId: null,
          idempotencyKey: `pg-correction-lock-${seed.fundId}`,
          request: correctionRequest(seed),
          database,
        })
      );

      expect(error).toMatchObject({
        status: 409,
        code: 'PARTICIPATION_CONVERSION_LOCKED',
      });
      expect(await conversionPersistenceSnapshot(pool, seed.fundId)).toEqual(before.conversion);
      expect(await legacyCompatibilitySnapshot(pool, seed.fundId)).toEqual(before.legacy);
      expect(await participationAndTrancheHeads(pool, seed.fundId)).toEqual(before.heads);
      expect(invalidateH9Artifacts).not.toHaveBeenCalledWith(seed.fundId);
    });
  });

  it('serializes a live conversion-versus-correction race without split heads or mixed origin', async () => {
    invalidateH9Artifacts.mockClear();
    const { connectionString } = await createDatabase('position_conversion_correction_race');
    await runMigrationsWithConnectionString(connectionString, '0043_position_source_basis_reliefs');

    await withPool(connectionString, async (pool) => {
      const seed = await seedServiceConversion(pool, nextFundId(), {
        sourceLot: false,
        unpricedSource: true,
      });
      const database = drizzle(pool, { logger: false }) as never;
      const legacyBefore = await legacyCompatibilitySnapshot(pool, seed.fundId);
      const outcomes = await Promise.allSettled([
        convertPosition({
          fundId: seed.fundId,
          actorId: null,
          idempotencyKey: `pg-correction-race-convert-${seed.fundId}`,
          request: conversionRequest(seed),
          database,
        }),
        correctVehicleParticipationLedger({
          fundId: seed.fundId,
          trancheId: seed.sourceTrancheId,
          actorId: null,
          idempotencyKey: `pg-correction-race-correct-${seed.fundId}`,
          request: correctionRequest(seed),
          database,
        }),
      ]);

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
      const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
      const persistence = await conversionPersistenceSnapshot(pool, seed.fundId);
      const heads = await participationAndTrancheHeads(pool, seed.fundId);
      const activeParticipations = (
        heads.participations as Array<{
          id: number;
          financing_tranche_id: number;
          economic_origin: 'cash_investment' | 'conversion_result';
          superseded_by_participation_id: number | null;
        }>
      ).filter((row) => row.superseded_by_participation_id === null);
      const activeTranches = (
        heads.tranches as Array<{
          id: number;
          version: number;
          superseded_by_tranche_id: number | null;
        }>
      ).filter((row) => row.superseded_by_tranche_id === null);

      expect(activeTranches).toHaveLength(2);
      expect(activeTranches.some((row) => row.id === seed.targetTrancheId)).toBe(true);
      expect(invalidateH9Artifacts).toHaveBeenCalledTimes(1);
      expect(invalidateH9Artifacts).toHaveBeenCalledWith(seed.fundId);

      if (persistence.conversionEvents === 1) {
        expect(rejected).toMatchObject({
          status: 'rejected',
          reason: expect.objectContaining({
            status: 409,
            code: 'PARTICIPATION_CONVERSION_LOCKED',
          }),
        });
        expect(persistence).toMatchObject({
          sourceBasisReliefs: 1,
          resultParticipations: 1,
          resultLots: 1,
        });
        expect(activeParticipations.map((row) => row.economic_origin).sort()).toEqual([
          'cash_investment',
          'conversion_result',
        ]);
        expect(await legacyCompatibilitySnapshot(pool, seed.fundId)).toEqual(legacyBefore);
      } else {
        expect(rejected).toMatchObject({
          status: 'rejected',
          reason: expect.objectContaining({
            status: 404,
            code: 'POSITION_CONVERSION_NOT_FOUND',
          }),
        });
        expect(persistence).toMatchObject({
          conversionEvents: 0,
          sourceBasisReliefs: 0,
          resultParticipations: 0,
          resultLots: 0,
        });
        expect(activeParticipations).toHaveLength(1);
        expect(activeParticipations[0]).toMatchObject({
          economic_origin: 'cash_investment',
        });
        expect(activeParticipations[0]?.financing_tranche_id).not.toBe(seed.sourceTrancheId);
      }
    });
  });
});

function isParticipationLinkUpdate(query: unknown): boolean {
  const rendered = pgDialect.sqlToQuery(query as never).sql.replace(/\s+/g, ' ').trim();
  return rendered.startsWith('UPDATE vehicle_financing_participations SET source_observation_id');
}

let fundIdCounter = 120_431_000;
function nextFundId(): number {
  fundIdCounter += 1;
  return fundIdCounter;
}

async function createDatabase(label: string): Promise<{ connectionString: string }> {
  if (!adminPool) throw new Error('adminPool missing');
  const databaseName = `${label}_${process.pid}_${Date.now()}_${createdDatabases.length}`.toLowerCase();
  createdDatabases.push(databaseName);
  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  const connectionString = databaseConnectionString(databaseName);
  await withPool(connectionString, async (pool) => {
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  });
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

async function withPool<T>(connectionString: string, callback: (pool: Pool) => Promise<T>) {
  const pool = new Pool({ connectionString, max: 4 });
  try {
    return await callback(pool);
  } finally {
    await pool.end();
  }
}

async function migration0043Sql(): Promise<string> {
  return readFile(
    path.join(process.cwd(), 'migrations', '0043_position_source_basis_reliefs.sql'),
    'utf8'
  );
}

async function expectNo0043Objects(pool: Pool): Promise<void> {
  expect(await tableExists(pool, NEW_TABLE)).toBe(false);
  const names = await constraintNames(pool);
  for (const constraint of ALL_0043_CONSTRAINTS) {
    expect(names, constraint).not.toContain(constraint);
  }
  const indexes = await indexNames(pool);
  for (const index of NEW_INDEXES) {
    expect(indexes, index).not.toContain(index);
  }
}

async function expectParentCatalog(pool: Pool): Promise<void> {
  expect(await constraintsForTable(pool, 'position_events')).toEqual(
    expect.arrayContaining([
      constraint('position_events_source_basis_anchor_unique', 'u', [
        'id',
        'fund_id',
        'vehicle_id',
        'company_identity_id',
        'event_type',
        'vehicle_participation_id',
        'cost_basis_delta',
      ]),
      constraint('position_events_conversion_lineage_unique', 'u', [
        'id',
        'fund_id',
        'vehicle_id',
        'company_identity_id',
        'event_type',
        'vehicle_participation_id',
        'source_participation_version',
        'resulting_participation_id',
        'resulting_participation_version',
        'source_tranche_version',
        'resulting_tranche_version',
      ]),
      constraint('position_events_conversion_zero_basis_check', 'c', [
        'event_type',
        'cost_basis_delta',
        'proceeds',
      ]),
      constraint('position_events_conversion_distinct_participations_check', 'c', [
        'event_type',
        'vehicle_participation_id',
        'resulting_participation_id',
      ]),
    ])
  );
  expect(await constraintsForTable(pool, 'vehicle_financing_participations')).toEqual(
    expect.arrayContaining([
      constraint('vfp_conversion_source_lineage_unique', 'u', [
        'id',
        'fund_id',
        'vehicle_id',
        'version',
        'financing_event_id',
        'financing_tranche_id',
        'economic_origin',
      ]),
      constraint('vfp_conversion_result_basis_unique', 'u', [
        'id',
        'fund_id',
        'vehicle_id',
        'version',
        'financing_event_id',
        'financing_tranche_id',
        'economic_origin',
        'participation_amount',
      ]),
    ])
  );
  expect(await constraintsForTable(pool, 'financing_events')).toEqual(
    expect.arrayContaining([
      constraint('financing_events_conversion_identity_unique', 'u', [
        'id',
        'fund_id',
        'company_identity_id',
      ]),
    ])
  );
  expect(await constraintsForTable(pool, 'financing_tranches')).toEqual(
    expect.arrayContaining([
      constraint('financing_tranches_conversion_lineage_unique', 'u', [
        'id',
        'fund_id',
        'financing_event_id',
        'version',
      ]),
    ])
  );
}

async function expectReliefCatalog(pool: Pool): Promise<void> {
  expect(await constraintsForTable(pool, NEW_TABLE)).toEqual(
    expect.arrayContaining([
      constraint('position_event_source_basis_reliefs_pkey', 'p', ['conversion_position_event_id']),
      constraint('pesbr_source_acq_unique', 'u', ['source_acquisition_position_event_id']),
      constraint('pesbr_resulting_participation_unique', 'u', ['resulting_participation_id']),
      fk('pesbr_source_acq_event_fk', [
        'source_acquisition_position_event_id',
        'fund_id',
        'vehicle_id',
        'company_identity_id',
        'source_event_type',
        'source_participation_id',
        'source_acquisition_cost_basis',
      ], 'position_events', [
        'id',
        'fund_id',
        'vehicle_id',
        'company_identity_id',
        'event_type',
        'vehicle_participation_id',
        'cost_basis_delta',
      ]),
      fk('pesbr_capitalized_adj_event_fk', [
        'capitalized_adjustment_position_event_id',
        'fund_id',
        'vehicle_id',
        'company_identity_id',
        'capitalized_adjustment_event_type',
        'source_participation_id',
        'capitalized_adjustment_cost_basis',
      ], 'position_events', [
        'id',
        'fund_id',
        'vehicle_id',
        'company_identity_id',
        'event_type',
        'vehicle_participation_id',
        'cost_basis_delta',
      ]),
      fk('pesbr_conversion_event_fk', [
        'conversion_position_event_id',
        'fund_id',
        'vehicle_id',
        'company_identity_id',
        'conversion_event_type',
        'source_participation_id',
        'source_participation_version',
        'resulting_participation_id',
        'resulting_participation_version',
        'source_tranche_version',
        'resulting_tranche_version',
      ], 'position_events', [
        'id',
        'fund_id',
        'vehicle_id',
        'company_identity_id',
        'event_type',
        'vehicle_participation_id',
        'source_participation_version',
        'resulting_participation_id',
        'resulting_participation_version',
        'source_tranche_version',
        'resulting_tranche_version',
      ]),
      fk('pesbr_source_participation_fk', [
        'source_participation_id',
        'fund_id',
        'vehicle_id',
        'source_participation_version',
        'source_financing_event_id',
        'source_financing_tranche_id',
        'source_economic_origin',
      ], 'vehicle_financing_participations', [
        'id',
        'fund_id',
        'vehicle_id',
        'version',
        'financing_event_id',
        'financing_tranche_id',
        'economic_origin',
      ]),
      fk('pesbr_resulting_participation_fk', [
        'resulting_participation_id',
        'fund_id',
        'vehicle_id',
        'resulting_participation_version',
        'resulting_financing_event_id',
        'resulting_financing_tranche_id',
        'resulting_economic_origin',
        'relieved_cost_basis',
      ], 'vehicle_financing_participations', [
        'id',
        'fund_id',
        'vehicle_id',
        'version',
        'financing_event_id',
        'financing_tranche_id',
        'economic_origin',
        'participation_amount',
      ]),
      fk('pesbr_source_tranche_fk', [
        'source_financing_tranche_id',
        'fund_id',
        'source_financing_event_id',
        'source_tranche_version',
      ], 'financing_tranches', ['id', 'fund_id', 'financing_event_id', 'version']),
      fk('pesbr_resulting_tranche_fk', [
        'resulting_financing_tranche_id',
        'fund_id',
        'resulting_financing_event_id',
        'resulting_tranche_version',
      ], 'financing_tranches', ['id', 'fund_id', 'financing_event_id', 'version']),
      fk('pesbr_source_financing_event_fk', [
        'source_financing_event_id',
        'fund_id',
        'company_identity_id',
      ], 'financing_events', ['id', 'fund_id', 'company_identity_id']),
      fk('pesbr_resulting_financing_event_fk', [
        'resulting_financing_event_id',
        'fund_id',
        'company_identity_id',
      ], 'financing_events', ['id', 'fund_id', 'company_identity_id']),
      constraint('pesbr_source_event_type_check', 'c', ['source_event_type']),
      constraint('pesbr_conversion_event_type_check', 'c', ['conversion_event_type']),
      constraint('pesbr_source_origin_check', 'c', ['source_economic_origin']),
      constraint('pesbr_resulting_origin_check', 'c', ['resulting_economic_origin']),
      constraint('pesbr_distinct_participations_check', 'c', [
        'source_participation_id',
        'resulting_participation_id',
      ]),
      constraint('pesbr_distinct_events_check', 'c', [
        'conversion_position_event_id',
        'source_acquisition_position_event_id',
      ]),
      constraint('pesbr_positive_basis_check', 'c', [
        'source_acquisition_cost_basis',
        'capitalized_adjustment_cost_basis',
        'relieved_cost_basis',
      ]),
      constraint('pesbr_conservation_check', 'c', [
        'relieved_cost_basis',
        'source_acquisition_cost_basis',
        'capitalized_adjustment_cost_basis',
      ]),
      constraint('pesbr_adjustment_presence_check', 'c', [
        'capitalized_adjustment_position_event_id',
        'capitalized_adjustment_event_type',
        'capitalized_adjustment_cost_basis',
        'source_acquisition_position_event_id',
        'conversion_position_event_id',
      ]),
    ])
  );
}

function constraint(conname: string, contype: string, columns: string[]) {
  return expect.objectContaining({ conname, contype, columns });
}

function fk(
  conname: string,
  columns: string[],
  foreignTable: string,
  foreignColumns: string[]
) {
  return expect.objectContaining({
    conname,
    contype: 'f',
    columns,
    foreign_table: foreignTable,
    foreign_columns: foreignColumns,
  });
}

async function tableExists(pool: Pool, tableName: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      )
    `,
    [tableName]
  );
  return result.rows[0]?.exists === true;
}

async function columnsForTable(pool: Pool, tableName: string): Promise<unknown[][]> {
  const result = await pool.query<ColumnRow>(
    `
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default,
        numeric_precision,
        numeric_scale,
        character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [tableName]
  );
  return result.rows.map((row) => [
    row.column_name,
    row.data_type,
    row.is_nullable,
    normalizeDefault(row.column_default),
    row.numeric_precision,
    row.numeric_scale,
    row.character_maximum_length,
  ]);
}

function normalizeDefault(defaultValue: string | null): string | null {
  if (defaultValue === null) return null;
  return defaultValue.replace(/\s+/g, ' ');
}

async function constraintsForTable(pool: Pool, tableName: string): Promise<ConstraintRow[]> {
  const result = await pool.query<ConstraintRow>(
    `
      SELECT
        con.conname,
        con.contype,
        COALESCE(
          (
            SELECT array_agg(att.attname::text ORDER BY key_columns.ordinality)
            FROM unnest(con.conkey) WITH ORDINALITY AS key_columns(attnum, ordinality)
            JOIN pg_attribute att
              ON att.attrelid = con.conrelid
             AND att.attnum = key_columns.attnum
          ),
          ARRAY[]::text[]
        ) AS columns,
        CASE WHEN con.confrelid = 0 THEN NULL ELSE foreign_class.relname END AS foreign_table,
        COALESCE(
          (
            SELECT array_agg(att.attname::text ORDER BY key_columns.ordinality)
            FROM unnest(con.confkey) WITH ORDINALITY AS key_columns(attnum, ordinality)
            JOIN pg_attribute att
              ON att.attrelid = con.confrelid
             AND att.attnum = key_columns.attnum
          ),
          ARRAY[]::text[]
        ) AS foreign_columns
      FROM pg_constraint con
      LEFT JOIN pg_class foreign_class ON foreign_class.oid = con.confrelid
      WHERE con.conrelid = $1::regclass
      ORDER BY con.conname
    `,
    [`public.${tableName}`]
  );
  return result.rows;
}

async function indexesForTable(pool: Pool, tableName: string): Promise<IndexRow[]> {
  const result = await pool.query<IndexRow>(
    `
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = $1
        AND indexname = ANY($2::text[])
      ORDER BY indexname
    `,
    [tableName, [...NEW_INDEXES, 'position_event_source_basis_reliefs_pkey']]
  );
  return result.rows.map((row) => ({
    indexname: row.indexname,
    indexdef: row.indexdef.replace(/\s+/g, ' '),
  }));
}

async function constraintNames(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ conname: string }>(`
    SELECT conname
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
    ORDER BY conname
  `);
  return result.rows.map((row) => row.conname);
}

async function indexNames(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ indexname: string }>(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY indexname
  `);
  return result.rows.map((row) => row.indexname);
}

async function rowCount(pool: Pool, tableName: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${quoteIdentifier(tableName)}`
  );
  return Number.parseInt(result.rows[0]?.count ?? '0', 10);
}

async function replaySnapshot(pool: Pool): Promise<Record<string, number>> {
  return {
    constraints: (await constraintNames(pool)).length,
    indexes: (await indexNames(pool)).length,
    reliefRows: await rowCount(pool, NEW_TABLE),
  };
}

async function persistenceCounts(pool: Pool, fundId: number): Promise<Record<string, number>> {
  return {
    reliefRows: await rowCount(pool, NEW_TABLE),
    positionEvents: await rowCountByFund(pool, 'position_events', fundId),
    participations: await rowCountByFund(pool, 'vehicle_financing_participations', fundId),
  };
}

async function countRows(pool: Pool, tableName: string, fundId: number): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${quoteIdentifier(tableName)} WHERE fund_id = $1`,
    [fundId]
  );
  return Number.parseInt(result.rows[0]?.count ?? '0', 10);
}

async function conversionPersistenceSnapshot(
  pool: Pool,
  fundId: number
): Promise<Record<string, number>> {
  return {
    observations: await countRows(pool, 'source_observations', fundId),
    conversionEvents: await countRowsByFilter(pool, 'position_events', fundId, "event_type = 'conversion'"),
    adjustmentEvents: await countRowsByFilter(pool, 'position_events', fundId, "event_type = 'adjustment'"),
    sourceBasisReliefs: await countRows(pool, NEW_TABLE, fundId),
    lotReliefs: await countRows(pool, 'position_event_lot_reliefs', fundId),
    resultParticipations: await countRowsByFilter(
      pool,
      'vehicle_financing_participations',
      fundId,
      "economic_origin = 'conversion_result'"
    ),
    resultLots: await conversionLotCount(pool, fundId),
  };
}

async function participationAndTrancheHeads(
  pool: Pool,
  fundId: number
): Promise<Record<string, unknown[]>> {
  const participations = await pool.query(
    `
      SELECT id::int, financing_tranche_id::int, economic_origin, superseded_by_participation_id::int
      FROM vehicle_financing_participations
      WHERE fund_id = $1
      ORDER BY id
    `,
    [fundId]
  );
  const tranches = await pool.query(
    `
      SELECT id::int, version::int, superseded_by_tranche_id::int
      FROM financing_tranches
      WHERE fund_id = $1
      ORDER BY id
    `,
    [fundId]
  );
  return {
    participations: participations.rows,
    tranches: tranches.rows,
  };
}

async function countRowsByFilter(
  pool: Pool,
  tableName: string,
  fundId: number,
  filterSql: string
): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${quoteIdentifier(tableName)} WHERE fund_id = $1 AND ${filterSql}`,
    [fundId]
  );
  return Number.parseInt(result.rows[0]?.count ?? '0', 10);
}

async function conversionLotCount(pool: Pool, fundId: number): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `
      SELECT count(*)::text AS count
      FROM investment_lots l
      JOIN investments i ON i.id = l.investment_id
      WHERE i.fund_id = $1
        AND l.lot_type = 'conversion'
        AND l.imported_from = 'position_conversion'
    `,
    [fundId]
  );
  return Number.parseInt(result.rows[0]?.count ?? '0', 10);
}

async function resultConversionLots(pool: Pool, participationId: number): Promise<Array<Record<string, unknown>>> {
  const result = await pool.query(
    `
      SELECT investment_id::int, lot_type, cost_basis_cents::text, vehicle_participation_id::int
      FROM investment_lots
      WHERE vehicle_participation_id = $1
        AND lot_type = 'conversion'
        AND imported_from = 'position_conversion'
      ORDER BY id
    `,
    [participationId]
  );
  return result.rows;
}

async function legacyCompatibilitySnapshot(
  pool: Pool,
  fundId: number
): Promise<Record<string, unknown>> {
  const tables = ['financing_events', 'financing_tranches', 'investments', 'investment_rounds', 'cash_flow_events'];
  const entries: Array<[string, unknown]> = [];
  for (const table of tables) {
    const result = await pool.query<{ count: string; fingerprint: string | null }>(
      `
        SELECT
          count(*)::text AS count,
          md5(COALESCE(string_agg(to_jsonb(t)::text, '|' ORDER BY to_jsonb(t)::text), '')) AS fingerprint
        FROM ${quoteIdentifier(table)} t
        WHERE fund_id = $1
      `,
      [fundId]
    );
    entries.push([table, result.rows[0]]);
  }
  return Object.fromEntries(entries);
}

async function expectSourceIsUnpricedNoLot(pool: Pool, seed: ServiceConversionSeed): Promise<void> {
  const event = await pool.query<{
    price_per_share: string | null;
    post_money_valuation: string | null;
  }>(
    `
      SELECT price_per_share, post_money_valuation
      FROM financing_events
      WHERE id = $1 AND fund_id = $2
    `,
    [seed.sourceEventId, seed.fundId]
  );
  const tranche = await pool.query<{
    price_per_share: string | null;
    post_money_valuation: string | null;
  }>(
    `
      SELECT price_per_share, post_money_valuation
      FROM financing_tranches
      WHERE id = $1 AND fund_id = $2
    `,
    [seed.sourceTrancheId, seed.fundId]
  );
  expect(event.rows[0]).toEqual({ price_per_share: null, post_money_valuation: null });
  expect(tranche.rows[0]).toEqual({ price_per_share: null, post_money_valuation: null });
  expect(await sourceLotCount(pool, seed.sourceInvestmentId)).toBe(0);
}

async function sourceLotCount(pool: Pool, investmentId: number): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `
      SELECT count(*)::text AS count
      FROM investment_lots
      WHERE investment_id = $1
        AND lot_type <> 'conversion'
    `,
    [investmentId]
  );
  return Number.parseInt(result.rows[0]?.count ?? '0', 10);
}

async function rowCountByFund(pool: Pool, tableName: string, fundId: number): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${quoteIdentifier(tableName)} WHERE fund_id = $1`,
    [fundId]
  );
  return Number.parseInt(result.rows[0]?.count ?? '0', 10);
}

async function capturePgError(action: () => Promise<unknown>): Promise<DatabaseError> {
  try {
    await action();
  } catch (error) {
    return error as DatabaseError;
  }
  throw new Error('Expected PostgreSQL rejection');
}

async function captureError(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error('Expected rejection');
}

function requireString(value: string | null): string {
  if (value === null) throw new Error('Expected string value');
  return value;
}

async function seedConversionParents(
  pool: Pool,
  fundId: number,
  options: { includeBasisMismatchConversion?: boolean } = {}
): Promise<ConversionSeed> {
  await pool.query(
    `
      INSERT INTO funds (id, name, size, management_fee, carry_percentage, vintage_year)
      VALUES ($1, $2, '1000000.00', '0.0200', '0.2000', 2026)
    `,
    [fundId, `Position Conversion Fund ${fundId}`]
  );
  const companyId = await insertedId(
    pool,
    `
      INSERT INTO portfoliocompanies (fund_id, name, sector, stage, investment_amount, status)
      VALUES ($1, $2, 'SaaS', 'seed', '0.00', 'active')
      RETURNING id
    `,
    [fundId, `Position Conversion Company ${fundId}`]
  );
  const vehicleId = await insertVehicle(pool, fundId, `primary-${fundId}`);
  const otherVehicleId = await insertVehicle(pool, fundId, `other-${fundId}`);
  const identityId = await insertIdentity(pool, fundId, companyId, `Primary Identity ${fundId}`);
  const otherIdentityId = await insertIdentity(pool, fundId, null, `Other Identity ${fundId}`);
  const sourceEventId = await insertFinancingEvent(pool, fundId, identityId, 'safe', 'source');
  const resultEventId = await insertFinancingEvent(pool, fundId, identityId, 'equity', 'result');
  const otherResultEventId = await insertFinancingEvent(pool, fundId, identityId, 'equity', 'other-result');
  const sourceTrancheId = await insertFinancingTranche(pool, fundId, sourceEventId, 'safe', 'source');
  const resultTrancheId = await insertFinancingTranche(pool, fundId, resultEventId, 'equity', 'result');
  const otherResultTrancheId = await insertFinancingTranche(
    pool,
    fundId,
    otherResultEventId,
    'equity',
    'other-result'
  );
  const sourceParticipationId = await insertParticipation(
    pool,
    fundId,
    vehicleId,
    sourceEventId,
    sourceTrancheId,
    'cash_investment',
    'source',
    '1000.000000'
  );
  const otherSourceParticipationId = await insertParticipation(
    pool,
    fundId,
    vehicleId,
    sourceEventId,
    sourceTrancheId,
    'cash_investment',
    'other-source',
    '1000.000000'
  );
  const resultParticipationId = await insertParticipation(
    pool,
    fundId,
    vehicleId,
    resultEventId,
    resultTrancheId,
    'conversion_result',
    'result',
    '1000.000000'
  );
  const otherResultParticipationId = await insertParticipation(
    pool,
    fundId,
    vehicleId,
    otherResultEventId,
    otherResultTrancheId,
    'conversion_result',
    'other-result',
    '1000.000000'
  );
  const basisMismatchResultParticipationId = await insertParticipation(
    pool,
    fundId,
    vehicleId,
    otherResultEventId,
    otherResultTrancheId,
    'conversion_result',
    'basis-mismatch-result',
    '999.000000'
  );
  const sourceAcquisitionEventId = await insertPositionEvent(pool, {
    fundId,
    vehicleId,
    identityId,
    eventType: 'acquisition',
    sharesDelta: '0.000000',
    costBasisDelta: '1000.000000',
    proceeds: '0.000000',
    sourceParticipationId,
  });
  const adjustmentEventId = await insertPositionEvent(pool, {
    fundId,
    vehicleId,
    identityId,
    eventType: 'adjustment',
    sharesDelta: '0.000000',
    costBasisDelta: '50.000000',
    proceeds: '0.000000',
    sourceParticipationId,
  });
  const conversionEventId = await insertPositionEvent(pool, {
    fundId,
    vehicleId,
    identityId,
    eventType: 'conversion',
    sharesDelta: '100.000000',
    costBasisDelta: '0.000000',
    proceeds: '0.000000',
    sourceParticipationId,
    resultParticipationId,
  });
  const basisMismatchConversionEventId = options.includeBasisMismatchConversion
    ? await insertPositionEvent(pool, {
        fundId,
        vehicleId,
        identityId,
        eventType: 'conversion',
        sharesDelta: '100.000000',
        costBasisDelta: '0.000000',
        proceeds: '0.000000',
        sourceParticipationId,
        resultParticipationId: basisMismatchResultParticipationId,
      })
    : null;

  return {
    fundId,
    vehicleId,
    otherVehicleId,
    identityId,
    otherIdentityId,
    sourceEventId,
    resultEventId,
    otherResultEventId,
    sourceTrancheId,
    resultTrancheId,
    otherResultTrancheId,
    sourceParticipationId,
    otherSourceParticipationId,
    resultParticipationId,
    otherResultParticipationId,
    basisMismatchResultParticipationId,
    sourceAcquisitionEventId,
    conversionEventId,
    basisMismatchConversionEventId,
    adjustmentEventId,
  };
}

function requireBasisMismatchConversionEventId(seed: ConversionSeed): number {
  if (seed.basisMismatchConversionEventId === null) {
    throw new Error('Basis-mismatch conversion fixture was not requested');
  }
  return seed.basisMismatchConversionEventId;
}

async function seedServiceConversion(
  pool: Pool,
  fundId: number,
  options: { sourceLot: boolean; unpricedSource: boolean }
): Promise<ServiceConversionSeed> {
  await pool.query(
    `
      INSERT INTO funds (id, name, size, management_fee, carry_percentage, vintage_year)
      VALUES ($1, $2, '1000000.00', '0.0200', '0.2000', 2026)
    `,
    [fundId, `Position Conversion Service Fund ${fundId}`]
  );
  const companyId = await insertedId(
    pool,
    `
      INSERT INTO portfoliocompanies (fund_id, name, sector, stage, investment_amount, status)
      VALUES ($1, $2, 'SaaS', 'seed', '0.00', 'active')
      RETURNING id
    `,
    [fundId, `Position Conversion Service Company ${fundId}`]
  );
  const vehicleId = await insertVehicle(pool, fundId, `service-${fundId}`);
  const identityId = await insertIdentity(pool, fundId, companyId, `Service Identity ${fundId}`);
  const sourceEventId = await insertFinancingEvent(pool, fundId, identityId, 'safe', 'service-source');
  const targetEventId = await insertFinancingEvent(pool, fundId, identityId, 'equity', 'service-target');
  const sourceTrancheId = await insertFinancingTranche(pool, fundId, sourceEventId, 'safe', 'service-source');
  const targetTrancheId = await insertFinancingTranche(pool, fundId, targetEventId, 'equity', 'service-target');
  if (options.unpricedSource) {
    await markSourceUnpriced(pool, fundId, sourceEventId, sourceTrancheId);
  }
  const sourceParticipationId = await insertParticipation(
    pool,
    fundId,
    vehicleId,
    sourceEventId,
    sourceTrancheId,
    'cash_investment',
    'service-source',
    '1000.000000'
  );
  const sourceAcquisitionEventId = await insertPositionEvent(pool, {
    fundId,
    vehicleId,
    identityId,
    eventType: 'acquisition',
    sharesDelta: '0.000000',
    costBasisDelta: '1000.000000',
    proceeds: '0.000000',
    sourceParticipationId,
  });
  const sourceInvestmentId = await insertServiceInvestment(pool, {
    fundId,
    companyId,
    sourceParticipationId,
  });
  const sourceLotId = options.sourceLot
    ? await insertServiceSourceLot(pool, sourceInvestmentId, fundId)
    : null;

  return {
    fundId,
    vehicleId,
    identityId,
    sourceEventId,
    targetEventId,
    sourceTrancheId,
    targetTrancheId,
    sourceParticipationId,
    sourceAcquisitionEventId,
    sourceInvestmentId,
    sourceLotId,
  };
}

async function markSourceUnpriced(
  pool: Pool,
  fundId: number,
  sourceEventId: number,
  sourceTrancheId: number
): Promise<void> {
  await pool.query(
    `
      UPDATE financing_events
      SET price_per_share = NULL,
          post_money_valuation = NULL
      WHERE fund_id = $1 AND id = $2
    `,
    [fundId, sourceEventId]
  );
  await pool.query(
    `
      UPDATE financing_tranches
      SET price_per_share = NULL,
          post_money_valuation = NULL
      WHERE fund_id = $1 AND id = $2
    `,
    [fundId, sourceTrancheId]
  );
}

function conversionRequest(
  seed: ServiceConversionSeed,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    sourceParticipationId: seed.sourceParticipationId,
    resultingTrancheId: seed.targetTrancheId,
    effectiveDate: '2026-02-15',
    resultingSharesAcquired: '100.000000',
    accruedInterest: { mode: 'excluded' },
    currency: 'USD',
    ...overrides,
  };
}

function correctionRequest(seed: ServiceConversionSeed): Record<string, unknown> {
  return {
    expectedTrancheVersion: 1,
    correctedTranche: {
      closingDate: '2026-02-16',
      securityType: 'safe',
      investmentAmount: '1100.000000',
      valuationCap: '9000000.000000',
    },
    dependents: [
      {
        participationId: seed.sourceParticipationId,
        expectedVersion: 1,
        acknowledgements: {
          termsReviewed: true,
          compatibilityRewriteAccepted: true,
        },
        overrideAdjustments: {
          participationAmount: '1100.000000',
          originalAmount: '1100.000000',
        },
      },
    ],
  };
}

async function insertServiceInvestment(
  pool: Pool,
  input: { fundId: number; companyId: number; sourceParticipationId: number | null }
): Promise<number> {
  return insertedId(
    pool,
    `
      INSERT INTO investments (
        fund_id, company_id, investment_date, amount, round, ownership_percentage,
        valuation_at_investment, share_price_cents, shares_acquired, cost_basis_cents,
        imported_from, vehicle_participation_id
      ) VALUES (
        $1, $2, '2026-01-15', '1000.00', 'SAFE', NULL, NULL, NULL, NULL,
        100000, 'vehicle_financing_participation', $3
      )
      RETURNING id
    `,
    [input.fundId, input.companyId, input.sourceParticipationId]
  );
}

async function portfolioCompanyIdForIdentity(pool: Pool, identityId: number): Promise<number> {
  const result = await pool.query<{ source_portfolio_company_id: number }>(
    `
      SELECT source_portfolio_company_id
      FROM company_identities
      WHERE id = $1
    `,
    [identityId]
  );
  const value = result.rows[0]?.source_portfolio_company_id;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Expected portfolio company identity link.');
  }
  return value;
}

async function insertServiceSourceLot(
  pool: Pool,
  investmentId: number,
  fundId: number
): Promise<string> {
  const lotId = deterministicUuid(fundId);
  await pool.query(
    `
      INSERT INTO investment_lots (
        id, investment_id, lot_type, share_price_cents, shares_acquired,
        cost_basis_cents, idempotency_key, imported_from
      ) VALUES ($1, $2, 'initial', 1000, '100.00000000', 100000, $3, 'service-fixture')
    `,
    [lotId, investmentId, `source-lot-${fundId}`]
  );
  return lotId;
}

function deterministicUuid(seed: number): string {
  return `00000000-0000-4000-8000-${seed.toString(16).padStart(12, '0').slice(-12)}`;
}

async function insertVehicle(pool: Pool, fundId: number, suffix: string): Promise<number> {
  return insertedId(
    pool,
    `
      INSERT INTO vehicles (
        fund_id, vehicle_slug, vehicle_type, name, committed_capital, currency, status
      ) VALUES ($1, $2, 'spv', $3, '100000.000000', 'USD', 'active')
      RETURNING id
    `,
    [fundId, `position-conversion-spv-${suffix}`, `Position Conversion SPV ${suffix}`]
  );
}

async function insertIdentity(
  pool: Pool,
  fundId: number,
  companyId: number | null,
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

async function insertFinancingEvent(
  pool: Pool,
  fundId: number,
  identityId: number,
  securityType: 'safe' | 'equity',
  suffix: string
): Promise<number> {
  return insertedId(
    pool,
    `
      INSERT INTO financing_events (
        fund_id, company_identity_id, event_key, round_name, security_type, event_date,
        currency, round_size, post_money_valuation, price_per_share, idempotency_key, request_hash
      ) VALUES (
        $1, $2, $3, $4, $5, '2026-01-15', 'USD', '1000.000000',
        '10000000.000000', '10.000000', $6, repeat('a', 64)
      )
      RETURNING id
    `,
    [
      fundId,
      identityId,
      `${securityType}-event-${suffix}-${fundId}`,
      securityType === 'safe' ? 'SAFE' : 'Series A',
      securityType,
      `${securityType}-event-${suffix}-${fundId}`,
    ]
  );
}

async function insertFinancingTranche(
  pool: Pool,
  fundId: number,
  eventId: number,
  securityType: 'safe' | 'equity',
  suffix: string
): Promise<number> {
  return insertedId(
    pool,
    `
      INSERT INTO financing_tranches (
        fund_id, financing_event_id, tranche_key, version, closing_date, security_type,
        investment_amount, original_amount, currency, fx_rate_to_usd, fx_rate_date,
        price_per_share, post_money_valuation, valuation_cap, conversion_discount_rate,
        idempotency_key, request_hash
      ) VALUES (
        $1, $2, $3, 1, '2026-01-15', $4, '1000.000000', '1000.000000',
        'USD', '1.0000000000', '2026-01-15', '10.000000', '10000000.000000',
        '8000000.000000', '0.80000000', $5, repeat('b', 64)
      )
      RETURNING id
    `,
    [fundId, eventId, `${securityType}-tranche-${suffix}`, securityType, `${securityType}-tranche-${suffix}-${fundId}`]
  );
}

async function insertParticipation(
  pool: Pool,
  fundId: number,
  vehicleId: number,
  eventId: number,
  trancheId: number,
  economicOrigin: 'cash_investment' | 'conversion_result',
  suffix: string,
  participationAmount: string
): Promise<number> {
  return insertedId(
    pool,
    `
      INSERT INTO vehicle_financing_participations (
        fund_id, vehicle_id, financing_event_id, tranche_key, financing_tranche_id,
        version, economic_origin, participation_amount, currency, idempotency_key, request_hash
      ) VALUES (
        $1, $2, $3, $4, $5, 1, $6, $7, 'USD', $8, repeat('c', 64)
      )
      RETURNING id
    `,
    [
      fundId,
      vehicleId,
      eventId,
      `${economicOrigin}-${suffix}`,
      trancheId,
      economicOrigin,
      participationAmount,
      `${economicOrigin}-participation-${suffix}-${fundId}`,
    ]
  );
}

async function insertPositionEvent(
  pool: Pool,
  input: {
    fundId: number;
    vehicleId: number;
    identityId: number;
    eventType: 'acquisition' | 'adjustment' | 'conversion';
    sharesDelta: string;
    costBasisDelta: string;
    proceeds: string;
    sourceParticipationId: number;
    resultParticipationId?: number;
  }
): Promise<number> {
  return insertedId(
    pool,
    `
      INSERT INTO position_events (
        fund_id, vehicle_id, company_identity_id, event_type, effective_date,
        shares_delta, cost_basis_delta, proceeds, vehicle_participation_id,
        resulting_participation_id, source_participation_version,
        resulting_participation_version, source_tranche_version, resulting_tranche_version
      ) VALUES (
        $1, $2, $3, $4::varchar(32), '2026-01-31', $5, $6, $7, $8, $9,
        CASE WHEN $4::varchar(32) = 'conversion' THEN 1 ELSE NULL END,
        CASE WHEN $4::varchar(32) = 'conversion' THEN 1 ELSE NULL END,
        CASE WHEN $4::varchar(32) = 'conversion' THEN 1 ELSE NULL END,
        CASE WHEN $4::varchar(32) = 'conversion' THEN 1 ELSE NULL END
      )
      RETURNING id
    `,
    [
      input.fundId,
      input.vehicleId,
      input.identityId,
      input.eventType,
      input.sharesDelta,
      input.costBasisDelta,
      input.proceeds,
      input.sourceParticipationId,
      input.resultParticipationId ?? null,
    ]
  );
}

async function insertValidSourceBasisRelief(pool: Pool, seed: ConversionSeed): Promise<void> {
  await pool.query(reliefInsertSql(seed));
}

function reliefInsertSql(seed: ConversionSeed, overrides: ReliefInsertOverrides = {}) {
  const values = {
    conversionEventId: seed.conversionEventId,
    sourceAcquisitionEventId: seed.sourceAcquisitionEventId,
    capitalizedAdjustmentEventId: null,
    fundId: seed.fundId,
    vehicleId: seed.vehicleId,
    identityId: seed.identityId,
    sourceParticipationId: seed.sourceParticipationId,
    sourceParticipationVersion: 1,
    sourceEventId: seed.sourceEventId,
    sourceTrancheId: seed.sourceTrancheId,
    resultParticipationId: seed.resultParticipationId,
    resultParticipationVersion: 1,
    resultEventId: seed.resultEventId,
    resultTrancheId: seed.resultTrancheId,
    sourceTrancheVersion: 1,
    resultTrancheVersion: 1,
    sourceAcquisitionCostBasis: '1000.000000',
    capitalizedAdjustmentCostBasis: '0.000000',
    relievedCostBasis: '1000.000000',
    sourceEventType: 'acquisition',
    capitalizedAdjustmentEventType: null,
    conversionEventType: 'conversion',
    sourceEconomicOrigin: 'cash_investment',
    resultingEconomicOrigin: 'conversion_result',
    ...overrides,
  };
  return {
    text: `
      INSERT INTO position_event_source_basis_reliefs (
        conversion_position_event_id,
        source_acquisition_position_event_id,
        capitalized_adjustment_position_event_id,
        fund_id,
        vehicle_id,
        company_identity_id,
        source_participation_id,
        source_participation_version,
        source_financing_event_id,
        source_financing_tranche_id,
        resulting_participation_id,
        resulting_participation_version,
        resulting_financing_event_id,
        resulting_financing_tranche_id,
        source_tranche_version,
        resulting_tranche_version,
        source_acquisition_cost_basis,
        capitalized_adjustment_cost_basis,
        relieved_cost_basis,
        source_event_type,
        capitalized_adjustment_event_type,
        conversion_event_type,
        source_economic_origin,
        resulting_economic_origin
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
      )
    `,
    values: [
      values.conversionEventId,
      values.sourceAcquisitionEventId,
      values.capitalizedAdjustmentEventId,
      values.fundId,
      values.vehicleId,
      values.identityId,
      values.sourceParticipationId,
      values.sourceParticipationVersion,
      values.sourceEventId,
      values.sourceTrancheId,
      values.resultParticipationId,
      values.resultParticipationVersion,
      values.resultEventId,
      values.resultTrancheId,
      values.sourceTrancheVersion,
      values.resultTrancheVersion,
      values.sourceAcquisitionCostBasis,
      values.capitalizedAdjustmentCostBasis,
      values.relievedCostBasis,
      values.sourceEventType,
      values.capitalizedAdjustmentEventType,
      values.conversionEventType,
      values.sourceEconomicOrigin,
      values.resultingEconomicOrigin,
    ],
  };
}

async function insertedId(pool: Pool, text: string, values: unknown[] = []): Promise<number> {
  const result = await pool.query<{ id: number | string }>(text, values);
  return Number(result.rows[0]?.id);
}
