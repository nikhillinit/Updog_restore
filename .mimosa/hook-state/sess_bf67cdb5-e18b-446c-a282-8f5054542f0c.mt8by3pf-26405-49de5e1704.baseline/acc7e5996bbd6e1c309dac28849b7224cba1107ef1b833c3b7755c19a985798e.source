import { sql } from 'drizzle-orm';
import {
  char,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { funds } from './fund';
import { portfolioCompanies } from './portfolio';
import { scenarios } from './scenario';
import { users } from './user';

export const companyScenarioCreateRequests = pgTable(
  'company_scenario_create_requests',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    companyId: integer('company_id')
      .notNull()
      .references(() => portfolioCompanies.id, { onDelete: 'cascade' }),
    scenarioId: uuid('scenario_id').references(() => scenarios.id, { onDelete: 'set null' }),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundIdempotencyKeyUnique: unique(
      'company_scenario_create_requests_fund_idempotency_key_unique'
    ).on(table.fundId, table.idempotencyKey),
    statusCheck: check(
      'company_scenario_create_requests_status_check',
      sql`${table.status} IN ('pending', 'completed')`
    ),
    companyIdx: index('company_scenario_create_requests_company_idx').on(table.companyId),
    scenarioIdx: index('company_scenario_create_requests_scenario_idx').on(table.scenarioId),
  })
);

export type CompanyScenarioCreateRequest = typeof companyScenarioCreateRequests.$inferSelect;
export type NewCompanyScenarioCreateRequest = typeof companyScenarioCreateRequests.$inferInsert;
