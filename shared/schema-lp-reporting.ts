/**
 * LP Reporting Schema
 *
 * Database schema for Limited Partner reporting dashboard:
 * - Limited partner profiles
 * - Fund commitments
 * - Capital activities (calls, distributions)
 * - Capital account balances
 * - Performance snapshots
 * - Report generation
 *
 * @module shared/schema-lp-reporting
 */

import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
  check,
} from 'drizzle-orm/pg-core';
import { funds } from './schema';

// ============================================================================
// LIMITED PARTNERS
// ============================================================================

export const limitedPartners = pgTable(
  'limited_partners',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(), // 'individual', 'institution', 'fund_of_funds'
    taxId: varchar('tax_id', { length: 50 }), // ENCRYPTED: AES-256-GCM with field-encryption.ts
    address: text('address'),
    contactName: text('contact_name'),
    contactEmail: varchar('contact_email', { length: 255 }),
    contactPhone: varchar('contact_phone', { length: 50 }),
    version: bigint('version', { mode: 'bigint' }).notNull().default(sql`0`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    emailUniqueIdx: unique().on(table.email),
    entityTypeCheck: check(
      'limited_partners_entity_type_check',
      sql`${table.entityType} IN ('individual', 'institution', 'fund_of_funds')`
    ),
  })
);

export type LimitedPartner = typeof limitedPartners.$inferSelect;
export type InsertLimitedPartner = typeof limitedPartners.$inferInsert;

// ============================================================================
// LP FUND COMMITMENTS
// ============================================================================

export const lpFundCommitments = pgTable(
  'lp_fund_commitments',
  {
    id: serial('id').primaryKey(),
    lpId: integer('lp_id')
      .notNull()
      .references(() => limitedPartners.id, { onDelete: 'cascade' }),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    commitmentAmountCents: bigint('commitment_amount_cents', { mode: 'bigint' }).notNull(),
    commitmentDate: timestamp('commitment_date', { withTimezone: true }).notNull(),
    firstCallDate: timestamp('first_call_date', { withTimezone: true }),
    commitmentPercentage: decimal('commitment_percentage', { precision: 7, scale: 4 }), // % of total fund
    status: varchar('status', { length: 20 }).notNull().default('active'), // 'active', 'fulfilled', 'withdrawn'
    version: bigint('version', { mode: 'bigint' }).notNull().default(sql`0`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    lpFundUniqueIdx: unique().on(table.lpId, table.fundId),
    lpIdIdx: index('lp_fund_commitments_lp_id_idx').on(table.lpId),
    fundIdIdx: index('lp_fund_commitments_fund_id_idx').on(table.fundId),
    statusCheck: check(
      'lp_fund_commitments_status_check',
      sql`${table.status} IN ('active', 'fulfilled', 'withdrawn')`
    ),
  })
);

export type LPFundCommitment = typeof lpFundCommitments.$inferSelect;
export type InsertLPFundCommitment = typeof lpFundCommitments.$inferInsert;

// ============================================================================
// CAPITAL ACTIVITIES (Calls & Distributions)
// ============================================================================

