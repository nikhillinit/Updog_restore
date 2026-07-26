import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { funds } from './fund';
import { companyIdentities, sourceObservations } from './financial-observations';
import { investments, investmentLots } from './portfolio';
import { users } from './user';
import { vehicleFinancingParticipations } from './vehicle-financing-participations';
import { vehicles } from './vehicles';

export const POSITION_EVENT_TYPES = [
  'acquisition',
  'conversion',
  'realization',
  'write_off',
  'adjustment',
  'reversal',
] as const;
export type PositionEventType = (typeof POSITION_EVENT_TYPES)[number];

export const positionEvents = pgTable(
  'position_events',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    vehicleId: integer('vehicle_id').notNull(),
    companyIdentityId: integer('company_identity_id').notNull(),
    eventType: varchar('event_type', { length: 32 }).notNull().$type<PositionEventType>(),
    effectiveDate: date('effective_date').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    sharesDelta: numeric('shares_delta', { precision: 20, scale: 6 }).notNull(),
    costBasisDelta: numeric('cost_basis_delta', { precision: 20, scale: 6 }).notNull(),
    proceeds: numeric('proceeds', { precision: 20, scale: 6 }).notNull(),
    replacesEventId: integer('replaces_event_id'),
    reversesPositionEventId: integer('reverses_position_event_id'),
    vehicleParticipationId: integer('vehicle_participation_id'),
    resultingParticipationId: integer('resulting_participation_id'),
    sourceParticipationVersion: integer('source_participation_version'),
    resultingParticipationVersion: integer('resulting_participation_version'),
    sourceTrancheVersion: integer('source_tranche_version'),
    resultingTrancheVersion: integer('resulting_tranche_version'),
    sourceObservationId: integer('source_observation_id'),
    backfilledFromInvestmentId: integer('backfilled_from_investment_id'),
    createdBy: integer('created_by'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    requestHash: varchar('request_hash', { length: 64 }),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'position_events_fund_fk',
    }).onDelete('cascade'),
    vehicleFundFk: foreignKey({
      columns: [table.vehicleId, table.fundId],
      foreignColumns: [vehicles.id, vehicles.fundId],
      name: 'position_events_vehicle_fund_fk',
    }),
    identityFundFk: foreignKey({
      columns: [table.companyIdentityId, table.fundId],
      foreignColumns: [companyIdentities.id, companyIdentities.fundId],
      name: 'position_events_identity_fund_fk',
    }),
    replacesFundFk: foreignKey({
      columns: [table.replacesEventId, table.fundId],
      foreignColumns: [table.id, table.fundId],
      name: 'position_events_replaces_fund_fk',
    }),
    reversesFundFk: foreignKey({
      columns: [table.reversesPositionEventId, table.fundId],
      foreignColumns: [table.id, table.fundId],
      name: 'position_events_reverses_fund_fk',
    }),
    participationFundFk: foreignKey({
      columns: [table.vehicleParticipationId, table.fundId],
      foreignColumns: [vehicleFinancingParticipations.id, vehicleFinancingParticipations.fundId],
      name: 'position_events_participation_fund_fk',
    }),
    resultingParticipationFundFk: foreignKey({
      columns: [table.resultingParticipationId, table.fundId],
      foreignColumns: [vehicleFinancingParticipations.id, vehicleFinancingParticipations.fundId],
      name: 'position_events_resulting_participation_fund_fk',
    }),
    observationFundFk: foreignKey({
      columns: [table.sourceObservationId, table.fundId],
      foreignColumns: [sourceObservations.id, sourceObservations.fundId],
      name: 'position_events_observation_fund_fk',
    }),
    backfillInvestmentFundFk: foreignKey({
      columns: [table.backfilledFromInvestmentId, table.fundId],
      foreignColumns: [investments.id, investments.fundId],
      name: 'position_events_backfill_investment_fund_fk',
    }),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'position_events_created_by_fk',
    }),
    eventTypeCheck: check(
      'position_events_event_type_check',
      sql`${table.eventType} IN ('acquisition', 'conversion', 'realization', 'write_off', 'adjustment', 'reversal')`
    ),
    conversionLinksCheck: check(
      'position_events_conversion_links_check',
      sql`(
        ${table.eventType} = 'conversion'
        AND ${table.vehicleParticipationId} IS NOT NULL
        AND ${table.resultingParticipationId} IS NOT NULL
        AND ${table.sourceParticipationVersion} IS NOT NULL
        AND ${table.resultingParticipationVersion} IS NOT NULL
        AND ${table.sourceTrancheVersion} IS NOT NULL
        AND ${table.resultingTrancheVersion} IS NOT NULL
      ) OR (
        ${table.eventType} <> 'conversion'
        AND ${table.resultingParticipationId} IS NULL
        AND ${table.sourceParticipationVersion} IS NULL
        AND ${table.resultingParticipationVersion} IS NULL
        AND ${table.sourceTrancheVersion} IS NULL
        AND ${table.resultingTrancheVersion} IS NULL
      )`
    ),
    reversalTargetCheck: check(
      'position_events_reversal_target_check',
      sql`(${table.eventType} = 'reversal' AND ${table.reversesPositionEventId} IS NOT NULL)
        OR (${table.eventType} <> 'reversal' AND ${table.reversesPositionEventId} IS NULL)`
    ),
    noSelfLineageCheck: check(
      'position_events_no_self_lineage_check',
      sql`(${table.replacesEventId} IS NULL OR ${table.replacesEventId} <> ${table.id})
        AND (${table.reversesPositionEventId} IS NULL OR ${table.reversesPositionEventId} <> ${table.id})`
    ),
    idempotencyPairCheck: check(
      'position_events_idempotency_pair_check',
      sql`(${table.idempotencyKey} IS NULL) = (${table.requestHash} IS NULL)`
    ),
    idFundUnique: unique('position_events_id_fund_unique').on(table.id, table.fundId),
    backfillInvestmentUnique: unique('position_events_backfill_investment_unique').on(
      table.backfilledFromInvestmentId
    ),
    fundIdempotencyUnique: unique('position_events_fund_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    acquisitionParticipationUnique: uniqueIndex('position_events_acquisition_participation_unique')
      .on(table.vehicleParticipationId)
      .where(sql`${table.eventType} = 'acquisition'`),
    reversalTargetUnique: uniqueIndex('position_events_reversal_target_unique')
      .on(table.reversesPositionEventId)
      .where(sql`${table.reversesPositionEventId} IS NOT NULL`),
    scopeEffectiveRecordedIdx: index('idx_position_events_scope_effective_recorded').on(
      table.fundId,
      table.vehicleId,
      table.companyIdentityId,
      table.effectiveDate.desc(),
      table.recordedAt.desc()
    ),
  })
);

