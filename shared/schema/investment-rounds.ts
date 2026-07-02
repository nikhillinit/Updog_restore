/**
 * Investment Rounds -- ADR-023 L3b persistence schema.
 *
 * First-class financing round records for investments. Fund scope is
 * denormalized for indexed reads and enforced against the parent investment by
 * a composite FK.
 *
 * @module shared/schema/investment-rounds
 * @see docs/adr/ADR-023-investment-event-persistence.md
 */

import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { funds } from './fund';
import { investments } from './portfolio';
import { users } from './user';

export const investmentRounds = pgTable(
  'investment_rounds',
  {
    id: serial('id').primaryKey(),
    investmentId: integer('investment_id').notNull(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
    roundName: varchar('round_name', { length: 120 }).notNull(),
    securityType: varchar('security_type', { length: 32 }).notNull(),
    roundDate: date('round_date').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    investmentAmount: numeric('investment_amount', { precision: 20, scale: 6 }).notNull(),
    roundSize: numeric('round_size', { precision: 20, scale: 6 }),
    preMoneyValuation: numeric('pre_money_valuation', { precision: 20, scale: 6 }),
    idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    supersedesRoundId: integer('supersedes_round_id').references(
      (): AnyPgColumn => investmentRounds.id,
      { onDelete: 'restrict' }
    ),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    securityTypeCheck: check(
      'investment_rounds_security_type_check',
      sql`${table.securityType} IN ('equity', 'convertible_note', 'safe', 'warrant', 'other')`
    ),
    amountPositiveCheck: check(
      'investment_rounds_amount_positive',
      sql`${table.investmentAmount} > 0`
    ),
    investmentFundFk: foreignKey({
      name: 'investment_rounds_investment_fund_fk',
      columns: [table.investmentId, table.fundId],
      foreignColumns: [investments.id, investments.fundId],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    fundInvestmentIdx: index('investment_rounds_fund_investment_idx').on(
      table.fundId,
      table.investmentId
    ),
    investmentRoundDateIdx: index('investment_rounds_investment_round_date_idx').on(
      table.investmentId,
      table.roundDate.desc()
    ),
    fundRoundOrderIdx: index('investment_rounds_fund_round_order_idx').on(
      table.fundId,
      table.investmentId,
      table.roundDate,
      table.createdAt,
      table.id
    ),
    fundIdempotencyKey: unique('investment_rounds_fund_idem_key').on(
      table.fundId,
      table.idempotencyKey
    ),
    // FK target for investment_round_model_overrides.round_fund_fk. Must be a
    // UNIQUE CONSTRAINT (not a unique index): drizzle-kit push creates table
    // constraints before the cross-table FK phase, whereas uniqueIndex is
    // created after FKs -> PG 42830 aborts the push (see investments.id_fund_id_key).
    idFundUnique: unique('investment_rounds_id_fund_uq').on(table.id, table.fundId),
    supersedesUniqueIdx: uniqueIndex('investment_rounds_supersedes_uq')
      .on(table.supersedesRoundId)
      .where(sql`supersedes_round_id IS NOT NULL`),
  })
);

export type InvestmentRound = typeof investmentRounds.$inferSelect;
export type InsertInvestmentRound = typeof investmentRounds.$inferInsert;
