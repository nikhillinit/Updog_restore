/**
 * Feature Flag Database Schema
 * Audit trail for flag changes and metadata
 */

import { pgTable, text, boolean, timestamp, jsonb, uuid } from 'drizzle-orm/pg-core';

export const flagChanges = pgTable('flag_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull(),                    // e.g., 'wizard.v1'
  before: jsonb('before'),                       // {enabled:bool, targeting:obj, ...}
  after: jsonb('after').notNull(),
  actorSub: text('actor_sub').notNull(),         // JWT sub claim
  actorEmail: text('actor_email').notNull(),     // JWT email claim
  ip: text('ip').notNull(),                      // Client IP
  userAgent: text('user_agent'),                 // Client User-Agent
  reason: text('reason').notNull(),              // Required change reason
  changeHash: text('change_hash').notNull(),     // SHA256 of change for integrity
  version: text('version').notNull(),            // Flags version at time of change
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const flagsState = pgTable('flags_state', {
  id: uuid('id').primaryKey().defaultRandom(),
  version: text('version').notNull().unique(),   // Monotonic version string
  flagsHash: text('flags_hash').notNull(),       // Hash of all flag states
  flags: jsonb('flags').notNull(),               // Complete flag state snapshot
  environment: text('environment').notNull(),    // dev/staging/production
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type FlagChange = typeof flagChanges.$inferSelect;
export type NewFlagChange = typeof flagChanges.$inferInsert;
export type FlagState = typeof flagsState.$inferSelect;
export type NewFlagState = typeof flagsState.$inferInsert;