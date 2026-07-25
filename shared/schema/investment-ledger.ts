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

import { funds } from './fund';
import { companyIdentities, sourceObservations } from './financial-observations';
import { users } from './user';

export const financingEvents = pgTable(
  'financing_events',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    companyIdentityId: integer('company_identity_id').notNull(),
    eventKey: text('event_key').notNull(),
    roundName: text('round_name').notNull(),
    securityType: text('security_type').notNull(),
    eventDate: date('event_date').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    roundSize: numeric('round_size', { precision: 20, scale: 6 }),
    preMoneyValuation: numeric('pre_money_valuation', { precision: 20, scale: 6 }),
    postMoneyValuation: numeric('post_money_valuation', { precision: 20, scale: 6 }),
    pricePerShare: numeric('price_per_share', { precision: 20, scale: 6 }),
    createdBy: integer('created_by'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'financing_events_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    identityFundFk: foreignKey({
      columns: [table.companyIdentityId, table.fundId],
      foreignColumns: [companyIdentities.id, companyIdentities.fundId],
      name: 'financing_events_identity_fund_fk',
    }),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'financing_events_created_by_fk',
    }),
    securityTypeCheck: check(
      'financing_events_security_type_check',
      sql`${table.securityType} IN ('equity','safe','convertible_note','other')`
    ),
    idFundUnique: unique('financing_events_id_fund_unique').on(table.id, table.fundId),
    fundIdempotencyUnique: unique('financing_events_fund_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    identityEventKeyUnique: unique('financing_events_identity_event_key_unique').on(
      table.fundId,
      table.companyIdentityId,
      table.eventKey
    ),
    fundEventDateIdx: index('idx_financing_events_fund_event_date').on(
      table.fundId,
      table.eventDate.desc()
    ),
  })
);

export const financingTranches = pgTable(
  'financing_tranches',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    financingEventId: integer('financing_event_id').notNull(),
    trancheKey: text('tranche_key').notNull(),
    version: integer('version').notNull().default(1),
    supersededByTrancheId: integer('superseded_by_tranche_id'),
    closingDate: date('closing_date').notNull(),
    securityType: text('security_type').notNull(),
    investmentAmount: numeric('investment_amount', { precision: 20, scale: 6 }).notNull(),
    originalAmount: numeric('original_amount', { precision: 20, scale: 6 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    fxRateToUsd: numeric('fx_rate_to_usd', { precision: 20, scale: 10 }).notNull(),
    fxRateDate: date('fx_rate_date').notNull(),
    pricePerShare: numeric('price_per_share', { precision: 20, scale: 6 }),
    postMoneyValuation: numeric('post_money_valuation', { precision: 20, scale: 6 }),
    valuationCap: numeric('valuation_cap', { precision: 20, scale: 6 }),
    conversionDiscountRate: numeric('conversion_discount_rate', {
      precision: 12,
      scale: 8,
    }),
    interestRate: numeric('interest_rate', { precision: 12, scale: 8 }),
    maturityDate: date('maturity_date'),
    liquidationPreferenceMultiple: numeric('liquidation_preference_multiple', {
      precision: 12,
      scale: 8,
    }),
    participatingPreferred: boolean('participating_preferred'),
    participationCapMultiple: numeric('participation_cap_multiple', {
      precision: 12,
      scale: 8,
    }),
    proRataRightsPct: numeric('pro_rata_rights_pct', { precision: 12, scale: 8 }),
    descriptiveTerms: jsonb('descriptive_terms')
      .notNull()
      .default(sql`'{}'::jsonb`)
      .$type<Record<string, unknown>>(),
    calculationEligible: boolean('calculation_eligible').notNull().default(true),
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
      name: 'financing_tranches_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    eventFundFk: foreignKey({
      columns: [table.financingEventId, table.fundId],
      foreignColumns: [financingEvents.id, financingEvents.fundId],
      name: 'financing_tranches_event_fund_fk',
    }),
    supersededFundFk: foreignKey({
      columns: [table.supersededByTrancheId, table.fundId],
      foreignColumns: [table.id, table.fundId],
      name: 'financing_tranches_superseded_fund_fk',
    }),
    observationFundFk: foreignKey({
      columns: [table.sourceObservationId, table.fundId],
      foreignColumns: [sourceObservations.id, sourceObservations.fundId],
      name: 'financing_tranches_observation_fund_fk',
    }),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'financing_tranches_created_by_fk',
    }),
    securityTypeCheck: check(
      'financing_tranches_security_type_check',
      sql`${table.securityType} IN ('equity','safe','convertible_note','other')`
    ),
    versionPositiveCheck: check(
      'financing_tranches_version_positive_check',
      sql`${table.version} >= 1`
    ),
    amountPositiveCheck: check(
      'financing_tranches_amount_positive_check',
      sql`${table.investmentAmount} > 0 AND ${table.originalAmount} > 0`
    ),
    fxRatePositiveCheck: check(
      'financing_tranches_fx_rate_positive_check',
      sql`${table.fxRateToUsd} > 0`
    ),
    noSelfSupersedeCheck: check(
      'financing_tranches_no_self_supersede_check',
      sql`${table.supersededByTrancheId} IS NULL OR ${table.supersededByTrancheId} <> ${table.id}`
    ),
    usdFxCheck: check(
      'financing_tranches_usd_fx_check',
      sql`${table.currency} <> 'USD' OR ${table.fxRateToUsd} = 1`
    ),
    equityTermsCheck: check(
      'financing_tranches_equity_terms_check',
      sql`${table.securityType} <> 'equity'
        OR ${table.pricePerShare} IS NOT NULL
        OR ${table.postMoneyValuation} IS NOT NULL`
    ),
    safeTermsCheck: check(
      'financing_tranches_safe_terms_check',
      sql`${table.securityType} <> 'safe'
        OR (
          (${table.valuationCap} IS NOT NULL OR ${table.conversionDiscountRate} IS NOT NULL)
          AND ${table.liquidationPreferenceMultiple} IS NULL
          AND ${table.participatingPreferred} IS NULL
        )`
    ),
    noteTermsCheck: check(
      'financing_tranches_note_terms_check',
      sql`${table.securityType} <> 'convertible_note'
        OR (${table.interestRate} IS NOT NULL AND ${table.maturityDate} IS NOT NULL)`
    ),
    idFundUnique: unique('financing_tranches_id_fund_unique').on(table.id, table.fundId),
    fundIdempotencyUnique: unique('financing_tranches_fund_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    eventKeyVersionUnique: unique('financing_tranches_event_key_version_unique').on(
      table.fundId,
      table.financingEventId,
      table.trancheKey,
      table.version
    ),
    headUnique: uniqueIndex('financing_tranches_head_unique')
      .on(table.fundId, table.financingEventId, table.trancheKey)
      .where(sql`${table.supersededByTrancheId} IS NULL`),
    fundEventIdx: index('idx_financing_tranches_fund_event').on(
      table.fundId,
      table.financingEventId
    ),
  })
);

export type FinancingEvent = typeof financingEvents.$inferSelect;
export type InsertFinancingEvent = typeof financingEvents.$inferInsert;
export type FinancingTranche = typeof financingTranches.$inferSelect;
export type InsertFinancingTranche = typeof financingTranches.$inferInsert;
