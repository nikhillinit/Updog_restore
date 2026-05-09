/**
 * LP Reporting & Evidence Pack -- Foundation Schema
 *
 * Drizzle bindings for the 8 tables created in
 * server/migrations/20260508_lp_reporting_foundation_v1.up.sql:
 *   - vehicles
 *   - cash_flow_events
 *   - valuation_marks
 *   - lp_metric_runs
 *   - narrative_runs
 *   - evidence_records
 *   - lp_vehicle_participation
 *   - lp_vehicle_participation_history
 *
 * Money columns are NUMERIC(20,6) per ADR-011
 * (docs/adr/ADR-011-decimal-string-api-convention.md). Use the
 * exported `$inferSelect` / `$inferInsert` types throughout services
 * and contracts; never declare `amount: number` in any consumer of
 * these tables.
 *
 * Evidence target uses TYPED nullable foreign keys with a
 * num_nonnulls(...) = 1 CHECK constraint (no polymorphic
 * target_type/target_id) per design §4.5.
 *
 * @module shared/schema/lp-reporting-evidence
 * @see docs/adr/ADR-010-xirr-day-count-and-bounds.md
 * @see docs/adr/ADR-011-decimal-string-api-convention.md
 */

import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
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

import { funds } from './fund';
import { portfolioCompanies } from './portfolio';
import { users } from './user';
import { limitedPartners } from '../schema-lp-reporting';

// ============================================================================
// VEHICLES
// ============================================================================

export const vehicles = pgTable(
  'vehicles',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    vehicleSlug: varchar('vehicle_slug', { length: 64 }).notNull(),
    vehicleType: varchar('vehicle_type', { length: 16 }).notNull(),
    name: varchar('name', { length: 128 }).notNull(),
    description: text('description'),
    committedCapital: decimal('committed_capital', { precision: 20, scale: 6 }),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    inceptionDate: date('inception_date'),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    spvEconomics: jsonb('spv_economics')
      .notNull()
      .default(sql`'{}'::jsonb`),
    adminBurdenScore: integer('admin_burden_score'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    fundSlugUnique: unique('vehicles_fund_slug_unique').on(table.fundId, table.vehicleSlug),
    typeCheck: check(
      'vehicles_type_check',
      sql`${table.vehicleType} IN ('main_fund', 'spv', 'co_invest')`
    ),
    statusCheck: check(
      'vehicles_status_check',
      sql`${table.status} IN ('active', 'winding_down', 'closed')`
    ),
    adminScoreCheck: check(
      'vehicles_admin_score_check',
      sql`${table.adminBurdenScore} IS NULL OR (${table.adminBurdenScore} >= 0 AND ${table.adminBurdenScore} <= 100)`
    ),
    fundTypeIdx: index('idx_vehicles_fund_type').on(table.fundId, table.vehicleType),
  })
);

export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = typeof vehicles.$inferInsert;

// ============================================================================
// CASH FLOW EVENTS
// ============================================================================

export const cashFlowEvents = pgTable(
  'cash_flow_events',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    vehicleId: integer('vehicle_id').references(() => vehicles.id, { onDelete: 'restrict' }),
    companyId: integer('company_id').references(() => portfolioCompanies.id, {
      onDelete: 'set null',
    }),
    lpId: integer('lp_id').references(() => limitedPartners.id, { onDelete: 'set null' }),

    eventType: varchar('event_type', { length: 32 }).notNull(),
    amount: decimal('amount', { precision: 20, scale: 6 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    eventDate: timestamp('event_date', { withTimezone: true }).notNull(),
    perspective: varchar('perspective', { length: 16 }).notNull(),
    description: text('description'),
    payload: jsonb('payload')
      .notNull()
      .default(sql`'{}'::jsonb`),

    status: varchar('status', { length: 16 }).notNull().default('draft'),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: integer('locked_by').references(() => users.id),
    supersedesEventId: integer('supersedes_event_id').references(
      (): AnyPgColumn => cashFlowEvents.id
    ),
    reversalOfEventId: integer('reversal_of_event_id').references(
      (): AnyPgColumn => cashFlowEvents.id
    ),

    importedFrom: varchar('imported_from', { length: 32 }),
    importBatchId: uuid('import_batch_id'),
    sourceHash: varchar('source_hash', { length: 128 }),

    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    eventTypeCheck: check(
      'cash_flow_event_type_check',
      sql`${table.eventType} IN ('lp_capital_call', 'lp_distribution', 'fund_expense', 'portfolio_investment', 'realized_proceeds', 'recallable_distribution', 'reversal')`
    ),
    perspectiveCheck: check(
      'cash_flow_perspective_check',
      sql`${table.perspective} IN ('lp_net', 'fund_gross', 'vehicle', 'company')`
    ),
    statusCheck: check(
      'cash_flow_status_check',
      sql`${table.status} IN ('draft', 'approved', 'locked', 'reversed')`
    ),
    lockedNotMutable: check(
      'cash_flow_locked_not_mutable',
      sql`${table.status} <> 'locked' OR ${table.lockedAt} IS NOT NULL`
    ),
    fundDateIdx: index('idx_cash_flow_fund_date').on(table.fundId, table.eventDate.desc()),
    vehicleDateIdx: index('idx_cash_flow_vehicle_date').on(table.vehicleId, table.eventDate.desc()),
    companyDateIdx: index('idx_cash_flow_company_date').on(table.companyId, table.eventDate.desc()),
    eventTypeIdx: index('idx_cash_flow_event_type').on(table.eventType, table.eventDate.desc()),
    importBatchIdx: index('idx_cash_flow_import_batch').on(table.importBatchId),
    sourceHashUniqueIdx: uniqueIndex('cash_flow_events_fund_source_hash_unique')
      .on(table.fundId, table.sourceHash)
      .where(sql`${table.sourceHash} IS NOT NULL`),
  })
);

