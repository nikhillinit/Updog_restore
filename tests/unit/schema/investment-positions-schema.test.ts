import fs from 'node:fs';

import type { SQL } from 'drizzle-orm';
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as runtimeSchema from '@shared/schema';
import { financialFactsSnapshots } from '@shared/schema/financial-facts-snapshots';
import {
  ownershipSnapshots,
  positionEventLotReliefs,
  positionEventSourceBasisReliefs,
  positionEvents,
  type InsertOwnershipSnapshot,
  type InsertPositionEvent,
  type InsertPositionEventLotRelief,
  type InsertPositionEventSourceBasisRelief,
} from '@shared/schema/investment-positions';
import { financingEvents, financingTranches } from '@shared/schema/investment-ledger';
import { valuationMarks } from '@shared/schema/lp-reporting-evidence';
import { investmentLots } from '@shared/schema/portfolio';
import { vehicleFinancingParticipations } from '@shared/schema/vehicle-financing-participations';
import { vehicles } from '@shared/schema/vehicles';

const positionConfig = getTableConfig(positionEvents);
const reliefConfig = getTableConfig(positionEventLotReliefs);
const sourceBasisReliefConfig = getTableConfig(positionEventSourceBasisReliefs);
const ownershipConfig = getTableConfig(ownershipSnapshots);
const financingEventsConfig = getTableConfig(financingEvents);
const financingTranchesConfig = getTableConfig(financingTranches);
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

function columnMeta(config: TableConfig, columnName: string) {
  const column = config.columns.find((candidate) => candidate.name === columnName) as
    | {
        name: string;
        notNull: boolean;
        hasDefault: boolean;
        primary: boolean;
        default?: unknown;
      }
    | undefined;
  if (!column) {
    throw new Error(`Missing column ${columnName}`);
  }
  return {
    notNull: column.notNull,
    hasDefault: column.hasDefault,
    primary: column.primary,
    default: column.default,
  };
}

function uniqueColumns(config: TableConfig, constraintName: string): string[] {
  const target = config.uniqueConstraints.find((constraint) => constraint.name === constraintName);
  if (!target) {
    throw new Error(`Missing UNIQUE ${constraintName}`);
  }
  return target.columns.map((column) => column.name);
}

function primaryKeyColumns(config: TableConfig): string[] {
  return config.columns.filter((column) => column.primary).map((column) => column.name);
}

