import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { funds } from './fund';
import { portfolioCompanies } from './portfolio';
import { users } from './user';

// ============================================================================
// ALLOCATION SCENARIOS — durable allocation planning surface.
// Promoted PR-2b-1 into the canonical journal
// migrations/0025_allocation_scenarios_promote_drift.sql. Live makeApp prod surface
// (server/routes/allocation-scenarios.ts). allocation_scenario_decisions is
// dead (no consumer) and intentionally NOT promoted.
// ============================================================================

export const allocationScenarios = pgTable(
  'allocation_scenarios',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    notes: text('notes'),
    sourceAllocationVersion: integer('source_allocation_version'),
    companyCount: integer('company_count').notNull().default(0),
    totalPlannedCents: bigint('total_planned_cents', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastAppliedAt: timestamp('last_applied_at', { withTimezone: true }),
    lastAppliedBy: text('last_applied_by'),
    lastAppliedAllocationVersion: integer('last_applied_allocation_version'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    lastSyncedBy: text('last_synced_by'),
  },
  (table) => ({
    fundUpdatedIdx: index('allocation_scenarios_fund_updated_idx').on(
      table.fundId,
      table.updatedAt.desc(),
      table.id.desc()
    ),
  })
);

export const allocationScenarioItems = pgTable(
  'allocation_scenario_items',
  {
    scenarioId: uuid('scenario_id')
      .notNull()
      .references(() => allocationScenarios.id, { onDelete: 'cascade' }),
    companyId: integer('company_id')
      .notNull()
      .references(() => portfolioCompanies.id, { onDelete: 'cascade' }),
    plannedReservesCents: bigint('planned_reserves_cents', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    allocationCapCents: bigint('allocation_cap_cents', { mode: 'bigint' }),
    allocationReason: text('allocation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      name: 'allocation_scenario_items_pkey',
      columns: [table.scenarioId, table.companyId],
    }),
    scenarioIdx: index('allocation_scenario_items_scenario_idx').on(
      table.scenarioId,
      table.companyId
    ),
    nonNegativePlanned: check(
      'allocation_scenario_items_non_negative_planned',
      sql`${table.plannedReservesCents} >= 0`
    ),
    nonNegativeCap: check(
      'allocation_scenario_items_non_negative_cap',
      sql`${table.allocationCapCents} IS NULL OR ${table.allocationCapCents} >= 0`
    ),
    capGtePlanned: check(
      'allocation_scenario_items_cap_gte_planned',
      sql`${table.allocationCapCents} IS NULL OR ${table.allocationCapCents} >= ${table.plannedReservesCents}`
    ),
  })
);

export const allocationScenarioEvents = pgTable(
  'allocation_scenario_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scenarioId: uuid('scenario_id')
      .notNull()
      .references(() => allocationScenarios.id, { onDelete: 'cascade' }),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 32 }).notNull(),
    actorUserId: integer('actor_user_id').references(() => users.id),
    actorLabel: text('actor_label'),
    note: text('note'),
    sourceAllocationVersion: integer('source_allocation_version'),
    resultingAllocationVersion: integer('resulting_allocation_version'),
    changeSummaryJson: jsonb('change_summary_json').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    scenarioCreatedIdx: index('allocation_scenario_events_scenario_created_idx').on(
      table.scenarioId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    fundCreatedIdx: index('allocation_scenario_events_fund_created_idx').on(
      table.fundId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    typeCheck: check(
      'allocation_scenario_events_type_check',
      sql`${table.eventType} IN ('applied', 'synced')`
    ),
  })
);

export const allocationScenarioIcDecisions = pgTable(
  'allocation_scenario_ic_decisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scenarioId: uuid('scenario_id')
      .notNull()
      .references(() => allocationScenarios.id, { onDelete: 'cascade' }),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    companyId: integer('company_id')
      .notNull()
      .references(() => portfolioCompanies.id, { onDelete: 'cascade' }),
    decisionType: varchar('decision_type', { length: 32 }).notNull(),
    decisionStatus: varchar('decision_status', { length: 32 }).notNull().default('draft'),
    rationale: text('rationale').notNull(),
    proposedPlannedReservesCents: bigint('proposed_planned_reserves_cents', { mode: 'bigint' }),
    finalPlannedReservesCents: bigint('final_planned_reserves_cents', { mode: 'bigint' }),
    decidedByUserId: integer('decided_by_user_id').references(() => users.id),
    decidedByLabel: text('decided_by_label'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    sourceAllocationVersion: integer('source_allocation_version'),
    liveAllocationVersion: integer('live_allocation_version'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueCompany: unique('allocation_scenario_ic_decisions_unique_company').on(
      table.scenarioId,
      table.companyId
    ),
    scenarioIdx: index('allocation_scenario_ic_decisions_scenario_idx').on(
      table.scenarioId,
      table.companyId
    ),
    fundIdx: index('allocation_scenario_ic_decisions_fund_idx').on(
      table.fundId,
      table.scenarioId,
      table.updatedAt.desc(),
      table.id.desc()
    ),
    typeCheck: check(
      'allocation_scenario_ic_decisions_type_check',
      sql`${table.decisionType} IN ('follow_on', 'defer', 'cut_reserve', 'no_action')`
    ),
    statusCheck: check(
      'allocation_scenario_ic_decisions_status_check',
      sql`${table.decisionStatus} IN ('draft', 'proposed', 'approved', 'rejected')`
    ),
    proposedNonNegative: check(
      'allocation_scenario_ic_decisions_proposed_non_negative',
      sql`${table.proposedPlannedReservesCents} IS NULL OR ${table.proposedPlannedReservesCents} >= 0`
    ),
    finalNonNegative: check(
      'allocation_scenario_ic_decisions_final_non_negative',
      sql`${table.finalPlannedReservesCents} IS NULL OR ${table.finalPlannedReservesCents} >= 0`
    ),
  })
);

export type AllocationScenario = typeof allocationScenarios.$inferSelect;
export type AllocationScenarioItem = typeof allocationScenarioItems.$inferSelect;
export type AllocationScenarioEvent = typeof allocationScenarioEvents.$inferSelect;
export type AllocationScenarioIcDecision = typeof allocationScenarioIcDecisions.$inferSelect;
