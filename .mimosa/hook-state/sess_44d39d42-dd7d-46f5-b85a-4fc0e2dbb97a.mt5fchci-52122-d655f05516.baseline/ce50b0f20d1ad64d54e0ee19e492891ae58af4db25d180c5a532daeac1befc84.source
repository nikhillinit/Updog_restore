import { sql } from 'drizzle-orm';
import {
  check,
  date,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { funds } from './fund';

export const vehicles = pgTable(
  'vehicles',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    vehicleSlug: varchar('vehicle_slug', { length: 64 }).notNull(),
    vehicleType: varchar('vehicle_type', { length: 16 }).notNull(),
    name: varchar('name', { length: 128 }).notNull(),
    description: text('description'),
    committedCapital: decimal('committed_capital', { precision: 20, scale: 6 }),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    inceptionDate: date('inception_date'),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    spvEconomics: jsonb('spv_economics')
      .notNull()
      .default(sql`'{}'::jsonb`),
    adminBurdenScore: integer('admin_burden_score'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundSlugUnique: unique('vehicles_fund_slug_unique').on(table.fundId, table.vehicleSlug),
    idFundUnique: unique('vehicles_id_fund_unique').on(table.id, table.fundId),
    typeCheck: check(
      'vehicles_type_check',
      sql`${table.vehicleType} IN ('main_fund', 'spv', 'co_invest')`
    ),
    statusCheck: check(
      'vehicles_status_check',
      sql`${table.status} IN ('active', 'winding_down', 'closed')`
    ),
    adminScoreCheck: check(
      'vehicles_admin_score_check',
      sql`${table.adminBurdenScore} IS NULL OR (${table.adminBurdenScore} >= 0 AND ${table.adminBurdenScore} <= 100)`
    ),
    fundTypeIdx: index('idx_vehicles_fund_type').on(table.fundId, table.vehicleType),
    mainFundUnique: uniqueIndex('vehicles_main_fund_unique')
      .on(table.fundId)
      .where(sql`${table.vehicleType} = 'main_fund'`),
  })
);

export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = typeof vehicles.$inferInsert;
