import {
  ForeignKeyBuilder,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
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
export type InsertPortfolioCompanyUpdateReceipt = typeof portfolioCompanyUpdateReceipts.$inferInsert;
