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
import {
  FinancialActionabilitySchema,
  type FinancialActionability,
} from '../contracts/financial-provenance.contract';

const h9FinancialActionabilityValuesSql = sql.raw(
  FinancialActionabilitySchema.options.map((value) => `'${value}'`).join(', ')
);

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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
    planningActiveIdx: index('idx_valuation_marks_planning_active_mark_date')
      .on(table.fundId, table.companyId, table.markDate.desc(), table.id.desc())
      .where(
        sql`${table.importedFrom} = 'planning_fmv_override' AND ${table.status} IN ('approved', 'locked')`
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
// PLANNING FMV OVERRIDE REQUESTS
// ============================================================================

export const planningFmvOverrideRequests = pgTable(
  'planning_fmv_override_requests',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    companyId: integer('company_id')
      .notNull()
      .references(() => portfolioCompanies.id, { onDelete: 'cascade' }),
    valuationMarkId: integer('valuation_mark_id').references(() => valuationMarks.id, {
      onDelete: 'restrict',
    }),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    sourceHash: varchar('source_hash', { length: 128 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    responseBody: jsonb('response_body'),
    failureCode: varchar('failure_code', { length: 64 }),
    failureMessage: text('failure_message'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusCheck: check(
      'planning_fmv_override_request_status_check',
      sql`${table.status} IN ('pending', 'completed', 'failed')`
    ),
    idempotencyUnique: unique('planning_fmv_override_requests_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    fundCompanyCreatedIdx: index('idx_planning_fmv_override_requests_fund_company_created').on(
      table.fundId,
      table.companyId,
      table.createdAt.desc()
    ),
    valuationMarkIdx: index('idx_planning_fmv_override_requests_valuation_mark').on(
      table.valuationMarkId
    ),
  })
);

export type PlanningFmvOverrideRequest = typeof planningFmvOverrideRequests.$inferSelect;
export type InsertPlanningFmvOverrideRequest = typeof planningFmvOverrideRequests.$inferInsert;

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
    lockedBy: integer('locked_by').references(() => users.id),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    exportedAt: timestamp('exported_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
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
    runInputsUniqueIdx: uniqueIndex('lp_metric_runs_fund_run_inputs_unique').on(
      table.fundId,
      table.runType,
      table.perspective,
      table.asOfDate,
      table.inputsHash
    ),
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
    reviewedBy: integer('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    approvedBy: integer('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    exportedAt: timestamp('exported_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
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
    metricRunTypeUniqueIdx: uniqueIndex('narrative_runs_metric_run_type_unique').on(
      table.metricRunId,
      table.narrativeType
    ),
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
    idempotencyKey: varchar('idempotency_key', { length: 128 }),

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
    metricRunIdempotencyUniqueIdx: uniqueIndex('evidence_records_metric_run_idempotency_unique')
      .on(table.fundId, table.metricRunId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    narrativeRunIdx: index('idx_evidence_narrative_run').on(table.narrativeRunId),
    expirationIdx: index('idx_evidence_expiration_date').on(table.expirationDate),
    confidenceIdx: index('idx_evidence_confidence').on(table.confidenceLevel),
    confidentialityIdx: index('idx_evidence_confidentiality').on(table.confidentiality),
  })
);

export type EvidenceRecord = typeof evidenceRecords.$inferSelect;
export type InsertEvidenceRecord = typeof evidenceRecords.$inferInsert;

// ============================================================================
// LP REPORT PACKAGES
// ============================================================================

export const lpReportPackages = pgTable(
  'lp_report_packages',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    metricRunId: integer('metric_run_id')
      .notNull()
      .references(() => lpMetricRuns.id, { onDelete: 'cascade' }),

    status: varchar('status', { length: 32 }).notNull().default('assembled'),
    asOfDate: date('as_of_date').notNull(),
    metricRunVersion: integer('metric_run_version').notNull(),
    metricRunLockedBy: integer('metric_run_locked_by').references(() => users.id),
    metricRunLockedAt: timestamp('metric_run_locked_at', { withTimezone: true }),

    narrativeRefs: jsonb('narrative_refs')
      .notNull()
      .default(sql`'[]'::jsonb`),
    payload: jsonb('payload')
      .notNull()
      .default(sql`'{}'::jsonb`),

    assembledBy: integer('assembled_by')
      .notNull()
      .references(() => users.id),
    assembledAt: timestamp('assembled_at', { withTimezone: true }).notNull().defaultNow(),
    h9MoicSourceInputHash: text('h9_moic_source_input_hash'),
    h9RoundEvidenceInputHash: text('h9_round_evidence_input_hash'),
    h9RoundEvidenceAssumptionsHash: text('h9_round_evidence_assumptions_hash'),
    h9FingerprintHash: text('h9_fingerprint_hash'),
    h9PolicyVersion: text('h9_policy_version'),
    h9ActionabilityStatus: varchar('h9_actionability_status', {
      length: 24,
    }).$type<FinancialActionability>(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    statusCheck: check('lp_report_package_status_check', sql`${table.status} IN ('assembled')`),
    h9ActionabilityStatusCheck: check(
      'lp_report_packages_h9_actionability_status_check',
      sql`${table.h9ActionabilityStatus} IS NULL OR ${table.h9ActionabilityStatus} IN (${h9FinancialActionabilityValuesSql})`
    ),
    h9ActionableFingerprintCheck: check(
      'lp_report_packages_h9_actionable_fingerprint_check',
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
    metricRunUniqueIdx: uniqueIndex('lp_report_packages_metric_run_unique').on(table.metricRunId),
    fundMetricIdx: index('idx_lp_report_packages_fund_metric').on(table.fundId, table.metricRunId),
    assembledAtIdx: index('idx_lp_report_packages_fund_assembled_at').on(
      table.fundId,
      table.assembledAt.desc()
    ),
  })
);

export type LpReportPackage = typeof lpReportPackages.$inferSelect;
export type InsertLpReportPackage = typeof lpReportPackages.$inferInsert;

// ============================================================================
// LP REPORT PACKAGE EXPORTS
// ============================================================================

export const lpReportPackageExports = pgTable(
  'lp_report_package_exports',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    metricRunId: integer('metric_run_id')
      .notNull()
      .references(() => lpMetricRuns.id, { onDelete: 'cascade' }),
    reportPackageId: integer('report_package_id')
      .notNull()
      .references(() => lpReportPackages.id, { onDelete: 'cascade' }),

    format: varchar('format', { length: 16 }).notNull().default('json'),
    exportVersion: integer('export_version').notNull().default(1),
    status: varchar('status', { length: 32 }).notNull().default('ready'),
    contentHashAlgorithm: varchar('content_hash_algorithm', { length: 16 })
      .notNull()
      .default('sha256'),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    artifactPayload: jsonb('artifact_payload').notNull(),
    artifactSizeBytes: integer('artifact_size_bytes').notNull(),

    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    readyAt: timestamp('ready_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    formatCheck: check(
      'lp_report_package_export_format_check',
      sql`${table.format} IN ('json','csv')`
    ),
    versionCheck: check('lp_report_package_export_version_check', sql`${table.exportVersion} = 1`),
    statusCheck: check('lp_report_package_export_status_check', sql`${table.status} IN ('ready')`),
    hashAlgorithmCheck: check(
      'lp_report_package_export_hash_algorithm_check',
      sql`${table.contentHashAlgorithm} IN ('sha256')`
    ),
    hashCheck: check(
      'lp_report_package_export_hash_check',
      sql`${table.contentHash} ~ '^[a-f0-9]{64}$'`
    ),
    artifactSizeCheck: check(
      'lp_report_package_export_artifact_size_check',
      sql`${table.artifactSizeBytes} >= 0`
    ),
    reportPackageFormatVersionUniqueIdx: uniqueIndex(
      'lp_report_package_exports_package_format_version_unique'
    ).on(table.reportPackageId, table.format, table.exportVersion),
    fundMetricIdx: index('idx_lp_report_package_exports_fund_metric').on(
      table.fundId,
      table.metricRunId
    ),
    fundMetricPackageIdx: index('idx_lp_report_package_exports_fund_metric_package').on(
      table.fundId,
      table.metricRunId,
      table.reportPackageId
    ),
    fundReadyAtIdx: index('idx_lp_report_package_exports_fund_ready_at').on(
      table.fundId,
      table.readyAt.desc()
    ),
  })
);

export type LpReportPackageExport = typeof lpReportPackageExports.$inferSelect;
export type InsertLpReportPackageExport = typeof lpReportPackageExports.$inferInsert;

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
