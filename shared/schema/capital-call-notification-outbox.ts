import { sql } from 'drizzle-orm';
import {
  check,
  ForeignKeyBuilder,
  index,
  integer,
  pgTable,
  date,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { limitedPartners } from '../schema-lp-reporting';
import { lpCapitalCalls } from '../schema-lp-sprint3';

export type CapitalCallNotificationOutboxStatus =
  'pending' | 'processing' | 'delivered' | 'exhausted';
export type CapitalCallNotificationTransitionKind =
  'due' | 'overdue' | 'paid' | 'partial' | 'reminder_7d' | 'reminder_3d' | 'reminder_1d';

export const capitalCallNotificationOutbox = pgTable(
  'capital_call_notification_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    capitalCallId: uuid('capital_call_id').notNull(),
    lpId: integer('lp_id').notNull(),
    transitionKind: varchar('transition_kind', { length: 32 })
      .$type<CapitalCallNotificationTransitionKind>()
      .notNull(),
    dueDateBucket: date('due_date_bucket').notNull(),
    notificationType: varchar('notification_type', { length: 30 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),
    relatedEntityType: varchar('related_entity_type', { length: 30 }),
    relatedEntityId: uuid('related_entity_id'),
    actionUrl: varchar('action_url', { length: 500 }),
    status: varchar('status', { length: 16 })
      .notNull()
      .default('pending')
      .$type<CapitalCallNotificationOutboxStatus>(),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    capitalCallFk: new ForeignKeyBuilder(() => ({
      columns: [table.capitalCallId],
      foreignColumns: [lpCapitalCalls.id],
      name: 'capital_call_notification_outbox_capital_call_id_fk',
    })).onDelete('cascade'),
    lpFk: new ForeignKeyBuilder(() => ({
      columns: [table.lpId],
      foreignColumns: [limitedPartners.id],
      name: 'capital_call_notification_outbox_lp_id_fk',
    })).onDelete('cascade'),
    dedupeUnique: unique('capital_call_notification_outbox_dedupe_unique').on(
      table.capitalCallId,
      table.transitionKind,
      table.dueDateBucket
    ),
    pendingClaimIdx: index('capital_call_notification_outbox_pending_claim_idx')
      .on(table.nextAttemptAt, table.createdAt)
      .where(sql`${table.status} = 'pending'`),
    statusCheck: check(
      'capital_call_notification_outbox_status_check',
      sql`${table.status} IN ('pending', 'processing', 'delivered', 'exhausted')`
    ),
    attemptCountCheck: check(
      'capital_call_notification_outbox_attempt_count_check',
      sql`${table.attemptCount} >= 0`
    ),
    transitionKindCheck: check(
      'capital_call_notification_outbox_transition_kind_check',
      sql`${table.transitionKind} IN ('due', 'overdue', 'paid', 'partial', 'reminder_7d', 'reminder_3d', 'reminder_1d')`
    ),
  })
);

export type CapitalCallNotificationOutbox = typeof capitalCallNotificationOutbox.$inferSelect;
export type InsertCapitalCallNotificationOutbox = typeof capitalCallNotificationOutbox.$inferInsert;
