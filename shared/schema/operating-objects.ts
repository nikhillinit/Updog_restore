/**
 * Operating Objects -- Foundation Schema
 *
 * Drizzle bindings for the operating-object program (backend-first per
 * docs/design/audits/server-object-readiness.md). First object: `tasks`
 * (fund-scoped work items, minimal create/list). assumption/comment follow in
 * later PRs and slot in beside `tasks` here.
 *
 * Mirrors server/migrations/20260616_operating_object_tasks_v1.up.sql. Use the
 * exported $inferSelect / $inferInsert types in services/contracts; never
 * hand-declare a column type in a consumer.
 *
 * @module shared/schema/operating-objects
 * @see docs/design/audits/server-object-readiness.md
 */

import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

import { funds } from './fund';
import { users } from './user';

// ============================================================================
// TASKS (fund-scoped work items)
// ============================================================================

export const tasks = pgTable(
  'tasks',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('open'),
    ownerId: integer('owner_id').references(() => users.id, { onDelete: 'set null' }),
    dueDate: date('due_date'),
    description: text('description'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    statusCheck: check(
      'tasks_status_check',
      sql`${table.status} IN ('open', 'in_progress', 'done')`
    ),
    titleNonEmptyCheck: check('tasks_title_nonempty_check', sql`length(btrim(${table.title})) > 0`),
    fundCreatedIdx: index('idx_tasks_fund_created').on(table.fundId, table.createdAt.desc()),
  })
);

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;