export const capitalActivities = pgTable(
  'capital_activities',
  {
    id: serial('id').primaryKey(),
    commitmentId: integer('commitment_id')
      .notNull()
      .references(() => lpFundCommitments.id, { onDelete: 'cascade' }),
    activityType: varchar('activity_type', { length: 20 }).notNull(), // 'capital_call', 'distribution', 'recallable_distribution'
    amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
    activityDate: timestamp('activity_date', { withTimezone: true }).notNull(),
    effectiveDate: timestamp('effective_date', { withTimezone: true }).notNull(),
    description: text('description'),
    referenceNumber: varchar('reference_number', { length: 100 }),
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    fundId: integer('fund_id').references(() => funds.id), // Denormalized for query efficiency
    status: varchar('status', { length: 50 }).default('completed'), // 'pending', 'completed', 'cancelled'
    version: bigint('version', { mode: 'bigint' }).notNull().default(sql`0`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    commitmentIdIdx: index('capital_activities_commitment_id_idx').on(table.commitmentId),
    fundIdIdx: index('capital_activities_fund_id_idx').on(table.fundId),
    activityDateIdx: index('capital_activities_activity_date_idx').on(table.activityDate.desc()),
    idempotencyUniqueIdx: unique().on(table.idempotencyKey),
    cursorIdx: index('capital_activities_cursor_idx').on(
      table.commitmentId,
      table.activityDate.desc(),
      table.id.desc()
    ),
    activityTypeCheck: check(
      'capital_activities_activity_type_check',
      sql`${table.activityType} IN ('capital_call', 'distribution', 'recallable_distribution')`
    ),
  })
);

export type CapitalActivity = typeof capitalActivities.$inferSelect;
export type InsertCapitalActivity = typeof capitalActivities.$inferInsert;

// ============================================================================
// LP DISTRIBUTIONS (Distribution Details)
// ============================================================================

export const lpDistributions = pgTable(
  'lp_distributions',
  {
    id: serial('id').primaryKey(),
    activityId: integer('activity_id')
      .notNull()
      .references(() => capitalActivities.id, { onDelete: 'cascade' }),
    distributionType: varchar('distribution_type', { length: 30 }).notNull(), // 'income', 'capital_gain', 'return_of_capital'
    amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
    taxWithheldCents: bigint('tax_withheld_cents', { mode: 'bigint' }).default(sql`0`),
    netAmountCents: bigint('net_amount_cents', { mode: 'bigint' }).notNull(),
    version: bigint('version', { mode: 'bigint' }).notNull().default(sql`0`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    activityIdIdx: index('lp_distributions_activity_id_idx').on(table.activityId),
    distributionTypeCheck: check(
      'lp_distributions_distribution_type_check',
      sql`${table.distributionType} IN ('income', 'capital_gain', 'return_of_capital')`
    ),
  })
);

export type LPDistribution = typeof lpDistributions.$inferSelect;
export type InsertLPDistribution = typeof lpDistributions.$inferInsert;

// ============================================================================
// LP CAPITAL ACCOUNTS (Running Balances)
// ============================================================================

export const lpCapitalAccounts = pgTable(
  'lp_capital_accounts',
  {
    id: serial('id').primaryKey(),
    commitmentId: integer('commitment_id')
      .notNull()
      .references(() => lpFundCommitments.id, { onDelete: 'cascade' }),
    asOfDate: timestamp('as_of_date', { withTimezone: true }).notNull(),
    calledCapitalCents: bigint('called_capital_cents', { mode: 'bigint' }).notNull(),
    distributedCapitalCents: bigint('distributed_capital_cents', { mode: 'bigint' }).notNull(),
    navCents: bigint('nav_cents', { mode: 'bigint' }).notNull(), // Net Asset Value
    unfundedCommitmentCents: bigint('unfunded_commitment_cents', { mode: 'bigint' }).notNull(),
    version: bigint('version', { mode: 'bigint' }).notNull().default(sql`0`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    commitmentDateUniqueIdx: unique().on(table.commitmentId, table.asOfDate),
    commitmentIdIdx: index('lp_capital_accounts_commitment_id_idx').on(table.commitmentId),
    asOfDateIdx: index('lp_capital_accounts_as_of_date_idx').on(table.asOfDate.desc()),
    cursorIdx: index('lp_capital_accounts_cursor_idx').on(
      table.commitmentId,
      table.asOfDate.desc(),
      table.id.desc()
    ),
  })
);

export type LPCapitalAccount = typeof lpCapitalAccounts.$inferSelect;
export type InsertLPCapitalAccount = typeof lpCapitalAccounts.$inferInsert;

