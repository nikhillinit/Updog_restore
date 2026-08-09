import {
  ForeignKeyBuilder,
  bigint,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  timestamp,
  text,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

import { funds } from './fund';
import { portfolioCompanies } from './portfolio';
import { users } from './user';

export const portfolioCompanyUpdateReceipts = pgTable(
  'portfolio_company_update_receipts',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    companyId: integer('company_id').notNull(),
    actorId: integer('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    responseId: integer('response_id').notNull(),
    responseFundId: integer('response_fund_id').notNull(),
    responseName: varchar('response_name', { length: 255 }).notNull(),
    responseSector: varchar('response_sector', { length: 255 }).notNull(),
    responseStage: text('response_stage').notNull(),
    responseCurrentStage: text('response_current_stage'),
    responseInvestmentAmount: decimal('response_investment_amount', { precision: 15, scale: 2 }).notNull(),
    responseInvestmentDate: timestamp('response_investment_date'),
    responseCurrentValuation: decimal('response_current_valuation', { precision: 15, scale: 2 }),
    responseFoundedYear: integer('response_founded_year'),
    responseCompanyStatus: text('response_company_status').notNull(),
    responseDescription: varchar('response_description', { length: 2000 }),
    responseDealTags: jsonb('response_deal_tags').$type<string[] | null>(),
    responseCreatedAt: timestamp('response_created_at'),
    responseDeployedReservesCents: bigint('response_deployed_reserves_cents', { mode: 'number' }),
    responsePlannedReservesCents: bigint('response_planned_reserves_cents', { mode: 'number' }),
    responseExitMoicBps: integer('response_exit_moic_bps'),
    responseExitProbability: decimal('response_exit_probability', { precision: 7, scale: 6 }),
    responseOwnershipCurrentPct: decimal('response_ownership_current_pct', {
      precision: 7,
      scale: 4,
    }),
    responseAllocationCapCents: bigint('response_allocation_cap_cents', { mode: 'number' }),
    responseAllocationReason: text('response_allocation_reason'),
    responseAllocationIteration: integer('response_allocation_iteration').notNull(),
    responseLastAllocationAt: timestamp('response_last_allocation_at', { withTimezone: true }),
    responseAllocationVersion: integer('response_allocation_version').notNull(),
    responseStatus: integer('response_status').notNull(),
    responseRowVersion: integer('response_row_version').notNull(),
    responseUpdatedAt: timestamp('response_updated_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyFundFk: new ForeignKeyBuilder(() => ({
      columns: [table.companyId, table.fundId],
      foreignColumns: [portfolioCompanies.id, portfolioCompanies.fundId],
      name: 'portfolio_company_update_receipts_company_fund_fk',
    })).onDelete('cascade'),
    scopeUnique: unique('portfolio_company_update_receipts_scope_unique').on(
      table.fundId,
      table.companyId,
      table.actorId,
      table.idempotencyKey
    ),
    fundCompanyCreatedIdx: index('portfolio_company_update_receipts_fund_company_created_idx').on(
      table.fundId,
      table.companyId,
      table.createdAt.desc()
    ),
  })
);

export type PortfolioCompanyUpdateReceipt = typeof portfolioCompanyUpdateReceipts.$inferSelect;
export type InsertPortfolioCompanyUpdateReceipt =
  typeof portfolioCompanyUpdateReceipts.$inferInsert;
