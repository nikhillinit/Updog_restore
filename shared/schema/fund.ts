/**
 * Fund-related database schemas
 *
 * Contains: funds, fundConfigs, fundSnapshots
 * Note: fundEvents remains in schema.ts due to users dependency
 * Note: Insert schemas with .omit() rules are in schema.ts to prevent duplicate definitions
 *
 * @module shared/schema/fund
 */
import {
  boolean,
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
  varchar,
} from 'drizzle-orm/pg-core';

// ============================================================================
// FUNDS TABLE
// ============================================================================

export const funds = pgTable('funds', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  size: decimal('size', { precision: 15, scale: 2 }).notNull(),
  deployedCapital: decimal('deployed_capital', { precision: 15, scale: 2 }).default('0'),
  managementFee: decimal('management_fee', { precision: 5, scale: 4 }).notNull(),
  carryPercentage: decimal('carry_percentage', { precision: 5, scale: 4 }).notNull(),
  vintageYear: integer('vintage_year').notNull(),
  establishmentDate: date('establishment_date'),
  status: text('status').notNull().default('active'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// FUND CONFIGS TABLE
// ============================================================================

// Fund configuration storage (hybrid approach)
export const fundConfigs = pgTable(
  'fundconfigs',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .references(() => funds.id)
      .notNull(),
    version: integer('version').notNull().default(1),
    config: jsonb('config').notNull(), // Stores full fund configuration
    isDraft: boolean('is_draft').default(true),
    isPublished: boolean('is_published').default(false),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    fundVersionUnique: unique()['on'](table.fundId, table.version),
    fundVersionIdx: index('fundconfigs_fund_version_idx')['on'](table.fundId, table.version),
  })
);

// ============================================================================
// FUND SNAPSHOTS TABLE
// ============================================================================

// Fund snapshots for CQRS pattern
export const fundSnapshots = pgTable(
  'fund_snapshots',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .references(() => funds.id)
      .notNull(),
    type: varchar('type', { length: 50 }).notNull(), // 'RESERVE', 'PACING', 'COHORT'
    payload: jsonb('payload').notNull(), // Calculation results
    calcVersion: varchar('calc_version', { length: 20 }).notNull(),
    correlationId: varchar('correlation_id', { length: 36 }).notNull(),
    metadata: jsonb('metadata'), // Additional calculation metadata
    snapshotTime: timestamp('snapshot_time').notNull(),
    eventCount: integer('event_count').default(0),
    stateHash: varchar('state_hash', { length: 64 }),
    state: jsonb('state'), // Snapshot state data
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    lookupIdx: index('fund_snapshots_lookup_idx')['on'](
      table.fundId,
      table.type,
      table.createdAt.desc()
    ),
  })
);

// ============================================================================
// TYPES (Insert schemas with .omit() rules are defined in schema.ts)
// ============================================================================

export type Fund = typeof funds.$inferSelect;
export type NewFund = typeof funds.$inferInsert;
export type FundConfig = typeof fundConfigs.$inferSelect;
export type NewFundConfig = typeof fundConfigs.$inferInsert;
export type FundSnapshot = typeof fundSnapshots.$inferSelect;
export type NewFundSnapshot = typeof fundSnapshots.$inferInsert;
