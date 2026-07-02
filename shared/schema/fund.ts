/**
 * Fund-related database schemas
 *
 * Contains: funds, fundConfigs, fundSnapshots, fundScenarioSets
 * Note: fundEvents remains in schema.ts for legacy compatibility
 * Note: Insert schemas with .omit() rules are in schema.ts to prevent duplicate definitions
 *
 * @module shared/schema/fund
 */
import {
  boolean,
  check,
  date,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { EngineResults } from '../schemas/engine-results-schema';
import {
  FinancialActionabilitySchema,
  type FinancialActionability,
} from '../contracts/financial-provenance.contract';
import { users } from './user';

const h9FinancialActionabilityValuesSql = sql.raw(
  FinancialActionabilitySchema.options.map((value) => `'${value}'`).join(', ')
);

// ============================================================================
// FUNDS TABLE
// ============================================================================

export const funds = pgTable('funds', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  size: decimal('size', { precision: 15, scale: 2 }).notNull(),
  deployedCapital: decimal('deployed_capital', { precision: 15, scale: 2 }).default('0'),
  managementFee: decimal('management_fee', { precision: 5, scale: 4 }).notNull(),
  carryPercentage: decimal('carry_percentage', { precision: 5, scale: 4 }).notNull(),
  vintageYear: integer('vintage_year').notNull(),
  establishmentDate: date('establishment_date'),
  status: text('status').notNull().default('active'),
  isActive: boolean('is_active').default(true),
  baseCurrency: varchar('base_currency', { length: 3 }).notNull().default('USD'),
  engineResults: jsonb('engine_results').$type<EngineResults>(),
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// FUND CONFIGS TABLE
// ============================================================================

// Fund configuration storage (hybrid approach)
//
// DB-enforced invariants (migration 0008):
//   - fundconfigs_one_draft_per_fund: UNIQUE(fund_id) WHERE is_draft=true
//   - fundconfigs_one_published_per_fund: UNIQUE(fund_id) WHERE is_published=true
//   - chk_not_draft_and_published: NOT (is_draft AND is_published)
//   - chk_draft_no_published_at: NOT is_draft OR published_at IS NULL
//   - chk_published_has_published_at: NOT is_published OR published_at IS NOT NULL
export const fundConfigs = pgTable(
  'fundconfigs',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .references(() => funds.id)
      .notNull(),
    version: integer('version').notNull().default(1),
    config: jsonb('config').notNull(), // Stores full fund configuration
    isDraft: boolean('is_draft').default(true),
    isPublished: boolean('is_published').default(false),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    fundVersionUnique: unique()['on'](table.fundId, table.version),
    fundVersionIdx: index('fundconfigs_fund_version_idx')['on'](table.fundId, table.version),
  })
);

// ============================================================================
// CALC RUNS TABLE (Phase 2A Item 6)
// ============================================================================

// Tracks dispatch lifecycle for calculation engine runs.
// Deterministic BullMQ jobIds (run:<runId>:<engine>) provide idempotent dispatch.
export type DispatchState = 'pending' | 'dispatched' | 'partial' | 'failed';

export const calcRuns = pgTable(
  'calc_runs',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .references(() => funds.id)
      .notNull(),
    configId: integer('config_id')
      .references(() => fundConfigs.id)
      .notNull(),
    configVersion: integer('config_version').notNull(),
    correlationId: varchar('correlation_id', { length: 36 }).notNull().unique(),
    engines: jsonb('engines').notNull().$type<string[]>(), // ['reserve', 'pacing', 'cohort']
    dispatchState: varchar('dispatch_state', { length: 20 }).notNull().$type<DispatchState>(),
    requestedAt: timestamp('requested_at').notNull(),
    dispatchedAt: timestamp('dispatched_at'),
    completedAt: timestamp('completed_at'),
    failedAt: timestamp('failed_at'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    fundIdIdx: index('calc_runs_fund_id_idx')['on'](table.fundId),
    configIdIdx: index('calc_runs_config_id_idx')['on'](table.configId),
  })
);

// ============================================================================
// FUND SNAPSHOTS TABLE
// ============================================================================

