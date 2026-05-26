/**
 * Fund Management Schema
 * Tables for fund configuration, snapshots, and events
 */

import {
  pgTable,
  serial,
  integer,
  boolean,
  timestamp,
  jsonb,
  text,
  varchar,
  unique,
  uniqueIndex,
  index,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { funds, users } from './tables';

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
    fundVersionUnique: unique().on(table.fundId, table.version),
    fundVersionIdx: index('fundconfigs_fund_version_idx').on(table.fundId, table.version),
  })
);

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
    runId: integer('run_id'),
    configId: integer('config_id'),
    configVersion: integer('config_version'),
    scenarioSetId: uuid('scenario_set_id'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    lookupIdx: index('fund_snapshots_lookup_idx').on(
      table.fundId,
      table.type,
      table.createdAt.desc()
    ),
  })
);

export const fundScenarioSets = pgTable(
  'fund_scenario_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    sourceConfigId: integer('source_config_id')
      .notNull()
      .references(() => fundConfigs.id),
    sourceConfigVersion: integer('source_config_version').notNull(),
    createdByUserId: integer('created_by_user_id').references(() => users.id),
    createdByLabel: text('created_by_label'),
    updatedByUserId: integer('updated_by_user_id').references(() => users.id),
    updatedByLabel: text('updated_by_label'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedByUserId: integer('archived_by_user_id').references(() => users.id),
    archivedByLabel: text('archived_by_label'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    idempotencyRequestHash: text('idempotency_request_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    fundActiveUpdatedIdx: index('fund_scenario_sets_fund_active_updated_idx').on(
      table.fundId,
      table.archivedAt,
      table.updatedAt.desc(),
      table.id.desc()
    ),
    fundIdempotencyUniqueIdx: uniqueIndex('fund_scenario_sets_fund_idempotency_unique')
      .on(table.fundId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  })
);

export const fundScenarioVariants = pgTable(
  'fund_scenario_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scenarioSetId: uuid('scenario_set_id')
      .notNull()
      .references(() => fundScenarioSets.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    overrideType: varchar('override_type', { length: 32 }).notNull().$type<'fee_profile'>(),
    overridePayload: jsonb('override_payload').notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    setOrderUnique: unique('fund_scenario_variants_set_order_unique').on(
      table.scenarioSetId,
      table.sortOrder
    ),
    setOrderIdx: index('fund_scenario_variants_set_order_idx').on(
      table.scenarioSetId,
      table.sortOrder,
      table.id
    ),
  })
);

export const fundScenarioSetEvents = pgTable(
  'fund_scenario_set_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scenarioSetId: uuid('scenario_set_id')
      .notNull()
      .references(() => fundScenarioSets.id, { onDelete: 'cascade' }),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 32 }).notNull(),
    actorUserId: integer('actor_user_id').references(() => users.id),
    actorLabel: text('actor_label'),
    changeSummary: jsonb('change_summary_json').notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    scenarioCreatedIdx: index('fund_scenario_set_events_scenario_created_idx').on(
      table.scenarioSetId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    fundCreatedIdx: index('fund_scenario_set_events_fund_created_idx').on(
      table.fundId,
      table.createdAt.desc(),
      table.id.desc()
    ),
  })
);

// Fund events for audit trail
export const fundEvents = pgTable(
  'fund_events',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .references(() => funds.id)
      .notNull(),
    eventType: varchar('event_type', { length: 50 }).notNull(), // 'DRAFT_SAVED', 'PUBLISHED', 'CALC_TRIGGERED'
    payload: jsonb('payload'), // Event data
    userId: integer('user_id').references(() => users.id),
    correlationId: varchar('correlation_id', { length: 36 }),
    eventTime: timestamp('event_time').notNull(),
    operation: varchar('operation', { length: 50 }),
    entityType: varchar('entity_type', { length: 50 }),
    metadata: jsonb('metadata'), // Additional event metadata
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    fundEventIdx: index('fund_events_fund_idx').on(table.fundId, table.createdAt.desc()),
  })
);

// Type exports with Drizzle inference
export type FundConfig = typeof fundConfigs.$inferSelect;
export type NewFundConfig = typeof fundConfigs.$inferInsert;
export type FundSnapshot = typeof fundSnapshots.$inferSelect;
export type NewFundSnapshot = typeof fundSnapshots.$inferInsert;
export type FundScenarioSet = typeof fundScenarioSets.$inferSelect;
export type NewFundScenarioSet = typeof fundScenarioSets.$inferInsert;
export type FundScenarioVariant = typeof fundScenarioVariants.$inferSelect;
export type NewFundScenarioVariant = typeof fundScenarioVariants.$inferInsert;
export type FundScenarioSetEvent = typeof fundScenarioSetEvents.$inferSelect;
export type NewFundScenarioSetEvent = typeof fundScenarioSetEvents.$inferInsert;
export type FundEvent = typeof fundEvents.$inferSelect;
export type NewFundEvent = typeof fundEvents.$inferInsert;