export type CashFlowEvent = typeof cashFlowEvents.$inferSelect;
export type InsertCashFlowEvent = typeof cashFlowEvents.$inferInsert;

// ============================================================================
// VALUATION MARKS
// ============================================================================

export const valuationMarks = pgTable(
  'valuation_marks',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    vehicleId: integer('vehicle_id').references(() => vehicles.id, { onDelete: 'restrict' }),
    companyId: integer('company_id')
      .notNull()
      .references(() => portfolioCompanies.id, { onDelete: 'cascade' }),

    markDate: date('mark_date').notNull(),
    asOfDate: date('as_of_date').notNull(),
    fairValue: decimal('fair_value', { precision: 20, scale: 6 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    costBasis: decimal('cost_basis', { precision: 20, scale: 6 }),

    markSource: varchar('mark_source', { length: 64 }).notNull(),
    confidenceLevel: varchar('confidence_level', { length: 16 }).notNull(),
    valuationMethod: varchar('valuation_method', { length: 64 }).notNull(),
    methodologyNotes: text('methodology_notes'),

    status: varchar('status', { length: 16 }).notNull().default('draft'),
    priorMarkId: integer('prior_mark_id').references((): AnyPgColumn => valuationMarks.id),
    approvedBy: integer('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),

    importedFrom: varchar('imported_from', { length: 32 }),
    importBatchId: uuid('import_batch_id'),
    sourceHash: varchar('source_hash', { length: 128 }),

    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    markSourceCheck: check(
      'valuation_mark_source_check',
      sql`${table.markSource} IN ('financing_round', 'signed_loi', 'revenue_milestone', 'strategic_partnership', 'audited_financials', 'board_update', 'gp_estimate', 'third_party_priced', 'secondary_transaction', 'impairment')`
    ),
    confidenceCheck: check(
      'valuation_confidence_check',
      sql`${table.confidenceLevel} IN ('high', 'medium', 'low')`
    ),
    statusCheck: check(
      'valuation_status_check',
      sql`${table.status} IN ('draft', 'approved', 'locked', 'superseded')`
    ),
    fundAsofIdx: index('idx_valuation_marks_fund_asof').on(table.fundId, table.asOfDate.desc()),
    companyAsofIdx: index('idx_valuation_marks_company_asof').on(
      table.companyId,
      table.asOfDate.desc()
    ),
    vehicleAsofIdx: index('idx_valuation_marks_vehicle_asof').on(
      table.vehicleId,
      table.asOfDate.desc()
    ),
    importBatchIdx: index('idx_valuation_marks_import_batch').on(table.importBatchId),
    sourceHashUniqueIdx: uniqueIndex('valuation_marks_fund_source_hash_unique')
      .on(table.fundId, table.sourceHash)
      .where(sql`${table.sourceHash} IS NOT NULL`),
  })
);

export type ValuationMark = typeof valuationMarks.$inferSelect;
export type InsertValuationMark = typeof valuationMarks.$inferInsert;

// ============================================================================
// LP METRIC RUNS
// ============================================================================

export const lpMetricRuns = pgTable(
  'lp_metric_runs',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    vehicleId: integer('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),

    asOfDate: date('as_of_date').notNull(),
    runType: varchar('run_type', { length: 32 }).notNull(),
    perspective: varchar('perspective', { length: 16 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('draft'),

    inputsHash: varchar('inputs_hash', { length: 128 }).notNull(),
    sourceEventIds: jsonb('source_event_ids')
      .notNull()
      .default(sql`'[]'::jsonb`),
    sourceMarkIds: jsonb('source_mark_ids')
      .notNull()
      .default(sql`'[]'::jsonb`),
    sourceEvidenceIds: jsonb('source_evidence_ids')
      .notNull()
      .default(sql`'[]'::jsonb`),

    resultsJson: jsonb('results_json').notNull(),
    diagnosticsJson: jsonb('diagnostics_json')
      .notNull()
      .default(sql`'{}'::jsonb`),
    methodologyVersion: varchar('methodology_version', { length: 64 }).notNull(),
    calculationVersion: varchar('calculation_version', { length: 64 }).notNull(),

    generatedBy: integer('generated_by').references(() => users.id),
    approvedBy: integer('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    exportedAt: timestamp('exported_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    runTypeCheck: check(
      'lp_metric_run_type_check',
      sql`${table.runType} IN ('quarterly_report', 'fundraise_pack', 'internal_review', 'lp_update')`
    ),
    perspectiveCheck: check(
      'lp_metric_run_perspective_check',
      sql`${table.perspective} IN ('lp_net', 'fund_gross', 'vehicle')`
    ),
    statusCheck: check(
      'lp_metric_run_status_check',
      sql`${table.status} IN ('draft', 'approved', 'locked', 'exported', 'superseded')`
    ),
    fundAsofIdx: index('idx_lp_metric_runs_fund_asof').on(table.fundId, table.asOfDate.desc()),
    vehicleAsofIdx: index('idx_lp_metric_runs_vehicle_asof').on(
      table.vehicleId,
      table.asOfDate.desc()
    ),
    statusIdx: index('idx_lp_metric_runs_status').on(table.status),
  })
);

export type LpMetricRun = typeof lpMetricRuns.$inferSelect;
export type InsertLpMetricRun = typeof lpMetricRuns.$inferInsert;

// ============================================================================
// NARRATIVE RUNS
// ============================================================================

export const narrativeRuns = pgTable(
  'narrative_runs',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    metricRunId: integer('metric_run_id')
      .notNull()
      .references(() => lpMetricRuns.id, { onDelete: 'cascade' }),
    asOfDate: date('as_of_date').notNull(),

    narrativeType: varchar('narrative_type', { length: 32 }).notNull(),
    generatedText: text('generated_text').notNull(),
    editedText: text('edited_text'),
    status: varchar('status', { length: 32 }).notNull().default('draft'),

    generatedBy: integer('generated_by').references(() => users.id),
    editedBy: integer('edited_by').references(() => users.id),
    approvedBy: integer('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    exportedAt: timestamp('exported_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    typeCheck: check(
      'narrative_type_check',
      sql`${table.narrativeType} IN ('no_dpi', 'methodology', 'portfolio_update', 'risk_disclosure')`
    ),
    statusCheck: check(
      'narrative_status_check',
      sql`${table.status} IN ('draft', 'reviewed', 'approved', 'exported')`
    ),
    metricRunIdx: index('idx_narrative_runs_metric_run').on(table.metricRunId),
  })
);

export type NarrativeRun = typeof narrativeRuns.$inferSelect;
export type InsertNarrativeRun = typeof narrativeRuns.$inferInsert;

// ============================================================================
// EVIDENCE RECORDS (typed FKs with num_nonnulls = 1)
// ============================================================================

export const evidenceRecords = pgTable(
  'evidence_records',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),

    valuationMarkId: integer('valuation_mark_id').references(() => valuationMarks.id, {
      onDelete: 'cascade',
    }),
    companyId: integer('company_id').references(() => portfolioCompanies.id, {
      onDelete: 'cascade',
    }),
    metricRunId: integer('metric_run_id').references(() => lpMetricRuns.id, {
      onDelete: 'cascade',
    }),
    narrativeRunId: integer('narrative_run_id').references(() => narrativeRuns.id, {
      onDelete: 'cascade',
    }),

    evidenceSource: varchar('evidence_source', { length: 64 }).notNull(),
    sourceDate: date('source_date').notNull(),
    receivedDate: date('received_date'),
    expirationDate: date('expiration_date'),
    confidenceLevel: varchar('confidence_level', { length: 16 }).notNull().default('medium'),
    materialityLevel: varchar('materiality_level', { length: 16 }).notNull().default('medium'),

    confidentiality: varchar('confidentiality', { length: 24 }).notNull().default('internal'),
    redactionRequired: boolean('redaction_required').notNull().default(false),
    documentHash: varchar('document_hash', { length: 128 }),
    valuationPolicyVersion: varchar('valuation_policy_version', { length: 64 }),

    description: text('description'),
    internalNotes: text('internal_notes'),
    lpObjection: text('lp_objection'),
    attachments: jsonb('attachments')
      .notNull()
      .default(sql`'[]'::jsonb`),

    uploadedBy: integer('uploaded_by').references(() => users.id),
    approvedBy: integer('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    oneTargetCheck: check(
      'evidence_one_target_check',
      sql`num_nonnulls(${table.valuationMarkId}, ${table.companyId}, ${table.metricRunId}, ${table.narrativeRunId}) = 1`
    ),
    sourceCheck: check(
      'evidence_source_check',
      sql`${table.evidenceSource} IN ('financing_round', 'signed_loi', 'revenue_milestone', 'strategic_partnership', 'audited_financials', 'board_update', 'gp_estimate', 'third_party_priced', 'secondary_transaction', 'customer_contract', 'management_report', 'auditor_confirmation')`
    ),
    confidenceCheck: check(
      'evidence_confidence_check',
      sql`${table.confidenceLevel} IN ('high', 'medium', 'low')`
    ),
    materialityCheck: check(
      'evidence_materiality_check',
      sql`${table.materialityLevel} IN ('high', 'medium', 'low')`
    ),
    confidentialityCheck: check(
      'evidence_confidentiality_check',
      sql`${table.confidentiality} IN ('internal', 'lp_shareable', 'restricted')`
    ),
    fundIdx: index('idx_evidence_fund').on(table.fundId),
    valuationMarkIdx: index('idx_evidence_valuation_mark').on(table.valuationMarkId),
    companyIdx: index('idx_evidence_company').on(table.companyId),
    metricRunIdx: index('idx_evidence_metric_run').on(table.metricRunId),
    narrativeRunIdx: index('idx_evidence_narrative_run').on(table.narrativeRunId),
    expirationIdx: index('idx_evidence_expiration_date').on(table.expirationDate),
    confidenceIdx: index('idx_evidence_confidence').on(table.confidenceLevel),
    confidentialityIdx: index('idx_evidence_confidentiality').on(table.confidentiality),
  })
);

