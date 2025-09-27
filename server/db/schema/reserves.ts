import { pgTable, uuid, date, jsonb, timestamp, text, integer, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';

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
  featureFlags: jsonb('feature_flags').notNull().default({}),
  inputs: jsonb('inputs').notNull(),
  prediction: jsonb('prediction').notNull(),
  explanation: jsonb('explanation'),
  latencyMs: integer('latency_ms'),
  userId: uuid('user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table: any) => ({
  // Ensure no duplicate decisions for same company-period-engine-version
  uniqueDecision: uniqueIndex('ux_reserve_unique')['on'](
    table.companyId, 
    table.periodStart, 
    table.periodEnd, 
    table.engineType, 
    table.engineVersion
  ),
  fundCompanyIdx: index('idx_reserve_fund_company')['on'](table.fundId, table.companyId),
  periodIdx: index('idx_reserve_period')['on'](table.periodStart, table.periodEnd),
  engineIdx: index('idx_reserve_engine')['on'](table.engineType, table.engineVersion),
  // GIN indexes for JSONB columns
  inputsGinIdx: index('idx_reserve_inputs_gin').using('gin', table.inputs),
  predictionGinIdx: index('idx_reserve_prediction_gin').using('gin', table.prediction),
}));

// Type exports
export type ReserveDecision = typeof reserveDecisions.$inferSelect;
export type NewReserveDecision = typeof reserveDecisions.$inferInsert;