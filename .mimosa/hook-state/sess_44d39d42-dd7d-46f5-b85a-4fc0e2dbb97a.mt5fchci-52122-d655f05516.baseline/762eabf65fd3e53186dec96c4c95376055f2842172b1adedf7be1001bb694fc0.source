/**
 * LP Portal Sprint 3 Schema Extensions
 *
 * Adds:
 * - Capital call tracking with wire instructions
 * - Payment submission workflow
 * - Enhanced distribution details with waterfall breakdown
 * - LP documents management
 * - In-app notifications
 *
 * @module shared/schema-lp-sprint3
 */

import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
  check,
} from 'drizzle-orm/pg-core';
import { limitedPartners, lpFundCommitments } from './schema-lp-reporting';
import { funds } from './schema';

// ============================================================================
// CAPITAL CALLS (Sprint 3 - TC-LP-003)
// ============================================================================

/**
 * Detailed capital call records with wire instructions and payment tracking.
 *
 * Each capital call can have multiple payment submissions (for partial payments).
 * Wire instructions are stored per-call but typically remain consistent across calls.
 */
export const lpCapitalCalls = pgTable(
  'lp_capital_calls',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    lpId: integer('lp_id')
      .notNull()
      .references(() => limitedPartners.id, { onDelete: 'cascade' }),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    commitmentId: integer('commitment_id')
      .notNull()
      .references(() => lpFundCommitments.id, { onDelete: 'cascade' }),

    // Call details
    callNumber: integer('call_number').notNull(),
    callAmountCents: bigint('call_amount_cents', { mode: 'bigint' }).notNull(),
    dueDate: date('due_date').notNull(),
    callDate: date('call_date').notNull(),
    purpose: text('purpose'),

    // Status tracking
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    // pending -> due -> overdue -> paid (or partial)

    // Payment tracking
    paidAmountCents: bigint('paid_amount_cents', { mode: 'bigint' }).default(sql`0`),
    paidDate: date('paid_date'),

    // Wire instructions (stored as JSON for flexibility)
    wireInstructions: jsonb('wire_instructions').notNull().$type<{
      bankName: string;
      accountName: string;
      accountNumber: string; // Masked: ****1234
      routingNumber: string; // Masked: ****5678
      swiftCode?: string;
      reference: string;
    }>(),

    // Idempotency and versioning
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    version: bigint('version', { mode: 'bigint' }).notNull().default(sql`1`),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint on LP + Fund + Call Number
    lpFundCallUniqueIdx: unique().on(table.lpId, table.fundId, table.callNumber),
    idempotencyUniqueIdx: unique().on(table.idempotencyKey),

    // Query indexes
    lpIdStatusIdx: index('lp_capital_calls_lp_status_idx').on(table.lpId, table.status),
    dueDateIdx: index('lp_capital_calls_due_date_idx').on(table.dueDate),
    cursorIdx: index('lp_capital_calls_cursor_idx').on(
      table.lpId,
      table.callDate.desc(),
      table.id.desc()
    ),

    // Constraints
    statusCheck: check(
      'lp_capital_calls_status_check',
      sql`${table.status} IN ('pending', 'due', 'overdue', 'paid', 'partial')`
    ),
    amountCheck: check(
      'lp_capital_calls_amount_check',
      sql`${table.callAmountCents} > 0`
    ),
  })
);

export type LPCapitalCall = typeof lpCapitalCalls.$inferSelect;
export type InsertLPCapitalCall = typeof lpCapitalCalls.$inferInsert;

// ============================================================================
// PAYMENT SUBMISSIONS (Sprint 3 - TC-LP-003d)
// ============================================================================

/**
 * Payment submissions for capital calls.
 *
 * LPs can submit payment confirmations that GPs must verify.
 * Supports partial payments (multiple submissions per call).
 */
export const lpPaymentSubmissions = pgTable(
  'lp_payment_submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    callId: uuid('call_id')
      .notNull()
      .references(() => lpCapitalCalls.id, { onDelete: 'cascade' }),

    // Payment details
    amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
    paymentDate: date('payment_date').notNull(),
    referenceNumber: varchar('reference_number', { length: 100 }).notNull(),
    receiptUrl: varchar('receipt_url', { length: 500 }), // Uploaded wire receipt

    // Status workflow: pending -> confirmed/rejected
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    rejectionReason: text('rejection_reason'),

    // Audit trail
    submittedBy: integer('submitted_by'), // User ID who submitted
    confirmedBy: integer('confirmed_by'), // GP user who confirmed
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    callIdIdx: index('lp_payment_submissions_call_id_idx').on(table.callId),
    statusIdx: index('lp_payment_submissions_status_idx').on(table.status),
    statusCheck: check(
      'lp_payment_submissions_status_check',
      sql`${table.status} IN ('pending', 'confirmed', 'rejected')`
    ),
  })
);

