import fs from 'node:fs';

import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as runtimeSchema from '@shared/schema';
import { financialFactsSnapshots } from '@shared/schema/financial-facts-snapshots';
import {
  ownershipSnapshots,
  positionEventLotReliefs,
  positionEvents,
  type InsertOwnershipSnapshot,
  type InsertPositionEvent,
  type InsertPositionEventLotRelief,
} from '@shared/schema/investment-positions';
import { valuationMarks } from '@shared/schema/lp-reporting-evidence';
import { investmentLots } from '@shared/schema/portfolio';
import { vehicleFinancingParticipations } from '@shared/schema/vehicle-financing-participations';
import { vehicles } from '@shared/schema/vehicles';

const positionConfig = getTableConfig(positionEvents);
const reliefConfig = getTableConfig(positionEventLotReliefs);
const ownershipConfig = getTableConfig(ownershipSnapshots);
const lotsConfig = getTableConfig(investmentLots);
const participationConfig = getTableConfig(vehicleFinancingParticipations);
const valuationConfig = getTableConfig(valuationMarks);
const factsConfig = getTableConfig(financialFactsSnapshots);
const vehiclesConfig = getTableConfig(vehicles);
const dialect = new PgDialect();

type TableConfig = ReturnType<typeof getTableConfig>;

function constraintNames(config: TableConfig): string[] {
  return [
    ...config.foreignKeys.map((foreignKey) => foreignKey.getName()),
    ...config.uniqueConstraints.map((constraint) => constraint.name),
    ...config.checks.map((constraint) => constraint.name),
  ];
}

function indexNames(config: TableConfig): string[] {
  return config.indexes.map((index) => index.config.name);
}

function columnNames(config: TableConfig): string[] {
  return config.columns.map((column) => column.name);
}

function numericShape(config: TableConfig, columnName: string) {
  const column = config.columns.find((candidate) => candidate.name === columnName) as
    { precision?: number; scale?: number } | undefined;
  return { precision: column?.precision, scale: column?.scale };
}

function checkSql(config: TableConfig, checkName: string): string {
  const target = config.checks.find((candidate) => candidate.name === checkName);
  if (!target) {
    throw new Error(`Missing CHECK ${checkName}`);
  }
  return dialect.sqlToQuery(target.value).sql;
}