// Fund snapshots for CQRS pattern
// Phase 2A Item 8: runId/configId/configVersion nullable for attribution
export const fundSnapshots = pgTable(
  'fund_snapshots',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .references(() => funds.id)
      .notNull(),
    type: varchar('type', { length: 50 }).notNull(), // 'RESERVE', 'PACING', 'COHORT'
    payload: jsonb('payload').notNull(), // Calculation results
    calcVersion: varchar('calc_version', { length: 20 }).notNull(),
    correlationId: varchar('correlation_id', { length: 36 }).notNull(),
    metadata: jsonb('metadata'), // Additional calculation metadata
    snapshotTime: timestamp('snapshot_time').notNull(),
    eventCount: integer('event_count').default(0),
    stateHash: varchar('state_hash', { length: 64 }),
    state: jsonb('state'), // Snapshot state data
    // Phase 2A Item 8: snapshot attribution (nullable for legacy rows).
    // FKs restored 2026-07-02 (ADR-023, D1 lane B): journal 0002 and prod both
    // carry them validated; the shape omission was drift, not design.
    runId: integer('run_id').references(() => calcRuns.id),
    configId: integer('config_id').references(() => fundConfigs.id),
    configVersion: integer('config_version'),
    scenarioSetId: uuid('scenario_set_id'),
    h9MoicSourceInputHash: text('h9_moic_source_input_hash'),
    h9RoundEvidenceInputHash: text('h9_round_evidence_input_hash'),
    h9RoundEvidenceAssumptionsHash: text('h9_round_evidence_assumptions_hash'),
    h9FingerprintHash: text('h9_fingerprint_hash'),
    h9PolicyVersion: text('h9_policy_version'),
    h9ActionabilityStatus: varchar('h9_actionability_status', {
      length: 24,
    }).$type<FinancialActionability>(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    lookupIdx: index('fund_snapshots_lookup_idx')['on'](
      table.fundId,
      table.type,
      table.createdAt.desc()
    ),
    scenarioDedupeIdx: uniqueIndex('fund_snapshots_scenarios_dedup_idx').on(
      table.fundId,
      table.scenarioSetId,
      table.configId,
      table.configVersion,
      table.stateHash
    ).where(sql`
        ${table.type} = 'SCENARIOS'
        AND ${table.scenarioSetId} IS NOT NULL
        AND ${table.configId} IS NOT NULL
        AND ${table.configVersion} IS NOT NULL
        AND ${table.stateHash} IS NOT NULL
      `),
    h9ActionabilityStatusCheck: check(
      'fund_snapshots_h9_actionability_status_check',
      sql`${table.h9ActionabilityStatus} IS NULL OR ${table.h9ActionabilityStatus} IN (${h9FinancialActionabilityValuesSql})`
    ),
    h9ActionableFingerprintCheck: check(
      'fund_snapshots_h9_actionable_fingerprint_check',
      sql`
        ${table.h9ActionabilityStatus} IS NULL
        OR ${table.h9ActionabilityStatus} <> 'actionable'
        OR (
          ${table.h9MoicSourceInputHash} IS NOT NULL
          AND ${table.h9RoundEvidenceInputHash} IS NOT NULL
          AND ${table.h9RoundEvidenceAssumptionsHash} IS NOT NULL
          AND ${table.h9FingerprintHash} IS NOT NULL
          AND ${table.h9PolicyVersion} IS NOT NULL
        )
      `
    ),
  })
);

// ============================================================================
// FUND SCENARIO SETS TABLES (ADR-022)
// ============================================================================

