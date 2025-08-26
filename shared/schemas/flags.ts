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
  actor: text('actor').notNull(),                // email or service principal
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type FlagChange = typeof flagChanges.$inferSelect;
export type NewFlagChange = typeof flagChanges.$inferInsert;