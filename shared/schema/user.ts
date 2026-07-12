import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod/v4';

import { funds } from './fund';

export const USER_ROLES = ['admin', 'partner', 'analyst', 'operator', 'viewer', 'service'] as const;

export type UserRole = (typeof USER_ROLES)[number];

// Users table
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    username: text('username').notNull().unique(),
    password: text('password').notNull(),
    role: varchar('role', { length: 32 }).notNull().default('viewer').$type<UserRole>(),
    isActive: boolean('is_active').notNull().default(true),
    passwordUpdatedAt: timestamp('password_updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    roleCheck: check(
      'users_role_check',
      sql`${table.role} IN ('admin', 'partner', 'analyst', 'operator', 'viewer', 'service')`
    ),
  })
);

export const userFundGrants = pgTable(
  'user_fund_grants',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      name: 'user_fund_grants_pkey',
      columns: [table.userId, table.fundId],
    }),
  })
);

export const revokedTokens = pgTable(
  'revoked_tokens',
  {
    jti: varchar('jti', { length: 64 }).primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    reason: varchar('reason', { length: 32 }),
  },
  (table) => ({
    expiresAtIdx: index('revoked_tokens_expires_at_idx').on(table.expiresAt),
  })
);

export const insertUserSchema = createInsertSchema(users)
  .omit({
    id: true,
  })
  .extend({
    role: z.enum(USER_ROLES).optional(),
  });

export const insertUserFundGrantSchema = createInsertSchema(userFundGrants).omit({
  createdAt: true,
});

export const insertRevokedTokenSchema = createInsertSchema(revokedTokens).omit({
  revokedAt: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type UserFundGrant = typeof userFundGrants.$inferSelect;
export type InsertUserFundGrant = typeof userFundGrants.$inferInsert;
export type RevokedToken = typeof revokedTokens.$inferSelect;
export type InsertRevokedToken = typeof revokedTokens.$inferInsert;
