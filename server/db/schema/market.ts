import { pgTable, bigserial, date, numeric, integer, jsonb, timestamp, text, index } from 'drizzle-orm/pg-core';

export const marketIndicators = pgTable('market_indicators', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  asOfDate: date('as_of_date').notNull().unique(),
  vix: numeric('vix', { precision: 8, scale: 3 }),
  fedFundsRate: numeric('fed_funds_rate', { precision: 6, scale: 3 }),
  ust10yYield: numeric('ust10y_yield', { precision: 6, scale: 3 }),
  ipoCount30d: integer('ipo_count_30d'),
  creditSpreadBaa: numeric('credit_spread_baa', { precision: 6, scale: 3 }),
  components: jsonb('components').notNull().default({}),
  source: text('source'),
  ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
}, (table: any) => ({
  dateIdx: index('idx_market_indicators_date')['on'](table.asOfDate),
}));

export const pacingScores = pgTable('pacing_scores', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  asOfDate: date('as_of_date').notNull().unique(),
  score: numeric('score', { precision: 6, scale: 3 }).notNull(),
  version: text('version').notNull(),
  components: jsonb('components').notNull().default({}),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
});

// Type exports for use in business logic
export type MarketIndicator = typeof marketIndicators.$inferSelect;
export type NewMarketIndicator = typeof marketIndicators.$inferInsert;
export type PacingScore = typeof pacingScores.$inferSelect;
export type NewPacingScore = typeof pacingScores.$inferInsert;