export const positionEventLotReliefs = pgTable(
  'position_event_lot_reliefs',
  {
    fundId: integer('fund_id').notNull(),
    positionEventId: integer('position_event_id').notNull(),
    investmentId: integer('investment_id').notNull(),
    investmentLotId: uuid('investment_lot_id').notNull(),
    relievedShares: numeric('relieved_shares', { precision: 20, scale: 6 }).notNull(),
    relievedCostBasis: numeric('relieved_cost_basis', { precision: 20, scale: 6 }).notNull(),
    allocatedProceeds: numeric('allocated_proceeds', { precision: 20, scale: 6 }).notNull(),
  },
  (table) => ({
    eventFundFk: foreignKey({
      columns: [table.positionEventId, table.fundId],
      foreignColumns: [positionEvents.id, positionEvents.fundId],
      name: 'position_event_lot_reliefs_event_fund_fk',
    }),
    investmentFundFk: foreignKey({
      columns: [table.investmentId, table.fundId],
      foreignColumns: [investments.id, investments.fundId],
      name: 'position_event_lot_reliefs_investment_fund_fk',
    }),
    lotInvestmentFk: foreignKey({
      columns: [table.investmentLotId, table.investmentId],
      foreignColumns: [investmentLots.id, investmentLots.investmentId],
      name: 'position_event_lot_reliefs_lot_investment_fk',
    }),
    eventLotUnique: unique('position_event_lot_reliefs_event_lot_unique').on(
      table.positionEventId,
      table.investmentLotId
    ),
    investmentIdx: index('idx_position_event_lot_reliefs_investment').on(
      table.investmentId,
      table.investmentLotId
    ),
  })
);