export type EvidenceRecord = typeof evidenceRecords.$inferSelect;
export type InsertEvidenceRecord = typeof evidenceRecords.$inferInsert;

// ============================================================================
// LP VEHICLE PARTICIPATION
// ============================================================================

export const lpVehicleParticipation = pgTable(
  'lp_vehicle_participation',
  {
    id: serial('id').primaryKey(),
    lpId: integer('lp_id')
      .notNull()
      .references(() => limitedPartners.id, { onDelete: 'cascade' }),
    vehicleId: integer('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    commitmentAmount: decimal('commitment_amount', { precision: 20, scale: 6 })
      .notNull()
      .default('0'),
    status: varchar('status', { length: 32 }).notNull().default('exploratory'),
    followOnInterest: boolean('follow_on_interest').default(false),
    conversionProbability: decimal('conversion_probability', { precision: 5, scale: 4 }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    lpVehicleUnique: unique('lp_participation_lp_vehicle_unique').on(table.lpId, table.vehicleId),
    vehicleIdx: index('idx_lp_vehicle_participation_vehicle').on(table.vehicleId),
    statusCheck: check(
      'lp_participation_status_check',
      sql`${table.status} IN ('main_fund_aligned', 'spv_only', 'exploratory', 'high_conversion_prospect', 'low_conversion_prospect', 'committed_to_fund_ii', 'declined')`
    ),
  })
);

export type LpVehicleParticipation = typeof lpVehicleParticipation.$inferSelect;
export type InsertLpVehicleParticipation = typeof lpVehicleParticipation.$inferInsert;

// ============================================================================
// LP VEHICLE PARTICIPATION HISTORY
// ============================================================================

export const lpVehicleParticipationHistory = pgTable(
  'lp_vehicle_participation_history',
  {
    id: serial('id').primaryKey(),
    lpVehicleParticipationId: integer('lp_vehicle_participation_id')
      .notNull()
      .references(() => lpVehicleParticipation.id, { onDelete: 'cascade' }),
    fromStatus: varchar('from_status', { length: 32 }),
    toStatus: varchar('to_status', { length: 32 }).notNull(),
    changedBy: integer('changed_by').references(() => users.id),
    changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow(),
    reason: text('reason'),
  },
  (table) => ({
    participationChangedIdx: index('idx_lp_vehicle_participation_history_parent_changed_at').on(
      table.lpVehicleParticipationId,
      table.changedAt.desc()
    ),
  })
);

export type LpVehicleParticipationHistory = typeof lpVehicleParticipationHistory.$inferSelect;
export type InsertLpVehicleParticipationHistory = typeof lpVehicleParticipationHistory.$inferInsert;