export const fundScenarioSets = pgTable(
  'fund_scenario_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    sourceConfigId: integer('source_config_id')
      .notNull()
      .references(() => fundConfigs.id),
    sourceConfigVersion: integer('source_config_version').notNull(),
    createdByUserId: integer('created_by_user_id').references(() => users.id),
    createdByLabel: text('created_by_label'),
    updatedByUserId: integer('updated_by_user_id').references(() => users.id),
    updatedByLabel: text('updated_by_label'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedByUserId: integer('archived_by_user_id').references(() => users.id),
    archivedByLabel: text('archived_by_label'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    idempotencyRequestHash: text('idempotency_request_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    fundActiveUpdatedIdx: index('fund_scenario_sets_fund_active_updated_idx')
      .on(table.fundId, table.updatedAt.desc(), table.id.desc())
      .where(sql`${table.archivedAt} IS NULL`),
    fundNameActiveUniqueIdx: uniqueIndex('fund_scenario_sets_fund_name_active_unique')
      .on(table.fundId, sql`lower(${table.name})`)
      .where(sql`${table.archivedAt} IS NULL`),
    fundIdempotencyUniqueIdx: uniqueIndex('fund_scenario_sets_fund_idempotency_unique')
      .on(table.fundId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  })
);

export const fundScenarioVariants = pgTable(
  'fund_scenario_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scenarioSetId: uuid('scenario_set_id')
      .notNull()
      .references(() => fundScenarioSets.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    overrideType: varchar('override_type', { length: 32 })
      .notNull()
      .$type<'fee_profile' | 'reserve_allocation' | 'allocation' | 'sector_profile'>(),
    overridePayload: jsonb('override_payload').notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    setOrderUnique: unique('fund_scenario_variants_set_order_unique').on(
      table.scenarioSetId,
      table.sortOrder
    ),
    setOrderIdx: index('fund_scenario_variants_set_order_idx').on(
      table.scenarioSetId,
      table.sortOrder,
      table.id
    ),
  })
);

export const fundScenarioSetEvents = pgTable(
  'fund_scenario_set_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scenarioSetId: uuid('scenario_set_id')
      .notNull()
      .references(() => fundScenarioSets.id, { onDelete: 'cascade' }),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 32 }).notNull(),
    actorUserId: integer('actor_user_id').references(() => users.id),
    actorLabel: text('actor_label'),
    changeSummary: jsonb('change_summary_json').notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    scenarioCreatedIdx: index('fund_scenario_set_events_scenario_created_idx').on(
      table.scenarioSetId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    fundCreatedIdx: index('fund_scenario_set_events_fund_created_idx').on(
      table.fundId,
      table.createdAt.desc(),
      table.id.desc()
    ),
  })
);

export const fundScenarioCalculationRuns = pgTable(
  'fund_scenario_calculation_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    scenarioSetId: uuid('scenario_set_id')
      .notNull()
      .references(() => fundScenarioSets.id, { onDelete: 'cascade' }),
    sourceConfigId: integer('source_config_id')
      .notNull()
      .references(() => fundConfigs.id),
    sourceConfigVersion: integer('source_config_version').notNull(),
    calculationMode: varchar('calculation_mode', { length: 48 }).notNull(),
    overrideType: varchar('override_type', { length: 48 }).notNull(),
    inputHash: varchar('input_hash', { length: 64 }).notNull(),
    jobId: text('job_id'),
    correlationId: varchar('correlation_id', { length: 36 }).notNull(),
    status: varchar('status', { length: 24 }).notNull(),
    snapshotId: integer('snapshot_id').references(() => fundSnapshots.id),
    failureCode: varchar('failure_code', { length: 80 }),
    failureMessage: text('failure_message'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    runLookupIdx: index('fund_scenario_calc_runs_lookup_idx').on(
      table.fundId,
      table.scenarioSetId,
      table.createdAt.desc()
    ),
    activeDedupeIdx: uniqueIndex('fund_scenario_calc_runs_active_dedup_idx')
      .on(table.scenarioSetId, table.sourceConfigId, table.sourceConfigVersion, table.inputHash)
      .where(sql`${table.status} IN ('queued', 'running', 'completed')`),
    statusCheck: check(
      'fund_scenario_calculation_runs_status_check',
      sql`${table.status} IN ('queued', 'running', 'completed', 'failed', 'cancelled')`
    ),
  })
);

// ============================================================================
// TYPES (Insert schemas with .omit() rules are defined in schema.ts)
// ============================================================================

export type Fund = typeof funds.$inferSelect;
export type NewFund = typeof funds.$inferInsert;
export type FundConfig = typeof fundConfigs.$inferSelect;
export type NewFundConfig = typeof fundConfigs.$inferInsert;
export type FundSnapshot = typeof fundSnapshots.$inferSelect;
export type NewFundSnapshot = typeof fundSnapshots.$inferInsert;
export type CalcRun = typeof calcRuns.$inferSelect;
export type NewCalcRun = typeof calcRuns.$inferInsert;
export type FundScenarioSet = typeof fundScenarioSets.$inferSelect;
export type NewFundScenarioSet = typeof fundScenarioSets.$inferInsert;
export type FundScenarioVariant = typeof fundScenarioVariants.$inferSelect;
export type NewFundScenarioVariant = typeof fundScenarioVariants.$inferInsert;
export type FundScenarioSetEvent = typeof fundScenarioSetEvents.$inferSelect;
export type NewFundScenarioSetEvent = typeof fundScenarioSetEvents.$inferInsert;
export type FundScenarioCalculationRun = typeof fundScenarioCalculationRuns.$inferSelect;
export type NewFundScenarioCalculationRun = typeof fundScenarioCalculationRuns.$inferInsert;