// ============================================================================
// LP PERFORMANCE SNAPSHOTS (IRR, MOIC Timeseries)
// ============================================================================

export const lpPerformanceSnapshots = pgTable(
  'lp_performance_snapshots',
  {
    id: serial('id').primaryKey(),
    commitmentId: integer('commitment_id')
      .notNull()
      .references(() => lpFundCommitments.id, { onDelete: 'cascade' }),
    snapshotDate: timestamp('snapshot_date', { withTimezone: true }).notNull(),
    irr: decimal('irr', { precision: 10, scale: 6 }), // Internal Rate of Return
    moic: decimal('moic', { precision: 10, scale: 4 }), // Multiple on Invested Capital
    tvpi: decimal('tvpi', { precision: 10, scale: 4 }), // Total Value to Paid-In
    dpi: decimal('dpi', { precision: 10, scale: 4 }), // Distributions to Paid-In
    rvpi: decimal('rvpi', { precision: 10, scale: 4 }), // Residual Value to Paid-In
    benchmarkIRR: decimal('benchmark_irr', { precision: 10, scale: 6 }), // Benchmark comparison (e.g., Cambridge Associates)
    grossIrr: decimal('gross_irr', { precision: 10, scale: 6 }), // Gross IRR before fees
    netIrr: decimal('net_irr', { precision: 10, scale: 6 }), // Net IRR after fees
    navCents: bigint('nav_cents', { mode: 'number' }), // Net Asset Value in cents
    paidInCents: bigint('paid_in_cents', { mode: 'number' }), // Total paid-in capital in cents
    distributedCents: bigint('distributed_cents', { mode: 'number' }), // Total distributions in cents
    version: bigint('version', { mode: 'bigint' }).notNull().default(sql`0`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    commitmentDateUniqueIdx: unique().on(table.commitmentId, table.snapshotDate),
    commitmentIdIdx: index('lp_performance_snapshots_commitment_id_idx').on(table.commitmentId),
    snapshotDateIdx: index('lp_performance_snapshots_snapshot_date_idx').on(
      table.snapshotDate.desc()
    ),
    cursorIdx: index('lp_performance_snapshots_cursor_idx').on(
      table.commitmentId,
      table.snapshotDate.desc(),
      table.id.desc()
    ),
  })
);

export type LPPerformanceSnapshot = typeof lpPerformanceSnapshots.$inferSelect;
export type InsertLPPerformanceSnapshot = typeof lpPerformanceSnapshots.$inferInsert;

// ============================================================================
// LP REPORTS (Generated Reports)
// ============================================================================

export const lpReports = pgTable(
  'lp_reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    lpId: integer('lp_id')
      .notNull()
      .references(() => limitedPartners.id, { onDelete: 'cascade' }),
    reportType: varchar('report_type', { length: 50 }).notNull(), // 'quarterly', 'annual', 'tax_package', 'capital_account'
    reportPeriodStart: timestamp('report_period_start', { withTimezone: true }).notNull(),
    reportPeriodEnd: timestamp('report_period_end', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending', 'generating', 'ready', 'error'
    fileUrl: text('file_url'),
    fileSize: integer('file_size'), // bytes
    format: varchar('format', { length: 10 }).notNull(), // 'pdf', 'xlsx', 'csv'
    templateId: integer('template_id'), // Reference to report_templates
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata'), // Additional report configuration
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    version: bigint('version', { mode: 'bigint' }).notNull().default(sql`0`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    lpIdIdx: index('lp_reports_lp_id_idx').on(table.lpId),
    statusIdx: index('lp_reports_status_idx').on(table.status),
    createdAtIdx: index('lp_reports_created_at_idx').on(table.createdAt.desc()),
    idempotencyUniqueIdx: unique().on(table.idempotencyKey),
    reportTypeCheck: check(
      'lp_reports_report_type_check',
      sql`${table.reportType} IN ('quarterly', 'annual', 'tax_package', 'capital_account')`
    ),
    statusCheck: check(
      'lp_reports_status_check',
      sql`${table.status} IN ('pending', 'generating', 'ready', 'error')`
    ),
    formatCheck: check(
      'lp_reports_format_check',
      sql`${table.format} IN ('pdf', 'xlsx', 'csv')`
    ),
  })
);

