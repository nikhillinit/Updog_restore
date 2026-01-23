/**
 * Shares Schema
 *
 * Database schema for the fund sharing system.
 * Enables secure sharing of fund dashboards with Limited Partners.
 */

import { pgTable, text, timestamp, boolean, integer, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { funds } from './fund';

// Access level enum values
export const SHARE_ACCESS_LEVELS = ['view_only', 'view_with_details', 'collaborator', 'admin'] as const;
export type ShareAccessLevel = typeof SHARE_ACCESS_LEVELS[number];

/**
 * Shares table - stores share link configurations
 */
export const shares = pgTable(
  'shares',
  {
    id: text('id').primaryKey(), // UUID
    fundId: text('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    createdBy: text('created_by').notNull(), // User ID who created the share

    // Access configuration
    accessLevel: text('access_level').notNull().default('view_only'),
    requirePasskey: boolean('require_passkey').notNull().default(false),
    passkeyHash: text('passkey_hash'), // bcrypt hash of passkey
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    // LP-specific settings
    hiddenMetrics: jsonb('hidden_metrics').$type<string[]>().default([]),
    customTitle: text('custom_title'),
    customMessage: text('custom_message'),

    // Tracking
    viewCount: integer('view_count').notNull().default(0),
    lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }),

    // Status
    isActive: boolean('is_active').notNull().default(true),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundIdIdx: index('shares_fund_id_idx').on(table.fundId),
    createdByIdx: index('shares_created_by_idx').on(table.createdBy),
    activeIdx: index('shares_active_idx').on(table.isActive),
  })
);

/**
 * Share analytics table - tracks share views
 */
export const shareAnalytics = pgTable(
  'share_analytics',
  {
    id: text('id').primaryKey(), // UUID
    shareId: text('share_id')
      .notNull()
      .references(() => shares.id, { onDelete: 'cascade' }),

    // View details
    viewedAt: timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
    viewerIp: text('viewer_ip'),
    userAgent: text('user_agent'),
    duration: integer('duration'), // seconds
    pagesViewed: jsonb('pages_viewed').$type<string[]>().default([]),
  },
  (table) => ({
    shareIdIdx: index('share_analytics_share_id_idx').on(table.shareId),
    viewedAtIdx: index('share_analytics_viewed_at_idx').on(table.viewedAt),
  })
);

// Zod schemas for validation
export const insertShareSchema = createInsertSchema(shares, {
  accessLevel: z.enum(SHARE_ACCESS_LEVELS),
  hiddenMetrics: z.array(z.string()).default([]),
});

export const selectShareSchema = createSelectSchema(shares);

export const insertShareAnalyticsSchema = createInsertSchema(shareAnalytics);
export const selectShareAnalyticsSchema = createSelectSchema(shareAnalytics);

// Types
export type Share = typeof shares.$inferSelect;
export type NewShare = typeof shares.$inferInsert;
export type ShareAnalyticsRecord = typeof shareAnalytics.$inferSelect;
export type NewShareAnalyticsRecord = typeof shareAnalytics.$inferInsert;
