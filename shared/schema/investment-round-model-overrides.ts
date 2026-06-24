import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { funds } from './fund';
import { investmentRounds } from './investment-rounds';
import { users } from './user';

export const investmentRoundModelOverrides = pgTable(
  'investment_round_model_overrides',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
    roundId: integer('round_id').notNull(),
    overrideRole: varchar('override_role', { length: 32 }).notNull(),
    reason: text('reason').notNull(),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    supersedesOverrideId: integer('supersedes_override_id').references(
      (): AnyPgColumn => investmentRoundModelOverrides.id,
      { onDelete: 'restrict', onUpdate: 'restrict' }
    ),
    idempotencyKey: varchar('idempotency_key', { length: 255 }),
    requestHash: varchar('request_hash', { length: 64 }),
  },
  (table) => ({
    overrideRoleCheck: check(
      'investment_round_model_overrides_role_check',
      sql`${table.overrideRole} IN ('initial', 'follow_on', 'amount_only')`
    ),
    roundFundFk: foreignKey({
      name: 'investment_round_model_overrides_round_fund_fk',
      columns: [table.roundId, table.fundId],
      foreignColumns: [investmentRounds.id, investmentRounds.fundId],
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    supersedesUniqueIdx: uniqueIndex('investment_round_model_overrides_supersedes_uq')
      .on(table.supersedesOverrideId)
      .where(sql`supersedes_override_id IS NOT NULL`),
    rootLineageUniqueIdx: uniqueIndex('investment_round_model_overrides_root_lineage_uq')
      .on(table.fundId, table.roundId)
      .where(sql`supersedes_override_id IS NULL`),
    fundRoundIdx: index('investment_round_model_overrides_fund_round_idx').on(
      table.fundId,
      table.roundId,
      table.createdAt,
      table.id
    ),
  })
);

export type InvestmentRoundModelOverride = typeof investmentRoundModelOverrides.$inferSelect;
export type InsertInvestmentRoundModelOverride = typeof investmentRoundModelOverrides.$inferInsert;
