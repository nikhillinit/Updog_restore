/**
 * Fund-related database schemas
 *
 * Contains: funds, fundConfigs, fundSnapshots
 * Note: fundEvents remains in schema.ts due to users dependency
 * Note: Insert schemas with .omit() rules are in schema.ts to prevent duplicate definitions
 *
 * @module shared/schema/fund
 */
import {
  boolean,
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
  varchar,
} from 'drizzle-orm/pg-core';
import type { EngineResults } from '../schemas/engine-results-schema';

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
    // Phase 2A Item 8: snapshot attribution (nullable for legacy rows)
    runId: integer('run_id'),
    configId: integer('config_id'),
    configVersion: integer('config_version'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    lookupIdx: index('fund_snapshots_lookup_idx')['on'](
      table.fundId,
      table.type,
      table.createdAt.desc()
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