function foreignKeyShape(config: TableConfig, foreignKeyName: string) {
  const target = config.foreignKeys.find((foreignKey) => foreignKey.getName() === foreignKeyName);
  if (!target) {
    throw new Error(`Missing FK ${foreignKeyName}`);
  }
  const reference = target.reference();
  const foreignTableName = reference.foreignColumns[0]?.table[
    Symbol.for('drizzle:Name') as keyof typeof reference.foreignColumns[number]['table']
  ];
  return {
    columns: reference.columns.map((column) => column.name),
    foreignTable: String(foreignTableName),
    foreignColumns: reference.foreignColumns.map((column) => column.name),
  };
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
    expect(runtimeSchema.positionEventSourceBasisReliefs).toBe(positionEventSourceBasisReliefs);
    expect(runtimeSchema.positionEventLotReliefs).toBe(positionEventLotReliefs);
    expect(runtimeSchema.ownershipSnapshots).toBe(ownershipSnapshots);
    expect(positionConfig.name).toBe('position_events');
    expect(sourceBasisReliefConfig.name).toBe('position_event_source_basis_reliefs');
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
        'position_events_source_basis_anchor_unique',
        'position_events_conversion_lineage_unique',
        'position_events_conversion_zero_basis_check',
        'position_events_conversion_distinct_participations_check',
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
    expect(checkSql(positionConfig, 'position_events_conversion_zero_basis_check')).toContain(
      '"position_events"."cost_basis_delta" = 0'
    );
    expect(checkSql(positionConfig, 'position_events_conversion_zero_basis_check')).toContain(
      '"position_events"."proceeds" = 0'
    );
    expect(
      checkSql(positionConfig, 'position_events_conversion_distinct_participations_check')
    ).toContain(
      '"position_events"."vehicle_participation_id" <> "position_events"."resulting_participation_id"'
    );
    expect(uniqueColumns(positionConfig, 'position_events_source_basis_anchor_unique')).toEqual([
      'id',
      'fund_id',
      'vehicle_id',
      'company_identity_id',
      'event_type',
      'vehicle_participation_id',
      'cost_basis_delta',
    ]);
    expect(uniqueColumns(positionConfig, 'position_events_conversion_lineage_unique')).toEqual([
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
    ]);
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

  it('pins source-basis relief receipt columns, exact parent keys, and conversion checks', () => {
    expect(columnNames(sourceBasisReliefConfig)).toEqual([
      'conversion_position_event_id',
      'source_acquisition_position_event_id',
      'capitalized_adjustment_position_event_id',
      'fund_id',
      'vehicle_id',
      'company_identity_id',
      'source_participation_id',
      'source_participation_version',
      'source_financing_event_id',
      'source_financing_tranche_id',
      'resulting_participation_id',
      'resulting_participation_version',
      'resulting_financing_event_id',
      'resulting_financing_tranche_id',
      'source_tranche_version',
      'resulting_tranche_version',
      'source_acquisition_cost_basis',
      'capitalized_adjustment_cost_basis',
      'relieved_cost_basis',
      'source_event_type',
      'capitalized_adjustment_event_type',
      'conversion_event_type',
      'source_economic_origin',
      'resulting_economic_origin',
    ]);
    for (const column of [
      'source_acquisition_cost_basis',
      'capitalized_adjustment_cost_basis',
      'relieved_cost_basis',
    ]) {
      expect(numericShape(sourceBasisReliefConfig, column), column).toEqual({
        precision: 20,
        scale: 6,
      });
    }
    expect(primaryKeyColumns(sourceBasisReliefConfig)).toEqual(['conversion_position_event_id']);
    expect(uniqueColumns(sourceBasisReliefConfig, 'pesbr_source_acq_unique')).toEqual([
      'source_acquisition_position_event_id',
    ]);
    expect(uniqueColumns(sourceBasisReliefConfig, 'pesbr_resulting_participation_unique')).toEqual([
      'resulting_participation_id',
    ]);
    expect(sourceBasisReliefConfig.indexes.find(
      (index) => index.config.name === 'pesbr_capitalized_adj_unique'
    )?.config.columns.map((column) => column.name)).toEqual([
      'capitalized_adjustment_position_event_id',
    ]);
    expect(constraintNames(sourceBasisReliefConfig)).toEqual(
      expect.arrayContaining([
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
      ])
    );
    expect(indexNames(sourceBasisReliefConfig)).toContain('pesbr_capitalized_adj_unique');
    expect(foreignKeyShape(sourceBasisReliefConfig, 'pesbr_source_acq_event_fk')).toEqual({
      columns: [
        'source_acquisition_position_event_id',
        'fund_id',
        'vehicle_id',
        'company_identity_id',
        'source_event_type',
        'source_participation_id',
        'source_acquisition_cost_basis',
      ],
      foreignTable: 'position_events',
      foreignColumns: [
        'id',
        'fund_id',
        'vehicle_id',
        'company_identity_id',
        'event_type',
        'vehicle_participation_id',
        'cost_basis_delta',
      ],
    });
    expect(foreignKeyShape(sourceBasisReliefConfig, 'pesbr_capitalized_adj_event_fk')).toEqual({
      columns: [
        'capitalized_adjustment_position_event_id',
        'fund_id',
        'vehicle_id',
        'company_identity_id',
        'capitalized_adjustment_event_type',
        'source_participation_id',
        'capitalized_adjustment_cost_basis',
      ],
      foreignTable: 'position_events',
      foreignColumns: [
        'id',
        'fund_id',
        'vehicle_id',
        'company_identity_id',
        'event_type',
        'vehicle_participation_id',
        'cost_basis_delta',
      ],
    });
    expect(foreignKeyShape(sourceBasisReliefConfig, 'pesbr_conversion_event_fk')).toEqual({
      columns: [
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
      ],
      foreignTable: 'position_events',
      foreignColumns: [
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
      ],
    });
    expect(foreignKeyShape(sourceBasisReliefConfig, 'pesbr_source_participation_fk')).toEqual({
      columns: [
        'source_participation_id',
        'fund_id',
        'vehicle_id',
        'source_participation_version',
        'source_financing_event_id',
        'source_financing_tranche_id',
        'source_economic_origin',
      ],
      foreignTable: 'vehicle_financing_participations',
      foreignColumns: [
        'id',
        'fund_id',
        'vehicle_id',
        'version',
        'financing_event_id',
        'financing_tranche_id',
        'economic_origin',
      ],
    });
    expect(foreignKeyShape(sourceBasisReliefConfig, 'pesbr_resulting_participation_fk')).toEqual({
      columns: [
        'resulting_participation_id',
        'fund_id',
        'vehicle_id',
        'resulting_participation_version',
        'resulting_financing_event_id',
        'resulting_financing_tranche_id',
        'resulting_economic_origin',
        'relieved_cost_basis',
      ],
      foreignTable: 'vehicle_financing_participations',
      foreignColumns: [
        'id',
        'fund_id',
        'vehicle_id',
        'version',
        'financing_event_id',
        'financing_tranche_id',
        'economic_origin',
        'participation_amount',
      ],
    });
    expect(foreignKeyShape(sourceBasisReliefConfig, 'pesbr_source_tranche_fk')).toEqual({
      columns: [
        'source_financing_tranche_id',
        'fund_id',
        'source_financing_event_id',
        'source_tranche_version',
      ],
      foreignTable: 'financing_tranches',
      foreignColumns: ['id', 'fund_id', 'financing_event_id', 'version'],
    });
    expect(foreignKeyShape(sourceBasisReliefConfig, 'pesbr_resulting_tranche_fk')).toEqual({
      columns: [
        'resulting_financing_tranche_id',
        'fund_id',
        'resulting_financing_event_id',
        'resulting_tranche_version',
      ],
      foreignTable: 'financing_tranches',
      foreignColumns: ['id', 'fund_id', 'financing_event_id', 'version'],
    });
    expect(foreignKeyShape(sourceBasisReliefConfig, 'pesbr_source_financing_event_fk')).toEqual({
      columns: ['source_financing_event_id', 'fund_id', 'company_identity_id'],
      foreignTable: 'financing_events',
      foreignColumns: ['id', 'fund_id', 'company_identity_id'],
    });
    expect(foreignKeyShape(sourceBasisReliefConfig, 'pesbr_resulting_financing_event_fk')).toEqual({
      columns: ['resulting_financing_event_id', 'fund_id', 'company_identity_id'],
      foreignTable: 'financing_events',
      foreignColumns: ['id', 'fund_id', 'company_identity_id'],
    });
    expect(checkSql(sourceBasisReliefConfig, 'pesbr_source_event_type_check')).toContain(
      `"position_event_source_basis_reliefs"."source_event_type" = 'acquisition'`
    );
    expect(checkSql(sourceBasisReliefConfig, 'pesbr_conversion_event_type_check')).toContain(
      `"position_event_source_basis_reliefs"."conversion_event_type" = 'conversion'`
    );
    expect(checkSql(sourceBasisReliefConfig, 'pesbr_source_origin_check')).toContain(
      `"position_event_source_basis_reliefs"."source_economic_origin" = 'cash_investment'`
    );
    expect(checkSql(sourceBasisReliefConfig, 'pesbr_resulting_origin_check')).toContain(
      `"position_event_source_basis_reliefs"."resulting_economic_origin" = 'conversion_result'`
    );
    expect(checkSql(sourceBasisReliefConfig, 'pesbr_conservation_check')).toContain(
      '"position_event_source_basis_reliefs"."relieved_cost_basis" ='
    );
    expect(checkSql(sourceBasisReliefConfig, 'pesbr_adjustment_presence_check')).toContain(
      `"position_event_source_basis_reliefs"."capitalized_adjustment_event_type" = 'adjustment'`
    );
    expect(checkSql(sourceBasisReliefConfig, 'pesbr_adjustment_presence_check')).toContain(
      '"position_event_source_basis_reliefs"."capitalized_adjustment_cost_basis" = 0'
    );
    expect(checkSql(sourceBasisReliefConfig, 'pesbr_positive_basis_check')).toContain(
      '"position_event_source_basis_reliefs"."source_acquisition_cost_basis" > 0'
    );
  });

  it('pins source-basis relief nullability and defaults', () => {
    const requiredColumns = columnNames(sourceBasisReliefConfig).filter(
      (columnName) =>
        !['capitalized_adjustment_position_event_id', 'capitalized_adjustment_event_type'].includes(
          columnName
        )
    );
    for (const columnName of requiredColumns) {
      expect(columnMeta(sourceBasisReliefConfig, columnName).notNull, columnName).toBe(true);
    }
    expect(columnMeta(sourceBasisReliefConfig, 'capitalized_adjustment_position_event_id').notNull)
      .toBe(false);
    expect(columnMeta(sourceBasisReliefConfig, 'capitalized_adjustment_event_type').notNull).toBe(
      false
    );
    const capitalizedAdjustmentColumn = columnMeta(
      sourceBasisReliefConfig,
      'capitalized_adjustment_cost_basis'
    );
    expect(capitalizedAdjustmentColumn).toMatchObject({
      hasDefault: true,
    });
    expect(dialect.sqlToQuery(capitalizedAdjustmentColumn.default as SQL).sql).toBe('0');
    expect(columnMeta(sourceBasisReliefConfig, 'source_event_type')).toMatchObject({
      hasDefault: true,
      default: 'acquisition',
    });
    expect(columnMeta(sourceBasisReliefConfig, 'conversion_event_type')).toMatchObject({
      hasDefault: true,
      default: 'conversion',
    });
    expect(columnMeta(sourceBasisReliefConfig, 'source_economic_origin')).toMatchObject({
      hasDefault: true,
      default: 'cash_investment',
    });
    expect(columnMeta(sourceBasisReliefConfig, 'resulting_economic_origin')).toMatchObject({
      hasDefault: true,
      default: 'conversion_result',
    });
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
    expect(constraintNames(participationConfig)).toEqual(
      expect.arrayContaining([
        'vfp_conversion_source_lineage_unique',
        'vfp_conversion_result_basis_unique',
      ])
    );
    expect(constraintNames(financingEventsConfig)).toContain(
      'financing_events_conversion_identity_unique'
    );
    expect(constraintNames(financingTranchesConfig)).toContain(
      'financing_tranches_conversion_lineage_unique'
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
    const sourceBasisRelief: InsertPositionEventSourceBasisRelief = {
      conversionPositionEventId: 10,
      sourceAcquisitionPositionEventId: 11,
      fundId: 1,
      vehicleId: 2,
      companyIdentityId: 3,
      sourceParticipationId: 4,
      sourceParticipationVersion: 1,
      sourceFinancingEventId: 5,
      sourceFinancingTrancheId: 6,
      resultingParticipationId: 7,
      resultingParticipationVersion: 1,
      resultingFinancingEventId: 8,
      resultingFinancingTrancheId: 9,
      sourceTrancheVersion: 1,
      resultingTrancheVersion: 1,
      sourceAcquisitionCostBasis: '1000.000000',
      relievedCostBasis: '1000.000000',
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

    expect([event, relief, sourceBasisRelief, ownership]).toHaveLength(4);
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

  it('orders source-basis relief preflight before guarded DDL in migration 0043', () => {
    const migration = fs.readFileSync('migrations/0043_position_source_basis_reliefs.sql', 'utf8');
    const preflight = migration.indexOf('position source-basis relief preflight failed');
    const parentKey = migration.indexOf(
      'ADD CONSTRAINT "position_events_source_basis_anchor_unique"'
    );
    const createTable = migration.indexOf(
      'CREATE TABLE IF NOT EXISTS "position_event_source_basis_reliefs"'
    );
    const inlinePrimary = migration.match(
      /CREATE TABLE IF NOT EXISTS "position_event_source_basis_reliefs"[\s\S]*?\);\r?\n--> statement-breakpoint/
    )?.[0];
    const guardedPkey = migration.indexOf(
      'ADD CONSTRAINT "position_event_source_basis_reliefs_pkey"'
    );
    const orphanReplay = migration.indexOf('LEFT JOIN "position_event_source_basis_reliefs"');

    expect(migration).toMatch(/^-- @drift-patch\r?\n-- Reason:/);
    expect(preflight).toBeGreaterThanOrEqual(0);
    expect(orphanReplay).toBeGreaterThanOrEqual(0);
    expect(parentKey).toBeGreaterThan(preflight);
    expect(createTable).toBeGreaterThan(parentKey);
    expect(inlinePrimary).toBeDefined();
    expect(inlinePrimary).not.toContain('PRIMARY KEY');
    expect(guardedPkey).toBeGreaterThan(createTable);
    expect(migration).toContain(
      "conrelid = 'public.position_event_source_basis_reliefs'::regclass"
    );
    expect(migration).toContain('to_regclass');
    expect(migration).toContain('--> statement-breakpoint');
  });
});
