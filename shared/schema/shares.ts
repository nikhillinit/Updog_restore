/**
 * Shares Schema
 *
 * Database schema for the fund sharing system.
 * Enables secure sharing of fund dashboards with Limited Partners.
 */

import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { funds } from './fund';
import type { PublicShareSnapshotPayload } from '../contracts/public-share-snapshot.contract';

// Access level enum values
export const SHARE_ACCESS_LEVELS = [
  'view_only',
  'view_with_details',
  'collaborator',
  'admin',
] as const;
export type ShareAccessLevel = (typeof SHARE_ACCESS_LEVELS)[number];

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
    version: integer('version').notNull().default(1),
    idempotencyKey: text('idempotency_key'),
    idempotencyRequestHash: text('idempotency_request_hash'),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundIdIdx: index('shares_fund_id_idx').on(table.fundId),
    createdByIdx: index('shares_created_by_idx').on(table.createdBy),
    activeIdx: index('shares_active_idx').on(table.isActive),
    idempotencyUniqueIdx: uniqueIndex('shares_creator_idempotency_key_idx')
      .on(table.createdBy, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  })
);

/**
 * Immutable public payloads generated from private fund read models.
 *
 * Public routes must return this payload, not the private fund id or private
 * dashboard API response that was used to generate it.
 */
export const shareSnapshots = pgTable(
  'share_snapshots',
  {
    id: text('id').primaryKey(), // UUID
    shareId: text('share_id')
      .notNull()
      .references(() => shares.id, { onDelete: 'cascade' }),
    fundIdInternal: text('fund_id_internal').notNull(),
    payloadVersion: text('payload_version').notNull().default('public-share-snapshot.v1'),
    asOfDate: timestamp('as_of_date', { withTimezone: true }).notNull(),
    sourceCalculationRunIds: jsonb('source_calculation_run_ids')
      .$type<string[]>()
      .notNull()
      .default([]),
    hiddenMetricPolicy: jsonb('hidden_metric_policy')
      .$type<{ requested: string[]; applied: string[] }>()
      .notNull(),
    generatedBy: text('generated_by').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    payloadHash: text('payload_hash').notNull(),
    payload: jsonb('payload').$type<PublicShareSnapshotPayload>().notNull(),
  },
  (table) => ({
    shareGeneratedIdx: index('share_snapshots_share_generated_idx').on(
      table.shareId,
      table.generatedAt
    ),
    payloadHashIdx: index('share_snapshots_payload_hash_idx').on(table.payloadHash),
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
export const insertShareSchema = createInsertSchema(shares);
export const selectShareSchema = createSelectSchema(shares);

export const insertShareAnalyticsSchema = createInsertSchema(shareAnalytics);
export const selectShareAnalyticsSchema = createSelectSchema(shareAnalytics);
export const insertShareSnapshotSchema = createInsertSchema(shareSnapshots);
export const selectShareSnapshotSchema = createSelectSchema(shareSnapshots);

// Extended validation schema with proper types
export const createShareSchema = z.object({
  fundId: z.string().min(1),
  accessLevel: z.enum(SHARE_ACCESS_LEVELS).default('view_only'),
  requirePasskey: z.boolean().default(false),
  passkey: z.string().min(4).max(50).optional(),
  expiresInDays: z.number().min(1).max(365).optional(),
  hiddenMetrics: z.array(z.string()).default([]),
  customTitle: z.string().max(100).optional(),
  customMessage: z.string().max(500).optional(),
});

// Types
export type Share = typeof shares.$inferSelect;
export type NewShare = typeof shares.$inferInsert;
export type ShareAnalyticsRecord = typeof shareAnalytics.$inferSelect;
export type NewShareAnalyticsRecord = typeof shareAnalytics.$inferInsert;
export type ShareSnapshotRecord = typeof shareSnapshots.$inferSelect;
export type NewShareSnapshotRecord = typeof shareSnapshots.$inferInsert;
