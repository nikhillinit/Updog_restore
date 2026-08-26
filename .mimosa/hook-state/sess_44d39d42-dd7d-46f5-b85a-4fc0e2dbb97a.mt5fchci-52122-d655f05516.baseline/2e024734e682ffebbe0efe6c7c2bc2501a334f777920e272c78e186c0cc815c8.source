import { sql } from 'drizzle-orm';
import {
  char,
  check,
  date,
  decimal,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { funds } from './fund';
import { portfolioCompanies } from './portfolio';
import { scenarioCases } from './scenario';

export const scenarioCaseSeedProvenance = pgTable(
  'scenario_case_seed_provenance',
  {
    scenarioCaseId: uuid('scenario_case_id').notNull(),
    fundId: integer('fund_id').notNull(),
    companyId: integer('company_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    factsInputHash: char('facts_input_hash', { length: 64 }).notNull(),
    factsAsOfDate: date('facts_as_of_date').notNull(),
    seededAt: timestamp('seeded_at', { withTimezone: true }).notNull().defaultNow(),
    trustState: varchar('trust_state', { length: 16 }).notNull(),
    currencyStatus: varchar('currency_status', { length: 24 }).notNull(),
    seededInvestment: decimal('seeded_investment', { precision: 15, scale: 6 }).notNull(),
    seededFollowOns: decimal('seeded_follow_ons', { precision: 15, scale: 6 }).notNull(),
    seededFmv: decimal('seeded_fmv', { precision: 15, scale: 6 }),
    investmentSource: varchar('investment_source', { length: 64 }).notNull(),
    followOnsSource: varchar('follow_ons_source', { length: 64 }).notNull(),
    fmvSource: varchar('fmv_source', { length: 64 }),
    latestRoundValuationReference: decimal('latest_round_valuation_reference', {
      precision: 15,
      scale: 6,
    }),
    latestRoundDateReference: date('latest_round_date_reference'),
  },
  (table) => ({
    primaryKey: primaryKey({
      name: 'scenario_case_seed_provenance_pkey',
      columns: [table.scenarioCaseId],
    }),
    scenarioCaseFk: foreignKey({
      name: 'scenario_case_seed_provenance_scenario_case_id_fkey',
      columns: [table.scenarioCaseId],
      foreignColumns: [scenarioCases.id],
    }).onDelete('cascade'),
    fundFk: foreignKey({
      name: 'scenario_case_seed_provenance_fund_id_fkey',
      columns: [table.fundId],
      foreignColumns: [funds.id],
    }).onDelete('cascade'),
    companyFk: foreignKey({
      name: 'scenario_case_seed_provenance_company_id_fkey',
      columns: [table.companyId],
      foreignColumns: [portfolioCompanies.id],
    }).onDelete('cascade'),
    fundIdempotencyUnique: unique('scenario_case_seed_provenance_fund_idempotency_key_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    trustStateCheck: check(
      'scenario_case_seed_provenance_trust_state_check',
      sql`${table.trustState} IN ('LIVE', 'PARTIAL', 'UNAVAILABLE', 'FAILED')`
    ),
    currencyStatusCheck: check(
      'scenario_case_seed_provenance_currency_status_check',
      sql`${table.currencyStatus} IN ('base_currency', 'mismatch_blocked', 'unknown')`
    ),
    fundIdx: index('scenario_case_seed_provenance_fund_idx')['on'](table.fundId),
    companyIdx: index('scenario_case_seed_provenance_company_idx')['on'](table.companyId),
  })
);

export type ScenarioCaseSeedProvenance = typeof scenarioCaseSeedProvenance.$inferSelect;
export type NewScenarioCaseSeedProvenance = typeof scenarioCaseSeedProvenance.$inferInsert;
