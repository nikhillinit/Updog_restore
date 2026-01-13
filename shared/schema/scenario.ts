/**
 * Scenario and Simulation database schemas
 *
 * Contains: scenarios, scenarioCases, scenarioAuditLogs
 *
 * @module shared/schema/scenario
 */
import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// Import portfolioCompanies for FK references
import { portfolioCompanies } from './portfolio';

// ============================================================================
// SCENARIOS TABLE
// ============================================================================

export const scenarios = pgTable(
  'scenarios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: integer('company_id')
      .notNull()
      .references(() => portfolioCompanies.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    version: integer('version').notNull().default(1),
    isDefault: boolean('is_default').notNull().default(false),
    lockedAt: timestamp('locked_at'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    companyIdIdx: index('idx_scenarios_company_id')['on'](table.companyId),
    createdByIdx: index('idx_scenarios_created_by')['on'](table.createdBy),
    createdAtIdx: index('idx_scenarios_created_at')['on'](table.createdAt.desc()),
  })
);

// ============================================================================
// SCENARIO CASES TABLE
// ============================================================================

export const scenarioCases = pgTable(
  'scenario_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scenarioId: uuid('scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    caseName: varchar('case_name', { length: 255 }).notNull(),
    description: text('description'),
    probability: decimal('probability', { precision: 10, scale: 8 }).notNull(),
    investment: decimal('investment', { precision: 15, scale: 2 }).notNull().default('0'),
    followOns: decimal('follow_ons', { precision: 15, scale: 2 }).notNull().default('0'),
    exitProceeds: decimal('exit_proceeds', { precision: 15, scale: 2 }).notNull().default('0'),
    exitValuation: decimal('exit_valuation', { precision: 15, scale: 2 }).notNull().default('0'),
    monthsToExit: integer('months_to_exit'),
    ownershipAtExit: decimal('ownership_at_exit', { precision: 5, scale: 4 }),
    fmv: decimal('fmv', { precision: 15, scale: 2 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    scenarioIdIdx: index('idx_scenario_cases_scenario_id')['on'](table.scenarioId),
    createdAtIdx: index('idx_scenario_cases_created_at')['on'](table.createdAt.desc()),
  })
);

// ============================================================================
// SCENARIO AUDIT LOGS TABLE
// ============================================================================

export const scenarioAuditLogs = pgTable(
  'scenario_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 255 }),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    action: varchar('action', { length: 20 }).notNull(),
    diff: jsonb('diff'),
    timestamp: timestamp('timestamp').notNull().defaultNow(),
  },
  (table) => ({
    entityIdIdx: index('idx_audit_logs_entity_id')['on'](table.entityId),
    userIdIdx: index('idx_audit_logs_user_id')['on'](table.userId),
    timestampIdx: index('idx_audit_logs_timestamp')['on'](table.timestamp.desc()),
    entityTypeIdx: index('idx_audit_logs_entity_type')['on'](table.entityType),
  })
);

// ============================================================================
// TYPES
// ============================================================================

export type Scenario = typeof scenarios.$inferSelect;
export type NewScenario = typeof scenarios.$inferInsert;
export type ScenarioCase = typeof scenarioCases.$inferSelect;
export type NewScenarioCase = typeof scenarioCases.$inferInsert;
export type ScenarioAuditLog = typeof scenarioAuditLogs.$inferSelect;
export type NewScenarioAuditLog = typeof scenarioAuditLogs.$inferInsert;
