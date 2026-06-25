import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
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

import { funds } from './fund';
import { reconciliationRuns } from './reconciliation-runs';
import { users } from './user';
import {
  FinancialActionabilitySchema,
  type FinancialActionability,
} from '../contracts/financial-provenance.contract';

const h9FinancialActionabilityValuesSql = sql.raw(
  FinancialActionabilitySchema.options.map((value) => `'${value}'`).join(', ')
);

export const fundCalculationModes = pgTable(
  'fund_calculation_modes',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    calculationKey: text('calculation_key').notNull(),
    configuredMode: varchar('configured_mode', { length: 16 }).notNull().default('off'),
    killSwitchActive: boolean('kill_switch_active').notNull().default(false),
    shadowStartedAt: timestamp('shadow_started_at', { withTimezone: true }),
    lastReconciliationRunId: integer('last_reconciliation_run_id').references(
      () => reconciliationRuns.id
    ),
    lastMoicSourceInputHash: text('last_moic_source_input_hash'),
    lastCandidateOutputHash: text('last_candidate_output_hash'),
    h9MoicSourceInputHash: text('h9_moic_source_input_hash'),
    h9RoundEvidenceInputHash: text('h9_round_evidence_input_hash'),
    h9RoundEvidenceAssumptionsHash: text('h9_round_evidence_assumptions_hash'),
    h9FingerprintHash: text('h9_fingerprint_hash'),
    h9PolicyVersion: text('h9_policy_version'),
    h9ActionabilityStatus: varchar('h9_actionability_status', {
      length: 24,
    }).$type<FinancialActionability>(),
    version: integer('version').notNull().default(1),
    updatedBy: integer('updated_by').references(() => users.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundCalculationUnique: unique('fund_calculation_modes_fund_calculation_key_unique').on(
      table.fundId,
      table.calculationKey
    ),
    fundUpdatedIdx: index('idx_fund_calculation_modes_fund_updated').on(
      table.fundId,
      table.updatedAt.desc()
    ),
    configuredModeCheck: check(
      'fund_calculation_modes_configured_mode_check',
      sql`${table.configuredMode} IN ('off','shadow','on')`
    ),
    h9ActionabilityStatusCheck: check(
      'fund_calculation_modes_h9_actionability_status_check',
      sql`${table.h9ActionabilityStatus} IS NULL OR ${table.h9ActionabilityStatus} IN (${h9FinancialActionabilityValuesSql})`
    ),
    h9ActionableFingerprintCheck: check(
      'fund_calculation_modes_h9_actionable_fingerprint_check',
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
    versionCheck: check('fund_calculation_modes_version_check', sql`${table.version} >= 1`),
  })
);

export const fundCalculationModeRequests = pgTable(
  'fund_calculation_mode_requests',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    calculationKey: text('calculation_key').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
  },
  (table) => ({
    requestUnique: unique('fund_calculation_mode_requests_scope_unique').on(
      table.fundId,
      table.calculationKey,
      table.idempotencyKey
    ),
    fundCreatedIdx: index('idx_fund_calculation_mode_requests_fund_created').on(
      table.fundId,
      table.createdAt.desc()
    ),
    statusCheck: check(
      'fund_calculation_mode_requests_status_check',
      sql`${table.status} IN ('pending','completed')`
    ),
  })
);

export type FundCalculationMode = typeof fundCalculationModes.$inferSelect;
export type InsertFundCalculationMode = typeof fundCalculationModes.$inferInsert;
export type FundCalculationModeRequest = typeof fundCalculationModeRequests.$inferSelect;
export type InsertFundCalculationModeRequest = typeof fundCalculationModeRequests.$inferInsert;