describe('Task 11 position and ownership structural schema', () => {
  it('exports all new tables through the shadowing runtime barrel', () => {
    expect(runtimeSchema.positionEvents).toBe(positionEvents);
    expect(runtimeSchema.positionEventLotReliefs).toBe(positionEventLotReliefs);
    expect(runtimeSchema.ownershipSnapshots).toBe(ownershipSnapshots);
    expect(positionConfig.name).toBe('position_events');
    expect(reliefConfig.name).toBe('position_event_lot_reliefs');
    expect(ownershipConfig.name).toBe('ownership_snapshots');
  });

  it('pins complete bitemporal position event columns and precision', () => {
    expect(columnNames(positionConfig)).toEqual(
      expect.arrayContaining([
        'id',
        'fund_id',
        'vehicle_id',
        'company_identity_id',
        'event_type',
        'effective_date',
        'recorded_at',
        'shares_delta',
        'cost_basis_delta',
        'proceeds',
        'replaces_event_id',
        'reverses_position_event_id',
        'vehicle_participation_id',
        'resulting_participation_id',
        'source_participation_version',
        'resulting_participation_version',
        'source_tranche_version',
        'resulting_tranche_version',
        'source_observation_id',
        'backfilled_from_investment_id',
        'idempotency_key',
        'request_hash',
      ])
    );
    expect(columnNames(positionConfig)).not.toContain('realized_gain_loss');
    for (const column of ['shares_delta', 'cost_basis_delta', 'proceeds']) {
      expect(numericShape(positionConfig, column), column).toEqual({
        precision: 20,
        scale: 6,
      });
    }
  });

  it('enforces position event enum, conversion, reversal, acquisition, and backfill invariants', () => {
    expect(constraintNames(positionConfig)).toEqual(
      expect.arrayContaining([
        'position_events_fund_fk',
        'position_events_vehicle_fund_fk',
        'position_events_identity_fund_fk',
        'position_events_replaces_fund_fk',
        'position_events_reverses_fund_fk',
        'position_events_participation_fund_fk',
        'position_events_resulting_participation_fund_fk',
        'position_events_observation_fund_fk',
        'position_events_backfill_investment_fund_fk',
        'position_events_event_type_check',
        'position_events_conversion_links_check',
        'position_events_reversal_target_check',
        'position_events_no_self_lineage_check',
        'position_events_idempotency_pair_check',
        'position_events_id_fund_unique',
        'position_events_backfill_investment_unique',
        'position_events_fund_idempotency_unique',
      ])
    );
    expect(checkSql(positionConfig, 'position_events_event_type_check')).toContain(
      "IN ('acquisition', 'conversion', 'realization', 'write_off', 'adjustment', 'reversal')"
    );
    expect(checkSql(positionConfig, 'position_events_event_type_check')).not.toContain(
      "'replacement'"
    );
    const conversionCheck = checkSql(positionConfig, 'position_events_conversion_links_check');
    expect(conversionCheck).toContain('"position_events"."vehicle_participation_id" IS NOT NULL');
    expect(conversionCheck).toContain('"position_events"."resulting_participation_id" IS NOT NULL');
    for (const versionColumn of [
      'source_participation_version',
      'resulting_participation_version',
      'source_tranche_version',
      'resulting_tranche_version',
    ]) {
      expect(conversionCheck, versionColumn).toContain(
        `"position_events"."${versionColumn}" IS NOT NULL`
      );
      expect(conversionCheck, versionColumn).toContain(
        `"position_events"."${versionColumn}" IS NULL`
      );
    }
    expect(conversionCheck).toContain(`"position_events"."event_type" <> 'conversion'`);
    expect(conversionCheck).toContain('"position_events"."resulting_participation_id" IS NULL');
    expect(checkSql(positionConfig, 'position_events_reversal_target_check')).toContain(
      '"position_events"."reverses_position_event_id" IS NOT NULL'
    );
    expect(indexNames(positionConfig)).toEqual(
      expect.arrayContaining([
        'position_events_acquisition_participation_unique',
        'position_events_reversal_target_unique',
        'idx_position_events_scope_effective_recorded',
      ])
    );
    const acquisitionIndex = positionConfig.indexes.find(
      (index) => index.config.name === 'position_events_acquisition_participation_unique'
    );
    expect(acquisitionIndex?.config.unique).toBe(true);
    expect(dialect.sqlToQuery(acquisitionIndex!.config.where!).sql).toContain(
      `"position_events"."event_type" = 'acquisition'`
    );
  });

  it('pins lot relief natural key and all three composite foreign keys', () => {
    expect(columnNames(reliefConfig)).toEqual([
      'fund_id',
      'position_event_id',
      'investment_id',
      'investment_lot_id',
      'relieved_shares',
      'relieved_cost_basis',
      'allocated_proceeds',
    ]);
    for (const column of ['relieved_shares', 'relieved_cost_basis', 'allocated_proceeds']) {
      expect(numericShape(reliefConfig, column), column).toEqual({
        precision: 20,
        scale: 6,
      });
    }
    expect(constraintNames(reliefConfig)).toEqual(
      expect.arrayContaining([
        'position_event_lot_reliefs_event_fund_fk',
        'position_event_lot_reliefs_investment_fund_fk',
        'position_event_lot_reliefs_lot_investment_fk',
        'position_event_lot_reliefs_event_lot_unique',
      ])
    );
  });

  it('pins immutable ownership supersession, scope, lineage, and [0,100] precision', () => {
    expect(columnNames(ownershipConfig)).toEqual(
      expect.arrayContaining([
        'id',
        'fund_id',
        'vehicle_id',
        'company_identity_id',
        'effective_date',
        'recorded_at',
        'ownership_pct',
        'fd_numerator',
        'fd_denominator',
        'currency',
        'supersedes_snapshot_id',
        'source_observation_id',
        'idempotency_key',
        'request_hash',
      ])
    );
    expect(numericShape(ownershipConfig, 'ownership_pct')).toEqual({
      precision: 12,
      scale: 8,
    });
    expect(checkSql(ownershipConfig, 'ownership_snapshots_pct_range_check')).toContain(
      '"ownership_snapshots"."ownership_pct" >= 0'
    );
    expect(checkSql(ownershipConfig, 'ownership_snapshots_pct_range_check')).toContain(
      '"ownership_snapshots"."ownership_pct" <= 100'
    );
    expect(constraintNames(ownershipConfig)).toEqual(
      expect.arrayContaining([
        'ownership_snapshots_fund_fk',
        'ownership_snapshots_vehicle_fund_fk',
        'ownership_snapshots_identity_fund_fk',
        'ownership_snapshots_supersedes_fund_fk',
        'ownership_snapshots_observation_fund_fk',
        'ownership_snapshots_no_self_supersede_check',
        'ownership_snapshots_id_fund_unique',
        'ownership_snapshots_fund_idempotency_unique',
      ])
    );
    expect(indexNames(ownershipConfig)).toEqual(
      expect.arrayContaining([
        'ownership_snapshots_supersedes_unique',
        'idx_ownership_snapshots_scope_effective_recorded',
      ])
    );
  });

  it('alters all compatibility tables without widening financial semantics', () => {
    expect(constraintNames(lotsConfig)).toContain('investment_lots_id_investment_unique');
    expect(checkSql(lotsConfig, 'investment_lots_lot_type_check')).toContain("'conversion'");

    expect(columnNames(participationConfig)).toContain('economic_origin');
    expect(checkSql(participationConfig, 'vfp_economic_origin_check')).toContain(
      "IN ('cash_investment', 'conversion_result')"
    );

    expect(columnNames(valuationConfig)).toEqual(
      expect.arrayContaining(['mark_purpose', 'source_observation_id'])
    );
    expect(checkSql(valuationConfig, 'valuation_marks_mark_purpose_check')).toContain(
      "IN ('planning_company_fmv', 'direct_position_fmv')"
    );
    const directPositionLineageCheck = checkSql(
      valuationConfig,
      'valuation_marks_direct_position_lineage_check'
    );
    expect(directPositionLineageCheck).toContain('"valuation_marks"."vehicle_id" IS NOT NULL');
    expect(directPositionLineageCheck).toContain(
      '"valuation_marks"."source_observation_id" IS NOT NULL'
    );
    expect(constraintNames(valuationConfig)).toContain(
      'valuation_marks_source_observation_fund_fk'
    );

    expect(columnNames(factsConfig)).toContain('supersedes_snapshot_id');
    expect(constraintNames(factsConfig)).toEqual(
      expect.arrayContaining([
        'financial_facts_snapshots_id_fund_unique',
        'financial_facts_snapshots_supersedes_fund_fk',
        'financial_facts_snapshots_no_self_supersede_check',
      ])
    );
    expect(indexNames(factsConfig)).toContain('financial_facts_snapshots_supersedes_unique');

    const mainFundIndex = vehiclesConfig.indexes.find(
      (index) => index.config.name === 'vehicles_main_fund_unique'
    );
    expect(mainFundIndex?.config.unique).toBe(true);
    expect(dialect.sqlToQuery(mainFundIndex!.config.where!).sql).toContain(
      `"vehicles"."vehicle_type" = 'main_fund'`
    );
  });

  it('keeps inferred insert contracts usable with required columns', () => {
    const event: InsertPositionEvent = {
      fundId: 1,
      vehicleId: 2,
      companyIdentityId: 3,
      eventType: 'acquisition',
      effectiveDate: '2026-07-25',
      sharesDelta: '10.000000',
      costBasisDelta: '1000.000000',
      proceeds: '0.000000',
    };
    const relief: InsertPositionEventLotRelief = {
      fundId: 1,
      positionEventId: 4,
      investmentId: 5,
      investmentLotId: '00000000-0000-0000-0000-000000000006',
      relievedShares: '1.000000',
      relievedCostBasis: '100.000000',
      allocatedProceeds: '150.000000',
    };
    const ownership: InsertOwnershipSnapshot = {
      fundId: 1,
      vehicleId: 2,
      companyIdentityId: 3,
      effectiveDate: '2026-07-25',
      ownershipPct: '12.50000000',
      currency: 'USD',
      sourceObservationId: 7,
      idempotencyKey: 'ownership:1',
      requestHash: 'a'.repeat(64),
    };

    expect([event, relief, ownership]).toHaveLength(3);
  });

  it('orders fail-closed main-fund preflight before index creation in migration 0042', () => {
    const migration = fs.readFileSync('migrations/0042_positions_ownership_compat.sql', 'utf8');
    const preflight = migration.indexOf('RAISE EXCEPTION');
    const mainFundIndex = migration.indexOf(
      'CREATE UNIQUE INDEX IF NOT EXISTS "vehicles_main_fund_unique"'
    );
    const positionCompositeUnique = migration.indexOf(
      'ADD CONSTRAINT "position_events_id_fund_unique"'
    );
    const positionSelfFk = migration.indexOf('ADD CONSTRAINT "position_events_replaces_fund_fk"');
    const ownershipCompositeUnique = migration.indexOf(
      'ADD CONSTRAINT "ownership_snapshots_id_fund_unique"'
    );
    const ownershipSelfFk = migration.indexOf(
      'ADD CONSTRAINT "ownership_snapshots_supersedes_fund_fk"'
    );

    expect(migration).toMatch(/^-- @drift-patch\r?\n-- Reason:/);
    expect(preflight).toBeGreaterThanOrEqual(0);
    expect(migration).toMatch(/fund_id.*main_count|main_count.*fund_id/is);
    expect(mainFundIndex).toBeGreaterThan(preflight);
    expect(positionCompositeUnique).toBeGreaterThanOrEqual(0);
    expect(positionSelfFk).toBeGreaterThan(positionCompositeUnique);
    expect(ownershipCompositeUnique).toBeGreaterThanOrEqual(0);
    expect(ownershipSelfFk).toBeGreaterThan(ownershipCompositeUnique);
    expect(migration).toContain('--> statement-breakpoint');
  });
});