export type LPReport = typeof lpReports.$inferSelect;
export type InsertLPReport = typeof lpReports.$inferInsert;

// ============================================================================
// REPORT TEMPLATES (Reusable Report Configurations)
// ============================================================================

export const reportTemplates = pgTable(
  'report_templates',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    reportType: varchar('report_type', { length: 50 }).notNull(),
    description: text('description'),
    sections: jsonb('sections').notNull(), // Array of section configurations
    defaultFormat: varchar('default_format', { length: 10 }).notNull().default('pdf'),
    isActive: boolean('is_active').default(true),
    version: bigint('version', { mode: 'bigint' }).notNull().default(sql`0`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    nameUniqueIdx: unique().on(table.name),
    reportTypeIdx: index('report_templates_report_type_idx').on(table.reportType),
  })
);

export type ReportTemplate = typeof reportTemplates.$inferSelect;
export type InsertReportTemplate = typeof reportTemplates.$inferInsert;

// ============================================================================
// LP AUDIT LOG (Compliance & Security)
// ============================================================================

/**
 * Immutable audit log for LP data access and modifications.
 *
 * CRITICAL: Append-only table for SOC2/GDPR compliance.
 * - No updates or deletes allowed (use database-level constraints)
 * - 7-year retention for regulatory requirements
 * - Captures all LP dashboard interactions
 *
 * Indexed for efficient compliance queries:
 * - Who accessed what data when?
 * - All actions by specific LP
 * - All actions by specific user
 * - Time-range queries for audits
 */
export const lpAuditLog = pgTable(
  'lp_audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
    lpId: integer('lp_id')
      .notNull()
      .references(() => limitedPartners.id, { onDelete: 'restrict' }), // Never delete LPs with audit history
    userId: integer('user_id'), // Nullable for unauthenticated requests
    action: varchar('action', { length: 50 }).notNull(), // 'view_profile', 'view_capital_account', 'download_report', etc.
    resourceType: varchar('resource_type', { length: 50 }).notNull(), // 'lp_profile', 'capital_account', 'report', etc.
    resourceId: varchar('resource_id', { length: 255 }), // Specific resource identifier (e.g., reportId, fundId)
    ipAddress: varchar('ip_address', { length: 45 }), // IPv4 (15 chars) or IPv6 (45 chars)
    userAgent: text('user_agent'),
    metadata: jsonb('metadata'), // Additional context (query params, filters, etc.)
  },
  (table) => ({
    timestampIdx: index('lp_audit_log_timestamp_idx').on(table.timestamp.desc()),
    lpIdIdx: index('lp_audit_log_lp_id_idx').on(table.lpId),
    userIdIdx: index('lp_audit_log_user_id_idx').on(table.userId),
    actionIdx: index('lp_audit_log_action_idx').on(table.action),
    resourceIdx: index('lp_audit_log_resource_idx').on(table.resourceType, table.resourceId),
    compositeIdx: index('lp_audit_log_composite_idx').on(
      table.lpId,
      table.timestamp.desc(),
      table.action
    ),
    actionCheck: check(
      'lp_audit_log_action_check',
      sql`${table.action} IN ('view_profile', 'view_summary', 'view_capital_account', 'view_fund_detail', 'view_holdings', 'view_performance', 'view_performance_benchmark', 'generate_report', 'view_report_list', 'view_report_status', 'download_report', 'update_settings')`
    ),
  })
);

export type LPAuditLog = typeof lpAuditLog.$inferSelect;
export type InsertLPAuditLog = typeof lpAuditLog.$inferInsert;
