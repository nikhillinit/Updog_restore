import { pgTable, uuid, date, jsonb, timestamp, text, integer, pgEnum, index, uniqueIndex, serial, decimal } from "drizzle-orm/pg-core";
import { funds, portfolioCompanies } from './tables';

export const reserveEngineType = pgEnum('reserve_engine_type', ['rules', 'ml', 'hybrid']);

export const reserveDecisions = pgTable('reserve_decisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  fundId: uuid('fund_id').notNull(),
  companyId: uuid('company_id').notNull(),
  decisionTs: timestamp('decision_ts', { withTimezone: true }).notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  engineType: reserveEngineType('engine_type').notNull(),
  engineVersion: text('engine_version').notNull(),
  requestId: text('request_id'),
  featureFlags: jsonb('feature_flags').$type<Record<string, unknown>>().notNull().default({}),
  inputs: jsonb('inputs').$type<unknown>().notNull(),
  prediction: jsonb('prediction').$type<unknown>().notNull(),
  explanation: jsonb('explanation').$type<unknown>(),
  latencyMs: integer('latency_ms'),
  userId: uuid('user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqueDecision: uniqueIndex('ux_reserve_unique').on(
    t.companyId, t.periodStart, t.periodEnd, t.engineType, t.engineVersion
  ),
  fundCompanyIdx: index('idx_reserve_fund_company').on(t.fundId, t.companyId),
  periodIdx: index('idx_reserve_period').on(t.periodStart, t.periodEnd),
  engineIdx: index('idx_reserve_engine').on(t.engineType, t.engineVersion),
  inputsGinIdx: index('idx_reserve_inputs_gin').using('gin', t.inputs),
  predictionGinIdx: index('idx_reserve_prediction_gin').using('gin', t.prediction),
}));

export const reserveStrategies = pgTable("reserve_strategies", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").notNull().references(() => funds.id),
  companyId: integer("company_id").notNull().references(() => portfolioCompanies.id),
  allocation: decimal("allocation", { precision: 15, scale: 2 }).notNull(),
  confidence: decimal("confidence", { precision: 3, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow()
}, (table) => ({
  fundCompanyIdx: index("idx_reserve_strategies_fund_company").on(table.fundId, table.companyId)
}));

// Type exports
export type ReserveDecision = typeof reserveDecisions.$inferSelect;
export type NewReserveDecision = typeof reserveDecisions.$inferInsert;