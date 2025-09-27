/**
 * Fund Management Schema
 * Tables for fund configuration, snapshots, and events
 */

import { pgTable, serial, integer, boolean, timestamp, jsonb, varchar, unique, index } from 'drizzle-orm/pg-core';
import { funds, users } from './tables';

// Fund configuration storage (hybrid approach)
export const fundConfigs = pgTable("fundconfigs", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").references(() => funds.id).notNull(),
  version: integer("version").notNull().default(1),
  config: jsonb("config").notNull(), // Stores full fund configuration
  isDraft: boolean("is_draft").default(true),
  isPublished: boolean("is_published").default(false),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  fundVersionUnique: unique().on(table.fundId, table.version),
  fundVersionIdx: index("fundconfigs_fund_version_idx").on(table.fundId, table.version),
}));

// Fund snapshots for CQRS pattern
export const fundSnapshots = pgTable("fund_snapshots", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").references(() => funds.id).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // 'RESERVE', 'PACING', 'COHORT'
  payload: jsonb("payload").notNull(), // Calculation results
  calcVersion: varchar("calc_version", { length: 20 }).notNull(),
  correlationId: varchar("correlation_id", { length: 36 }).notNull(),
  metadata: jsonb("metadata"), // Additional calculation metadata
  snapshotTime: timestamp("snapshot_time").notNull(),
  eventCount: integer("event_count").default(0),
  stateHash: varchar("state_hash", { length: 64 }),
  state: jsonb("state"), // Snapshot state data
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  lookupIdx: index("fund_snapshots_lookup_idx").on(table.fundId, table.type, table.createdAt.desc()),
}));

// Fund events for audit trail
export const fundEvents = pgTable("fund_events", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").references(() => funds.id).notNull(),
  eventType: varchar("event_type", { length: 50 }).notNull(), // 'DRAFT_SAVED', 'PUBLISHED', 'CALC_TRIGGERED'
  payload: jsonb("payload"), // Event data
  userId: integer("user_id").references(() => users.id),
  correlationId: varchar("correlation_id", { length: 36 }),
  eventTime: timestamp("event_time").notNull(),
  operation: varchar("operation", { length: 50 }),
  entityType: varchar("entity_type", { length: 50 }),
  metadata: jsonb("metadata"), // Additional event metadata
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  fundEventIdx: index("fund_events_fund_idx").on(table.fundId, table.createdAt.desc()),
}));

// Type exports with Drizzle inference
export type FundConfig = typeof fundConfigs.$inferSelect;
export type NewFundConfig = typeof fundConfigs.$inferInsert;
export type FundSnapshot = typeof fundSnapshots.$inferSelect;
export type NewFundSnapshot = typeof fundSnapshots.$inferInsert;
export type FundEvent = typeof fundEvents.$inferSelect;
export type NewFundEvent = typeof fundEvents.$inferInsert;