export type LPPaymentSubmission = typeof lpPaymentSubmissions.$inferSelect;
export type InsertLPPaymentSubmission = typeof lpPaymentSubmissions.$inferInsert;

// ============================================================================
// ENHANCED DISTRIBUTIONS (Sprint 3 - TC-LP-004)
// ============================================================================

/**
 * Enhanced distribution details with waterfall breakdown and tax categorization.
 *
 * Extends the base capitalActivities table with detailed breakdown:
 * - Waterfall tiers (ROC, preferred return, carried interest)
 * - Tax categories (taxable vs non-taxable)
 */
export const lpDistributionDetails = pgTable(
  'lp_distribution_details',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    lpId: integer('lp_id')
      .notNull()
      .references(() => limitedPartners.id, { onDelete: 'cascade' }),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    commitmentId: integer('commitment_id')
      .notNull()
      .references(() => lpFundCommitments.id, { onDelete: 'cascade' }),

    // Distribution identification
    distributionNumber: integer('distribution_number').notNull(),
    totalAmountCents: bigint('total_amount_cents', { mode: 'bigint' }).notNull(),
    distributionDate: date('distribution_date').notNull(),
    distributionType: varchar('distribution_type', { length: 30 }).notNull(),

    // Waterfall breakdown (stored in cents)
    returnOfCapitalCents: bigint('return_of_capital_cents', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    preferredReturnCents: bigint('preferred_return_cents', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    carriedInterestCents: bigint('carried_interest_cents', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    catchUpCents: bigint('catch_up_cents', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),

    // Tax breakdown (stored in cents)
    nonTaxableCents: bigint('non_taxable_cents', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    ordinaryIncomeCents: bigint('ordinary_income_cents', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    longTermGainsCents: bigint('long_term_gains_cents', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    qualifiedDividendsCents: bigint('qualified_dividends_cents', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),

    // Status and tracking
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    wireDate: date('wire_date'),
    wireReference: varchar('wire_reference', { length: 100 }),
    notes: text('notes'),

    // Idempotency and versioning
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    version: bigint('version', { mode: 'bigint' }).notNull().default(sql`1`),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint
    lpFundDistUniqueIdx: unique().on(table.lpId, table.fundId, table.distributionNumber),
    idempotencyUniqueIdx: unique().on(table.idempotencyKey),

    // Query indexes
    lpDateIdx: index('lp_distribution_details_lp_date_idx').on(
      table.lpId,
      table.distributionDate.desc()
    ),
    yearIdx: index('lp_distribution_details_year_idx').on(
      sql`EXTRACT(YEAR FROM ${table.distributionDate})`
    ),
    cursorIdx: index('lp_distribution_details_cursor_idx').on(
      table.lpId,
      table.distributionDate.desc(),
      table.id.desc()
    ),

    // Constraints
    statusCheck: check(
      'lp_distribution_details_status_check',
      sql`${table.status} IN ('pending', 'processing', 'completed')`
    ),
    typeCheck: check(
      'lp_distribution_details_type_check',
      sql`${table.distributionType} IN ('return_of_capital', 'capital_gains', 'dividend', 'mixed')`
    ),
  })
);

export type LPDistributionDetail = typeof lpDistributionDetails.$inferSelect;
export type InsertLPDistributionDetail = typeof lpDistributionDetails.$inferInsert;

// ============================================================================
// LP DOCUMENTS (Sprint 3 - TC-LP-006)
// ============================================================================

/**
 * Document management for LP portal.
 *
 * Stores metadata for documents accessible to LPs:
 * - Quarterly/annual reports
 * - K-1 tax forms
 * - LPA, side letters
 * - Fund materials
 */
export const lpDocuments = pgTable(
  'lp_documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    lpId: integer('lp_id')
      .notNull()
      .references(() => limitedPartners.id, { onDelete: 'cascade' }),
    fundId: integer('fund_id').references(() => funds.id, { onDelete: 'cascade' }),

    // Document metadata
    documentType: varchar('document_type', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),

    // File info
    fileName: varchar('file_name', { length: 255 }).notNull(),
    fileSize: integer('file_size').notNull(), // Bytes
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    storageKey: varchar('storage_key', { length: 500 }).notNull(),

    // Dates
    documentDate: date('document_date'), // Date of content (e.g., Q4 2024)
    publishedAt: timestamp('published_at', { withTimezone: true }).defaultNow().notNull(),

    // Access control
    accessLevel: varchar('access_level', { length: 20 }).notNull().default('standard'),
    // 'standard' = normal access, 'sensitive' = requires re-authentication

    // Status
    status: varchar('status', { length: 20 }).notNull().default('available'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    lpIdIdx: index('lp_documents_lp_id_idx').on(table.lpId),
    typeIdx: index('lp_documents_type_idx').on(table.documentType),
    fundIdIdx: index('lp_documents_fund_id_idx').on(table.fundId),
    publishedIdx: index('lp_documents_published_idx').on(table.publishedAt.desc()),
    // Full-text search index (requires manual SQL migration)
    // searchIdx: index('lp_documents_search_idx').using('gin', sql`to_tsvector('english', title || ' ' || COALESCE(description, ''))`)

    // Constraints
    documentTypeCheck: check(
      'lp_documents_type_check',
      sql`${table.documentType} IN ('quarterly_report', 'annual_report', 'k1', 'lpa', 'side_letter', 'fund_overview', 'other')`
    ),
    accessLevelCheck: check(
      'lp_documents_access_level_check',
      sql`${table.accessLevel} IN ('standard', 'sensitive')`
    ),
    statusCheck: check(
      'lp_documents_status_check',
      sql`${table.status} IN ('available', 'archived')`
    ),
  })
);

export type LPDocument = typeof lpDocuments.$inferSelect;
export type InsertLPDocument = typeof lpDocuments.$inferInsert;

// ============================================================================
// LP NOTIFICATIONS (Sprint 3 - TC-LP-008)
// ============================================================================

/**
 * In-app notifications for LPs.
 *
 * Created automatically when:
 * - Capital calls are issued
 * - Distributions are processed
 * - Reports are ready
 * - Documents are published
 */
export const lpNotifications = pgTable(
  'lp_notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    lpId: integer('lp_id')
      .notNull()
      .references(() => limitedPartners.id, { onDelete: 'cascade' }),

    // Notification content
    type: varchar('type', { length: 30 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),

    // Link to related entity
    relatedEntityType: varchar('related_entity_type', { length: 30 }),
    relatedEntityId: uuid('related_entity_id'),
    actionUrl: varchar('action_url', { length: 500 }),

    // Status
    read: boolean('read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),

    // Lifecycle
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Optimized index for unread notifications badge
    lpUnreadIdx: index('lp_notifications_lp_unread_idx')
      .on(table.lpId, table.read)
      .where(sql`${table.read} = FALSE`),
    createdIdx: index('lp_notifications_created_idx').on(table.createdAt.desc()),
    expiresIdx: index('lp_notifications_expires_idx').on(table.expiresAt),

    // Constraints
    typeCheck: check(
      'lp_notifications_type_check',
      sql`${table.type} IN ('capital_call', 'distribution', 'report_ready', 'document', 'system')`
    ),
    entityTypeCheck: check(
      'lp_notifications_entity_type_check',
      sql`${table.relatedEntityType} IS NULL OR ${table.relatedEntityType} IN ('capital_call', 'distribution', 'report', 'document')`
    ),
  })
);

export type LPNotification = typeof lpNotifications.$inferSelect;
export type InsertLPNotification = typeof lpNotifications.$inferInsert;

// ============================================================================
// LP NOTIFICATION PREFERENCES (Sprint 3 - TC-LP-008d)
// ============================================================================

/**
 * LP notification preferences.
 *
 * Controls which notifications LPs receive via email and/or in-app.
 */
export const lpNotificationPreferences = pgTable(
  'lp_notification_preferences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    lpId: integer('lp_id')
      .notNull()
      .references(() => limitedPartners.id, { onDelete: 'cascade' }),

    // Email preferences
    emailCapitalCalls: boolean('email_capital_calls').notNull().default(true),
    emailDistributions: boolean('email_distributions').notNull().default(true),
    emailQuarterlyReports: boolean('email_quarterly_reports').notNull().default(true),
    emailAnnualReports: boolean('email_annual_reports').notNull().default(true),
    emailMarketUpdates: boolean('email_market_updates').notNull().default(false),

    // In-app preferences (all default to true)
    inAppCapitalCalls: boolean('in_app_capital_calls').notNull().default(true),
    inAppDistributions: boolean('in_app_distributions').notNull().default(true),
    inAppReports: boolean('in_app_reports').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    lpIdUniqueIdx: unique().on(table.lpId),
  })
);

export type LPNotificationPreference = typeof lpNotificationPreferences.$inferSelect;
export type InsertLPNotificationPreference = typeof lpNotificationPreferences.$inferInsert;
