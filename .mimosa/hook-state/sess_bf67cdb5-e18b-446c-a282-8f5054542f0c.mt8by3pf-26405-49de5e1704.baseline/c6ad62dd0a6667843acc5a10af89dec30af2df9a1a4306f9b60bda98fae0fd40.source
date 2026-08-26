import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { USD_FX_RATE_TO_USD } from '../contracts/investment-ledger/financing-event.contract';
import { funds } from './fund';
import { sourceObservations } from './financial-observations';
import { financingTranches } from './investment-ledger';
import { vehicles } from './vehicles';
import { users } from './user';

export const vehicleFinancingParticipations = pgTable(
  'vehicle_financing_participations',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    vehicleId: integer('vehicle_id').notNull(),
    financingEventId: integer('financing_event_id').notNull(),
    trancheKey: text('tranche_key').notNull(),
    financingTrancheId: integer('financing_tranche_id').notNull(),
    version: integer('version').notNull().default(1),
    supersededByParticipationId: integer('superseded_by_participation_id'),
    economicOrigin: varchar('economic_origin', { length: 32 })
      .notNull()
      .default('cash_investment')
      .$type<'cash_investment' | 'conversion_result'>(),
    participationAmount: numeric('participation_amount', { precision: 20, scale: 6 }).notNull(),
    originalAmount: numeric('original_amount', { precision: 20, scale: 6 }),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    fxRateToUsd: numeric('fx_rate_to_usd', { precision: 20, scale: 10 }),
    fxRateDate: date('fx_rate_date'),
    sharesAcquired: numeric('shares_acquired', { precision: 18, scale: 8 }),
    closingDate: date('closing_date'),
    pricePerShare: numeric('price_per_share', { precision: 20, scale: 6 }),
    postMoneyValuation: numeric('post_money_valuation', { precision: 20, scale: 6 }),
    valuationCap: numeric('valuation_cap', { precision: 20, scale: 6 }),
    conversionDiscountRate: numeric('conversion_discount_rate', {
      precision: 12,
      scale: 8,
    }),
    interestRate: numeric('interest_rate', { precision: 12, scale: 8 }),
    liquidationPreferenceMultiple: numeric('liquidation_preference_multiple', {
      precision: 12,
      scale: 8,
    }),
    participationCapMultiple: numeric('participation_cap_multiple', {
      precision: 12,
      scale: 8,
    }),
    proRataRightsPct: numeric('pro_rata_rights_pct', { precision: 12, scale: 8 }),
    participatingPreferred: boolean('participating_preferred'),
    maturityDate: date('maturity_date'),
    descriptiveTerms: jsonb('descriptive_terms').$type<Record<string, unknown>>(),
    confirmedDuplicates: jsonb('confirmed_duplicates')
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<string[]>(),
    sourceObservationId: integer('source_observation_id'),
    createdBy: integer('created_by'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'vfp_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    vehicleFundFk: foreignKey({
      columns: [table.vehicleId, table.fundId],
      foreignColumns: [vehicles.id, vehicles.fundId],
      name: 'vfp_vehicle_fund_fk',
    }),
    trancheFundFk: foreignKey({
      columns: [table.financingTrancheId, table.fundId],
      foreignColumns: [financingTranches.id, financingTranches.fundId],
      name: 'vfp_tranche_fund_fk',
    }),
    supersededFundFk: foreignKey({
      columns: [table.supersededByParticipationId, table.fundId],
      foreignColumns: [table.id, table.fundId],
      name: 'vfp_superseded_fund_fk',
    }),
    observationFundFk: foreignKey({
      columns: [table.sourceObservationId, table.fundId],
      foreignColumns: [sourceObservations.id, sourceObservations.fundId],
      name: 'vfp_observation_fund_fk',
    }),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'vfp_created_by_fk',
    }),
    versionPositiveCheck: check('vfp_version_positive_check', sql`${table.version} >= 1`),
    amountPositiveCheck: check('vfp_amount_positive_check', sql`${table.participationAmount} > 0`),
    fxRatePositiveCheck: check(
      'vfp_fx_rate_positive_check',
      sql`${table.fxRateToUsd} IS NULL OR ${table.fxRateToUsd} > 0`
    ),
    noSelfSupersedeCheck: check(
      'vfp_no_self_supersede_check',
      sql`${table.supersededByParticipationId} IS NULL OR ${table.supersededByParticipationId} <> ${table.id}`
    ),
    economicOriginCheck: check(
      'vfp_economic_origin_check',
      sql`${table.economicOrigin} IN ('cash_investment', 'conversion_result')`
    ),
    usdFxCheck: check(
      'vfp_usd_fx_check',
      sql`${table.currency} <> 'USD' OR ${table.fxRateToUsd} IS NULL OR ${table.fxRateToUsd} = ${sql.raw(USD_FX_RATE_TO_USD)}`
    ),
    idFundUnique: unique('vfp_id_fund_unique').on(table.id, table.fundId),
    fundIdempotencyUnique: unique('vfp_fund_idem_unique').on(table.fundId, table.idempotencyKey),
    keyVersionUnique: unique('vfp_key_version_unique').on(
      table.fundId,
      table.vehicleId,
      table.financingEventId,
      table.trancheKey,
      table.version
    ),
    conversionSourceLineageUnique: unique('vfp_conversion_source_lineage_unique').on(
      table.id,
      table.fundId,
      table.vehicleId,
      table.version,
      table.financingEventId,
      table.financingTrancheId,
      table.economicOrigin
    ),
    conversionResultBasisUnique: unique('vfp_conversion_result_basis_unique').on(
      table.id,
      table.fundId,
      table.vehicleId,
      table.version,
      table.financingEventId,
      table.financingTrancheId,
      table.economicOrigin,
      table.participationAmount
    ),
    headUnique: uniqueIndex('vfp_head_unique')
      .on(table.fundId, table.vehicleId, table.financingEventId, table.trancheKey)
      .where(sql`${table.supersededByParticipationId} IS NULL`),
    fundVehicleIdx: index('idx_vfp_fund_vehicle').on(table.fundId, table.vehicleId),
    fundTrancheIdx: index('idx_vfp_fund_tranche').on(table.fundId, table.financingTrancheId),
  })
);

export type VehicleFinancingParticipation = typeof vehicleFinancingParticipations.$inferSelect;
export type InsertVehicleFinancingParticipation =
  typeof vehicleFinancingParticipations.$inferInsert;