export const ownershipSnapshots = pgTable(
  'ownership_snapshots',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    vehicleId: integer('vehicle_id').notNull(),
    companyIdentityId: integer('company_identity_id').notNull(),
    effectiveDate: date('effective_date').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    ownershipPct: numeric('ownership_pct', { precision: 12, scale: 8 }).notNull(),
    fdNumerator: numeric('fd_numerator', { precision: 20, scale: 6 }),
    fdDenominator: numeric('fd_denominator', { precision: 20, scale: 6 }),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    supersedesSnapshotId: integer('supersedes_snapshot_id'),
    sourceObservationId: integer('source_observation_id').notNull(),
    createdBy: integer('created_by'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'ownership_snapshots_fund_fk',
    }).onDelete('cascade'),
    vehicleFundFk: foreignKey({
      columns: [table.vehicleId, table.fundId],
      foreignColumns: [vehicles.id, vehicles.fundId],
      name: 'ownership_snapshots_vehicle_fund_fk',
    }),
    identityFundFk: foreignKey({
      columns: [table.companyIdentityId, table.fundId],
      foreignColumns: [companyIdentities.id, companyIdentities.fundId],
      name: 'ownership_snapshots_identity_fund_fk',
    }),
    supersedesFundFk: foreignKey({
      columns: [table.supersedesSnapshotId, table.fundId],
      foreignColumns: [table.id, table.fundId],
      name: 'ownership_snapshots_supersedes_fund_fk',
    }),
    observationFundFk: foreignKey({
      columns: [table.sourceObservationId, table.fundId],
      foreignColumns: [sourceObservations.id, sourceObservations.fundId],
      name: 'ownership_snapshots_observation_fund_fk',
    }),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'ownership_snapshots_created_by_fk',
    }),
    ownershipPctRangeCheck: check(
      'ownership_snapshots_pct_range_check',
      sql`${table.ownershipPct} >= 0 AND ${table.ownershipPct} <= 100`
    ),
    fdPairCheck: check(
      'ownership_snapshots_fd_pair_check',
      sql`(${table.fdNumerator} IS NULL) = (${table.fdDenominator} IS NULL)`
    ),
    noSelfSupersedeCheck: check(
      'ownership_snapshots_no_self_supersede_check',
      sql`${table.supersedesSnapshotId} IS NULL OR ${table.supersedesSnapshotId} <> ${table.id}`
    ),
    idFundUnique: unique('ownership_snapshots_id_fund_unique').on(table.id, table.fundId),
    fundIdempotencyUnique: unique('ownership_snapshots_fund_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    supersedesUnique: uniqueIndex('ownership_snapshots_supersedes_unique')
      .on(table.supersedesSnapshotId)
      .where(sql`${table.supersedesSnapshotId} IS NOT NULL`),
    scopeEffectiveRecordedIdx: index('idx_ownership_snapshots_scope_effective_recorded').on(
      table.fundId,
      table.vehicleId,
      table.companyIdentityId,
      table.effectiveDate.desc(),
      table.recordedAt.desc()
    ),
  })
);

export type PositionEvent = typeof positionEvents.$inferSelect;
export type InsertPositionEvent = typeof positionEvents.$inferInsert;
export type PositionEventLotRelief = typeof positionEventLotReliefs.$inferSelect;
export type InsertPositionEventLotRelief = typeof positionEventLotReliefs.$inferInsert;
export type OwnershipSnapshot = typeof ownershipSnapshots.$inferSelect;
export type InsertOwnershipSnapshot = typeof ownershipSnapshots.$inferInsert;
