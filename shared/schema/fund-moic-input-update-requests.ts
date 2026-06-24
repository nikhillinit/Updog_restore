import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

import { funds } from './fund';
import { portfolioCompanies } from './portfolio';
import { users } from './user';

export const fundMoicInputUpdateRequests = pgTable(
  'fund_moic_input_update_requests',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    companyId: integer('company_id')
      .notNull()
      .references(() => portfolioCompanies.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
  },
  (table) => ({
    requestUnique: unique('fund_moic_input_update_requests_scope_unique').on(
      table.fundId,
      table.companyId,
      table.idempotencyKey
    ),
    fundCompanyCreatedIdx: index('idx_fund_moic_input_update_requests_fund_company_created').on(
      table.fundId,
      table.companyId,
      table.createdAt.desc()
    ),
    statusCheck: check(
      'fund_moic_input_update_requests_status_check',
      sql`${table.status} IN ('pending','completed')`
    ),
  })
);

export type FundMoicInputUpdateRequest = typeof fundMoicInputUpdateRequests.$inferSelect;
export type InsertFundMoicInputUpdateRequest = typeof fundMoicInputUpdateRequests.$inferInsert;
